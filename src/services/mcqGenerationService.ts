import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { MCQQuestion, LectureMCQSets } from '../types/mcq.types';
import { trackEvent } from '../lib/analytics';

const pendingGenerations = new Map<string, Promise<MCQQuestion[]>>();

function smartShuffleChoices(question: any): any {
  if (question.type === 'true_false' || question.stemFormat === 'true_false' || !question.choices || question.choices.length <= 2) {
    return question;
  }

  const anchoredOptions: any[] = [];
  const standardOptions: any[] = [];
  
  let lockA = false; let lockB = false; let lockC = false;

  question.choices.forEach((choice: any) => {
    const textBase = choice.text.toLowerCase();
    if (textBase.includes('all of the above') || 
        textBase.includes('none of the above') || 
        textBase.includes('all the above') ||
        textBase.includes('all of these') ||
        textBase.includes('none of these') ||
        /[a-e] and [a-e]/i.test(textBase) ||
        /[a-e], [a-e]/i.test(textBase) ||
        /both [a-e]/i.test(textBase)) {
      anchoredOptions.push(choice);
      if (/a and b/i.test(textBase)) { lockA = true; lockB = true; }
      if (/a and c/i.test(textBase)) { lockA = true; lockC = true; }
      if (/b and c/i.test(textBase)) { lockB = true; lockC = true; }
    } else {
      standardOptions.push(choice);
    }
  });

  const exactLockedPositions = new Map<number, any>();
  const originalA = question.choices[0];
  const originalB = question.choices[1];
  const originalC = question.choices[2];

  if (lockA && originalA && !anchoredOptions.includes(originalA)) exactLockedPositions.set(0, originalA);
  if (lockB && originalB && !anchoredOptions.includes(originalB)) exactLockedPositions.set(1, originalB);
  if (lockC && originalC && !anchoredOptions.includes(originalC)) exactLockedPositions.set(2, originalC);

  const shufflableOptions = standardOptions.filter((opt, index) => {
      // Find the original index of this option
      const originalIndex = question.choices.findIndex((c: any) => c.text === opt.text);
      return !exactLockedPositions.has(originalIndex);
  });

  for (let i = shufflableOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shufflableOptions[i], shufflableOptions[j]] = [shufflableOptions[j], shufflableOptions[i]];
  }

  const newStandardOptions: any[] = [];
  let shufflableIndex = 0;
  
  for (let i = 0; i < standardOptions.length; i++) {
    if (exactLockedPositions.has(i)) {
      newStandardOptions.push(exactLockedPositions.get(i));
    } else {
      if (shufflableIndex < shufflableOptions.length) {
        newStandardOptions.push(shufflableOptions[shufflableIndex]);
        shufflableIndex++;
      }
    }
  }

  const finalChoices = [...newStandardOptions, ...anchoredOptions];
  
  let newCorrectAnswerLabel = question.correctAnswer;
  const originalCorrectChoice = question.choices.find((c: any) => c.label === question.correctAnswer);

  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  finalChoices.forEach((choice, index) => {
    choice.label = labels[index];
    if (originalCorrectChoice && choice.text === originalCorrectChoice.text) {
      newCorrectAnswerLabel = labels[index];
    }
  });

  return {
    ...question,
    choices: finalChoices,
    correctAnswer: newCorrectAnswerLabel
  };
}

export async function extractMCQsFromPDFFile(base64Data: string, prompt: string): Promise<any[]> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Unauthorized");

  const response = await fetch('/api/admin/extract-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ base64Data, prompt })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to extract questions');
  }

  const { questions } = await response.json();
  return questions || [];
}

export function generateMCQsForLecture(lectureId: string, subjectId: string, pdfUrl: string): Promise<MCQQuestion[]> {
  if (pendingGenerations.has(lectureId)) {
    return pendingGenerations.get(lectureId)!;
  }
  
  const promise = doGenerateMCQsForLecture(lectureId, subjectId, pdfUrl).finally(() => {
    pendingGenerations.delete(lectureId);
  });
  
  pendingGenerations.set(lectureId, promise);
  return promise;
}

async function doGenerateMCQsForLecture(lectureId: string, subjectId: string, pdfUrl: string): Promise<MCQQuestion[]> {
  try {
    if (!navigator.onLine) {
      const cacheKey = `mcq_cache_${lectureId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch(e) {}
      }
      throw new Error("لا يوجد اتصال بالإنترنت");
    }

    trackEvent('mcq_generation_started', { lectureId, subjectId });

    const mcqRef = doc(db, 'mcqs', lectureId);
    
    // 1. Check if it already exists or is generating
    const existingDoc = await getDoc(mcqRef);
    if (existingDoc.exists()) {
      const data = existingDoc.data() as LectureMCQSets;
      if (data.status === 'ready') {
        localStorage.setItem(`mcq_cache_${lectureId}`, JSON.stringify(data.questions));
        return data.questions;
      }
      if (data.status === 'generating') {
        const startedAt = data.startedAt?.toMillis ? data.startedAt.toMillis() : 0;
        // If it's been generating for less than 1.5 minutes, we can try to wait. Otherwise assume it failed.
        if (Date.now() - startedAt < 90 * 1000) {
          // It's actively generating somewhere else. Instead of throwing an error, we wait just in case.
          // But to avoid locking the user, we will actually just bypass and let them generate as a fallback.
          // In a real prod environment we'd use onSnapshot here to wait.
        }
      }
    }

    // 2. Fetch PDF header to check size (Limit 20MB)
    const headRes = await fetch(pdfUrl, { method: 'HEAD' }).catch(() => null);
    if (headRes) {
      const sizeStr = headRes.headers.get('content-length');
      if (sizeStr) {
        const sizeMb = parseInt(sizeStr, 10) / (1024 * 1024);
        if (sizeMb > 20) {
          throw new Error('ملف PDF كبير جداً — الحد الأقصى 20MB');
        }
      }
    }

    // 3. Set status to generating
    await setDoc(mcqRef, {
      lectureId,
      subjectId,
      status: 'generating',
      startedAt: serverTimestamp(),
      totalQuestions: 20
    });

    // 4. Call Backend API
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Unauthorized");

    const endpointResponse = await fetch('/api/admin/generate-mcq', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ lectureId, subjectId, pdfUrl })
    });

    if (!endpointResponse.ok) {
      const errorData = await endpointResponse.json();
      throw new Error(errorData.error || 'Failed to generate MCQs from backend.');
    }

    const responseJSON = await endpointResponse.json();
    let parsedQuestions = responseJSON.questions || [];

    // Auto-assign IDs to questions
    parsedQuestions = parsedQuestions.map((q: any, index: number) => ({
      ...q,
      id: `q_${lectureId}_${index}_${Date.now()}`,
      addedBy: 'ai',
      createdAt: new Date().toISOString()
    }));

    // Handle incomplete generation < 20 questions
    if (parsedQuestions.length < 20) {
      const missingCount = 20 - parsedQuestions.length;
      const initialCount = parsedQuestions.length;
      for (let i = 0; i < missingCount; i++) {
        parsedQuestions.push({
          id: `q_${lectureId}_placeholder_${i}_${Date.now()}`,
          type: 'mcq',
          stemFormat: 'standard',
          stem: '[Placeholder Question - Admin Review]',
          choices: [
            { label: 'A', text: 'Option A' },
            { label: 'B', text: 'Option B' },
            { label: 'C', text: 'Option C' },
            { label: 'D', text: 'Option D' }
          ],
          correctAnswer: 'A',
          explanation: 'Please edit this placeholder.',
          difficulty: 'medium',
          addedBy: 'pending_admin_review',
          createdAt: new Date().toISOString()
        });
      }
      
      // Alert Admin
      await addDoc(collection(db, 'adminAlerts'), {
        type: 'incomplete_mcq_generation',
        lectureId,
        subjectId,
        generated: initialCount,
        expected: 20,
        createdAt: serverTimestamp(),
        resolved: false
      });
    }

    // Apply smart shuffling to eliminate bias while preserving composite options
    parsedQuestions = parsedQuestions.map(smartShuffleChoices);

    // 7. Save to Firestore
    const finalData = {
      lectureId,
      subjectId,
      questions: parsedQuestions,
      generatedAt: serverTimestamp(),
      generatedBy: 'gemini-ai',
      status: 'ready',
      totalQuestions: parsedQuestions.length
    };
    
    await setDoc(mcqRef, finalData);

    localStorage.setItem(`mcq_cache_${lectureId}`, JSON.stringify(parsedQuestions));
    trackEvent('mcq_generation_success', { lectureId, questionCount: parsedQuestions.length });

    // 8. Return questions array
    return parsedQuestions;

  } catch (error: any) {
    trackEvent('mcq_generation_failed', { lectureId, error: error?.message });
    // Revert status to failed if something goes wrong
    try {
      const mcqRef = doc(db, 'mcqs', lectureId);
      await setDoc(mcqRef, { status: 'failed' }, { merge: true });
    } catch (fallbackError) {
      console.warn('Could not update status to failed (likely permissions / offline):', fallbackError);
    }
    
    console.error('Error generating MCQs:', error);
    throw error;
  }
}

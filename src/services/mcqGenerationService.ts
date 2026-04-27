import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GoogleGenAI } from '@google/genai';
import { MCQQuestion, LectureMCQSets } from '../types/mcq.types';
import { trackEvent } from '../lib/analytics';

// Assuming vite env variable for Gemini
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });

const MCQ_SYSTEM_PROMPT = `
You are an expert pharmacy professor creating exam questions for 
pharmacy students at university level.

Generate exactly 20 MCQ questions based on the provided lecture PDF.

CRITICAL RULES:
- ALL question stems and choices MUST be in English
- Mix question formats:
  * 40% standard MCQ: "Which of the following..."
  * 25% EXCEPT format: "All of the following are true EXCEPT"
  * 20% REGARDING format: "Regarding [topic], which of the following is False"
  * 15% True/False
  
- For 5-choice MCQs (A-E):
  * CRITICAL: Randomly distribute the correct answer position (A, B, C, D, or E) perfectly across the 20 questions. NEVER default to C.
  * If using composite options ("A and B", "All of the above", "None of the above"), they MUST be placed at the absolute bottom (Options D and E).
  * If "A and B" is used, ensure choices A and B actually contain those respective components logically.
  * Correct answer length must NOT be consistently longer than wrong answers
  * Distractors must be plausible and academically relevant
  * Never repeat the same distractor pattern across questions
  * Difficulty distribution: 30% easy, 50% medium, 20% hard
  
- For True/False:
  * Must be definitively true or false based on lecture content only
  
- Explanation: Arabic language, 1-3 sentences, cite the concept from lecture

Return ONLY valid JSON, no markdown, no preamble:
{
  "questions": [
    {
      "type": "mcq",
      "stemFormat": "standard|except|regarding|true_false",
      "stem": "English question stem",
      "choices": [
        {"label": "A", "text": "choice text"},
        {"label": "B", "text": "choice text"},
        {"label": "C", "text": "choice text"},
        {"label": "D", "text": "choice text"},
        {"label": "E", "text": "choice text"}
      ],
      "correctAnswer": "A",
      "explanation": "شرح بالعربية",
      "difficulty": "easy|medium|hard"
    }
  ]
}
`;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw e;
  }
}

async function callGeminiWithBackoff(contents: any, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents,
        config: { responseMimeType: 'application/json' }
      });
      return response;
    } catch (error: any) {
      if (error.status === 429 && attempt < maxRetries - 1) {
        attempt++;
        const delay = Math.pow(2, attempt) * 2000; // 4s, 8s,...
        console.warn(`Gemini 429 Rate Limit. Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries reached for Gemini call');
}

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

export async function generateMCQsForLecture(lectureId: string, subjectId: string, pdfUrl: string): Promise<MCQQuestion[]> {
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
        // If generating for more than 5 minutes, assume it failed and allow recreation
        if (Date.now() - startedAt < 5 * 60 * 1000) {
          throw new Error('MCQs are currently being generated for this lecture.');
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

    // 4. Fetch PDF from URL
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error('Failed to fetch the PDF file.');
    }
    const pdfBlob = await pdfResponse.blob();
    const sizeMb = pdfBlob.size / (1024 * 1024);
    if (sizeMb > 20) {
      throw new Error('ملف PDF كبير جداً — الحد الأقصى 20MB');
    }
    
    const base64Data = await blobToBase64(pdfBlob);

    // 5. Call Gemini API
    const response = await callGeminiWithBackoff([
      {
        role: 'user',
        parts: [
          { inlineData: { data: base64Data, mimeType: 'application/pdf' } },
          { text: MCQ_SYSTEM_PROMPT }
        ]
      }
    ]);

    // 6. Parse response JSON safely
    const responseText = response.text || '';
    let parsedQuestions: any[] = [];
    
    try {
      const extracted = extractJson(responseText);
      parsedQuestions = extracted.questions || [];
      
      // Auto-assign IDs to questions
      parsedQuestions = parsedQuestions.map((q: any, index: number) => ({
        ...q,
        id: `q_${lectureId}_${index}_${Date.now()}`,
        addedBy: 'ai',
        createdAt: new Date().toISOString()
      }));
    } catch (parseError) {
      // Save debug log securely to a private path or document
      await setDoc(mcqRef, { 
        status: 'failed',
        debugLog: responseText 
      }, { merge: true });
      throw new Error('Invalid JSON format returned from AI');
    }

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

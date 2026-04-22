import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { MCQAttempt, UserMCQStats } from '../types/mcq.types';
import { trackEvent } from '../lib/analytics';

const PENDING_QUEUE_KEY = 'mcq_pending_submissions';

export async function syncPendingSubmissions() {
  if (!navigator.onLine) return;

  const rawQueue = localStorage.getItem(PENDING_QUEUE_KEY);
  if (!rawQueue) return;

  try {
    const queue = JSON.parse(rawQueue);
    if (!queue.length) return;

    for (const item of queue) {
      if (item.type === 'first') {
        // Attempt resubmit. (Bypass queueing logic by passing a flag if needed, but doing directly here)
        await submitFirstAttempt(item.userId, item.lectureId, item.subjectId, item.answers, item.totalQuestions);
      } else {
        await submitRetakeAttempt(item.userId, item.lectureId, item.answers, item.totalQuestions);
      }
    }
    // If all pass, clear
    localStorage.removeItem(PENDING_QUEUE_KEY);
    console.log("Synced pending MCQ submissions.");
  } catch (err) {
    console.error("Failed to sync pending submissions", err);
  }
}

function addToOfflineQueue(type: 'first' | 'retake', payload: any) {
  const rawQueue = localStorage.getItem(PENDING_QUEUE_KEY);
  const queue = rawQueue ? JSON.parse(rawQueue) : [];
  queue.push({ type, ...payload });
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Submits the first attempt for a lecture.
 * Saves the response to userMCQAnswers collection.
 */
export async function submitFirstAttempt(
  userIdParam: string, 
  lectureId: string, 
  subjectId: string,
  answers: Record<string, { selected: string; isCorrect: boolean }>,
  totalQuestions: number = 20
) {
  const userId = auth.currentUser?.uid || userIdParam;
  const answersDocRef = doc(db, `userMCQAnswers/${userId}/lectures/${lectureId}`);

  let correctCount = 0;
  const processedAnswers: Record<string, any> = {};
  
  for (const [key, val] of Object.entries(answers)) {
    processedAnswers[key] = {
      ...val,
      isFirstAttempt: true
    };
    if (val.isCorrect) {
      correctCount++;
    }
  }

  const scorePercentage = (correctCount / totalQuestions) * 100;

  if (!navigator.onLine) {
    addToOfflineQueue('first', { userId, lectureId, subjectId, answers, totalQuestions });
    return { success: true, score: scorePercentage, correct: correctCount, offline: true };
  }

  const newAttempt: MCQAttempt = {
    attemptNumber: 1,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    answers: processedAnswers,
    score: scorePercentage,
    correctCount,
    totalCount: totalQuestions
  };

  try {
    const answersDoc = await getDoc(answersDocRef);
    if (answersDoc.exists() && answersDoc.data()?.hasCompletedFirstAttempt) {
      // Avoid silent fail if already done
      return { success: true, score: scorePercentage, correct: correctCount };
    }

    const answerDocData = {
      lectureId,
      userId,
      subjectId,
      attempts: [newAttempt],
      firstAttemptScore: scorePercentage,
      firstAttemptCorrect: correctCount,
      firstAttemptTotal: totalQuestions,
      hasCompletedFirstAttempt: true,
      totalAttempts: 1,
      createdAt: serverTimestamp()
    };

    await runTransaction(db, async (transaction) => {
      // 1. Read userMCQStats first (ALL READS MUST BE BEFORE WRITES)
      const statsRef = doc(db, `userMCQStats/${userId}`);
      const statsDoc = await transaction.get(statsRef);

      //-----------------------------------------------
      // WRITES PORTION
      //-----------------------------------------------

      // 2. Set the answer doc
      transaction.set(answersDocRef, answerDocData);

      // 3. Update userMCQStats
      let newTotalCorrect = correctCount;
      let newTotalAnswered = totalQuestions;
      let newLecturesAttempted = 1;
      let newSubjectStats: Record<string, any> = {
         [subjectId]: {
            correct: correctCount,
            total: totalQuestions,
            lecturesAttempted: 1
         }
      };

      if (statsDoc.exists()) {
         const existing = statsDoc.data() as UserMCQStats;
         newTotalCorrect = (existing.totalFirstAttemptCorrect || 0) + correctCount;
         newTotalAnswered = (existing.totalFirstAttemptAnswered || 0) + totalQuestions;
         newLecturesAttempted = (existing.lecturesAttempted || 0) + 1;
         
         const existingSubjects = existing.subjectStats || {};
         newSubjectStats = { ...existingSubjects };
         if (newSubjectStats[subjectId]) {
            newSubjectStats[subjectId].correct = (newSubjectStats[subjectId].correct || 0) + correctCount;
            newSubjectStats[subjectId].total = (newSubjectStats[subjectId].total || 0) + totalQuestions;
            newSubjectStats[subjectId].lecturesAttempted = (newSubjectStats[subjectId].lecturesAttempted || 0) + 1;
         } else {
            newSubjectStats[subjectId] = {
               correct: correctCount,
               total: totalQuestions,
               lecturesAttempted: 1
            };
         }
      }

      const statsData: Partial<UserMCQStats> = {
          userId,
          totalFirstAttemptCorrect: newTotalCorrect,
          totalFirstAttemptAnswered: newTotalAnswered,
          lecturesAttempted: newLecturesAttempted,
          mcqLeaderboardScore: newTotalCorrect * 10,
          accuracy: (newTotalCorrect / Math.max(1, newTotalAnswered)) * 100,
          subjectStats: newSubjectStats,
          lastUpdated: serverTimestamp()
      };

      transaction.set(statsRef, statsData, { merge: true });
    });

    return { success: true, score: scorePercentage, correct: correctCount };
  } catch (error) {
    console.error("Submission failed: ", error);
    addToOfflineQueue('first', { userId, lectureId, subjectId, answers, totalQuestions });
    return { success: true, score: scorePercentage, correct: correctCount, offline: true };
  }
}

/**
 * Submits a retake attempt. Does not trigger global stats updates.
 */
export async function submitRetakeAttempt(
  userIdParam: string, 
  lectureId: string, 
  answers: Record<string, { selected: string; isCorrect: boolean }>,
  totalQuestions: number = 20
) {
  const userId = auth.currentUser?.uid || userIdParam;
  const answersDocRef = doc(db, `userMCQAnswers/${userId}/lectures/${lectureId}`);
  
  let correctCount = 0;
  const processedAnswers: Record<string, any> = {};
  
  for (const [key, val] of Object.entries(answers)) {
    processedAnswers[key] = {
      ...val,
      isFirstAttempt: false
    };
    if (val.isCorrect) {
      correctCount++;
    }
  }

  const scorePercentage = (correctCount / totalQuestions) * 100;

  if (!navigator.onLine) {
    addToOfflineQueue('retake', { userId, lectureId, answers, totalQuestions });
    return { success: true, score: scorePercentage, correct: correctCount, attemptNumber: -1, offline: true };
  }

  try {
    const answersDoc = await getDoc(answersDocRef);

    if (!answersDoc.exists()) {
      throw new Error("Must complete first attempt before retaking.");
    }

    const existingData = answersDoc.data();
    const nextAttemptNumber = existingData.totalAttempts + 1;

    const newAttempt: MCQAttempt = {
      attemptNumber: nextAttemptNumber,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      answers: processedAnswers,
      score: scorePercentage,
      correctCount,
      totalCount: totalQuestions
    };

    const updatedAttempts = [...existingData.attempts, newAttempt];

    await setDoc(answersDocRef, {
      attempts: updatedAttempts,
      totalAttempts: nextAttemptNumber,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return { success: true, score: scorePercentage, correct: correctCount, attemptNumber: nextAttemptNumber };
  } catch (error) {
    console.error("Retake submission failed: ", error);
    addToOfflineQueue('retake', { userId, lectureId, answers, totalQuestions });
    return { success: true, score: scorePercentage, correct: correctCount, attemptNumber: -1, offline: true };
  }
}

/**
 * Gets the first attempt status for a user/lecture
 */
export async function getFirstAttemptStatus(userIdParam: string, lectureId: string): Promise<{ hasCompleted: boolean, score: number | null }> {
  try {
    const userId = auth.currentUser?.uid || userIdParam;
    const answersDocRef = doc(db, `userMCQAnswers/${userId}/lectures/${lectureId}`);
    const docSnap = await getDoc(answersDocRef);
    
    if (docSnap.exists() && docSnap.data().hasCompletedFirstAttempt) {
      return { 
        hasCompleted: true, 
        score: docSnap.data().firstAttemptScore 
      };
    }
    
    return { hasCompleted: false, score: null };
  } catch (error) {
    console.error("Error getting status", error);
    return { hasCompleted: false, score: null };
  }
}

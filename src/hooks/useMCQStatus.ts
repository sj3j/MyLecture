import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { LectureMCQSets, UserMCQAnswers } from '../types/mcq.types';

type MCQStatusType = 'not_generated' | 'generating' | 'failed' | 'ready_new' | 'ready_retake';

export interface MCQStatusResult {
  status: MCQStatusType;
  score: number | null;
  correct: number | null;
  total: number | null;
}

export function useMCQStatus(lectureId: string, user: UserProfile | null): MCQStatusResult {
  const [mcqData, setMcqData] = useState<LectureMCQSets | null>(null);
  const [userAnswerData, setUserAnswerData] = useState<UserMCQAnswers | null>(null);

  useEffect(() => {
    let unsubMcq: () => void;
    let unsubUser: () => void;

    if (!user) return; // Prevent unauthorised listeners

    // Listen to MCQ status
    const mcqRef = doc(db, 'mcqs', lectureId);
    unsubMcq = onSnapshot(mcqRef, (docSnap) => {
      if (docSnap.exists()) {
        setMcqData(docSnap.data() as LectureMCQSets);
      } else {
        setMcqData(null);
      }
    }, (error) => {
      console.warn('Could not listen to mcqs, may lack permissions', error);
    });

    // Listen to user attempt status
    const answersRef = doc(db, `userMCQAnswers/${user.uid}/lectures/${lectureId}`);
    unsubUser = onSnapshot(answersRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserAnswerData(docSnap.data() as UserMCQAnswers);
      } else {
        setUserAnswerData(null);
      }
    }, (error) => {
      console.warn('Could not listen to userMCQAnswers, may lack permissions', error);
    });

    return () => {
      if (unsubMcq) unsubMcq();
      if (unsubUser) unsubUser();
    };
  }, [lectureId, user?.uid]);

  let derivedStatus: MCQStatusType = 'not_generated';
  let score = null;
  let correct = null;
  let total = null;

  if (mcqData) {
    if (mcqData.status === 'generating') derivedStatus = 'generating';
    else if (mcqData.status === 'failed') derivedStatus = 'failed';
    else if (mcqData.status === 'ready') {
      if (userAnswerData?.hasCompletedFirstAttempt) {
        derivedStatus = 'ready_retake';
        score = userAnswerData.firstAttemptScore;
        correct = userAnswerData.firstAttemptCorrect;
        total = userAnswerData.firstAttemptTotal;
      } else {
        derivedStatus = 'ready_new';
      }
    }
  }

  return { status: derivedStatus, score, correct, total };
}

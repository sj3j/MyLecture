export type MCQStemFormat = 'standard' | 'except' | 'regarding' | 'true_false';
export type MCQDifficulty = 'easy' | 'medium' | 'hard';
export type MCQStatus = 'ready' | 'generating' | 'failed';

export interface MCQChoice {
  label: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
}

export interface MCQQuestion {
  id: string;
  type: 'mcq' | 'true_false';
  stem: string;
  stemFormat: MCQStemFormat;
  choices: MCQChoice[];
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E' | 'True' | 'False';
  explanation: string;
  difficulty: MCQDifficulty;
  addedBy: 'ai' | 'admin';
  createdAt: any; // Firestore Timestamp
}

export interface LectureMCQSets {
  id?: string; // documentId (lectureId)
  lectureId: string;
  subjectId: string;
  generatedAt: any; // Firestore Timestamp
  generatedBy: 'gemini-ai' | 'admin';
  questions: MCQQuestion[];
  totalQuestions: number;
  status: MCQStatus;
}

export interface MCQAnswerState {
  selected: string;
  isCorrect: boolean;
  isFirstAttempt: boolean;
}

export interface MCQAttempt {
  attemptNumber: number;
  startedAt: any; // Firestore Timestamp
  completedAt: any; // Firestore Timestamp
  answers: Record<string, MCQAnswerState>;
  score: number; // percentage 0-100
  correctCount: number;
  totalCount: number;
}

export interface UserMCQAnswers {
  lectureId: string;
  userId: string;
  attempts: MCQAttempt[];
  firstAttemptScore: number | null;
  firstAttemptCorrect: number;
  firstAttemptTotal: number;
  hasCompletedFirstAttempt: boolean;
  totalAttempts: number;
}

export interface UserSubjectStats {
  correct: number;
  total: number;
  lecturesAttempted: number;
}

export interface UserMCQStats {
  userId: string;
  totalFirstAttemptCorrect: number;
  totalFirstAttemptAnswered: number;
  lecturesAttempted: number;
  mcqLeaderboardScore: number;
  accuracy: number;
  lastUpdated: any; // Firestore Timestamp
  subjectStats: Record<string, UserSubjectStats>;
}

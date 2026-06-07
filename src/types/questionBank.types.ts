export type QuestionScope = 'lecture' | 'subject' | 'global';
export type QuestionTag = 'وزاري' | 'سنين_سابقة' | 'سؤال_الدكتور' | 'مهم' | 'متوقع' | string;
export type QuestionType = 'mcq' | 'true_false';
export type StemFormat = 'standard' | 'except' | 'regarding' | 'true_false';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface BankChoice {
  label: string;
  text: string;
}

export interface BankQuestion {
  id: string; // QuestionId, locally using document id
  
  // Scope
  scope: QuestionScope;
  lectureId: string | null;
  subjectId: string | null;
  
  // Tags
  tags: QuestionTag[];
  year: string | null;
  
  // Content
  type: QuestionType;
  stemFormat: StemFormat;
  stem: string;
  choices: BankChoice[];
  correctAnswer: string;
  explanation: string;
  difficulty: Difficulty;
  imageUrl?: string;
  
  // Meta
  addedBy: string;
  addedAt: any; // Timestamp
  lastEditedBy: string | null;
  lastEditedAt: any | null; // Timestamp
  isActive: boolean;
  viewCount: number;
  
  // Bank scoring
  attemptCount: number;
  correctCount: number;
  accuracyRate: number;

  // Flagging
  isFlagged?: boolean;
  flaggedReason?: string;
  flaggedBy?: string;
  flaggedAt?: any; // Timestamp
}

export interface UserBankAnswer {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  answeredAt: any; // Timestamp
  sessionId: string;
  tags: string[];
}

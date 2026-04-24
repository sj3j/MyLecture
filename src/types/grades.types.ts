export interface GradeBatch {
  id: string;
  examName: string;
  material?: string;
  maxDegree?: number | string;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'confirmed';
  stats: {
    totalRows: number;
    matched: number;
    unmatched: number;
  };
}

export interface MatchedResult {
  rowId: string;
  excelName: string;
  matchedUserId: string | null;
  matchedUserName: string | null;
  matchedUserOriginalName?: string | null;
  matchScore: number; // 0 to 1, higher is better
  degree: number | string;
  originalRow: Record<string, any>;
}

export interface StudentDegree {
  id: string; // usually same as batchId or combined
  examName: string;
  material?: string;
  degree: number | string;
  maxDegree?: number | string;
  batchId: string;
  batchDate: string;
  createdAt: string;
}

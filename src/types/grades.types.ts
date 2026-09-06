export interface GradeBatch {
  id: string;
  examName: string;
  material?: string;
  maxDegree?: number | string;
  passRate?: number;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'confirmed';
  /** Which stage the batch was uploaded into. Written since the stage rollout. */
  stageId?: string;
  /**
   * Academic year the exam belongs to, e.g. '2025-2026'. Copied from the
   * calendar at upload time rather than derived from createdAt, because a batch
   * confirmed after the year rolls over still belongs to the year it examined.
   */
  yearLabel?: string;
  /** Every student the batch wrote a degree for; undo and patch both walk this. */
  studentIds?: string[];
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
  passRate?: number;
  batchId: string;
  batchDate: string;
  createdAt: string;
  /** The stage tab this degree files under in StudentGradesScreen. */
  stageId?: string;
  /** The year heading it files under within that tab. See GradeBatch.yearLabel. */
  yearLabel?: string;
}

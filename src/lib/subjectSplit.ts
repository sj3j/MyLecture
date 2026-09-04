import { Subject, CourseId } from '../types';

/**
 * Splitting the subjects that were seeded as one document holding two courses.
 *
 * `scripts/migrateToStages.js` transcribed the curriculum exactly as the college
 * publishes its timetable, and the timetable pairs two unrelated subjects on one
 * line when they share a slot:
 *
 *     Physiology I + Computer Science   /  علم وظائف الأعضاء ١ + الحاسوب
 *     Baathist crimes + Arabic Language /  جرائم حزب البعث + اللغة العربية
 *
 * That is a timetable convention, not a subject. Seeded verbatim it gives the two
 * halves a single card, a single lecture list and a single progress bar, so a
 * physiology lecture and a computer-science lecture land in the same folder and
 * neither subject can be tracked on its own.
 *
 * Only `+` splits. `and` / `و` do NOT: `Pharmaceutical and Cosmetic Preparations`
 * (المستحضرات الصيدلانية والتجميلية) is one subject whose name happens to be a
 * conjunction, and splitting it would invent a subject the college does not teach.
 */

/** Kept byte-identical to slugify() in scripts/migrateToStages.js and SubjectsSettings. */
export const slugifySubject = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** `'A + B'` -> `['A', 'B']`. A name with no `+` yields a single part. */
export const splitSubjectName = (name: string): string[] =>
  (name || '').split('+').map(part => part.trim()).filter(Boolean);

export interface SubjectSplitPart {
  /** Slug derived from the English half - the value content stores in `subjectId`. */
  id: string;
  nameEn: string;
  nameAr: string;
}

/**
 * True when this document holds more than one subject.
 *
 * The English name decides. An Arabic-only `+` means someone typed a compound
 * Arabic label onto a single English subject, and splitting on that would
 * produce parts with no English name to slugify - i.e. no usable id.
 */
export const isCombinedSubject = (s: Pick<Subject, 'nameEn'>): boolean =>
  splitSubjectName(s.nameEn).length > 1;

/**
 * The subjects a combined document should become.
 *
 * The two languages are split independently and zipped. They normally agree
 * (both sides of the curriculum were transcribed from the same line), but a
 * renamed subject can leave them out of step, so a missing Arabic half falls
 * back to the English one rather than silently pairing the wrong two names.
 */
export function planSubjectSplit(s: Pick<Subject, 'nameEn' | 'nameAr'>): SubjectSplitPart[] {
  const enParts = splitSubjectName(s.nameEn);
  const arParts = splitSubjectName(s.nameAr);
  const aligned = arParts.length === enParts.length;

  return enParts.map((nameEn, i) => ({
    id: slugifySubject(nameEn),
    nameEn,
    nameAr: (aligned ? arParts[i] : '') || nameEn,
  }));
}

export interface PlannedSubject extends SubjectSplitPart {
  stageId: string;
  courseId: CourseId;
  types: Subject['types'];
  order: number;
  isActive: true;
}

/**
 * The documents to write for a split, ordered so the parts land where the
 * combined subject used to sit.
 *
 * The first part inherits the original `order` and each later part is pushed a
 * whole step past it, so a split never reshuffles the subjects around it: with
 * orders 0,1,2,3 splitting #1 in two gives 0, 1, 1.5, 2, 3 rather than a
 * collision on 2. `move()` in SubjectsSettings swaps orders rather than
 * renumbering, so fractional values are stable.
 */
export function plannedSubjectsFor(
  subject: Subject,
  parts: SubjectSplitPart[],
): PlannedSubject[] {
  return parts.map((part, i) => ({
    ...part,
    stageId: subject.stageId,
    courseId: subject.courseId,
    types: subject.types?.length ? subject.types : ['theoretical', 'practical'],
    order: (subject.order ?? 0) + i / (parts.length + 1),
    isActive: true as const,
  }));
}

/** Firestore doc id for a subject. Mirrors SubjectsSettings and the migration. */
export const subjectDocId = (stageId: string, id: string) => `${stageId}__${id}`;

/** Reasons a planned split cannot be written, in the order worth reporting. */
export type SplitProblem =
  | { kind: 'too-few' }
  | { kind: 'blank-name'; index: number }
  | { kind: 'bad-slug'; index: number }
  | { kind: 'duplicate-slug'; id: string }
  | { kind: 'collides'; id: string };

/**
 * Validates a split before anything is written.
 *
 * `existingIds` is every subject id already in the stage, minus the one being
 * split. A part that collides with one of those would silently merge two
 * curricula into one document - the exact failure this whole module exists to
 * undo - so it is refused rather than merged.
 */
export function validateSplit(parts: SubjectSplitPart[], existingIds: string[]): SplitProblem[] {
  const problems: SplitProblem[] = [];
  if (parts.length < 2) problems.push({ kind: 'too-few' });

  const seen = new Set<string>();
  parts.forEach((part, index) => {
    if (!part.nameEn.trim()) problems.push({ kind: 'blank-name', index });
    else if (!part.id) problems.push({ kind: 'bad-slug', index });
    else if (seen.has(part.id)) problems.push({ kind: 'duplicate-slug', id: part.id });
    else if (existingIds.includes(part.id)) problems.push({ kind: 'collides', id: part.id });
    seen.add(part.id);
  });

  return problems;
}

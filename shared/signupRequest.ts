/**
 * Self-service signup, approved by the stage representative.
 *
 * A request deliberately creates NO usable account. Login is gated on
 * `students/{email}` existing and being active, so a pending request simply has
 * no student record and cannot get in. That gate is the security boundary; this
 * collection is only a queue.
 */
import { GroupConfigLike, FALLBACK_GROUP_CONFIG, isValidSubgroup, normalizeSubgroup } from './groups.js';

export type SignupStatus = 'pending' | 'approved' | 'rejected';

export interface SignupInput {
  /** Three separate fields, not one string - see normalizeNamePart. */
  firstName: string;
  fatherName: string;
  grandfatherName: string;
  email: string;
  password: string;
  stageId: string;
  subgroup: string;
  examCode?: string;
  /** True when the student has not been issued a code for this year yet. */
  noExamCode?: boolean;
}

export class SignupError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
  }
}

/**
 * Strips the characters that are invisible but still count as content.
 *
 * Tatweel (U+0640) is a decorative letter-stretcher and the zero-width joiners
 * (U+200C/U+200D) control ligatures - none carry meaning, and all three would
 * otherwise make a blank field look filled, or a name fail an equality check
 * against the same name typed without them.
 */
export function normalizeNamePart(raw: string): string {
  return (raw || '')
    .replace(/[ـ‌‍‎‏]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Why three fields rather than counting spaces in one:
 *
 * Arabic عبد-compounds are written open OR closed, so a token count is wrong in
 * both directions. "عبد الحسين محمد" is three tokens but only two names, and a
 * closed compound makes a genuine three-part name look short. Asking for the
 * parts separately removes the ambiguity instead of guessing at it, and matches
 * how the university records them.
 */
export function composeFullName(input: SignupInput): string {
  const parts = [input.firstName, input.fatherName, input.grandfatherName].map(normalizeNamePart);
  if (parts.some(p => p.length === 0)) {
    throw new SignupError('الاسم الثلاثي مطلوب', 400, 'NAME_INCOMPLETE');
  }
  return parts.join(' ');
}

export interface PreparedSignup {
  email: string;
  fullName: string;
  stageId: string;
  subgroup: string;
  examCode: string | null;
  noExamCode: boolean;
}

/** Validates everything that does not need the database. */
export function validateSignup(input: SignupInput, groupConfig: GroupConfigLike): PreparedSignup {
  const fullName = composeFullName(input);

  const email = (input.email || '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SignupError('صيغة البريد غير صحيحة', 400, 'BAD_EMAIL');
  }

  if (!input.password || input.password.length < 6) {
    throw new SignupError('كلمة المرور قصيرة جداً', 400, 'WEAK_PASSWORD');
  }

  const subgroup = normalizeSubgroup(input.subgroup);
  if (!subgroup || !isValidSubgroup(groupConfig || FALLBACK_GROUP_CONFIG, subgroup)) {
    throw new SignupError('الشعبة غير صحيحة لهذه المرحلة', 400, 'BAD_SUBGROUP');
  }

  const noExamCode = input.noExamCode === true;
  const examCode = noExamCode ? null : (input.examCode || '').trim() || null;
  if (!noExamCode && !examCode) {
    throw new SignupError('أدخل الرقم الامتحاني أو اختر «لا أملك رقماً»', 400, 'EXAM_CODE_REQUIRED');
  }

  return { email, fullName, stageId: input.stageId, subgroup, examCode, noExamCode };
}

/**
 * Files the request. Returns the document that was written.
 *
 * The password is hashed here and the plaintext is never persisted. Callers
 * must also avoid logging the request body - it carries the plaintext until
 * this runs.
 */
export async function createSignupRequest(
  db: FirebaseFirestore.Firestore,
  FieldValue: { serverTimestamp(): any; delete(): any },
  hashPassword: (plain: string) => Promise<string>,
  input: SignupInput,
): Promise<PreparedSignup> {
  const stageSnap = await db.collection('stages').doc(input.stageId || '').get();
  if (!stageSnap.exists) throw new SignupError('المرحلة غير موجودة', 400, 'BAD_STAGE');

  const groupConfig: GroupConfigLike =
    (stageSnap.data() as any)?.groupConfig || FALLBACK_GROUP_CONFIG;

  const prepared = validateSignup(input, groupConfig);

  // Already a student: they should log in, not sign up again.
  const existing = await db.collection('students').doc(prepared.email).get();
  if (existing.exists) {
    throw new SignupError('هذا البريد مسجّل بالفعل. سجّل الدخول.', 409, 'ALREADY_STUDENT');
  }

  // Only a PENDING request blocks a second attempt. A rejected applicant must
  // be able to correct their details and re-apply - keying the block on any
  // status at all would lock that email out permanently.
  const prior = await db.collection('signup_requests').doc(prepared.email).get();
  if (prior.exists && prior.data()?.status === 'pending') {
    throw new SignupError('طلبك قيد المراجعة من قبل ممثل المرحلة.', 409, 'ALREADY_PENDING');
  }

  await db.collection('signup_requests').doc(prepared.email).set({
    ...prepared,
    passwordHash: await hashPassword(input.password),
    status: 'pending' as SignupStatus,
    createdAt: FieldValue.serverTimestamp(),
    // expireAt is deliberately NOT set here. A TTL on a pending row would
    // silently delete a student who applied in July before a representative
    // works the queue in September. It is stamped on approve/reject instead.
    expireAt: FieldValue.delete(),
    reviewedAt: FieldValue.delete(),
    reviewedBy: FieldValue.delete(),
    rejectionReason: FieldValue.delete(),
  }, { merge: true });

  return prepared;
}

export interface ReviewResult {
  email: string;
  status: SignupStatus;
}

/** Approve -> creates the student record, which is what makes login possible. */
export async function reviewSignupRequest(
  db: FirebaseFirestore.Firestore,
  FieldValue: { serverTimestamp(): any; delete(): any },
  opts: {
    email: string;
    approve: boolean;
    reviewerUid: string;
    reviewerStageId?: string | null;
    isMasterAdmin: boolean;
    reason?: string;
    /** Days until a resolved row is purged by the Firestore TTL policy. */
    ttlDays?: number;
  },
): Promise<ReviewResult> {
  const email = (opts.email || '').toLowerCase().trim();
  const ref = db.collection('signup_requests').doc(email);
  const snap = await ref.get();
  if (!snap.exists) throw new SignupError('لا يوجد طلب بهذا البريد', 404, 'NOT_FOUND');

  const data = snap.data() as any;
  if (data.status !== 'pending') {
    throw new SignupError('تمت مراجعة هذا الطلب مسبقاً', 409, 'ALREADY_REVIEWED');
  }

  // A representative may only act on their own stage.
  if (!opts.isMasterAdmin && opts.reviewerStageId && data.stageId !== opts.reviewerStageId) {
    throw new SignupError('هذا الطلب يخص مرحلة أخرى', 403, 'WRONG_STAGE');
  }

  const expireAt = new Date();
  expireAt.setDate(expireAt.getDate() + (opts.ttlDays ?? 60));

  if (opts.approve) {
    await db.collection('students').doc(email).set({
      name: data.fullName,
      email,
      password: data.passwordHash,
      examCode: data.examCode || '',
      isActive: true,
      stageId: data.stageId,
      subgroup: data.subgroup,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await ref.set({
    status: opts.approve ? 'approved' : 'rejected',
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: opts.reviewerUid,
    ...(opts.approve ? {} : { rejectionReason: (opts.reason || '').slice(0, 500) }),
    expireAt,
  }, { merge: true });

  return { email, status: opts.approve ? 'approved' : 'rejected' };
}

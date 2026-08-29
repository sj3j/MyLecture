/**
 * Verifies end-of-year progression against the Firestore emulator.
 *
 * Run with:  npm run test:progression
 *
 * The load-bearing assertion is that BOTH `users.stageId` and
 * `students.stageId` move. syncUserStage copies the students value onto the
 * user doc at every login, so a promotion that writes only `users` is silently
 * reverted the next time the student signs in - which is exactly why the old
 * client-only ProgressionModal never actually worked.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import 'dotenv/config';
import { AcademicCalendar, progressionGate } from '../shared/academicCalendar';
import { nextProgressionStep } from '../shared/progression';
import { submitProgression, ProgressionError } from '../shared/progressionSubmit';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to run: FIRESTORE_EMULATOR_HOST is not set.');
  process.exit(1);
}

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  }),
  projectId: FIREBASE_PROJECT_ID,
});
const db = getFirestore();

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { console.log(`  PASS  ${name}`); passed++; }
  else { console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); failed++; }
};

// Yesterday / tomorrow relative to now, so the gate is exercised for real.
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const base: AcademicCalendar = {
  yearLabel: '2026-2027',
  timezone: 'Asia/Baghdad',
  terms: [{
    id: 't1', nameAr: 'الفصل الأول', nameEn: 'First',
    startDate: '2026-09-20', endDate: '2026-12-31', examsStart: '2027-01-03', examsEnd: '2027-01-16',
  }],
};
const closed: AcademicCalendar = { ...base };
const firstOpen: AcademicCalendar = { ...base, resultsDate: day(-1) };
const resitOpen: AcademicCalendar = { ...base, resultsDate: day(-10), resitResultsDate: day(-1) };

// ---------------------------------------------------------------------------
for (const s of [
  { id: 'stage_3', order: 3, nameAr: 'المرحلة الثالثة', nameEn: 'Third Stage' },
  { id: 'stage_4', order: 4, nameAr: 'المرحلة الرابعة', nameEn: 'Fourth Stage' },
  { id: 'stage_5', order: 5, nameAr: 'المرحلة الخامسة', nameEn: 'Fifth Stage' },
]) {
  await db.collection('stages').doc(s.id).set(s);
}

for (const [id, name] of [['biochemistry_ii', 'Biochem II'], ['pharmacology_ii', 'Pharmacology II']]) {
  await db.collection('subjects').doc(`stage_3__${id}`).set({
    id, stageId: 'stage_3', courseId: 'course_2', nameEn: name, nameAr: name, order: 0, isActive: true,
  });
}

const seedStudent = async (uid: string, email: string, stageId = 'stage_3') => {
  await db.collection('users').doc(uid).set({
    name: uid, email, role: 'student', stageId, group: 'B2',
  });
  await db.collection('students').doc(email).set({
    name: uid, email, examCode: '1', isActive: true, stageId, subgroup: 'B2',
  });
};

await seedStudent('u_pass', 'pass@x.com');
await seedStudent('u_resit', 'resit@x.com');
await seedStudent('u_fail', 'fail@x.com');
await seedStudent('u_tahmeel', 'tahmeel@x.com');
await seedStudent('u_final', 'final@x.com', 'stage_5');

console.log('Gate:');
check('no results date means the question never shows',
  progressionGate(closed, day(0)) === 'closed', progressionGate(closed, day(0)));
check('after the results date the first round opens',
  progressionGate(firstOpen, day(0)) === 'first_round');
check('before the results date it is still closed',
  progressionGate({ ...base, resultsDate: day(5) }, day(0)) === 'closed');
check('after the resit date the resit round opens',
  progressionGate(resitOpen, day(0)) === 'resit_round');

console.log('\nWho gets asked what:');
const step = (gate: any, user: any) => nextProgressionStep({ gate, yearLabel: '2026-2027', user });
check('a fresh student is asked the first question', step('first_round', { role: 'student', stageId: 'stage_3' }) === 'first');
check('nobody is asked while the gate is closed', step('closed', { role: 'student', stageId: 'stage_3' }) === 'none');
check('an admin is never asked', step('first_round', { role: 'admin', stageId: 'stage_3' }) === 'none');
check('a graduated student is never asked',
  step('resit_round', { role: 'student', stageId: 'stage_5', graduated: true }) === 'none');
check('a student already done this year is not re-asked',
  step('resit_round', { role: 'student', stageId: 'stage_3', progressionYear: '2026-2027', progressionState: 'completed' }) === 'none');
check('a resit student waits while only the first round is open',
  step('first_round', { role: 'student', stageId: 'stage_3', progressionYear: '2026-2027', progressionState: 'awaiting_resit' }) === 'none');
check('...and is asked once the resit results land',
  step('resit_round', { role: 'student', stageId: 'stage_3', progressionYear: '2026-2027', progressionState: 'awaiting_resit' }) === 'resit');
check('last year\'s answer does not carry over to a new year',
  step('first_round', { role: 'student', stageId: 'stage_3', progressionYear: '2025-2026', progressionState: 'completed' }) === 'first');
check('someone who never answered starts at the first question even in the resit round',
  step('resit_round', { role: 'student', stageId: 'stage_3' }) === 'first');

check('a student with no stage is not asked at all',
  step('first_round', { role: 'student' }) === 'none');
// An unknown stage still reaches the question, but the SUBMIT rejects it:
// "no successor" is how the top of the ladder is detected, so a stale stageId
// would otherwise be read as graduation.
check('a student on an unknown stage is still asked',
  step('first_round', { role: 'student', stageId: 'stage_ghost' }) === 'first');

console.log('\nStage targeting (ask only the cohort that sat exams):');
const stepIn = (u: any, stages: string[] | null) =>
  nextProgressionStep({ gate: 'first_round', yearLabel: '2026-2027', user: u, stages });
check('a targeted stage is asked',
  stepIn({ role: 'student', stageId: 'stage_3' }, ['stage_3']) === 'first');
check('a stage outside the target is NOT asked',
  stepIn({ role: 'student', stageId: 'stage_4' }, ['stage_3']) === 'none');
check('an empty target asks everyone',
  stepIn({ role: 'student', stageId: 'stage_4' }, []) === 'first');
check('no target asks everyone',
  stepIn({ role: 'student', stageId: 'stage_4' }, null) === 'first');
// The submit must enforce it too, or a stage_4 student could POST directly.
let offTarget = false;
try {
  await seedStudent('u_offtarget', 'offtarget@x.com', 'stage_4');
  await submitProgression(db, FieldValue as any,
    { ...firstOpen, progressionStages: ['stage_3'] },
    { uid: 'u_offtarget', round: 'first', answer: 'passed' });
} catch (e) { offTarget = e instanceof ProgressionError; }
check('the endpoint rejects a student outside the targeted stages', offTarget);
check('and did not move them',
  (await db.doc('users/u_offtarget').get()).data()?.stageId === 'stage_4');

console.log('\nنجحت - promotion:');
const passRes = await submitProgression(db, FieldValue as any, firstOpen, {
  uid: 'u_pass', round: 'first', answer: 'passed',
});
check('reports the promotion', passRes.promoted === true && passRes.stageId === 'stage_4',
  JSON.stringify(passRes));
const passUser = (await db.doc('users/u_pass').get()).data();
const passStudent = (await db.doc('students/pass@x.com').get()).data();
check('users.stageId moved', passUser?.stageId === 'stage_4', String(passUser?.stageId));
check('students.stageId moved (syncUserStage reads this at every login)',
  passStudent?.stageId === 'stage_4', String(passStudent?.stageId));
check('users.group is cleared so they re-pick for the new stage',
  passUser?.group === undefined, String(passUser?.group));
check('students.subgroup is cleared too', passStudent?.subgroup === undefined, String(passStudent?.subgroup));
check('marked completed for this year',
  passUser?.progressionState === 'completed' && passUser?.progressionYear === '2026-2027');
check('and is not asked again',
  step('resit_round', passUser) === 'none');

console.log('\nدور ثاني - parked until the resit results:');
await submitProgression(db, FieldValue as any, firstOpen, {
  uid: 'u_resit', round: 'first', answer: 'resit',
});
const resitUser = (await db.doc('users/u_resit').get()).data();
check('stage is unchanged', resitUser?.stageId === 'stage_3', String(resitUser?.stageId));
check('group is NOT cleared - they did not move', resitUser?.group === 'B2', String(resitUser?.group));
check('parked as awaiting_resit', resitUser?.progressionState === 'awaiting_resit');
check('asked nothing more while only the first round is open',
  step('first_round', resitUser) === 'none');

// Submitting the resit answer before those results are published must fail.
let earlyRejected = false;
try {
  await submitProgression(db, FieldValue as any, firstOpen, {
    uid: 'u_resit', round: 'resit', answer: 'passed',
  });
} catch (e) { earlyRejected = e instanceof ProgressionError; }
check('cannot answer the resit question before its results date', earlyRejected);
check('and nothing was written',
  (await db.doc('users/u_resit').get()).data()?.stageId === 'stage_3');

const resitPass = await submitProgression(db, FieldValue as any, resitOpen, {
  uid: 'u_resit', round: 'resit', answer: 'passed',
});
check('passing the resit promotes them', resitPass.promoted === true && resitPass.stageId === 'stage_4');
check('students.stageId moved on the resit path too',
  (await db.doc('students/resit@x.com').get()).data()?.stageId === 'stage_4');

console.log('\nتحميل - moves up carrying subjects:');
await submitProgression(db, FieldValue as any, firstOpen, {
  uid: 'u_tahmeel', round: 'first', answer: 'resit',
});
const tahmeelRes = await submitProgression(db, FieldValue as any, resitOpen, {
  uid: 'u_tahmeel', round: 'resit', answer: 'tahmeel', tahmeelSubjects: ['biochemistry_ii'],
});
check('moves up', tahmeelRes.promoted === true && tahmeelRes.stageId === 'stage_4');
const tahmeelUser = (await db.doc('users/u_tahmeel').get()).data();
check('stores the carried subject as a SLUG, matching lectures.subjectId',
  JSON.stringify(tahmeelUser?.tahmeelSubjects) === JSON.stringify(['biochemistry_ii']),
  JSON.stringify(tahmeelUser?.tahmeelSubjects));

let bogusRejected = false;
try {
  await seedStudent('u_bogus', 'bogus@x.com');
  await submitProgression(db, FieldValue as any, firstOpen, { uid: 'u_bogus', round: 'first', answer: 'resit' });
  await submitProgression(db, FieldValue as any, resitOpen, {
    uid: 'u_bogus', round: 'resit', answer: 'tahmeel', tahmeelSubjects: ['stage_3__biochemistry_ii'],
  });
} catch (e) { bogusRejected = e instanceof ProgressionError; }
check('a document id is rejected where a slug is required (it would grant nothing)', bogusRejected);

let emptyRejected = false;
try {
  await submitProgression(db, FieldValue as any, resitOpen, {
    uid: 'u_bogus', round: 'resit', answer: 'tahmeel', tahmeelSubjects: [],
  });
} catch (e) { emptyRejected = e instanceof ProgressionError; }
check('تحميل with no subjects chosen is rejected', emptyRejected);

console.log('\nرسبت - repeats the year:');
await submitProgression(db, FieldValue as any, firstOpen, { uid: 'u_fail', round: 'first', answer: 'resit' });
const failRes = await submitProgression(db, FieldValue as any, resitOpen, {
  uid: 'u_fail', round: 'resit', answer: 'failed',
});
check('stays put', failRes.promoted === false && failRes.stageId === 'stage_3');
const failUser = (await db.doc('users/u_fail').get()).data();
check('keeps their group', failUser?.group === 'B2', String(failUser?.group));
check('but is done for the year', failUser?.progressionState === 'completed');
check('and is not asked again', step('resit_round', failUser) === 'none');

console.log('\nGraduation:');
const gradRes = await submitProgression(db, FieldValue as any, firstOpen, {
  uid: 'u_final', round: 'first', answer: 'passed',
});
check('passing the last stage graduates rather than promotes',
  gradRes.graduated === true && gradRes.promoted === false, JSON.stringify(gradRes));
const gradUser = (await db.doc('users/u_final').get()).data();
check('stays in the final stage for content access', gradUser?.stageId === 'stage_5');
check('flagged graduated', gradUser?.graduated === true);
check('never asked again', step('resit_round', gradUser) === 'none');

console.log('\nGuards:');
let wrongRound = false;
try {
  await seedStudent('u_guard', 'guard@x.com');
  await submitProgression(db, FieldValue as any, firstOpen, {
    uid: 'u_guard', round: 'resit', answer: 'passed',
  });
} catch (e) { wrongRound = e instanceof ProgressionError; }
check('cannot skip to the resit question to promote early', wrongRound);
check('and nothing was written',
  (await db.doc('users/u_guard').get()).data()?.stageId === 'stage_3');

let badAnswer = false;
try {
  await submitProgression(db, FieldValue as any, firstOpen, {
    uid: 'u_guard', round: 'first', answer: 'tahmeel' as any,
  });
} catch (e) { badAnswer = e instanceof ProgressionError; }
check('an answer from the wrong round is rejected', badAnswer);

let whenClosed = false;
try {
  await submitProgression(db, FieldValue as any, closed, {
    uid: 'u_guard', round: 'first', answer: 'passed',
  });
} catch (e) { whenClosed = e instanceof ProgressionError; }
check('nothing can be submitted while the gate is closed', whenClosed);

// Re-answering after completing must not double-promote.
let twice = false;
try {
  await submitProgression(db, FieldValue as any, firstOpen, {
    uid: 'u_pass', round: 'first', answer: 'passed',
  });
} catch (e) { twice = e instanceof ProgressionError; }
check('a completed student cannot answer again', twice);
check('so they cannot climb two stages in one year',
  (await db.doc('users/u_pass').get()).data()?.stageId === 'stage_4');

let ghostRejected = false;
try {
  await db.collection('users').doc('u_ghost').set({
    name: 'ghost', email: 'ghost@x.com', role: 'student', stageId: 'stage_ghost',
  });
  await submitProgression(db, FieldValue as any, firstOpen, {
    uid: 'u_ghost', round: 'first', answer: 'passed',
  });
} catch (e) { ghostRejected = e instanceof ProgressionError; }
check('an unknown stage is rejected rather than read as graduation', ghostRejected);
check('and that student is not marked graduated',
  (await db.doc('users/u_ghost').get()).data()?.graduated === undefined);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

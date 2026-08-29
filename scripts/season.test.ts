/**
 * Verifies the season reset against the Firestore emulator.
 *
 * Run with:  npm run test:season
 *
 * This is the highest-risk operation in the app - it zeroes both leaderboards
 * for every student - so every guarantee is asserted here before it is ever
 * pointed at production.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import 'dotenv/config';
import { startNewSeason } from '../shared/seasonReset';
import { closableTerm, DEFAULT_CALENDAR } from '../shared/academicCalendar';
import { syncPhaseMirror } from '../shared/seasonRollover';

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

// ---------------------------------------------------------------------------
// Seed: two stages, so we can prove ranks are per-stage and not global.
// ---------------------------------------------------------------------------
const seed = [
  { uid: 's3_top',    stageId: 'stage_3', streakCount: 24, longestStreak: 30, correct: 408, answered: 440 },
  { uid: 's3_mid',    stageId: 'stage_3', streakCount: 16, longestStreak: 16, correct: 200, answered: 220 },
  { uid: 's3_low',    stageId: 'stage_3', streakCount: 3,  longestStreak: 5,  correct: 208, answered: 340 },
  { uid: 's4_top',    stageId: 'stage_4', streakCount: 9,  longestStreak: 9,  correct: 100, answered: 100 },
  { uid: 'idle',      stageId: 'stage_3', streakCount: 0,  longestStreak: 0,  correct: 0,   answered: 0   },
];

for (const u of seed) {
  await db.collection('users').doc(u.uid).set({
    name: u.uid, email: `${u.uid}@x.com`, role: 'student', stageId: u.stageId,
    streakCount: u.streakCount, longestStreak: u.longestStreak, freezeTokens: 1,
    lastActiveDate: '2026-08-01',
  });
  if (u.answered > 0) {
    await db.collection('userMCQStats').doc(u.uid).set({
      userId: u.uid, stageId: u.stageId,
      totalFirstAttemptCorrect: u.correct, totalFirstAttemptAnswered: u.answered,
      accuracy: (u.correct / u.answered) * 100,
      mcqLeaderboardScore: u.correct * 10,
      mcqRankScore: Math.round((u.correct * u.correct * 100) / u.answered),
      lecturesAttempted: Math.round(u.answered / 20),
      subjectStats: { biochemistry: { correct: u.correct, total: u.answered, lecturesAttempted: 1 } },
    });
  }
}

// A per-lecture answer record, which the reset must NOT touch.
await db.collection('userMCQAnswers').doc('s3_top').collection('lectures').doc('lec1').set({
  lectureId: 'lec1', userId: 's3_top', hasCompletedFirstAttempt: true,
  firstAttemptCorrect: 18, firstAttemptTotal: 20, totalAttempts: 2,
});

await db.collection('app_settings').doc('streak').set({ vacationMode: true, lastArchiveId: 'old' });

console.log('Seeded. Running season reset...\n');
const result = await startNewSeason(db, FieldValue as any, {
  seasonName: 'المرحلة الثالثة -2026',
  performedBy: 'admin_uid',
});
const { seasonId } = result;

console.log('Verifying:');

// ---- history captured, ranked per stage ----------------------------------
const s3TopStreak = (await db.doc(`users/s3_top/streakHistory/${seasonId}`).get()).data();
check('streak history records rank 1 in stage_3', s3TopStreak?.rank === 1, String(s3TopStreak?.rank));
check('streak history keeps the final streak', s3TopStreak?.finalStreak === 24, String(s3TopStreak?.finalStreak));
check('streak history keeps the longest streak', s3TopStreak?.longestStreak === 30, String(s3TopStreak?.longestStreak));

const s4Streak = (await db.doc(`users/s4_top/streakHistory/${seasonId}`).get()).data();
check('ranks are per-stage, not global (stage_4 student is rank 1 too)',
  s4Streak?.rank === 1, `stage_4 rank=${s4Streak?.rank} with streak 9 vs stage_3 top 24`);

const idleStreak = await db.doc(`users/idle/streakHistory/${seasonId}`).get();
check('a student with no activity gets no history card', !idleStreak.exists);

// ---- MCQ history has everything the profile needs -------------------------
const midMcq = (await db.doc(`users/s3_mid/mcqHistory/${seasonId}`).get()).data();
check('mcq history stores rank', midMcq?.rank === 2, String(midMcq?.rank));
check('mcq history stores score', midMcq?.score === 182, String(midMcq?.score));
check('mcq history stores question counts', midMcq?.totalCorrect === 200 && midMcq?.totalAnswered === 220,
  `${midMcq?.totalCorrect}/${midMcq?.totalAnswered}`);
check('mcq history stores accuracy', Math.round(midMcq?.accuracy) === 91, String(midMcq?.accuracy));

// The blend must beat the old volume ordering: s3_low had MORE correct answers
// than nobody, but its 61% accuracy should place it below s3_mid's 91%.
const lowMcq = (await db.doc(`users/s3_low/mcqHistory/${seasonId}`).get()).data();
check('blended ranking places 91%/220 above 61%/340',
  (midMcq?.rank as number) < (lowMcq?.rank as number), `mid=${midMcq?.rank} low=${lowMcq?.rank}`);

// ---- live boards zeroed ---------------------------------------------------
const topUser = (await db.doc('users/s3_top').get()).data();
check('streak zeroed', topUser?.streakCount === 0 && topUser?.longestStreak === 0,
  `${topUser?.streakCount}/${topUser?.longestStreak}`);
check('freeze tokens restored', topUser?.freezeTokens === 3, String(topUser?.freezeTokens));
check('lastActiveDate cleared', topUser?.lastActiveDate === null, String(topUser?.lastActiveDate));

const topStats = (await db.doc('userMCQStats/s3_top').get()).data();
check('mcq totals zeroed',
  topStats?.totalFirstAttemptCorrect === 0 && topStats?.totalFirstAttemptAnswered === 0,
  `${topStats?.totalFirstAttemptCorrect}/${topStats?.totalFirstAttemptAnswered}`);
check('mcqRankScore removed so the board excludes them',
  topStats?.mcqRankScore === undefined, String(topStats?.mcqRankScore));
check('subjectStats cleared', Object.keys(topStats?.subjectStats || {}).length === 0);

// ---- what must survive ----------------------------------------------------
const answers = (await db.doc('userMCQAnswers/s3_top/lectures/lec1').get()).data();
check('per-lecture answers are untouched (review history + no re-farming)',
  answers?.hasCompletedFirstAttempt === true && answers?.firstAttemptCorrect === 18,
  JSON.stringify(answers));

// ---- season record + live again -------------------------------------------
const archive = (await db.doc(`semesterArchives/${seasonId}`).get()).data();
check('archive stores a per-stage streak top list',
  archive?.topStudents?.every((t: any) => !!t.stageId), JSON.stringify(archive?.topStudents?.[0]));
check('archive stores an MCQ top list', (archive?.topMcqStudents?.length || 0) === 4,
  String(archive?.topMcqStudents?.length));

const settings = (await db.doc('app_settings/streak').get()).data();
// The seed put the app in vacation. Archiving must leave that exactly as it
// found it - the pause belongs to the calendar, not to the reset.
check('archiving does not silently unpause the app', settings?.vacationMode === true,
  String(settings?.vacationMode));
check('archive id points at the new season', settings?.lastArchiveId === seasonId);

check('result counts reported', result.streakArchived === 4 && result.mcqArchived === 4,
  `${result.streakArchived} streak / ${result.mcqArchived} mcq`);

// ---------------------------------------------------------------------------
// Automated rollover: closing a season because a break started must NOT take
// the app out of the break, and must never archive the same term twice.
// ---------------------------------------------------------------------------
console.log('\nAutomated rollover:');

await db.doc('app_settings/streak').set({ vacationMode: true }, { merge: true });
await db.collection('users').doc('s3_top').set({ streakCount: 5, longestStreak: 5 }, { merge: true });

const closed = await startNewSeason(db, FieldValue as any, {
  seasonName: 'الفصل الدراسي الأول 2026-2027',
  performedBy: 'cron',
  closedTermId: 'term1_2026',
});

const afterClose = (await db.doc('app_settings/streak').get()).data();
check('archiving never touches vacationMode - the calendar owns the pause',
  afterClose?.vacationMode === true, String(afterClose?.vacationMode));
check('the closed term is recorded for idempotency',
  afterClose?.seasonClosedFor === 'term1_2026', String(afterClose?.seasonClosedFor));
check('the archive id points at the season just closed',
  afterClose?.lastArchiveId === closed.seasonId);

// closableTerm is what guards the second run.
check('the same term cannot be closed twice',
  closableTerm(DEFAULT_CALENDAR, '2027-01-20', afterClose?.seasonClosedFor) === null);
check('but a different finished term still can be',
  closableTerm(DEFAULT_CALENDAR, '2027-05-30', afterClose?.seasonClosedFor)?.id === 'term2_2027');

// A calendar close is named after the term, so a retry after a partial failure
// reuses the same document ids instead of writing a second set of cards.
check('a calendar close gets a deterministic season id',
  closed.seasonId === 'season_term1_2026', closed.seasonId);

const cardBefore = (await db.doc(`users/s3_top/streakHistory/${closed.seasonId}`).get()).data();
check('the closed season archived the real final streak',
  cardBefore?.finalStreak === 5, String(cardBefore?.finalStreak));

// Re-running the same close is what a retry looks like. The student is already
// zeroed, so they are no longer ranked and their existing card must survive
// untouched rather than being rewritten with a streak of 0.
const retry = await startNewSeason(db, FieldValue as any, {
  seasonName: 'الفصل الدراسي الأول 2026-2027',
  performedBy: 'cron',
  closedTermId: 'term1_2026',
});
const cardAfter = (await db.doc(`users/s3_top/streakHistory/${closed.seasonId}`).get()).data();
check('a retry reuses the same season id', retry.seasonId === closed.seasonId, retry.seasonId);
check('a retry does not overwrite an already-archived card with zeros',
  cardAfter?.finalStreak === 5, String(cardAfter?.finalStreak));
check('a retry archives nobody, because everyone is already zeroed',
  retry.streakArchived === 0, String(retry.streakArchived));

// The manual admin button archives, then syncs the mirror from the calendar.
// It must NOT force the app live: ending a season during a break leaves the
// break in place, which is exactly the end-of-year case.
await startNewSeason(db, FieldValue as any, { seasonName: 'يدوي', performedBy: 'admin_uid' });
const beforeSync = (await db.doc('app_settings/streak').get()).data();
check('a manual archive leaves vacationMode untouched',
  beforeSync?.vacationMode === true, String(beforeSync?.vacationMode));

// Today is before the 2026-2027 calendar opens, so the resolved phase is the
// summer holiday - paused.
const syncedPhase = await syncPhaseMirror(db, FieldValue as any);
const afterManual = (await db.doc('app_settings/streak').get()).data();
check('syncPhaseMirror writes the phase, not the archive',
  afterManual?.currentPhase === syncedPhase.phase, String(afterManual?.currentPhase));
check('the pre-calendar holiday keeps the app paused',
  afterManual?.vacationMode === true && syncedPhase.isPaused === true,
  `${afterManual?.vacationMode} / ${syncedPhase.phase}`);

// Mid-term it must swing the other way, from the same helper.
await db.doc('app_settings/academicCalendar').set({
  yearLabel: 'test', timezone: 'Asia/Baghdad',
  terms: [{ id: 'now', nameAr: 'x', nameEn: 'x',
    startDate: '2020-01-01', endDate: '2099-12-31', examsStart: null, examsEnd: null }],
});
await syncPhaseMirror(db, FieldValue as any);
const afterLive = (await db.doc('app_settings/streak').get()).data();
check('a live term unpauses through the same mirror',
  afterLive?.vacationMode === false, String(afterLive?.vacationMode));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

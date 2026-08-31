/**
 * Security-rules tests for the roles/permissions model.
 *
 * Run with:  npm run test:rules
 *
 * Pinned to firebase-tools@13 because v15 requires JDK 21 and this machine
 * has JDK 17. Drop the pin once a newer JDK is installed.
 *
 * These rules guard the `students` collection, which holds emails, exam codes
 * and password hashes - so the moderator boundary is asserted, not assumed.
 */
import fs from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = 'mylectures-rules-test';

let passed = 0;
let failed = 0;

async function check(name, promise) {
  try {
    await promise;
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err?.message?.split('\n')[0]}`);
    failed++;
  }
}

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules: fs.readFileSync('firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

// ---------------------------------------------------------------------------
// Seed the documents the rules read via get()/exists().
// ---------------------------------------------------------------------------
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();

  // A stage representative for stage_3.
  await setDoc(doc(db, 'users/rep_uid'), {
    role: 'admin', email: 'rep@x.com', managedStageId: 'stage_3',
  });
  await setDoc(doc(db, 'allowed_admins/rep@x.com'), {
    email: 'rep@x.com', role: 'admin', managedStageId: 'stage_3',
  });

  // A moderator appointed by that representative.
  await setDoc(doc(db, 'users/mod_uid'), {
    role: 'moderator', email: 'mod@x.com', managedStageId: 'stage_3',
    permissions: { manageLectures: true },
  });
  await setDoc(doc(db, 'allowed_admins/mod@x.com'), {
    email: 'mod@x.com', role: 'moderator', managedStageId: 'stage_3',
  });

  // A legacy allowed_admins entry with NO role field - must still be an admin.
  await setDoc(doc(db, 'users/legacy_uid'), { role: 'admin', email: 'legacy@x.com' });
  await setDoc(doc(db, 'allowed_admins/legacy@x.com'), { email: 'legacy@x.com' });

  // A plain student, whitelisted.
  await setDoc(doc(db, 'users/stu_uid'), { role: 'student', email: 'stu@x.com', stageId: 'stage_3' });
  await setDoc(doc(db, 'students/stu@x.com'), {
    email: 'stu@x.com', name: 'Student', isActive: true, stageId: 'stage_3', password: 'HASH',
  });

  await setDoc(doc(db, 'stages/stage_3'), { id: 'stage_3', nameEn: 'Third Stage', order: 3 });
  await setDoc(doc(db, 'stages/stage_4'), { id: 'stage_4', nameEn: 'Fourth Stage', order: 4 });
  await setDoc(doc(db, 'lectures/lec1'), { title: 'L1', stageId: 'stage_3', category: 'biochemistry' });
  await setDoc(doc(db, 'degreeBatches/b1'), { examName: 'Mid', stageId: 'stage_3' });
  await setDoc(doc(db, 'subjects/stage_3__biochemistry_ii'), {
    id: 'biochemistry_ii', stageId: 'stage_3', courseId: 'course_2',
    nameEn: 'Biochemistry II', nameAr: 'Biochemistry II', order: 0, isActive: true,
  });
});

const ctxFor = (uid, email) =>
  testEnv.authenticatedContext(uid, { email }).firestore();

const rep = ctxFor('rep_uid', 'rep@x.com');
const mod = ctxFor('mod_uid', 'mod@x.com');
const legacy = ctxFor('legacy_uid', 'legacy@x.com');
const student = ctxFor('stu_uid', 'stu@x.com');
const master = ctxFor('master_uid', 'almdrydyl335@gmail.com');

console.log('\nModerator is walled off from student data');
await check('moderator CANNOT read students',
  assertFails(getDoc(doc(mod, 'students/stu@x.com'))));
await check('moderator CANNOT write students',
  assertFails(setDoc(doc(mod, 'students/new@x.com'), { email: 'new@x.com' })));
await check('moderator CANNOT read degreeBatches',
  assertFails(getDoc(doc(mod, 'degreeBatches/b1'))));

console.log('\nModerator keeps content permissions');
await check('moderator CAN create a lecture on their stage',
  assertSucceeds(setDoc(doc(mod, 'lectures/lec_mod'), { title: 'M', stageId: 'stage_3' })));
await check('moderator CAN create a record',
  assertSucceeds(setDoc(doc(mod, 'records/rec_mod'), { title: 'R', stageId: 'stage_3' })));
await check('moderator CANNOT write a lecture on another stage',
  assertFails(setDoc(doc(mod, 'lectures/lec_other'), { title: 'X', stageId: 'stage_4' })));

console.log('\nRepresentative retains full control of their stage');
await check('representative CAN read students',
  assertSucceeds(getDoc(doc(rep, 'students/stu@x.com'))));
await check('representative CAN read degreeBatches',
  assertSucceeds(getDoc(doc(rep, 'degreeBatches/b1'))));
await check('representative CAN set groupConfig on their own stage',
  assertSucceeds(updateDoc(doc(rep, 'stages/stage_3'), {
    groupConfig: { groups: [{ id: 'A', subgroupCount: 2 }] },
  })));
await check('representative CANNOT set groupConfig on another stage',
  assertFails(updateDoc(doc(rep, 'stages/stage_4'), {
    groupConfig: { groups: [{ id: 'A', subgroupCount: 2 }] },
  })));
await check('representative CANNOT rename their stage',
  assertFails(updateDoc(doc(rep, 'stages/stage_3'), { nameEn: 'Hacked' })));

console.log('\nRepresentative may appoint moderators, but not admins');
await check('representative CAN create a moderator on their stage',
  assertSucceeds(setDoc(doc(rep, 'allowed_admins/new_mod@x.com'), {
    email: 'new_mod@x.com', role: 'moderator', managedStageId: 'stage_3',
  })));
await check('representative CANNOT create an admin',
  assertFails(setDoc(doc(rep, 'allowed_admins/new_admin@x.com'), {
    email: 'new_admin@x.com', role: 'admin', managedStageId: 'stage_3',
  })));
await check('representative CANNOT create a moderator on another stage',
  assertFails(setDoc(doc(rep, 'allowed_admins/other@x.com'), {
    email: 'other@x.com', role: 'moderator', managedStageId: 'stage_4',
  })));

console.log('\nPrivilege escalation is blocked');
await check('moderator CANNOT appoint anyone',
  assertFails(setDoc(doc(mod, 'allowed_admins/evil@x.com'), {
    email: 'evil@x.com', role: 'moderator', managedStageId: 'stage_3',
  })));
await check('moderator CANNOT promote themselves to admin',
  assertFails(updateDoc(doc(mod, 'users/mod_uid'), { role: 'admin' })));
await check('student CANNOT read students collection',
  assertFails(getDoc(doc(student, 'students/other@x.com'))));
await check('representative CANNOT promote themselves to master_admin',
  assertFails(updateDoc(doc(rep, 'users/rep_uid'), { role: 'master_admin' })));
await check('student CANNOT promote themselves to admin',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { role: 'admin' })));
await check('representative CAN still re-assert their own admin role',
  assertSucceeds(updateDoc(doc(rep, 'users/rep_uid'), { role: 'admin' })));

console.log('\nSubjects: only the stage own representative may edit');
await check('representative CAN create a subject on their stage',
  assertSucceeds(setDoc(doc(rep, 'subjects/stage_3__new_subject'), {
    id: 'new_subject', stageId: 'stage_3', courseId: 'course_1',
    nameEn: 'New', nameAr: 'New', order: 9, isActive: true,
  })));
await check('representative CAN move a subject between courses',
  assertSucceeds(updateDoc(doc(rep, 'subjects/stage_3__biochemistry_ii'), { courseId: 'course_1' })));
await check('representative CANNOT create a subject on another stage',
  assertFails(setDoc(doc(rep, 'subjects/stage_4__intruder'), {
    id: 'intruder', stageId: 'stage_4', courseId: 'course_1',
    nameEn: 'X', nameAr: 'X', order: 0, isActive: true,
  })));
await check('moderator CANNOT create a subject',
  assertFails(setDoc(doc(mod, 'subjects/stage_3__mod_subject'), {
    id: 'mod_subject', stageId: 'stage_3', courseId: 'course_1',
    nameEn: 'X', nameAr: 'X', order: 0, isActive: true,
  })));
await check('student CAN read subjects',
  assertSucceeds(getDoc(doc(student, 'subjects/stage_3__biochemistry_ii'))));

console.log('\nLegacy allowed_admins entries (no role field) still work');
await check('legacy admin CAN read students',
  assertSucceeds(getDoc(doc(legacy, 'students/stu@x.com'))));
await check('legacy admin CAN write a lecture (unassigned -> any stage)',
  assertSucceeds(setDoc(doc(legacy, 'lectures/lec_legacy'), { title: 'L', stageId: 'stage_3' })));

console.log('\nAcademic calendar is master-admin only');
// It decides whether the competition is running for the WHOLE university, so a
// stage representative must not be able to pause it from the client.
await check('master admin CAN write the academic calendar',
  assertSucceeds(setDoc(doc(master, 'app_settings/academicCalendar'), {
    yearLabel: '2026-2027', timezone: 'Asia/Baghdad',
    terms: [{ id: 't1', nameAr: 'x', nameEn: 'x', startDate: '2026-09-20', endDate: '2026-12-31', examsStart: null, examsEnd: null }],
  })));
await check('representative CANNOT write the academic calendar',
  assertFails(setDoc(doc(rep, 'app_settings/academicCalendar'), { yearLabel: 'hacked', terms: [] })));
await check('moderator CANNOT write the academic calendar',
  assertFails(setDoc(doc(mod, 'app_settings/academicCalendar'), { yearLabel: 'hacked', terms: [] })));
await check('student CANNOT write the academic calendar',
  assertFails(setDoc(doc(student, 'app_settings/academicCalendar'), { yearLabel: 'hacked', terms: [] })));
await check('student CAN read the academic calendar',
  assertSucceeds(getDoc(doc(student, 'app_settings/academicCalendar'))));
await check('representative CAN still write other app_settings',
  assertSucceeds(setDoc(doc(rep, 'app_settings/streak'), { gracePeriodHours: 3 }, { merge: true })));

console.log('\nStage and progression are server-owned');
// Progression is recorded by /api/progression/submit with the Admin SDK,
// because it must also write students/{email}.stageId - which a student cannot,
// and which syncUserStage would otherwise use to revert the promotion at their
// next login. So there must be no client path to stageId at all.
await check('student CANNOT promote themselves by writing stageId',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { stageId: 'stage_5' })));
await check('student CANNOT grant themselves carried subjects',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { tahmeelSubjects: ['pharmacology_ii'] })));
await check('student CANNOT mark themselves graduated',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { graduated: true })));
await check('student CANNOT fake having completed progression',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { progressionState: 'completed' })));
await check('student CAN still edit their own harmless fields',
  assertSucceeds(updateDoc(doc(student, 'users/stu_uid'), { hideNameOnLeaderboard: true })));

console.log('\nSubscription state is server-owned');
// The paywall in App.tsx gates every paid course on these three fields, and
// only the Admin SDK writes them - ZainCash settlement and the admin grant
// route. The generic self-edit branch froze streaks and progression but not
// these, so a student could unlock the whole app from the browser console.
await check('student CANNOT subscribe themselves',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { isSubscribed: true })));
await check('student CANNOT extend their own subscription',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { subscriptionEnd: new Date('2099-01-01') })));
await check('student CANNOT upgrade their own plan',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { subscriptionPlan: 'semi_annual' })));
// Clearing this would let them open a second gateway transaction while one is
// still live, which ZainCash then refuses to settle - locking them out of both.
await check('student CANNOT clear the in-flight payment pointer',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { pendingZainCashRef: null })));

console.log('\nUGC moderation: reporting and blocking');
// Apple 1.2 / Play UGC. A report names its reporter, so the reported party
// must never be able to read one, and a report cannot be filed in someone
// else's name.
await check('student CAN report a message',
  assertSucceeds(setDoc(doc(student, 'content_reports/r1'), {
    reporterId: 'stu_uid', messageId: 'm1', reason: 'harassment', status: 'open',
  })));
await check('student CANNOT forge a report as someone else',
  assertFails(setDoc(doc(student, 'content_reports/r2'), {
    reporterId: 'rep_uid', messageId: 'm1', reason: 'spam', status: 'open',
  })));
await check('student CANNOT read reports (they name the reporter)',
  assertFails(getDoc(doc(student, 'content_reports/r1'))));
await check('moderator CAN read reports to triage them',
  assertSucceeds(getDoc(doc(mod, 'content_reports/r1'))));
await check('student CANNOT delete a report to cover their tracks',
  assertFails(deleteDoc(doc(student, 'content_reports/r1'))));
await check('student CAN block someone',
  assertSucceeds(updateDoc(doc(student, 'users/stu_uid'), { blockedUsers: ['rep_uid'] })));
await check('blockedUsers must be a list',
  assertFails(updateDoc(doc(student, 'users/stu_uid'), { blockedUsers: 'rep_uid' })));

console.log('\nSignup queue is server-owned');
await check('nobody can create a signup request from the client',
  assertFails(setDoc(doc(student, 'signup_requests/new@x.com'), { email: 'new@x.com', status: 'pending' })));
await check('not even an admin can write one directly',
  assertFails(setDoc(doc(rep, 'signup_requests/new@x.com'), { email: 'new@x.com', status: 'pending' })));
await check('a student cannot read the queue (it holds emails and hashes)',
  assertFails(getDoc(doc(student, 'signup_requests/new@x.com'))));
await check('a representative CAN read it to triage',
  assertSucceeds(getDoc(doc(rep, 'signup_requests/new@x.com'))));

await testEnv.cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

/**
 * Stamps stageId and yearLabel onto degrees written before those fields existed.
 *
 *   npx tsx scripts/backfillDegreeYears.ts
 *   npx tsx scripts/backfillDegreeYears.ts --commit
 *   npx tsx scripts/backfillDegreeYears.ts --stage stage_3 --year 2025-2026 --commit
 *
 * StudentGradesScreen files each degree under a stage tab and a year heading. A
 * degree with no stageId belongs to no tab, and one with no yearLabel cannot be
 * told apart from the same stage repeated a year later - which is exactly the
 * case the year heading exists for.
 *
 * The defaults are deliberate history, NOT the live calendar: every degree
 * currently in Firestore was uploaded for المرحلة الثالثة during 2025-2026, and
 * those students are now in the fourth stage. Reading yearLabel off
 * app_settings/academicCalendar would stamp them 2026-2027 and silently merge
 * the year that just ended into the one that just started.
 *
 * DRY RUN IS THE DEFAULT. The report breaks the sweep down by the stageId the
 * documents already carry, so a surprise - real stage_1 or stage_2 batches that
 * must not be relabelled - surfaces before anything is written.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import 'dotenv/config';

const argv = process.argv.slice(2);
const flag = (name: string, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const commit = argv.includes('--commit');
const targetStage = flag('stage', 'stage_3');
const targetYear = flag('year', '2025-2026');

if (!/^\d{4}-\d{4}$/.test(targetYear)) {
  console.error(`--year "${targetYear}" is not a YYYY-YYYY label. Refusing to write it.`);
  process.exit(1);
}

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error('Missing FIREBASE_* credentials in the environment.');
  process.exit(1);
}
initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  projectId: FIREBASE_PROJECT_ID,
});
const db = getFirestore();

console.log(`Backfilling with stageId="${targetStage}", yearLabel="${targetYear}".\n`);

type Patch = { path: string; ref: FirebaseFirestore.DocumentReference; patch: Record<string, unknown> };

const tally = (values: (string | undefined)[]) => {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v || '(none)';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const report = (label: string, docs: FirebaseFirestore.QueryDocumentSnapshot[], patches: Patch[]) => {
  console.log(`${label}: ${docs.length} document(s).`);
  console.log('  by existing stageId:');
  for (const [k, n] of tally(docs.map(d => d.data().stageId))) console.log(`    ${k.padEnd(14)} ${n}`);
  console.log('  by existing yearLabel:');
  for (const [k, n] of tally(docs.map(d => d.data().yearLabel))) console.log(`    ${k.padEnd(14)} ${n}`);
  console.log(`  ${patches.filter(p => 'stageId' in p.patch).length} need stageId, ` +
              `${patches.filter(p => 'yearLabel' in p.patch).length} need yearLabel, ` +
              `${patches.length} to patch.\n`);
};

const plan = (docs: FirebaseFirestore.QueryDocumentSnapshot[]): Patch[] => {
  const out: Patch[] = [];
  for (const d of docs) {
    const data = d.data();
    const patch: Record<string, unknown> = {};
    if (!data.stageId) patch.stageId = targetStage;
    if (!data.yearLabel) patch.yearLabel = targetYear;
    if (Object.keys(patch).length > 0) out.push({ path: d.ref.path, ref: d.ref, patch });
  }
  return out;
};

// ---------------------------------------------------------------------------
// degrees/{studentId}/exams/{examId}
//
// Reached through the collection group rather than degreeBatches.studentIds:
// the legacy callable in functions/index.js wrote degree documents whose
// manifest may be absent, and walking the manifests would skip exactly those.
//
// The path guard is the same one shared/yearWipe.ts documents - a collection
// group matches every collection of that name at any depth. 'exams' happens to
// be unique to degrees today, and this keeps it true if that ever changes.
// ---------------------------------------------------------------------------
const examSnap = await db.collectionGroup('exams').select('stageId', 'yearLabel').get();
const strays = examSnap.docs.filter(d => !d.ref.path.startsWith('degrees/'));
if (strays.length) {
  console.log(`Ignoring ${strays.length} 'exams' document(s) outside degrees/:`);
  for (const s of strays.slice(0, 5)) console.log(`  ${s.ref.path}`);
  console.log('');
}
const examDocs = examSnap.docs.filter(d => d.ref.path.startsWith('degrees/'));
const examPatches = plan(examDocs);
report('degrees/*/exams', examDocs, examPatches);

const batchSnap = await db.collection('degreeBatches').get();
const batchPatches = plan(batchSnap.docs);
report('degreeBatches', batchSnap.docs, batchPatches);

const foreign = [...examDocs, ...batchSnap.docs]
  .map(d => d.data().stageId)
  .filter(s => s && s !== targetStage);
if (foreign.length) {
  console.log(`WARNING: ${foreign.length} document(s) already carry a stageId other than ${targetStage}:`);
  for (const [k, n] of tally(foreign)) console.log(`    ${k.padEnd(14)} ${n}`);
  console.log(`They keep their own stageId; only yearLabel is added. If ${targetYear} is`);
  console.log('wrong for them, sort them out before committing.\n');
}

const all = [...examPatches, ...batchPatches];
for (const p of all.slice(0, 10)) console.log(`  ${p.path} -> ${JSON.stringify(p.patch)}`);
if (all.length > 10) console.log(`  … and ${all.length - 10} more`);
console.log(`\n${all.length} document(s) need a patch.`);

if (!commit) {
  console.log('\nDRY RUN - nothing written. Re-run with --commit to apply.');
  process.exit(0);
}

const CHUNK = 450;
for (let start = 0; start < all.length; start += CHUNK) {
  const batch = db.batch();
  for (const p of all.slice(start, start + CHUNK)) batch.update(p.ref, p.patch);
  await batch.commit();
  console.log(`  committed ${Math.min(start + CHUNK, all.length)} / ${all.length}`);
}

console.log(`\nDone. ${all.length} document(s) patched.`);

/**
 * Gives existing students the fields name/code login needs.
 *
 *   npx tsx scripts/backfillNameKeys.ts
 *   npx tsx scripts/backfillNameKeys.ts --commit
 *   npx tsx scripts/backfillNameKeys.ts --stage stage_4 --commit
 *
 * /api/login resolves a typed name by querying students.nameKey, and a typed
 * code by querying students.loginCodeKey. Rows written before those fields
 * existed have neither, so those students can still sign in with their email
 * but not with their name - this closes that gap for the existing roster.
 *
 * DRY RUN IS THE DEFAULT. It also reports name collisions, which are not an
 * error - login breaks a tie on the password, and a login code separates the
 * pair outright - but they are worth knowing about before students start
 * typing names.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import 'dotenv/config';
import { nameKeyFor, makeLoginCode, loginCodeKeyFor } from '../shared/rosterIdentity';

const argv = process.argv.slice(2);
const flag = (name: string, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const commit = argv.includes('--commit');
const onlyStage = flag('stage');

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

const base = db.collection('students');
const snap = await (onlyStage ? base.where('stageId', '==', onlyStage) : base).get();
console.log(`${snap.size} student documents${onlyStage ? ` on ${onlyStage}` : ''}.`);

// Codes already in use, so a generated one never collides with a live login.
const usedCodes = new Set<string>();
snap.docs.forEach(d => {
  const code = d.data().loginCode;
  if (code) usedCodes.add(loginCodeKeyFor(code));
});

const patches: { id: string; patch: Record<string, unknown> }[] = [];
const byNameKey = new Map<string, string[]>();

for (const d of snap.docs) {
  const data = d.data();
  const name = (data.name || '').trim();
  if (!name) { console.log(`  skip ${d.id} - no name`); continue; }

  const nameKey = nameKeyFor(name);
  byNameKey.set(nameKey, [...(byNameKey.get(nameKey) || []), name]);

  const patch: Record<string, unknown> = {};
  if (data.nameKey !== nameKey) patch.nameKey = nameKey;

  if (!data.loginCode) {
    let code = makeLoginCode(data.subgroup);
    while (usedCodes.has(loginCodeKeyFor(code))) code = makeLoginCode(data.subgroup);
    usedCodes.add(loginCodeKeyFor(code));
    patch.loginCode = code;
    patch.loginCodeKey = loginCodeKeyFor(code);
  } else if (!data.loginCodeKey) {
    patch.loginCodeKey = loginCodeKeyFor(data.loginCode);
  }

  if (Object.keys(patch).length > 0) patches.push({ id: d.id, patch });
}

const collisions = [...byNameKey.entries()].filter(([, names]) => names.length > 1);
if (collisions.length) {
  console.log(`\n${collisions.length} name collision(s) - login will break the tie on the password,`);
  console.log('and each of these students also has a login code that separates them outright:');
  for (const [key, names] of collisions.slice(0, 20)) {
    console.log(`  ${key}  (${names.length}x)`);
  }
}

console.log(`\n${patches.length} document(s) need a patch.`);
for (const p of patches.slice(0, 10)) {
  console.log(`  ${p.id} -> ${JSON.stringify(p.patch)}`);
}
if (patches.length > 10) console.log(`  … and ${patches.length - 10} more`);

if (!commit) {
  console.log('\nDRY RUN - nothing written. Re-run with --commit to apply.');
  process.exit(0);
}

const CHUNK = 450;
for (let start = 0; start < patches.length; start += CHUNK) {
  const batch = db.batch();
  for (const p of patches.slice(start, start + CHUNK)) {
    batch.update(base.doc(p.id), p.patch);
  }
  await batch.commit();
  console.log(`  committed ${Math.min(start + CHUNK, patches.length)} / ${patches.length}`);
}

console.log(`\nDone. ${patches.length} student documents patched.`);

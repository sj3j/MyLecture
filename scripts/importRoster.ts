/**
 * Seeds a stage's roster from a spreadsheet: who is in it, and their groups.
 *
 *   npx tsx scripts/importRoster.ts --file "stage4.xlsx" --stage stage_4
 *   npx tsx scripts/importRoster.ts --file "stage4.xlsx" --stage stage_4 --commit
 *
 * Meant to be run ONCE per stage. After that, students move themselves up by
 * answering the end-of-year question (shared/progression.ts), and transfers
 * from other universities are added or removed by hand in Student Management.
 *
 * Pass --from to restrict eligibility to students currently in that stage,
 * turning this back into a one-off bulk promotion.
 *
 * DRY RUN IS THE DEFAULT. Nothing is written without --commit, and the dry run
 * prints the headers it detected plus a sample of parsed rows so the column
 * mapping can be checked against the real file before committing.
 *
 * If you are using --from as a bulk promotion, run the season archive FIRST:
 * startNewSeason ranks students per stage from users.stageId, so promoting
 * first files the whole cohort's season under the wrong stage, permanently.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import 'dotenv/config';
import { planPromotion, applyPromotion, PromotionRow } from '../shared/stagePromotion';
import { subgroupOptions } from '../shared/groups';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name: string, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name: string) => argv.includes(`--${name}`);

const filePath = flag('file');
const fromStage = flag('from') || undefined;
const toStage = flag('stage') || flag('to', 'stage_4');
const progressionYear = flag('year', '2026-2027');
const commit = has('commit');

if (!filePath) {
  console.error('Usage: npx tsx scripts/importRoster.ts --file "roster.xlsx" --stage stage_4 [--from stage_3] [--commit]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Sheet parsing. Headers are unknown up front, so match them the way
// src/services/gradeFileParser.ts does: case-insensitive substring against a
// list of Arabic and English aliases, with the detected mapping printed back.
// ---------------------------------------------------------------------------
const EMAIL_KEYS = ['email', 'e-mail', 'mail', 'ايميل', 'إيميل', 'البريد', 'بريد'];
const GROUP_KEYS = ['subgroup', 'group', 'section', 'class',
                    'الشعبة', 'شعبة', 'المجموعة', 'مجموعة', 'القسم'];

const findKey = (keys: string[], aliases: string[]) =>
  keys.find(k => aliases.some(a => k.toLowerCase().trim().includes(a.toLowerCase())));

function parseSheet(path: string): { rows: PromotionRow[]; emailKey: string; groupKey: string; sheetName: string; total: number } {
  const workbook = XLSX.read(readFileSync(path), { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const raw: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

  if (raw.length === 0) {
    console.error(`Sheet "${sheetName}" has no data rows.`);
    process.exit(1);
  }

  // Union of keys across the first rows - the first row alone can be missing an
  // optional column, which would hide the header entirely.
  const keys = Array.from(new Set(raw.slice(0, 20).flatMap(r => Object.keys(r))));
  const emailKey = findKey(keys, EMAIL_KEYS) || '';
  const groupKey = findKey(keys, GROUP_KEYS) || '';

  if (!emailKey || !groupKey) {
    console.error('\nCould not identify the columns.');
    console.error(`  Headers found : ${keys.join(' | ')}`);
    console.error(`  Email column  : ${emailKey || 'NOT FOUND - expected one containing ' + EMAIL_KEYS.join('/')}`);
    console.error(`  Group column  : ${groupKey || 'NOT FOUND - expected one containing ' + GROUP_KEYS.join('/')}`);
    console.error('\nRename the columns in the sheet, or add the alias to EMAIL_KEYS/GROUP_KEYS in this script.');
    process.exit(1);
  }

  const rows: PromotionRow[] = raw
    .map(r => ({ email: String(r[emailKey] ?? '').trim(), subgroup: String(r[groupKey] ?? '').trim() }))
    .filter(r => r.email);

  return { rows, emailKey, groupKey, sheetName, total: raw.length };
}

// ---------------------------------------------------------------------------
const { rows, emailKey, groupKey, sheetName, total } = parseSheet(filePath);

console.log('\n=== Sheet ===');
console.log(`  file          : ${filePath}`);
console.log(`  sheet         : ${sheetName}`);
console.log(`  rows          : ${total} (${rows.length} with an email)`);
console.log(`  email column  : "${emailKey}"`);
console.log(`  group column  : "${groupKey}"`);
console.log('\n  First rows as parsed - check these against the file:');
rows.slice(0, 5).forEach((r, i) => console.log(`    ${i + 1}. ${r.email}  ->  ${r.subgroup}`));

// ---------------------------------------------------------------------------
const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error('\n.env is missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.');
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

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log(`\nTarget: project ${FIREBASE_PROJECT_ID} (LIVE)`);
} else {
  console.log(`\nTarget: emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
}

const plan = await planPromotion(db, { from: fromStage, to: toStage, rows });

console.log(`\n=== Plan: ${fromStage} -> ${toStage} ===`);
console.log(`  ${toStage} allows: ${subgroupOptions(plan.groupConfig).join(', ')}`);

const fresh = plan.matched.filter(m => !m.alreadyPromoted);
const already = plan.matched.filter(m => m.alreadyPromoted);
console.log(`\n  to promote        : ${fresh.length}`);
console.log(`  already in ${toStage} : ${already.length} (re-run, no change)`);
console.log(`  problems          : ${plan.problems.length}`);
console.log(`  in ${toStage} but absent from the sheet: ${plan.stayingBehind.length}`);

const regrouped = fresh.filter(m => m.previousSubgroup && m.previousSubgroup !== m.subgroup);
console.log(`  changing group    : ${regrouped.length}`);

if (plan.problems.length) {
  console.log('\n--- PROBLEMS (these rows are skipped entirely) ---');
  for (const p of plan.problems) console.log(`  [${p.kind}] ${p.email} - ${p.detail}`);
}

if (plan.stayingBehind.length) {
  console.log(`\n--- STAYING IN ${fromStage.toUpperCase()} (not in the sheet) ---`);
  for (const s of plan.stayingBehind) console.log(`  ${s.name} <${s.email}>`);
}

if (plan.neverSignedIn.length) {
  console.log('\n--- NEVER SIGNED IN (no users doc yet) ---');
  console.log('  The students record is updated; the stage lands on their user');
  console.log('  doc automatically at first login, via syncUserStage.');
  for (const e of plan.neverSignedIn) console.log(`  ${e}`);
}

if (plan.duplicateUsers.length) {
  console.log('\n--- MULTIPLE USER DOCS (all of them are patched) ---');
  for (const d of plan.duplicateUsers) console.log(`  ${d.email}: ${d.userIds.join(', ')}`);
}

const tahmeel = plan.matched.filter(m => m.hadTahmeel);
if (tahmeel.length) {
  console.log('\n--- HAD tahmeelSubjects (CLEARED by this promotion) ---');
  console.log('  Re-add by hand for anyone genuinely carrying a subject forward.');
  for (const m of tahmeel) console.log(`  ${m.name} <${m.email}>`);
}

if (fresh.length) {
  console.log('\n--- CHANGES ---');
  for (const m of fresh) {
    const move = m.previousSubgroup && m.previousSubgroup !== m.subgroup
      ? `${m.previousSubgroup} -> ${m.subgroup}`
      : m.subgroup;
    console.log(`  ${m.name} <${m.email}>  -> ${toStage}, group ${move}` +
      (m.userIds.length ? '' : '  (students doc only)'));
  }
}

if (!commit) {
  console.log('\nDRY RUN - nothing was written. Re-run with --commit to apply.');
  process.exit(plan.problems.length ? 1 : 0);
}

if (plan.problems.length) {
  console.error(`\nRefusing to commit with ${plan.problems.length} unresolved problem(s). Fix the sheet and re-run.`);
  process.exit(1);
}

console.log('\nCommitting...');
const result = await applyPromotion(db, FieldValue as any, plan, { progressionYear });
console.log(`  students updated : ${result.studentsUpdated}`);
console.log(`  users updated    : ${result.usersUpdated}`);
console.log(`  mcq stats refiled: ${result.statsUpdated}`);
console.log('\nDone.');
process.exit(0);

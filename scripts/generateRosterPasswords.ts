/**
 * Turns a "name + group" roster into accounts, and prints the passwords once.
 *
 *   npx tsx scripts/generateRosterPasswords.ts --file roster.csv --stage stage_4
 *   npx tsx scripts/generateRosterPasswords.ts --file roster.csv --stage stage_4 --commit
 *
 * The same job the in-app CSV importer does, for when the roster is large
 * enough that doing it in a browser tab is uncomfortable, or when the passwords
 * need to exist before anyone opens the admin panel.
 *
 * DRY RUN IS THE DEFAULT, matching scripts/importRoster.ts. Without --commit it
 * writes the two CSVs and touches nothing in Firestore, so the column mapping
 * and the generated codes can be checked against the real file first.
 *
 * Outputs, next to the input file:
 *   <name>.import.csv      feedable straight into the in-app importer
 *   <name>.passwords.csv   the ONLY copy of the plaintext passwords
 *
 * Only `name` is required in the input. Anything else present is respected;
 * anything absent is generated.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { parseCsv, resolveRosterColumns, cell } from '../shared/csv';
import {
  nameKeyFor, newRosterDocId, makeLoginCode, loginCodeKeyFor,
  generatePassword, isPlaceholderEmail,
} from '../shared/rosterIdentity';
import { normalizeSubgroup } from '../shared/groups';

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
const stageId = flag('stage');
const commit = has('commit');

if (!filePath || !stageId) {
  console.error('Usage: npx tsx scripts/generateRosterPasswords.ts --file roster.csv --stage stage_4 [--commit]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------
const parsed = parseCsv(readFileSync(filePath, 'utf8'));
if (parsed.rows.length === 0) {
  console.error('No data rows found.');
  process.exit(1);
}

const cols = resolveRosterColumns(parsed);
if (cols.name < 0) {
  console.error('No name column. Add a header called "name" (or "الاسم").');
  console.error('Headers seen:', parsed.headers.join(', ') || '(none - file has no header row)');
  process.exit(1);
}

console.log(`Header row: ${parsed.hasHeader ? parsed.headers.join(' | ') : '(none, positional)'}`);
console.log(`Columns -> ${JSON.stringify(cols)}`);

interface Row {
  docId: string;
  name: string;
  nameKey: string;
  subgroup: string;
  loginCode: string;
  password: string;
  generated: boolean;
  examCode: string;
  placeholder: boolean;
}

const rows: Row[] = [];
const seenNames = new Set<string>();
const usedCodes = new Set<string>();
const skipped: string[] = [];

for (const raw of parsed.rows) {
  const name = cell(raw, cols.name);
  if (!name) { skipped.push('(blank name)'); continue; }

  const nameKey = nameKeyFor(name);
  if (seenNames.has(nameKey)) { skipped.push(`${name} (duplicate)`); continue; }
  seenNames.add(nameKey);

  const email = cell(raw, cols.email).toLowerCase();
  const subgroup = normalizeSubgroup(cell(raw, cols.group)) || '';
  const csvPassword = cell(raw, cols.password);
  const password = csvPassword || generatePassword();

  let loginCode = makeLoginCode(subgroup);
  while (usedCodes.has(loginCodeKeyFor(loginCode))) loginCode = makeLoginCode(subgroup);
  usedCodes.add(loginCodeKeyFor(loginCode));

  const docId = email || newRosterDocId();

  rows.push({
    docId, name, nameKey, subgroup, loginCode, password,
    generated: !csvPassword,
    examCode: cell(raw, cols.examCode),
    placeholder: isPlaceholderEmail(docId),
  });
}

console.log(`\nParsed ${rows.length} students${skipped.length ? `, skipped ${skipped.length}` : ''}.`);
if (skipped.length) console.log('  skipped:', skipped.slice(0, 10).join(', '), skipped.length > 10 ? '…' : '');

// ---------------------------------------------------------------------------
// Write the two CSVs. The BOM is what makes Excel read Arabic as UTF-8.
// ---------------------------------------------------------------------------
const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
const toCsv = (header: string[], body: string[][]) =>
  '﻿' + [header, ...body].map(r => r.map(esc).join(',')).join('\r\n') + '\r\n';

const stem = join(dirname(filePath), basename(filePath).replace(/\.[^.]+$/, ''));

writeFileSync(`${stem}.import.csv`, toCsv(
  ['name', 'group', 'email', 'password', 'examCode'],
  rows.map(r => [r.name, r.subgroup, r.placeholder ? '' : r.docId, r.password, r.examCode]),
), 'utf8');

writeFileSync(`${stem}.passwords.csv`, toCsv(
  ['الاسم', 'المجموعة', 'رمز الدخول', 'البريد', 'كلمة المرور'],
  rows.map(r => [r.name, r.subgroup, r.loginCode, r.placeholder ? '' : r.docId, r.password]),
), 'utf8');

console.log(`\nWrote ${stem}.import.csv`);
console.log(`Wrote ${stem}.passwords.csv   <- the only copy of the plaintext passwords`);

console.log('\nSample:');
for (const r of rows.slice(0, 5)) {
  console.log(`  ${r.name.padEnd(28)} ${(r.subgroup || '-').padEnd(4)} ${r.loginCode.padEnd(10)} ${r.password}`);
}

if (!commit) {
  console.log('\nDRY RUN - nothing was written to Firestore. Re-run with --commit to create the accounts.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------
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

// Firestore commits at most 500 operations per batch.
const CHUNK = 450;
let written = 0;

for (let start = 0; start < rows.length; start += CHUNK) {
  const batch = db.batch();
  for (const r of rows.slice(start, start + CHUNK)) {
    const payload: Record<string, unknown> = {
      name: r.name,
      nameKey: r.nameKey,
      email: r.docId,
      loginCode: r.loginCode,
      loginCodeKey: loginCodeKeyFor(r.loginCode),
      // bcrypt, not the SHA-256 the browser importer uses - this runs on a
      // server, so there is no reason to settle for the weaker one.
      password: await bcrypt.hash(r.password, 10),
      mustChangePassword: r.generated,
      examCode: r.examCode || '',
      isActive: true,
      stageId,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (r.subgroup) payload.subgroup = r.subgroup;
    if (r.placeholder) payload.placeholderEmail = true;

    // merge so a re-run never clears fields this file has no column for.
    batch.set(db.collection('students').doc(r.docId), payload, { merge: true });
    written++;
  }
  await batch.commit();
  console.log(`  committed ${Math.min(start + CHUNK, rows.length)} / ${rows.length}`);
}

console.log(`\nDone. ${written} students written to stage ${stageId}.`);
console.log(`Hand out ${stem}.passwords.csv - it cannot be regenerated.`);

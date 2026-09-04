/**
 * Verifies roster identity folding and CSV parsing.
 *
 * Run with:  npm run test:roster
 *
 * Pure functions only - no Firebase, no browser. These two modules decide
 * whether an imported student can log in by name at all: the importer writes
 * `nameKey` with nameKeyFor() and /api/login queries it with the same
 * function, so any drift between them locks out exactly the students whose
 * names are spelled inconsistently.
 */
import {
  normalizeName,
  nameKeyFor,
  newRosterDocId,
  isPlaceholderEmail,
  generatePassword,
  makeLoginCode,
  loginCodeKeyFor,
  looksLikeLoginCode,
  ROSTER_EMAIL_DOMAIN,
} from '../shared/rosterIdentity';
import { parseCsv, matrixToParsed, resolveRosterColumns, cell } from '../shared/csv';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { console.log(`  PASS  ${name}`); passed++; }
  else { console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); failed++; }
};

console.log('Name folding:');
{
  check('hamza forms fold together', nameKeyFor('أحمد') === nameKeyFor('احمد'));
  check('ta marbuta folds to ha', nameKeyFor('فاطمة') === nameKeyFor('فاطمه'));
  check('alef maqsura folds to ya', nameKeyFor('مصطفى') === nameKeyFor('مصطفي'));
  check('diacritics are stripped', nameKeyFor('عَلِيّ') === nameKeyFor('علي'),
    JSON.stringify([nameKeyFor('عَلِيّ'), nameKeyFor('علي')]));
  check('inner whitespace collapses', nameKeyFor('احمد   علي') === 'احمد علي');
  check('outer whitespace trims', nameKeyFor('  احمد علي  ') === 'احمد علي');
  check('latin names lowercase', nameKeyFor('Ahmed Ali') === 'ahmed ali');
  check('empty is empty', normalizeName(null) === '' && normalizeName(undefined) === '');
  check('distinct names stay distinct', nameKeyFor('احمد علي') !== nameKeyFor('احمد عبد'));
}

console.log('\nSynthetic ids:');
{
  const a = newRosterDocId(), b = newRosterDocId();
  check('is email-shaped', /^[0-9a-f]{16}@/.test(a), a);
  check('uses the roster domain', a.endsWith(`@${ROSTER_EMAIL_DOMAIN}`), a);
  check('is lowercase', a === a.toLowerCase());
  check('two calls differ', a !== b);
  check('recognised as a placeholder', isPlaceholderEmail(a));
  check('a real address is not', !isPlaceholderEmail('student@gmail.com'));
  check('null is not', !isPlaceholderEmail(null));
}

console.log('\nPasswords:');
{
  const pw = generatePassword();
  check('default length is 8', pw.length === 8, pw);
  check('honours an explicit length', generatePassword(12).length === 12);
  check('no ambiguous characters', !/[0O1lI]/.test(Array.from({ length: 200 }, () => generatePassword()).join('')));
  const many = new Set(Array.from({ length: 200 }, () => generatePassword()));
  check('200 draws are all distinct', many.size === 200, String(many.size));
}

console.log('\nLogin codes:');
{
  const code = makeLoginCode('D4');
  check('carries the subgroup prefix', /^D4-\d{5}$/.test(code), code);
  check('falls back with no subgroup', /^S-\d{5}$/.test(makeLoginCode('')), makeLoginCode(''));
  check('key uppercases', loginCodeKeyFor('d4-01234') === 'D4-01234');
  check('key normalises an en dash', loginCodeKeyFor('D4\u201301234') === 'D4-01234');
  check('recognises its own output', looksLikeLoginCode(code), code);
  check('recognises lowercase input', looksLikeLoginCode('d4-01234'));
  // The load-bearing one: /api/login only reaches the nameKey query when this
  // returns false, so an Arabic name matching here would be unrecoverable.
  check('an Arabic name is not a code', !looksLikeLoginCode('احمد علي'));
  check('a latin name is not a code', !looksLikeLoginCode('Ahmed Ali'));
  check('an email is not a code', !looksLikeLoginCode('a@b.com'));
  check('empty is not a code', !looksLikeLoginCode(''));
}

console.log('\nCSV parsing:');
{
  const p = parseCsv('name,group\nاحمد علي,D4\nفاطمة حسن,A1');
  check('detects the header', p.hasHeader);
  check('excludes the header from rows', p.rows.length === 2, String(p.rows.length));
  const c = resolveRosterColumns(p);
  check('maps name and group', c.name === 0 && c.group === 1, JSON.stringify(c));
  check('absent columns are -1', c.email === -1 && c.password === -1 && c.examCode === -1);
  check('reads a cell', cell(p.rows[0], c.name) === 'احمد علي');
}
{
  const p = parseCsv('\uFEFFname,group\nاحمد,D4');
  check('BOM does not corrupt the first header', resolveRosterColumns(p).name === 0,
    JSON.stringify(p.headers));
}
{
  const p = parseCsv('name,group\r\nاحمد,D4\r\n');
  check('CRLF leaves no trailing \r', cell(p.rows[0], 1) === 'D4', JSON.stringify(p.rows[0]));
}
{
  const p = parseCsv('name,group\n"علي, احمد",D4');
  check('quoted comma stays one field', p.rows[0].length === 2, JSON.stringify(p.rows[0]));
  check('quotes are stripped', cell(p.rows[0], 0) === 'علي, احمد', JSON.stringify(p.rows[0]));
}
{
  const p = parseCsv('name,group\n"قال ""مرحبا"" علي",D4');
  check('doubled quote is a literal quote', cell(p.rows[0], 0) === 'قال "مرحبا" علي',
    JSON.stringify(p.rows[0]));
}
{
  const p = parseCsv('name\tgroup\nاحمد\tD4');
  check('falls back to tabs', p.hasHeader && cell(p.rows[0], 1) === 'D4', JSON.stringify(p.rows[0]));
}
{
  const p = parseCsv('احمد علي,a@b.com,secret,1023');
  check('no header keeps every row as data', !p.hasHeader && p.rows.length === 1);
  const c = resolveRosterColumns(p);
  check('falls back to the legacy positional order',
    cell(p.rows[0], c.name) === 'احمد علي' && cell(p.rows[0], c.email) === 'a@b.com' &&
    cell(p.rows[0], c.password) === 'secret' && cell(p.rows[0], c.examCode) === '1023');
}
{
  const p = parseCsv('الاسم,المجموعة,الرقم الامتحاني\nاحمد,D4,1023');
  const c = resolveRosterColumns(p);
  check('matches Arabic headers', c.name === 0 && c.group === 1 && c.examCode === 2,
    JSON.stringify(c));
}
{
  // "code" is an examCode alias and would otherwise also claim a group column.
  const p = parseCsv('name,group code\nاحمد,D4');
  const c = resolveRosterColumns(p);
  check('group wins over examCode on a shared alias', c.group === 1 && c.examCode === -1,
    JSON.stringify(c));
}
{
  const p = parseCsv('');
  check('empty text yields no rows', p.rows.length === 0 && !p.hasHeader);
}
{
  const p = parseCsv('name,group\nاحمد');
  check('a short row does not throw', cell(p.rows[0], 1) === '', JSON.stringify(p.rows[0]));
}

console.log('\nSpreadsheet matrices:');
{
  // What SheetJS hands back for a normal .xlsx roster.
  const p = matrixToParsed([['name', 'group'], ['احمد علي', 'D4'], ['فاطمة حسن', 'A1']]);
  const c = resolveRosterColumns(p);
  check('detects the header in a matrix', p.hasHeader);
  check('keeps only the data rows', p.rows.length === 2, String(p.rows.length));
  check('maps the columns', c.name === 0 && c.group === 1, JSON.stringify(c));
  check('reads a cell', cell(p.rows[0], c.name) === 'احمد علي');
}
{
  const p = matrixToParsed([['احمد علي', 'D4'], ['فاطمة حسن', 'A1']]);
  check('a headerless matrix keeps every row', !p.hasHeader && p.rows.length === 2);
}
{
  // SheetJS stops each row at its last populated cell, so rows arrive ragged.
  const p = matrixToParsed([['name', 'group', 'examCode'], ['احمد علي']]);
  check('a ragged row does not throw', cell(p.rows[0], 2) === '', JSON.stringify(p.rows[0]));
}
{
  // Blank rows in the middle of a sheet are extremely common.
  const p = matrixToParsed([['name', 'group'], ['', ''], ['احمد علي', 'D4'], [' ', '']]);
  check('blank rows are dropped', p.rows.length === 1, String(p.rows.length));
}
{
  // raw:false should stringify, but a numeric cell must survive either way -
  // an exam code arriving as 1023 would break every downstream .trim().
  const p = matrixToParsed([['name', 'examCode'], ['احمد', 1023 as any]]);
  const c = resolveRosterColumns(p);
  check('numeric cells become strings', cell(p.rows[0], c.examCode) === '1023',
    JSON.stringify(p.rows[0]));
}
{
  const p = matrixToParsed([['name', 'group'], ['  احمد علي  ', ' D4 ']]);
  check('cells are trimmed', cell(p.rows[0], 0) === 'احمد علي' && cell(p.rows[0], 1) === 'D4');
}
{
  check('an empty matrix yields nothing', matrixToParsed([]).rows.length === 0);
  check('a matrix of blanks yields nothing', matrixToParsed([['', '']]).rows.length === 0);
}
{
  // The reason matrixToParsed exists: both formats must resolve identically.
  const viaCsv = resolveRosterColumns(parseCsv('name,group,examCode\nاحمد,D4,1023'));
  const viaSheet = resolveRosterColumns(
    matrixToParsed([['name', 'group', 'examCode'], ['احمد', 'D4', '1023']]));
  check('csv and sheet resolve to the same columns',
    JSON.stringify(viaCsv) === JSON.stringify(viaSheet),
    JSON.stringify([viaCsv, viaSheet]));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

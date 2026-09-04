/**
 * CSV parsing for the roster importers, shared by the admin UI and the scripts.
 *
 * Replaces a `split('\n')` / `split(',')` pair that had four bugs an Arabic
 * roster reaches immediately:
 *
 *   - no quoted-field support, so one name containing a comma shifted every
 *     column on that row
 *   - no \r stripping, so a CRLF file left "\r" glued to the last field
 *   - no BOM stripping, so Excel's UTF-8 BOM corrupted the first name
 *   - header detection was `row[0].includes('name')` against the whole line
 *
 * Header matching is alias-based and order-independent, the same approach
 * scripts/importRoster.ts already uses against XLSX sheets.
 */

/** Header aliases, matched case-insensitively as substrings. */
export const NAME_KEYS = ['name', 'student', 'fullname', 'الاسم', 'اسم', 'الطالب', 'طالب'];
export const EMAIL_KEYS = ['email', 'e-mail', 'mail', 'ايميل', 'إيميل', 'البريد', 'بريد'];
export const GROUP_KEYS = ['subgroup', 'group', 'section', 'class',
                           'الشعبة', 'شعبة', 'المجموعة', 'مجموعة', 'الجروب', 'جروب', 'القسم'];
export const PASSWORD_KEYS = ['password', 'pass', 'pwd', 'كلمة المرور', 'كلمه المرور', 'الرمز السري', 'باسورد'];
export const EXAM_KEYS = ['examcode', 'exam_code', 'exam code', 'code',
                          'الرقم الامتحاني', 'الرقم الامتحانى', 'رقم امتحاني', 'الكود', 'كود'];

/**
 * Splits one line on `delimiter`, honouring double-quoted fields.
 *
 * "" inside a quoted field is a literal quote, per RFC 4180 - which is how
 * Excel writes a name that itself contains a quote.
 */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(field.trim());
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

export interface ParsedCsv {
  /** Lowercased header cells, or [] when the file has no recognisable header. */
  headers: string[];
  /** Data rows only - the header row is not included when one was detected. */
  rows: string[][];
  hasHeader: boolean;
}

/**
 * Detects a header row in an already-split grid and splits it off.
 *
 * Separate from parseCsv so a spreadsheet takes the identical path: xlsx
 * arrives from SheetJS as a matrix of cells with no text to parse, and the
 * column-alias logic must not be duplicated per format - a header alias added
 * for one format and not the other is a bug nobody notices until an import
 * silently maps the wrong column.
 */
export function matrixToParsed(matrix: string[][]): ParsedCsv {
  const rows = matrix
    .map(r => r.map(c => (c == null ? '' : String(c)).trim()))
    .filter(r => r.some(c => c !== ''));
  if (rows.length === 0) return { headers: [], rows: [], hasHeader: false };

  // A header row is one where at least one cell matches a known alias. Testing
  // the cells rather than the raw line stops a student actually called "Name"
  // from eating the first data row.
  const ALL_KEYS = [...NAME_KEYS, ...EMAIL_KEYS, ...GROUP_KEYS, ...PASSWORD_KEYS, ...EXAM_KEYS];
  const first = rows[0].map(c => c.toLowerCase());
  const hasHeader = first.some(cell => cell !== '' && ALL_KEYS.some(k => cell.includes(k.toLowerCase())));

  return {
    headers: hasHeader ? first : [],
    rows: hasHeader ? rows.slice(1) : rows,
    hasHeader,
  };
}

/**
 * Parses CSV (or TSV) text.
 *
 * The delimiter is chosen per file: comma unless the first non-empty line
 * yields a single field and does contain tabs. The exam-code importer already
 * needed that fallback because people paste columns straight out of Excel.
 */
export function parseCsv(text: string): ParsedCsv {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = cleaned.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [], hasHeader: false };

  const delimiter = splitLine(lines[0], ',').length === 1 && lines[0].includes('\t') ? '\t' : ',';
  return matrixToParsed(lines.map(l => splitLine(l, delimiter)));
}

/** Index of the first header matching any alias, or -1. */
export function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex(h => aliases.some(a => h.includes(a.toLowerCase())));
}

/**
 * Resolves the five roster columns to indices.
 *
 * With no header row we fall back to the legacy positional order the old
 * importer documented - name, email, password, examCode - so a file written
 * against the previous instructions still imports. `group` has no positional
 * slot because it never had one.
 */
export function resolveRosterColumns(parsed: ParsedCsv) {
  if (!parsed.hasHeader) {
    return { name: 0, email: 1, password: 2, group: -1, examCode: 3 };
  }
  const h = parsed.headers;
  return {
    name: findColumn(h, NAME_KEYS),
    email: findColumn(h, EMAIL_KEYS),
    password: findColumn(h, PASSWORD_KEYS),
    group: findColumn(h, GROUP_KEYS),
    // "code" appears in EXAM_KEYS and would also match a "group code" header,
    // so never let examCode resolve to the column group already claimed.
    examCode: (() => {
      const g = findColumn(h, GROUP_KEYS);
      const e = findColumn(h, EXAM_KEYS);
      return e === g ? -1 : e;
    })(),
  };
}

/** Safe cell read - a short row simply has no value for that column. */
export function cell(row: string[], index: number): string {
  return index >= 0 && index < row.length ? (row[index] || '').trim() : '';
}

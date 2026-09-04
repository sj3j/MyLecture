import * as XLSX from 'xlsx';
import { ParsedCsv, matrixToParsed, parseCsv } from '../../shared/csv';

/**
 * Reading a roster the department actually hands out.
 *
 * The file is almost always .xlsx - the CSV-only importer meant every rep had
 * to re-save it first, and a re-save is exactly where the encoding and quoting
 * damage that broke the old parser came from.
 *
 * xlsx costs nothing to use here: it is already in the bundle, statically
 * imported by src/services/gradeFileParser.ts through the non-lazy admin
 * grades screen.
 */

const SPREADSHEET_RE = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;

export const isSpreadsheet = (file: File): boolean => SPREADSHEET_RE.test(file.name);

/**
 * The first sheet, as a grid of trimmed strings.
 *
 * `header: 1` gives positional rows rather than objects keyed by the header,
 * which is what lets matrixToParsed run the same alias detection it runs for
 * CSV. `raw: false` renders every cell through the formatter, so an exam code
 * stored as a number arrives as "1023" and not 1023 - shared/csv.ts and the
 * importer both work in strings.
 *
 * `defval: ''` keeps blank cells as columns instead of collapsing them, which
 * would shift every value after a gap onto the wrong header.
 */
export async function readSheetMatrix(file: File): Promise<string[][]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });

  // Rows come back ragged - SheetJS stops each one at its last populated cell,
  // so a row whose trailing column is empty is short rather than padded, and a
  // positional read of that column would fall off the end.
  const width = rows.reduce((max, r) => Math.max(max, r?.length || 0), 0);
  return rows.map(r =>
    Array.from({ length: width }, (_, i) => {
      const cell = r?.[i];
      return cell == null ? '' : String(cell).trim();
    }),
  );
}

/** Parses either format into the one shape resolveRosterColumns understands. */
export async function readRosterFile(file: File): Promise<ParsedCsv> {
  return isSpreadsheet(file)
    ? matrixToParsed(await readSheetMatrix(file))
    : parseCsv(await file.text());
}

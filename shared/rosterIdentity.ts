/**
 * Identity for roster students, shared by the app, both API surfaces and the
 * import scripts.
 *
 * Everything here exists because `students/{docId}` uses the email AS the
 * document id, and that same string is the custom-token uid and the `email`
 * claim inside it (server.ts /api/login, firestore.rules isWhitelisted()).
 * Nothing in that chain needs a real mailbox - only an email-SHAPED, lowercase,
 * stable id. So a student imported with no email gets a synthetic one from
 * newRosterDocId() and every existing rule, token and lookup keeps working.
 *
 * The corollary: that id can never be renamed. Linking a Gmail later adds a
 * `googleEmail` FIELD; moving the document would orphan the auth identity, the
 * users doc and every allowed_admins reference at once.
 *
 * normalizeName() must stay byte-identical between the importer (which writes
 * `nameKey`) and /api/login (which queries it), which is the whole reason this
 * lives in shared/ rather than in either one. Declared with no imports so
 * shared/ never depends on src/ - same rule as shared/groups.ts.
 */

/** Domain for synthetic ids. Not a real mailbox; never send anything to it. */
export const ROSTER_EMAIL_DOMAIN = 'roster.mylecture.local';

/**
 * Arabic-insensitive name folding: strips diacritics and tatweel, unifies the
 * hamza/ta-marbuta/alef-maqsura spellings people disagree about, collapses
 * whitespace. "أحمد عليّ" and "احمد علي" fold to the same key.
 *
 * Lifted verbatim from the exam-code CSV matcher in StudentManagement, which
 * now imports it from here - two copies would silently drift and break login
 * for exactly the students whose names are spelled inconsistently.
 */
export function normalizeName(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/[\u064B-\u065F\u0670\u200C\u200D]/g, '')
    .replace(/[أإآء]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The value stored as `students.nameKey` and queried by name login. */
export function nameKeyFor(raw?: string | null): string {
  return normalizeName(raw);
}

function randomBytes(count: number): Uint8Array {
  const out = new Uint8Array(count);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/**
 * Picks `length` characters uniformly from `alphabet`.
 *
 * Rejection sampling rather than `% alphabet.length`: modulo over 256 biases
 * the first (256 % n) characters upward, which for a 57-character alphabet is a
 * measurable skew across a few hundred generated passwords.
 */
function randomFrom(alphabet: string, length: number): string {
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Password alphabet with every visually ambiguous character removed - no
 * 0/O/o, 1/l/I. These are read off a printed sheet and typed by hand on a
 * phone, so a character nobody can transcribe costs a support message.
 */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A generated first-time password. Always paired with mustChangePassword. */
export function generatePassword(length = 8): string {
  return randomFrom(PASSWORD_ALPHABET, length);
}

/**
 * A fresh synthetic document id for a student with no email.
 *
 * Deliberately random rather than derived from the name: deriving it would mean
 * hashing inside shared/, and WebCrypto is async while node:crypto is sync, so
 * there is no one implementation both callers can use. Re-import dedupe is done
 * by looking `nameKey` up against the existing roster instead, which is a
 * lookup the importer already has to do anyway.
 */
export function newRosterDocId(): string {
  const hex = Array.from(randomBytes(8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex}@${ROSTER_EMAIL_DOMAIN}`;
}

/** True for an id minted by newRosterDocId() - i.e. not a real address. */
export function isPlaceholderEmail(value?: string | null): boolean {
  return !!value && value.toLowerCase().endsWith(`@${ROSTER_EMAIL_DOMAIN}`);
}

/**
 * Short, typeable login code: "D4-01234".
 *
 * The fallback for students who cannot type their own long Arabic name into a
 * phone keyboard, and the disambiguator when two of them share a name. Five
 * digits because the login query is collection-wide (a code minted for one
 * stage is still queried against every stage), and a colliding pair is resolved
 * by the password check the same way a duplicate name is.
 */
export function makeLoginCode(subgroup?: string | null): string {
  const prefix = (subgroup || 'S').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'S';
  return `${prefix}-${randomFrom('0123456789', 5)}`;
}

/** Canonical form for storage in `loginCodeKey` and for the equality query. */
export function loginCodeKeyFor(raw?: string | null): string {
  return (raw || '').trim().toUpperCase().replace(/[\s\u2010-\u2015_]+/g, '-');
}

/**
 * Does this look like a login code rather than a name?
 *
 * Only used to pick which lookup /api/login tries first. No Arabic name can
 * match it (the shape is ASCII letters, then a dash, then digits), so a false
 * positive is not reachable for the roster this exists to serve.
 */
export function looksLikeLoginCode(raw?: string | null): boolean {
  return /^[A-Z]{1,3}\d{0,3}-\d{3,8}$/.test(loginCodeKeyFor(raw));
}

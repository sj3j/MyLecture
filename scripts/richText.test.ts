/**
 * Verifies the announcement rich-text codec.
 *
 * Run with:  npm run test:richtext
 *
 * Pure functions only - no editor, no DOM. What this pins down is the boundary
 * between ProseMirror's nested mark JSON and the flat text+offsets shape that
 * actually reaches Firestore. Two things make that boundary worth testing:
 *
 *   - Offsets are UTF-16 code units, so an emoji is 2 and an Arabic letter is 1.
 *     Getting this wrong misplaces every mark after the first emoji, and does so
 *     only for the posts that contain one.
 *   - blocksToDoc(docToBlocks(x)) must be a fixed point. Editing an existing
 *     post loads it back through the codec, so any asymmetry compounds on every
 *     edit rather than showing up once.
 */
import {
  docToBlocks,
  blocksToDoc,
  blocksToPlainText,
  plainTextToBlocks,
  isBlocksEmpty,
  safeUrl,
} from '../src/lib/richText';
import type { RichBlock } from '../src/types/announcement.types';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { console.log(`  PASS  ${name}`); passed++; }
  else { console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); failed++; }
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const text = (t: string, marks?: any[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const para = (...content: any[]) => ({ type: 'paragraph', content });
const doc = (...content: any[]) => ({ type: 'doc', content });

console.log('\nSerialization:');

check('plain paragraph',
  eq(docToBlocks(doc(para(text('مرحبا')))), [{ type: 'p', text: 'مرحبا' }]));

check('bold becomes an entity',
  eq(docToBlocks(doc(para(text('a'), text('bc', [{ type: 'bold' }])))),
     [{ type: 'p', text: 'abc', entities: [{ type: 'bold', offset: 1, length: 2 }] }]));

check('adjacent identical marks coalesce into one entity',
  eq(docToBlocks(doc(para(text('ab', [{ type: 'bold' }]), text('cd', [{ type: 'bold' }])))),
     [{ type: 'p', text: 'abcd', entities: [{ type: 'bold', offset: 0, length: 4 }] }]));

check('overlapping marks both survive',
  eq(docToBlocks(doc(para(text('x', [{ type: 'bold' }, { type: 'italic' }])))),
     [{ type: 'p', text: 'x', entities: [
       { type: 'bold', offset: 0, length: 1 },
       { type: 'italic', offset: 0, length: 1 },
     ] }]));

check('heading maps to h',
  eq(docToBlocks(doc({ type: 'heading', attrs: { level: 3 }, content: [text('عنوان')] })),
     [{ type: 'h', text: 'عنوان' }]));

check('hardBreak becomes a newline inside one block',
  eq(docToBlocks(doc(para(text('a'), { type: 'hardBreak' }, text('b')))),
     [{ type: 'p', text: 'a\nb' }]));

check('empty doc yields no blocks', eq(docToBlocks(doc(para())), []));
check('null doc yields no blocks', eq(docToBlocks(null), []));

check('lists are dropped rather than mangled',
  eq(docToBlocks(doc({ type: 'bulletList', content: [para(text('x'))] })), []));

console.log('\nOffsets are UTF-16 code units:');

check('an emoji counts as 2',
  eq(docToBlocks(doc(para(text('😀'), text('ب', [{ type: 'bold' }])))),
     [{ type: 'p', text: '😀ب', entities: [{ type: 'bold', offset: 2, length: 1 }] }]));

check('Arabic letters count as 1 each',
  eq(docToBlocks(doc(para(text('مرحبا'), text('X', [{ type: 'bold' }])))),
     [{ type: 'p', text: 'مرحباX', entities: [{ type: 'bold', offset: 5, length: 1 }] }]));

console.log('\nLink safety:');

check('http passes', safeUrl('http://a.com') === 'http://a.com/');
check('bare host is assumed https', safeUrl('a.com/x') === 'https://a.com/x');
check('mailto passes', safeUrl('mailto:a@b.com') === 'mailto:a@b.com');
check('javascript: is rejected', safeUrl('javascript:alert(1)') === null);
check('data: is rejected', safeUrl('data:text/html,<script>') === null);
check('vbscript: is rejected', safeUrl('vbscript:msgbox') === null);
check('whitespace-padded javascript: is rejected', safeUrl('  javascript:alert(1)  ') === null);
check('empty is rejected', safeUrl('') === null);

check('a link mark with an unsafe href is dropped, text kept',
  eq(docToBlocks(doc(para(text('click', [{ type: 'link', attrs: { href: 'javascript:x' } }])))),
     [{ type: 'p', text: 'click' }]));

check('a safe link mark is kept as a url entity',
  eq(docToBlocks(doc(para(text('go', [{ type: 'link', attrs: { href: 'https://a.com' } }])))),
     [{ type: 'p', text: 'go', entities: [{ type: 'link', offset: 0, length: 2, url: 'https://a.com/' }] }]));

console.log('\nRound trip is a fixed point:');

const roundTrips = (label: string, blocks: RichBlock[]) =>
  check(label, eq(docToBlocks(blocksToDoc(blocks) as any), blocks),
        JSON.stringify(docToBlocks(blocksToDoc(blocks) as any)));

roundTrips('plain', [{ type: 'p', text: 'hello' }]);
roundTrips('bold in the middle',
  [{ type: 'p', text: 'abcde', entities: [{ type: 'bold', offset: 1, length: 3 }] }]);
roundTrips('two marks, partially overlapping',
  [{ type: 'p', text: 'abcdef', entities: [
    { type: 'bold', offset: 0, length: 3 },
    { type: 'italic', offset: 2, length: 3 },
  ] }]);
roundTrips('link', [{ type: 'p', text: 'go here', entities: [{ type: 'link', offset: 3, length: 4, url: 'https://a.com/' }] }]);
roundTrips('heading plus paragraph', [{ type: 'h', text: 'عنوان' }, { type: 'p', text: 'نص' }]);
roundTrips('newline inside a block', [{ type: 'p', text: 'a\nb' }]);
roundTrips('emoji before a mark',
  [{ type: 'p', text: '😀ب', entities: [{ type: 'bold', offset: 2, length: 1 }] }]);
roundTrips('mixed Arabic and Latin with a mark on the Latin run',
  [{ type: 'p', text: 'الرابط هو Google', entities: [{ type: 'bold', offset: 10, length: 6 }] }]);
roundTrips('all six marks at once',
  [{ type: 'p', text: 'xyz', entities: [
    { type: 'bold', offset: 0, length: 3 },
    { type: 'code', offset: 0, length: 3 },
    { type: 'italic', offset: 0, length: 3 },
    { type: 'link', offset: 0, length: 3, url: 'https://a.com/' },
    { type: 'strike', offset: 0, length: 3 },
    { type: 'underline', offset: 0, length: 3 },
  ] }]);

console.log('\nPlain-text bridge:');

check('blocks join with newlines',
  blocksToPlainText([{ type: 'h', text: 'عنوان' }, { type: 'p', text: 'نص' }]) === 'عنوان\nنص');
check('plain text becomes one block per line',
  eq(plainTextToBlocks('a\nb'), [{ type: 'p', text: 'a' }, { type: 'p', text: 'b' }]));
check('legacy post round-trips through the editor unchanged',
  eq(docToBlocks(blocksToDoc(plainTextToBlocks('سطر أول\nسطر ثان')) as any),
     [{ type: 'p', text: 'سطر أول' }, { type: 'p', text: 'سطر ثان' }]));
check('empty detection', isBlocksEmpty([{ type: 'p', text: '   ' }]) && !isBlocksEmpty([{ type: 'p', text: 'x' }]));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

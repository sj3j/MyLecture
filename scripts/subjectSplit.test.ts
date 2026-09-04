/**
 * Verifies the combined-subject splitter.
 *
 * Run with:  npm run test:subjects
 *
 * Pure functions only - no Firestore. What this pins down is which subject names
 * get torn in two: the curriculum contains both real compounds ("Physiology I +
 * Computer Science", two subjects sharing a timetable slot) and names that only
 * look like one ("Pharmaceutical and Cosmetic Preparations", one subject). A
 * false positive invents a subject the college does not teach and moves real
 * lectures into it, so the conjunction cases are tested explicitly.
 */
import {
  slugifySubject,
  splitSubjectName,
  isCombinedSubject,
  planSubjectSplit,
  plannedSubjectsFor,
  subjectDocId,
  validateSplit,
} from '../src/lib/subjectSplit';
import type { Subject } from '../src/types';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { console.log(`  PASS  ${name}`); passed++; }
  else { console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); failed++; }
};

const subject = (over: Partial<Subject>): Subject => ({
  id: 'x', stageId: 'stage_2', courseId: 'course_1',
  nameEn: 'X', nameAr: 'س', types: ['theoretical', 'practical'],
  order: 0, isActive: true,
  ...over,
});

console.log('Detection:');
check('splits on +', isCombinedSubject({ nameEn: 'Physiology I + Computer Science' }));
check('leaves a plain subject alone', !isCombinedSubject({ nameEn: 'Physical Pharmacy I' }));
check('"and" is not a separator',
  !isCombinedSubject({ nameEn: 'Pharmaceutical and Cosmetic Preparations' }));
check('a parenthesised gloss is not a separator',
  !isCombinedSubject({ nameEn: 'TDM (Therapeutic Drug Monitoring)' }));
check('an Arabic-only + does not split, since the parts would have no id',
  !isCombinedSubject({ nameEn: 'Physiology I' }));
check('a trailing + is not a split', !isCombinedSubject({ nameEn: 'Physiology I +' }));
check('three parts are three subjects',
  splitSubjectName('A + B + C').length === 3);

console.log('\nSlugs:');
check('matches the seed migration', slugifySubject('Physiology I') === 'physiology_i');
check('roman numerals stay distinct',
  slugifySubject('Physiology I') !== slugifySubject('Physiology II'));
check('punctuation collapses', slugifySubject('Organic Pharm. Chemistry I') === 'organic_pharm_chemistry_i');
check('doc id is stage-prefixed', subjectDocId('stage_2', 'physiology_i') === 'stage_2__physiology_i');

console.log('\nPlanning:');
{
  const parts = planSubjectSplit({
    nameEn: 'Physiology I + Computer Science',
    nameAr: 'علم وظائف الأعضاء ١ + الحاسوب',
  });
  check('yields both halves', parts.length === 2);
  check('pairs the languages positionally',
    parts[0].nameAr === 'علم وظائف الأعضاء ١' && parts[1].nameAr === 'الحاسوب',
    JSON.stringify(parts.map(p => p.nameAr)));
  check('ids come from the English half',
    parts[0].id === 'physiology_i' && parts[1].id === 'computer_science');
}
{
  // A representative who renamed only one language leaves the two out of step.
  // Zipping them anyway would label the computer-science subject "physiology".
  const parts = planSubjectSplit({ nameEn: 'A + B', nameAr: 'واحد' });
  check('a mismatched Arabic name falls back to English rather than mispairing',
    parts[0].nameAr === 'A' && parts[1].nameAr === 'B',
    JSON.stringify(parts.map(p => p.nameAr)));
}
{
  const parts = planSubjectSplit({ nameEn: 'A + B', nameAr: 'أ + ب' });
  const planned = plannedSubjectsFor(subject({ order: 1, courseId: 'course_2' }), parts);
  check('the first part keeps the original slot', planned[0].order === 1);
  check('later parts sort between it and the next subject',
    planned[1].order > 1 && planned[1].order < 2, String(planned[1].order));
  check('course and stage are inherited',
    planned.every(p => p.courseId === 'course_2' && p.stageId === 'stage_2'));
  check('parts are active', planned.every(p => p.isActive === true));
}

console.log('\nValidation:');
{
  const ok = planSubjectSplit({ nameEn: 'A + B', nameAr: 'أ + ب' });
  check('a clean split has no problems', validateSplit(ok, ['physiology_ii']).length === 0);
  check('a part colliding with an existing subject is refused',
    validateSplit(ok, ['a']).some(p => p.kind === 'collides'));
  check('two parts producing one id are refused',
    validateSplit(planSubjectSplit({ nameEn: 'A + a', nameAr: 'أ + ب' }), []).some(p => p.kind === 'duplicate-slug'));
  check('a part with no Latin characters is refused',
    validateSplit([{ id: '', nameEn: 'الحاسوب', nameAr: 'الحاسوب' }, ok[0]], []).some(p => p.kind === 'bad-slug'));
  check('a single part is not a split',
    validateSplit([ok[0]], []).some(p => p.kind === 'too-few'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

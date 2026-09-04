import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import 'dotenv/config';

// Splits `subjects` documents that hold more than one subject.
//
// scripts/migrateToStages.js transcribed the curriculum straight from the
// college timetable, and that timetable prints two subjects on one line when
// they share a slot:
//
//     Physiology I + Computer Science    /  علم وظائف الأعضاء ١ + الحاسوب
//     Baathist crimes + Arabic Language  /  جرائم حزب البعث + اللغة العربية
//
// Seeded verbatim, each pair got one card, one lecture folder and one progress
// bar, so neither half could be uploaded to or tracked on its own. The seed is
// fixed; this repairs databases that already ran it.
//
// The same repair is available in-app (المواد -> the split button on the row),
// which is the better route when content has to be divided between the halves,
// because it asks per lecture. This script exists for bulk cleanup across every
// stage at once.
//
// Credentials: pass a service account JSON path, or leave it out to use
// FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY from .env
// (the same vars server.ts authenticates with).
//
// Usage:
//   node scripts/splitCombinedSubjects.mjs                    # dry run, prints the plan
//   node scripts/splitCombinedSubjects.mjs --apply            # writes
//   node scripts/splitCombinedSubjects.mjs --apply --assign-first
//   node scripts/splitCombinedSubjects.mjs ./serviceAccount.json --apply
//
// Without --assign-first the script REFUSES to split a subject that owns
// lectures, records or question-bank entries: there is no way to tell from a
// title whether a lecture is the physiology half or the computer-science half,
// and a wrong guess files it under a subject nobody will look in. --assign-first
// accepts the crude answer (everything to the first part) when you intend to
// tidy up afterwards.

// Mirrors src/lib/subjectSplit.ts - keep the two in step. Only `+` splits;
// `and` / `و` do not, or "Pharmaceutical and Cosmetic Preparations" would be
// torn into two subjects the college does not teach.
const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const splitName = (name) =>
  (name || '').split('+').map(part => part.trim()).filter(Boolean);

const planParts = (subject) => {
  const enParts = splitName(subject.nameEn);
  const arParts = splitName(subject.nameAr);
  const aligned = arParts.length === enParts.length;
  return enParts.map((nameEn, i) => ({
    id: slugify(nameEn),
    nameEn,
    nameAr: (aligned ? arParts[i] : '') || nameEn,
  }));
};

/** Collections whose documents point at a subject by slug. */
const CONTENT_COLLECTIONS = ['lectures', 'records'];

const BATCH_LIMIT = 450;

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const positional = args.filter(a => !a.startsWith('--'));
  return {
    serviceAccountPath: positional[0] || null,
    apply: flags.has('--apply'),
    assignFirst: flags.has('--assign-first'),
  };
}

function credentialFor(serviceAccountPath) {
  if (serviceAccountPath) {
    return cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8')));
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.error('No service account path given and .env is missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.');
    process.exit(1);
  }
  console.log(`Authenticating as ${FIREBASE_CLIENT_EMAIL} (project ${FIREBASE_PROJECT_ID}).`);
  return cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });
}

/** Commits `ops` in order, in chunks Firestore will accept. */
async function commit(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_LIMIT).forEach(apply => apply(batch));
    await batch.commit();
  }
}

async function main() {
  const { serviceAccountPath, apply, assignFirst } = parseArgs();
  initializeApp({ credential: credentialFor(serviceAccountPath) });
  const db = getFirestore();

  console.log(apply ? '\nAPPLYING changes.\n' : '\nDRY RUN - nothing will be written. Re-run with --apply.\n');

  const subjectsSnap = await db.collection('subjects').get();
  const allSubjects = subjectsSnap.docs.map(d => ({ docId: d.id, ...d.data() }));

  const combined = allSubjects.filter(s =>
    s.isActive !== false && splitName(s.nameEn).length > 1);

  if (combined.length === 0) {
    console.log('No combined subjects found. Nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${combined.length} combined subject(s).\n`);

  let split = 0;
  let refused = 0;

  for (const subject of combined) {
    const label = `${subject.stageId} / ${subject.courseId} / ${subject.nameEn}`;
    console.log(`- ${label}`);

    const parts = planParts(subject);

    // A part whose slug already belongs to another subject in the same stage
    // would merge two curricula into one document, which is the failure this
    // whole script exists to undo.
    const stageIds = new Set(
      allSubjects.filter(s => s.stageId === subject.stageId && s.id !== subject.id).map(s => s.id));
    const bad = parts.filter(p => !p.id || stageIds.has(p.id));
    if (bad.length > 0) {
      console.log(`  REFUSED: ${bad.map(p => p.id || '(empty id)').join(', ')} already exists in ${subject.stageId}.`);
      refused++;
      continue;
    }

    // Everything currently filed under the combined subject.
    const owned = [];
    for (const name of CONTENT_COLLECTIONS) {
      const snap = await db.collection(name)
        .where('stageId', '==', subject.stageId)
        .where('subjectId', '==', subject.id)
        .get();
      snap.docs.forEach(d => owned.push({ collection: name, ref: d.ref, title: d.data().title || d.id }));
    }
    const bankSnap = await db.collection('questionBank')
      .where('scope', '==', 'subject')
      .where('subjectId', '==', subject.id)
      .get();
    bankSnap.docs.forEach(d => owned.push({ collection: 'questionBank', ref: d.ref, title: d.id }));

    if (owned.length > 0 && !assignFirst) {
      console.log(`  REFUSED: ${owned.length} item(s) are filed under it and cannot be divided automatically:`);
      owned.slice(0, 10).forEach(o => console.log(`    ${o.collection}: ${o.title}`));
      if (owned.length > 10) console.log(`    ... and ${owned.length - 10} more`);
      console.log('    Split it in-app (المواد -> split), which asks per item, or re-run with --assign-first.');
      refused++;
      continue;
    }

    parts.forEach((p, i) => console.log(`  -> [${i + 1}] ${p.nameEn} / ${p.nameAr}  (id: ${p.id})`));
    if (owned.length > 0) {
      console.log(`  ${owned.length} item(s) -> "${parts[0].nameEn}" (--assign-first)`);
    }

    // Users carrying this subject into the next year carry both halves: a
    // carry-over is recorded per subject, and the combined document was the only
    // subject either half ever had.
    const carriers = (await db.collection('users')
      .where('tahmeelSubjects', 'array-contains', subject.id)
      .get()).docs;
    if (carriers.length > 0) {
      console.log(`  ${carriers.length} user(s) carry it in tahmeelSubjects -> replaced with all ${parts.length} part ids`);
    }

    if (!apply) continue;

    // Ordered create -> move -> hide. Every prefix of that order is a state the
    // app renders correctly: the parts exist before anything points at them, and
    // the combined subject stays visible until the last item has left it.
    const ops = [];

    parts.forEach((part, i) => {
      ops.push(b => b.set(db.collection('subjects').doc(`${subject.stageId}__${part.id}`), {
        id: part.id,
        stageId: subject.stageId,
        courseId: subject.courseId,
        nameEn: part.nameEn,
        nameAr: part.nameAr,
        types: subject.types?.length ? subject.types : ['theoretical', 'practical'],
        // Fractional, so the parts land where the combined subject sat without
        // colliding with the subject that follows it.
        order: (subject.order ?? 0) + i / (parts.length + 1),
        isActive: true,
      }));
    });

    owned.forEach(item => {
      // subjectName is denormalised onto lectures and records so LectureCard can
      // label its badge without a lookup; it has to move with subjectId.
      ops.push(b => b.update(item.ref, item.collection === 'questionBank'
        ? { subjectId: parts[0].id }
        : { subjectId: parts[0].id, subjectName: parts[0].nameEn }));
    });

    carriers.forEach(userDoc => {
      const current = userDoc.data().tahmeelSubjects || [];
      const next = [
        ...current.filter(id => id !== subject.id),
        ...parts.map(p => p.id).filter(id => !current.includes(id)),
      ];
      ops.push(b => b.update(userDoc.ref, { tahmeelSubjects: next }));
    });

    // Hidden, not deleted: anything this script could not see (added between the
    // read and the write) still has a subject to belong to, and the row stays
    // recoverable from the same المواد screen.
    ops.push(b => b.update(db.collection('subjects').doc(subject.docId), { isActive: false }));

    await commit(db, ops);
    console.log('  done.');
    split++;
  }

  console.log('');
  if (apply) {
    console.log(`${split} subject(s) split` + (refused ? `, ${refused} refused (see above)` : '') + '.');
  } else {
    console.log(`${combined.length - refused} subject(s) would be split` + (refused ? `, ${refused} refused (see above)` : '') + '.');
    console.log('Re-run with --apply to write.');
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

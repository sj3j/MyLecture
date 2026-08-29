---
name: verify-firestore
description: Verify MyLecture's Firestore layer end to end - security rules, stage migration, promotion and progression logic, and composite-index drift. Use before deploying rules or indexes, after changing a query, or when asked to check the database layer.
disable-model-invocation: true
---

# Verify Firestore

Runs the full Firestore integrity chain for this repo. **User-invoked only** — the emulator
suites are slow (each boots `firebase-tools emulators:exec`) and should not fire on their own.

## Why this exists

The Firestore layer here has three gaps that nothing else catches:

1. `tsc --noEmit` type-checks queries but knows nothing about whether an **index** exists.
   A missing composite index throws `FAILED_PRECONDITION` at runtime, in production, for
   users — never at build time.
2. `firestore.rules` guards **38 top-level collections** and is entirely hand-maintained.
3. Stage isolation, promotion and season rollover each have their own suite, and they are
   easy to forget individually.

## The chain

Run in this order — cheapest and most informative first.

### 1. Index drift (fast, no emulator)

```bash
node scripts/checkIndexDrift.mjs --verbose
```

Scans `src/`, `api/`, `shared/`, `functions/` and `server.ts` for query shapes, works out
which need a composite index, and matches them against `firestore.indexes.json`.

A shape needs a composite index when it **sorts by one field while filtering on another**,
or sorts by more than one field. These do *not* need one, and the checker knows it:
equality-only filters (zigzag merge join), a range filter plus `orderBy` on that same field,
and a lone `orderBy`.

Exits 0 by default; pass `--strict` to fail a CI job.

> Advisory: regex-based, so it cannot see dynamically composed queries. Findings are leads —
> confirm against the real call site before adding an index.

### 2. Security rules

```bash
npm run test:rules
```

### 3. Data-shape and lifecycle suites

```bash
npm run test:migration     # stage backfill
npm run test:promotion     # stage promotion
npm run test:progression   # progression gating
npm run test:season        # season rollover / archiving
npm run test:calendar      # academic calendar (no emulator)
```

### 4. Typecheck

```bash
npm run lint               # tsc --noEmit
```

## Reporting

State clearly which steps passed, which failed, and which were skipped. If the emulator port
is busy or `firebase-tools` cannot start, say so — do **not** report a suite as passing when
it never ran.

## When a new index is needed

Add it to `firestore.indexes.json`, then deploy:

```bash
npx firebase-tools deploy --only firestore:indexes
```

Composite indexes take minutes to build on a populated collection. Deploy the index
**before** shipping the query that needs it, or the first user to hit that code path gets an
error.

## Related constraints

- Rules and indexes are **not** in the graphify graph — grep them directly.
- Query changes in `api/index.ts` usually need the same change in `server.ts`, and vice
  versa. See the dual-API note in `CLAUDE.md`.

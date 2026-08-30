# MyLecture

## Architecture: the dual API surface

`server.ts` (43 routes) is the **dev** server, run via `npm run dev` (tsx).
`api/index.ts` (29 routes) is what actually serves **production** — `vercel.json`
rewrites `/api/*` to it. The two have drifted by 14 routes.

**A change to one usually needs the same change to the other.** Always check both
before concluding a route does or does not exist.

## Knowledge graph

A Graphify code graph lives in `graphify-out/` (gitignored, regenerable) and is
mirrored as an Obsidian vault at:

    C:\Users\Laith\Documents\ObsidianVaults\MyLecture

Prefer `graphify query` / `explain` / `affected` over bulk-reading large files.

### What the graph does NOT contain

The graph is built from tree-sitter AST symbols: functions, types, imports, calls.
**String literals are not nodes.** Express route paths like `/api/admin/announcements`
do not appear in `graph.json` at all — verified, zero matches. For route-level
questions use grep on `server.ts` and `api/index.ts` directly; the graph cannot
answer them. The graph is for symbol-level structure: who calls what, what depends
on a type, which modules cluster together.

Firestore rules (`firestore.rules`, `storage.rules`) are also not indexed — Graphify
does not classify them as code.

### Hot files (bulk-read only when necessary)

| File | Lines |
| --- | --- |
| `src/components/ChatScreen.tsx` | 2543 |
| `server.ts` | 1922 |
| `src/components/StudentManagement.tsx` | 1450 |
| `api/index.ts` | 1159 |

### Architectural hubs

`Language` / `TRANSLATIONS` (`src/types.ts`) are the single most connected nodes
(70 and 33 edges) — i18n is woven through the whole component tree. `UserProfile`
(56), `db` (42) and `useStageContext()` (41) follow. `useStageContext()` has 20
direct callers, which matters for the in-flight stage-isolation work.

### Regenerate

```powershell
graphify update .                        # AST-only, no API cost
node scripts/graphifyToObsidian.mjs      # refresh the Obsidian vault
```

Communities are unnamed (`Community 0`-`Community 59`) because naming requires an
LLM call; the graph was built code-only and fully offline.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## In-app PDF reader

`src/components/pdf/` renders lecture PDFs inside the app with highlighting and
notes. Two decisions there are expensive to reverse, so they are recorded here.

**Anchoring** (`src/lib/pdfAnchor.ts` — pure, unit-tested via `npm run test:anchor`).
A highlight stores three redundant locators: canonical character offsets, a W3C
TextQuoteSelector (`exact`/`prefix`/`suffix`), and quads in **PDF user space**.
Resolution tries them in that order. Never store pixel coordinates — quads are
projected through the current viewport, which is what makes highlights survive
zoom and rotation. `canonicalizePage()` normalizes per item, never across items,
so an item's length cannot depend on its neighbours; changing it means bumping
`ANCHOR_ALGO`, which demotes existing anchors to the quote-repair path rather
than silently misplacing them. An annotation that cannot be located is marked
orphaned **in memory only** and surfaced in the notes drawer — never deleted.

**Storage is IndexedDB** (`src/lib/localDb.ts`, db `mylecture-local`), not
localStorage, and device-only — annotations never reach Firestore. localStorage
is one ~5MB origin-wide quota that `mcq_cache_${lectureId}` already fills
unboundedly, and `setItem` throws synchronously, so overflow would break MCQ
caching app-wide rather than merely failing to save a note.

**Downloaded PDF bytes moved into that same IndexedDB.** They cannot live in
CacheStorage: `vite.config.ts` sets `selfDestroying: mode === 'native'`, and that
worker's activate handler deletes *every* cache with no allowlist while
`registerSW.js` re-registers it on every page load — so offline downloads were
being wiped on each launch. IndexedDB is untouched by it.

The page wrapper, canvas and text layer are pinned `dir="ltr"`. The app shell is
RTL, and an inherited RTL direction changes bidi run splitting inside pdf.js's
absolutely-positioned spans, shifting `getClientRects()` and putting every
highlight in the wrong place.

## Known gap: React has no types here

`@types/react` and `@types/react-dom` are **not installed**, and React 19 ships
none of its own. `npm run lint` (`tsc --noEmit`) therefore checks the component
tree with no JSX types at all — props resolve to `any` and prop-type mistakes go
unreported. Adding the types would be correct but will surface a backlog of
pre-existing errors, so treat a green `lint` as weak evidence for `.tsx` changes.

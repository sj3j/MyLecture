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

## Subjects: the curriculum is not the timetable

`scripts/migrateToStages.js` seeds the `subjects` collection from the college
curriculum. The college's own timetable prints two subjects on one line when they
share a slot - `Physiology I + Computer Science`, `Baathist crimes + Arabic
Language` - and the first seed transcribed those lines verbatim. Each pair then
had one card, one lecture folder and one progress bar, so a physiology lecture and
a computer-science lecture landed in the same place and neither subject could be
tracked alone.

The seed is fixed. A database already seeded from it is repaired from المواد - a
flagged row warns, and its split button opens `SplitSubjectDialog`, which names
the parts and asks per lecture/recording which one it belongs to. That is the
only repair path; there is deliberately no standalone bulk script for this -
splitting is a judgment call about *where content goes*, not a mechanical
transform, and a one-shot admin-SDK script is exactly the kind of file this repo
avoids accumulating. A live-database fix instead runs the same client logic
directly (`src/lib/subjectSplit.ts`) against Firestore under admin credentials.

**Only `+` splits a name.** `and` / `و` do not: `Pharmaceutical and Cosmetic
Preparations` (المستحضرات الصيدلانية والتجميلية) is one subject whose name happens
to read as a conjunction, and splitting it would invent a subject the college does
not teach and move real lectures into it. The rule lives in `src/lib/subjectSplit.ts`
and is pinned by `npm run test:subjects`.

A split **hides** the combined document (`isActive: false`) rather than deleting
it. Content the splitter could not see would otherwise be left with a `subjectId`
pointing at nothing, which is invisible rather than merely misfiled.

## No app header

There is no `Navbar`. Search and the staff upload button live on the Study screen
they act on; theme, language, the notification inbox and the master admin's stage
picker live in Settings. Two consequences worth knowing before you add a screen:

* `App.tsx`'s root carries `paddingTop: env(safe-area-inset-top)` - the header
  used to absorb that inset. **Sticky offsets are measured from the viewport, not
  from that padded root**, so a `sticky top-0` header inside a screen has to say
  `top-[env(safe-area-inset-top)]` or it parks under the system clock.
* That root is also the **only** bottom clearance (`pb-[104px]`, the floating
  nav's real footprint). Screens used to add their own `pb-24`/`pb-28`/`pb-32` on
  top of it, which is what left a blank half-screen under the last card. Do not
  re-add one.

## Branding and app icons

Every launcher icon, notification icon, splash and web icon is **generated**, never
hand-edited. Two source files, both in `assets/`:

| Source | Used for | Keyed by |
| --- | --- | --- |
| `Normallogo.png` (2048², opaque white ground) | everything coloured | `extractMark()` |
| `TransparentBGlogo.png` (2048², alpha) | notification/badge stencils only | `trimToMark()` + `silhouette()` |

    npm run icons        # scripts/generate-app-icons.mjs

The two sources are not interchangeable, which is the thing to know before touching
this. `Normallogo.png` carries the book's inner outlines as **white ink**;
`TransparentBGlogo.png` had them removed along with the background, so they are
**holes**. Coloured icons need the ink (holes would show the plate through the
book). Stencils need the holes (Android discards colour and keeps only alpha, so
white ink flattens the mark into a featureless blob). Feeding either file to the
other path produces something that looks plausible at 512px and wrong at 24dp.

**The plate is `#FFFFFF`.** The mark is a light blue, so any blue plate has no
contrast — and `extractMark` leaves a faint pale fringe on the mark's anti-aliased
edge that composites back to the original artwork on white and reads as a halo on
anything darker. `@color/ic_launcher_background`, `@color/splashBackground` and
`capacitor.config.ts`'s SplashScreen background all agree on white; keep them that
way together.

For in-app UI use `/icons/logo-mark.png` (transparent). The `/icons/icon-*.png` set
bakes in the white launcher plate and reads as a white box inside the tinted
containers in `Navbar.tsx`, `LoginScreen.tsx` and `SignupScreen.tsx`.

`index.html` deliberately has **no** `<link rel="manifest">` — vite-plugin-pwa
injects one, and a browser honours the first it finds.

## Known gap: React has no types here

`@types/react` and `@types/react-dom` are **not installed**, and React 19 ships
none of its own. `npm run lint` (`tsc --noEmit`) therefore checks the component
tree with no JSX types at all — props resolve to `any` and prop-type mistakes go
unreported. Adding the types would be correct but will surface a backlog of
pre-existing errors, so treat a green `lint` as weak evidence for `.tsx` changes.

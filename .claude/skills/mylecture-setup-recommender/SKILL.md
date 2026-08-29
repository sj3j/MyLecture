---
name: mylecture-setup-recommender
description: Analyze the MyLecture codebase and recommend Claude Code automations (hooks, subagents, skills, plugins, MCP servers) that fit its actual architecture. Use when asked for automation recommendations, to optimize the Claude Code setup for this repo, or what Claude Code features this project should adopt.
tools: Read, Glob, Grep, Bash
---

# MyLecture Setup Recommender

Recommend Claude Code automations tailored to **this** repository — a pharmacy-education
lecture platform (Arabic/English) covering pharmacology, pharmacognosy, organic chemistry,
biochemistry and cosmetics.

Adapted from Anthropic's `claude-automation-recommender`. See `../ATTRIBUTION.md`.

**This skill is read-only.** It analyzes and outputs recommendations. It does NOT create
or modify files. Implement recommendations separately.

## Output Guidelines

- **Recommend 1-2 per category.** Surface the highest-value options, not a catalogue.
- **If asked for a specific type**, focus only on that type and give 3-5 options.
- **Skip categories that don't apply here.** Several upstream categories are dead in this
  repo (see Non-Applicable below) — do not pad the report with them.
- **End by noting** the user can ask for more in any category.

## Phase 1: Stack — already known, do not re-derive

Upstream spends Phase 1 sniffing `package.json` / `pyproject.toml` / `Cargo.toml` to guess
the stack. **Skip that.** This repo's stack is established fact:

| Layer | Reality |
| --- | --- |
| Frontend | React 19, TypeScript 5.8, Vite 6, Tailwind 4, `motion`, `lucide-react`, `fuse.js` |
| API | **Dual surface** — `server.ts` (dev, tsx) and `api/index.ts` (prod, via `vercel.json` rewrite) |
| Backend | Firebase: Firestore, Auth, Storage, FCM |
| Cloud Functions | 13 exports in `functions/index.js` (`sendMessage`, `telegramWebhookV3`, `expireSubscriptions`, `archiveOldMessages`, `onFirstAttemptComplete`, `syncRole`, `confirmDegreeBatch`, ...) |
| Native | Capacitor 7 Android, built via `android:apk` / `android:aab` |
| Offline | `vite-plugin-pwa` + Workbox 7, `registerType: 'autoUpdate'` (`vite.config.ts`) |
| Media/AI | AWS S3 SDK, `@google/genai` (MCQ generation), Telegraf (Telegram bot) |
| Typecheck | `npm run lint` is `tsc --noEmit`. There is no ESLint and no Prettier. |
| Tests | 6 npm scripts, most wrapped in `firebase-tools emulators:exec` |

Only investigate further if the question concerns something **not** in this table, and
prefer `graphify query` / `explain` / `affected` over bulk file reads.

### Scale facts that should drive recommendations

- **38 top-level Firestore collections** in `firestore.rules`, against only **10 composite
  indexes** across 9 collection groups in `firestore.indexes.json`.
- Hot files: `src/components/ChatScreen.tsx` (2543 lines), `server.ts` (1922),
  `src/components/StudentManagement.tsx` (1450), `api/index.ts` (1159).
- `Language` / `TRANSLATIONS` (`src/types.ts`) are the most connected symbols (70 / 33
  edges) — i18n threads through the whole component tree.

## Phase 1b: Hard constraints every recommendation must respect

These gates decide whether a recommendation is valid or worthless in this repo.

### 1. Dual-API drift is the top correctness risk

`server.ts` (43 routes) and `api/index.ts` (29 routes) have drifted by 14 routes. `server.ts`
is **dev only**; production traffic hits `api/index.ts`.

> Every route-touching recommendation MUST state explicitly whether it applies to
> `server.ts`, `api/index.ts`, or **both**. A recommendation that silently assumes one file
> is a defect, not a suggestion.

### 2. The `PreToolUse` slot is already occupied

`.claude/settings.json` routes `Bash|Grep` and `Read|Glob` through `graphify hook-guard`.

> Never recommend a `PreToolUse` hook matching `Bash`, `Grep`, `Read`, or `Glob` — it will
> collide with the graphify guard. Prefer `PostToolUse`, or a distinct matcher such as
> `Edit|Write`. Never recommend editing the existing hook entries.

### 3. The offline-to-APK chain is one pipeline, not two features

`vite.config.ts` (Workbox) to `npm run build:native` to `scripts/pruneNativeWebDir.mjs` to
`npx cap sync android` to `gradlew assembleRelease`.

> Anything touching `vite.config.ts` Workbox config, `public/manifest.json`, or
> `public/firebase-messaging-sw.js` must be evaluated against the whole chain. A cached
> asset change that looks fine on the web can ship a stale bundle inside the APK.

### 4. The payment-surface gate is release-blocking

`npm run android:aab` runs `scripts/assert-no-payment-surface.mjs` against the built Android
assets before bundling.

> Never recommend anything that would introduce payment UI, links, or strings into the
> native web bundle. This check keeps the store build compliant; breaking it blocks release.

### 5. No formatter, no linter

There is no Prettier and no ESLint config.

> Do not recommend "auto-format on edit" or "auto-lint on edit" hooks — upstream's two most
> common suggestions. The available equivalent is `tsc --noEmit` (`npm run lint`).

### 6. Firestore tests need an emulator

`test:rules`, `test:migration`, `test:season`, `test:promotion` and `test:progression` all
shell out to `firebase-tools emulators:exec`. They are slow and need a free port.

> Do not recommend a `PostToolUse` hook that runs these on every edit. Recommend them as an
> explicit command or a pre-push step instead.

## Phase 2: Generate Recommendations

### A. MCP Servers

| Signal in this repo | Server | Note |
| --- | --- | --- |
| Firestore, Auth, Storage, FCM, Functions | **Firebase MCP** | Already configured in this environment — verify before recommending |
| React 19 / Vite 6 / Capacitor 7 | **context7** | Live docs; React 19 and Tailwind 4 are recent enough that stale training data misleads |
| PWA vs APK parity bugs | **Playwright** | Verify offline and service-worker behaviour the emulator cannot show |
| GitHub repo | **GitHub MCP** | Only if the PR/issue workflow is actually used |

Do **not** recommend Supabase, Convex, Prisma or Postgres MCP servers. This project has no
relational database.

### B. Skills

| Signal | Skill to create | Invocation |
| --- | --- | --- |
| 38 collections vs 10 composite indexes | **verify-firestore** — chain the emulator test scripts plus an index-drift check | User-only |
| Dual API surface | **route-parity** — diff route tables between `server.ts` and `api/index.ts` | Both |
| Capacitor release flow | **ship-apk** — `android:sync`, payment-surface check, `assembleRelease` | User-only |
| i18n woven through `TRANSLATIONS` | **add-translation** — add a key to both languages, flag orphans | Both |

Mark anything with side effects (deploy, build, commit) `disable-model-invocation: true`.

### C. Hooks

| Signal | Hook | Why it survives the constraints |
| --- | --- | --- |
| `tsc --noEmit` is the only static gate | `PostToolUse` on `Edit\|Write` for `*.ts`/`*.tsx`, running typecheck | Matcher does not collide with graphify |
| `.env` present, `.env.example` tracked | `PreToolUse` on `Edit\|Write` to block `.env` edits | Distinct matcher; graphify guards read tools only |
| `firestore.indexes.json` and `firestore.rules` are hand-maintained | `PostToolUse` warning when a query file changes but indexes do not | Advisory and cheap |

### D. Subagents

| Signal | Subagent |
| --- | --- |
| Hand-rolled rules over 38 collections, plus auth and subscriptions | **security-reviewer** — but check first: `firebase:firebase-security-rules-auditor` already ships this and needs no setup |
| 2543-line `ChatScreen.tsx`, 1922-line `server.ts` | **refactor-scout** — decomposition proposals for hot files |
| Dual API surface | **route-parity-reviewer** — flag one-sided route changes in a diff |

### E. Plugins

Recommend sparingly. The environment already carries the `firebase:*` pack, `code-review`,
`simplify`, and `store-submission-prep` (directly relevant to the Capacitor release path).
**Check what is installed before recommending a bundle.**

## Non-Applicable — do not recommend

Upstream's reference tables include these; they are dead in this repo:

- Prisma / Supabase / Convex / Postgres / MySQL tooling — no relational database
- FastAPI / Django / Python backend automations — Python here is exactly one script,
  `scripts/sync_telegram.py`
- 3D / WebGL / three.js tooling — **no 3D code exists in this repo** (verified: zero matches
  for `three`, `babylon`, `webgl`, `gltf` outside the English word "three")
- Flutter / Dart tooling — this is Capacitor, not Flutter
- Prettier / ESLint hooks — neither is configured
- Jest / Vitest hooks — tests are plain `tsx` and `node` scripts under `scripts/`

## Phase 3: Output Report

Format the report like this, skipping any category with nothing worth saying:

    ## Claude Code Automation Recommendations — MyLecture

    ### Profile
    - Type: React 19 + TypeScript SPA on Vite 6, Express API on Vercel
    - Backend: Firebase (Firestore / Auth / Storage / FCM / 13 Functions)
    - Native: Capacitor 7 Android, Workbox offline bundle
    - Domain: pharmacy education

    ### MCP Servers
    #### [name]
    Why: [reason tied to a specific file or scale fact above]
    Install: claude mcp add [name]
    Already installed?: [check first]

    ### Skills
    #### [name]
    Why: [reason]
    Create: .claude/skills/[name]/SKILL.md
    Invocation: User-only / Both / Claude-only
    Dual-API impact: server.ts / api/index.ts / both / n-a

    ### Hooks
    #### [name]
    Why: [reason]
    Where: .claude/settings.json
    Graphify collision check: [confirm matcher is not Bash|Grep|Read|Glob]

    ### Subagents
    #### [name]
    Why: [reason]
    Where: .claude/agents/[name].md

    **Want more?** Ask for additional options in any category.

## Decision Framework

**Recommend an MCP server** when an external service needs live introspection — Firestore
data, browser behaviour, or fast-moving library docs.

**Recommend a skill** when a workflow is repeated and multi-step, especially the release
chain and the Firestore verification chain. Both are currently tribal knowledge spread
across `package.json` scripts.

**Recommend a hook** only when it is cheap, cannot collide with graphify's `PreToolUse`
entries, and does not invoke the Firestore emulator.

**Recommend a subagent** when the work is a specialized review that benefits from running in
parallel over the hot files.

**Recommend a plugin** only after confirming it is not already installed.

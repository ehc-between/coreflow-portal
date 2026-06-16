# Working in this repo

## ⛔ HARD SCOPE RULE — CoreFlow ONLY

This rule overrides everything else. Violating it is a critical failure.

**The Notion issue tracker is multi-project** — its `Project` field can be `CoreFlow`, `MasterEmployee`, `KappSailing`, `TieConnect`, `HorseLoop`, or `Net AS`. **YOU TOUCH ONLY `Project = CoreFlow`.**

This applies to:
- **Notion**: Never create, move, update properties on, archive, detach, or modify in any way a ticket whose `Project` is anything other than `CoreFlow`. Before mutating ANY Notion page, fetch it and verify `Project = CoreFlow`. If you can't verify, don't act.
- **Repositories**: Operate ONLY in `coreflow-portal` (this repo) and `coreflow-core` (`/Users/edwardstadheimcampbell/PycharmProjects/coreflow-core`). Never touch any other repo on the machine even if it's in `~/IdeaProjects/` or `~/PycharmProjects/`.

**If the user's instruction could be interpreted as touching another project — ASK BEFORE ACTING.** Phrases like "delete anything regarding X" or "clean up Y" never authorize cross-project changes. Restrict your action to CoreFlow scope and confirm if you're unsure.

This rule applies even if the user said "go ahead" earlier in the session, even if you previously batched something similar, even if it seems implied. Cross-project is never implied.

## Notion-first workflow (REQUIRED)

All work in this codebase is tracked in the **Notion Issue tracker** (project=CoreFlow). This is the source of truth — code happens here, status lives there. Never start substantive work without a Notion ticket.

- **Issue tracker URL**: https://www.notion.so/2eb52c1c826580128ae8c81d3fcabb3d
- **Data source ID**: `collection://2eb52c1c-8265-811f-b214-000b6b02f6c7`

### Receiving work

**User references an existing Notion ticket** (URL or title — both must work):
1. Fetch via `mcp__claude_ai_Notion__notion-fetch` (URL/page ID) or `mcp__claude_ai_Notion__notion-search` (title, scoped to the data source above).
2. Verify `Project = CoreFlow` before acting on it.
3. If the `Version` field is empty, **ASK the user** which version to assign — don't guess.
4. Read the body for context (root-cause hypothesis, scope notes, links).

**User gives instructions in chat (no Notion reference)**:
1. Create a Notion ticket first with `mcp__claude_ai_Notion__notion-create-pages` on the data source above. Required properties: `Project: CoreFlow`, `Issue Type` (Bug/Improvement/Feature/ToDo), `Platform` (["Portal"] / ["Backend"] / both), `Tags` as appropriate.
2. Ask the user for `Version` if not obvious from context.
3. Then begin work.

### Status flow (agent-owned)

You own these transitions via `mcp__claude_ai_Notion__notion-update-page` (`command: update_properties`, `properties: {"Status": "..."}`):
- `Not started` → `In Progress` the moment work begins.
- `In Progress` → `Completed` the moment code is committed / work item is finished.

You do **NOT** auto-transition into `QA` or `Deployed`. Those are user-triggered after sandbox / prod deploys.

Update status live, not in batch at the end — the board must reflect what's happening right now.

### Parallel dispatch

For tickets spanning multiple files, both repos, or multiple work items:
- Dispatch sub-agents in parallel in a single message (frontend + backend simultaneously, multiple non-conflicting frontend pieces at once).
- QA agents run after their corresponding engineer agents finish.
- Synthesise reports yourself — never paste raw sub-agent output at the user.

## Agent team — use them

This repo has six specialized agents defined in `.claude/agents/`:

- **frontend-engineer** — UI work (components, services, routing, i18n, templates).
- **backend-engineer** — server/API, data models, background tasks, migrations.
- **ai-expert** — LLM prompting, structured output, reliability.
- **data-analyst** — SQL, pandas, metric correctness, reconciliation.
- **backend-qa** — read-only review of backend changes.
- **frontend-qa** — read-only review of frontend changes.

### When to dispatch (judgment-based, not blind)

For any non-trivial task — anything spanning more than a single small file, anything that touches both frontend and backend, anything involving LLM prompts, or anything where numbers must be correct — decompose into roles and dispatch in parallel:

1. **Decompose first.** Before touching code, identify which role each piece of the work belongs to.
2. **Dispatch independent work in parallel.** Send one Agent tool call per role in a single message so they run concurrently. Engineers can run alongside the analyst; QA waits until engineers are done.
3. **QA pass before declaring done.** After the engineer agent(s) finish, dispatch the matching QA agent(s) (backend-qa for backend changes, frontend-qa for frontend changes) to review the diff. Fix anything blocking before reporting completion.
4. **Synthesise — don't delegate understanding.** When reading agent reports back, integrate them yourself; don't paste raw outputs at the user.

### When NOT to dispatch

Trivial single-file edits, typo fixes, copy changes, simple questions, status checks, or anything you can answer/fix in under ~3 tool calls — handle inline. Don't burn six agents on a one-liner.

## Project conventions

**Stack**: Angular 22 — standalone components, **zoneless** change detection (no
`zone.js`; do not add it), signals + new control flow (`@if`/`@for`). Styling is
**Tailwind CSS v4**. i18n is **Transloco**. Auth is **first-party email/password**
against `coreflow-core` (in-memory access token + httpOnly refresh cookie). State is
**signals in injectable services** (no NgRx). Error reporting is **Sentry**, gated on a DSN.

**Node**: requires **Node ≥ 24.15** (Angular 22 CLI). The machine default `node`
may be older — use nvm before any `ng`/`npm` command:
`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24`. Pinned in `.nvmrc`.

**Project structure** (`src/app/`):
- `core/` — singletons provided once: `config/` (`APP_CONFIG` token over the
  environment), `http/` (`ApiService` + `error.interceptor`), `auth/` (`AuthService`,
  `authInterceptor`, `authGuard`, `hasPermission` + `*appHasPermission`), `i18n/`
  (Transloco loader/providers, `LanguageService`), `monitoring/` (Sentry init +
  `reportError`), `notifications/` (`NotificationService`).
- `shared/` — reusable presentational components (e.g. `language-switcher`,
  `notifications`).
- `layout/` — the app shell (`main-layout`).
- `features/` — lazy-loaded feature areas, each with its own `*.routes.ts`
  (`loadChildren`). `features/auth/login` is a **public** route, outside the guarded shell.

**Auth**: first-party against `coreflow-core`. `AuthService` (signals) holds the access
token **in memory only** (never localStorage) and exposes `isAuthenticated`, `user`,
`permissions`, `orgs`. `authInterceptor` attaches the bearer **only to `apiBaseUrl`
requests** (assets/CDNs untouched) and, on a 401, runs a **single-flight** `refresh()`
(via the httpOnly cookie, `withCredentials`) then retries once; on failure it clears state
and routes to `/login`. `restoreSession()` runs at startup (silent refresh). Gate UI on
permissions via `*appHasPermission="'perm:key'"` or `hasPermission(perm, orgId?)` — keys
must match the backend's seeded permissions (`dashboard:view`, `users:read`, …).

**HTTP / service layer**: feature data services inject `core/http/ApiService`
(not `HttpClient` directly) — it prefixes `environment.apiBaseUrl` and routes through the
interceptors (bearer attach + refresh, then error handling). `error.interceptor` reports
5xx/network failures to Sentry and pushes neutral i18n-keyed messages via
`NotificationService` (401/403 are owned by `authInterceptor`). Request/response types
(DTOs) live in `core/models/`, `core/auth/auth.models.ts`, or alongside the feature service.

**i18n**: the app is multi-language with **runtime** switching. Translation files
are `src/assets/i18n/<lang>.json` (currently `en`, `nb`) and **MUST stay at full
key parity** — every key present in all languages with identical structure. Add a
key to every file or none. Reference keys via the `transloco` pipe; pass dynamic
values as params (`'auth.signedInAs' | transloco: { name }`), never via string
concatenation. Supported languages and default come from `environment.i18n`.

**Config / environments**: per-environment values live in
`src/environments/environment.ts` (production, default build) and
`environment.development.ts` (swapped in via `angular.json` fileReplacements).
Inject `APP_CONFIG` rather than importing `environment` directly. OIDC authority/
clientId and the Sentry DSN are **empty by default** — empty authority runs the
app in "open" mode (guard allows navigation); empty DSN disables Sentry entirely.

**Selected context / multi-tenancy**: not yet established. When a current
org/company/workspace concept is introduced, resolve it in a `core/` signal-based
service and document the resolution here.

**Build verification** (run before declaring done, with Node 24 active):
- `npm run lint` — ESLint (angular-eslint), must be clean.
- `npm test` — Vitest unit tests, must pass.
- `npm run build` — production build, must succeed with no errors.
- `npm run format` — Prettier (not enforced by lint; run to avoid drift).

## Things this codebase is sensitive about

- Don't mention vendor or model names (Claude, Anthropic, GPT) in user-facing strings — use neutral language like "Analysing data...".
- (Add CoreFlow-specific gotchas here as they emerge.)
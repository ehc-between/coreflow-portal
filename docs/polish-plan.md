# CoreFlow "polish and connect" plan

Status: written by the architect step on 2026-11-16, before any engineer starts. Base:
portal `31bf198`, core `9d3d744`.

Inputs:
- `cf-test/polish-audit/connectivity.md` (connectivity audit)
- `cf-test/polish-audit/assistant-eval-r1.md` (assistant evaluation, 81/146)
- `cf-test/polish-audit/design.md` (design-system and IA audit)
- the per-area UX screenshots under `cf-test/polish-audit/ux/<area>/`. The written reports were not ready when this plan was written. Each area item reads its own report when it starts.
- `docs/compliance-platform-scope.md` and `docs/platform-contracts.md`

Precedence: this file > `platform-contracts.md` where they disagree. The contracts still apply
otherwise, and so do the repo `CLAUDE.md` conventions: audit, soft delete, naive-UTC times,
thin routes, no vendor names, i18n parity, `provideSharedScope()` in `viewProviders`.

Contents

1. Diagnosis
2. Foundation items P1-P5 (contracts, ownership, order)
3. Module polish checklist (A01-A26)
4. Demo data expectations
5. Migration ids, branches, merge order
6. Decisions taken

---

## 1. Diagnosis (plain words)

The product owner is right: CoreFlow has everything a compliance platform needs, but the
parts do not talk to each other, and the screens do not explain themselves.

1. **"My documents and fields are not connected to the standards."** There are four separate
   ways a record can "relate to a standard". They look alike, but only one counts:
   - **Requirement links.** These are the only thing that counts toward readiness. In the demo only 8 records have one, so readiness is 0-3 % everywhere.
   - **Clause declarations.** Each record type declares which clauses it can prove. This is only used as a pick-list after you click "Koble".
   - **Form fields that name standards.** Examples: risk controls, audit clauses, deviation standards and the SoA. These hold real data, but it is never counted. ISO 27001 A.8.13 is cited by two risks, an audit plan and an SoA row, yet its page says "Ikke startet 0 %".
   - **"Hvorfor dette er viktig" chips.** These are static teaching links that look exactly like evidence.

   A user sees clause pills everywhere and evidence nowhere.
2. **Things only connect in one direction, and some screens are dead ends.**
   - The requirement page can only pick and open documents and deviations.
   - The document page has no "Relatert" panel.
   - Evidence from any other module shows as plain, unclickable text.
   - Related items sit behind a tab with no count.
   - There are almost no "create from here" flows. Example: from a deviation you cannot create the risk it reveals.
3. **The assistant cannot see most of the data.**
   - It can only search by keyword, so "list all suppliers" finds nothing and it tells you the register is empty. It said this in 16 answers.
   - It cannot read requirement links or gaps.
   - It does not know today's date.
   - It does not link to the records it talks about.
   - Norwegian questions do worse, because Norwegian words do not match English record text.
4. **The pages are assembled differently in every module.**
   - There are 18 copy-pasted sub-navs, five header layouts and about 60 local status-colour functions. "High" is red in one module and amber in the next.
   - Nav labels differ from page titles on 14 of 28 modules.
   - Raw values reach users: 'policy', 'Nonconformity', '28.r2', '**markdown**', English catalogue titles in nb.
   - Mobile is unusable: a fixed 248 px nav and a 540 px search box.
   - There are many learning entry points, and each has its own name.
5. **There is no single answer to "how are we doing and what should I do next?"**
   - Three pages compete: the dashboard maturity, Reports' "Samsvarsoversikt" and Standards readiness.
   - None of them says which concrete step closes which gap.
   - A beginner who chooses ISO 27001 gets no path to follow.

The cure is not more features. CoreFlow needs **one connected model**, plus one way to show it on every page:

- **Requirements:** one record of "this record proves that requirement". Fields and declarations feed it, and everything reads from it.
- **Connections:** one model of "this record relates to that record". It includes structural relations, automatic links and suggestions, and it is visible on every record.
- **Assistant:** one set of generic tools that can list, count, get, explain and link anything.
- **Design:** one page anatomy and one vocabulary.

The foundation items P1-P5 build these. The area items A01-A26 then apply them module by module, using the checklist in section 3.

---

## 2. Foundation items

### 2.0 Ownership and order (read first)

| Item | Core files owned | Portal files owned | Migration |
|---|---|---|---|
| **P1** requirements-everywhere | `app/services/standards_service.py`, `frameworks.py`, `standard_jobs.py`, `requirement_assist_service.py`, `requirement_link_stats.py`, `standards_hooks.py`, `standards_catalog.py`, new `app/services/requirement_sync.py`, new `app/services/clause_refs.py`, `app/api/v1/routes/standards.py`, `app/platform/frameworks/**`, `app/ai/standards_mapping.py`, `app/ai/requirement_assist.py`, `app/models/standard.py`, `app/standards/catalog/**` (nb titles only) | `shared/requirement-links/**`, `features/standards/**`, `core/standards/**`, `shared/guidance/field-help.ts`, `shared/guidance/clause-chips.ts`, `shared/guidance/why-it-matters.ts`, `assets/i18n/standards/**` | `cf60_requirement_layer` |
| **P2** assistant-everything | `app/ai/**` (except the two P1 files above), `app/platform/search/**`, new `app/ai/howto/**`, `app/api/v1/routes/ai.py`, `app/api/v1/routes/actions.py` | `features/ask/**`, `features/command-palette/**`, `shared/ask/**`, `core/ai/**`, `core/search/**`, new `assets/i18n/ask/**`, `assets/i18n/search/**` | `cf61_assistant_v2` |
| **P3** design-system | none | `shared/ui/**`, `layout/**` (incl. `nav.ts`), `src/tailwind.css`, `src/styles.scss`, `src/index.html`, `app.config.ts`, `app.routes.ts` (titles + redirects only), global `assets/i18n/en.json` + `nb.json`, `shared/guidance/**` except P1's three files, `shared/language-switcher/**`, `shared/notifications/**`, `shared/locale/**`, `shared/kit/record-list-page.ts`, `shared/kit/record-detail-layout.ts`, `shared/kit/saved-views.service.ts`, `features/org-settings/**` (settings hub frame only), `docs/ux-guide.md` | none |
| **P4** connections | `app/platform/kit/**`, new `app/services/demo_connections.py` | `shared/kit/**` except P3's three files, `core/kit/**`, `core/entities/**`, `assets/i18n/kit/**` | `cf62_connections` |
| **P5** home-and-journeys | new `app/platform/journeys/**`, `app/platform/tasks/work.py` + the `/my-work` route in `tasks/routes.py` | `features/dashboard/**`, `features/my-work/**`, `features/review/**`, `features/org-modules/**`, `features/learning/**`, `features/account/learning*`, `assets/i18n/modules/**`, `assets/i18n/tasks/**`, new `assets/i18n/home/**`, `assets/guidance/*/platform.json` | `cf63_journeys` |

Shared kernel files. These are additive one-line edits, and the integrator unions them:
- `app/platform/registry.py`: each item adds only the hook constant and value dataclasses listed in its section. P1 adds `HOOK_REQUIREMENT_FIELDS` and `RequirementFieldSpec`. P2 adds `HOOK_ENTITY_QUERIES`, `EntityQuerySpec` and `ListFilters`. P4 adds `HOOK_LINK_RULES`, `HOOK_STRUCTURAL_RELATIONS`, `HOOK_CREATE_FLOWS` and their specs. P5 adds `HOOK_NEXT_ACTIONS` and `HOOK_JOURNEY_STEPS`.
- `app/cli.py`: P1 adds `sync-requirement-fields`. P4 adds `demo-connect`.
- `app/services/demo_seed.py` / `demo_platform.py`: only P4 edits them, to call `demo_connections.run()` last.

Module packages (`app/modules/<key>/**`, `features/<path>/**`, `assets/i18n/<path>/**`,
`assets/guidance/*/<path>.json`) are **not** touched by P1-P5. Exceptions:
- P1 may add one line to `documents` and `deviations` manifests to register their requirement fields. These are the built-in types it already special-cases.
- P2 may add `EntityQuerySpec` adapters for `document` and `deviation` inside `app/ai/` (not in the module packages).

Everything else is area work (section 3).

**Order:**
1. Core parts of P1, P2, P4 and P5, plus the whole of P3, start in parallel.
2. The P1 and P2 portal parts start in parallel too. They do not depend on P3.
3. The **P4 portal** branch is created after **P3** merges, because P4 builds the aside and tab badges into P3's frame. The **P5 portal** branch is created after P3 and P1-core merge.
4. Merge order: P3 → P1 → P4 → P2 → P5.
5. Area items A01-A26 start after all five have merged. They may run in parallel, because each owns only its module.

### 2.1 Shared conventions decided here

- **Canonical clause ref:** `<framework key>:<number>`, e.g. `iso27001:A.8.13`, `iso9001:8.4.1`,
  `gdpr:30` and `hs:7.2` (the HS clause in every enabled ISO standard). The framework keys and
  `FRAMEWORK_STANDARDS` come from contracts §10.1.
  - **Requirement ref** stays `<standard_key>:<number>.r<n>`, e.g. `iso9001-2026:8.4.1.r1`.
  - A new `app/services/clause_refs.py` (P1) provides:
    - `parse_clause_ref(raw) -> ClauseRef(framework, number)`, which accepts both the framework-key and the standard-key form (`iso27001-2022:A.8.13`).
    - `format_clause_ref(ref) -> str`, which always returns the canonical form.
    - `async resolve_requirements(session, refs, *, org_id) -> dict[str, list[StandardRequirement]]`: a clause expands to all of its requirements, and a requirement ref maps to itself.
  - Modules keep storing what they store. New writes use the canonical form.
- **Display label of a requirement** (everywhere, en and nb): `"<short> · <number>"`, e.g. "ISO 9001 · 8.4.1", with the requirement title in the UI language as subtitle or tooltip. Raw `.rN` suffixes are never shown. If a clause has several requirements, show "8.4.1 (krav 2 av 3)". "ISO HS" is never shown; HS refs render as "Felles ISO-krav · 7.2", with the tooltip listing the enabled ISO standards.
- **Two visual languages:**
  - **Evidence** (a real link from the record to a requirement): `app-requirement-chip`, outlined, with a status icon. Confirmed shows a solid check. Suggested has a dashed border and the word "Forslag".
  - **Teaching** (why-it-matters): plain text links inside the explanation ("Les om punkt 7.2"), never pills.
- **Vocabulary** (nb):
  - "Krav" = a requirement. "Punkt" = its number. "Standard" = ISO, GDPR, NIS2 and the AI Act (never "rammeverk" in the UI).
  - "Dokumentasjon" = evidence. The panel title is "Krav dette dokumenterer".
  - "Kravdekning" = the readiness score.

  The full glossary is in §3.6.

### 2.2 P1 requirements-everywhere (`cf60_requirement_layer`)

Goal: every record type can be tied to requirements, automatically where the data already
says so. Every requirement page shows evidence from all modules. Readiness counts all of it.
`requirement_link` stays the **only** input to readiness. Fields, declarations and AI only
create or update rows in it.

**Migration `cf60_requirement_layer`** (alters P1-owned tables only):
```
ALTER requirement_link
  ADD origin String(16) NOT NULL DEFAULT 'manual'   -- manual|ai|field|declaration|flow|system
  ADD origin_field String(64) NULL                  -- e.g. "control_refs", "clause_ref", "soa"
  ADD updated_at DateTime NULL
  index (org_id, entity_type, origin)
ALTER standard_requirement ADD title_nb Text NULL    -- if not already bilingual; else no-op
                                                     -- (engineer checks and records the finding)
ALTER standard_job: job kind gains "record_map" (String column, no DDL if free text)
```
`source` (ai|user) is kept and extended with `system`, for field and declaration rows written by
code. `origin` says *why* the row exists. The uniqueness rule (one row per org, requirement and
entity) is unchanged. If a field adds a link that already exists as a suggestion, the row is
promoted to confirmed. If a user rejected the row, the field never overrides that.

**Registry (P1 adds):**
```python
HOOK_REQUIREMENT_FIELDS = "requirement_fields"   # refs -> list[RequirementFieldSpec]

@dataclass(frozen=True)
class RequirementFieldSpec:
    entity_type: str
    field: str                       # model attribute / DTO key, e.g. "control_refs"
    kind: Literal["clause_refs", "clause_ref", "framework_tags"]
    status: Literal["confirmed", "suggested"] = "confirmed"
    # ref -> callable(session, org_id, entity_id) -> list[str] canonical refs
    # (only needed when the value is not a plain column, e.g. SoA applicability)
    extract: str | None = None
```
- `clause_refs` and `clause_ref` produce confirmed links to every requirement under the cited clauses of the org's **enabled** standards.
- `framework_tags` (for example `frameworks: ["iso27001"]`) never produce links on their own. They only narrow the suggestions to those standards.

**Service `app/services/requirement_sync.py` (P1):**
```python
async def sync_field(session, *, org_id, entity_type, entity_id, field, refs: Sequence[str],
                     caller: Caller | None) -> SyncResult      # add/remove origin=field rows for
                                                              # that field; audit + "requirement_link.synced"
async def sync_entity(session, *, org_id, entity_type, entity_id) -> SyncResult  # all specs of the type
async def backfill(session, *, org_id: uuid.UUID | None = None) -> dict[str, int] # CLI + demo
async def apply_applicability(session, *, org_id, requirement_ids, applicable: bool,
                              reason_key: str, source: EntityKey) -> None
    # SoA "not applicable" -> OrgRequirementState not_applicable with justification link
async def suggest_for_entity(session, *, org_id, entity_type, entity_id, caller) -> SuggestResult
    # AI on: queue a "record_map" StandardJob (ranks the declared requirements of the type,
    # narrowed by framework_tags, against the record's text; writes suggested rows with
    # confidence + rationale, origin=ai). AI off: returns the declared requirements as
    # virtual suggestions (no rows), origin=declaration.
```
Module services call `sync_field` in the same transaction as their create and update. Wiring
this up is area work; P1 does it only for `document` and `deviation`.

Removing a ref deletes only the `origin=field` rows **for that field** that a user has not
separately confirmed. A row confirmed by a user stays: its `origin` changes to `manual`.

Liveness: P1 adds `live_sql` for `document_type`, `document_template`, `record_type`,
`workflow_definition` and `learning_progress`, in the platform packages it may edit. If those
packages belong to other items, P1 instead reports them as contract additions for A24 and A26.

**Endpoints** (prefix `/api/v1/orgs/{org_id}`, all new unless noted):

| Method, path | Permission | Response |
|---|---|---|
| `GET /requirement-links?entity_type&entity_id` *(extended)* | read on entity | items gain `origin`, `origin_field`, `label: {short, number, title, standard_key, framework, req_index, req_count}` in request `lang` |
| `GET /requirement-coverage?entity_type=&ids=a,b,…` (≤200 ids) | read on type | `{items: {<id>: {confirmed, suggested}}}` for list rows |
| `POST /requirement-links/suggest` `{entity_type, entity_id}` | `standards:read` + edit on entity | `{job_id \| null, suggestions: [...]}` (job when AI on) |
| `POST /requirement-links/bulk` `{ids, action: confirm\|reject}` | `standards:manage` or edit on each entity | `{updated}` |
| `GET /standard-requirements/{ref}/evidence` | `standards:read` | `{requirement, status, links: [{id, status, origin, origin_field, entity: EntityRefDto}], by_module: [{module, count}], can_be_evidenced_by: [{module, entity_type, label_key, create_url}], mappings: [...]}`. Only records the caller can read |
| `GET /frameworks/gaps?standard_key&chapter?&limit=50&offset` | `standards:read` | `{total, items: [{ref, number, title, chapter, status, fix_in: [{module, entity_type, label_key, create_url, enabled}]}]}` |
| `GET /requirement-catalogue?q&frameworks=&limit=20` | member | clause/requirement picker over the **whole** catalogue (bilingual FTS on number + titles) → `[{clause_ref, number, title, standard_key, framework, enabled}]` |
| `POST /standards/{key}/ai-map` *(changed)* | as today | candidates = every type with a requirement field or declarations, not only documents |
| `POST /standard-requirements/{ref}/ai-help` *(changed)* | as today | `_record_candidates` ranks every linkable type declared for the clause |

`create_url` is the module's new-record route plus the query `?fromRequirement=<ref>`. Using
that parameter on the new-record form is P4's create-from-here contract (§2.5).

**Readiness:** the formula is unchanged (contracts §10.4). Its inputs are now all confirmed
live rows, whatever their origin, plus SoA applicability through `apply_applicability`. The
`GET /frameworks/readiness` response gains `by_origin: {manual, field, ai, …}`, so the UI can
say "12 krav dokumentert av risikoer".

**Portal (P1):**
- `shared/requirement-links/`:
  - `<app-supports-requirements [entityType] [entityId] [canEdit] [frameworks?]>`. Same selector, so all 50 existing hosts upgrade for free.
    - Title "Krav dette dokumenterer", with readable chips grouped by standard.
    - When nothing is linked, it shows "Foreslåtte krav" automatically (calls `/requirement-links/suggest` once per record visit, debounced). There is a one-click Confirm or Reject per row, and "Bekreft alle".
    - "Legg til krav" opens the catalogue picker.
    - `origin=field` rows show "Fra feltet «Kontroller»" and cannot be deleted here.
  - `<app-requirement-chip [label] [status] [origin]>`.
  - `<app-coverage-chip [counts]>`: "Dokumenterer 3 krav" / "Ikke koblet til krav" / "13 forslag". For list rows.
  - `RequirementCoverageService.load(entityType, ids)`: batched, cached per list.
  - `<app-clause-picker formControl [frameworks?] [multiple=true]>`: a ControlValueAccessor whose value is canonical clause refs, searching `/requirement-catalogue`. Areas replace every comma-separated or free-text clause input with it.
- `shared/guidance/field-help.ts`: a new optional input `requirements?: readonly string[]`. Also read from the guidance JSON `pages.<page>.fields.<field>.requirements`. Renders "Dokumenterer: ISO 9001 · 8.4.1" under the help text.
- `shared/guidance/why-it-matters.ts` and `clause-chips.ts`: render teaching links in the text, not pills. Labels follow §2.1. They never show "ISO HS".
- `features/standards/**`:
  - The evidence picker covers every linkable type (via `/search`, grouped by module). Delete `PickerKind`.
  - `entityRoute()` is replaced by `EntityRefDto.url`.
  - The requirement row shows evidence grouped by module, "Kan dokumenteres med: Risiko · Leverandørvurdering · …", each with "Opprett" (`create_url`) and "Koble eksisterende".
  - The gaps view uses `/frameworks/gaps`.
  - The "Kartlegg eksisterende dokumenter" banner becomes "Finn dokumentasjon i alle moduler".
  - `providePageContext` on the overview (`view: 'dashboard'`), the workspace (`entityType: 'standard'`) and the requirement (`entityType: 'standard_requirement'`, `title` = label, `selection.field` = ref).
  - Standards owns the **detailed** readiness page. The dashboard shows only the summary (P5).
- Catalogue nb titles: every catalogue clause and requirement used in the UI must have an nb title. If the JSON lacks one, P1 adds the nb titles (our own summaries, never ISO text).

Tests (core): field sync add, remove and promote; rejection respected; org isolation;
readiness counts field links; gaps `fix_in`; the catalogue picker in both languages; a disabled
standard produces no links. Portal: chip labels, coverage batching, clause picker CVA.

### 2.3 P2 assistant-everything (`cf61_assistant_v2`)

Goal: you can ask about anything and get a correct, linked answer in your language. The
acceptance test is the evaluation harness (`cf-test/polish-audit/assistant-eval/`) rerun on
the reseeded demo:
- ≥ 85 % (≥ 124/146)
- nb within 5 points of en
- **zero** false "empty / does not exist" claims
- ≥ 80 % of answers that mention a record link to it
- median latency ≤ 10 s, p90 ≤ 20 s
- no English status labels in nb sessions, and no run-together sentences

**Migration `cf61_assistant_v2`:**
```
ai_answer_feedback  id UUID PK, org_id FK CASCADE, user_id FK users CASCADE,
                    run_id FK ai_runs CASCADE, rating String(8) (up|down), reason String(32) NULL,
                    comment Text NULL, created_at; unique (run_id, user_id)
```
Endpoint: `POST /ai/runs/{run_id}/feedback {rating, reason?, comment?}` → 204.

**Registry (P2 adds):**
```python
HOOK_ENTITY_QUERIES = "entity_queries"   # refs -> list[EntityQuerySpec]

@dataclass(frozen=True)
class ListFilters:
    q: str | None = None
    status: str | None = None            # module value, or "open" / "unresolved" / "closed" meta-values
    owner_user_id: uuid.UUID | None = None
    owner_name: str | None = None        # resolved server-side against org members
    due_before: date | None = None
    overdue: bool | None = None
    severity: str | None = None
    extra: Mapping[str, Any] = field(default_factory=dict)   # validated by the spec's schema
    sort: str | None = None              # "due", "-updated", "-score", …
    limit: int = 25                      # max 100
    offset: int = 0

@dataclass(frozen=True)
class EntityQuerySpec:
    entity_type: str
    module: str
    list: str                            # ref -> async (session, org_id, caller, ListFilters) -> ListPage
    stats: str | None = None             # ref -> async (session, org_id, caller, group_by, ListFilters) -> list[{key, count}]
    group_by: tuple[str, ...] = ()       # allowed stats dimensions, e.g. ("status", "severity", "owner")
    status_meta: Mapping[str, tuple[str, ...]] = field(default_factory=dict)  # {"open": (...), "closed": (...)}
    extra_schema: Mapping[str, Any] = field(default_factory=dict)             # JSON schema of `extra`
    summary: str = ""                    # one line for the tool catalogue, English, model-facing

@dataclass(frozen=True)
class ListPage:
    total: int
    items: list[dict[str, Any]]          # each: id, code, title, status, owner_name, due_at, url (+ extras)
```
Each module registers its spec, backed by the list service its REST endpoint already uses
(area work, §3.3). P2 ships the specs for `document`, `deviation`, `deviation_action`, `task`
and `standard_requirement`.

**Generic tools** (`app/ai/generic_tools.py`, always offered when the caller can read at least one type):

| Tool | Input | Output |
|---|---|---|
| `list_records` | `entity_type` (enum of registered types the caller can read), filters (`ListFilters` + `extra`) | `{total, items[≤25], url_of_register}`; emits a `link` event per item |
| `count_records` | `entity_type`, `group_by?`, filters | `{total, groups}` |
| `get_record` | `entity_type`, `id` or `code` | the record dict + `requirement_links` (P1 labels) + `connections` (P4 summary) + `url`; cites it |
| `summarise_record` / `explain_record` | as `get_record` | plain-language summary or explanation of status, next step and why it matters, from guidance + clauses |
| `search_everything` | `q`, `types?` | merged: global search (records), document chunks, standards text, guidance and how-to; nb/en vocabulary applied |
| `requirement_evidence` | `standard_key` or `framework`, `clause` (prefix ok) | P1 `/standard-requirements/{ref}/evidence` for the requirements under the clause |
| `standards_gaps` | `framework`, `chapter?`, `limit` | P1 `/frameworks/gaps` |
| `requirement_status` | `framework` | readiness + `by_origin` + top gaps |
| `my_work` | `user?` (admin can ask for others) | P5 `/my-work` |
| `org_overview` | `module?` | the module `/overview` endpoints that exist today (audits, risk, privacy, …) |
| `help_howto` | `topic` | how-to entry: steps, the page url, and the related lesson |
| `link_records` (write) | `source`, `target`, `link_type` | confirm-before-write → P4 `links.link` |
| `link_requirement` (write) | `entity`, `requirement_refs[]` | confirm-before-write → P1 `create_link` (confirmed, origin `ai`) |
| `open_record`, `explain_clause`, `global_search` | unchanged | kept for compatibility |

The module `<prefix>_search|get|create_draft|summarise` tools stay. `standard_record_tools`
gains an optional `list` ref and then also emits `<prefix>_list`, but the generic tools are the
default path.

**Tool selection** (fixes F11):
- The tool set sent to the model is the generic tools, plus the page's module tools, plus the `create_draft` tools of enabled modules. That is about 40 tools, not 255.
- The tool list keeps a stable sorted order, for the prompt cache.

**Runtime fixes** (`app/ai/runtime.py`, `tools.py`, `tool_kit.py`, prompt files):
- F6: today's date, weekday and the org timezone in the uncached per-request block.
- F5: rule. Only say "ingen" or "finnes ikke" after a list or count tool returned `total = 0`. Otherwise say you could not find it, and link the register.
- F7: status meta-values. `open` / `unresolved` = every status except closed or cancelled. This is the default for "open" questions in deviation, finding, risk and task tools.
- F8: list, get and aggregate tools emit `link` events. Rule: every record mentioned is written `[CODE Title](url)`.
- F9: insert `\n\n` between assistant turns in `runtime.ask`.
- F10:
  - Status events carry `key` (`ai.status.<tool>`) and `params`, and the portal translates them. The English `label` is kept for old clients.
  - Rule: all text in `{lang}`, no narration before tool calls, and never print tool or field identifiers.
  - The nb glossary (§3.6) is injected in nb sessions.
  - `selection.field` arrives as a translated label from the portal.
- F2: `app/platform/search/vocabulary.py` maps nb and en type words ("leverandør", "revisjon", "brudd", "behandlingsprotokoll", …) to entity types. A query that matches only a type word returns that type's newest records. Rule: retry in the records' language.
- F12: `help_howto` over `app/ai/howto/<module>.json` (en and nb, same keys):
  ```jsonc
  {"howto": {"approve-document": {
     "questions": {"en": ["how do I get a document approved"], "nb": ["hvordan godkjenner jeg et dokument"]},
     "steps": {"en": ["…"], "nb": ["…"]}, "url": "/documents/new", "lesson": "documents.first-document"}}}
  ```
  P2 writes `platform.json`, `documents.json`, `deviations.json` and `standards.json`. Each area writes its own module's file (§3.3). For ambiguous terms such as "brudd", the answer covers both meanings and links both.
- F13: link labels use the record's own code (a supplier evaluation shows the evaluation, not the supplier code). Draft requests propose a draft and do not ask questions back.
- Page context: `PageContext` gains optional `requirements: string[]` (the canonical refs of the field or record in focus) and `standard_key`. The runtime adds "the user is looking at requirement X" for `standard_requirement` (P1 sets this).

**Portal (P2):**
- Ask panel:
  - translated status keys (scope `ask`)
  - a separator between turns
  - link events rendered as `app-entity-chip`
  - thumbs up/down
  - "Forslag" chips per page type (e.g. on a requirement: "Hva mangler for dette kravet?")
  - a source list with module icons
- Command palette: grouped results for all types, plus "Spør CoreFlow: <query>" as the last row, plus how-to hits.
- `shared/ask/ask-about.ts`: passes `requirements` from field-help.

### 2.4 P3 design-system (no migration)

Goal: every page is built from the same parts and speaks the same plain language. It works at
375 px and meets WCAG AA.

**Tokens** (`src/tailwind.css` `@theme`, from design.md §6.1):
- Type: `text-page` (26/24), `text-section` (17), `text-card` (15), `text-body` (14), `text-ui` (13), `text-meta` (12), `text-micro` (11, badges only).
- Radius: `rounded-card` (14), `rounded-tile` (10).
- Colour: `--fg-subtle` darkened to #6b7383. Badge text tones: warn #8a5a00, pass #0b6e41, fail #b02a2a, info #2559b8.
- Page padding `px-4 sm:px-8`, section gap `gap-6`, card `p-5`.

Arbitrary `text-[..px]` and `rounded-[..]` values are lint-flagged. This is a doc rule; a lint rule is optional.

**Shared UI** (`src/app/shared/ui/`, exported from `index.ts`, scope: global `common.*` / `ui.*` keys):

| Component / file | Contract |
|---|---|
| `tones.ts` | `type ToneMeaning = 'severity' \| 'lifecycle' \| 'compliance' \| 'progress'`; `toneFor(meaning, value: string): Tone` per design.md §6.2 (low severity = `neutral`; progress never `fail`). Value aliases: `critical, prohibited, high, medium, moderate, low, minimal, draft, planned, open, submitted, in_progress, under_review, overdue, blocked, done, completed, approved, closed, effective, cancelled, archived, obsolete, rejected, failed, compliant, partial, partially_compliant, non_compliant, not_assessed, not_applicable`; unknown → `neutral` |
| `<app-status-badge [meaning] [value] [labelKey?]>` | badge with `toneFor` + translated label (`labelKey` or `common.status.<value>`) |
| `<app-page-header>` | inputs `titleKey`, `titleParams?`, `descriptionKey?`, `breadcrumbs: {labelKey, link?, params?}[]`, `settingsLink?`, `backLink?`; slots `[primary]` (one button), `[secondary]` (≤2), `[overflow]` (menu items → "Mer ⋯"), `[meta]` (code · type · status line on detail pages). Sets the document title (via `TitleService`) |
| `<app-module-nav [items]>` | `items: {labelKey, link, exact?, count?}[]`; underline tabs, horizontally scrollable with fades, `aria-current`; replaces the 18 sub-navs |
| `<app-help-strip [scope] [page] [tour?] [lesson?]>` | one collapsible row grouping guide-intro, tour ("Omvisning"), lesson ("Leksjon · 5 min") and "Forklar denne siden" (P2's `AskPanelService.openTutor`); expanded for beginners and on first visit, then remembers collapse (localStorage `coreflow.help.<scope>.<page>`); on <640 px collapsed by default |
| `<app-record-row>` | slots/inputs: `code`, `title`, `subtitle?`, `link`, `[badges]`, `[coverage]` (P1 `app-coverage-chip`), `owner?`, `date?`, `dateKind?`; column headers ≥1024 px via `<app-record-row-header>`; stacked <640 px |
| `<app-field-list>` / `<app-field-item [labelKey] [value] [empty='notSet']>` | label above value; empty → "Ikke satt" |
| `<app-overflow-menu>` | keyboard menu (Arrow, Escape, focus return); destructive items styled `danger` and require `app-confirm-dialog` |
| `<app-empty-state>` | generic empty (icon, title, body, cta) for non-teaching cases; teaching empties keep `app-teaching-empty` |
| `<app-loading-state [rows]>`, `<app-error-state (retry)>` | skeleton rows; error with retry and neutral text |
| `TitleService` + `CoreflowTitleStrategy` | per-route `<title>` = translated page title + " · CoreFlow" |

**Kit frames** (P3 owns `shared/kit/record-list-page.ts` and `record-detail-layout.ts`):
- The list page uses `app-page-header`. It has a one-row toolbar: search, ≤3 filters, a "Flere filtre" popover and saved views. It has slots for KPI tiles (≤6) above the list.
- The detail layout uses `app-page-header` with a `[meta]` line. It has tabs with count badges, from an input `counts?: Partial<Record<tab, number>>`.
- The detail layout has an aside with ordered slots:
  1. `[aside-requirements]`: default content `<app-supports-requirements>`
  2. `[aside-connections]`: default content empty; P4 fills it
  3. `[aside]`: module summary
  4. `[aside-learn]`

  P4 later sets the defaults of slots 2 and 4 and the related count. P3 only creates the slots and inputs.

**Shell** (`layout/**`):
- Below `lg` the side nav is an off-canvas drawer: hamburger, focus trap, Escape, closes on navigate. Below `md` the top-bar search becomes an icon.
- Theme and language move into the account menu on mobile.
- Skip link. `index.html` `lang` follows the active language (set by `LanguageService`).
- "Ctrl K" on non-Mac. Toasts clear on navigation and never cover the Ask button.
- The language switcher bug is fixed (bind the value after options; use autonyms "Norsk (bokmål)" and "English").
- The Customize hidden state is persisted (localStorage `coreflow.nav.hidden.<orgId>`). No button inside a link.

**IA / nav** (`nav.ts`, design.md §4.3, adopted as the decision):
```
Hjem:            Oversikt · Mitt arbeid
Krav og styring: Standarder og krav · Lover og forskrifter · Kontekst og ledelse · Mål og KPI-er ·
                 Risiko og muligheter · Ledelsens gjennomgang
Daglig drift:    Prosesser · Dokumenter · Prosjekter · Leverandører · Kontrakter ·
                 Eiendeler og endringer · Kontinuitet og beredskap
Oppfølging:      Avvik · Inspeksjoner · Revisjoner · Kundetilbakemeldinger · Rapporter
Fagområder:      Personvern · KI-styring · Miljø · HMS
Mennesker:       Personer · Rekruttering · Opplæring
(bottom)         Læringssenter · Innstillinger
```
- "Trenger din gjennomgang" leaves the nav and becomes a My Work tab (P5). The `/review` route stays, so links keep working.
- Sections collapse, and the state is remembered per org.
- **Nav label = module h1 = breadcrumb root**. All three come from `modules.names.<key>` in global i18n (P3 sets these values; areas use the key).
- `/settings` becomes a hub with cards: Organisasjon, Medlemmer og roller, Moduler, Varsler, Terminologi, Veiledning, Slettede elementer. Each module card links to its own type, template and settings pages. Areas add a gear `settingsLink` in their page header.

**Copy** (global `en.json`/`nb.json`, P3):
- "AI" becomes "KI" in nb.
- du/dere per the guide.
- Empty-value words: "Ikke satt", "Ingen", "—".
- `common.status.*` and `common.severity.*` for the tone map.
- Date-times without seconds: the `localDate` default format becomes `d. MMM y, HH:mm`.
- `guide-intro` renders steps with `appMarkdown`.

**`docs/ux-guide.md`** (P3) is the single reference for areas. It contains:
- page anatomy per page type (design.md §6.3, with the components above)
- the 10-rule writing guide (design.md §6.5)
- the nb glossary (§3.6 here, copied and maintained there)
- the tone map
- the mobile and a11y rules
- a "before / after" example for one list, one detail and one form page (P3 converts **deviations list** and **documents detail** as reference pages only on the frame level, and leaves the module content to A03 and A24)

### 2.5 P4 connections (`cf62_connections`)

Goal: every record shows what it is connected to (records, requirements, people, tasks). You
can create the natural next record from it in one click. Links appear automatically when the
relation is already known.

**Migration `cf62_connections`:**
```
ALTER entity_link ADD origin String(12) NOT NULL DEFAULT 'user'   -- user|auto|flow|ai
                  ADD flow_key String(64) NULL
link_suggestion   id UUID PK, org_id FK CASCADE, source_type String(32), source_id UUID,
                  target_type String(32), target_id UUID, link_type String(16),
                  reason String(40),            -- rule key, e.g. "same_clause", "same_asset", "text_match", "ai"
                  confidence Float NULL, status String(10) (pending|accepted|dismissed),
                  created_at, decided_by FK users SET NULL, decided_at NULL
                  unique (org_id, source_type, source_id, target_type, target_id, link_type)
                  index (org_id, source_type, source_id), index (org_id, target_type, target_id)
```

**Registry (P4 adds):**
```python
HOOK_STRUCTURAL_RELATIONS = "structural_relations"  # refs -> list[StructuralRelation]
HOOK_LINK_RULES = "link_rules"                      # refs -> list[LinkRule]
HOOK_CREATE_FLOWS = "create_flows"                  # refs -> list[CreateFlowSpec]

@dataclass(frozen=True)
class StructuralRelation:      # an FK that already relates two records; shown as a connection, never copied
    entity_type: str           # e.g. "supplier_evaluation"
    target_type: str           # e.g. "supplier"
    link_type: str             # e.g. "relates_to"
    resolve: str               # ref -> async (session, org_id, entity_id) -> list[uuid]   (targets)
    reverse: str | None = None # ref -> async (session, org_id, target_id) -> list[uuid]   (sources)

@dataclass(frozen=True)
class LinkRule:                # writes entity_link (auto) or link_suggestion (suggest) on events
    key: str                   # "risk.same_control_as_soa"
    on_event: tuple[str, ...]  # domain event kinds that trigger it, e.g. ("risk.created", "risk.updated")
    mode: Literal["auto", "suggest"]
    run: str                   # ref -> async (session, org_id, event) -> list[ProposedLink]

@dataclass(frozen=True)
class CreateFlowSpec:          # "create from here"
    key: str                   # "deviation.to_risk"
    source_type: str
    target_type: str
    label_key: str             # global i18n "flows.<key>" (P3 adds the keys listed below)
    link_type: str             # link written source -> new record after save
    target_route: str          # portal new-form path, e.g. "/risk/risks/new"
    prefill: str               # ref -> async (session, org_id, caller, source_id) -> dict (form values)
    permission: str            # write permission on the target module
    requirement_refs: bool = True  # copy the source's confirmed requirement links as suggestions
```
P4 runs the rules from a platform event sink (`app/platform/kit/link_rules.py`, registered with
`HOOK_EVENT_SINKS`). Rules must be idempotent and must never fail the triggering transaction:
errors are logged and swallowed.

**Endpoints** (prefix `/api/v1/orgs/{org_id}`):

| Method, path | Permission | Response |
|---|---|---|
| `GET /connections?entity_type&entity_id` | read | `{counts: {records, requirements, tasks, suggestions}, groups: [{module, entity_type, label_key, items: [{link_id?, origin: user\|auto\|flow\|ai\|structural, link_type, direction, other: EntityRefDto}]}], suggestions: [{id, reason, confidence, other: EntityRefDto, link_type}], requirements: {confirmed, suggested}}` |
| `GET /connections/graph?entity_type&entity_id&depth=1\|2` | read | `{nodes: [EntityRefDto + {kind: record\|requirement\|person\|task}], edges: [{from, to, link_type, origin}]}` ≤ 60 nodes, unreadable nodes dropped |
| `GET /connections/counts?entity_type&ids=…` (≤200) | read on type | `{items: {<id>: n}}` |
| `POST /link-suggestions/{id}/accept` / `dismiss` | edit on source | accept writes the link (origin `ai` or `auto` by reason) |
| `GET /create-flows?entity_type&entity_id` | read on source | `[{key, label_key, target_type, target_route, enabled}]` (only enabled modules + permitted) |
| `POST /create-flows/{key}/prefill` `{source_id}` | read source + flow permission | `{target_route, prefill: {...}, token}` (token = signed `{key, source_type, source_id}`, 1 h) |
| `POST /create-flows/complete` `{token, target_id}` | edit on target | writes the link (origin `flow`, `flow_key`), copies requirement suggestions, audit + event; 409 if already linked |

`GET /links` (existing) keeps its shape. The structural relations appear only in `/connections`.

**Flows P4 registers centrally** (prefill builders live in `app/platform/kit/flows/` and read
only through `registry.resolve_entity` and the target module's public service function. If no
such function exists, the area item adds it and P4 registers the flow with a stub that returns
title and description only):
- deviation → risk / task / training need (course assignment) / document change
- audit_finding → deviation / risk
- inspection_finding → deviation
- risk → control document (policy or procedure) / risk_treatment / task
- supplier → contract / supplier_evaluation
- dpia → risk
- ai_system → dpia / ai_assessment
- obligation → policy / document
- customer_feedback → deviation
- management_review → task (action)
- standard_requirement → any `can_be_evidenced_by` type (`?fromRequirement=`; on complete, writes a **confirmed requirement link** through P1 instead of an entity link)

Areas may add more flows in their own manifests.

**Portal (P4):**
- `CreateFlowService` (`core/kit/create-flow.service.ts`):
  - `start(key, sourceType, sourceId)` navigates to `target_route` with `?flow=<token>`.
  - `consume(route): Signal<Prefill | null>` is used by new-forms to prefill.
  - `complete(targetId)` is called by new-forms right after a successful create, then shows a toast "Koblet til AVV-12".
  - `?fromRequirement=<ref>` is handled by the same service.
- `<app-create-from-here [entityType] [entityId]>`: a "Lag ny fra denne ⋯" menu in the header `[secondary]` slot.
- `<app-connections-panel [entityType] [entityId] [canEdit]>`: aside summary, with a count per group, the top 5 items, suggestions with Accept/Dismiss, "Koble til…" and "Vis kart".
- `<app-related-items>` (upgraded): groups by module, origin badges ("Automatisk", "Fra avvik AVV-3"), suggestions, and a picker over every searchable type.
- `<app-connection-map [entityType] [entityId]>`: a dialog with a three-column map (requirements | this record | related records and tasks). Pure SVG and CSS, no new dependency. Keyboard navigable. A list fallback below 640 px.
- Inside `record-detail-layout`, after P3 merges, P4 fills the defaults:
  - `[aside-connections]` with `app-connections-panel`
  - the related-tab count from `/connections/counts`
  - the header `[secondary]` default with `app-create-from-here`

  P4 does this through a `RecordConnectionsDirective` (or by editing the default slot contents, with P3 having merged first). It is the only P4 edit to that file, recorded as an agreed exception.
- `app-entity-chip` is used wherever a record is referenced, and shows code, title and a status dot.

**Demo:** `app/services/demo_connections.py` (P4) runs last in `seed-demo` and in the `demo-connect` CLI:
1. Runs P1's `requirement_sync.backfill`.
2. Runs every `LinkRule` over existing records.
3. Resolves every area's `DEMO_LINKS` (§4) by code.

It is idempotent, so it can be rerun on the shared sandbox.

### 2.6 P5 home-and-journeys (`cf63_journeys`)

Goal: on login every user sees where the organisation stands per standard and what *they* should
do next. A beginner can say "make us ISO 27001-ready" and follow a path.

**Migration `cf63_journeys`:**
```
journey             id UUID PK, org_id FK CASCADE, framework String(32), status String(12)
                    (active|completed|archived), started_by FK users SET NULL, started_at,
                    completed_at NULL, deleted_at NULL; unique (org_id, framework) WHERE deleted_at IS NULL
journey_step_state  id UUID PK, journey_id FK journey CASCADE, step_key String(64),
                    status String(10) (todo|done|skipped), task_id FK tasks SET NULL NULL,
                    done_at NULL, done_by FK users SET NULL NULL; unique (journey_id, step_key)
dismissed_next_action  user_id FK CASCADE, org_id FK CASCADE, action_key String(120),
                    until DateTime NULL; PK (user_id, org_id, action_key)
```

**Journey content** (`app/platform/journeys/catalog/<framework>.json`; P5 writes `iso9001`,
`iso27001`, `iso14001`, `iso45001`, `iso42001`, `gdpr`, `nis2`, `eu_ai_act`; en and nb in one file):
```jsonc
{"framework": "iso27001", "title": {"en": "Get ready for ISO 27001", "nb": "Bli klar for ISO 27001"},
 "phases": [{"key": "scope", "title": {...}, "steps": [
   {"key": "define-scope", "title": {...}, "body": {...},           // plain language, ≤ 3 sentences
    "requirement_refs": ["iso27001:4.3"], "module": "context",
    "action": {"kind": "create|open|lesson|task", "url": "/context/scope/new", "lesson": "context.scope"},
    "done_when": {"kind": "requirement_covered|record_exists|manual", "refs": ["iso27001:4.3"],
                  "entity_type": "scope_statement", "min": 1}}]}]}
```
Steps whose module is disabled show "Slå på modulen <navn>". Done state is computed live
(`requirement_covered` / `record_exists`) or is manual. "Gjør til oppgave" creates an F2 task
linked to the journey step.

**Registry (P5 adds):**
```python
HOOK_NEXT_ACTIONS = "next_actions"    # refs -> async (session, org_id, caller, today) -> list[NextAction]
@dataclass(frozen=True)
class NextAction:
    key: str                  # stable, e.g. "risk.unreviewed:<id>" (dismissable)
    kind: Literal["overdue", "due_soon", "gap", "confirm_suggestions", "journey_step", "setup", "review"]
    title_key: str; params: Mapping[str, Any]
    url: str; priority: int   # 0 = most urgent
    module: str | None = None
```
P5 provides providers for tasks/My Work, P1 suggestions waiting ("Bekreft 13 foreslåtte
krav"), P4 link suggestions, journey steps and top gaps. Areas add providers for their own
deadlines (A-items, §3.3).

**Endpoints** (prefix `/api/v1/orgs/{org_id}`):

| Method, path | Permission | Response |
|---|---|---|
| `GET /home` | member | `{frameworks: [{framework, standard_key, name, score, covered, applicable, trend_30d, top_gaps[≤3]}], next_actions[≤7], my_work: {overdue, due_this_week, awaiting_review, total}, journeys: [{id, framework, done, total}], setup: {complete, missing[]}}` |
| `GET /journeys`, `POST /journeys {framework}` | `standards:read` / `standards:manage` | list / create |
| `GET /journeys/{id}` | `standards:read` | phases + steps with computed status |
| `PATCH /journeys/{id}/steps/{key} {status}` / `POST …/steps/{key}/task` | `standards:manage` | update / create task |
| `POST /next-actions/{key}/dismiss {days?}` | member | 204 |
| `GET /my-work` *(extended)* | member | items gain `kind_label_key`, `why` (one line), `module`, `url`; groups `overdue / this_week / later / awaiting_review` |

**Portal (P5):**
- **Dashboard (Oversikt)**:
  - Greeting.
  - "Gjør dette nå" with the next actions (each with why and one button).
  - "Slik står organisasjonen" with one card per enabled standard: Kravdekning %, an accent bar (never red), "3 viktigste hull" and "Se alle krav →" (standards page).
  - "Mitt arbeid" summary and the active journeys.

  The old maturity block is removed. Reports keeps exports and audit packs only (A23).
- **My Work**:
  - Tabs: Forfalt, Denne uka, Senere, Til gjennomgang (the old `/review`). Each row says what it is, why it is here, and the module.
  - Filters: module, type.
  - Empty state per tab.
- **Journeys**:
  - `/standards/journey/<framework>` is a route under features/standards that P1 owns. P1 adds a lazy child route that loads P5's `features/dashboard/journey/journey-page.ts`. This is the only cross-item route edit, agreed here.
  - Phases with progress, and steps with action buttons, "Gjør til oppgave" and "Hopp over".
  - The setup wizard (`features/org-modules/setup`) ends with "Start reisen for ISO 27001", and the dashboard shows "Fortsett reisen".
- **Learning centre** (`features/learning`): reachable from the nav (P3). Lists lessons by module and by standard, with progress. "Anbefalt for deg" comes from the journey's next lesson steps.
- Page context: dashboard (`module: null`, `view: 'dashboard'`), My Work (`module: 'tasks'`), journey (`entityType: 'journey'`).

---

## 3. Module polish checklist (every area A01-A26)

Every area item works only in its own module (backend `app/modules/<key>/**`, one migration
`cf7x/8x/9x`, portal `features/<path>/**`, scoped i18n, guidance, how-to file). It must tick
**every** box below. Write the result as a checklist table in the report, and give a reason for each "n/a".

### 3.1 Requirements (P1)
- [ ] Every record type with a detail page embeds `<app-supports-requirements>` in the `[aside-requirements]` slot. Sub-records without their own page (treatments, findings, measurements, milestones, …) show their requirement chips inline in their row and can be linked from there.
- [ ] `ModuleSpec.clauses` is reviewed against the catalogue. Every declared ref resolves. Declarations are specific (the clauses a record of this type really proves, ≤ 8 per type). HS refs are used for the shared ISO clauses.
- [ ] Every field that names a clause, control or article uses `<app-clause-picker>` (no free text, no comma lists). It is declared as a `RequirementFieldSpec` and calls `requirement_sync.sync_field` in create and update. Stored refs are canonical. The migration normalises old values (e.g. `iso27001-2022:A.8.13` → `iso27001:A.8.13`) if the module stores refs.
- [ ] `frameworks[]` tag fields are declared as `framework_tags` (they narrow suggestions).
- [ ] The guidance JSON `fields.<field>.requirements` is set for the key fields (at least 3 per form). Field help then shows "Dokumenterer: …".
- [ ] List rows show `<app-coverage-chip>` (batched via `RequirementCoverageService`).
- [ ] AI suggest works: creating a record of this type and opening it shows "Foreslåtte krav" with sensible items (check two records manually).
- [ ] `live_sql` is set for every linkable type.

**Default clauses and field mapping per area.** This is the starting point. Areas refine it,
but must not drop a row without saying why.

| Area | Record types → default clauses | Fields that feed links |
|---|---|---|
| A01 context | context_analysis → hs:4.1, hs:4.2 · interested_party → hs:4.2 · scope_statement → hs:4.3, iso27001:4.3 · policy → hs:5.2, iso27001:5.2, iso42001:5.2 · responsibility → hs:5.3 | `policy.frameworks` (tags); interested party `requirements` → link to obligations (P4) |
| A02 processes | process → hs:4.4, iso9001:8.1, hs:8.1 | – |
| A03 deviations | deviation → hs:10.2, iso27001:A.5.24-A.5.28 (security type), iso45001:10.2 (HSE type), gdpr:33 (breach type) · deviation_action → hs:10.2, hs:10.3 | `clauses[]` (picker, confirmed), `standards[]` (tags) |
| A04 risk | risk → hs:6.1, iso27001:6.1.2, iso27001:8.2 · risk_treatment → iso27001:6.1.3, iso27001:8.3 · opportunity → hs:6.1 · soa_entry → iso27001:6.1.3(d) + its own control · risk_matrix → iso27001:6.1.2 | `control_refs` (risk + treatment, confirmed), SoA `clause_id` + applicability (`apply_applicability`) |
| A05 inspections | inspection → hs:9.1, iso45001:9.1, iso14001:9.1 · inspection_finding → hs:10.2 · checklist_template → hs:9.1 | checklist item `clause_ref` (if present) |
| A06 audits | audit_programme → hs:9.2 · audit_plan → hs:9.2 · audit_finding → hs:9.2, hs:10.2 · audit_certification → hs:9.2 | `audit_plan.clause_refs` (confirmed on the plan, as "audited against"), `audit_finding.clause_ref` (**suggested** on the requirement + a gap flag when the finding is a nonconformity) |
| A07 management-review | management_review → hs:9.3 · meeting → hs:9.3 (when type = MR) | `frameworks` (tags) |
| A08 objectives | objective → hs:6.2 · kpi → hs:9.1 | – |
| A09 people | employee → hs:7.2 · position → hs:5.3, hs:7.2 · competence → hs:7.2 · people_awareness → hs:7.3 | – |
| A10 recruitment | job_requisition → hs:7.1, hs:7.2 · candidate/job_application → gdpr:5, gdpr:13 (processing), iso27001:A.6.1 | – |
| A11 training | course → hs:7.2, hs:7.3 · training_assignment/record → hs:7.2 (records = evidence of competence) | course `clauses` if present |
| A12 contracts | contract → iso9001:8.4, iso27001:A.5.20, gdpr:28 (DPA type) | – |
| A13 suppliers | supplier → iso9001:8.4.1, iso27001:A.5.19-A.5.22, nis2:21.2.d · supplier_evaluation → iso9001:8.4.1, iso27001:A.5.22 | – |
| A14 projects | project → iso9001:8.3, iso27001:A.5.8 · project_design_review → iso9001:8.3.4 · project_milestone → iso9001:8.3.4 | – |
| A15 privacy | ropa_entry → gdpr:30 · dpia → gdpr:35 · data_subject_request → gdpr:12, gdpr:15-22 · data_breach → gdpr:33, gdpr:34 · processor → gdpr:28 · transfer_assessment → gdpr:44-46 · retention_rule → gdpr:5.1.e · consent → gdpr:7 | – |
| A16 ai-governance | ai_system → iso42001:A.4, eu_ai_act:6, eu_ai_act:26 (deployer) · ai_assessment → iso42001:6.1.4, iso42001:8.4, eu_ai_act:9, eu_ai_act:27 | `ai_act_role`/risk class → narrows (tags) |
| A17 environment | env_aspect → iso14001:6.1.2 · emergency_plan/env_drill → iso14001:8.2 · env_measurement → iso14001:9.1.1 | `legal_requirement` → link to obligations (P4 rule) |
| A18 obligations | compliance_obligation → hs:6.1, iso14001:6.1.3, iso45001:6.1.3, iso27001:A.5.31 + **its own articles** | `requirements[]` gains structured `article_refs` (picker over GDPR/NIS2/AI Act) → confirmed links; free text stays as a note |
| A19 assets | asset → iso27001:A.5.9, A.5.10 · access_review → iso27001:A.5.18, A.8.2 · change_request → iso27001:A.8.32, iso9001:6.3 · calibration → iso9001:7.1.5 | – |
| A20 continuity | bia → iso27001:A.5.30, nis2:21.2.c · continuity_plan → iso27001:A.5.29, A.5.30 · continuity_exercise → iso27001:A.5.30, iso45001:8.2 | – |
| A21 hse | sja → iso45001:6.1.2, 8.1.2 · ppe_item → iso45001:8.1.2 · worker_consultation → iso45001:5.4 | – |
| A22 feedback | customer_feedback → iso9001:9.1.2, iso9001:8.2.1 · survey → iso9001:9.1.2 | – |
| A23 reports | report_definition / audit_pack → hs:9.1, hs:9.3 (evidence packs) | `standard_key` (tags) |
| A24 documents | document → hs:7.5 + AI-mapped content · document_type → hs:7.5 · external_document → hs:7.5.3 · distribution_campaign → hs:7.3, hs:7.5.3 | `document.clause_ref` (**dead field**: either wired through the picker as confirmed, or dropped; A24 decides and records it) |
| A25 standards | (P1 owns the mechanics; A25 polishes copy, empty states, mobile, gaps UX, journey entry) | – |
| A26 settings + account + learning | document_type / record_type / workflow_definition (`live_sql`) | – |

### 3.2 Connections (P4)
- [ ] The detail page uses `record-detail-layout`, so it gets the connections panel, the related tab with a count, create-from-here, and the map. Documents detail adopts it (A24).
- [ ] Every FK relation between records of this module, or to another module, is registered as a `StructuralRelation`. Examples: supplier_evaluation→supplier, kpi→objective, training_record→course→competence→position, treatment→risk, finding→audit_plan, application→requisition, milestone→project.
- [ ] The automatic relations are registered as `LinkRule`s (auto where the relation is certain, suggest where it is likely). Required:

  | Rule | Mode |
  |---|---|
  | risk ↔ soa_entry (same control) | auto |
  | risk ↔ asset (asset named in risk) | suggest |
  | deviation ↔ risk (same process or asset) | suggest |
  | audit_plan ↔ process (scope) | auto |
  | DPIA ↔ ai_system / ropa_entry | suggest |
  | obligation ↔ policy / document (same article) | suggest |
  | env_aspect.legal_requirement → obligation | suggest |
  | management_review ↔ its input records | auto |
  | inspection ↔ deviation from "Kilde: Inspeksjon" | auto |

- [ ] The create-from-here flows in §2.5 that start or end in this module work end to end: prefill, save, link, toast. Each new-form reads `CreateFlowService.consume()` and calls `complete()`.
- [ ] Every record type with a page is in global search. These 17 types are currently missing and must be added: `soa_entry`, `risk_treatment`, `risk_register`, `risk_matrix`, `training_record`, `training_assignment`, `calibration`, `audit_certification`, `retention_rule`, `env_drill`, `env_measurement`, `people_*` (the four) and `project_design_review`. The owning area adds each one.
- [ ] Every place a record of another module is mentioned renders `app-entity-chip`, never raw text or a bare code.

### 3.3 Assistant (P2)
- [ ] An `EntityQuerySpec` exists for every entity type with a list. It uses the module's list service and its real filters. `status_meta` maps "open/unresolved/closed". `group_by` covers status, owner and the module's key dimension (severity, level, type).
- [ ] The module's `<prefix>_get` output includes requirement links and connections. Use the generic enrichment helper `app.ai.enrich.with_links(...)` from P2.
- [ ] The module's org-wide aggregates are reachable: the existing `/overview` through `org_overview`. Module deadlines are also a `NextAction` provider (P5).
- [ ] `app/ai/howto/<module>.json` (en + nb) has at least 4 how-to entries, covering create, the main workflow step, linking to requirements and the most common question for this module.
- [ ] `providePageContext` is set on **every** page of the module (list, detail, edit, new, board, calendar, settings) with `module`, `entityType`, `entityId`, `view` and `title`. Detail pages also pass `requirements` (the confirmed refs).
- [ ] `<app-ask-about>` is on the 2-3 hardest fields of each form.
- [ ] The area's rows of the assistant evaluation are rerun (`assistant-eval` harness filtered to the module). Every question scores 2, or the report says why not.

### 3.4 Design system and page anatomy (P3)
- [ ] Every page uses `app-page-header` with breadcrumbs. The module root h1 equals the nav label (`modules.names.<key>`).
- [ ] The sub-navigation is `app-module-nav` directly under the header. The module's own sub-nav component is deleted.
- [ ] There is at most one primary action, two secondary actions and an overflow menu. Delete sits only in the overflow menu, with a confirm dialog.
- [ ] List pages use `app-record-list-page` + `app-record-row` (or a table with the same slots). Detail pages use `app-record-detail-layout` + `app-field-list`. Forms use `app-form-field` for every control, are at most 760 px wide, and have Save bottom-right (sticky on mobile).
- [ ] All status and severity badges use `app-status-badge` / `toneFor`. Every local `*Tone()` function is deleted (`grep -n "Tone(" features/<path>` returns nothing).
- [ ] Learning sits in `app-help-strip` only. No other learning buttons. Why-it-matters sits below the list, collapsed for non-beginners.
- [ ] Only design tokens are used (no `text-[..px]` or `rounded-[..]` in the module).
- [ ] A gear `settingsLink` opens the module's settings. The module card in the `/settings` hub lists its type, template and settings pages.

### 3.5 Copy, states, guidance, mobile, a11y
- [ ] No raw values reach users. Enums, types, seeded type names, `.rN` refs, field keys and `**markdown**` are all translated or rendered. Seeded vocabulary (types, categories) has nb names in demo and seed data.
- [ ] Copy follows `docs/ux-guide.md`: du/organisasjonen, verb + object buttons, the same words in the list button, the empty-state CTA and the form title, "Ikke satt" / "Ingen", "KI" in nb, sentences under 20 words, no anglicisms, the glossary (§3.6).
- [ ] i18n: en and nb have full parity in the scoped files (parity spec passes). Guidance and how-to files also have parity. nb reads as natural, professional Bokmål (a native-quality pass, not a word-for-word translation).
- [ ] Every list has a teaching empty state with a CTA. Every async view has `app-loading-state` and `app-error-state` with retry. Form errors say what to fix.
- [ ] Beginner guidance:
  - The guide intro says in 1-2 sentences what the page is for, in everyday words.
  - Every ISO term is wrapped in `<app-term>` on first use.
  - At least one lesson and one tour exist.
  - The first-visit experience of the module is checked with the guidance level set to beginner.
- [ ] Mobile at 375 px and 390 px, with the drawer nav: no horizontal scroll (`scrollWidth ≤ innerWidth`), the list is visible in the first screen, tap targets are ≥ 24 px and dialogs fit. Screenshots go in `cf-test/polish-audit/after/<area>/`.
- [ ] a11y: labels on every input, the focus order follows the layout, Escape closes dialogs and menus, icon-only buttons have `aria-label`, contrast uses tokens only, and the page `<title>` is set.
- [ ] Checks are clean:
  - backend: the cf-test harness (ruff, format, mypy, pytest)
  - portal: lint, test and build, plus `npx prettier --write` on the changed files

### 3.6 nb terminology list (binding; also in `docs/ux-guide.md`)

| Concept (en) | nb (UI) | Never |
|---|---|---|
| standard / regulation (ISO, GDPR, NIS2, AI Act) | standard | rammeverk |
| the organisation's management system | styringssystem | – |
| requirement | krav | kravpunkt |
| clause / article number | punkt (ISO) · artikkel (EU) | klausul, seksjon |
| control (ISO 27001 Annex A) | kontroll | tiltak (in this sense) |
| evidence | dokumentasjon | bevis, evidens |
| "supports requirements" panel | Krav dette dokumenterer | Støtter krav |
| readiness score | kravdekning | modenhet, beredskap |
| gap | mangler / hull ("3 krav mangler dokumentasjon") | gap |
| Harmonised Structure clause | felles ISO-krav | ISO HS, HS |
| nonconformity / deviation record | avvik | – |
| incident (real-world event) | hendelse | – |
| system event / activity | aktivitet / varseltype | hendelse |
| audit / inspection finding | funn ("Funn: mindre avvik") | – |
| corrective action / action | korrigerende tiltak / tiltak | handling |
| task | oppgave | – |
| risk owner / treatment | risikoeier / risikobehandling | – |
| Statement of Applicability | anvendelseserklæring (SoA) | – |
| interested party | interessent | – |
| objective / KPI | mål / nøkkeltall (KPI) | – |
| management review | ledelsens gjennomgang | – |
| competence / awareness | kompetanse / bevissthet | – |
| supplier evaluation | leverandørvurdering | – |
| processing record (ROPA) | behandlingsprotokoll | ROPA alone |
| DPIA | personvernkonsekvensvurdering (DPIA) | – |
| data subject request | henvendelse fra registrert | DSR alone |
| personal-data breach | personvernbrudd | brudd alone |
| processor / DPA | databehandler / databehandleravtale | – |
| AI / AI system | KI / KI-system | AI (in nb) |
| AI Act provider / deployer | tilbyder / idriftsetter | ibruktaker, leverandør (in this sense) |
| business impact analysis | konsekvensanalyse (BIA) | – |
| SJA / PPE | sikker jobbanalyse (SJA) / personlig verneutstyr (PVU) | – |
| environmental aspect | miljøaspekt | – |
| compliance obligation | lovkrav og forpliktelser (record: forpliktelse) | samsvarskrav |
| dashboard | oversikt | dashbord |
| My work | Mitt arbeid | – |
| tour / lesson / explain | omvisning / leksjon / forklar denne siden | Lær meg, Minikurs, Ta omvisningen |
| draft / approved / overdue | utkast / godkjent / forfalt | – |
| severity levels | lav / middels / høy / kritisk | moderat |
| unset value / empty list | Ikke satt / Ingen | Tom, N/A, Ikke angitt |

The nav label for obligations is "Lover og forskrifter" (§2.4), and the page h1 is the same. A record is "forpliktelse".

### 3.7 Area list (order = migration order)

| Id | Area (portal path / module key) | Migration | Notes beyond the checklist |
|---|---|---|---|
| A01 | context / `context` | `cf70_a01_context` | interested-party requirements → obligations links |
| A02 | processes / `processes` | `cf71_a02_processes` | process map nodes link to documents, risks and KPIs |
| A03 | deviations / `deviations` | `cf72_a03_deviations` | move onto record-list-page; nb names for seeded types; `clauses[]` picker; the "Standarder" field is replaced by requirement chips; flows to risk, task and training |
| A04 | risk / `risk` | `cf73_a04_risk` | normalise `control_refs`; SoA → `apply_applicability`; 42001 SoA seeded |
| A05 | inspections / `inspections` | `cf74_a05_inspections` | finding → deviation keeps working; inspection ↔ deviation auto link |
| A06 | audits / `audits` | `cf75_a06_audits` | clause pickers; a finding against a clause flags the requirement |
| A07 | management-review / `management_review` | `cf76_a07_mr` | inputs auto-collected from the connected records |
| A08 | objectives / `objectives` | `cf77_a08_objectives` | KPI ↔ objective structural |
| A09 | people / `people` | `cf78_a09_people` | back-link text; competence gaps in `EntityQuerySpec` |
| A10 | recruitment / `recruitment` | `cf79_a10_recruitment` | nav and h1 "Rekruttering" |
| A11 | training / `training` | `cf80_a11_training` | assignments with names for "who must renew" |
| A12 | contracts / `contracts` | `cf81_a12_contracts` | supplier → contract flow end |
| A13 | suppliers / `suppliers` | `cf82_a13_suppliers` | personal-data suppliers vs processor/DPA check |
| A14 | projects / `projects` | `cf83_a14_projects` | project ↔ change_request structural |
| A15 | privacy / `privacy` | `cf84_a15_privacy` | the worst assistant area (2/12): list specs for all types; breach ↔ deviation |
| A16 | ai-governance / `ai_governance` | `cf85_a16_aigov` | tilbyder/idriftsetter wording |
| A17 | environment / `environment` | `cf86_a17_environment` | emissions per year (date-aware) |
| A18 | obligations / `obligations` | `cf87_a18_obligations` | structured `article_refs` |
| A19 | assets / `assets` | `cf88_a19_assets` | calibration searchable |
| A20 | continuity / `continuity` | `cf89_a20_continuity` | – |
| A21 | hse / `hse` | `cf90_a21_hse` | PPE "overdue" date-aware |
| A22 | feedback / `feedback` | `cf91_a22_feedback` | – |
| A23 | reports / `reports` | `cf92_a23_reports` | remove the duplicate compliance overview; keep exports and audit packs; the audit pack includes the requirement-evidence matrix from P1 |
| A24 | documents / `documents` | `cf93_a24_documents` | adopt record-detail-layout; translate document types; `clause_ref` decision; Relatert panel |
| A25 | standards (polish on top of P1) | `cf94_a25_standards` (likely empty → omit and say so) | copy, mobile overflow, gap UX, journey entry |
| A26 | settings, account, learning | `cf95_a26_settings` (likely empty → omit) | hub content, notification wording ("varseltyper"), `live_sql` for document_type/record_type/workflow_definition |

Branches: `core/aNN-<path>-polish`, `portal/aNN-<path>-polish`. Worktrees:
`D:\Projects\CoreFlow\wt\{core,portal}-aNN-<path>-polish`. Foundation branches:
`{core,portal}/p1-requirements`, `p2-assistant`, `p3-design` (portal only), `p4-connections`
and `p5-home`.

---

## 4. Demo data expectations

The product owner must **see** the connections in the first five minutes. Every area extends
its `demo.py` (idempotent, matched by code) so that the following holds after `seed-demo` (or
`demo-connect` on the existing sandbox):

1. **Every demo record has at least one confirmed requirement link** in the standards the demo org has enabled. Links come from fields where the module has them (`origin=field`) and are explicit otherwise. At least a third of records also carry 1-3 **suggested** links, so the Confirm flow can be shown.
2. **Readiness looks real:** ISO 9001 and ISO 27001 at 35-60 %, GDPR at 40-60 %, ISO 14001 and ISO 45001 at 20-40 %, and the AI Act and ISO 42001 at 15-30 %. No standard should be at 0 % or 100 %. Each standard keeps a few clear gaps, so "what should I do next" has content. P4's `demo_connections` checks this and prints the scores.
3. **Showcase chains.** Each one is clickable end to end and also answerable by the assistant:
   - ISO 27001 A.8.13 (backup):
     - SoA entry (applicable, implemented)
     - RSK-0001 and RSK-0006 (control_refs)
     - their treatment
     - audit plan AUD-2026-002
     - the backup procedure document
     - continuity plan
     - a task
   - ISO 9001 8.4.1 (external providers):
     - supplier SUP-0002
     - its supplier evaluation
     - contract
     - procedure PRO-004
     - a deviation from a late delivery → a risk created from it (flow link) → a training assignment
   - GDPR Art. 33 (breach):
     - data breach BR-0002 ↔ deviation SEC-0002 ↔ ROPA entry ↔ processor (with DPA contract) ↔ DPIA ↔ risk
   - ISO 45001 6.1.2 (hazards):
     - SJA ↔ HSE risk ↔ inspection with finding → deviation (HMS-1 ladder near-miss) → corrective action → training record
   - AI Act Art. 26 (deployer):
     - AI system ↔ AI assessment ↔ DPIA ↔ obligation (AI Act) ↔ policy ↔ course
4. **Every module has at least 3 entity links between its own records and at least 3 to other modules.** Each area exports `DEMO_LINKS: list[tuple[str, str, str, str, str]]`, i.e. `(source_type, source_code, target_type, target_code, link_type)`, from its `demo.py`. P4's `demo_connections` resolves them after all seeders have run.
5. **People are connected:** owners are spread over the 5-6 demo users. Lars Olsen owns risks, Emma Kristiansen has an overdue training. Each demo user has 3-8 My Work items, including at least one overdue item.
6. **One active journey:** ISO 27001 at about 40 % (some steps done, the next step obvious). There is a pending suggestion batch ("Bekreft 13 foreslåtte krav") on PRO-004.
7. **Seeded vocabulary in nb:** deviation types, document types, categories and checklist names have nb names when the org language is nb. English record *content* is acceptable, but titles of the showcase records are in nb.
8. **No shared-DB surprises:** demo changes run only through `seed-demo` / `demo-connect`, which are idempotent, touch only the demo org and never delete user-made data. Agents never run raw SQL on the sandbox.

---

## 5. Migration ids, branches, merge order

- Foundation: `cf60_requirement_layer` (P1), `cf61_assistant_v2` (P2), `cf62_connections` (P4) and `cf63_journeys` (P5). P3 has none.
- Areas: `cf70_a01_context` … `cf95_a26_settings` as listed in §3.7. Ids are ≤ 32 chars. An area with no schema change omits its migration and says so in its report. The ids are reserved anyway.
- Every migration is written with `down_revision` = the current head of `origin/main` when the branch is created. **The integrator re-chains** by editing only `down_revision`, in merge order: P3, P1, P4, P2, P5, then A01…A26 in the order they finish.
- Migration rules from contracts §13 apply:
  - one migration per item
  - imports only alembic and sqlalchemy
  - a downgrade is required
  - no data loss
  - permissions in the same migration
- Data normalisation (clause ref formats, nb type names) happens in the owning area's migration. It is idempotent and is never done in a foundation migration.
- After the foundation merges, the integrator runs `update-dev.ps1` (pull, rebuild, migrate the sandbox, restart), then `demo-connect`, then the assistant-eval harness. The baseline score is recorded in `cf-test/polish-audit/assistant-eval-r2.md`. Areas compare against it.

---

## 6. Decisions taken (nobody available to ask)

1. **`requirement_link` stays the single source of readiness.** Fields, SoA and AI write rows into it (`origin` says why) rather than readiness reading five sources. This keeps one answer to "why is this requirement covered?" and one place to confirm or reject.
2. **Field refs count as confirmed, declarations never do.** A user typing A.8.13 on a risk is an explicit claim. A record type that *can* evidence 6.1 proves nothing on its own. Declarations only produce suggestions: AI-ranked, or as a virtual list when AI is off.
3. **Audit findings produce suggested links, not confirmed ones.** A nonconformity against a clause is evidence that the clause is *weak*, not covered. The requirement page shows it as an open finding.
4. **SoA "not applicable" marks the Annex A requirements not applicable** (with the SoA entry as justification), so readiness uses the right denominator.
5. **Canonical clause ref = framework key** (`iso27001:A.8.13`), so refs survive a standard version change. The parser still accepts the standard-key form.
6. **Structural FK relations are shown, not copied** into `entity_link`, so there is no duplicated state to drift.
7. **Generic assistant tools over a per-type `EntityQuerySpec`** replace keyword guessing. The tool list is narrowed to the generic tools plus the page's module, for speed. The acceptance bar is the evaluation harness, not code review.
8. **How-to content lives in core** (`app/ai/howto/`), because the assistant runs server-side. Portal guidance stays in portal assets. Areas write both.
9. **The navigation regroup in design.md §4.3 is adopted as the decision.** It was previously "a recommendation only". P3 owns `nav.ts`, and "Trenger din gjennomgang" moves into My Work.
10. **One "are we compliant?" answer per level:**
    - Dashboard: summary and next actions.
    - Standards: detail and gaps.
    - Reports: exports and audit packs.

    The dashboard maturity block and the Reports compliance overview are removed.
11. **Readiness is called "Kravdekning"** in nb ("Requirement coverage" in en) and is never shown in red. Low coverage is a to-do, not a failure.
12. **`record-detail-layout` / `record-list-page` belong to P3.** P4 fills the connection defaults after P3 merges, which is the only shared-file exception. P5's journey page mounts under P1's standards routes through one agreed lazy child route.
13. **AI Act roles in nb are "tilbyder" and "idriftsetter"**, following the official Norwegian translation of the regulation.
14. The per-area UX reports were still being written. The default-clause table (§3.1) and the area notes (§3.7) come from the connectivity, design and assistant audits. Each area must read its own UX report and treat its findings as additions to the checklist.
15. Demo data targets (§4) are ranges, not exact numbers, so areas can seed independently. P4's final step reports the actual scores, and the integrator adjusts if a standard falls outside its range.

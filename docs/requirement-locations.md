# CoreFlow requirement locations ("Her fyller du ut dette")

Status: architect design, written 2026-11-17, before any engineer starts. Base: core `7f3f554`
(Alembic head `cf61_assistant_everything`), portal `e131e98`.

Implements backlog items **I24** (evidence rules engine), **I25** and **I26** (rule packs) from
`cf-test/discovery/improvement-backlog.md`, reshaped by the product owner's request below.
It builds **on** the P1 requirement layer (`requirement_link` with `origin`, `requirement_sync`,
`GET /standard-requirements/{ref}/evidence`, `GET /frameworks/gaps`, readiness `by_origin`).
It does not duplicate any of it.

Binding inputs: `docs/compliance-platform-scope.md`, `docs/platform-contracts.md` (kernel,
§10 F7, §12 module recipe, §13 migrations), `docs/polish-plan.md` (§2.1 conventions, §2.2 P1,
§3.6 nb terms, §6 decisions). Precedence: this file > `polish-plan.md` > `platform-contracts.md`
for the topics covered here, and **only** for those topics.

Machine-readable vocabulary (section 8): `D:\Projects\CoreFlow\cf-test\req-locations\locations.json`.

Contents

0. The request, and the idea in one page
1. Location registry
2. Evidence rule model
3. Requirement → locations mapping (seed files and org overrides)
4. Status: how everything combines
5. API
6. UI
7. Ownership, migration and build order
8. Location vocabulary (all keys and routes)
9. Decisions taken (nobody available to ask)

---

## 0. The request, and the idea in one page

**Product owner (paraphrased from the screenshots):** on the page for ISO 9001 4.2 ("Det finnes
en oversikt over interessentene som har betydning for kvalitetsstyringssystemet") the user has to
link single records, for example the stakeholder "IP-4 Data Protection Authority". That is the
wrong level. The requirement should point straight to the place where the user fills it in,
"Kontekst og ledelse → Interessenter". The platform should know where the data for every
requirement lives. Status should come from the state of that place: the register exists, has
active entries, the entries are handled, and they were reviewed recently. Linking single records
stays possible as extra evidence.

**Today (P1).** A requirement is covered only by rows in `requirement_link`. Each row points
from one requirement to one record. Clause declarations (`ModuleSpec.clauses`) tell us which
*record types* can evidence a clause. They are used only for "Kan dokumenteres med" buttons and
for suggestions. They never count. So 4.2 shows "Ikke startet" while the stakeholder register
holds six well-kept entries, unless someone links one of them by hand. And once someone links
one entry, 4.2 shows "Dekket" even if the other five are not handled.

**The idea.** Three new concepts:

1. A **location** is a named place in CoreFlow where compliance data lives, with an exact portal
   route. Example: `context.interested_parties` → `/context/interested-parties`. Modules
   declare their locations, the same way they declare entity types.
2. An **evidence rule** is a declarative, deterministic check over the live data of a location.
   Example: `all_in_state(state="handled", among="active")`. It returns *met / partial / not
   met*, a sentence a human can read ("6 interessenter registrert, 2 ikke håndtert"), and
   freshness. Rules never call the AI.
3. A **requirement → location mapping** is versioned seed data per framework. Example:
   `iso9001 4.2.r1 → context.interested_parties (primary), rules [has_entries(min 1, active,
   scoped to ISO 9001)]`. An org can override a mapping, with a justification.

The requirement page then says, first and prominently:

> **Her fyller du ut dette**
> **Kontekst og ledelse: interessenter**. Registrer interessentene som har betydning, hva de
> trenger og forventer, og hvordan hver av dem ivaretas.
> ◐ 6 interessenter registrert, 2 ikke håndtert · sist endret 3. okt.
> [Gå til Interessenter →]

Record links stay underneath as "Konkret dokumentasjon". Status, readiness, the catalogue tree,
the gap list, the module pages ("Dette oppfyller: ISO 9001 · 4.2, ISO 14001 · 4.2 …") and the
assistant ("hvor dokumenterer jeg X?", "hva mangler for 4.2?") all read the same map.

**Worked example used throughout: ISO 9001 4.2.** It has three requirements (`4.2.r1` list of
parties, `4.2.r2` their requirements, `4.2.r3` which of those the system handles). They come from
the HS file, so ISO 14001, 27001, 42001 and 45001 get the same structure with their own framework
filter:

| Requirement | Primary location | Rule(s) | Example result |
|---|---|---|---|
| 4.2.r1 the parties are listed | `context.interested_parties` | `has_entries(min=1, where={status: active, framework: $framework})` | met: "6 interessenter registrert" |
| 4.2.r2 their requirements are recorded | `context.interested_parties` | `coverage_ratio(numerator="has_requirements", among="active", partial_at=0.5)` | partial: "4 av 6 interessenter har registrerte krav" |
| 4.2.r3 it is decided which are handled | `context.interested_parties` | `all_in_state(state="handled", among="active")` + supporting `obligations.register` | partial: "6 interessenter registrert, 2 ikke håndtert" |

Note: the `framework` scope matches an entry whose `frameworks` list contains the framework or
is empty. An empty list means "applies to the whole management system" (decision D7).

---

## 1. Location registry

### 1.1 Kernel additions (`app/platform/registry.py`, additive, like P1-P5 did)

```python
HOOK_REQUIREMENT_LOCATIONS = "requirement_locations"  # refs -> list[LocationSpec]

LocationKind = Literal["register", "page", "settings"]

@dataclass(frozen=True)
class LocationField:
    column: str                       # model attribute, e.g. "addressed_status"
    kind: Literal["enum", "bool", "date", "datetime", "tags", "text", "fk", "number"]
    # "tags" = JSONB list of strings; framework scoping uses "contains or empty"
    scope_empty_matches: bool = False # tags only: an empty list matches any value

@dataclass(frozen=True)
class LocationSpec:
    key: str                          # "<module>.<place>", <= 64 chars, globally unique
    module: str                       # owning module key ("platform" for settings pages)
    label_key: str                    # "locations.<key>.label"
    description_key: str              # "locations.<key>.description"
    route: str                        # portal path; may hold {standard_key} {framework} {number} {ref}
    kind: LocationKind = "register"
    query: Mapping[str, str] = field(default_factory=dict)  # same placeholders allowed
    entity_type: str | None = None    # registered EntityTypeSpec, when the place is a record list
    model: str | None = None          # "app.modules.context.models:InterestedParty" (the rows rules count)
    org_column: str = "org_id"
    live: str | None = None           # ref -> callable(model) -> SQL condition; default "deleted_at IS NULL"
    fields: Mapping[str, LocationField] = field(default_factory=dict)  # filterable logical fields
    states: Mapping[str, Mapping[str, Any]] = field(default_factory=dict)  # named predicates (1.3)
    dates: Mapping[str, str] = field(default_factory=dict)  # logical date -> column ("reviewed" -> "last_reviewed_at")
    default_population: str | None = None  # state used when a rule gives no `among` (e.g. "active")
    rule_kinds: tuple[str, ...] = ()  # allowed rule kinds (section 2.3); validated at startup
    custom_rules: Mapping[str, str] = field(default_factory=dict)  # name -> ref of a custom predicate
    settings: str | None = None       # ref -> async (session, org_id) -> Mapping[str, Any] (settings pages)
    read_permission: str | None = None  # None = entity type's read permission, or "member"
    noun_key: str = ""                # "locations.nouns.interested_party" (one/other), for messages
```

`registry.locations() -> dict[str, LocationSpec]` returns the merged map. A module manifest
entry **wins** over the central fallback entry with the same key. That lets a module take
ownership of its locations later without a flag day.

### 1.2 Where specs live

- **Central fallback file (this build):** `app/platform/locations/catalog.py` declares **all**
  locations in section 8. They are built from small helper constructors
  (`register(...)`, `page(...)`, `settings(...)`). They are registered under the hook by
  `app/platform/locations/manifest.py`. Why central first: the module packages
  (`app/modules/<key>/**`) are owned by the polish areas A01-A26 that are running now. Editing
  25 manifests in parallel with them would clash (see section 7).
- **Module manifests (later, module owners):** a module moves its entries into
  `app/modules/<key>/locations.py` and adds `HOOK_REQUIREMENT_LOCATIONS:
  ["app.modules.<key>.locations:LOCATIONS"]` to its manifest. Same keys, so nothing else
  changes. It then deletes its entries from `catalog.py` in the same PR. A startup check warns
  when both define a key, and the module wins.
- Texts: the bilingual label and description live in core, in
  `app/platform/locations/i18n/{en,nb}.json`. They are keyed by `label_key`,
  `description_key` and `noun_key`. The API returns them already resolved in the request `lang`.
  The assistant and server-rendered explanations need them too, so core is the one source.
  The portal never duplicates these strings. It only has its own chrome strings (section 6.6).

### 1.3 Named states (predicates)

Rules never contain raw SQL or column names. They refer to **named states** that the location
declares. A state is a tiny declarative predicate over `fields`:

```python
states={
  "active":   {"status": ["active"]},
  "archived": {"status": ["archived"]},
  "handled":  {"addressed": ["addressed", "not_relevant"]},
  "has_requirements": {"requirements": {"not_empty": True}},
  "has_owner": {"owner": {"is_null": False}},
}
```

The predicate grammar has the same operators as rule `where` filters (2.2). A state may also be
`{"custom": "<name>"}`, which points at a `custom_rules` entry, for things that need a join
(for example `measured_on_time` on KPIs). The `live` condition (not soft-deleted, not retired as
the module defines it) and the org condition are **always** applied by the evaluator. A spec cannot
switch them off.

### 1.4 Validation (unit test plus startup log)

The test `tests/platform/test_locations_catalog.py`:
- every key matches `^[a-z_]+\.[a-z_]+$`
- `module` is a registered module, or "platform"
- `entity_type` is registered
- `model` imports
- every `fields[*].column` exists on the model
- every state only uses declared fields
- every `rule_kinds` entry is a known kind
- every route starts with `/`, and its first segment is a known portal module path (from `ModuleSpec.portal_path`, plus `settings`, `tasks`, `my-work`)
- every `label_key`, `description_key` and `noun_key` exists in both `en.json` and `nb.json` (parity)
- `locations.json` in cf-test is **not** read by code. It is a published vocabulary. A test compares the key set of `catalog.py` with a checked-in copy, `app/platform/locations/locations.keys.txt`, so a renamed key fails loudly.

---

## 2. Evidence rule model

### 2.1 Result shape

```python
@dataclass(frozen=True)
class RuleResult:
    outcome: Literal["met", "partial", "not_met", "not_evaluable"]
    score: float                    # 0..1 (met = 1.0, not_met = 0.0, partial = ratio or 0.5)
    counts: Mapping[str, int]       # e.g. {"total": 6, "matching": 4, "missing": 2}
    message: Message                # {key: "locations:rules.all_in_state.partial", params: {...}}
    as_of: datetime | None          # newest change in the evaluated rows (freshness)
    fresh: bool                     # as_of within FRESH_DAYS (365), or the rule's own window
    next_change_at: datetime | None # earliest time the outcome flips by itself (a review falls due)
    sample_ids: tuple[uuid.UUID, ...]  # <= 5 rows that explain a shortfall (not handled, overdue)
```

`not_evaluable` means the module is off, the location does not exist for this org, or a custom
predicate raised an error (which is logged). It never counts as `not_met`. See 4.2.

Messages are i18n keys plus params, rendered in core (`app/platform/locations/messages.py`
with `i18n/{en,nb}.json`). Plural forms use `{n, plural, one {…} other {…}}`. The location noun
comes from `noun_key`. Examples (nb):
- `has_entries.met`: "{n} {noun} registrert"
- `has_entries.not_met`: "Ingen {noun_other} registrert ennå"
- `all_in_state.partial`: "{total} {noun} registrert, {missing} {state_not}". For interested parties, `state_not` = "ikke håndtert".
- `reviewed_within.partial`: "{stale} av {total} ikke gjennomgått siste {days} dager"
- `none_overdue.partial`: "{overdue} på overtid"
- `record_exists.met` (approved scope): "Godkjent {noun} finnes (versjon {version}, {date})"

The state labels used in messages (`state_not`, `state_label`) come from
`locations.<key>.states.<state>` in the same i18n files. They are optional, and the generic
fallback is "ikke i ønsket status".

### 2.2 Filter grammar (`where`, also used by named states)

```json
{ "<field>": "value" | ["v1","v2"] | {"not": [...]} | {"is_null": true}
             | {"not_empty": true} | {"gte": n} | {"lte": n} | {"within_days": n},
  "state": "<named state>",          // AND with a named state
  "framework": "$framework" }        // placeholder, see below
```

- All keys are ANDed. There is no OR at this level. Use a named state with `"any": [...]` when needed.
- Placeholders are filled from the requirement being evaluated:
  - `$framework` (e.g. `iso9001`)
  - `$standard_key` (`iso9001-2026`)
  - `$number` (clause number, `4.2`)
  - `$ref` (the requirement ref)
- On a `tags` field with `scope_empty_matches`, `{"framework": "$framework"}` means *contains
  the framework OR the list is empty*. On an `enum` field it means equality, and null matches
  when the field is declared nullable-as-all. That is used for `context_analysis.framework`.
- Unknown fields and operators fail validation at load time, never at runtime.

### 2.3 Rule kinds (closed vocabulary, `app/platform/locations/rules.py`)

Every rule is `{"kind": "...", ...params}`. Common optional params:
- `where` (filter)
- `among`: the population, a named state. Defaults to `default_population`, else all live rows.
- `label`: an override message key, for a phrase specific to the requirement.

| Kind | Params | met | partial | not_met |
|---|---|---|---|---|
| `has_entries` | `min=1`, `where` | count ≥ min | 0 < count < min | count = 0 |
| `record_exists` | `where` (usually a state such as `approved`), `min=1`, `within_days?`, `date="approved"` | ≥ min rows match (and date within window) | rows match but are outside the window (stale) | no match |
| `all_in_state` | `state`, `among`, `tolerance=0` | total ≥ 1 and missing ≤ tolerance | some in state | none in state, or total = 0 |
| `coverage_ratio` | `numerator` (state or where), `among`, `met_at=1.0`, `partial_at=0.5` | ratio ≥ met_at | ratio ≥ partial_at | below, or empty population |
| `reviewed_within` | `days`, `date="reviewed"`, `among`, `mode="all"\|"latest"` | all (or the latest) dated within `days` | `all`: some within | none within, or no rows |
| `none_overdue` | `date="next_review"\|"due"`, `among`, `allow_empty=false` | rows exist and none is past its date | some overdue | all overdue, or empty and not `allow_empty` |
| `approved_document` | `types=[...]` (document type keys), `clause?` (`$number` allowed), `min=1`, `within_days?` | ≥ min approved, not overdue for review | approved but review overdue | none approved |
| `each_has_related` | `target_type`, `among`, `link_types?`, `direction="any"` | every row has ≥ 1 related `target_type` (structural relation or `entity_link`) | some do | none do |
| `task_recurring_active` | `kind?`, `entity_type?` (defaults to the location's), `module?` | an active `task_recurrence` exists whose last occurrence is not overdue | active but the current occurrence is overdue | none active |
| `setting_is` | `setting`, `equals=true` | the location's `settings()` value equals | n/a | differs or missing |
| `custom` | `name` (a key of the location's `custom_rules`), free params | returned by the predicate | returned | returned |

Rule notes:
- `approved_document` is available on `documents.register` only. It reads `Document.type`,
  `current_approved_revision_id IS NOT NULL` and `next_review_at`.
- `each_has_related` uses P4 `HOOK_STRUCTURAL_RELATIONS` resolvers when the relation is
  structural, otherwise `entity_link`. The evaluator does one `EXISTS` per row set, never N+1.
- `task_recurring_active` is allowed on every location with a module or an entity type, so it
  is listed as a base kind in section 8.
- `custom` is the escape hatch for checks that need joins or clocks. Examples:
  - "the latest signed management review contains the input `supplier_performance`"
  - "every critical ICT system tested within its own interval"
  - "the 72-hour breach clock"

  A custom predicate is a module-owned async function `(ctx, params) -> RuleResult`. It is
  code-reviewed, has unit tests, is org-scoped through `ctx.base_query()`, and must not call the AI.

**Combining rules in one mapping:** `"combine": "all"` (default, the worst outcome wins, the
score is the minimum) or `"any"` (the best outcome wins). The message shown is the one from the
deciding rule. With `all` this is the first rule that is not met, so the user sees what to do next.

### 2.4 Evaluation engine (`app/platform/locations/engine.py`)

- **Batched per location.** For one org, every rule that targets a location (across all mapped
  requirements and frameworks) becomes aggregate columns on **one** query against the location's
  model: `count(*) FILTER (WHERE …)` per distinct (population, numerator) pair, plus
  `max(updated_at)` and `min(next date)`. A full org evaluation is about one query per used
  location (≤ ~100). Samples (≤ 5 ids) are fetched with one extra
  `LIMIT 5` query only for rules that came out `partial`/`not_met`.
- **Tenant safety.** The evaluator builds `WHERE <org_column> = :org_id AND <live>` itself, and
  specs only contribute predicates. A test runs every catalogue location for two orgs with
  disjoint data and asserts zero cross-counts.
- **Never AI.** The engine package must not import `app.ai`. A test asserts this with an import
  graph check.
- **Cache table** `location_rule_result` (section 7.2). Key: `(org_id, signature)`, where
  `signature = sha1(location_key + canonical JSON of rule with placeholders resolved)`. Many
  requirements share one signature. For example, the HS 4.2 rule over interested parties for
  ISO 9001 and ISO 14001 differ only in `$framework`, so the two give two rows, not five.
- **Invalidation (F3).** `app.platform.locations.sink:invalidate` is registered as an
  `HOOK_EVENT_SINKS` entry. On every `DomainEventIn` it looks up the locations whose
  `entity_type` (or declared `watch_types`) equals `event.entity_type`, through an in-memory
  index. It then runs a single `UPDATE location_rule_result SET dirty = true WHERE org_id = :org
  AND location_key = ANY(:keys)` in the same transaction. These things mark the whole org dirty:
  - module enable or disable (F1 events `module.enabled` / `module.disabled`, `entity_type="organization"`)
  - standard enable or disable (`org_standard.enabled` / `org_standard.disabled`)
  - an override change
- **Time.** `valid_until = min(evaluated_at + 24 h, next_change_at)`, so "review falls due
  tomorrow" flips without an event. A nightly beat task
  (`locations.evaluate_all_orgs`, 02:30) re-evaluates dirty or expired rows for every org.
  It keeps readiness snapshots cheap.
- **Read path.** `results_for(session, org_id, signatures)` returns cached rows. Dirty or
  expired rows are re-evaluated synchronously, grouped by location, within a 1.5 s budget.
  Anything over budget is returned with `stale: true`, and a Celery
  re-evaluation for the org is queued. The upsert runs in its own short transaction
  (`ON CONFLICT (org_id, signature) DO UPDATE`).
- Modules that change data without emitting an event are a bug. The 24 h `valid_until` bounds
  the damage. The QA checklist for every area already demands events (F3).

---

## 3. Requirement → locations mapping

### 3.1 Seed files (versioned, per framework)

Directory: `app/standards/locations/` (a sibling of `catalog/`, so the standards loader never
reads it). Format: **JSON**, the same as the catalogue and `catalog/mappings/` (decision D2).

```
app/standards/locations/
  README.md               # the format, for framework mappers
  hs.json                 # Harmonised Structure clauses, applied to every enabled ISO standard
  iso9001.json  iso27001.json  iso14001.json  iso45001.json  iso42001.json
  gdpr.json     eu_ai_act.json nis2.json
```

```json
{
  "schema_version": 1,
  "framework": "iso9001",              // "hs" in hs.json
  "standard_key": "iso9001-2026",      // omitted in hs.json
  "version": "2026.11.1",              // bump on every content change (shown in the audit trail)
  "mappings": {
    "4.2.r1": [
      { "location": "context.interested_parties",
        "role": "primary",
        "rules": [ { "kind": "has_entries", "min": 1,
                     "where": { "state": "active", "framework": "$framework" } } ],
        "note": { "en": "List every party that matters to quality.",
                  "nb": "Før opp alle parter som har betydning for kvaliteten." } }
    ],
    "4.2.r3": [
      { "location": "context.interested_parties", "role": "primary",
        "rules": [ { "kind": "all_in_state", "state": "handled",
                     "among": "active", "where": { "framework": "$framework" } } ] },
      { "location": "obligations.register", "role": "supporting",
        "rules": [ { "kind": "has_entries", "where": { "state": "active", "framework": "$framework" } } ] }
    ],
    "8.4": [ /* clause-level: applies to every requirement of 8.4.* without its own entry */ ]
  }
}
```

- **Keys** are catalogue numbers without the standard prefix. A `<number>.r<n>` key is a single
  requirement. A bare `<number>` key is a clause, and it applies to every requirement of that
  clause and of its sub-clauses that has no more specific entry.
- **Roles:**
  - `primary` = "fill it in here". These drive status.
  - `supporting` = "also relevant". These are shown under the primary block, and they can only lift `not_met` to `partial` (4.1).
- `rules` may be empty on a `supporting` entry (a pure pointer, for example `reports.registers`).
  A `primary` entry must have ≥ 1 rule.
- **Precedence:** a requirement key in the framework file, then a clause key in the framework
  file (the most specific number wins), then `hs.json` (by the catalogue clause's `hs` value).
  An entry at a more specific level **replaces** the inherited list for that requirement, unless
  it sets `"extends": true`, in which case it is appended.
- `hs.json` keys are HS clause numbers (`"4.2"`, `"9.3"`) or `"4.2.r1"`-style keys. A
  requirement-style key in `hs.json` applies only where the standard's requirement at that
  position exists. Mappers should prefer clause-level keys in `hs.json`.
- **Loader** (`app/platform/locations/mapping.py`): it reads and validates all files at import,
  in milliseconds, and caches them per process:
  - unknown location or rule kind → error
  - rule kind not in the location's `rule_kinds` → error
  - unknown requirement or clause → error, checked against the catalogue JSON files rather than the DB, so tests need no seed
  - a state or field the location does not declare → error

  It exposes `mappings_for(standard_key, requirement_ref) -> list[Mapping]` and
  `requirements_for_location(key) -> list[(standard_key, ref, role)]`.
- **Coverage report:** `uv run python -m app.cli location-coverage` prints, per framework, the
  requirements with no primary mapping. The framework mappers use it as their to-do list, and CI
  prints it but does not fail on it.

### 3.2 Org overrides

The table `requirement_location_override` (7.2). An org with `standards:manage` can:
- **disable** a seeded mapping for a requirement, for example "vi dokumenterer interessenter i
  et eget dokument". The mapping is then shown struck through with the justification and does
  not count.
- **add** a location to a requirement, with role and rules chosen from the location's allowed
  kinds (the UI offers presets; see 6.5).
- **replace rules** of a seeded mapping, for example raising `min` or changing `days` from 365
  to 180.
- "Re-point" = disable plus add, done as one UI action in one transaction.

Every override needs a `justification` (1-2000 chars). It is audited with `audit.record`, emits
`requirement_location.overridden`, and marks the org's cache dirty. The target is a requirement
ref (`iso9001-2026:4.2.r3`) or a canonical clause ref (`iso9001:4.2`, which applies to all
requirements of the clause). Overrides survive a seed version bump. If the seed mapping they
refer to disappears, the override shows as "orphaned" in the UI and stops counting.

---

## 4. Status: how everything combines

### 4.1 Per requirement (`app/platform/locations/status.py`, pure function plus loader)

Inputs for requirement R in org O:

- **A**: applicability (`OrgRequirementState.applicable`, SoA through P1 `apply_applicability`, AI Act derivation). Unchanged.
- **M**: manual assessment (`OrgRequirementState.status_override` ∈ covered/partial/not_started, with `note`). Unchanged.
- **P**: results of the *counted* primary mappings, i.e. seed plus overrides, minus disabled ones, minus `not_evaluable`.
- **S**: results of the counted supporting mappings.
- **L**: confirmed live `requirement_link` rows (count, newest freshness), exactly as P1 computes them today.

```
if not A:                       status = not_applicable                 basis = "applicability"
elif M is set:                  status = M                              basis = "manual"
elif P is empty:                status = covered if L > 0 else not_started   basis = "links"   # today's behaviour
else:
    p = combine_all(P)          # worst outcome over primary mappings
    if p == met:                status = covered                        basis = "location"
    elif p == partial:          status = partial                        basis = "location"
    else:  # not_met
        if L > 0 or any(s == met for s in S):
                                status = partial                        basis = "location+links"
        else:                   status = not_started                    basis = "location"
fresh = (basis == "links"    and newest(L) within 365 d)
     or (basis == "manual"   and state.updated_at within 365 d)          # as today
     or (basis startswith "location" and all(r.fresh for r in P))
```

Why links cannot lift a primary `partial` to `covered`: a link to one stakeholder must not hide
that two others are not handled. This was exactly the PO's complaint (D3). If an org really
documents the requirement elsewhere, it disables or re-points the mapping, with a justification
(3.2).

If **every** primary mapping is `not_evaluable` (module off), the requirement falls back to the
`links` basis. The UI then shows "Modulen Kontekst og ledelse er ikke slått på" with an "Slå på"
link (6.1).

### 4.2 Readiness (per standard), the catalogue tree and the gap list

- `frameworks.readiness()` keeps its formula and weights: covered and fresh 1.0, covered and stale
  0.6, partial 0.5, otherwise 0. The only change is that status comes from
  `locations.status.requirement_statuses(session, org_id, req_rows, states, evidence)`. That
  function receives the inputs readiness already loads (states, link counts, freshness) and adds
  P/S from the cache.
- `by_origin` gains `"location"`, the number of requirements covered on the location basis.
  `by_basis` is added: `{location, links, manual}`. Existing keys and fields are unchanged.
- `standards_service.requirement_status()` and the tree overlay call the same function. A
  requirement's DTO gains optional fields: `basis`, `location_outcome`, `location_text` (short)
  and `primary_locations: [key]`. Old clients ignore them.
- `GET /frameworks/gaps` items gain `fill_in: [LocationLite]` next to the existing `fix_in`.
  The gap list sorts requirements whose primary location is partial before those with nothing
  at all (a quick win first).
- **Backward compatibility:** no mapping means the same status as before, bit for bit. A
  regression test computes readiness for the demo org with the mapping files emptied and
  compares it with the P1 result.

### 4.3 What "freshness" means for a location

`as_of` is the newest of the rows' `updated_at`, or of the rule's own date column (for example
`last_reviewed_at`). A register that nobody touched in 13 months is "stale", even if it is
complete. It then weighs 0.6, and the UI shows "Ikke oppdatert siste 12 mnd". `reviewed_within`
rules make review dates part of `met` itself. Mappers use them where the standard demands
periodic review.

---

## 5. API (prefix `/api/v1/orgs/{org_id}`, router `app/platform/locations/routes.py`)

All endpoints are read-only except the overrides. `lang` defaults to the user's language. No
endpoint calls the AI.

```ts
// shared DTOs
LocationLite = { key, module, module_enabled: boolean, label: string, route: string,
                 query: Record<string,string>, url: string }           // url = route + query, placeholders filled
LocationResult = LocationLite & {
  description: string, kind: 'register'|'page'|'settings', role: 'primary'|'supporting',
  outcome: 'met'|'partial'|'not_met'|'not_evaluable', score: number,
  text: string,                           // rendered message, request lang
  message: { key: string, params: Record<string, string|number> },
  counts: Record<string, number>, as_of: string|null, fresh: boolean, stale: boolean,
  samples: EntityRefDto[],                 // only if the caller can read the entity type
  rules: { kind: string, outcome: string, text: string }[],
  origin: 'seed'|'override', override?: { id, action, justification, by_name, at },
  create_url: string|null }                // entity type's NEW_ROUTES + ?fromRequirement=<ref>
```

| Method, path | Permission | Response |
|---|---|---|
| `GET /requirement-locations?ref=<requirement ref>` | `standards:read` | `{requirement: {ref, label}, status: {status, basis, fresh, text}, primary: LocationResult[], supporting: LocationResult[], disabled: LocationResult[] (overridden off, with justification), links: {confirmed, suggested}}`. `links` are counts only, because the existing `/standard-requirements/{ref}/evidence` stays the source for "Konkret dokumentasjon" |
| `POST /requirement-locations/evaluate` `{refs?: string[] (≤500), standard_key?, chapter?}` | `standards:read` | `{items: {<ref>: {status, basis, outcome, score, fresh, text_short, primary: [location key]}}}`. Bulk, for the catalogue tree, gap list and journey. Uses the cache only, plus re-evaluation of dirty rows within budget |
| `GET /locations?module=&entity_type=` | member | `[LocationLite & {description, kind, rule_kinds, states: [{key, label}]}]` for enabled modules. The vocabulary for the override dialog |
| `GET /locations/{key}/requirements` | member with read on the location | `{location: LocationLite & {description}, items: [{ref, label: {short, number, title}, standard_key, framework, role, outcome, text}]}`. Only enabled standards and applicable requirements, sorted primary first. Feeds "Dette oppfyller" |
| `GET /locations/requirements-by-entity-type?types=a,b` | member | `{<entity_type>: [location key]}`. Lets a record detail page find its location(s) without hard-coding |
| `POST /requirement-locations/overrides` `{target_ref, location_key, action: disable\|add\|replace_rules, role?, rules?, justification}` | `standards:manage` | the created override. Validated like seed entries; audited |
| `PATCH /requirement-locations/overrides/{id}` `{rules?, role?, justification}` | `standards:manage` | updated |
| `DELETE /requirement-locations/overrides/{id}` | `standards:manage` | 204 (soft: `retired_at`) |

The existing `GET /standard-requirements/{ref}/evidence` gains one optional field,
`locations: {primary: LocationLite[], supporting: LocationLite[]}` (no rule results), so
clients that read only that endpoint can still render the button. The live status comes from
`/requirement-locations`.

**Assistant tools** (`app/platform/locations/ai_tools.py`, `HOOK_AI_TOOLS`, permission `standards:read`):
- `where_to_document({ref?: string, question?: string, framework?: string})`
  - With `ref`, it answers for that requirement or clause.
  - With `question`, it resolves it deterministically, in two steps:
    1. P1's `catalogue_search` (bilingual FTS) for the top 3 requirements of enabled standards.
    2. A keyword match over location labels and descriptions in both languages.
  - Returns `{requirements: [{ref, label, status, locations: [{label, url, role, outcome, text}]}], locations: [...]}`.
  - The model phrases the answer and **must** include the `url` links. The tool description says so.
- `requirement_gaps({ref?: string, framework?: string, limit=10})`: "hva mangler for 4.2 / for
  ISO 27001". It returns non-met primary results with `text`, `samples` (titles only if readable)
  and `url`, plus `create_url`.
- P2's page context: on a requirement page (`entityType: 'standard_requirement'`) both tools
  default `ref` to the page's `selection.field`. On a module list page, the context carries
  `location_key` (6.3), so "hva oppfyller denne siden?" needs no arguments.
- How-to content (`app/ai/howto/`, P2-owned) gets one entry, "where do I document X". It
  points at the tool, so the eval harness can test it. The P2 owner adds it, or the integrator
  does in a one-line union.

---

## 6. UI

New portal code is in a new shared folder, so it never collides with the area work:
`src/app/shared/requirement-locations/` and `src/app/core/locations/`. It has its own Transloco
scope `locations` (`src/assets/i18n/locations/{en,nb}.json`), loaded with
`provideSharedScope('locations')` in each component's `viewProviders`. Every string goes in both
files (parity test). No vendor or model names appear.

### 6.1 Requirement page: "Her fyller du ut dette"

Component `<app-requirement-locations [ref] [canManage]>`, mounted at the **top** of the
requirement card (`features/standards/requirement-card.ts`), above evidence. It is one element
and one import (see 7.1 for who adds it).

- A heading, "Her fyller du ut dette" (en "Where you fill this in").
- One card per **primary** location:
  - The location label as the title (e.g. "Kontekst og ledelse: interessenter").
  - The description ("what you do there").
  - The status line: an icon plus `text`. Met uses a solid check (success tone). Partial uses a
    half circle (warning tone). Not met uses an empty circle (neutral tone), **never red**
    (polish D11). The freshness follows ("sist endret 3. okt." / "ikke oppdatert siste 12 mnd").
  - With a shortfall, up to 5 `samples` as small links ("Ikke håndtert: IP-3 Kommunen, IP-5 …").
  - A primary button "Gå til Interessenter" → `[routerLink]=url` with
    `queryParams: {...query, fromRequirement: ref}`.
  - A secondary "Ny interessent" (`create_url`) when the caller can write.
  - When the module is off, the card shows "Modulen er ikke slått på", plus a "Slå på i
    innstillinger" link (`/settings/modules`) for those with `org:manage`. Otherwise "Be en
    administrator slå den på".
  - With `stale: true` from the API, a muted "oppdateres …" hint.
- **Supporting** locations follow in a compact list under "Også relevant". Each row has a label,
  a status icon, `text` and a link.
- **Disabled** mappings (org override) are folded behind "1 tilpasning". Each shows strike-through,
  the justification, and who made it and when.
- `canManage` shows a "Tilpass" menu per card ("Bruk et annet sted", "Endre regel", "Slå av for
  oss"). It opens the override dialog (6.5).
- The existing evidence list stays below with the new heading **"Konkret dokumentasjon"** (one
  i18n value change in the standards scope) and the helper line "Koble enkeltposter som ekstra
  dokumentasjon". The "Kan dokumenteres med" create buttons stay.
- When a requirement has no mapping, the block is not rendered, and the page looks like today.

The status badge at the top of the requirement (requirement-row) shows the combined status. Its
tooltip comes from `basis`: "Status fra Interessenter: 6 registrert, 2 ikke håndtert" /
"Status fra koblet dokumentasjon" / "Satt manuelt av Kari Nordmann".

### 6.2 Catalogue tree, gap list, journey, readiness

- `features/standards/workspace/workspace-data.ts` calls `POST /requirement-locations/evaluate`
  once per standard view, through `RequirementLocationsService.evaluate(standardKey)`. The call
  is batched, and cached per view with signals. The row shows the status from it. A small
  location glyph and the short text ("2 ikke håndtert") sit next to the badge. When the call
  fails, the row falls back to the status in the tree payload, which already includes the
  location basis server-side (4.2), so this is purely the extra text.
- The gaps page shows a "Fyll ut i" column: the first primary location's label, linked, with its
  outcome. This sits before the existing "Kan dokumenteres med" create links.
- The readiness page shows `by_basis` as a sentence: "41 krav dekket fra registre, 12 fra koblet
  dokumentasjon, 3 manuelt vurdert".

### 6.3 Module pages: "Dette oppfyller"

Component `<app-fulfils-requirements [locationKey]>`:
- A compact strip: "Dette oppfyller: ISO 9001 · 4.2 · ISO 14001 · 4.2 · ISO 27001 · 4.2 + 3".
  Each chip uses the P1 `app-requirement-chip` visual with the location outcome icon, and links
  to `/standards/<key>/clauses/<number>` (anchored to the requirement). The labels follow polish
  §2.1. HS refs are never shown as "ISO HS".
- An expand toggle lists each requirement with its `text` ("Mangler: 2 ikke håndtert"). Clicking a
  sample opens the record.
- **From-requirement banner:** if the URL has `?fromRequirement=<ref>`, the strip turns into a
  banner: "Du kom hit fra ISO 9001 · 4.2: Det finnes en oversikt over interessentene … ·
  ◐ 2 ikke håndtert · Tilbake til kravet". The page then does not need its own logic.
- It sets the P2 page context `location_key` through a small `provideLocationContext(key)`
  helper exported from the same folder, so the assistant knows the page.
- Mounting: each module list page adds one line,
  `<app-fulfils-requirements locationKey="context.interested_parties" />`, under its page header.
  That is area-owned work (7.1). The P3 `record-list-page` may later take an optional
  `locationKey` input and render it itself. Then module pages just pass the key. That is a P3
  follow-up, not required here.
- Record detail pages do not get this strip. They already have P1's "Krav dette dokumenterer"
  for record-level links. The two must not be confused.

### 6.4 Assistant

There is no new UI. The tools in section 5 return `url`s, and P2's answer renderer already turns
portal paths into links. Eval prompts to add to the assistant harness (P2 owner, with the
integrator): "Hvor dokumenterer jeg interessentene?", "Hva mangler for ISO 9001 4.2?", "Hva
oppfyller denne siden?" (on `/context/interested-parties`), and "Where do I record management
review inputs?".

### 6.5 Override dialog (`standards:manage`)

- Action choice: "Bruk et annet sted" (re-point), "Legg til et sted", "Endre regel", "Slå av for
  oss".
- A location picker from `GET /locations`, grouped by module, with search.
- Rule presets offered for the chosen location's `rule_kinds`, as plain sentences such as "Minst
  [1] aktive oppføringer", "Alle aktive er [håndtert]", "Gjennomgått siste [365] dager". They map
  1:1 to the rule JSON, and there is no free JSON editing.
- The justification is a required text area.
- A preview of the live result before saving, from `POST /requirement-locations/evaluate` with an
  `override_preview` body. That is the same endpoint, with `preview: {target_ref, location_key,
  rules}`, evaluated without caching.

### 6.6 Portal files and i18n

```
src/app/core/locations/locations.models.ts      DTOs of section 5
src/app/core/locations/locations-api.ts         ApiService calls
src/app/core/locations/locations.service.ts     signals cache: evaluate(standardKey), forRequirement(ref),
                                                forLocation(key); invalidated on route change and after overrides
src/app/shared/requirement-locations/
  requirement-locations.ts          (6.1)    location-card.ts
  fulfils-requirements.ts           (6.3)    location-status-icon.ts
  location-override-dialog.ts       (6.5)    location-context.ts  (provideLocationContext)
  index.ts
src/assets/i18n/locations/en.json, nb.json  chrome only: headings, buttons, tooltips, dialog
```

nb chrome strings (binding, following polish §3.6):
- "Her fyller du ut dette"
- "Også relevant"
- "Konkret dokumentasjon"
- "Gå til {label}"
- "Dette oppfyller"
- "Du kom hit fra {requirement}"
- "Tilbake til kravet"
- "Tilpass"
- "Begrunnelse"
- "Status fra {label}"
- "sist endret {date}"
- "ikke oppdatert siste 12 mnd"
- "Modulen er ikke slått på"

en equivalents:
- "Where you fill this in"
- "Also relevant"
- "Specific evidence"
- "Go to {label}"
- "This fulfils"
- "You came here from {requirement}"
- "Back to the requirement"
- "Adjust"
- "Justification"
- "Status from {label}"
- "last changed {date}"
- "not updated in the last 12 months"
- "The module is not turned on"

---

## 7. Ownership, migration and build order

### 7.1 Who edits what

| Work item | Core files (owned) | Portal files (owned) |
|---|---|---|
| **L1 engine** (backend-engineer) | new `app/platform/locations/**` (`manifest.py`, `catalog.py`, `engine.py`, `rules.py`, `mapping.py`, `status.py`, `messages.py`, `sink.py`, `routes.py`, `schemas.py`, `service.py` (overrides), `ai_tools.py`, `beat.py`, `i18n/en.json`, `i18n/nb.json`, `locations.keys.txt`); new `app/models/requirement_location.py` (or `app/platform/locations/models.py` through `HOOK_MODELS`, preferred); migration `cf120_req_locations`; `app/cli.py` (+`location-coverage`, one additive command); `app/standards/locations/README.md` and an empty-but-valid `hs.json`; tests under `tests/platform/locations/**` | none |
| **L2 mapping packs** (framework mappers, one agent per file, in parallel after L1 merges the loader and catalogue) | `app/standards/locations/<framework>.json` and `hs.json`, plus their tests `tests/platform/locations/test_pack_<framework>.py` (seeded-data assertions on the demo org) | none |
| **L3 portal** (frontend-engineer) | none | new `src/app/core/locations/**`, `src/app/shared/requirement-locations/**`, `src/assets/i18n/locations/**` |
| **L4 integration** (integrator, after the standards polish area has merged) | marked edits, ≤ ~15 lines each: `services/frameworks.py` `readiness()` (status through `locations.status`); `services/standards_service.py` `requirement_status`/tree overlay; `services/requirement_views.py` (`gaps` `fill_in`, `evidence` `locations`); `app/platform/registry.py` (hook constant plus `LocationSpec`/`LocationField`; may also land with L1 as an additive union) | `features/standards/requirement-card.ts` (mount the block, rename the heading key), `workspace/workspace-data.ts` + `requirement-row.ts` (evaluate call and tooltip), `gaps/gaps-page.ts` ("Fyll ut i" column), `frameworks/readiness-page.ts` (`by_basis` sentence), `assets/i18n/standards/{en,nb}.json` (2-4 keys) |
| **L5 module strips** (each module's area owner, or one sweep agent after the areas finish) | optional: move the module's entries from `catalog.py` to `app/modules/<key>/locations.py` | one line per module list page: `<app-fulfils-requirements locationKey="…">` plus the import |

Rules for clash avoidance with the running polish programme (A01-A26, including the standards
workspace area):
- L1, L2 and L3 touch **only new files**, plus the additive kernel union in `registry.py` and
  `cli.py`. These can merge at any time.
- L4 edits files owned by the standards area. They wait until that area has merged. The edits
  then go on top of main, and each edit is fenced with a comment `# requirement-locations (L4)`
  so later readers find them. If the standards area is still open when L1-L3 finish, L4 is
  handed to that area's engineer as a contract addition rather than done in parallel.
- No module package (`app/modules/**`, `features/<module>/**`) is touched by L1-L4. Custom
  predicates that need module knowledge (MR inputs, ICT tests, breach clock, drill RRULE,
  competence gaps, KPI on-time) are written in `app/platform/locations/custom/<module>.py`.
  They read the module's models only through `registry.import_ref` strings, never by changing
  module code. The module can take them over later (L5).
- Main is moving. Every L branch rebases before its PR. L4 re-checks that its anchors (function
  names) still exist.

### 7.2 Migration `cf120_req_locations`

One migration. Revision id `cf120_req_locations`. `down_revision` = the Alembic head of
`origin/main` **at build time** (it is `cf61_assistant_everything` today; check with the
chain, not with this note). It imports only alembic and sqlalchemy, has a full downgrade, and
causes no data loss.

```
requirement_location_override
  id UUID PK
  org_id UUID FK organizations ON DELETE CASCADE, index
  target_ref String(160)          -- requirement ref "iso9001-2026:4.2.r3" or canonical clause ref "iso9001:4.2"
  location_key String(64)
  action String(16)               -- disable | add | replace_rules
  role String(12) NULL            -- primary | supporting (add / replace_rules)
  rules JSONB NULL                -- validated rule list (add / replace_rules)
  justification Text NOT NULL
  seed_version String(32) NULL    -- mapping file version the override was made against
  created_by UUID FK users SET NULL, created_at DateTime default now()
  updated_by UUID FK users SET NULL, updated_at DateTime NULL
  retired_at DateTime NULL
  unique (org_id, target_ref, location_key) WHERE retired_at IS NULL   -- partial unique index

location_rule_result
  org_id UUID FK organizations ON DELETE CASCADE
  signature String(40)            -- sha1 hex
  location_key String(64)
  rule JSONB                      -- resolved rule (placeholders filled), for debugging
  outcome String(16), score Float
  counts JSONB, message JSONB, sample_ids JSONB
  as_of DateTime NULL, next_change_at DateTime NULL
  evaluated_at DateTime NOT NULL, valid_until DateTime NOT NULL
  dirty Boolean NOT NULL default false
  PK (org_id, signature)
  index (org_id, location_key)
  index (dirty) WHERE dirty                                           -- partial, for the nightly job
```

- There are no new permissions. Read uses `standards:read`, and overrides use `standards:manage`, which already exist.
- `location_rule_result` is a cache. Downgrade drops it freely, and a cold start recomputes it.
- Event kinds (F3, `HOOK_EVENT_KINDS`): `requirement_location.overridden` (timeline only,
  `notify=False`).
- Audit: override create, update and retire call `audit.record(...)` in-transaction. Cache writes
  are not audited (derived data).

### 7.3 Order

1. **L1 engine** and **L3 portal** in parallel. L3 develops against the DTOs in section 5 with a
   mocked API.
2. **L2 packs** start when the L1 loader and catalogue are on main. There is one mapper per
   framework (hs, iso9001, iso27001, iso14001, iso45001, iso42001, gdpr, eu_ai_act, nis2), and
   they run in parallel. Each pack's acceptance:
   - every catalogue requirement of the framework has ≥ 1 primary mapping, or is listed in the pack's README with a reason ("evidenced only by records / by SoA")
   - the pack loads clean
   - demo-org readiness lands in the polish §4 ranges with the I25/I26 targets: 9001/27001 35-60 %, GDPR 40-60 %, 14001/45001 20-40 %, AI Act/42001 15-30 %
   - no standard sits at 0 or 100 %
3. **L4 integration** after the standards polish area merges.
4. **L5** strips per module, as area work or one sweep.
5. QA: backend-qa on L1/L2/L4-core, frontend-qa on L3/L4-portal.

Acceptance for the whole feature (I24 reshaped):
- On ISO 9001 4.2 the page shows "Her fyller du ut dette → Kontekst og ledelse: interessenter",
  with a live status line and a button that opens `/context/interested-parties`.
- Marking the two unhandled parties as handled flips 4.2.r3 to Dekket after the next page load.
  The event sink makes the cache dirty, and no manual refresh is needed.
- With the mapping files empty, readiness equals the P1 result (regression test).
- An org override with a justification disables the mapping, and the status falls back to links.
- `/context/interested-parties` shows "Dette oppfyller: ISO 9001 · 4.2 …" (after L5 for that page).
- The assistant answers "hvor dokumenterer jeg interessentene?" with the link, and "hva mangler
  for 4.2?" with "2 ikke håndtert: …".
- Two-org isolation test, no-AI import test, and i18n parity tests (core i18n and portal scope).

---

## 8. Location vocabulary

This is the vocabulary the framework mappers use. **Base rule kinds** (`has_entries`,
`record_exists`, `task_recurring_active`) are available on every location with an entity type
or a model. The last column lists the **additional** kinds. Full details (bilingual labels,
descriptions, named states with column hints, date fields, filters, typical clauses, read
permission, notes) are in `cf-test/req-locations/locations.json`. That file and L1's
`catalog.py` must stay in sync; `catalog.py` is the code truth.

- Route placeholders: `{standard_key}`, `{framework}`, `{number}`, `{ref}`.
- Filter placeholders: `$framework`, `$standard_key`, `$number`.
- Names of states and date fields in the JSON are the logical names that rules use. The column
  hints after `=` are for the L1 engineer, who confirms them against the models.

| Key | Entity type | Route | Label (nb) | Additional rule kinds |
|---|---|---|---|---|
| `context.analyses` | `context_analysis` | `/context/analyses` | Kontekst og ledelse: kontekstanalyser (SWOT/PESTEL) | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `context.interested_parties` | `interested_party` | `/context/interested-parties` | Kontekst og ledelse: interessenter | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `context.scopes` | `scope_statement` | `/context/scopes` | Kontekst og ledelse: omfang | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `context.policies` | `policy` | `/context/policies` | Kontekst og ledelse: policyer | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `context.responsibilities` | `responsibility` | `/context/responsibilities` | Kontekst og ledelse: roller og ansvar | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `context.raci_matrix` | `responsibility` | `/context/responsibilities/matrix` | Kontekst og ledelse: ansvarsmatrise (RACI) | coverage_ratio |
| `processes.register` | `process` | `/processes` | Prosesser: prosessoversikt | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `processes.interaction_map` | - | `/processes/interaction-map` | Prosesser: samspillskart | has_entries, custom |
| `documents.register` | `document` | `/documents` | Dokumenter: styrte dokumenter | all_in_state, coverage_ratio, reviewed_within, none_overdue, approved_document |
| `documents.register_overview` | `document` | `/documents/register` | Dokumenter: dokumentregister (masterliste) | none_overdue, coverage_ratio |
| `documents.types` | `document_type` | `/documents/types` | Dokumenter: dokumenttyper | coverage_ratio |
| `documents.templates` | `document_template` | `/documents/templates` | Dokumenter: maler | (base only) |
| `documents.external` | `external_document` | `/documents/external` | Dokumenter: eksterne dokumenter | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `documents.distribution` | `distribution_campaign` | `/documents/campaigns` | Dokumenter: lesekampanjer | all_in_state, coverage_ratio, none_overdue |
| `documents.retention` | `retention_rule` | `/documents/retention` | Dokumenter: oppbevaringsregler | (base only) |
| `deviations.register` | `deviation` | `/deviations` | Avvik: avviksoversikt | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `deviations.actions` | `deviation_action` | `/deviations/actions` | Avvik: tiltak | all_in_state, coverage_ratio, none_overdue |
| `deviations.types` | - | `/deviations/types` | Avvik: avvikstyper og arbeidsflyt | has_entries |
| `deviations.intake` | - | `/deviations/intake/settings` | Avvik: åpen meldekanal | setting_is |
| `risk.risks` | `risk` | `/risk/risks` | Risiko og muligheter: risikoregister | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `risk.treatments` | `risk_treatment` | `/risk/risks` | Risiko og muligheter: risikotiltak | all_in_state, coverage_ratio, none_overdue |
| `risk.opportunities` | `opportunity` | `/risk/opportunities` | Risiko og muligheter: muligheter | all_in_state, coverage_ratio, none_overdue |
| `risk.soa` | `soa_entry` | `/risk/soa/{standard_key}?control={number}` | Risiko og muligheter: anvendelseserklæring (SoA) | all_in_state, coverage_ratio, reviewed_within |
| `risk.registers` | `risk_register` | `/risk/registers` | Risiko og muligheter: risikoregistre og metode | all_in_state |
| `risk.matrices` | `risk_matrix` | `/risk/matrices` | Risiko og muligheter: risikokriterier (matriser) | (base only) |
| `objectives.objectives` | `objective` | `/objectives` | Mål og KPI-er: mål | all_in_state, coverage_ratio, none_overdue, each_has_related |
| `objectives.kpis` | `kpi` | `/objectives/kpis` | Mål og KPI-er: KPI-er og målinger | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `management_review.reviews` | `management_review` | `/management-review/reviews` | Ledelsens gjennomgang: gjennomganger | all_in_state, coverage_ratio, reviewed_within, custom |
| `management_review.meetings` | `meeting` | `/management-review/meetings` | Ledelsens gjennomgang: møter og beslutninger | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `obligations.register` | `compliance_obligation` | `/obligations` | Lover og forskrifter: lovregister | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `audits.programmes` | `audit_programme` | `/audits/programmes` | Revisjoner: revisjonsprogram | all_in_state, coverage_ratio, reviewed_within |
| `audits.plans` | `audit_plan` | `/audits/plans` | Revisjoner: revisjoner | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `audits.findings` | `audit_finding` | `/audits/findings` | Revisjoner: funn | all_in_state, coverage_ratio, none_overdue, each_has_related |
| `audits.certifications` | `audit_certification` | `/audits/certifications` | Revisjoner: sertifikater | all_in_state, coverage_ratio, none_overdue |
| `audits.auditors` | - | `/audits/auditors` | Revisjoner: revisorer og kompetanse | coverage_ratio, none_overdue |
| `inspections.register` | `inspection` | `/inspections` | Inspeksjoner: inspeksjoner | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `inspections.schedules` | - | `/inspections/schedules` | Inspeksjoner: inspeksjonsplaner | has_entries, none_overdue |
| `inspections.templates` | `checklist_template` | `/inspections/templates` | Inspeksjoner: sjekklister | all_in_state |
| `inspections.findings` | `inspection_finding` | `/inspections/findings` | Inspeksjoner: funn | all_in_state, coverage_ratio, none_overdue |
| `feedback.items` | `customer_feedback` | `/feedback/items` | Kundetilbakemeldinger: tilbakemeldinger og klager | all_in_state, coverage_ratio, none_overdue |
| `feedback.surveys` | `survey` | `/feedback/surveys` | Kundetilbakemeldinger: kundeundersøkelser | all_in_state, coverage_ratio, reviewed_within |
| `feedback.insights` | - | `/feedback/insights` | Kundetilbakemeldinger: innsikt | custom |
| `people.employees` | `employee` | `/people/employees` | Personer: ansatte | all_in_state, coverage_ratio |
| `people.positions` | `position` | `/people/positions` | Personer: stillinger og kompetansekrav | all_in_state, coverage_ratio |
| `people.competences` | `competence` | `/people/competences` | Personer: kompetansekatalog | all_in_state, coverage_ratio |
| `people.matrix` | - | `/people/matrix` | Personer: kompetansematrise | coverage_ratio, custom |
| `people.checklists` | `people_checklist` | `/people/checklists` | Personer: on- og offboarding | all_in_state, coverage_ratio, none_overdue |
| `recruitment.requisitions` | `job_requisition` | `/recruitment/requisitions` | Rekruttering: stillingsbehov | all_in_state, coverage_ratio |
| `recruitment.candidates` | `candidate` | `/recruitment/candidates` | Rekruttering: kandidater | all_in_state, coverage_ratio |
| `recruitment.applications` | `job_application` | `/recruitment/applications` | Rekruttering: søknader og sjekker | all_in_state, coverage_ratio |
| `recruitment.settings` | - | `/recruitment/settings` | Rekruttering: innstillinger (oppbevaring) | setting_is |
| `training.courses` | `course` | `/training/courses` | Opplæring: kurs | all_in_state, coverage_ratio |
| `training.assignments` | `training_assignment` | `/training/assignments` | Opplæring: tildelinger | all_in_state, coverage_ratio, none_overdue |
| `training.records` | `training_record` | `/training/records` | Opplæring: opplæringshistorikk | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `training.matrix` | - | `/training/matrix` | Opplæring: opplæringsmatrise | coverage_ratio, custom |
| `suppliers.register` | `supplier` | `/suppliers` | Leverandører: leverandøroversikt | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `suppliers.evaluations` | `supplier_evaluation` | `/suppliers/evaluations` | Leverandører: evalueringer | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `suppliers.questionnaires` | - | `/suppliers/questionnaires` | Leverandører: spørreskjema for evaluering | has_entries |
| `contracts.register` | `contract` | `/contracts` | Kontrakter: kontraktsoversikt | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `contracts.deadlines` | - | `/contracts/deadlines` | Kontrakter: viktige frister | none_overdue |
| `projects.register` | `project` | `/projects` | Prosjekter: prosjekter og utvikling | all_in_state, coverage_ratio, none_overdue, each_has_related |
| `assets.register` | `asset` | `/assets` | Eiendeler og endringer: eiendelsregister | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `assets.calibration` | `calibration` | `/assets/calibration` | Eiendeler og endringer: kalibrering | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `assets.access_reviews` | `access_review` | `/assets/access-reviews` | Eiendeler og endringer: tilgangsgjennomganger | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `assets.changes` | `change_request` | `/assets/changes` | Eiendeler og endringer: endringshåndtering | all_in_state, coverage_ratio |
| `continuity.bias` | `bia` | `/continuity/bias` | Kontinuitet og beredskap: konsekvensanalyser (BIA) | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `continuity.plans` | `continuity_plan` | `/continuity/plans` | Kontinuitet og beredskap: kontinuitetsplaner | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `continuity.exercises` | `continuity_exercise` | `/continuity/exercises` | Kontinuitet og beredskap: øvelser | all_in_state, coverage_ratio, reviewed_within |
| `continuity.ict_systems` | `continuity_ict_system` | `/continuity/ict-systems` | Kontinuitet og beredskap: IKT-systemer | all_in_state, coverage_ratio, custom |
| `continuity.contacts` | `continuity_contact` | `/continuity/contacts` | Kontinuitet og beredskap: beredskapskontakter | reviewed_within |
| `environment.aspects` | `env_aspect` | `/environment/aspects` | Miljø: miljøaspekter | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `environment.emergency_plans` | `emergency_plan` | `/environment/emergency-plans` | Miljø: beredskapsplaner og øvelser | all_in_state, coverage_ratio, reviewed_within, none_overdue, custom |
| `environment.metrics` | `env_metric` | `/environment/metrics` | Miljø: overvåking og målinger | all_in_state, coverage_ratio, reviewed_within, none_overdue, custom |
| `environment.emissions` | - | `/environment/emissions` | Miljø: utslipp | custom |
| `hse.sja` | `sja` | `/hse/sja` | HMS: sikker jobbanalyse (SJA) | all_in_state, coverage_ratio |
| `hse.ppe` | `ppe_item` | `/hse/ppe` | HMS: verneutstyr | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `hse.consultations` | `worker_consultation` | `/hse/consultations` | HMS: medvirkning | all_in_state, coverage_ratio, reviewed_within |
| `hse.safety_rounds` | `inspection` | `/hse/safety-rounds` | HMS: vernerunder | reviewed_within |
| `privacy.ropa` | `ropa_entry` | `/privacy/ropa` | Personvern: behandlingsprotokoll | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `privacy.dpias` | `dpia` | `/privacy/dpias` | Personvern: personvernkonsekvensvurderinger (DPIA) | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `privacy.requests` | `data_subject_request` | `/privacy/data-subject-requests` | Personvern: henvendelser fra registrerte | all_in_state, coverage_ratio, none_overdue |
| `privacy.breaches` | `data_breach` | `/privacy/breaches` | Personvern: personvernbrudd | all_in_state, coverage_ratio, custom |
| `privacy.processors` | `processor` | `/privacy/processors` | Personvern: databehandlere | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `privacy.transfers` | `transfer_assessment` | `/privacy/transfers` | Personvern: overføringer ut av EØS | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `privacy.retention` | `retention_schedule` | `/privacy/retention-schedules` | Personvern: slette- og lagringsplan | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `privacy.consents` | `consent_record` | `/privacy/consents` | Personvern: samtykker | all_in_state, coverage_ratio |
| `privacy.legal_basis` | `legal_basis_assessment` | `/privacy/legal-basis-assessments` | Personvern: vurderinger av behandlingsgrunnlag og berettiget interesse | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `ai_governance.systems` | `ai_system` | `/ai-governance/systems` | KI-styring: KI-systemer | all_in_state, coverage_ratio, reviewed_within, none_overdue, each_has_related |
| `ai_governance.assessments` | `ai_assessment` | `/ai-governance/assessments` | KI-styring: konsekvens- og risikovurderinger | all_in_state, coverage_ratio, reviewed_within, none_overdue |
| `ai_governance.literacy` | - | `/ai-governance/literacy` | KI-styring: KI-kompetanse | coverage_ratio, none_overdue |
| `ai_governance.settings` | - | `/ai-governance/settings` | KI-styring: innstillinger | setting_is |
| `reports.audit_packs` | `audit_pack` | `/reports/audit-packs` | Rapporter: revisjonspakker | reviewed_within |
| `reports.registers` | - | `/reports/registers` | Rapporter: registre og eksport | custom |
| `reports.definitions` | `report_definition` | `/reports/definitions` | Rapporter: rapporter | reviewed_within |
| `tasks.register` | `task` | `/tasks` | Oppgaver: oppgaver og faste rutiner | all_in_state, coverage_ratio, none_overdue |
| `settings.profile` | - | `/settings/profile` | Innstillinger: virksomhetsprofil | setting_is |
| `settings.organisation` | - | `/settings` | Innstillinger: avdelinger, medlemmer og roller | setting_is, custom |
| `settings.modules` | - | `/settings/modules` | Innstillinger: moduler | setting_is |

Mapper guidance (binding for L2):
- Use the most specific location as **primary**. Settings, pages and dashboards are
  **supporting**, unless the requirement is really about the setting (for example the public
  reporting channel for ISO 45001 5.4).
- For anything the standard says must be "maintained" or "reviewed", add a `reviewed_within`
  or a `none_overdue` rule next to the existence rule (with `combine: "all"`).
- Scope registers to the framework with `where: {framework: "$framework"}`, wherever the
  location has a `framework` filter.
- ISO 27001 Annex A controls: primary `risk.soa` with
  `record_exists(where={control: "$number", state: "implemented"})`. A location for the control's
  real data, when one exists, is added as primary too (for example A.5.18 → `assets.access_reviews` with
  `none_overdue`). Then both must hold.
- Do not map a requirement to a location only because a clause declaration exists. The
  declaration says "can evidence", while a mapping says "this is where it is filled in". When in
  doubt, use `supporting`.

---

## 9. Decisions taken (nobody available to ask)

1. **D1: location results are a second readiness input, next to `requirement_link`.** This
   supersedes polish D1 ("requirement_link is the single source"), but only for requirements
   that have a location mapping. I24 proposed writing `origin='rule'` link rows instead. That
   was rejected:
   - A location result is about a *place* (a register), not one record, so it does not fit `(entity_type, entity_id)`.
   - Thousands of synthetic rows would churn on every change.
   - Synthetic rows would collide with the confirm/reject semantics users already know.

   "Why is this covered?" still has one answer. It is the `basis` field plus the location text.
   I24's "by_origin includes 'rule'" is delivered as `by_origin.location` / `by_basis`.
2. **D2: mapping files are JSON, not YAML.** The PO wrote "e.g. yaml". PyYAML is not a direct
   dependency, while the catalogue and the cross-mappings are JSON with `schema_version`. One
   format, one loader style, no new dependency.
3. **D3: with a primary mapping, record links can lift `not_met` to `partial` but never
   `partial` to `covered`.** This is the PO's point: one linked stakeholder must not hide
   unhandled ones. An escape exists: the org override with a justification.
4. **D4: manual assessment (`status_override`) still wins over rules.** It is explicit, shown
   with its author, and already audited. The UI shows the live location result next to a manual
   status, so a stale manual "Dekket" is visible ("Satt manuelt · stedet sier: 2 ikke håndtert").
5. **D5: the central fallback catalogue first, module manifests later.** Module packages are
   owned by the running polish areas. A module spec wins over the fallback on the same key, so
   migration is incremental and conflict-free.
6. **D6: core renders the location texts (labels, descriptions, rule messages) in both
   languages.** The portal keeps only chrome strings in its `locations` scope. The assistant
   needs the same sentences server-side, and two copies would drift.
7. **D7: an empty `frameworks` list on a record means "applies to all standards"** for
   framework-scoped rules. That is how modules use the field today (records created before the
   field existed have `[]`).
8. **D8: modules that are off give `not_evaluable`, which is never `not_met`.** The requirement
   falls back to link-based status, and the UI offers to turn the module on. An org that does
   not use a module is not punished. Its gap list still says where the data would live.
9. **D9: the cache is lazy plus event-invalidated, not eager.** Writing results on every event
   would put rule SQL into every module's write transaction. Marking dirty there costs one
   indexed UPDATE, and evaluation happens on read or nightly.
10. **D10: `custom` predicates live in `app/platform/locations/custom/` for now**, reading
    module models through import refs. This avoids touching module packages during the polish
    programme. They move to the modules with L5.
11. **D11: the route of a location must open the exact page.** Where no exact page exists (risk
    treatments), the nearest page is used and the location's `notes` say so. Query parameters
    are only declared where the target page reads them today (`?status=`, `?overdue=1`,
    `?review=due`, `?control=`). New query filters on module pages are area work, not part of
    this design.
12. **D12: "Konkret dokumentasjon" keeps the P1 evidence list unchanged.** Only its heading and
    position change. The P1 suggestion and confirm flows stay as they are.
13. **D13: the migration id is `cf120_req_locations`.** Its `down_revision` is set to the head of
    `origin/main` when the L1 branch is created (today `cf61_assistant_everything`), and the
    integrator re-chains if needed (polish §5).

---

## 10. Portal build notes (L3, L4-portal, L5), decided while building

Recorded by the portal engineer on 2026-11-17; nobody was available to ask.

1. **P1. New types stay in `core/locations/locations.models.ts`.** The optional fields that L4 adds to standards DTOs (`basis`, `location_text`, `fill_in`, `by_basis`) are declared there as small structural interfaces (`LocatedRequirementFields`, `GapFillInFields`, `ReadinessBasisFields`), so `core/standards/standards.models.ts` (owned by the standards area) is not touched.
2. **P2. The catalogue tree reads the tree payload, not `POST …/evaluate`.** The L4 tree DTO already carries `location_outcome` and `location_text` per requirement, so `<app-location-hint>` in `requirement-row.ts` renders from it, and no extra request is made. `LocationsApi.evaluate()` exists and is used by the override preview.
3. **P3. The basis tooltip lives on the hint, not on the status badge.** "Status fra stedet der kravet fylles ut: …" is the hint's title, so the badge markup (standards area) is untouched. On the requirement page, the `status.text` line is shown only when the place does not decide the status (`manual`, `links`), because otherwise it repeats the card's status line.
4. **P4. Assistant context goes through `requirements`, not a new `location_key` field.** The backend page context has no `location_key`, and P2 already feeds `requirements` to the assistant. `provideLocationContext()` adds the refs that a page fulfils (primary first) to whichever page context is active, through a small additive `PageContextService.supplement()`. It never replaces the page's own context.
5. **P5. The "Dette oppfyller" strip on module pages is one tag.** On pages built with `app-record-list-page`, it is projected into the existing `[help]` slot, right under the header. On the three pages with their own header (documents, deviations, tasks), it sits right after the header. Pages that serve several places from one component (context registers, privacy registers) omit `locationKey`, and the strip matches the current path against the vocabulary routes (exact path, no placeholders).
6. **P6. One strip per module, on its main register page.** Context and privacy get one per register through path matching. Other secondary registers (KPIs, treatments, findings …) can add the same one-line tag later.
7. **P7. Re-point is two calls.** The API has no combined endpoint, so "Bruk et annet sted" creates a `disable` override and then an `add` override. If the second call fails, the dialog says so, and the page reloads so the switched-off place is visible (with "Bruk standardoppsettet igjen" to undo).
8. **P8. Managers can add a place to an unmapped requirement.** The block stays hidden for everyone else, as designed. A user with `standards:manage` sees one small "Legg til stedet der dere fyller ut dette" button.
9. **P9. Strip order.** Clauses filled in here come before "also relevant" ones, then ISO standards before regulations, then natural order (ISO 9001 before ISO 14001). Each clause shows one chip with the worst primary outcome.
10. **P10. Failures stay quiet.** All location reads use `SKIP_ERROR_TOAST`. On any failure the block or strip is not rendered, and the page looks as it did before.

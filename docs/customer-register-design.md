# Customer register (Kunder): design

Status: agreed design, 2026-11-19. Owner: architect. Implementers follow this file; a
change to a contract below is made here first (in the same branch) and noted in the
report.

Product owner request: "we need a customer register, so that projects, claims and
deviations, contracts and everything can be and will be connected to the correct
customers".

The register is the **source of truth for customers**. Every other module that talks
about a customer stops storing a name and points at a customer record instead. The
customer card shows everything connected to that customer.

---

## 0. Key decisions (summary)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | New module `customers` (`app/modules/customers`, portal `features/customers`, route `/customers`, nb "Kunder"). Entity types `customer` and `customer_contact`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Same shape as every other register; module gate, permissions, search, AI and locations come for free.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D2  | **Typed nullable FK columns** `customer_id` (`ON DELETE SET NULL`, indexed) on the records that _belong to_ one customer: `project`, `contract_party`, `deviation`, `customer_feedback`, `survey`, `survey_response`, `audit_plan`, `compliance_obligation`, `ropa_entry`, `asset`, `document`. `data_breach.customer_ids` is a JSONB id list (a breach can hit several customers; same pattern as `asset_ids` / `ropa_entry_ids`). Interested parties and tasks use the existing link mechanisms (`entity_link`, `task.entity_type/entity_id`). Each FK is declared as a kit `StructuralRelation`, so it shows as a connection on both records without copying into `entity_link`. | The request is a single-valued **field** ("Kunde") with a list column, a list filter, prefill and counts on the card ("2 åpne reklamasjoner"). That is one indexed column, cheap to filter and aggregate, and impossible to get wrong (one customer per record). `entity_link` (the supplier-hub model) is many-to-many, has no "the customer" semantics and makes list filters and counts joins over a generic table. Precedent for typed cross-module FKs: `contract_party.supplier_id`, `audit_certification.supplier_id`. |
| D3  | Contracts link through `contract_party.customer_id` (next to the existing `supplier_id`), not a column on `contract`. The contract DTO exposes a derived `customer` (the first non-internal party with a customer).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Parties already model the counterparty with name / org nr / supplier; a customer is one more role of a party. NDAs and DPAs with a customer are ordinary contracts with a customer party.                                                                                                                                                                                                                                                                                                                                     |
| D4  | Org. number unique per org among live customers (partial unique index). Stored normalised: 9 digits for Norway, else trimmed upper case without spaces. Mod-11 failure is a **warning**, not an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Existing data and demo data hold numbers that fail mod-11. Demo org numbers deliberately fail mod-11, so they can never be a real company.                                                                                                                                                                                                                                                                                                                                                                                    |
| D5  | Customer ↔ supplier: **no stored link**. "Også leverandør" is derived at read time by normalised org number (`supplier.registration_number`). The supplier card shows "Også kunde" through `GET /customers/by-org-number/{orgnr}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | No duplicated data, nothing to keep in sync; works in both directions. Without an org number there is no chip (accepted).                                                                                                                                                                                                                                                                                                                                                                                                     |
| D6  | Brønnøysund lookup reuses `app/platform/modules/brreg.py` (`fetch`, `clean_orgnr`) and adds a customer mapping, an in-process TTL cache and a 503 fallback. Lookup by org number only (no name typeahead in v1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | One HTTP client, already mocked in tests. Name search is a follow-up.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D7  | Free-text migration is a **runtime engine** (not an Alembic data migration): `POST /customers/matches/scan`, the CLI `customers-scan`, and the demo finaliser. Certain matches are applied; uncertain ones go to a review queue (`customer_match`).                                                                                                                                                                                                                                                                                                                                                                                                                                 | Alembic cannot import app code and the columns arrive in three different migrations; a re-runnable, idempotent engine also catches free text typed after go-live (public feedback forms).                                                                                                                                                                                                                                                                                                                                     |
| D8  | Auto-apply only on **same org number** or **same name after case/space folding**. Same "core name" with different spelling ("Fjord AS" / "Fjord A/S", "Fjord Industrier AS" / "Fjord Industrier ASA") or fuzzy similarity ≥ 0.88 → review queue.                                                                                                                                                                                                                                                                                                                                                                                                                                    | The product owner's example: "Fjord AS" vs "Fjord A/S" must be confirmed by a person.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D9  | Other modules plug in through two declarative lists in their own module, `app/modules/<m>/customer_link.py`: `FIELDS` (where the customer is referenced + legacy free text) and `SECTIONS` (what the card shows). The customers module discovers them; it never imports another module's service code.                                                                                                                                                                                                                                                                                                                                                                              | Lanes own their files, the customers module owns the engine, card and merge. No edits to the kernel registry (verbatim file).                                                                                                                                                                                                                                                                                                                                                                                                 |
| D10 | The deviation "Kunde" field is a first-class column for **every** deviation type (incidents affecting a customer included). The built-in `customer_complaint` template becomes "Reklamasjon / kundeklage" (en "Customer claim or complaint"), drops its free-text `customer_name` field and marks the Kunde field required (`"customer_field": "required"`).                                                                                                                                                                                                                                                                                                                        | One field, one column, filterable everywhere; no second near-identical template (UX direction: simplify).                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D11 | Module default **off** (like other business modules), in the `quality` package, and migration `cf210` switches it on for every org that has `feedback`, `contracts` or `projects` explicitly enabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Existing users of the modules that talk about customers get the register; nobody else sees a new menu item.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D12 | Feedback: only `customer_organisation` is migrated to customers; `customer_name` / email / phone stay on the feedback as the contact person. Consumer feedback (no organisation) stays unlinked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A private person is not a customer company; we do not mass-create customers from individuals' names (privacy).                                                                                                                                                                                                                                                                                                                                                                                                                |
| D13 | Soft-deleted customers keep their references (the ref DTO says `deleted: true`); pickers exclude them. Merge (`customers:manage`) re-points every registered FK and link, then soft-deletes the source.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | No silent loss of links; duplicates found later can be fixed in one step.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D14 | Customer code `CUS-0001` (like `SUP-0001`), statuses `prospect` · `active` · `former` (nb Prospekt · Aktiv · Tidligere kunde).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Consistent with suppliers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## 1. Data model (ENG-A, migration `cf210_customers`)

`down_revision` = the current head when you start (at the time of writing
`cf185_u14_notice_docs`; check with `alembic heads`). Lanes: `cf211_customer_links_l1`
(LANE-1) and `cf212_customer_links_l2` (LANE-2), each on the head it sees; the
orchestrator re-chains on merge.

### 1.1 `customer`

| column                                               | type                                     | notes                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `org_id`                                       | uuid                                     | `org_id` FK organizations, CASCADE, indexed                                                                                                     |
| `seq`, `code`                                        | int, String(20)                          | `CUS-0001`; unique (`org_id`, `code`)                                                                                                           |
| `name`                                               | String(255)                              | display name                                                                                                                                    |
| `legal_name`                                         | String(255) ?                            | from Brønnøysund `navn`                                                                                                                         |
| `org_number`                                         | String(32) ?                             | normalised (D4). Partial unique index `uq_customer_org_orgnr` on (`org_id`, `org_number`) `WHERE org_number IS NOT NULL AND deleted_at IS NULL` |
| `org_form`                                           | String(16) ?                             | `AS`, `ASA`, `ENK`, `KOMM`, … (`organisasjonsform.kode`)                                                                                        |
| `country`                                            | String(2) ?                              | default `NO` when an org number is looked up                                                                                                    |
| `address_line`, `postal_code`, `city`                | String(255) / String(16) / String(100) ? | business address (`forretningsadresse`, else `postadresse`)                                                                                     |
| `industry_code`, `industry_label`                    | String(16) / String(255) ?               | NACE (`naeringskode1.kode` / `.beskrivelse`)                                                                                                    |
| `segment`                                            | String(64) ?                             | free text with suggestions from existing values (`GET /customers/segments`)                                                                     |
| `status`                                             | String(12), default `'active'`           | `prospect` · `active` · `former`                                                                                                                |
| `owner_user_id`                                      | uuid ? FK users SET NULL                 | Kundeansvarlig                                                                                                                                  |
| `department_id`                                      | uuid ? FK departments SET NULL           | optional                                                                                                                                        |
| `website`, `email`, `phone`                          | String(500) / String(320) / String(64) ? | company switchboard; persons go in contacts                                                                                                     |
| `description`                                        | Text ?                                   | "Om kunden"                                                                                                                                     |
| `registry`                                           | JSONB default `{}`                       | last Brønnøysund snapshot: `{bankrupt, under_liquidation, deleted_on, employees, registered_vat, checked_at}`                                   |
| `customer_since`                                     | Date ?                                   | set when the status first becomes `active` (editable)                                                                                           |
| `created_by`, `deleted_at`, `deleted_by`, timestamps |                                          | soft delete like every register                                                                                                                 |

Indexes: (`org_id`, `status`), (`org_id`, lower(`name`)).

### 1.2 `customer_contact`

`id, org_id, customer_id (FK customer CASCADE, indexed), name String(255), title
String(120)?, email String(320)?, phone String(64)?, is_primary bool default false,
notes Text?, position int, created_by, deleted_at, deleted_by, timestamps`. At most one
live primary contact per customer (partial unique index on `customer_id WHERE is_primary
AND deleted_at IS NULL`); setting a new primary clears the old one in the same
transaction.

### 1.3 `customer_match` (review queue)

| column                     | notes                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| `id`, `org_id`             |                                                                             |
| `field_key`                | the `CustomerField.key` the mention came from, e.g. `contracts.party`       |
| `entity_type`, `entity_id` | the record to show and open (for a contract party: the contract)            |
| `row_id`                   | the row that gets the FK (the party id; equals `entity_id` for most fields) |
| `source_text`              | the free text as found (≤ 255)                                              |
| `source_org_number`        | normalised, when the source had one                                         |
| `proposed_customer_id`     | FK customer SET NULL; NULL = "create a new customer"                        |
| `reason`                   | `same_core_name` · `similar_name` · `ambiguous` (two or more candidates)    |
| `score`                    | 0..1                                                                        |
| `status`                   | `pending` · `accepted` · `created` · `dismissed`                            |
| `decided_by`, `decided_at` |                                                                             |
| `created_at`               |                                                                             |

Unique (`org_id`, `field_key`, `row_id`). Not a registered entity type (it is a work
queue, not a record). Every decision is audit-logged.

### 1.4 Columns other modules add (LANE-1 / LANE-2)

All: `customer_id UUID NULL REFERENCES customer(id) ON DELETE SET NULL`, indexed
(`ix_<table>_customer`). Existing free-text columns are **kept** (history, public forms,
fallback when the module is off); the form stops showing them where the picker replaces
them.

| Table                   | Column                                    | Lane   | Meaning                                                                         |
| ----------------------- | ----------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `project`               | `customer_id`                             | LANE-1 | project delivered for the customer                                              |
| `contract_party`        | `customer_id`                             | LANE-1 | the party is this customer (customer contract, NDA, DPA where we are processor) |
| `deviation`             | `customer_id`                             | LANE-1 | claim / complaint / any deviation or incident affecting the customer            |
| `customer_feedback`     | `customer_id`                             | LANE-1 | feedback from the customer                                                      |
| `survey`                | `customer_id`                             | LANE-1 | survey sent to one customer (optional)                                          |
| `survey_response`       | `customer_id`                             | LANE-1 | response from the customer (defaults to the survey's customer)                  |
| `audit_plan`            | `customer_id`                             | LANE-2 | external audit by the customer (`external_party_type = 'customer'`)             |
| `compliance_obligation` | `customer_id`                             | LANE-2 | customer-specific requirement                                                   |
| `ropa_entry`            | `customer_id`                             | LANE-2 | processing we perform as processor for the customer (`role = 'processor'`)      |
| `data_breach`           | `customer_ids` (JSONB list, default `[]`) | LANE-2 | customers (controllers) affected by the breach                                  |
| `asset`                 | `customer_id`                             | LANE-2 | customer property (ISO 9001 8.5.3)                                              |
| `document`              | `customer_id`                             | LANE-2 | customer-specific document (specification, drawing, customer manual)            |

Link-based (no new column): `interested_party` ↔ `customer` (`entity_link`
`relates_to`, written by the scan for named parties), tasks (`task.entity_type =
'customer'`).

---

## 2. Backend module `app/modules/customers` (ENG-A)

Files: `manifest.py`, `models.py`, `schemas.py`, `service.py`, `contacts.py`,
`brreg_lookup.py`, `names.py`, `contract.py` (the lane contract, §4), `refs.py` (the
public helpers lanes import), `overview.py`, `matching.py`, `merge.py`, `routes.py`,
`search.py`, `queries.py`, `ai_tools.py`, `ai.py` (optional assists), `events.py`,
`next_actions.py`, `flows.py` (only the flows whose target is a customer, e.g.
`supplier.to_customer`), `demo.py`.

### 2.1 Manifest

```python
PERMISSIONS = {
    "customers:read": "Read the customer register, contacts and the customer card",
    "customers:write": "Register and edit customers and contacts, review customer matches",
    "customers:manage": "Delete and merge customers and scan existing data for customers",
}
ROLE_GRANTS = {
    "admin": ALL, "quality_manager": ALL,
    "member": ("customers:read", "customers:write"),   # the people who talk to customers
    "dpo": ("customers:read", "customers:write"),      # processing as processor
    "auditor": READ, "ciso": READ, "ai_officer": READ, "hse_manager": READ, "hr_manager": READ,
}
ModuleSpec(key="customers", name_key="modules.names.customers",
           description_key="modules.descriptions.customers", portal_path="customers",
           frameworks=("iso9001", "gdpr"), default_enabled=False,
           clauses=(ClauseDecl("iso9001:8.2.1", ("customer",)),
                    ClauseDecl("iso9001:8.2.3", ("customer",)),
                    ClauseDecl("iso9001:9.1.2", ("customer",))))
EntityTypeSpec("customer", module="customers", read_permission="customers:read",
               write_permission="customers:write",
               resolve="app.modules.customers.service:resolve_customer",
               label_key="modules.entities.customer", revisioned=True,
               redacted_fields=("email", "phone", "description", "reason"),
               live_sql="app.modules.customers.service:customer_live_sql")
EntityTypeSpec("customer_contact", ..., searchable=False, linkable=False,
               attachable=False, commentable=False,
               redacted_fields=("name", "email", "phone", "notes"))
```

Hooks: `MODELS`, `ROUTERS`, `EVENT_KINDS`, `SEARCH_PROVIDERS`, `AI_TOOLS`, `DEMO_SEED`
(`demo:seed`; `demo.py` also defines `DEMO_FINALIZE`), `ENTITY_QUERIES`,
`NEXT_ACTIONS`, `CREATE_FLOWS`. Add `"customers"` to the `quality` package in
`app/platform/modules/packages.py` (one-line edit). `seed-rbac` creates the permissions.

`cf210` also inserts `org_module(org_id, 'customers', enabled=true)` for every org with
an `org_module` row `enabled = true` for `feedback`, `contracts` or `projects` and no
`customers` row yet (D11).

### 2.2 Brønnøysund lookup (`brreg_lookup.py`)

- Endpoint: `GET https://data.brreg.no/enhetsregisteret/api/enheter/{orgnr}` via the
  existing `brreg.fetch` (httpx, 5 s timeout, `Accept: application/json`; 404/410 → not
  found). If the entity is not found among `enheter`, do **not** fall back to
  `underenheter` in v1.
- `to_customer(orgnr, data) -> dict`: `name`/`legal_name` (`navn`), `org_form`
  (`organisasjonsform.kode`), `address_line` (`forretningsadresse.adresse` joined with
  ", ", else `postadresse`), `postal_code` (`postnummer`), `city` (`poststed`),
  `country` (`landkode`, default `NO`), `industry_code` / `industry_label`
  (`naeringskode1.kode` / `.beskrivelse`), `website` (`hjemmeside`), `registry`
  snapshot (`konkurs`, `underAvvikling` or `underTvangsavviklingEllerTvangsopplosning`,
  `slettedato`, `antallAnsatte`, `registrertIMvaregisteret`, `checked_at`).
- Cache: module-level dict `{orgnr: (expires_at, payload | None)}`, 24 h for hits, 1 h
  for not-found, max 2 000 entries (drop oldest). Network errors are never cached.
- Errors: 422 `invalid_orgnr` (not 9 digits), 404 `orgnr_not_found`, 503
  `registry_unavailable` (any network / timeout / JSON error). The portal shows "Fant
  ikke opplysninger akkurat nå – fyll ut selv" and keeps the form usable (offline-safe).
- The response also says whether the org number is already a customer
  (`existing_customer: CustomerRef | null`) and a supplier (`also_supplier`).
- Tests monkeypatch `brreg.fetch` (and clear the cache with a fixture); **no test hits the
  network**. Nothing calls the register in seed-demo.

### 2.3 Names (`names.py`)

- `fold(s)`: NFKC, case-fold, collapse whitespace, strip. Auto-match key.
- `core(s)`: `fold`, drop bracketed notes, normalise legal forms written with
  punctuation (`a/s`, `a.s.`, `a s` → `as`; `asa`, `ans`, `da`, `ab`, `ltd`, `gmbh`, … —
  copy the suppliers list into this module, do not import `app.modules.suppliers`), drop
  a trailing legal form, drop punctuation, `&` → `og`. Cores shorter than 4 characters
  never match on core alone.
- `similarity(a, b)`: `difflib.SequenceMatcher` ratio on cores.
- `is_generic(s)`: stop list of group names that are not a company ("kunder",
  "customers", "sluttkunder", "privatkunder", "kunde", "customer", "b2b", "b2c",
  "offentlige kunder", "-", "n/a", "ukjent", …, after `fold`), plus anything with an `@`
  (an e-mail).
- `normalise_org_number(raw, country)`.

### 2.4 API (`/api/v1/orgs/{org_id}/customers`)

| Method & path                                                                      | Perm   | Notes                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                                                                            | read   | `q` (name, code, org nr, city), `status` (csv), `segment`, `owner_user_id`, `has_open_claims`, `sort` (`name`, `-updated`, `next_renewal`), `limit`, `offset`. Items carry `open_claims`, `next_renewal` (`{date, days, contract_id}`), `also_supplier` (bulk, §2.6). |
| `GET /options`                                                                     | read   | picker: `q`, `limit` ≤ 50, `include_id` (keeps a current value in the list) → `[CustomerRef + org_number]`; excludes deleted                                                                                                                                          |
| `GET /summary`                                                                     | read   | counts per status, `pending_matches`, `last_scan` (`{at, created, linked, pending}` or null)                                                                                                                                                                          |
| `GET /segments`                                                                    | read   | distinct segments in use                                                                                                                                                                                                                                              |
| `GET /registry/{orgnr}`                                                            | write  | Brønnøysund lookup (§2.2)                                                                                                                                                                                                                                             |
| `GET /by-org-number/{orgnr}`                                                       | read   | `CustomerRef` or 404; used by the supplier card ("Også kunde")                                                                                                                                                                                                        |
| `POST /`                                                                           | write  | 201 `CustomerDetail`; 409 `customer_org_number_taken` `{customer: CustomerRef}`                                                                                                                                                                                       |
| `GET /{id}`                                                                        | read   | `CustomerDetail`: fields, `owner`, `contacts[]`, `also_supplier`, `orgnr_checksum_ok`, `can_edit`, `can_manage`                                                                                                                                                       |
| `PATCH /{id}`                                                                      | write  | partial update; status change emits `customer.status_changed`                                                                                                                                                                                                         |
| `DELETE /{id}`                                                                     | manage | soft delete                                                                                                                                                                                                                                                           |
| `POST /{id}/merge`                                                                 | manage | `{into_id}` → re-points every `FIELDS` column / JSONB list / `entity_link` / task entity, moves contacts, soft-deletes `{id}`; returns the target                                                                                                                     |
| `GET /{id}/overview`                                                               | read   | the card aggregate (§5)                                                                                                                                                                                                                                               |
| `POST /{id}/contacts`, `PATCH /{id}/contacts/{cid}`, `DELETE /{id}/contacts/{cid}` | write  | contacts                                                                                                                                                                                                                                                              |
| `GET /matches`                                                                     | write  | `status` (default `pending`), grouped by proposed customer: `[{proposed: CustomerRef \| null, proposed_name, items: [MatchOut]}]`                                                                                                                                     |
| `POST /matches/scan`                                                               | manage | runs the engine for the org (§6); returns `{created, linked, pending, skipped}`                                                                                                                                                                                       |
| `POST /matches/{mid}/accept`                                                       | write  | `{customer_id?}` (default the proposal) → links the record                                                                                                                                                                                                            |
| `POST /matches/{mid}/create`                                                       | write  | `{name?}` → new customer from the text (status `active`), links the record                                                                                                                                                                                            |
| `POST /matches/{mid}/dismiss`                                                      | write  | leaves the record unlinked; never proposed again                                                                                                                                                                                                                      |
| `POST /matches/bulk`                                                               | write  | `{ids, action: accept \| create \| dismiss}`                                                                                                                                                                                                                          |

`CustomerRef = {id, code, name, status, deleted}` (the shape lanes embed).
Every mutation calls `audit.record(...)` in-transaction. Events (`events.py`):
`customer.created`, `customer.updated`, `customer.status_changed`, `customer.deleted`,
`customer.merged` (owner notified on status change and merge), `customer.match_pending`
(`notify=False`, timeline only). Timeline keys in the `customers` scope.

### 2.5 `refs.py` — the public helpers lanes import

```python
class CustomerRefOut(BaseModel): id: UUID; code: str; name: str; status: str; deleted: bool
async def require_customer(session, org_id, customer_id: UUID | None) -> None
    # None passes; unknown / other org / deleted -> HTTPException 422 {"code": "invalid_customer"}
async def refs_for(session, org_id, ids: Iterable[UUID | None]) -> dict[UUID, CustomerRefOut]
    # one query; deleted customers included (deleted=True)
def ref_or_none(refs, customer_id) -> CustomerRefOut | None
def customer_url(customer_id) -> str            # "/customers/<id>"
```

These are the **only** things lanes import from `app.modules.customers` (plus
`contract.py`). The ref is returned regardless of `customers:read` (the name is part of
the record); the portal only makes it a link when the user can read customers.

### 2.6 "Også leverandør"

`also_supplier(session, org_id, caller, customers)`: when the `suppliers` module is
enabled and the caller has `suppliers:read`, one query through the kit table lookup
(`entity_table("supplier")`, not supplier code):
`regexp_replace(registration_number, '\D', '', 'g')` (after stripping a leading `NO` and
trailing `MVA`) equals the customer's org number, supplier not deleted → `{id, code,
name}`. Otherwise `null`.

### 2.7 Search, AI, next actions

- Search provider `customer`: name, legal name, code, org number (digits), city. Contacts
  are not searched (personal data). Add synonyms `kunde`/`kunder`/`customer`/`klient` to
  `app/platform/search/vocabulary.py` only if that file has a place for module synonyms
  (one-line edit).
- AI tools (`ai_tools.py`): `standard_record_tools(prefix="customers", …,
with_list=True)` (search, get, create_draft confirm-before-write, summarise, list) and
  **`customers_status`**: input `{customer: name | code | id}` → resolves (ambiguous →
  returns candidates), then returns the overview facts and the open items of each section
  the caller may read, with citations. Model-facing description: "Status for one
  customer: open claims and complaints, contracts and renewal dates, projects,
  satisfaction trend, customer requirements, latest customer audit." `EntityQuerySpec`
  for `customer` with `group_by=("status", "segment", "owner")`. No vendor/model names in
  any string.
- Next action (`next_actions.py`): "Bekreft N kundetreff" (`kind="confirm_suggestions"`,
  url `/customers/matches`) for callers with `customers:write` when pending matches > 0.
  "Kontrakt med X fornyes om N dager" is **not** added here (contracts already has due
  items).

---

## 3. Portal module `features/customers` (ENG-B)

Scope `customers` (`src/assets/i18n/customers/en.json`, `nb.json`, full parity,
natural Bokmål). Route scope via `provideTranslocoScope('customers')` in
`customers.routes.ts`; shared components (§3.3) use `provideSharedScope('customers')` in
`viewProviders`. No vendor/model names.

### 3.1 Pages

| Route                 | Page                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/customers`          | List (`record-list-page`): Navn (+ chip "Også leverandør"), Org.nr., Status, Segment, Kundeansvarlig, Åpne reklamasjoner, Neste fornyelse. Filters: status, segment, kundeansvarlig, "Har åpne reklamasjoner". Empty register + `last_scan == null` + `customers:manage`: empty state with primary "Finn kunder i eksisterende data" (runs scan, then shows the result and a link to the review list). Banner "N kundetreff venter på gjennomgang → Gå gjennom" when pending > 0. |
| `/customers/new`      | Form, org number **first**: on blur / 9 digits → lookup → fills empty fields (never overwrites typed values; "Hentet fra Brønnøysundregistrene" note); 409 duplicate → "Finnes allerede: X → Åpne". 503 → calm warning, form stays usable. Mod-11 failure → inline warning only. `?from_supplier=<id>` prefills from the supplier.                                                                                                                                                |
| `/customers/:id`      | The customer card (§5)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/customers/:id/edit` | Same form                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/customers/matches`  | "Gjennomgå kundetreff": groups per proposed customer ("Fjord Industrier ASA ← «Fjord Industrier AS» i tilbakemelding TB-0004"), each row: source text, where it was found (entity chip), reason in plain words ("Samme navn, annen skrivemåte"), actions **Koble til** · **Opprett ny kunde** · **Ikke en kunde**, plus "Koble til en annen kunde…" (picker). Bulk select. Scan button for `customers:manage`.                                                                    |

Contacts are edited inline on the card (slide-over form), not on a separate page.

### 3.2 Shell (keep edits minimal; the chat feature also touches these files)

- `app.routes.ts`: `moduleRoute('customers', 'customers', () => import('./features/customers/customers.routes'))`
  next to projects.
- `layout/nav.ts`: `moduleItem('customers', 'customers', <distinct icon>)` first in
  "Daglig drift" (before Prosjekter). Pick an existing icon not used by another module;
  add one to the icon set only if none fits.
- `layout/nav-v2.ts`: new `REGISTER_GROUPS` entry `{ key: 'customers', labelKey:
'shell.groups.customers', modules: ['customers'] }` before `suppliersAssets`, and a
  Registrer entry `{ key: 'customer', path: 'customers/new', labelKey:
'shell.registrer.customer', permission: 'customers:write', module: 'customers' }`.
- Global `en.json`/`nb.json` (only these keys): `modules.names.customers` ("Customers" /
  "Kunder"), `modules.descriptions.customers`, `modules.entities.customer` ("Customer" /
  "Kunde"), `modules.entities.customer_contact` ("Contact person" / "Kontaktperson"), the
  module "why" line if the file has one per module, and **every** create-flow label
  `flows.customer.to_*` of §4.3 (so lanes never edit global files). `shell` scope:
  `groups.customers`, `registrer.customer`.
- Supplier card (`features/suppliers/detail/supplier-anatomy.ts` or the lead template):
  chip "Også kunde → CUS-0004" from `GET /customers/by-org-number`, only when the
  customers module is on and the user has `customers:read`; overflow item "Registrer som
  kunde" (`/customers/new?from_supplier=<id>`) when not a customer yet. Keys in the
  `customers` scope via `provideSharedScope`.

### 3.3 Shared components lanes use (`src/app/shared/customers/`)

| File                        | Selector / API                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer.models.ts`        | `CustomerRef { id; code; name; status; deleted }`                                                                                                                                                                                                                                                                                                              |
| `customer-ref-api.ts`       | `options(orgId, q, includeId?)`, `quickCreate(orgId, name)` (via `ApiService`)                                                                                                                                                                                                                                                                                 |
| `customers-availability.ts` | `CustomersAvailability` (root): `enabled` (module on), `canRead`, `canWrite` signals                                                                                                                                                                                                                                                                           |
| `customer-picker.ts`        | `<app-customer-picker [value]="id \| null" [current]="ref \| null" [required]="bool" [inputId]="…" (valueChange)="…" />` – combobox with typeahead; "Ingen kunde"; "Opprett kunden «X»" quick-create for `customers:write`; renders nothing when the module is off. Own label key `customers.ref.label` ("Kunde") available for the caller's `app-form-field`. |
| `customer-chip.ts`          | `<app-customer-chip [ref]="ref" />` – name (+ "slettet" when deleted); a link to `/customers/:id` when `canRead`, plain text otherwise; "–" for null in tables                                                                                                                                                                                                 |
| `customer-filter.ts`        | `<app-customer-filter [value]="id" (valueChange)="…" />` – list-toolbar filter (same typeahead), bound by the caller to `?customer_id=`                                                                                                                                                                                                                        |
| `customer-prefill.ts`       | `customerIdFromRoute(route)` – reads `?customer_id=` for new-forms                                                                                                                                                                                                                                                                                             |
| `index.ts`                  | exports                                                                                                                                                                                                                                                                                                                                                        |

Keys these components own (in `customers` scope): `ref.label`, `ref.none`,
`ref.placeholder`, `ref.create` ("Opprett kunden «{{name}}»"), `ref.deleted`,
`ref.column` ("Kunde"), `ref.filterAll` ("Alle kunder"), `ref.noAccess`.

---

## 4. The "Kunde" field contract (every module adopts it)

### 4.1 Backend (per record type)

1. **Column** per §1.4, in the lane's migration.
2. **Schemas**: Create/Update accept `customer_id: uuid.UUID | None`; Out/List items
   return `customer_id` and `customer: CustomerRefOut | None` (bulk via `refs_for`).
3. **Service**: `await refs.require_customer(session, org_id, data.customer_id)` on
   create/update when the key is present; the change is part of the existing audit diff
   and revision. No new event kinds.
4. **List filter**: `customer_id: uuid.UUID | None = Query(None)` on the list endpoint.
5. **StructuralRelation** in the module's `relations.py` (create it if missing and add
   `HOOK_STRUCTURAL_RELATIONS` to the manifest): `entity_type=<type>`,
   `target_type="customer"`, `link_type="relates_to"`, `resolve` (record → [customer_id])
   and `reverse` (customer → record ids, live rows only, limit like `audits/relations.py`).
6. **Create flow** (`flows.py`, `CreateFlowSpec`): `key="customer.to_<x>"`,
   `source_type="customer"`, `target_type=<type>`, `label_key="flows.customer.to_<x>"`,
   `link_type=""` (the FK relates them), `target_route="/<module>/new"`, `prefill` →
   `{"customer_id": str(source_id)}` plus anything useful (e.g. contract party name and
   org number), `permission=<module write>`.
7. **`customer_link.py`** (§4.2).
8. Demo: in the module's `demo.py` `connect` (runs after all seeders), set `customer_id`
   on a few showcase records by looking up demo customers by `code` (§8). Idempotent.
9. Tests (lean): create/update with a customer, `invalid_customer` 422, list filter,
   structural relation both directions, the section provider, the legacy source.

### 4.2 `app/modules/<m>/customer_link.py`

Defined by ENG-A in `app/modules/customers/contract.py`; discovered by importing
`app.modules.<key>.customer_link` for every registered module key (missing module = no
contribution). Pure declarations + small async/Core functions; no imports of the
customers service.

```python
@dataclass(frozen=True)
class CustomerField:
    key: str                  # "<module>.<place>", e.g. "projects.project", "contracts.party"
    module: str
    entity_type: str          # what the user sees / opens, e.g. "contract"
    table: str                # table holding the reference, e.g. "contract_party"
    column: str = "customer_id"
    many: bool = False        # True: JSONB list of id strings (data_breach.customer_ids)
    entity_id_column: str = "id"   # e.g. "contract_id" for contract_party
    deleted_column: str | None = "deleted_at"
    # Legacy free text for the scan, or None. ref -> (table: sa.Table) -> LegacySource
    legacy: str | None = None

@dataclass(frozen=True)
class LegacySource:
    text: ColumnElement[str]                   # e.g. table.c.name, table.c.data["customer_name"].astext
    org_number: ColumnElement[str] | None = None
    where: ColumnElement[bool] | None = None   # e.g. table.c.role == "customer"
    active: ColumnElement[bool] | None = None  # record counts as current -> new customer "active", else "former"

@dataclass(frozen=True)
class CustomerSection:
    key: str        # one of SECTION_KEYS below
    module: str
    read_permission: str
    order: int
    # ref -> async (session, org_id, caller, customer_id, today) -> SectionData
    load: str
    # optional ref -> async (session, org_id, customer_ids, today) -> dict[UUID, dict[str, Any]]
    # (list-column facts, keys from FACT_KEYS)
    counts: str | None = None

@dataclass
class SectionData:
    total: int
    open: int
    items: list[dict[str, Any]]   # ≤ 10, each: ref_dto(EntityRef) + optional "extra" {due_on, days, severity, score, badge_key}
    facts: dict[str, Any]         # keys from FACT_KEYS only
    list_url: str | None          # e.g. "/deviations?customer_id=<id>"
    flow_key: str | None          # "customer.to_claim" for the section's "+ Ny" button
```

`SECTION_KEYS = ("claims", "deviations", "contracts", "projects", "satisfaction",
"requirements", "audits", "privacy", "property", "documents", "work")` (fixed card
order). `FACT_KEYS`: `open_claims` (int, summed), `open_deviations` (int),
`active_contracts` (int), `next_renewal` (`{date, days, contract_id, code, notice_by?}`,
earliest wins), `active_projects` (int), `satisfaction` (`{score, trend: up|down|flat,
points: [{period: "2026-Q3", score, n}], complaints_12m, compliments_12m}`),
`open_requirements` (int: not compliant / not evaluated), `last_audit` (`{date,
audit_id, code, open_findings}`), `next_audit` (`{date, audit_id}`), `processing`
(int), `open_breaches` (int), `property_items` (int). Unknown keys are dropped by the
aggregator (log once).

The engine applies a match with a generic Core `UPDATE <table> SET <column> = :cid
WHERE id = :row_id AND org_id = :org` (JSONB: append if absent); merge re-points with
`UPDATE … WHERE <column> = :from` (JSONB: replace in list). Lanes therefore need no
apply/merge code.

### 4.3 Per-module mapping

| Module (lane)        | Field key / entity type                                                                                                                                                                                       | Legacy free text (scan)                                                                                                                             | Section(s) and facts                                                                                                                                                                                                                                  | Create flow                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| projects (L1)        | `projects.project` / `project`                                                                                                                                                                                | none today (no client field); scan nothing                                                                                                          | `projects`: active first, health, due; `active_projects`                                                                                                                                                                                              | `customer.to_project`                                                                                                                                                                          |
| contracts (L1)       | `contracts.party` / `contract` (table `contract_party`, `entity_id_column="contract_id"`)                                                                                                                     | `name`, `org_number`, where `role = 'customer'` or contract type in (`customer`) and party not internal; `active` = contract status active/approved | `contracts`: active contracts with end date, notice-by date (`end_date - notice_period_days`), auto-renew, type (customer / NDA / DPA we-process); facts `active_contracts`, `next_renewal`                                                           | `customer.to_contract` (prefill type `customer`, a counterparty party with the customer's name, org nr, primary contact) and `customer.to_dpa` (type `dpa`, `personal_data_role = we_process`) |
| deviations (L1)      | `deviations.deviation` / `deviation`                                                                                                                                                                          | `data->>'customer_name'` (any record type that has it, incl. the demo's own types); `active` = `status_category in (open, in_progress)`             | `claims` (record type key `customer_complaint` or `source = 'customer'`) and `deviations` (the rest, e.g. incidents affecting the customer); `open_claims`, `open_deviations`                                                                         | `customer.to_claim` (type `customer_complaint`, source `customer`), `customer.to_deviation`                                                                                                    |
| feedback (L1)        | `feedback.item` / `customer_feedback`; `feedback.survey` / `survey`; `feedback.response` / `survey_response`                                                                                                  | `customer_organisation` (D12)                                                                                                                       | `satisfaction`: quarterly mean of `survey_response.score` (last 8 quarters, response's customer or its survey's), complaints / compliments 12 months, trend (last two quarters with n > 0: Δ ≥ 5 up, ≤ −5 down); open complaints add to `open_claims` | `customer.to_feedback`                                                                                                                                                                         |
| audits (L2)          | `audits.plan` / `audit_plan`                                                                                                                                                                                  | `external_party_name` where `external_party_type = 'customer'`                                                                                      | `audits`: latest completed, next planned, open findings; `last_audit`, `next_audit`                                                                                                                                                                   | `customer.to_audit` (kind external, party type customer)                                                                                                                                       |
| obligations (L2)     | `obligations.obligation` / `compliance_obligation`                                                                                                                                                            | none (issuer is usually an authority); scan nothing                                                                                                 | `requirements`: active obligations with compliance status; `open_requirements`                                                                                                                                                                        | `customer.to_requirement` (type `contract`)                                                                                                                                                    |
| privacy (L2)         | `privacy.ropa` / `ropa_entry`; `privacy.breach` / `data_breach` (`many=True`, column `customer_ids`)                                                                                                          | `controller_name` where `role = 'processor'`                                                                                                        | `privacy`: processing activities as processor, breaches affecting the customer (open first, with the "notify the controller without undue delay" status, GDPR Art. 33(2)); `processing`, `open_breaches`. DPAs appear under `contracts`.              | `customer.to_processing` (role processor, controller = customer)                                                                                                                               |
| assets (L2)          | `assets.asset` / `asset`                                                                                                                                                                                      | none                                                                                                                                                | `property`: customer property (ISO 9001 8.5.3) with condition/status; `property_items`                                                                                                                                                                | `customer.to_property`                                                                                                                                                                         |
| documents (L2)       | `documents.document` / `document`                                                                                                                                                                             | none                                                                                                                                                | `documents`: customer-specific documents (title, type, status)                                                                                                                                                                                        | `customer.to_document`                                                                                                                                                                         |
| context (L2)         | link only (`interested_party` ↔ `customer`, `entity_link relates_to`). The `FIELDS` entry uses `table="interested_party"`, `column=""` and the engine writes a link instead of an UPDATE when `column == ""`. | `name` where `category = 'customer'`, not generic (`names.is_generic`)                                                                              | none (shown under Relatert)                                                                                                                                                                                                                           | –                                                                                                                                                                                              |
| tasks (L2, platform) | no column: a task "about" the customer has `entity_type='customer'`                                                                                                                                           | –                                                                                                                                                   | `work` is built by **ENG-A** (open tasks on the customer and on the records of every other section)                                                                                                                                                   | the kit's existing "Ny oppgave" on the card                                                                                                                                                    |

Contracts DTO: `customer` = first non-internal party with `customer_id`; create accepts
`customer_id` and then creates/updates that counterparty party (role `customer`, or
`controller` for a DPA where we process) with the customer's name, org number and primary
contact. The party editor gets a customer picker next to the supplier picker (a party is a
supplier **or** a customer, not both).

Deviations: the Kunde field is shown for every type (advanced tier) and in the quick tier
and required when the record type's template says `"customer_field": "required"` (read
from the template JSON extras the F4 loader ignores; installed types keep working because
the column is independent of the type version). Template edits: rename to "Reklamasjon /
kundeklage" / "Customer claim or complaint", replace `customer_name` with the first-class
field (remove it from `fields` and `layout`), keep `customer_reference`. Existing
deviations keep `data.customer_name` (shown read-only as "Kunde (fritekst)" until
linked).

---

## 5. The customer card (`/customers/:id`)

Detail anatomy, `docs/ux-guide.md` §2.7, `[anatomy]="true"`, entity type `customer`.

1. **Header**: h1 = name. Meta: `CUS-0004 · Kunde · <status badge>`. Primary action
   **Rediger**; secondary "Ny reklamasjon" (flow `customer.to_claim`, only if deviations
   on + permission). Overflow: create flows of §4.3 the user may run ("Nytt prosjekt", "Ny
   kontrakt", "Ny databehandleravtale", "Ny tilbakemelding", "Ny kunderevisjon", "Nytt
   kundekrav", …), "Hent på nytt fra Brønnøysundregistrene", "Slå sammen med…"
   (manage), Slett (manage). Spør KI: "Oppsummer kundestatus" (`customers_status`), "Hva
   bør vi følge opp hos kunden?".
2. **Hovedinformasjon** (`app-record-lead`):
   - Status sentence from `overview.facts`, at most three parts joined with " · ":
     "Aktiv kunde – 2 åpne reklamasjoner · kontrakt fornyes om 45 dager". Parts in order:
     open claims, open breaches, next renewal ≤ 120 days ("fornyes om N dager", or "må
     sies opp innen <dato>" when a notice date is within 60 days), open customer
     requirements, satisfaction down ("tilfredsheten går ned"). Tone: `warn` when any
     part is a to-do, `pass` ("Aktiv kunde – ingen åpne saker"), `neutral` for prospect /
     former ("Tidligere kunde – siste kontrakt utløp 12.03.2025" when known). Plural
     keys use the `…One` / `…Many` convention.
   - Lead fields: Org.nr. (with "Også leverandør → Nordlønn AS" chip when
     `also_supplier`; Brønnøysund warning chip when bankrupt / under liquidation /
     deleted), Adresse, Kundeansvarlig, Hovedkontakt (name · e-mail · phone), Segment ·
     Bransje (NACE).
3. **Tabs** (default set): Detaljer · Relatert · Aktivitet · Mer (comments, attachments,
   revisions). The **Detaljer** tab shows, in `SECTION_KEYS` order, one compact panel
   per section that has items **or** a create flow the user may run (empty sections with
   no possible action are hidden):
   Reklamasjoner og klager · Avvik og hendelser · Kontrakter (end date, "fornyes om N
   dager", DPA marker) · Prosjekter · Tilfredshet (small trend line of quarterly scores
   - "N klager og M ros siste 12 måneder") · Kundekrav · Revisjoner fra kunden (siste,
     neste, åpne funn) · Personvern (behandlingsaktiviteter som databehandler, brudd) ·
     Kundens eiendom · Dokumenter · Oppgaver. Each panel: up to 5 items (open first),
     "Se alle (N) →" (`list_url`), "+ Ny …" (`flow_key`). Empty but actionable: one line
     "Ingen ennå · + Ny …". Then **Kontaktpersoner** (list, add / edit / remove, primary
     star), then `app-record-details` (legal name, org form, country, website, e-mail,
     phone, customer since, Brønnøysund checked at, description).
4. **Oppfølging** (aside): missing items: "Ingen kundeansvarlig · Velg", "Ingen
   kontaktperson · Legg til", "Org.nr. mangler · Fyll ut" (country NO only),
   "Kontrakt CT-0003 må sies opp innen <dato>" (link), "N kundetreff venter · Gå
   gjennom" (matches proposed for this customer). Requirements panel (ISO 9001 8.2.1,
   8.2.3, 9.1.2 suggestions from the manifest). Koblet til (kit). Meta: Kundeansvarlig ·
   Kunde siden · Sist endret.
5. **Phones**: header → Hovedinformasjon → Oppfølging → tabs.

### 5.1 `GET /customers/{id}/overview`

```json
{
  "customer": CustomerRef,
  "facts": { "open_claims": 2, "next_renewal": {"date": "2027-01-03", "days": 45, "contract_id": "…", "code": "CT-0003", "notice_by": "2026-12-04"}, "satisfaction": {…}, … },
  "sections": [
    {"key": "claims", "module": "deviations", "total": 5, "open": 2, "items": [ … ],
     "list_url": "/deviations?customer_id=…", "flow_key": "customer.to_claim"}
  ],
  "pending_matches": 1
}
```

The aggregator runs each discovered section whose module is enabled and whose
`read_permission` the caller has (others are omitted, never 403), each in try/except
(a broken provider logs and is skipped; the card still renders). `facts` merges the
sections' facts (sum for counts, earliest for dates). Items are resolved through
`registry.resolve_entities` (row-level access applies). The `work` section (ENG-A):
open tasks with `entity_type='customer'` plus open tasks whose entity is an item of the
other sections, max 10.

---

## 6. Migration of existing free text (matching engine, ENG-A)

`matching.scan(session, org_id, actor) -> ScanResult`, async; a sync twin for the CLI
and the demo shares the planning code (pure functions over fetched rows; only execution
differs). Idempotent; safe to run any time.

1. **Collect** mentions from every `CustomerField.legacy` source: rows of live records
   whose FK is NULL, whose text is not empty / generic, and that have no
   `customer_match` row yet (any status).
2. **Normalise**: `fold`, `core`, org number.
3. **Resolve against existing customers**, in order:
   1. same org number → link (applied);
   2. same `fold(name)` as one live customer (name or legal name) → link;
   3. same `core` as one or more customers, or similarity ≥ 0.88 with core length ≥ 4
      → `customer_match` pending (`same_core_name` / `similar_name` / `ambiguous`,
      proposal = best candidate); the record stays unlinked.
4. **Cluster the rest** by org number, then by `fold`. Each cluster is one new customer
   (name = the most frequent spelling; org number if any; status `active` if any member
   is `active` per `LegacySource.active`, else `former`; `owner_user_id` = the most
   frequent owner of the member records, else none). All members are linked.
5. **Near-duplicate clusters**: when two new clusters share a `core` (or similarity ≥
   0.88), only the larger cluster becomes a customer; members of the smaller one become
   pending matches proposing it ("Fjord Industrier AS" → "Fjord Industrier ASA").
6. **Write**: customers (`audit.record` per customer, actor = the user, or `system` from
   CLI/demo), FK updates (`audit.record` per linked record, action
   `customer.linked`), pending matches. Store `{at, created, linked, pending,
skipped}` in `org_module.settings["scan"]` for `customers`.
7. **Decisions** (`accept` / `create` / `dismiss`) apply one match; `accept` with a
   different customer is allowed. After a decision, other pending matches with the same
   `fold(source_text)` get the same proposal (so one decision clears "Fjord A/S"
   everywhere — the review page offers "Bruk samme valg for 3 like treff").

Triggers: the list empty state and the review page (manage), CLI
`python -m app.cli customers-scan [--org <slug> | --all]` (run by deploy /
update-dev after migrating), and `demo.DEMO_FINALIZE` (after every module's `connect`).
No automatic scan on read.

Tests: a fake `CustomerField` registered in the test (no lane needed): exact org nr,
exact name, "Fjord AS" vs "Fjord A/S" pending, generic names skipped, re-run is a no-op,
merge re-points, `dismiss` is final.

---

## 7. Requirement locations (LANE-2, after phase 1)

ENG-A adds the location **`customers.register`** in `app/platform/locations/catalog.py`
(+ `locations/i18n` en/nb, `locations.keys.txt`): entity `customer`, model
`app.modules.customers.models:Customer`, route `/customers`, fields `status`,
`owner` (`owner_user_id`), `segment`, `framework: NO_SCOPE`; states `active`,
`prospect`, `former`, `with_owner`; dates `created`, `updated`; population `active`;
kinds `STD_KINDS + each_has_related`; noun `customer`; relations
`{"customer_contact": "reverse:customer_contact.customer_id"}` (ENG-A may add the
lane tables' reverse relations later — LANE-2 adds them in phase 2).

LANE-2 owns the mapping changes in `app/standards/locations/iso9001-2026.yaml` (strict
loader test must pass), plus any states it needs on existing locations
(`assets.register` state `customer_property` = `customer_id` not null;
`deviations.register` state `customer_linked`; `obligations.register` state
`customer_requirement`):

| Requirement                                   | Change                                                                                                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.2.1.r2 (orders and contracts)               | add `customers.register` supporting                                                                                                                                                             |
| 8.2.1.r3 (customer feedback incl. complaints) | add `customers.register` supporting                                                                                                                                                             |
| 8.2.1.r4 (customer property communication)    | **map**: `assets.register` primary, rule `has_entries where {state: customer_property}`; `customers.register` supporting. Remove from `unmapped`.                                               |
| 8.2.2.r\* / 8.2.3.x (customer requirements)   | add `obligations.register` supporting with `where {state: customer_requirement}` and `customers.register` supporting on the 8.2.3.1 entries (`*contract_review` anchor: extend the anchor once) |
| 8.5.3.r1, r3 (register / safeguard)           | **map**: `assets.register` primary, `has_entries where {state: customer_property}` + `none_overdue` on its review date if the location has one; `customers.register` supporting                 |
| 8.5.3.r2 (receipt check)                      | **map**: `inspections.templates` primary (`has_entries`), `assets.register` supporting                                                                                                          |
| 8.5.3.r4, r5 (lost / damaged, owner told)     | **map**: `deviations.register` primary, `rules: []` (evidenced by linked deviations; no rule that fails an org with no incidents), `customers.register` supporting                              |
| 9.1.2.r1, r2 (customer satisfaction)          | add `customers.register` supporting (the card's satisfaction trend)                                                                                                                             |
| HS 4.2 (interested parties)                   | add `customers.register` supporting where the hs file maps 4.2 to `context.interested_parties` (only if the hs mapping has a per-requirement entry; do not restructure it)                      |

Remove every newly mapped ref from `unmapped`; bump the file `version`. Exact rule
spellings follow the loader's vocabulary; if a rule kind is not available, use
`rules: []` and note it in the report.

---

## 8. Demo data

ENG-A, `customers/demo.py` `seed` (runs before the lanes' `connect`): curated customers
with fixed codes, contacts and owners. Org numbers are fictional and fail mod-11 (D4).

| Code     | Name                 | Status   | Segment   | Notes                                                                                                                                                       |
| -------- | -------------------- | -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CUS-0001 | Fjord Industrier ASA | active   | Industri  | org nr `999 000 001`, NACE 28.290; 2 contacts; owner quality manager. The scan proposes the feedback's "Fjord Industrier AS" as a match (review list demo). |
| CUS-0002 | Bergen kommune       | active   | Offentlig | contact in Etat for utbygging                                                                                                                               |
| CUS-0003 | Drammen Eiendom AS   | active   | Eiendom   |                                                                                                                                                             |
| CUS-0004 | Nordlønn AS          | active   | Tjenester | org nr `912 345 678` = the demo supplier's → "Også leverandør"                                                                                              |
| CUS-0005 | Vestland Havbruk AS  | prospect | Havbruk   | no links (shows the prospect state)                                                                                                                         |
| CUS-0006 | Oslo kommune         | former   | Offentlig | linked by the scan from the demo deviation's `customer_name`                                                                                                |

Lanes in their `connect`: projects – "New customer portal" → CUS-0001; contracts – the
Fjord Industrier framework agreement's customer party → CUS-0001 (renewal within ~45
days if the demo dates allow, so the status sentence shows), a DPA where we are processor
→ CUS-0004; deviations – one open claim (`customer_complaint`) for CUS-0001 and one
closed for CUS-0003; feedback – a few survey responses for CUS-0001 over 4 quarters
(trend), feedback items from Bergen kommune → CUS-0002; audits – one completed customer
audit by CUS-0001 with an open finding; obligations – "Kundens krav: ISO 14001-sertifikat
for leverandører" → CUS-0001; privacy – a processor ROPA entry for CUS-0004; assets – a
customer-owned measuring instrument → CUS-0001; documents – the Fjord Industrier
technical specification → CUS-0001; context – the interested party "Kunder" stays generic
and gets a link to the register (§9). `DEMO_FINALIZE` (ENG-A) runs the scan last.

---

## 9. Interested party "Kunder"

LANE-2, portal party detail (`features/context/detail/party-detail.ts`): when
`category = customer` and the customers module is on, `[follow-up-connections]` shows
"Kunderegisteret: N aktive kunder →" (`GET /customers/summary`) and the lead's
requirements text gets a hint "Krav fra enkeltkunder registreres på kundekortet".
Named customer parties (not generic) are linked to their customer by the scan
(`entity_link relates_to`) and show under Koblet til.

---

## 10. Work split and file ownership

Phases: **Phase 1** ENG-A ‖ ENG-B (ENG-B codes against §2.4 / §3.3 / §5.1 with mocked
API). **Phase 2** LANE-1 ‖ LANE-2, both branched from main after phase 1 is merged
(they need the `customer` table, `refs.py`, `contract.py` and the shared portal
components). QA after each phase. If a lane needs a contract change in a phase-1 file,
it reports it instead of editing.

### ENG-A — customers backend (`coreflow-core`)

Owns: `app/modules/customers/**`, `alembic/versions/cf210_customers.py`,
`tests/modules/customers/**`, the `customers.register` entry in
`app/platform/locations/catalog.py` + `app/platform/locations/i18n/{en,nb}.json` +
`locations.keys.txt`, one line in `app/platform/modules/packages.py`, the
`customers-scan` command in `app/cli.py`, optionally `app/ai/howto/customers.json` and
a synonym line in `app/platform/search/vocabulary.py`.
Delivers: model + migration (incl. module switch-on), API §2.4, Brønnøysund §2.2,
`refs.py`, `contract.py` (+ discovery), overview aggregator §5.1 incl. the `work`
section, matching engine + review queue + merge §6, search, AI tools, next action,
events, demo §8. Tests mock `brreg.fetch`; nothing hits the network or a model.

### ENG-B — customers portal (`coreflow-portal`)

Owns: `src/app/features/customers/**`, `src/app/shared/customers/**`,
`src/assets/i18n/customers/{en,nb}.json`; minimal edits in `app.routes.ts`,
`layout/nav.ts`, `layout/nav-v2.ts`, global `src/assets/i18n/{en,nb}.json` (only the
keys in §3.2), `src/assets/i18n/shell/{en,nb}.json` (two keys), and the supplier card
chip / overflow item (§3.2). Delivers: list, new/edit form with Brønnøysund prefill,
card §5 (sections rendered generically from `overview.sections`, so lanes add no card
code), contacts, review-matches page, shared picker / chip / filter / prefill, nav.

### LANE-1 — projects, contracts, deviations/claims, feedback (backend + portal)

Backend owns: `app/modules/projects/**`, `app/modules/contracts/**`,
`app/modules/deviations/**` (incl. `templates/customer_complaint.json`),
`app/models/deviation.py`, `app/services/deviation_service.py` (customer column / filter
only), `app/modules/feedback/**`, `alembic/versions/cf211_customer_links_l1.py`, tests
of those modules.
Portal owns: `src/app/features/{projects,contracts,deviations,feedback}/**`,
`src/app/core/deviations/**`, `src/assets/i18n/{projects,contracts,deviations,feedback}/*`.
Note: the deviation column covers incidents too (LANE-2 does not touch deviations).

### LANE-2 — audits, obligations, privacy, assets, documents, tasks, interested parties, requirement locations (backend + portal)

Backend owns: `app/modules/{audits,obligations,privacy,assets,context}/**`,
`app/models/document.py` + `app/services/document_service.py` + `app/modules/documents/**`
(customer column / filter only), `app/platform/tasks/**` (customer filter only),
`app/standards/locations/iso9001-2026.yaml` (+ `hs.json` if §7 applies),
location states on existing entries in `app/platform/locations/catalog.py` and their
i18n, `alembic/versions/cf212_customer_links_l2.py`, tests of those modules.
Portal owns: `src/app/features/{audits,obligations,privacy,assets,context,documents}/**`,
`src/app/shared/tasks/**` (Kunde picker when the task has no other record; list filter),
`src/app/core/documents/**`, the matching scoped i18n files.

### Shared-file rules

- Never edit another owner's files; never edit `app/platform/registry.py` (verbatim
  kernel) or the kit detail layout.
- The chat feature (branches `core/chat-*`, `portal/chat`) is in flight: do not touch its
  files; keep `seed-demo`, nav and detail-anatomy edits minimal and additive.
- i18n: en + nb at full parity in every file you touch; natural Bokmål; glossary of
  `docs/ux-guide.md` §7 (add "kunde / kundeansvarlig / reklamasjon / kundens eiendom" to
  the glossary in a later docs pass, not in feature branches).
- Lean checks: `cf-test.ps1 -Quick` on the touched tests during development, the full
  gate once before reporting; portal `npm run lint`, `npm test`, `npm run build`,
  `npx prettier --write <changed files>` (never `npm run format`).

### Glossary (binding for this feature)

| en                         | nb                                 |
| -------------------------- | ---------------------------------- |
| customer register          | kunderegister (nav: Kunder)        |
| customer card              | kundekort                          |
| customer owner             | kundeansvarlig                     |
| contact person             | kontaktperson                      |
| prospect / active / former | prospekt / aktiv / tidligere kunde |
| claim / complaint          | reklamasjon / klage                |
| customer property          | kundens eiendom                    |
| customer requirement       | kundekrav                          |
| customer audit             | kunderevisjon                      |
| org. number                | org.nr.                            |
| also a supplier            | også leverandør                    |
| match review               | gjennomgå kundetreff               |

---

## 11. Out of scope (v1)

Name typeahead against Brønnøysund; sub-units (`underenheter`); customer portal /
external access; CRM features (pipeline, sales opportunities, invoicing); automatic
periodic re-sync with Brønnøysund (manual "Hent på nytt" only); customer hierarchies
(group / subsidiary).

---

## 12. ENG-B contract notes (portal, 2026-11-19)

What the portal codes against where §2.4 / §5.1 left the shape open. ENG-A: match these
or report the difference.

- Lists: `GET /` → `{items, total}`; `GET /options` and `GET /segments` → plain arrays
  (`{items}` is also accepted); `GET /summary` → `{total?, by_status?, pending_matches,
  last_scan}`; `GET /matches` → `MatchGroup[]` (or `{items}`).
- `GET /registry/{orgnr}` → flat customer fields `{org_number, name, legal_name,
  org_form, address_line, postal_code, city, country, industry_code, industry_label,
  website, registry, existing_customer: CustomerRef | null, also_supplier: {id, code,
  name} | null}`. Errors: 404 → "not found" note, 422 → silent, anything else → "Fant
  ikke opplysninger akkurat nå – fyll ut selv" (form stays usable).
- `POST /` and `PATCH /{id}` accept `registry` (the lookup snapshot) besides the §1.1
  fields. "Hent på nytt fra Brønnøysundregistrene" = lookup + `PATCH` of `legal_name`,
  `org_form`, address, industry and `registry`.
- `MatchOut` carries `entity: EntityRefDto | null` (the record to show and open).
- Section item `extra.badge_key` values with portal labels (`customers.sections.badges.*`):
  `dpa`, `nda`, `autoRenew`, `processor`, `breach`, `notifyController`.
- Error codes with portal text: `customer_org_number_taken` (409, `detail.customer`),
  `invalid_orgnr`, `orgnr_not_found`, `registry_unavailable`, `invalid_status`,
  `invalid_user`, `name_required`, `invalid_customer`, `merge_into_self`,
  `match_not_pending`.
- Create-flow labels live in the **kit** scope (`kit.flows.customer.to_*`,
  `kit.flows.supplier.to_customer`), where `create-from-here` reads them, not in the
  global files (§3.2). "Registrer som kunde" on the supplier card is the backend flow
  `supplier.to_customer` (prefill `name`, `legal_name`, `org_number`, `country`,
  `website`) in the record's "Mer ⋯"; `/customers/new?from_supplier=<id>` also works.

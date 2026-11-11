# CoreFlow platform contracts (overnight build)

Status: written by the architect step on 2026-11-12, before any engineer starts. Scope:
`docs/compliance-platform-scope.md` (its section 3 "definition of done" applies to every
work item). Engineers code against this file. If something you need is missing, add the
smallest compatible extension **inside your own work item's files**, and list it in your
report under "contract additions".

Precedence: this file > `cf-test/AGENT-BRIEF.md` where they disagree (migration head,
worktrees). Repo `CLAUDE.md` conventions (audit, soft delete, naive-UTC datetimes, thin
routes, lazy SDK clients, no vendor names in the UI, i18n parity) always apply.

Contents

1. Naming, keys, branches, worktrees, test databases
2. The platform kernel (verbatim files every wave-0 branch adds)
3. File ownership and wave-0 cross-item calls
4. F1 Modules, org profile, terminology, setup wizard
5. F2 Tasks and My Work
6. F3 Events, notifications, watchers, reminders, escalation, timeline
7. F4 Record types and workflow engine
8. F5 Global search, AI tool registry, assists, page context
9. F6 Guidance levels, learning content, progress
10. F7 Frameworks catalogue, cross-mapping, clause declarations, readiness
11. F8 Entity links, comments, attachments, revision history, portal kit
12. Module integration recipe (M01-M24)
13. Migration rules
14. Integrator checklist
15. Decisions taken (for the morning report)

---

## 1. Naming, keys, branches, worktrees, test databases

### 1.1 Work items

| Item | Module key | Portal path / i18n scope (alias) | Migration revision | Branch slug |
|---|---|---|---|---|
| F1 | (`modules` platform pkg) | `settings/modules`, `setup` / scope `modules` | `cf20_modules` | `f1-modules` |
| F2 | `tasks` | `my-work`, `tasks` / scope `tasks` | `cf21_tasks` | `f2-tasks` |
| F3 | (`events` platform pkg) | scope `activity` | `cf22_events` | `f3-events` |
| F4 | (`records` platform pkg) | `settings/record-types` / scope `records` | `cf23_records` | `f4-records` |
| F5 | (`search` platform pkg + `app/ai`) | scope `search` | `cf24_assistant` | `f5-assistant` |
| F6 | (`guidance` platform pkg) | scope `guidance` | `cf25_guidance` | `f6-guidance` |
| F7 | (`standards`, existing) | `standards` | `cf26_frameworks` | `f7-frameworks` |
| F8 | (`kit` platform pkg) | scope `kit` | `cf27_record_kit` | `f8-record-kit` |
| M01 | `context` | `context` (`context`) | `cf31_context` | `m01-context` |
| M02 | `processes` | `processes` (`processes`) | `cf32_processes` | `m02-processes` |
| M03 | `deviations` (existing) | `deviations` (`deviations`) | `cf33_deviations_v2` | `m03-deviations` |
| M04 | `risk` | `risk` (`risk`) | `cf34_risk` | `m04-risk` |
| M05 | `inspections` | `inspections` (`inspections`) | `cf35_inspections` | `m05-inspections` |
| M06 | `audits` | `audits` (`audits`) | `cf36_audits` | `m06-audits` |
| M07 | `management_review` | `management-review` (`managementReview`) | `cf37_management_review` | `m07-management-review` |
| M08 | `objectives` | `objectives` (`objectives`) | `cf38_objectives` | `m08-objectives` |
| M09 | `people` | `people` (`people`) | `cf39_people` | `m09-people` |
| M10 | `recruitment` | `recruitment` (`recruitment`) | `cf40_recruitment` | `m10-recruitment` |
| M11 | `training` | `training` (`training`) | `cf41_training` | `m11-training` |
| M12 | `contracts` | `contracts` (`contracts`) | `cf42_contracts` | `m12-contracts` |
| M13 | `suppliers` | `suppliers` (`suppliers`) | `cf43_suppliers` | `m13-suppliers` |
| M14 | `projects` | `projects` (`projects`) | `cf44_projects` | `m14-projects` |
| M15 | `privacy` | `privacy` (`privacy`) | `cf45_privacy` | `m15-privacy` |
| M16 | `ai_governance` | `ai-governance` (`aiGovernance`) | `cf46_ai_governance` | `m16-ai-governance` |
| M17 | `environment` | `environment` (`environment`) | `cf47_environment` | `m17-environment` |
| M18 | `obligations` | `obligations` (`obligations`) | `cf48_obligations` | `m18-obligations` |
| M19 | `assets` | `assets` (`assets`) | `cf49_assets` | `m19-assets` |
| M20 | `continuity` | `continuity` (`continuity`) | `cf50_continuity` | `m20-continuity` |
| M21 | `hse` | `hse` (`hse`) | `cf51_hse` | `m21-hse` |
| M22 | `feedback` | `feedback` (`feedback`) | `cf52_feedback` | `m22-feedback` |
| M23 | `reports` | `reports` (`reports`) | `cf53_reports` | `m23-reports` |
| M24 | `documents` (existing) | `documents` (`documents`) | `cf54_documents_v2` | `m24-documents` |

Rules:

- **Module key**: snake_case, max 32 chars. It is the permission prefix
  (`risk:read`), the `ModuleSpec.key`, the `app/modules/<key>/` package name, and the
  `module` field of the assistant page context.
- **Portal path**: kebab-case route segment; it is also the Transloco scope name and the
  guidance file name. The scope alias is Transloco's default camelCase of the scope name.
- **Branches**: `core/<item>-<slug>` and `portal/<item>-<slug>` using the slug column
  (for example `core/m04-risk`, `portal/f1-modules`). Lowercase item keys (`f1`, `m04`).
- **Worktrees**: `D:\Projects\CoreFlow\wt\core-<item>-<slug>` and
  `D:\Projects\CoreFlow\wt\portal-<item>-<slug>`, created from the latest `origin/main`.
  If yours does not exist yet, create it with
  `git -C D:\Projects\CoreFlow\coreflow-core worktree add -b core/<item>-<slug> D:\Projects\CoreFlow\wt\core-<item>-<slug> origin/main`
  (same for the portal). Never work in the main checkouts.
- **Test databases** (cf-test `-Database`): `cf_<item>` for the engineer (`cf_f1`,
  `cf_m04`), `cf_<item>_qa` for QA, `cf_int` for the integrator. Lowercase, digits and
  underscores only.

### 1.2 Entity types

An **entity type** is the polymorphic name of a record (`entity_type` columns in
attachments, links, comments, tasks, events, notifications, audit, revisions, requirement
links). Max 32 chars, snake_case, globally unique, singular. Existing ones keep their
names: `document`, `deviation`, `deviation_action`, `standard` (org standard, attachment
parent only), `attachment`. Suggested names per module (a module may add more, prefixed
by its key when ambiguous):

| Module | Entity types |
|---|---|
| tasks (F2) | `task` |
| context | `context_analysis`, `interested_party`, `scope_statement`, `policy`, `responsibility` |
| processes | `process` |
| risk | `risk`, `risk_treatment`, `opportunity`, `risk_matrix`, `soa_entry` |
| inspections | `checklist_template`, `inspection`, `inspection_finding` |
| audits | `audit_programme`, `audit_plan`, `audit_finding` |
| management_review | `management_review`, `meeting` |
| objectives | `objective`, `kpi` |
| people | `employee`, `position`, `competence` |
| recruitment | `job_requisition`, `candidate`, `job_application` |
| training | `course`, `training_assignment`, `training_record` |
| contracts | `contract` |
| suppliers | `supplier`, `supplier_evaluation` |
| projects | `project`, `project_milestone` |
| privacy | `ropa_entry`, `dpia`, `data_subject_request`, `data_breach`, `processor`, `transfer_assessment` |
| ai_governance | `ai_system`, `ai_assessment` |
| environment | `env_aspect`, `emergency_plan`, `env_measurement` |
| obligations | `compliance_obligation` |
| assets | `asset`, `access_review`, `change_request`, `calibration` |
| continuity | `bia`, `continuity_plan`, `continuity_exercise` |
| hse | `sja`, `ppe_item`, `worker_consultation` |
| feedback | `customer_feedback`, `survey` |
| reports | `report_definition`, `audit_pack` |
| documents (M24) | `document_type`, `external_document`, `distribution_campaign` |

Cross-module ownership decided here: **change requests** belong to M19 (`change_request`,
on an F4 workflow); M14 links projects to them with entity links. **AI incidents** are
deviations of the M03 "AI incident" record type; M16 lists them filtered and links them
to `ai_system`. **GDPR breaches** are M15 `data_breach` records (72-hour clock) that may
link to a deviation. **HSE risk assessments** are M04 `risk` rows in an HSE register with
an HSE matrix; M21 adds only `sja`, `ppe_item`, `worker_consultation`. **Meetings and
minutes** are owned by M07 (`meeting`), reusable by other modules through entity links.

### 1.3 Roles

Global roles today: `admin`, `quality_manager`, `auditor`, `dpo`, `ciso`, `member`. F1
adds `hse_manager` ("HSE manager"), `hr_manager` ("HR manager") and `ai_officer` ("AI
governance officer") in `seed-rbac` and in its migration. No other item creates roles.
`admin` automatically receives every permission any module declares.

---

## 2. The platform kernel (verbatim)

The kernel is a tiny set of files and edits that every **wave-0** branch (F1-F8) applies
**byte-for-byte** as its first commit, whether or not it uses all of it. Identical
additions and identical edits merge cleanly in git, so the kernel never conflicts. Never
change kernel content on a feature branch; if you need more, put it in your own package
and note it. Wave-1 branches start after the kernel is on `main` and never touch it.

Line endings: keep each edited file's existing line endings (do not mix CRLF and LF in one
file, or `ruff format --check` fails). The kernel was validated against core `main`
(`0066bc9`): ruff, ruff format, mypy --strict and the full pytest suite (492 passed) are
clean with it plus a demo manifest.

### 2.1 New file `app/platform/__init__.py`

```python
"""CoreFlow platform kernel and foundation services (see portal docs/platform-contracts.md)."""
```

### 2.2 New file `app/modules/__init__.py`

```python
"""Business modules (M01-M24). Each subpackage with a `manifest` is auto-discovered."""
```

### 2.3 New file `app/platform/registry.py`

```python
"""Platform kernel: the module / entity-type registry, extension hooks and facades.

VERBATIM KERNEL FILE (portal docs/platform-contracts.md, section 2). Every branch that
needs it adds it byte-for-byte; never edit it on a feature branch. Extend the platform
through your own `manifest.py` instead.

Discovery: every package directly under `app.platform` and `app.modules` that has a
`manifest` submodule is imported once (sorted by name). A manifest may export:

* `MODULES: list[ModuleSpec]`
* `ENTITY_TYPES: list[EntityTypeSpec]`
* `HOOKS: dict[str, list[str]]`, hook name -> references. A reference is
  `"package.module:attribute"` (resolved lazily by `hook()`); for `HOOK_MODELS` and
  `HOOK_CELERY_TASKS` it is a plain module path.

Manifests must be import-light: no service, model, FastAPI or SDK imports at module
level, only this file. Everything heavy sits behind a lazily resolved reference.
"""

from __future__ import annotations

import importlib
import pkgutil
import uuid
from collections.abc import Awaitable, Iterable, Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from datetime import datetime
from functools import cache
from typing import TYPE_CHECKING, Any, Literal, Protocol

if TYPE_CHECKING:
    from fastapi import APIRouter
    from sqlalchemy.ext.asyncio import AsyncSession

# --- shared vocabularies ----------------------------------------------------------

FRAMEWORK_KEYS: tuple[str, ...] = (
    "iso9001",
    "iso27001",
    "iso14001",
    "iso42001",
    "iso45001",
    "gdpr",
    "eu_ai_act",
    "nis2",
)

# --- hook names -------------------------------------------------------------------

HOOK_MODELS = "models"  # module paths imported so Base.metadata sees the tables
HOOK_ROUTERS = "routers"  # refs -> fastapi.APIRouter (mounted under /api/v1)
HOOK_CELERY_TASKS = "celery_tasks"  # module paths added to the Celery `include`
HOOK_BEAT_SCHEDULE = "beat_schedule"  # refs -> dict[str, dict[str, Any]] (beat entries)
HOOK_EVENT_SINKS = "event_sinks"  # refs -> EventSink (F3)
HOOK_MODULE_GATE = "module_gate"  # refs -> ModuleGate (F1); the first one wins
HOOK_EVENT_KINDS = "event_kinds"  # refs -> list[EventKindSpec]
HOOK_DUE_PROVIDERS = "due_providers"  # refs -> DueProvider (sync, Celery path)
HOOK_SEARCH_PROVIDERS = "search_providers"  # refs -> list[SearchProviderSpec] (F5)
HOOK_AI_TOOLS = "ai_tools"  # refs -> list[app.ai.tools.Tool] (F5)
HOOK_AI_ASSISTS = "ai_assists"  # refs -> list[app.ai.assist.AssistSpec] (F5)
HOOK_RECORD_TEMPLATES = "record_templates"  # refs -> list[RecordTemplate] (F4)
HOOK_WORK_ITEMS = "work_items"  # refs -> WorkItemProvider (F2 My Work)
HOOK_DEMO_SEED = "demo_seed"  # refs -> demo seeder (final seed-demo step)

# --- value types ------------------------------------------------------------------


@dataclass(frozen=True)
class Caller:
    """The acting user and their permission keys in ONE org."""

    user_id: uuid.UUID
    permissions: frozenset[str]

    def can(self, permission: str) -> bool:
        return permission in self.permissions


def caller_from(principal: Any, org_id: uuid.UUID) -> Caller:
    """Build a `Caller` from an `app.core.security.Principal` for `org_id`."""
    access = principal.orgs.get(str(org_id))
    permissions = frozenset(access.permissions) if access is not None else frozenset()
    return Caller(user_id=uuid.UUID(principal.user_id), permissions=permissions)


@dataclass(frozen=True)
class EntityKey:
    entity_type: str
    entity_id: uuid.UUID


@dataclass(frozen=True)
class EntityRef:
    """A resolved, access-checked record, as every platform service sees it."""

    entity_type: str
    entity_id: uuid.UUID
    org_id: uuid.UUID
    title: str
    code: str | None = None
    url: str | None = None  # portal path, e.g. "/risk/risks/<id>"
    status: str | None = None
    owner_user_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    due_at: datetime | None = None  # naive UTC
    module: str | None = None  # filled in by resolve_entity()


class Resolver(Protocol):
    """Load one record for `caller`; raise HTTPException 404 (missing, deleted, other org,
    not visible) or 403 (visible but `edit` not allowed). Never returns None."""

    def __call__(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        entity_id: uuid.UUID,
        caller: Caller,
        *,
        edit: bool,
    ) -> Awaitable[EntityRef]: ...


@dataclass(frozen=True)
class EntityTypeSpec:
    entity_type: str  # <= 32 chars, snake_case, globally unique
    module: str  # owning module key
    read_permission: str
    write_permission: str
    resolve: str  # ref -> Resolver
    label_key: str = ""  # portal i18n key of the type name
    searchable: bool = True
    attachable: bool = True
    commentable: bool = True
    linkable: bool = True
    revisioned: bool = False
    # Free-text / personal-data keys audit.redact() must mask for this type (F8).
    redacted_fields: tuple[str, ...] = ()
    # Optional ref -> callable(org_id_column, entity_id_column) returning a SQL boolean
    # "this record exists and is not deleted" (standards evidence liveness, F7).
    live_sql: str | None = None


@dataclass(frozen=True)
class ClauseDecl:
    """A standard clause a module's records can evidence. `ref` is
    "<framework key>:<clause or article>" (e.g. "iso27001:A.5.9", "gdpr:30") or
    "hs:<n>" for a Harmonised Structure clause shared by every ISO standard."""

    ref: str
    entity_types: tuple[str, ...]


@dataclass(frozen=True)
class ModuleSpec:
    key: str  # snake_case, also the permission prefix
    name_key: str  # global i18n key, "modules.names.<key>"
    description_key: str = ""  # global i18n key, "modules.descriptions.<key>"
    portal_path: str | None = None  # route segment, e.g. "management-review"
    depends_on: tuple[str, ...] = ()
    frameworks: tuple[str, ...] = ()  # subset of FRAMEWORK_KEYS
    always_on: bool = False
    default_enabled: bool = False
    permissions: Mapping[str, str] = field(default_factory=dict)  # key -> description
    role_grants: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    clauses: tuple[ClauseDecl, ...] = ()
    terms: tuple[str, ...] = ()  # terminology keys the module introduces


AssigneeType = Literal["user", "role", "department"]


@dataclass(frozen=True)
class Assignee:
    type: AssigneeType
    value: str  # user id (uuid str), role key, or department id (uuid str)


@dataclass(frozen=True)
class Recipients:
    owner_user_ids: tuple[uuid.UUID, ...] = ()
    assignees: tuple[Assignee, ...] = ()
    user_ids: tuple[uuid.UUID, ...] = ()  # explicit recipients, e.g. @mentions
    department_id: uuid.UUID | None = None
    include_watchers: bool = True
    include_actor: bool = False


@dataclass(frozen=True)
class DomainEventIn:
    org_id: uuid.UUID
    kind: str  # "<entity_type>.<verb>", <= 64 chars
    entity_type: str
    entity_id: uuid.UUID
    actor_user_id: uuid.UUID | None
    actor_kind: str  # "user" | "ai" | "system"
    payload: Mapping[str, Any]
    recipients: Recipients | None


class EventSink(Protocol):
    def __call__(self, session: AsyncSession, event: DomainEventIn) -> Awaitable[None]: ...


class ModuleGate(Protocol):
    def __call__(self, session: AsyncSession, org_id: uuid.UUID, key: str) -> Awaitable[bool]: ...


@dataclass(frozen=True)
class EventKindSpec:
    kind: str  # "<entity_type>.<verb>", <= 64 chars
    module: str
    category: str  # notification preference category
    title_key: str  # notification i18n key; "<scope>:<key>" for scoped files
    default_recipients: tuple[str, ...] = ("owner", "assignee", "watchers")
    default_channels: tuple[str, ...] = ("in_app",)
    notify: bool = True  # False: timeline only, never a notification
    timeline_key: str = ""  # i18n key of the timeline line; "<scope>:<key>" for scoped


@dataclass(frozen=True)
class DueItem:
    org_id: uuid.UUID
    module: str
    entity_type: str
    entity_id: uuid.UUID
    due_at: datetime  # naive UTC
    title: str
    code: str | None = None
    owner_user_ids: tuple[uuid.UUID, ...] = ()
    assignees: tuple[Assignee, ...] = ()
    department_id: uuid.UUID | None = None


class DueProvider(Protocol):
    """Sync (Celery) source of OPEN items due before `until` (overdue ones included)."""

    def __call__(self, session: Any, *, until: datetime) -> Iterable[DueItem]: ...


@dataclass(frozen=True)
class SearchHit:
    entity_type: str
    entity_id: uuid.UUID
    title: str
    code: str | None = None
    snippet: str | None = None
    url: str | None = None
    rank: float = 0.0
    updated_at: datetime | None = None


class SearchFn(Protocol):
    def __call__(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        caller: Caller,
        query: str,
        limit: int,
    ) -> Awaitable[list[SearchHit]]: ...


@dataclass(frozen=True)
class SearchProviderSpec:
    entity_type: str
    module: str
    read_permission: str
    search: SearchFn


# --- discovery --------------------------------------------------------------------

_DISCOVERY_PACKAGES: tuple[str, ...] = ("app.platform", "app.modules")


@dataclass
class _Registry:
    modules: dict[str, ModuleSpec] = field(default_factory=dict)
    entity_types: dict[str, EntityTypeSpec] = field(default_factory=dict)
    hooks: dict[str, list[str]] = field(default_factory=dict)


def _manifests() -> Iterator[Any]:
    for package_name in _DISCOVERY_PACKAGES:
        package = importlib.import_module(package_name)
        for info in sorted(pkgutil.iter_modules(package.__path__), key=lambda i: i.name):
            if not info.ispkg:
                continue
            name = f"{package_name}.{info.name}.manifest"
            try:
                yield importlib.import_module(name)
            except ModuleNotFoundError as exc:
                if exc.name != name:
                    raise


@cache
def _load() -> _Registry:
    registry = _Registry()
    for manifest in _manifests():
        for spec in getattr(manifest, "MODULES", ()):
            if spec.key in registry.modules:
                raise RuntimeError(f"duplicate module key {spec.key!r}")
            registry.modules[spec.key] = spec
        for entity in getattr(manifest, "ENTITY_TYPES", ()):
            if entity.entity_type in registry.entity_types:
                raise RuntimeError(f"duplicate entity type {entity.entity_type!r}")
            registry.entity_types[entity.entity_type] = entity
        for hook_name, refs in getattr(manifest, "HOOKS", {}).items():
            registry.hooks.setdefault(hook_name, []).extend(refs)
    return registry


def resolve_ref(ref: str) -> Any:
    """Import `"package.module:attribute"` (or a bare module path) and return it."""
    module_path, _, attribute = ref.partition(":")
    target = importlib.import_module(module_path)
    return getattr(target, attribute) if attribute else target


_OVERRIDES: dict[str, list[Any]] = {}


@contextmanager
def override_hook(name: str, values: list[Any]) -> Iterator[None]:
    """Tests only: replace a hook's resolved values inside the block."""
    previous = _OVERRIDES.get(name)
    _OVERRIDES[name] = values
    try:
        yield
    finally:
        if previous is None:
            _OVERRIDES.pop(name, None)
        else:
            _OVERRIDES[name] = previous


def modules() -> list[ModuleSpec]:
    return sorted(_load().modules.values(), key=lambda spec: spec.key)


def module(key: str) -> ModuleSpec | None:
    return _load().modules.get(key)


def entity_types() -> list[EntityTypeSpec]:
    return sorted(_load().entity_types.values(), key=lambda spec: spec.entity_type)


def entity_type(key: str) -> EntityTypeSpec | None:
    return _load().entity_types.get(key)


def hook_refs(name: str) -> list[str]:
    return list(_load().hooks.get(name, []))


def hook(name: str) -> list[Any]:
    """Resolve every reference of hook `name`; list/tuple values are flattened."""
    if name in _OVERRIDES:
        return list(_OVERRIDES[name])
    values: list[Any] = []
    for ref in hook_refs(name):
        value = resolve_ref(ref)
        if isinstance(value, (list, tuple)):
            values.extend(value)
        else:
            values.append(value)
    return values


def import_models() -> None:
    """Import every `HOOK_MODELS` module so `Base.metadata` holds its tables."""
    for ref in hook_refs(HOOK_MODELS):
        importlib.import_module(ref)


def routers() -> list[APIRouter]:
    return hook(HOOK_ROUTERS)


def celery_task_modules() -> list[str]:
    return hook_refs(HOOK_CELERY_TASKS)


def beat_schedule() -> dict[str, dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for entries in hook(HOOK_BEAT_SCHEDULE):
        merged.update(entries)
    return merged


def all_permissions() -> dict[str, str]:
    """Permission key -> description declared by every registered module."""
    merged: dict[str, str] = {}
    for spec in modules():
        merged.update(spec.permissions)
    return merged


def all_role_grants() -> dict[str, list[str]]:
    """Role key -> permission keys granted by every registered module."""
    merged: dict[str, list[str]] = {}
    for spec in modules():
        for role, perms in spec.role_grants.items():
            granted = merged.setdefault(role, [])
            granted.extend(p for p in perms if p not in granted)
    return merged


# --- facades ----------------------------------------------------------------------


async def is_module_enabled(session: AsyncSession, org_id: uuid.UUID, key: str) -> bool:
    spec = module(key)
    if spec is None:
        return True  # unknown keys are not gated (see contracts, section 15)
    if spec.always_on:
        return True
    gates = hook(HOOK_MODULE_GATE)
    if not gates:
        return spec.default_enabled
    enabled: bool = await gates[0](session, org_id, key)
    return enabled


async def resolve_entity(
    session: AsyncSession,
    org_id: uuid.UUID,
    key: EntityKey,
    caller: Caller,
    *,
    edit: bool = False,
) -> EntityRef:
    """Permission + module gate + the type's resolver. Raises HTTPException:
    422 `unsupported_entity_type`, 403, or 404 (incl. `module_disabled`)."""
    from fastapi import HTTPException, status

    spec = entity_type(key.entity_type)
    if spec is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "unsupported_entity_type", "entity_type": key.entity_type},
        )
    needed = spec.write_permission if edit else spec.read_permission
    if not caller.can(needed):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
        )
    if not await is_module_enabled(session, org_id, spec.module):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "module_disabled", "module": spec.module},
        )
    resolver: Resolver = resolve_ref(spec.resolve)
    ref = await resolver(session, org_id, key.entity_id, caller, edit=edit)
    return ref if ref.module is not None else replace(ref, module=spec.module)


async def resolve_entities(
    session: AsyncSession,
    org_id: uuid.UUID,
    keys: Iterable[EntityKey],
    caller: Caller,
) -> dict[EntityKey, EntityRef]:
    """Read-resolve many keys; unreadable / missing / disabled ones are left out."""
    from fastapi import HTTPException

    resolved: dict[EntityKey, EntityRef] = {}
    for key in dict.fromkeys(keys):
        try:
            resolved[key] = await resolve_entity(session, org_id, key, caller)
        except HTTPException:
            continue
    return resolved


async def emit(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    kind: str,
    entity_type: str,
    entity_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    payload: Mapping[str, Any] | None = None,
    recipients: Recipients | None = None,
    actor_kind: str | None = None,
) -> None:
    """Publish a domain event to every registered sink, in the caller's transaction
    (never commits). A no-op until a sink (F3) is registered."""
    if actor_kind is None:
        from app.services.audit import current_actor_kind

        actor_kind = current_actor_kind() if actor_user_id is not None else "system"
    event = DomainEventIn(
        org_id=org_id,
        kind=kind,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        actor_kind=actor_kind,
        payload=dict(payload or {}),
        recipients=recipients,
    )
    for sink in hook(HOOK_EVENT_SINKS):
        await sink(session, event)
```

### 2.4 New file `app/platform/deps.py`

```python
"""FastAPI dependencies of the platform kernel.

VERBATIM KERNEL FILE (portal docs/platform-contracts.md, section 2). Never edit it on a
feature branch.
"""

import uuid
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status

from app.api.deps import CurrentUser, SessionDep
from app.platform import registry


def require_module(key: str, org_id_param: str = "org_id") -> Any:
    """Router/route dependency: 404 `{"code": "module_disabled"}` unless module `key` is
    enabled for the org in the `org_id_param` path parameter. Runs after authentication
    (401 first) and the membership check (403 for non-members)."""

    async def dependency(request: Request, session: SessionDep, principal: CurrentUser) -> None:
        raw = str(request.path_params.get(org_id_param, ""))
        try:
            org_id = uuid.UUID(raw)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from None
        if raw not in principal.orgs and not principal.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="No access to this organization"
            )
        if not await registry.is_module_enabled(session, org_id, key):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "module_disabled", "module": key},
            )

    return Depends(dependency)


def get_caller(request: Request, principal: CurrentUser) -> registry.Caller:
    """The caller's permissions in the request's `org_id` path parameter."""
    raw = str(request.path_params.get("org_id", ""))
    try:
        org_id = uuid.UUID(raw)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from None
    return registry.caller_from(principal, org_id)


CallerDep = Annotated[registry.Caller, Depends(get_caller)]
```

### 2.5 Edit `app/models/__init__.py` (append at the very end)

```python

# Platform and module models are auto-discovered (HOOK_MODELS, app/platform/registry.py).
from app.platform import registry as _platform_registry  # noqa: E402

_platform_registry.import_models()
```

### 2.6 Edit `app/api/v1/router.py`

Add `from app.platform import registry` directly after the closing `)` of the
`from app.api.v1.routes import (...)` block, and append at the very end:

```python

# Platform and module routers are auto-discovered (HOOK_ROUTERS, app/platform/registry.py).
for _platform_router in registry.routers():
    api_router.include_router(_platform_router)
```

### 2.7 Edit `app/core/celery_app.py`

- Add `from app.platform import registry` directly after
  `from app.core.config import get_settings`.
- Add `        *registry.celery_task_modules(),` as the last entry of `include=[...]`
  (after `"app.tasks.standards",`).
- Add `    **registry.beat_schedule(),` as the last entry of
  `celery_app.conf.beat_schedule = {...}` (after the digest entry's closing `},`).

### 2.8 How the kernel is used

A package `app/platform/<name>/` (foundation) or `app/modules/<key>/` (module) is
discovered when it has a `manifest.py`. Example (module):

```python
# app/modules/risk/manifest.py  (import ONLY from app.platform.registry)
from app.platform.registry import (
    HOOK_AI_TOOLS, HOOK_EVENT_KINDS, HOOK_MODELS, HOOK_ROUTERS, HOOK_SEARCH_PROVIDERS,
    ClauseDecl, EntityTypeSpec, ModuleSpec,
)

MODULES = [
    ModuleSpec(
        key="risk",
        name_key="modules.names.risk",
        description_key="modules.descriptions.risk",
        portal_path="risk",
        frameworks=("iso9001", "iso27001", "iso14001", "iso42001", "iso45001"),
        permissions={
            "risk:read": "Read risks, opportunities and the SoA",
            "risk:write": "Create and edit risks and treatments",
            "risk:manage": "Configure matrices and registers, delete risks",
            "risk:accept": "Sign off residual risk acceptance",
        },
        role_grants={
            "quality_manager": ("risk:read", "risk:write", "risk:manage", "risk:accept"),
            "ciso": ("risk:read", "risk:write", "risk:manage", "risk:accept"),
            "member": ("risk:read",),
            "auditor": ("risk:read",),
        },
        clauses=(ClauseDecl("hs:6.1", ("risk", "opportunity")),
                 ClauseDecl("iso27001:6.1.3", ("soa_entry",))),
        terms=("risk",),
    )
]
ENTITY_TYPES = [
    EntityTypeSpec(
        entity_type="risk", module="risk",
        read_permission="risk:read", write_permission="risk:write",
        resolve="app.modules.risk.service:resolve_risk",
        label_key="modules.entities.risk", revisioned=True,
        redacted_fields=("title", "description", "treatment_notes"),
        live_sql="app.modules.risk.service:risk_live_sql",
    ),
]
HOOKS = {
    HOOK_MODELS: ["app.modules.risk.models"],
    HOOK_ROUTERS: ["app.modules.risk.routes:router"],
    HOOK_EVENT_KINDS: ["app.modules.risk.events:EVENT_KINDS"],
    HOOK_SEARCH_PROVIDERS: ["app.modules.risk.search:PROVIDERS"],
    HOOK_AI_TOOLS: ["app.modules.risk.ai_tools:TOOLS"],
}
```

Facade semantics (all in the caller's transaction, never commit):

- `registry.resolve_entity(session, org_id, EntityKey(type, id), caller, edit=False)`:
  422 `unsupported_entity_type`, 403 missing read/write permission, 404
  `module_disabled`, then the type's resolver (404 / 403). Every generic API (links,
  comments, attachments, tasks on an entity, timeline, revisions, AI page context) goes
  through it.
- `registry.emit(session, org_id=..., kind=..., entity_type=..., entity_id=...,
  actor_user_id=..., payload=..., recipients=Recipients(...))`: hands the event to the
  F3 sink. No-op until F3 is merged. Call it next to `audit.record(...)`.
- `registry.is_module_enabled(session, org_id, key)` / `require_module(key)`: the F1
  gate. Unknown module keys count as enabled (so a foundation branch never locks itself
  out before F1 lands); `always_on` modules are always enabled; without the F1 gate
  `default_enabled` decides.
- `deps.CallerDep`: a `Caller(user_id, permissions)` for the `{org_id}` path parameter.
- Tests: `with registry.override_hook(registry.HOOK_EVENT_SINKS, [fake_sink]): ...`.

---

## 3. File ownership

Only the owner edits a shared file. Anyone else needing a change there reports it as a
contract addition instead. "Additive" means the integrator unions both sides.

### 3.1 Backend (`coreflow-core`)

| File / area | Owner | Notes |
|---|---|---|
| Kernel (section 2) | all wave-0, verbatim | never edited afterwards except by the integrator |
| `app/cli.py` | F1 (`seed-rbac` uses the registry, new roles); final step (`seed-demo`) | |
| `app/services/audit.py` | F8 (redaction from `EntityTypeSpec.redacted_fields`) | |
| `app/services/attachment_service.py`, `app/schemas/attachment.py`, `app/api/v1/routes/attachments.py` | F8 | registry fallback for entity rules |
| `app/models/notification.py`, `app/services/notification_service.py`, `app/services/notification_jobs.py`, `app/api/v1/routes/notifications.py`, `app/models/department.py` | F3 | |
| `app/ai/**`, `app/schemas/ai.py`, `app/api/v1/routes/ai.py` | F5 | F4 adds only the new file `app/ai/workflow_design.py`; F1/F6 add nothing here |
| `app/services/standards_*.py`, `app/schemas/standard.py`, `app/standards/catalog/**`, `app/models/standard.py`, `app/api/v1/routes/standards.py` | F7 | |
| `app/services/fts.py` | F5 (additive helpers only) | |
| `app/services/deviation_service.py`, `app/services/document_service.py` | wave 0: nobody (wrap them from your own package); wave 1: M03 / M24 | |
| `pyproject.toml`, `uv.lock` | integrator only | no new dependencies in this build; see 15 |
| `tests/conftest.py` | nobody | |
| `tests/platform_factories.py` | F1 (new) | shared test helpers for wave 1 |

### 3.2 Portal (`coreflow-portal`)

| File / area | Owner | Notes |
|---|---|---|
| `src/app/app.routes.ts`, `src/app/layout/nav.ts`, `src/app/layout/side-nav/**` | F1 | F1 pre-declares every module route and nav item (4.7) |
| `src/app/features/org-settings/org-settings.routes.ts` and the settings section nav | F1 | F3, F4, F6 each add exactly one child route + one settings link (additive) |
| `src/app/layout/main-layout/**`, `src/app/layout/top-bar/**`, `src/app/features/ask/**`, `src/app/features/command-palette/**`, `src/app/core/ai/**` | F5 | |
| `src/app/layout/account-menu/**` | F6 | |
| `src/app/layout/notification-bell/**`, `src/app/core/notifications/**` | F3 | |
| `src/app/features/my-work/**` | F2 | |
| `src/app/core/attachments/**`, `src/app/shared/attachments/**` | F8 | `AttachmentEntityType` becomes `string` |
| `src/app/features/standards/**`, `src/app/core/standards/**` | F7 | |
| `src/assets/i18n/en.json`, `nb.json` (global) | F1 (`nav.*`, `modules.*`, `terms.*`), F3 (`notifications.*`) | everyone else uses a scoped file |
| `src/assets/i18n/<scope>/{en,nb}.json` | the item owning the scope | |
| `src/assets/guidance/**` | F6 (format, `glossary.json`, `platform.json`), modules (their own file) | |
| `src/testing/i18n-parity.ts` | F6 (new) | |
| `package.json`, `angular.json` | integrator only | |
| `src/app/shared/ui/index.ts` | nobody | import new components by path |

### 3.3 Wave-0 cross-item calls (items run in parallel)

A wave-0 branch can only import the kernel and code already on `main`. Where one
foundation item needs another, it uses the contract below; the integrator checks the
seam once both are merged.

| Caller -> callee | How |
|---|---|
| any -> F1 module gate | `registry.is_module_enabled` / `require_module` (kernel facade) |
| any -> F3 events | `registry.emit(...)` (kernel facade, no-op until F3 lands) |
| any -> entity resolution | `registry.resolve_entity(...)`; F8 registers `document`, `deviation`, `deviation_action`; F2 registers `task` (module `tasks`, read `tasks:read`, write `tasks:write`, url `/tasks/<id>`) and its own `task` search provider |
| F4 engine -> F2 `tasks.create_for`, F8 comments -> F3 `events.watch` | lazy import inside the function; on `ImportError` skip with a warning log (tests on the branch cover the skip) |
| F2/F4 due dates -> F3 reminders | kernel `DueItem` + `HOOK_DUE_PROVIDERS` |
| F6 portal "Teach me" / clause chips -> F5 tutor mode | call the existing `AskPanelService.showWith(prompt)` with a translated tutor prompt; after both merge the integrator switches the two call sites to `openTutor(topic)` |
| F8 portal related-items picker -> F5 search | plain `ApiService` call to `GET v1/orgs/{org}/search` (8.1), mocked in tests |
| F8 portal timeline -> F3 timeline API | F8 owns the client and DTOs, built against 6.6 |
| F1 wizard "first tasks" -> F2 | plain `ApiService` call to `POST v1/orgs/{org}/tasks` (5.3); a 404 skips the step |
| F3 notification text -> F1 labels | global i18n keys `modules.entities.<entity_type>` (strings only) |
| F7 standards -> F8 built-in entity types | F7 keeps the four existing link types hard-coded and uses the registry only for new types |

---

## 4. F1: modules, org profile, terminology, setup wizard

Backend package `app/platform/modules/` (`manifest.py`, `models.py`, `schemas.py`,
`service.py`, `routes.py`, `builtin.py`). Migration `cf20_modules`.

### 4.1 Tables

```
org_module      org_id FK organizations CASCADE, module_key String(32)   PK(org_id, module_key)
                enabled Boolean NOT NULL, settings JSONB default {},
                updated_by FK users SET NULL, updated_at DateTime server_default now()
org_profile     org_id PK FK organizations CASCADE
                industry String(64) NULL, size_band String(16) NULL  -- "1-10"|"11-50"|"51-250"|"251-1000"|"1000+"
                countries JSONB [] (ISO 3166 alpha-2), sites JSONB [] ([{name, country, city?, kind?}])
                frameworks JSONB [] (subset of FRAMEWORK_KEYS)
                certification_targets JSONB [] ([{framework, target_date?, certification_body?, status: planned|in_progress|certified}])
                ai_act_role String(16) default "unknown"  -- provider|deployer|both|none|unknown
                description Text NULL
                terminology JSONB {}   -- {term_key: {lang: {one, other}}}
                setup_step String(32) NULL, setup_completed_at DateTime NULL
                updated_by FK users SET NULL, created_at, updated_at (TimestampMixin)
```

The migration also inserts the roles `hse_manager`, `hr_manager`, `ai_officer`
(`INSERT ... ON CONFLICT (key) DO NOTHING`).

### 4.2 Built-in module specs (`app/platform/modules/builtin.py`, exported in F1's manifest)

`documents` (default_enabled, frameworks all ISO + gdpr), `deviations` (default_enabled),
`standards` (default_enabled). Their permissions stay in `cli.DEFAULT_PERMISSIONS`
(the specs declare none). Existing documents/deviations/standards routes are **not**
gated in wave 0 (M03/M24 add `require_module` later). F1's manifest also registers
`HOOK_MODULE_GATE: ["app.platform.modules.service:is_enabled"]`.

### 4.3 Service API (`app/platform/modules/service.py`)

```python
async def is_enabled(session: AsyncSession, org_id: uuid.UUID, key: str) -> bool
    # org_module row, else spec.default_enabled; memoised per session in session.info
async def list_modules(session, org_id) -> list[dict]            # see 4.4 item shape
async def set_enabled(session, *, org_id, key, enabled: bool, actor_user_id) -> dict
    # 409 {"code": "module_dependency_disabled", "missing": [...]} when enabling with
    #     disabled depends_on; 409 {"code": "module_required_by", "modules": [...]} when
    #     disabling a module an enabled one depends on; 422 {"code": "module_always_on"};
    # 404 unknown key. audit.record(entity_type="org_module", action="org_module.enabled"
    #     | "org_module.disabled"); registry.emit(kind="module.enabled" | "module.disabled",
    #     entity_type="organization", entity_id=org_id)
async def enable_with_dependencies(session, *, org_id, keys: list[str], actor_user_id) -> list[str]
async def get_profile(session, org_id) -> dict                   # creates nothing; defaults when no row
async def update_profile(session, *, org_id, payload, actor_user_id) -> dict
async def get_terminology(session, org_id) -> dict
async def update_terminology(session, *, org_id, terms, actor_user_id) -> dict
def term_keys() -> list[str]   # TERM_KEYS + every ModuleSpec.terms
```

`TERM_KEYS` (F1 base list): `deviation`, `document`, `risk`, `audit`, `finding`,
`process`, `task`, `objective`, `incident`, `supplier`, `employee`. Override values are
1-64 chars per form; only `en` and `nb`.

### 4.4 Endpoints (prefix `/api/v1/orgs/{org_id}`)

| Method, path | Permission | Body / response |
|---|---|---|
| `GET /modules` | member | `[{key, name_key, description_key, portal_path, enabled, always_on, depends_on, frameworks, required_by: [keys of enabled dependants]}]` sorted by key |
| `PUT /modules/{key}` | `org:manage` | `{enabled: bool}` -> item |
| `GET /profile` | member | `OrgProfile` (all 4.1 columns except terminology, ISO dates) |
| `PUT /profile` | `org:manage` | full `OrgProfile`; 422 on unknown framework / role / size band |
| `GET /terminology` | member | `{terms: {key: {en?: {one, other}, nb?: {one, other}}}, term_keys: [...]}` |
| `PUT /terminology` | `org:manage` | `{terms: ...}` (an empty object resets) |
| `GET /setup` | member | `{completed_at, step}` |
| `POST /setup/recommendations` | `org:manage` | `{frameworks, industry?, size_band?}` -> `{modules: [{key, recommended: bool, reason_key, frameworks}]}` (deterministic: modules whose frameworks intersect, plus dependencies; `reason_key` = `modules.reasons.<key>`) |
| `POST /setup/complete` | `org:manage` | `{modules: [keys], step?}` -> `{enabled: [keys], completed_at}` |
| `PUT /setup/step` | `org:manage` | `{step}` (wizard resume point) |

The AI explanation step uses the existing Ask panel (portal sends a prompt with the
recommendations as page context); F1 adds no AI endpoint.

### 4.5 `seed-rbac` (F1 edits `app/cli.py`)

Permissions = `DEFAULT_PERMISSIONS | registry.all_permissions()`. Roles =
`DEFAULT_ROLES` + the three new roles; each role's permission list is extended with
`registry.all_role_grants().get(role, [])`; `admin` gets every permission key. Still
additive and idempotent.

### 4.6 Test helpers (`tests/platform_factories.py`, F1)

```python
async def create_org(name: str = "Acme") -> uuid.UUID
async def create_user(email: str, *, org_id: uuid.UUID, role_key: str,
                      permissions: Iterable[str] | None = None) -> uuid.UUID  # creates role/perms if missing
async def login(client: AsyncClient, email: str, password: str = DEFAULT_PASSWORD) -> dict[str, str]  # auth headers
async def enable_modules(org_id: uuid.UUID, *keys: str) -> None   # writes org_module rows
```

They open their own `engine.begin()` connections, like the existing tests.

### 4.7 Portal

- `src/app/core/modules/module.models.ts`: `OrgModule`, `OrgProfile`, `Terminology`.
- `src/app/core/modules/modules-api.ts`: `ModulesApi.list(orgId)`, `setEnabled(orgId, key, enabled)`, `getProfile`, `updateProfile`, `getTerminology`, `updateTerminology`, `setup`, `recommendations`, `completeSetup`.
- `src/app/core/modules/module.service.ts`:
  ```ts
  @Injectable({ providedIn: 'root' })
  export class ModuleService {
    readonly modules: Signal<readonly OrgModule[]>;
    readonly loaded: Signal<boolean>;
    isEnabled(key: string): boolean;          // reactive (reads signals)
    readonly enabledKeys: Signal<ReadonlySet<string>>;
    reload(): void;                           // re-fetch for the current org
  }
  export function moduleGuard(key: string): CanActivateFn; // waits for load; disabled -> /dashboard + 'modules.disabledNotice'
  ```
  Loads on org change (effect on `SelectedOrgService.currentOrgId`).
- `src/app/core/modules/terminology.service.ts` + a Transloco transpiler
  (`TerminologyTranspiler extends DefaultTranspiler`) registered in `provideI18n()` (F1
  may edit `core/i18n/i18n.providers.ts`). It injects a `term` param into **every**
  translation, so any string may use `{{ term.deviation }}`, `{{ term.deviations }}`,
  `{{ term.Deviation }}`, `{{ term.Deviations }}`. Values: org override for the active
  language, else the global defaults `terms.<key>.one` / `terms.<key>.other` (F1 adds
  them to global en/nb). Explicit params win over `term`.
- `NavItem` gains `readonly module?: string`. The side nav hides an item whose module is
  not enabled (and keeps the permission check). F1 rewrites `NAV_SECTIONS` to contain
  **every** module from 1.1 with its path, `module`, `labelKey` (`nav.<camelCaseKey>`),
  icon and read permission (`<key>:read`). Suggested sections: Workspace (dashboard,
  my-work, review), Governance (context, objectives, management-review, obligations,
  reports), Operations (processes, documents, projects, suppliers, contracts, assets,
  continuity), Improvement (deviations, inspections, audits, risk, feedback), People
  (people, recruitment, training), Compliance (standards, privacy, ai-governance,
  environment, hse). `procedures` is removed and redirects to `processes`.
- **Route stubs**: F1 adds `src/app/features/module-placeholder/module-placeholder.routes.ts`
  (`export function modulePlaceholderRoutes(titleKey: string): Routes`, rendering the existing
  placeholder). For every module path that has no feature folder yet, F1 creates
  `src/app/features/<path>/<path>.routes.ts`:
  ```ts
  import { Routes } from '@angular/router';
  import { modulePlaceholderRoutes } from '../module-placeholder/module-placeholder.routes';

  export default modulePlaceholderRoutes('nav.risk') satisfies Routes;
  ```
  and `app.routes.ts` registers each as
  `{ path: '<path>', canActivate: [moduleGuard('<key>'), permissionGuard('<key>:read')], loadChildren: () => import('./features/<path>/<path>.routes') }`.
  The placeholder route generation disappears. A module branch later **replaces only the
  content of its own stub file**, so wave 1 never edits `app.routes.ts` or `nav.ts`.
- Global i18n added by F1: `nav.*` for every module, `modules.names.<key>`,
  `modules.descriptions.<key>`, `modules.reasons.<key>`, `modules.entities.<entity_type>`
  for every entity type in 1.2, `terms.<key>.{one,other}`, plus its own pages under the
  `modules` scope.
- Pages: `/settings/modules` (cards with switch, dependency hints), `/settings/profile`,
  `/settings/terminology`, `/setup` wizard (profile -> frameworks -> recommended modules
  with reasons and an "Ask why" button -> roles (link to members/invitations) -> first
  tasks (creates tasks via F2 `POST /tasks`, skipped gracefully on 404) -> done). A
  dashboard banner offers the wizard to `org:manage` users while `setup.completed_at` is
  null; no forced redirect.

---

## 5. F2: tasks and My Work

Backend package `app/platform/tasks/` (`manifest.py`, `models.py`, `schemas.py`,
`service.py`, `rrule.py`, `routes.py`, `jobs.py`, `beat.py`, `work.py`). Module key
`tasks` (`always_on=True`). Migration `cf21_tasks`.

### 5.1 Tables

```
task            id UUID PK, org_id FK CASCADE, entity_type String(32) NULL, entity_id UUID NULL,
                module String(32) NULL (source module), kind String(32) default "generic",
                title String(255), description Text NULL,
                status String(16) default "open"      -- open|in_progress|blocked|done|cancelled
                priority String(8) default "normal"   -- low|normal|high|urgent
                assignee_type String(12) NULL         -- user|role|department
                assignee_user_id FK users SET NULL NULL, assignee_role_key String(64) NULL,
                assignee_department_id FK departments SET NULL NULL,
                due_at DateTime NULL, start_at DateTime NULL,
                completed_at DateTime NULL, completed_by FK users SET NULL NULL,
                recurrence_id FK task_recurrence SET NULL NULL, occurrence_due_at DateTime NULL,
                escalation_level Integer default 0, escalated_at DateTime NULL,
                created_by FK users SET NULL NULL, created_at, updated_at (TimestampMixin),
                deleted_at DateTime NULL, deleted_by FK users SET NULL NULL
                indexes: (org_id, status, due_at), (org_id, entity_type, entity_id),
                         (assignee_user_id, status); unique (recurrence_id, occurrence_due_at)
task_checklist_item  id UUID PK, task_id FK task CASCADE, org_id, position Integer,
                text String(500), done Boolean default false, done_by FK users SET NULL NULL,
                done_at DateTime NULL, created_at
task_recurrence id UUID PK, org_id FK CASCADE, entity_type/entity_id NULL, module NULL, kind,
                title String(255), description Text NULL, priority, assignee_* (as task),
                checklist JSONB [] (item texts), rrule String(255), dtstart DateTime,
                lead_days Integer default 7, next_due_at DateTime NULL, active Boolean default true,
                created_by, TimestampMixin, deleted_at NULL
```

RRULE subset (own parser in `rrule.py`, no new dependency): `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`,
`INTERVAL=n`, `BYDAY=MO,TU,..` (weekly), `BYMONTHDAY=n` (monthly; clamps to month end),
`BYMONTH=n` (yearly), `COUNT=n`, `UNTIL=YYYYMMDD`. 422 `{"code": "invalid_rrule"}` otherwise.
`def next_occurrence(rrule: str, dtstart: datetime, after: datetime) -> datetime | None`.

### 5.2 Service API (`app/platform/tasks/service.py`), used by every module

```python
@dataclass(frozen=True)
class RecurrenceIn:
    rrule: str
    dtstart: datetime
    lead_days: int = 7

async def create_for(
    session: AsyncSession, *, org_id: uuid.UUID, entity: EntityKey | None, title: str,
    actor_user_id: uuid.UUID | None, module: str | None = None, kind: str = "generic",
    description: str | None = None, assignee: Assignee | None = None,
    due_at: datetime | None = None, priority: str = "normal",
    checklist: Sequence[str] = (), recurrence: RecurrenceIn | None = None,
) -> Task
    # No permission check (the calling module already authorised the change).
    # audit.record(entity_type="task", action="task.created") + registry.emit(kind="task.created";
    # and "task.assigned" when an assignee is set). With `recurrence`, creates the
    # task_recurrence and its first occurrence; returns that occurrence.
async def list_for(session, *, org_id, entity: EntityKey, include_closed: bool = True) -> list[Task]
async def update_task(session, *, org_id, task_id, changes: Mapping[str, Any], actor_user_id) -> Task
async def complete_task(session, *, org_id, task_id, actor_user_id) -> Task  # emits task.completed
async def cancel_for(session, *, org_id, entity: EntityKey, actor_user_id) -> int  # on record deletion
def task_dict(task: Task, names: Mapping[uuid.UUID, str]) -> dict[str, Any]  # API shape 5.3
```

Visibility: a caller sees a task when they are the assignee (user, a role they hold,
or a department they belong to), its creator, hold `tasks:manage`, or can read the
linked entity (`resolve_entity`). Permissions (F2 `ModuleSpec`): `tasks:read` (all
default roles), `tasks:write` (all default roles: create tasks, edit own/assigned ones),
`tasks:manage` (admin, quality_manager: any task in the org).

Event kinds (F2 registers): `task.created` (timeline only), `task.assigned`
(category `assignments`), `task.completed` (`workflow`, recipients owner=creator),
`task.reopened`. Reminders and escalation come from F3 through F2's due provider
(`HOOK_DUE_PROVIDERS: ["app.platform.tasks.jobs:due_tasks"]`). Beat (F2
`beat.py`): `tasks.generate_recurring` daily 04:00 UTC creates occurrences whose due
date is within `lead_days`, at most one open occurrence per recurrence.

### 5.3 Endpoints (prefix `/api/v1/orgs/{org_id}`)

| Method, path | Permission | Notes |
|---|---|---|
| `GET /tasks` | `tasks:read` | query `entity_type, entity_id, assignee=me\|user:<id>\|role:<key>\|department:<id>, status (csv), kind, module, due_before, due_after, q, sort=due_at\|-due_at\|-created_at\|priority, limit<=200, offset` -> `{items: [Task], total}` |
| `POST /tasks` | `tasks:write` (+ edit on the entity when given) | `{title, description?, entity_type?, entity_id?, assignee?: {type, value}, due_at?, priority?, kind?, checklist?: [str], recurrence?: {rrule, dtstart, lead_days?}}` |
| `GET /tasks/{id}` | visible | Task + `checklist` + `entity: EntityRefDto \| null` |
| `PATCH /tasks/{id}` | creator, assignee or `tasks:manage` | any of title, description, assignee, due_at, priority, status (`open`, `in_progress`, `blocked`) |
| `POST /tasks/{id}/complete`, `/reopen`, `/cancel` | assignee, creator or manage | |
| `DELETE /tasks/{id}` | creator or manage | soft delete |
| `POST /tasks/{id}/checklist`, `PATCH|DELETE /tasks/{id}/checklist/{item_id}` | as PATCH | `{text}` / `{text?, done?}` |
| `GET/POST /task-recurrences`, `PATCH/DELETE /task-recurrences/{id}` | `tasks:write` / creator or manage | |
| `GET /my-work` | member | `?from&to&include=tasks,deviation_actions,...` -> `{items: [WorkItem]}` |

Task JSON: `{id, org_id, title, description, status, priority, kind, module, entity_type,
entity_id, entity: {title, code, url} | null, assignee: {type, value, name} | null,
due_at, start_at, completed_at, recurrence_id, escalation_level, checklist_total,
checklist_done, created_by, created_at, updated_at}`.

`WorkItem` (`app/platform/tasks/work.py`): `{source, id, title, code, status, priority,
due_at, url, entity_type, entity_id, module}`. Sources: F2 provides `task`,
`deviation_action`, `deviation` (owned, open), `document_review` (pending approvals),
`document_ack` (pending acknowledgements). Modules add sources through
`HOOK_WORK_ITEMS` (refs -> `WorkItemProvider`):

```python
class WorkItemProvider(Protocol):
    async def __call__(self, session: AsyncSession, org_id: uuid.UUID, caller: Caller,
                       *, roles: frozenset[str], department_ids: frozenset[uuid.UUID],
                       until: datetime | None) -> list[WorkItem]: ...
```

### 5.4 Portal

- `src/app/core/tasks/task.models.ts`, `tasks-api.ts` (`TasksApi.list/create/get/update/complete/reopen/cancel/delete/checklist*`, `myWork`).
- `src/app/shared/tasks/entity-tasks.ts`: `<app-entity-tasks [entityType] [entityId] [canCreate] [defaultAssignee]>` (list + quick add) for record detail pages.
- `src/app/shared/tasks/task-form.ts`: `<app-task-form [value] (saved) (cancelled)>` incl. recurrence picker (`<app-recurrence-picker [(rrule)]>`).
- My Work (`features/my-work/`): list, board (by status) and calendar (month grid) views, filters (source, due, priority), overdue highlight. Route `/tasks/:id` is a task detail page inside `features/my-work` (F1 declares no separate nav item).
- Scope `tasks`.

---

## 6. F3: events, notifications, watchers, reminders, escalation, timeline

Backend package `app/platform/events/` (`manifest.py`, `models.py`, `kinds.py`,
`service.py`, `recipients.py`, `rules.py`, `due.py`, `timeline.py`, `routes.py`,
`jobs.py`, `beat.py`). Migration `cf22_events`. F3 owns the notification tables.

### 6.1 Tables

```
domain_event    id UUID PK, org_id FK CASCADE, kind String(64), entity_type String(32),
                entity_id UUID, actor_user_id FK users SET NULL NULL, actor_kind String(8),
                payload JSONB {}, created_at DateTime server_default now()
                index (org_id, entity_type, entity_id, created_at), index (org_id, kind, created_at)
                (not append-only: erasable for GDPR; payload holds ids, codes, titles,
                 statuses, dates, never descriptions or bodies)
notification_rule  id UUID PK, org_id FK CASCADE, event_kind String(64),
                recipients JSONB  -- [{type: owner|assignee|watchers|role|department|user|department_lead, value?}]
                channels JSONB    -- ["in_app", "email", "digest"]
                enabled Boolean default true, created_by, TimestampMixin; unique (org_id, event_kind)
watcher         id UUID PK, org_id FK CASCADE, entity_type String(32), entity_id UUID,
                user_id FK users CASCADE, source String(8) default "manual" (manual|auto),
                created_at; unique (entity_type, entity_id, user_id)
notification_category_pref  user_id FK CASCADE, org_id FK CASCADE, category String(32),
                in_app Boolean default true, email String(10) default "digest" (immediate|digest|off),
                updated_at; PK (user_id, org_id, category)
notification_schedule  user_id PK FK CASCADE, quiet_start Time NULL, quiet_end Time NULL,
                timezone String(64) default "Europe/Oslo", updated_at
org_notification_settings  org_id PK FK CASCADE, reminder_days Integer default 3,
                escalation_days Integer default 3, escalation_role_key String(64) NULL,
                escalate_to_department_lead Boolean default true, updated_by, updated_at
ALTER notification: kind -> String(64); ADD category String(32) NULL; ADD event_id UUID NULL
                (FK domain_event SET NULL)
ALTER departments: ADD lead_user_id UUID NULL FK users SET NULL
```

### 6.2 The event sink and kinds

- F3 manifest: `HOOK_EVENT_SINKS: ["app.platform.events.service:record_event"]`,
  `HOOK_EVENT_KINDS: ["app.platform.events.kinds:EVENT_KINDS"]`.
- `async def record_event(session, event: DomainEventIn) -> None`: inserts
  `domain_event`; looks up the `EventKindSpec` (unknown kind: stored, no notifications,
  warning logged); if `notify`, resolves recipients (org rule for the kind, else
  `default_recipients` / `default_channels`), removes the actor unless
  `include_actor`, removes non-members, applies `notification_category_pref`, stages one
  `Notification` per user (`kind=event.kind`, `title_key=spec.title_key`,
  `params=payload + {"actor_name", "entity_type", "entity_label_key"}`, `category`,
  `event_id`), and queues immediate emails after commit (quiet hours defer to the digest).
- Recipient types: `owner` (`Recipients.owner_user_ids`), `assignee` (each `Assignee`;
  a role expands to the org members holding it, a department to its members), `watchers`,
  `role` / `department` / `user` (rule value), `department_lead`
  (`Recipients.department_id` -> `departments.lead_user_id`).
- Kind naming: `"<entity_type>.<verb>"` (`risk.created`, `risk.owner_changed`,
  `audit_finding.raised`); platform kinds use a namespace (`task.*`, `comment.*`,
  `workflow.*`, `reminder.*`, `module.*`).
- **Title keys** (`EventKindSpec.title_key`, `timeline_key`): a global key
  (`notifications.taskAssigned`) or a scoped key `"<scope>:<path>"`
  (`"risk:notifications.treatmentAssigned"`), translated from the module's scope file.
  Modules always use scoped keys.
- Categories (preference groups): `assignments`, `reminders`, `workflow`, `mentions`,
  `comments`, `system`, or the module key.
- F3's own kinds: `reminder.due_soon`, `reminder.overdue`, `reminder.escalated`
  (`category="reminders"`, params `{title, code, due_date, days, entity_label_key, url}`),
  `module.enabled`, `module.disabled` (timeline only).

Keep existing behaviour: `notify_assignment`, document notifications and the deviation/
action/document reminder scan keep working unchanged (M03/M24 move them onto events).

### 6.3 Watchers API

```python
async def watch(session, *, org_id, entity: EntityKey, user_id, source: str = "manual") -> None  # idempotent
async def unwatch(session, *, org_id, entity: EntityKey, user_id) -> None
async def watcher_ids(session, *, org_id, entity: EntityKey) -> list[uuid.UUID]
```

Modules call `watch(..., source="auto")` for the creator and the owner on create.
Endpoints: `GET /orgs/{org_id}/watchers?entity_type&entity_id` -> `{watching: bool,
count, users: [{id, name}]}`; `PUT` and `DELETE` (the same query) for the current user
(read access to the entity required).

### 6.4 Reminders and escalation

Beat `events.scan_due` daily 05:15 UTC (F3 `beat.py`). For every DueProvider item of an
org: due within `reminder_days` -> `reminder.due_soon`; overdue -> `reminder.overdue`
(both deduped per user/kind/entity/day through the existing unique constraint, recipients
= owners + assignees); overdue by >= `escalation_days` -> `reminder.escalated` once per
item per escalation level (department lead and/or `escalation_role_key` holders), via the
same sink. Modules register `HOOK_DUE_PROVIDERS` with a **sync** function
`(session: Session, *, until: datetime) -> Iterable[DueItem]` returning only open,
not-deleted items.

### 6.5 Rules, preferences, settings endpoints

| Method, path | Permission | Notes |
|---|---|---|
| `GET /api/v1/orgs/{org_id}/notification-rules` | `org:manage` | `[{event_kind, module, category, title_key, recipients, channels, enabled, is_default}]` for every registered kind |
| `PUT /api/v1/orgs/{org_id}/notification-rules/{event_kind}` | `org:manage` | `{recipients, channels, enabled}`; `DELETE` restores the default |
| `GET/PUT /api/v1/orgs/{org_id}/notification-settings` | `org:manage` | `{reminder_days, escalation_days, escalation_role_key, escalate_to_department_lead}` |
| `GET/PUT /api/v1/me/notification-categories?org_id=` | self | `[{category, in_app, email}]` |
| `GET/PUT /api/v1/me/notification-schedule` | self | `{quiet_start, quiet_end, timezone}` |
| `PUT /api/v1/orgs/{org_id}/departments/{id}/lead` | `org:manage` | `{user_id \| null}` |

### 6.6 Timeline API

`GET /api/v1/orgs/{org_id}/timeline?entity_type&entity_id&limit=50&before=<iso>&include_audit=false`
(read access via `resolve_entity`; `include_audit=true` additionally needs `audit:read`).

```json
{ "items": [ {
    "id": "...", "source": "event" | "audit",
    "kind": "risk.owner_changed",           // event kind or audit action
    "label_key": "risk:timeline.ownerChanged" | null,   // EventKindSpec.timeline_key
    "created_at": "...",
    "actor": {"user_id": "...", "name": "...", "kind": "user" | "ai" | "system"},
    "params": {"...": "..."},                // event payload (+ actor_name)
    "summary": "..." | null,                 // audit summary (audit items only)
    "changes": [{"field": "status", "before": "open", "after": "closed"}] | null
  } ],
  "next_before": "<iso>" | null }
```

Service: `async def timeline(session, *, org_id, entity: EntityKey, caller, limit, before, include_audit) -> dict`.

### 6.7 Portal

- `core/notifications/notification-text.ts` (F3): resolve `title_key` of the form
  `"<scope>:<key>"` by loading the scope (`TranslocoService.load('<scope>/<lang>')`) and
  translating `<key>` in it; unknown keys keep the existing fallback. `reminder.*` kinds
  render with the entity type label from `entity_label_key` (global
  `modules.entities.*`, provided by F1).
- `shared/activity/watch-button.ts`: `<app-watch-button [entityType] [entityId]>`.
- Settings pages (scope `activity`): `/settings/notifications` (rules matrix + reminder/
  escalation settings); account page `/account/notifications` extended with categories
  and quiet hours (F3 may edit `features/account/**`).
- The timeline portal client and `<app-timeline>` are F8's (built against 6.6); F3 adds no
  timeline code to the portal.

---

## 7. F4: record types and workflow engine

Backend package `app/platform/records/` (`manifest.py`, `models.py`, `fields.py`,
`definition.py`, `engine.py`, `service.py`, `routes.py`, `templates/*.json`). New file
`app/ai/workflow_design.py`. Migration `cf23_records`. Permissions: `records:read`
(all default roles), `records:admin` (admin, quality_manager): design types/workflows.

### 7.1 Field schema (`fields.py`, superset of today's deviation `FieldDef`)

```jsonc
{
  "key": "root_cause",                       // ^[a-z][a-z0-9_]{0,63}$, unique per type
  "label": "Root cause" | {"en": "Root cause", "nb": "Rotårsak"},
  "type": "text|textarea|richtext|number|date|datetime|select|multiselect|checkbox|user|department|file|entity_ref|calculated",
  "required": false,
  "options": ["a", "b"] | [{"value": "a", "label": "A" | {"en","nb"}}],   // select/multiselect
  "help": "..." | {"en","nb"}, "placeholder": "..." | {"en","nb"},
  "width": "full|half", "section": "details",
  "min": 0, "max": 10,                         // number; string length for text types
  "entity_type": "risk",                       // entity_ref
  "formula": "likelihood * consequence",       // calculated: + - * / ( ), numeric field keys, numbers
  "visible_if": {"field": "kind", "equals": "x"},
  "default": null
}
```

Values in `data` JSONB: text -> str; richtext -> sanitised HTML (existing
`html_sanitize`); number -> float; date -> `YYYY-MM-DD`; datetime -> ISO naive UTC;
select -> str; multiselect -> list[str]; checkbox -> bool; user/department -> uuid str;
file -> attachment id (uuid str, attachment on the same record); entity_ref ->
`{"entity_type", "entity_id"}`; calculated -> computed server-side, never accepted from
clients.

```python
def validate_fields(fields: list[dict]) -> list[FieldSpec]            # 422 invalid_fields
def validate_data(fields: Sequence[FieldSpec], data: Mapping[str, Any], *,
                  partial: bool = False) -> tuple[dict[str, Any], dict[str, str]]
    # (clean data incl. calculated values, errors {key: code}); codes: required, invalid_type,
    # invalid_option, too_small, too_large, unknown_field
```

Layout: `[{"key": "details", "label": ..., "fields": ["a", "b"], "columns": 1 | 2}]`.

### 7.2 Workflow definition (`definition.py`, pydantic-validated)

```jsonc
{
  "initial_state": "open",
  "states": [
    {"key": "open", "label": {"en": "Open", "nb": "Åpen"},
     "category": "open|in_progress|done|cancelled", "sla_hours": 72}
  ],
  "transitions": [
    {"key": "start", "from": ["open"], "to": "investigating",
     "label": {"en": "Start investigation", "nb": "Start undersøkelse"},
     "required_fields": ["root_cause"],
     "allowed_roles": ["quality_manager"], "allowed_permissions": ["deviations:write"],
     "allow_owner": true,
     "approval": {"mode": "single|all|quorum", "quorum": 2,
                  "approver_roles": ["quality_manager"], "approver_user_field": "approver",
                  "segregation_of_duties": true},
     "guards": ["no_open_tasks"],
     "create_tasks": [{"title": {"en": "...", "nb": "..."}, "due_in_days": 7,
                       "assignee": {"type": "role|user_field|owner", "value": "quality_manager"}}],
     "notify": [{"type": "owner"}, {"type": "role", "value": "quality_manager"}],
     "require_comment": false}
  ]
}
```

Rules: state keys unique; transitions reference existing states; `done`/`cancelled`
states need no outgoing transitions; `allowed_*` empty = anyone with the entity's write
permission. Guards are named functions modules register with the engine
(`engine.register_guard(name, fn)` at import of their service module; the engine ships
`no_open_tasks`).

### 7.3 Tables

```
record_type          id, org_id, module String(32), key String(64), name String(120),
                     description Text NULL, code_prefix String(16) NULL, is_active Boolean,
                     current_version_id UUID NULL (FK record_type_version, use_alter),
                     template_key String(64) NULL, created_by, TimestampMixin, deleted_at NULL
                     unique (org_id, module, key)
record_type_version  id, org_id, record_type_id FK CASCADE, version Integer, fields JSONB,
                     layout JSONB, workflow_version_id FK workflow_version NULL,
                     published_by, published_at; unique (record_type_id, version)
workflow_definition  id, org_id, module, key, name, current_version_id UUID NULL (use_alter),
                     created_by, TimestampMixin, deleted_at NULL; unique (org_id, module, key)
workflow_version     id, org_id, workflow_id FK CASCADE, version Integer, definition JSONB,
                     published_by, published_at; unique (workflow_id, version)
workflow_instance    id, org_id, entity_type String(32), entity_id UUID, workflow_version_id FK,
                     state String(32), state_entered_at, sla_due_at NULL, closed_at NULL,
                     TimestampMixin; unique (entity_type, entity_id)
workflow_approval    id, org_id, instance_id FK CASCADE, transition_key String(64),
                     requested_by FK users, approver_user_id NULL, approver_role_key NULL,
                     decision String(10) default "pending" (pending|approved|rejected),
                     decided_by NULL, decided_at NULL, comment Text NULL, created_at
```

Records keep the version they were created with (`record_type_version_id` on the
module's own row; the instance pins `workflow_version_id`). Publishing creates a new
version; old versions are immutable.

### 7.4 Engine API (`engine.py`), used by M03 and any module with configurable records

```python
@dataclass(frozen=True)
class TransitionOption: key: str; to: str; label: dict[str, str] | str; needs_approval: bool
                        required_fields: tuple[str, ...]; require_comment: bool
@dataclass(frozen=True)
class TransitionResult: state: str; pending_approval_ids: tuple[uuid.UUID, ...]
                        created_task_ids: tuple[uuid.UUID, ...]

async def start(session, *, org_id, entity: EntityKey, workflow_version_id, actor_user_id) -> WorkflowInstance
async def get_instance(session, *, org_id, entity: EntityKey) -> WorkflowInstance | None
async def available_transitions(session, *, org_id, entity: EntityKey, caller: Caller,
                                roles: frozenset[str], owner_user_id: uuid.UUID | None,
                                data: Mapping[str, Any]) -> list[TransitionOption]
async def transition(session, *, org_id, entity: EntityKey, transition_key: str, caller: Caller,
                     roles: frozenset[str], owner_user_id: uuid.UUID | None,
                     data: Mapping[str, Any], comment: str | None) -> TransitionResult
    # 409 {"code": "transition_not_allowed" | "approval_pending" | "guard_failed", ...},
    # 422 {"code": "required_fields", "fields": [...]}. Creates approvals, F2 tasks, emits
    # workflow.transitioned / workflow.approval_requested, audit "workflow.transitioned".
async def decide_approval(session, *, org_id, approval_id, caller, roles, approve: bool,
                          comment: str | None) -> TransitionResult   # SoD: decider != requester
def roles_from(principal: Principal, org_id: uuid.UUID) -> frozenset[str]
```

SLA: `sla_due_at = state_entered_at + sla_hours`; F4 registers a due provider over
open instances, so F3 escalates SLA breaches. Event kinds: `workflow.transitioned`,
`workflow.approval_requested` (`assignments`), `workflow.approval_decided`
(`workflow`), timeline keys under scope `records`.

### 7.5 Templates

`HOOK_RECORD_TEMPLATES` refs -> `list[RecordTemplate]`:

```python
@dataclass(frozen=True)
class RecordTemplate:  # app/platform/records/templates.py
    key: str; module: str; name: dict[str, str]; description: dict[str, str]
    fields: list[dict[str, Any]]; layout: list[dict[str, Any]]; workflow: dict[str, Any]
    code_prefix: str | None = None
```

F4 ships `deviation_default` (reproduces today's deviation statuses
open -> investigating -> action -> verification -> closed, cancel/reopen with reasons,
closure guard) as `templates/deviation_default.json`. M03 adds its seven templates.

### 7.6 Endpoints (prefix `/api/v1/orgs/{org_id}`)

| Method, path | Permission |
|---|---|
| `GET /record-types?module=` / `POST /record-types` / `GET,PATCH,DELETE /record-types/{id}` | read: `records:read`; write: `records:admin` |
| `POST /record-types/{id}/versions` `{fields, layout, workflow_version_id?}` -> new version | `records:admin` |
| `GET /record-types/{id}/versions/{version}` | `records:read` |
| `GET /workflows?module=` / `POST /workflows` / `POST /workflows/{id}/versions` `{definition}` / `GET /workflows/{id}/versions/{version}` | as above |
| `GET /record-templates?module=` / `POST /record-templates/{key}/install` -> `{record_type, workflow}` | `records:admin` |
| `GET /workflow-instances/{entity_type}/{entity_id}` -> `{state, state_entered_at, sla_due_at, transitions: [TransitionOption], approvals: [...], definition_version}` | read on entity |
| `POST /workflow-instances/{entity_type}/{entity_id}/transitions/{key}` `{data, comment}` | write on entity + definition rules |
| `POST /workflow-approvals/{id}/decision` `{approve, comment}` | approver |
| `POST /workflows/ai-draft` `{module, description, lang}` -> `{fields, layout, workflow}` (not persisted; 503 when AI is off) | `records:admin` |

### 7.7 Portal (scope `records`)

- `src/app/shared/records/dynamic-form.ts`: `<app-dynamic-form [fields] [layout] [value] [errors] [readonly] [lang] (valueChange)>`; `dynamic-value.ts`: `<app-dynamic-value [field] [value]>` (read view).
- `src/app/shared/records/workflow-panel.ts`: `<app-workflow-panel [entityType] [entityId] [data] (transitioned)>` (state badge, transition buttons with required-field prompts, approvals).
- `src/app/shared/records/workflow-diagram.ts`: `<app-workflow-diagram [definition] [current]>` (SVG).
- `src/app/features/records/`: `/settings/record-types` list, type designer (field builder + layout + publish), workflow designer (states, transitions, diagram, "Describe your process" AI draft). F4 adds the one settings child route + link.
- `core/records/records-api.ts`, `record.models.ts`.

---

## 8. F5: global search, AI tools, assists, page context

Backend: `app/platform/search/` (`manifest.py`, `builtin.py`, `service.py`, `routes.py`),
`app/ai/` (owner). Migration `cf24_assistant` (table `ai_action`).

### 8.1 Global search

- Providers: `HOOK_SEARCH_PROVIDERS` refs -> `list[SearchProviderSpec]`. F5 ships
  providers for `document` (approved/visible only), `deviation`, `deviation_action` and
  standard requirements (`entity_type="standard_requirement"`, url
  `/standards/<key>?req=<ref>`).
- A provider must apply its own record-level visibility and soft delete, use Postgres
  FTS (`fts.FTS_CONFIG`, `plainto_tsquery` or `websearch_to_tsquery`, prefix match on
  code/title with `ILIKE` allowed), and return at most `limit` hits ranked by `ts_rank`.
- `GET /api/v1/orgs/{org_id}/search?q=<1..200>&types=a,b&limit=20` (member) ->
  `{items: [SearchHit + {module, label_key}], counts: {entity_type: n}}`. The service
  skips providers whose permission the caller lacks or whose module is disabled, runs
  them sequentially on the request session, merges by rank.
- Service: `async def search(session, org_id, caller, query, *, types=None, limit=20) -> list[SearchHit]`.

### 8.2 AI tool registry

`app/ai/tools.py` keeps `Tool` and gains optional fields (backwards compatible):

```python
@dataclass(frozen=True)
class Tool:
    name: str; description: str; input_schema: dict[str, Any]
    required_permission: str; handler: ToolHandler
    module: str | None = None          # gated by module enablement when set
    write: bool = False                # True -> confirm-before-write (8.3)
    execute: ActionExecutor | None = None   # required when write=True

ActionExecutor = Callable[[AsyncSession, Principal, uuid.UUID, dict[str, Any]], Awaitable[ActionResult]]

@dataclass(frozen=True)
class ActionResult:
    message: str
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    url: str | None = None
```

`tools_for(...)` = built-ins + `registry.hook(HOOK_AI_TOOLS)`, filtered by permission
and (for `module` tools) module enablement; names unique (`RuntimeError` on a clash);
stable sorted order. Module tool names are prefixed with the module key:
`risk_search`, `risk_get`, `risk_create_draft`, `risk_summarise`.

Helper for the four standard tools (`app/ai/tool_kit.py`):

```python
def standard_record_tools(
    *, prefix: str, module: str, entity_label: str,
    read_permission: str, write_permission: str,
    search: SearchFn,                                         # kernel SearchFn
    get: Callable[[AsyncSession, uuid.UUID, Caller, uuid.UUID], Awaitable[dict[str, Any]]],
    create_draft: Callable[[AsyncSession, uuid.UUID, Caller, dict[str, Any]], Awaitable[EntityRef]],
    create_schema: dict[str, Any],                            # JSON schema of create args
    preview: Callable[[dict[str, Any]], list[tuple[str, str]]] | None = None,
) -> list[Tool]
```

### 8.3 Confirm-before-write

A write tool's `handler` validates the arguments and calls
`ctx.propose_action(tool_name, args, summary, preview)` instead of writing; it returns a
message telling the model the change awaits the user's confirmation. The runtime stores
an `ai_action` row and streams an `action` event. Nothing changes until the user
confirms.

```
ai_action   id UUID PK, org_id FK CASCADE, user_id FK users CASCADE, tool String(64),
            args JSONB, summary String(500), preview JSONB, status String(10)
            (pending|confirmed|rejected|expired|failed), result JSONB NULL, error Text NULL,
            created_at, decided_at NULL, expires_at (created_at + 24 h)
```

- `POST /api/v1/orgs/{org_id}/ai/actions/{id}/confirm` (same user, pending, not
  expired; re-checks permission + module) runs `tool.execute(...)` inside
  `audit.acting_as_ai()`, commits, returns `{status: "confirmed", result: ActionResult}`;
  409 `{"code": "action_not_pending"}`, 410 `{"code": "action_expired"}`, 422
  `{"code": "action_failed", "message"}` (stored as failed).
- `POST /api/v1/orgs/{org_id}/ai/actions/{id}/reject` -> 204.
- F5 converts the existing direct writes (`create_deviation`, `create_deviation_type`,
  `set_document_owner`, `set_document_visibility`, `grant_document_access`,
  `revoke_document_access`) to this flow. `draft_document` keeps its review-feed proposal.

### 8.4 Ask request, page context, tutor mode, new SSE events

`AskRequest` gains:

```python
class PageSelection(BaseModel):
    text: str | None = Field(default=None, max_length=2000)
    field: str | None = Field(default=None, max_length=64)
    ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)

class PageContext(BaseModel):
    module: str | None = Field(default=None, max_length=32)
    entity_type: str | None = Field(default=None, max_length=32)
    entity_id: uuid.UUID | None = None
    view: Literal["list", "detail", "edit", "new", "board", "calendar", "dashboard",
                  "settings", "other"] = "other"
    route: str | None = Field(default=None, max_length=300)
    title: str | None = Field(default=None, max_length=200)
    selection: PageSelection | None = None

page_context: PageContext | None = None
mode: Literal["ask", "tutor"] = "ask"
guidance_level: Literal["beginner", "standard", "expert"] | None = None
topic: str | None = Field(default=None, max_length=200)   # tutor topic, e.g. "risk.list" or "iso9001:6.1"
```

The runtime resolves the page entity via `registry.resolve_entity` (silently ignored on
any error, never leaked), adds a short "the user is looking at <type> <code> <title>"
system note, and makes the tools of that module available. Tutor mode adds a teaching
system prompt adapted to `guidance_level` (plain language, short steps, a check
question). New built-in tools: `open_record` (search -> returns a link), `explain_clause`
(catalogue clause summary/guidance, any enabled or disabled standard), `global_search`.

SSE additions (old events unchanged):

```
{"type":"action","action_id":"…","tool":"risk_create_draft","summary":"…",
 "preview":{"title":"…","fields":[{"label":"…","value":"…"}]}}
{"type":"link","entity_type":"risk","entity_id":"…","title":"…","code":"…","url":"/risk/risks/…"}
{"type":"sources","sources":[{"id","title","doc_code","entity_type"?,"url"?}]}   // fields added
```

### 8.5 Assists (per-module AI buttons)

`app/ai/assist.py`:

```python
@dataclass(frozen=True)
class AssistPrompt:
    system: str
    user: str
    sources: list[Source] = field(default_factory=list)

AssistBuilder = Callable[[AsyncSession, Caller, uuid.UUID, dict[str, Any], Lang], Awaitable[AssistPrompt]]

@dataclass(frozen=True)
class AssistSpec:
    key: str                       # "<module>.<name>", e.g. "risk.suggest_controls"
    module: str
    permission: str
    build: AssistBuilder
    output: Literal["text", "json"] = "text"
    validate: Callable[[Any], Any] | None = None   # json: e.g. Model.model_validate; raise -> error event
    max_tokens: int = 2000

def complete_text(system: str, user: str, *, max_tokens: int) -> str   # the single LLM seam; tests monkeypatch it
```

`POST /api/v1/orgs/{org_id}/ai/assist/{key}` `{input: {...}, lang?, entity_type?,
entity_id?}` -> SSE (`delta` for text, `result` `{"type":"result","data":{...}}` for json,
`sources`, `done`, `error`); 503 when AI is off, 404 unknown key or disabled module, 403
permission. Audited in `ai_runs` (kind = key). JSON output is produced as plain text and
parsed with a robust extractor (repo AI conventions). Modules register
`HOOK_AI_ASSISTS: ["app.modules.risk.ai:ASSISTS"]`. Never send sampling parameters.

### 8.6 Portal

- `src/app/core/ai/page-context.ts`:
  ```ts
  export type PageView = 'list'|'detail'|'edit'|'new'|'board'|'calendar'|'dashboard'|'settings'|'other';
  export interface PageSelection { readonly text?: string; readonly field?: string; readonly ids?: readonly string[] }
  export interface PageContext {
    readonly module: string | null; readonly entityType?: string | null; readonly entityId?: string | null;
    readonly view: PageView; readonly title?: string | null; readonly selection?: PageSelection | null;
  }
  @Injectable({ providedIn: 'root' }) export class PageContextService {
    readonly current: Signal<PageContext | null>;
    set(owner: object, ctx: PageContext | null): void; clear(owner: object): void;
    setSelection(selection: PageSelection | null): void;
  }
  /** Call in a component constructor; tracks the signal, clears on destroy. */
  export function providePageContext(ctx: () => PageContext | null): void;
  ```
  The Ask panel sends it as `page_context` (snake_case on the wire, plus `route` from the
  router URL).
- `AskPanelService` gains `askAbout(prompt: string, selection?: PageSelection)`,
  `openTutor(topic?: string)` and renders `action` (Confirm / Discard card calling
  `AiActionsApi`) and `link` (router link) events.
- `src/app/shared/ask/ask-about.ts`: `<app-ask-about [prompt] [field] [labelKey]>` (icon button).
- `src/app/shared/ask/ai-assist-button.ts`: `<app-ai-assist-button [assist] [input] [labelKey] [entityType] [entityId] (result) (text)>` + `core/ai/ai-assist-api.ts` (`AiAssistApi.run(orgId, key, body, onEvent): SseStream`).
- Floating Ask button in the main layout and the shortcut **Ctrl/Cmd + J** (Ctrl/Cmd + K
  stays the command palette).
- `src/app/core/search/search-api.ts` (`SearchApi.search(orgId, q, {types, limit})`) and
  the command palette shows grouped record results (scope `search`).

---

## 9. F6: guidance levels, learning content, progress

Backend package `app/platform/guidance/`. Migration `cf25_guidance`.

### 9.1 Tables and endpoints

```
user_preference   user_id PK FK users CASCADE, guidance_level String(16) NULL, updated_at
org_guidance      org_id PK FK CASCADE, default_level String(16) default "standard", updated_by, updated_at
learning_progress id UUID PK, user_id FK CASCADE, org_id FK CASCADE, module String(32),
                  lesson_key String(128), seen_at NULL, completed_at NULL, quiz_score Integer NULL,
                  quiz_passed Boolean NULL, attempts Integer default 0, TimestampMixin
                  unique (user_id, org_id, lesson_key)
```

| Method, path | Permission | Body / response |
|---|---|---|
| `GET /api/v1/me/preferences?org_id=` | self | `{guidance_level: level \| null, org_default: level, effective: level}` |
| `PUT /api/v1/me/preferences` | self | `{guidance_level: level \| null}` |
| `GET /api/v1/orgs/{org_id}/guidance` | member | `{default_level}`; `PUT` with `org:manage` |
| `GET /api/v1/orgs/{org_id}/learning/progress?module=` | self | `{items: [{module, lesson_key, seen_at, completed_at, quiz_score, quiz_passed, attempts}]}` |
| `POST /api/v1/orgs/{org_id}/learning/progress` | self | `{module, lesson_key, event: "seen" \| "completed" \| "quiz", score?, passed?}` -> item |

Levels: `beginner | standard | expert`. Service API for M11:
`async def record_progress(session, *, org_id, user_id, module, lesson_key, event, score=None, passed=None) -> LearningProgress`,
`async def list_progress(session, *, org_id, user_id, module=None) -> list[LearningProgress]`.
Mutations are audited (`entity_type="user_preference" | "learning_progress"`).

### 9.2 Content files

`src/assets/guidance/<lang>/<scope>.json` (`<lang>` = `en`, `nb`; `<scope>` = the portal
path from 1.1, or `platform` for shared pages, plus `glossary.json`). en/nb must have the
same keys and structure (strings may differ). Markdown is allowed in `body` fields
(rendered with the existing markdown pipe). Format:

```jsonc
{
  "pages": {
    "list": {
      "intro": {"title": "...", "body": "...", "steps": ["...", "..."]},
      "why": {"body": "...", "clauses": ["hs:6.1", "iso27001:6.1.2"]},
      "empty": {"title": "...", "body": "...", "cta": "..."},
      "fields": {"likelihood": {"help": "...", "example": "..."}}
    },
    "detail": { ... }
  },
  "lessons": {
    "first-risk-assessment": {
      "title": "...", "minutes": 5,
      "sections": [{"heading": "...", "body": "..."}],
      "quiz": [{"question": "...", "options": ["...", "..."], "answer": 1, "explanation": "..."}],
      "pass_mark": 0.8
    }
  },
  "tours": {"list": [{"target": "risk-new", "title": "...", "body": "..."}]},
  "glossary": {"residual-risk": {"term": "...", "definition": "...", "clauses": ["iso27001:8.3"]}}
}
```

Lesson keys in `learning_progress` are `"<scope>.<lesson key>"` (e.g. `risk.first-risk-assessment`).

### 9.3 Portal (scope `guidance`)

- `src/app/core/guidance/guidance.service.ts`:
  ```ts
  export type GuidanceLevel = 'beginner' | 'standard' | 'expert';
  @Injectable({ providedIn: 'root' }) export class GuidanceService {
    readonly level: Signal<GuidanceLevel>;        // effective level (user, else org default, else 'standard')
    setLevel(level: GuidanceLevel | null): void;  // null = follow the org default
    readonly isBeginner: Signal<boolean>; readonly isExpert: Signal<boolean>;
  }
  ```
- `src/app/core/guidance/guidance-content.service.ts`: `page(scope, page): Signal<GuidancePage | null>`, `lesson(scope, key)`, `tour(scope, key)`, `glossaryTerm(key, scope?)` (loads `/assets/guidance/<lang>/<scope>.json` once per lang).
- Components in `src/app/shared/guidance/` (inputs exactly):
  - `<app-guide-intro [scope] [page]>`: beginner expanded with steps; standard one collapsible line; expert hidden behind an info icon.
  - `<app-field-help [scope] [page] [field]>`: beginner inline text; otherwise a `?` popover. Pairs with `app-form-field`.
  - `<app-why-it-matters [scope] [page]>`: clause chips; clicking one calls `AskPanelService.openTutor(ref)`.
  - `<app-lesson [scope] [lesson]>` (loads content, records progress) and `<app-lesson-player [lesson] (completed)>` (pure; M11 feeds it course content of the same `Lesson` shape).
  - `<app-teaching-empty [scope] [page] (action)>`: empty state with the `empty` texts and a CTA.
  - `[appTourStep]="'risk-new'"` directive + `TourService.start(scope, tour)` (CDK overlay, no layout edits) + `<app-tour-button [scope] [tour]>`.
  - `<app-term key="nonconformity">text</app-term>`: hover/focus definition from the glossary.
  - `<app-teach-me [topic]>`: opens the assistant in tutor mode.
- Account menu: level switch (three options + "use organisation default").
- `src/testing/i18n-parity.ts`: `export function expectKeyParity(a: unknown, b: unknown, path?: string): void` (Vitest `expect`, compares key sets and structure recursively). Modules use it in their own specs for scoped i18n and guidance files.
- F6 writes `glossary.json` (>= 40 core terms) and `platform.json` (dashboard, my-work, documents, deviations, standards pages) in en and nb.

---

## 10. F7: frameworks, cross-mapping, clause declarations, readiness

### 10.1 Catalogue files (`app/standards/catalog/`)

New files, same `schema_version: 1` shape as today plus optional fields: `iso14001-2015.json`,
`iso42001-2023.json` (incl. Annex A controls as `annex_control`), `iso45001-2018.json`,
`gdpr-2016.json`, `eu-ai-act-2024.json`, `nis2-2022.json` (Art. 21 measures). Add to each
standard object `"framework": "<FRAMEWORK_KEYS entry>"` and `"kind": "standard" | "regulation"`;
add to clauses the optional `"hs": "6.1"` (Harmonised Structure clause; set on every HS
clause of every ISO file, including the existing 9001/27001 files) and, for the AI Act,
`"roles": ["provider", "deployer", ...]` and `"risk_classes": ["high", ...]`. Clause
`kind` gains `"article"`, `"recital"`, `"annex"`. GDPR/AI Act/NIS2 article numbers are
plain (`"32"`, `"Art. 32"` is the title), recitals `"R.39"`, annexes `"Annex III"`;
requirement refs follow the existing `<number>.r<n>` rule. ISO texts stay our own
summaries; EU legal text may be quoted in `summary`.

Framework -> catalogue key (`app/services/frameworks.py`, F7):
`FRAMEWORK_STANDARDS = {"iso9001": "iso9001-2026", "iso27001": "iso27001-2022",
"iso14001": "iso14001-2015", "iso42001": "iso42001-2023", "iso45001": "iso45001-2018",
"gdpr": "gdpr-2016", "eu_ai_act": "eu-ai-act-2024", "nis2": "nis2-2022"}`.

Mappings: `app/standards/catalog/mappings/*.json` (a subdirectory, so the standards loader
never reads them):

```json
{ "schema_version": 1,
  "mappings": [
    {"from": "iso27001-2022:A.5.34", "to": "gdpr-2016:32", "relation": "related",
     "note": {"en": "...", "nb": "..."}}
  ] }
```

Relations: `equivalent`, `related`, `supports`. HS equivalences are derived
automatically from equal `hs` values (no file entries). `seed-standards` loads both.

### 10.2 Tables (`cf26_frameworks`)

```
ALTER standard ADD framework String(32) NULL, ADD kind String(16) default "standard"
ALTER standard_clause ADD hs_ref String(16) NULL, ADD meta JSONB NULL (roles, risk_classes)
clause_mapping  id UUID PK, from_clause_id FK standard_clause CASCADE, to_clause_id FK CASCADE,
                relation String(12), note JSONB NULL, retired_at NULL; unique (from_clause_id, to_clause_id)
```

### 10.3 Clause declarations and evidence (service `app/services/frameworks.py`)

```python
def framework_of_standard(standard_key: str) -> str | None
def declarations() -> list[tuple[str, ClauseDecl]]     # (module key, decl) from every ModuleSpec
def clause_refs_for_entity_type(entity_type: str) -> list[str]   # e.g. ["hs:6.1", "iso27001:6.1.3"]
async def requirements_for_entity(session, *, org_id, entity_type) -> list[str]
    # qualified requirement refs ("iso9001-2026:6.1.1.r1") under the declared clauses of the
    # org's ENABLED standards; "hs:<n>" expands to that HS clause in every enabled ISO standard
async def readiness(session, *, org_id) -> list[dict]
```

Requirement links (`requirement_link.entity_type`) accept **any** registered entity
type whose spec is `linkable`: F7 keeps the hard-coded handling of the four existing types
(`document`, `deviation`, `deviation_action`, `attachment`) in `standards_service` and falls
back to the registry for every other type (`live_sql` for counting evidence,
`resolve_entities` for labels).

### 10.4 Endpoints (prefix `/api/v1/orgs/{org_id}`)

| Method, path | Permission | Response |
|---|---|---|
| `GET /frameworks` | `standards:read` | `[{framework, standard_key, name, kind, enabled, in_profile, readiness}]` |
| `GET /frameworks/readiness` | `standards:read` | `[{framework, standard_key, applicable, covered, partial, fresh, score}]` |
| `GET /standards/{key}/clauses/{number}/mappings` | `standards:read` | `[{relation, standard_key, number, title, note}]` |
| `GET /clause-support?ref=hs:6.1` | `standards:read` | `{ref, modules: [{key, entity_types}]}` |
| `GET /evidence-suggestions?entity_type=&entity_id=` | read on entity | `{requirements: [{ref, standard_key, number, title}]}` |

Readiness per enabled standard over applicable requirements: weight 1.0 = covered with
at least one confirmed live link confirmed (or record updated) within 365 days; 0.6 =
covered but older; 0.5 = `partial` override; 0 otherwise. `score = round(100 * sum / n)`
(0 when n = 0).

### 10.5 Portal (F7)

Standards overview lists all frameworks (enabled or not) with readiness rings; the
requirement row shows "Also satisfies" (mappings); `<app-supports-requirements>` (existing)
accepts any entity type and pre-filters to `evidence-suggestions`. Module detail pages
embed `<app-supports-requirements [entityType] [entityId]>`.

---

## 11. F8: entity links, comments, attachments, revisions, portal kit

Backend package `app/platform/kit/` (`manifest.py`, `models.py`, `builtin_entities.py`,
`links.py`, `comments.py`, `revisions.py`, `routes.py`). Migration `cf27_record_kit`.
F8 registers the built-in entity types `document`, `deviation`, `deviation_action`
(resolvers wrapping `document_service.get_reachable_document` /
`deviation_service.get_reachable_deviation` / `get_reachable_action`; modules
`documents` / `deviations`; urls `/documents/<id>`, `/deviations/<id>`,
`/deviations/<deviation_id>?action=<id>`).

### 11.1 Tables

```
entity_link     id UUID PK, org_id FK CASCADE, source_type String(32), source_id UUID,
                target_type String(32), target_id UUID,
                link_type String(16)  -- relates_to|caused_by|mitigates|evidence_for|supersedes|implements|derived_from
                created_by FK users SET NULL, created_at, deleted_at NULL, deleted_by NULL
                unique (org_id, source_type, source_id, target_type, target_id, link_type) WHERE deleted_at IS NULL
                index (org_id, target_type, target_id)
entity_comment  id UUID PK, org_id FK CASCADE, entity_type String(32), entity_id UUID,
                parent_id FK entity_comment CASCADE NULL, author_user_id FK users SET NULL,
                body Text (plain text / markdown, max 10000), mentions JSONB [] (user ids),
                created_at, edited_at NULL, deleted_at NULL, deleted_by NULL
                index (org_id, entity_type, entity_id, created_at)
record_revision id UUID PK, org_id FK CASCADE, entity_type String(32), entity_id UUID,
                revision_no Integer, snapshot JSONB, changed_fields JSONB [],
                change_reason Text NULL, actor_user_id FK users SET NULL, actor_kind String(8),
                created_at; unique (entity_type, entity_id, revision_no)
```

### 11.2 Service APIs

```python
# links.py
async def link(session, *, org_id, source: EntityKey, target: EntityKey, link_type: str,
               caller: Caller) -> EntityLink        # edit on source, read on target; 409 link_exists,
                                                    # 422 self_link / invalid_link_type; audit + emit "link.created"
async def unlink(session, *, org_id, link_id, caller) -> None   # edit on either side
async def list_for(session, *, org_id, entity: EntityKey, caller,
                   link_types: Sequence[str] | None = None) -> list[dict]   # both directions, unreadable sides dropped
async def linked_ids(session, *, org_id, entity: EntityKey, target_type: str,
                     link_type: str | None = None) -> list[uuid.UUID]   # no permission check (service use)
# comments.py
async def add_comment(session, *, org_id, entity: EntityKey, body: str, caller,
                      parent_id=None, mentions: Sequence[uuid.UUID] = ()) -> EntityComment
    # read access suffices; mentions must be org members; emits "comment.created" (watchers)
    # and "comment.mentioned" (Recipients(user_ids=mentions)); auto-watches the author
async def list_comments(session, *, org_id, entity: EntityKey, caller) -> list[dict]
async def edit_comment(...), delete_comment(...)  # author edits; author or entity write deletes
# revisions.py
async def record_revision(session, *, org_id, entity_type: str, entity_id: uuid.UUID,
                          snapshot: Mapping[str, Any], actor_user_id: uuid.UUID | None,
                          change_reason: str | None = None) -> RecordRevision | None
    # computes changed_fields vs the previous snapshot; None (nothing stored) when unchanged;
    # call it in the same transaction as the change, after the change is applied
async def list_revisions(session, *, org_id, entity: EntityKey, caller) -> list[dict]
def diff_snapshots(before: Mapping[str, Any], after: Mapping[str, Any]) -> list[dict]  # [{field, before, after}]
```

Attachments: `attachment_service` falls back to the registry for entity types not in
`ENTITY_RULES` (rule from the spec's permissions + `resolve_entity`, only when
`attachable`); the request schema's `entity_type` becomes `str` (max 32) validated
against the registry. Audit: `audit.redact()` also redacts the entity spec's
`redacted_fields`.

### 11.3 Endpoints (prefix `/api/v1/orgs/{org_id}`)

| Method, path | Permission | Notes |
|---|---|---|
| `GET /links?entity_type&entity_id&link_type?` | read | `{items: [{id, link_type, direction: "outgoing" \| "incoming", other: EntityRefDto, created_at, created_by: {id, name}}]}` |
| `POST /links` | edit source + read target | `{source_type, source_id, target_type, target_id, link_type}` |
| `DELETE /links/{id}` | edit either side | 204 |
| `GET /comments?entity_type&entity_id` | read | `{items: [{id, parent_id, author: {id, name}, body, mentions: [{id, name}], created_at, edited_at, can_edit, can_delete}]}` |
| `POST /comments` / `PATCH /comments/{id}` / `DELETE /comments/{id}` | see 11.2 | `{entity_type, entity_id, body, parent_id?, mentions?}` / `{body}` |
| `GET /revisions?entity_type&entity_id` | read | `{items: [{id, revision_no, changed_fields, change_reason, actor: {...}, created_at}]}` |
| `GET /revisions/{id}` | read | + `snapshot` |
| `GET /revisions/compare?from_id&to_id` | read | `{from, to, changes: [{field, before, after}]}` |
| `GET /entities/{entity_type}/{entity_id}` | read | `EntityRefDto` (used by kit components and the assistant) |

`EntityRefDto`: `{entity_type, entity_id, title, code, url, status, module, label_key}`.

### 11.4 Portal kit (`src/app/shared/kit/`, scope `kit`)

| Selector | Inputs / outputs |
|---|---|
| `<app-related-items>` | `entityType`, `entityId`, `canEdit = false`, `linkTypes?: readonly string[]`; picker uses `GET /search` |
| `<app-timeline>` | `entityType`, `entityId`, `includeAudit = false`; renders F3 timeline items with `label_key` (scoped keys loaded on demand) |
| `<app-revision-history>` | `entityType`, `entityId`, `fieldLabels?: Record<string, string>` (i18n keys); compare two revisions side by side |
| `<app-comments>` | `entityType`, `entityId`, `canComment = true`; @mention picker over org members |
| `<app-record-list-page>` | `titleKey`, `scope`, `page = 'list'`, `searchPlaceholderKey?`; outputs `search: string`; slots `[toolbar]`, `[filters]`, default (table/cards), `[empty]`; saved views in `localStorage` key `coreflow.views.<scope>.<page>` via `SavedViewsService` |
| `<app-record-detail-layout>` | `entityType`, `entityId`, `titleKey?`, `tabs = ['details','related','activity','comments','attachments']` (+ `'revisions'`, `'tasks'`); slots `[header]`, `[actions]`, default (details tab), `[aside]`, `[tasks]` (the module projects F2's `<app-entity-tasks>` there); renders the kit components for the other tabs and does not register page context (the module page does, with `providePageContext`) |

Plus `core/kit/kit-api.ts` (`KitApi` for links, comments, revisions, entities),
`core/entities/entity.models.ts` (`EntityRefDto`), and `<app-entity-chip [ref]>`.
`<app-attachments>` accepts any entity type string.

---

## 12. Module integration recipe (M01-M24)

Goal: a module branch touches **only its own files**. If you think you need to edit a
shared file, stop and report it as a contract addition instead.

### 12.1 Backend files (all new, under your module key)

```
app/modules/<key>/__init__.py           (docstring only)
app/modules/<key>/manifest.py           MODULES, ENTITY_TYPES, HOOKS  (imports only app.platform.registry)
app/modules/<key>/models.py             SQLAlchemy models (Base, TimestampMixin, org_id, deleted_at)
app/modules/<key>/schemas.py            Pydantic DTOs (from_attributes=True, NaiveUtcDatetime)
app/modules/<key>/service.py            business rules, resolvers, audit + events + revisions
app/modules/<key>/routes.py             APIRouter(prefix="/orgs/{org_id}/<portal-path>", tags=[...],
                                        dependencies=[require_module("<key>")])
app/modules/<key>/search.py             PROVIDERS: list[SearchProviderSpec]
app/modules/<key>/ai_tools.py           TOOLS = standard_record_tools(...) (+ extras)
app/modules/<key>/ai.py                 ASSISTS: list[AssistSpec]           (if the module has AI buttons)
app/modules/<key>/events.py             EVENT_KINDS: list[EventKindSpec]
app/modules/<key>/due.py                due provider (sync)                 (if records have due dates)
app/modules/<key>/demo.py               demo seeder                         (optional, see 12.4)
alembic/versions/cfNN_<slug>.py         your one migration (section 13)
tests/modules/__init__.py               empty (identical in every branch)
tests/modules/<key>/__init__.py         empty
tests/modules/<key>/test_<key>_*.py     tests (unique basenames)
```

Checklist:

1. `ModuleSpec`: key, `name_key="modules.names.<key>"`, `description_key`,
   `portal_path`, `depends_on` (only hard dependencies; optional integrations check
   `is_module_enabled` at runtime), `frameworks`, `permissions` (`<key>:read`,
   `<key>:write`, `<key>:manage` + specific ones), `role_grants` (sensible defaults:
   `member` read (+ write where staff register things), the owning manager role(s) all,
   `auditor` read), `clauses` (F7 declarations), `terms`. `default_enabled=False`.
2. Models: table names = entity types or `<key>_<name>`; UUID PKs; `org_id` FK
   CASCADE + index; `TimestampMixin`; `deleted_at` / `deleted_by` on every record table;
   naive UTC `DateTime`; status/enum columns as `String(n)` with values in Python
   `Literal`s; record-typed records (F4) carry `record_type_version_id`, `data JSONB`.
3. Service rules: every read filters `org_id` and `deleted_at IS NULL`; every mutation
   calls `audit.record(...)` (no free text in before/after; list free-text keys in
   `EntityTypeSpec.redacted_fields`), `registry.emit(...)` with `Recipients`, and for
   controlled records `revisions.record_revision(...)` (with the change reason).
   Assignable work uses `tasks.create_for(...)`; relationships use
   `links.link(...)`; owners/creators auto-watch (`events.watch`).
4. Resolver per entity type: `async def resolve_<type>(session, org_id, entity_id, caller, *, edit) -> EntityRef`
   (404 for missing/deleted/other org/invisible, 403 for edit without rights, `url` =
   portal path of the detail page).
5. Routes: thin; `CallerDep`; permission via `require_permission("<key>:read")` etc.
   Standard shapes: `GET /<things>?q&status&owner&sort&limit&offset -> {items, total}`,
   `POST`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` (soft, 204). Errors as
   `{"detail": {"code": "...", ...}}`.
6. Search provider, the four standard AI tools (`<key>_search`, `<key>_get`,
   `<key>_create_draft`, `<key>_summarise`; create is confirm-before-write), assists for
   the module's AI buttons, event kinds with scoped title keys (`"<portal-path>:notifications.<name>"`),
   due provider if records have due dates.
7. Migration with tables + permissions + role links (13.3).
8. Tests: service rules, permission denials, org isolation (a second org never sees or
   mutates), module disabled -> 404 `module_disabled`, API happy paths, audit rows
   written. Use `tests/platform_factories.py`; never hit the network or the LLM
   (monkeypatch `app.ai.assist.complete_text`). Run
   `cf-test.ps1 -Repo <worktree> -Database cf_<item>`.

### 12.2 Portal files (all yours)

```
src/app/features/<path>/<path>.routes.ts      REPLACE the F1 stub content (keep the default export)
src/app/features/<path>/**                    pages, components, data services
src/app/core/<path>/ (optional) or features/<path>/data/   API service + models
src/assets/i18n/<path>/en.json, nb.json       scoped translations (full parity)
src/assets/guidance/en/<path>.json, nb/<path>.json   guidance content (full parity)
src/app/features/<path>/<path>-i18n.spec.ts   parity spec using expectKeyParity
```

Checklist:

1. Routes file: `export default [ { path: '', providers: [provideTranslocoScope('<path>')], children: [...] } ] satisfies Routes;`
   with list, `new`, `:id`, `:id/edit` (and board/calendar where useful). Sub-pages that
   need write permission add `permissionGuard('<key>:write', { redirectTo: '/<path>' })`.
   `app.routes.ts` already wraps the module in `moduleGuard` + `permissionGuard('<key>:read')`.
2. Data service injects `ApiService`, paths `v1/orgs/${orgId}/<path>/...`; signals, no
   NgRx; zoneless-safe (no `setTimeout`-driven state without signals).
3. List page uses `<app-record-list-page>`; detail uses `<app-record-detail-layout>`
   (related items, timeline, comments, attachments, revisions, tasks);
   `<app-supports-requirements>` for clause evidence; `<app-watch-button>`.
4. Guidance on every page: `<app-guide-intro>`, `<app-why-it-matters>`,
   `<app-field-help>` on key fields, `<app-teaching-empty>` for empty lists, at least
   one `<app-lesson>` and one tour.
5. `providePageContext(() => ({ module: '<key>', entityType, entityId, view }))` on every
   page; AI buttons via `<app-ai-assist-button>`; `<app-ask-about>` on complex fields.
6. Strings only through the `transloco` pipe with the scope alias prefix
   (`'risk.list.title' | transloco`); dynamic values as params; terminology via
   `{{ term.risk }}`; no vendor or model names.
7. Tests (Vitest) for data services and key components; `npm run lint`, `npm test`,
   `npm run build` clean; `npx prettier --write <changed files>` (never `npm run format`).
8. Responsive (works at 375 px), keyboard accessible (focus order, Escape closes
   dialogs, labels on inputs).

### 12.3 Things a module never does

Edit `app.routes.ts`, `nav.ts`, global `en.json`/`nb.json`, `app/api/v1/router.py`,
`app/models/__init__.py`, `app/cli.py`, `celery_app.py`, `conftest.py`, another
module's package, `pyproject.toml`/`package.json`; add dependencies; create roles.
Exceptions: M03 edits the deviation files, M24 the document files, M23 the dashboard
feature (`features/dashboard/**`).

### 12.4 Demo data hook

Optional `app/modules/<key>/demo.py` with
`def seed(session: Session, *, org_id: uuid.UUID, user_ids: Mapping[str, uuid.UUID], today: date) -> None`
(sync, no commit; `user_ids` keyed by role key), registered as
`HOOKS[HOOK_DEMO_SEED] = ["app.modules.<key>.demo:seed"]`. The final `seed-demo` CLI calls
every registered seeder in module-key order after creating the demo org and users.

---

## 13. Migration rules

1. Exactly **one** migration per work item: `alembic/versions/cfNN_<slug>.py`,
   `revision = "<id from 1.1>"` (max 32 chars, it is stored in `alembic_version`).
2. `down_revision`: wave 0 uses `"cf15_deviation_event_kinds"` (the current head;
   `cf05_role_permissions` in the agent brief is outdated). Wave 1 uses the head of
   `origin/main` when the branch is created (`uv run alembic heads`). The integrator
   re-chains by editing only `down_revision` of not-yet-merged migrations, in merge order.
3. Migrations import only `alembic` and `sqlalchemy` (copy constants in; never import
   `app.*`). Implement `downgrade()`. Never drop data on upgrade.
4. Only the owner alters an existing table (section 3). Wave-0 migrations must not
   depend on each other's tables (FKs to F-item tables appear only in wave 1).
5. Permissions and role links live in the same migration (idempotent; mirrors
   `cf05_role_permissions`):

   ```python
   _PERMISSIONS = {"risk:read": "Read risks ...", "risk:write": "...", "risk:manage": "..."}
   _LINKS = (("admin", "risk:read"), ("admin", "risk:write"), ("member", "risk:read"))

   def _seed_permissions() -> None:
       perms = ", ".join(f"('{k}', '{v}')" for k, v in _PERMISSIONS.items())
       op.execute(sa.text(f"INSERT INTO permissions (key, description) VALUES {perms} "
                          "ON CONFLICT (key) DO NOTHING"))
       pairs = ", ".join(f"('{r}', '{p}')" for r, p in _LINKS)
       op.execute(sa.text(
           f"INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id "
           f"FROM (VALUES {pairs}) AS link(role_key, perm_key) "
           "JOIN roles r ON r.key = link.role_key JOIN permissions p ON p.key = link.perm_key "
           "ON CONFLICT (role_id, permission_id) DO NOTHING"))
   ```

   Descriptions must not contain single quotes. `admin` must be linked to every new
   permission. Downgrade deletes the links and the permissions.
6. Verify with the harness: `alembic upgrade head`, then
   `-Cmd "uv run alembic downgrade -1 && uv run alembic upgrade head"`.
7. Every model registered through `HOOK_MODELS` must have its table created by your
   migration: `tests/conftest.py` truncates every table in `Base.metadata` after each test,
   so a model without a migrated table makes the whole suite error.

---

## 14. Integrator checklist

- Merge order: kernel-bearing F branches in any order (kernel is identical), then wave 1
  in scope priority order. After each batch: re-chain Alembic to one head, union
  additive conflicts (settings routes, `org-settings` nav, any global i18n blocks),
  run the full backend suite (`-Database cf_int`) and portal lint/test/build.
- After wave 0, confirm on `main`: `registry.modules()` lists `documents`,
  `deviations`, `standards`, `tasks`; `seed-rbac` creates the three new roles; F1 route
  stubs exist for every module path; `tests/platform_factories.py` exists.
- Announce the wave-1 base head (`alembic heads`) to module agents.
- A branch that edits a file it does not own (section 3) is sent back unless the change
  is a trivially additive union.

---

## 15. Decisions taken (for the morning report)

1. **Verbatim kernel** (section 2) instead of one item owning the registry: every wave-0
   branch adds identical files and edits, so all eight can run in parallel without
   blocking on each other and without merge conflicts. Cross-item calls (events, module
   gate, entity resolution) go through kernel facades that become live when the owning
   item merges.
2. **Auto-discovery** of models, routers, Celery tasks, beat entries, permissions, AI
   tools, assists, search providers, event kinds, due providers and demo seeders through
   per-package `manifest.py` files, so wave-1 modules change no shared backend file.
3. **Portal pre-declaration by F1**: every module's nav item, route (with module and
   permission guards), nav label, module name and entity label are added once by F1, with
   stub route files that each module replaces. Modules keep their strings in Transloco
   scoped files and their guidance in their own files.
4. Unknown module keys count as **enabled** in the gate; new modules are
   **disabled by default** and turned on through the wizard or settings; the existing
   documents, deviations and standards modules are enabled by default and not gated
   until M03/M24.
5. Module disabled -> **404** `{"code": "module_disabled"}` (scope allowed 404/403).
6. In-app notifications are fanned out **inside the emitting transaction** (the
   `domain_event` table is the outbox/log); immediate emails go after commit, quiet hours
   fall back to the digest. No new worker for event delivery.
7. **No new dependencies** in this build (RRULE subset parser written in-house, no
   dateutil, no diff library) to keep `uv.lock`/`package-lock.json` conflict-free.
8. All AI writes become **confirm-before-write** (`ai_action` rows), including the
   existing deviation and document-access tools; AI-run module buttons use one generic
   assist endpoint and one LLM seam (`complete_text`) that tests monkeypatch.
9. Org default guidance level lives in F6's own `org_guidance` table (not on the F1
   profile) to avoid two items migrating one table; escalation leads are a new
   `departments.lead_user_id` owned by F3.
10. Change requests belong to M19, AI incidents are M03 deviations, GDPR breaches are
    M15 records, HSE risk assessments are M04 risks, meetings belong to M07.
11. Three new roles (`hse_manager`, `hr_manager`, `ai_officer`) created by F1 only.
12. The wizard's AI explanation reuses the Ask panel rather than a new endpoint, and the
    wizard is offered by a dashboard banner rather than a forced redirect.

/**
 * Process management (M02) DTOs. They mirror coreflow-core
 * `app/modules/processes/schemas.py` and `maps.py` (all under
 * `/api/v1/orgs/{org_id}/processes`). Datetimes are naive UTC ISO strings.
 */

export const PROCESS_CATEGORIES = ['management', 'core', 'support'] as const;
export type ProcessCategory = (typeof PROCESS_CATEGORIES)[number];

export const PROCESS_STATUSES = ['draft', 'active', 'retired'] as const;
export type ProcessStatus = (typeof PROCESS_STATUSES)[number];

export const PROCESS_SORTS = ['code', '-code', 'title', '-updated_at', 'next_review_at'] as const;
export type ProcessSort = (typeof PROCESS_SORTS)[number];

/** The turtle-diagram list fields (lists of short strings, max 50 items each). */
export const TURTLE_LIST_FIELDS = [
  'inputs',
  'outputs',
  'resources',
  'competence',
  'methods',
  'risks',
] as const;
export type TurtleListField = (typeof TURTLE_LIST_FIELDS)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface DepartmentRef {
  readonly id: string;
  readonly name: string | null;
}

export interface ProcessRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ProcessStatus;
  readonly category: ProcessCategory;
}

/** A linked document; without read access only `id` is set and `accessible` is false. */
export interface DocumentRef {
  readonly id: string;
  readonly title: string | null;
  readonly doc_code: string | null;
  readonly status: string | null;
  readonly url: string | null;
  readonly accessible: boolean;
}

export type InteractionDirection = 'outgoing' | 'incoming';

export interface Interaction {
  readonly id: string;
  readonly direction: InteractionDirection;
  readonly label: string | null;
  readonly process: ProcessRef;
  readonly created_at: string;
}

/**
 * A KPI definition of the process. `kpi_id` links the row to a KPI record in
 * "Mål og KPI-er", which holds the measured values (A05).
 */
export interface Kpi {
  readonly name: string;
  readonly target?: string | null;
  readonly unit?: string | null;
  readonly frequency?: string | null;
  readonly kpi_id?: string | null;
}

/** Framework keys a process can be tagged with (they narrow the suggested requirements). */
export const PROCESS_FRAMEWORKS = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso45001',
  'iso42001',
  'gdpr',
  'eu_ai_act',
  'nis2',
] as const;
export type ProcessFramework = (typeof PROCESS_FRAMEWORKS)[number];

/** The nine building blocks of a complete process, in display order. */
export const HEALTH_KEYS = [
  'owner',
  'purpose',
  'scope',
  'map',
  'description',
  'kpis',
  'risks',
  'requirements',
  'review',
] as const;
export type HealthKey = (typeof HEALTH_KEYS)[number];

export interface HealthItem {
  readonly key: HealthKey;
  readonly ok: boolean;
  /** Where it is fixed: edit | map | documents | turtle | requirements | review. */
  readonly fix: string;
}

/** Completeness checklist ("6 av 9 på plass"). */
export interface ProcessHealth {
  readonly done: number;
  readonly total: number;
  readonly items: readonly HealthItem[];
}

/** Live result of one KPI row, from the objectives KPI it is linked to. */
export interface KpiStatus {
  readonly index: number;
  readonly name: string;
  readonly kpi_id: string | null;
  readonly code?: string | null;
  readonly title?: string | null;
  readonly url?: string | null;
  readonly unit?: string | null;
  readonly target_value?: number | null;
  readonly latest_value?: number | null;
  readonly period_end?: string | null;
  /** on_track | at_risk | off_track | no_target; null = no data yet. */
  readonly status?: string | null;
  readonly trend?: readonly number[];
  readonly linked_by?: 'field' | 'link' | 'none';
}

/** An interested party (Context module) a process exchanges with. */
export interface PartyRef {
  readonly id: string;
  readonly name: string;
  readonly code?: string | null;
  readonly category?: string | null;
  readonly url?: string | null;
}

export interface PartyInteraction {
  readonly id: string;
  readonly direction: InteractionDirection;
  readonly label: string | null;
  readonly party: PartyRef;
  readonly created_at: string;
}

/** A record linked to the process (entity link or structural reference). */
export interface LinkedRecord {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code?: string | null;
  readonly url?: string | null;
  readonly status?: string | null;
  readonly module?: string | null;
  readonly label_key?: string | null;
  readonly link_type?: string | null;
  readonly link_id?: string | null;
  readonly level?: string | null;
  readonly score?: number | null;
  readonly owner?: UserRef | null;
}

/** Turtle legs that show linked records next to their free-text items. */
export const TURTLE_LEGS = [
  'inputs',
  'outputs',
  'resources',
  'competence',
  'methods',
  'kpis',
  'risks',
] as const;
export type TurtleLeg = (typeof TURTLE_LEGS)[number];

/** Record types a user may link to each turtle leg (mirrors the backend's LEG_TYPES). */
export const LEG_TYPES: Readonly<Record<TurtleLeg, readonly string[]>> = {
  inputs: ['supplier', 'contract'],
  outputs: ['customer_feedback', 'survey'],
  resources: ['asset', 'continuity_ict_system'],
  competence: ['position', 'competence', 'course'],
  methods: ['document', 'policy', 'external_document'],
  kpis: ['kpi', 'objective'],
  risks: ['risk', 'opportunity'],
};

export type TurtleLinked = Readonly<Partial<Record<TurtleLeg, readonly LinkedRecord[]>>>;

export const REVIEW_OUTCOMES = ['suitable', 'needs_change', 'not_effective'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

/** The review checklist questions (backend REVIEW_CHECKS). */
export const REVIEW_CHECKS = [
  'purpose',
  'kpis',
  'risks',
  'map',
  'description',
  'deviations',
  'interactions',
] as const;
export type ReviewCheckKey = (typeof REVIEW_CHECKS)[number];

export interface ReviewCheck {
  readonly key: string;
  readonly ok: boolean | null;
  readonly note?: string | null;
}

export interface ReviewAction {
  readonly id: string;
  readonly title: string;
  readonly status?: string | null;
  readonly due_at?: string | null;
  readonly url?: string | null;
}

/** A stored periodic review. */
export interface ProcessReview {
  readonly id: string;
  readonly reviewed_at: string;
  readonly reviewer: UserRef | null;
  readonly outcome: string;
  readonly notes: string | null;
  readonly checklist: readonly ReviewCheck[];
  readonly kpi_snapshot: readonly Partial<KpiStatus>[];
  readonly actions: readonly ReviewAction[];
  readonly next_review_at: string | null;
}

export interface ReviewList {
  readonly items: readonly ProcessReview[];
  readonly total: number;
}

/** One checklist question with what the live data says (`ok` null: can't tell). */
export interface ReviewPrefillItem {
  readonly key: string;
  readonly ok: boolean | null;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface ReviewPrefill {
  readonly checklist: readonly ReviewPrefillItem[];
  readonly kpis: readonly KpiStatus[];
  readonly risks: readonly LinkedRecord[];
  readonly open_deviations: number;
  readonly last_review: ProcessReview | null;
  readonly suggested_next_review_at: string | null;
}

// --- the process map --------------------------------------------------------------

export const MAP_NODE_TYPES = [
  'start',
  'end',
  'task',
  'decision',
  'subprocess',
  'document',
  'event',
] as const;
export type MapNodeType = (typeof MAP_NODE_TYPES)[number];

export const MAX_LANES = 30;
export const MAX_NODES = 300;
export const MAX_EDGES = 600;

export interface MapLane {
  readonly id: string;
  readonly label: string;
  readonly role_key?: string | null;
  readonly department_id?: string | null;
}

export interface MapNode {
  readonly id: string;
  readonly type: MapNodeType;
  readonly label: string;
  readonly description?: string | null;
  readonly lane_id?: string | null;
  readonly x: number;
  readonly y: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly document_id?: string | null;
  readonly process_id?: string | null;
}

export interface MapEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label?: string | null;
}

export interface ProcessMap {
  readonly lanes: readonly MapLane[];
  readonly nodes: readonly MapNode[];
  readonly edges: readonly MapEdge[];
}

// --- records ----------------------------------------------------------------------

export interface ProcessOut {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly purpose: string | null;
  readonly scope: string | null;
  readonly category: ProcessCategory;
  readonly status: ProcessStatus;
  readonly owner: UserRef | null;
  readonly department: DepartmentRef | null;
  readonly parent: ProcessRef | null;
  readonly review_interval_months: number | null;
  readonly next_review_at: string | null;
  readonly last_reviewed_at: string | null;
  readonly review_overdue: boolean;
  readonly description_document_id: string | null;
  readonly map_version: number;
  readonly step_count: number;
  readonly url: string;
  /** Framework keys the process serves (A05; absent on older servers). */
  readonly frameworks?: readonly string[];
  /** Completeness checklist (A05; absent on older servers). */
  readonly health?: ProcessHealth | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProcessDetail extends ProcessOut {
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly resources: readonly string[];
  readonly competence: readonly string[];
  readonly methods: readonly string[];
  readonly kpis: readonly Kpi[];
  readonly risks: readonly string[];
  readonly map: ProcessMap;
  readonly description_document: DocumentRef | null;
  readonly interactions: readonly Interaction[];
  readonly party_interactions?: readonly PartyInteraction[];
  readonly children: readonly ProcessRef[];
  readonly last_reviewed_by: UserRef | null;
  readonly last_review?: ProcessReview | null;
  readonly review_count?: number;
  readonly kpi_status?: readonly KpiStatus[];
  readonly can_edit: boolean;
  readonly can_manage: boolean;
}

export interface ProcessList {
  readonly items: readonly ProcessOut[];
  readonly total: number;
}

export interface ProcessListQuery {
  readonly q?: string;
  readonly status?: readonly ProcessStatus[];
  readonly category?: ProcessCategory;
  /** `me`, `none` (nobody owns it) or a user id. */
  readonly owner?: string;
  readonly department_id?: string;
  readonly parent_id?: string;
  readonly review_due?: boolean;
  readonly sort?: ProcessSort;
  readonly limit?: number;
  readonly offset?: number;
}

interface TurtleFieldsIn {
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly resources?: readonly string[];
  readonly competence?: readonly string[];
  readonly methods?: readonly string[];
  readonly kpis?: readonly Kpi[];
  readonly risks?: readonly string[];
  readonly frameworks?: readonly string[];
}

export interface CreateProcessRequest extends TurtleFieldsIn {
  readonly title: string;
  readonly code?: string | null;
  readonly purpose?: string | null;
  readonly scope?: string | null;
  readonly category?: ProcessCategory;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly parent_id?: string | null;
  readonly review_interval_months?: number | null;
  readonly next_review_at?: string | null;
  readonly map?: ProcessMap | null;
}

/** Partial update: only the fields sent change (`null` clears a nullable field). */
export interface UpdateProcessRequest extends TurtleFieldsIn {
  readonly title?: string;
  readonly code?: string;
  readonly purpose?: string | null;
  readonly scope?: string | null;
  readonly category?: ProcessCategory;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly parent_id?: string | null;
  readonly review_interval_months?: number | null;
  readonly next_review_at?: string | null;
  readonly change_reason?: string | null;
}

export interface ReviewActionRequest {
  readonly title: string;
  readonly assignee_user_id?: string | null;
  readonly due_at?: string | null;
}

export interface ReviewRequest {
  readonly notes?: string | null;
  readonly next_review_at?: string | null;
  readonly outcome?: ReviewOutcome;
  readonly checklist?: readonly ReviewCheck[];
  readonly actions?: readonly ReviewActionRequest[];
}

export interface CreatePartyInteractionRequest {
  readonly party_id: string;
  readonly direction: InteractionDirection;
  readonly label?: string | null;
}

export interface CreateInteractionRequest {
  readonly target_process_id: string;
  readonly label?: string | null;
  readonly direction: InteractionDirection;
}

export interface CreateDescriptionDocumentRequest {
  readonly title?: string | null;
  readonly doc_code?: string | null;
}

// --- diagrams ---------------------------------------------------------------------

export interface Turtle {
  readonly process: ProcessRef;
  readonly owner: UserRef | null;
  readonly purpose: string | null;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly resources: readonly string[];
  readonly competence: readonly string[];
  readonly methods: readonly string[];
  readonly procedures: readonly DocumentRef[];
  readonly kpis: readonly Kpi[];
  readonly risks: readonly string[];
  readonly kpi_status?: readonly KpiStatus[];
  /** Risk / opportunity records linked to the process, with level and owner. */
  readonly linked_risks: readonly LinkedRecord[];
  /** Linked records per turtle leg (A05). */
  readonly linked?: TurtleLinked;
  readonly upstream: readonly Interaction[];
  readonly downstream: readonly Interaction[];
  readonly upstream_parties?: readonly PartyInteraction[];
  readonly downstream_parties?: readonly PartyInteraction[];
}

export interface InteractionMapNode {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly category: ProcessCategory;
  readonly status: ProcessStatus;
  readonly owner: UserRef | null;
  readonly url: string;
}

export interface InteractionMapEdge {
  readonly id: string;
  readonly source_process_id: string;
  readonly target_process_id: string;
  readonly label: string | null;
}

export interface InteractionMapPartyEdge {
  readonly id: string;
  readonly process_id: string;
  readonly party_id: string;
  /** Read from the process: incoming = the party delivers to the process. */
  readonly direction: InteractionDirection;
  readonly label: string | null;
}

export interface InteractionMap {
  readonly nodes: readonly InteractionMapNode[];
  readonly edges: readonly InteractionMapEdge[];
  /** Interested parties as external start / end points (needs context:read). */
  readonly parties?: readonly PartyRef[];
  readonly party_edges?: readonly InteractionMapPartyEdge[];
}

/** `processes.draft_turtle` assist result (every field optional in practice). */
export interface TurtleDraft {
  readonly purpose?: string | null;
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly resources?: readonly string[];
  readonly competence?: readonly string[];
  readonly methods?: readonly string[];
  readonly kpis?: readonly Kpi[];
  readonly risks?: readonly string[];
}

export const PROCESS_ENTITY_TYPE = 'process';
export const PROCESS_MODULE = 'processes';

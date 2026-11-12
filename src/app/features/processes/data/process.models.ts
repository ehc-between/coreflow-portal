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

/** A KPI definition (measured values belong to the objectives module). */
export interface Kpi {
  readonly name: string;
  readonly target?: string | null;
  readonly unit?: string | null;
  readonly frequency?: string | null;
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
  readonly children: readonly ProcessRef[];
  readonly last_reviewed_by: UserRef | null;
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
  /** `me` or a user id. */
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

export interface ReviewRequest {
  readonly notes?: string | null;
  readonly next_review_at?: string | null;
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
  /** Entity links to risk records (M04) when readable; loosely typed. */
  readonly linked_risks: readonly Readonly<Record<string, unknown>>[];
  readonly upstream: readonly Interaction[];
  readonly downstream: readonly Interaction[];
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

export interface InteractionMap {
  readonly nodes: readonly InteractionMapNode[];
  readonly edges: readonly InteractionMapEdge[];
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

/** Årshjul API shapes (coreflow-core `app/platform/annual_cycle`, docs/ia-v2.md 6.3). */

export const YEAR_STATUSES = ['overdue', 'soon', 'not_planned', 'planned', 'recurring'] as const;
export type YearStatus = (typeof YEAR_STATUSES)[number];

/** Area filter chips, in prototype order (`null` = Alle). */
export const AREA_FILTERS = [
  'speakUp',
  'company',
  'people',
  'contacts',
  'handbook',
  'documents',
] as const;
export type AreaFilter = (typeof AREA_FILTERS)[number];

/** Every area an item can belong to (the filter list plus Årshjul itself). */
export const ITEM_AREAS = [...AREA_FILTERS, 'annual'] as const;

export const RECURRENCES = ['yearly', 'half_yearly', 'quarterly', 'monthly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const ACTION_LABELS = [
  'open',
  'openSupplier',
  'openContract',
  'openPlan',
  'seeBasis',
  'start',
  'remind',
  'nudge',
  'plan',
] as const;

export type MonthCounts = Readonly<Record<YearStatus, number>>;

export interface YearMonth {
  readonly month: string; // YYYY-MM
  readonly counts: MonthCounts;
}

export interface YearAction {
  readonly kind: 'open' | 'remind' | 'plan';
  /** `annual.actions.<label>` */
  readonly label_key: string;
  readonly url: string | null;
}

export interface YearItem {
  readonly id: string;
  readonly source: 'due' | 'recurrence' | 'gap';
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly title: string;
  readonly code: string | null;
  readonly area: string;
  readonly module: string;
  readonly kind: string;
  readonly month: string;
  readonly due_at: string;
  readonly days: number | null;
  readonly recurrence: string | null;
  readonly owner_name: string | null;
  readonly status: YearStatus;
  readonly detail: string | null;
  readonly action: YearAction;
  readonly requirement_refs: readonly string[];
}

export interface YearResponse {
  readonly from_month: string;
  readonly months: readonly YearMonth[];
  readonly items: readonly YearItem[];
  readonly truncated: boolean;
  readonly areas: readonly string[];
  readonly can_propose: boolean;
}

export interface YearQuery {
  readonly from?: string;
  readonly months?: number;
  readonly area?: string | null;
  readonly mine?: boolean;
}

export interface ProposalItem {
  readonly key: string;
  readonly title: string;
  readonly module: string;
  readonly area: string;
  readonly month: string;
  readonly recurrence: Recurrence;
  readonly owner_user_id: string | null;
  readonly rationale: string;
  readonly planned: boolean;
  readonly selected: boolean;
  readonly requirement_refs: readonly string[];
}

export interface Proposal {
  readonly year: number;
  readonly items: readonly ProposalItem[];
}

export interface AcceptItem {
  readonly key: string;
  readonly month: string;
  readonly recurrence?: Recurrence;
  readonly owner_user_id?: string | null;
}

export interface AcceptResponse {
  readonly created: readonly {
    readonly key: string;
    readonly entity_type: string;
    readonly id: string;
    readonly url: string;
  }[];
  readonly skipped: readonly string[];
}

export interface RemindResponse {
  readonly sent: boolean;
  readonly already: boolean;
  readonly recipient_name: string | null;
}

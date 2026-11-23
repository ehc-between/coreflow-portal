/** Håndbok DTOs (IA v2 §6.4): `GET /processes/handbook` and `GET /processes/{id}/handbook`. */

export type HandbookBand = 'management' | 'core' | 'support';
export const HANDBOOK_BANDS: readonly HandbookBand[] = ['management', 'core', 'support'];

export type HandbookDot = 'ok' | 'warn' | 'bad';
export const HANDBOOK_DOTS: readonly HandbookDot[] = ['ok', 'warn', 'bad'];

/** One process box on the process map. */
export interface HandbookBox {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly category: HandbookBand;
  readonly chain_order: number | null;
  readonly status: string;
  readonly owner: { readonly user_id: string; readonly name: string | null } | null;
  readonly procedure_count: number;
  /** Ids only: the procedures tab groups the readable documents by process. */
  readonly procedure_ids?: readonly string[];
  readonly dot: HandbookDot;
  /** open_case | review_overdue | review_soon | process_review | null */
  readonly dot_reason: string | null;
  readonly open_cases: number;
}

export interface HandbookMap {
  readonly management: readonly HandbookBox[];
  readonly core: readonly HandbookBox[];
  readonly support: readonly HandbookBox[];
}

export interface HandbookProcedure {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly type: string;
  readonly status: string | null;
  /** The approved revision letter. */
  readonly version: string | null;
  readonly approved_at: string | null;
  /** Share who confirmed reading it (only when read confirmation is required). */
  readonly read_pct: number | null;
  readonly review_overdue: boolean;
  readonly review_soon: boolean;
  readonly url: string | null;
}

export interface HandbookStep {
  readonly n: number;
  readonly node_id: string;
  readonly type: string | null;
  readonly label: string;
  readonly role: string | null;
  readonly document: HandbookProcedure | null;
}

export interface HandbookRisk {
  readonly id: string | null;
  readonly title: string;
  readonly code: string | null;
  readonly level: 'low' | 'medium' | 'high' | null;
  readonly url: string | null;
}

export interface HandbookKpi {
  readonly name: string;
  readonly value: number | null;
  readonly target: number | string | null;
  readonly unit: string | null;
  readonly status: string | null;
  readonly url: string | null;
}

export interface HandbookPage {
  readonly process: HandbookBox;
  readonly kind: HandbookBand;
  readonly purpose: string | null;
  readonly owner_name: string | null;
  readonly prev: { readonly id: string; readonly title: string } | null;
  readonly next: { readonly id: string; readonly title: string } | null;
  readonly is_first_core: boolean;
  readonly is_last_core: boolean;
  readonly steps: readonly HandbookStep[];
  readonly procedures: readonly HandbookProcedure[];
  readonly roles: readonly { readonly label: string; readonly role: string }[];
  readonly risks: readonly HandbookRisk[];
  readonly performance: {
    readonly kpis: readonly HandbookKpi[];
    readonly cases_12m: { readonly open: number; readonly closed: number };
  };
  readonly can_edit: boolean;
  readonly can_manage: boolean;
}

/** A row of `GET /documents?handbook=true` (as far as Håndbok needs it). */
export interface HandbookDocument {
  readonly id: string;
  readonly type: string;
  readonly type_name?: string | null;
  readonly title: string;
  readonly doc_code: string | null;
  readonly status: string;
  readonly current_rev: string | number | null;
  readonly owner_name?: string | null;
  readonly review_overdue?: boolean;
}

/**
 * U05 quick create ("Registrer") DTOs, mirroring coreflow-core
 * `app/platform/quick_create/schemas.py` (`/v1/orgs/{org_id}/quick-create`).
 */

export type QuickTypeKey =
  | 'deviation'
  | 'near_miss'
  | 'security_incident'
  | 'data_breach'
  | 'complaint'
  | 'improvement'
  | 'customer_feedback'
  | 'risk'
  | 'task'
  | 'document'
  | 'supplier';

export type QuickFieldKind = 'text' | 'textarea' | 'datetime' | 'date' | 'user' | 'select';

export interface QuickOption {
  readonly value: string;
  /** Only for org-defined options (document types); built-in ones are translated here. */
  readonly label: string | null;
}

export interface QuickField {
  readonly key: string;
  readonly kind: QuickFieldKind;
  readonly required: boolean;
  readonly options: readonly QuickOption[];
  readonly default: string | null;
  readonly max_length: number | null;
}

export interface QuickType {
  readonly key: QuickTypeKey;
  readonly group: 'incident' | 'common';
  readonly featured: boolean;
  readonly available: boolean;
  /** module_disabled | forbidden | type_inactive | unsupported_entity_type (null when available). */
  readonly reason: string | null;
  readonly entity_type: string | null;
  readonly module: string | null;
  readonly entity_label_key: string | null;
  readonly fields: readonly QuickField[];
  readonly next_step: string | null;
  readonly complete_fields: readonly string[];
}

export interface QuickTypeList {
  readonly items: readonly QuickType[];
}

/** The page the dialog was opened from: a record, or a standard requirement. */
export type QuickContext =
  | { readonly entity_type: string; readonly entity_id: string }
  | { readonly requirement_ref: string };

export interface QuickCreateRequest {
  readonly type: QuickTypeKey;
  readonly title: string;
  readonly description?: string | null;
  readonly occurred_at?: string | null;
  readonly owner_user_id?: string | null;
  readonly kind?: string | null;
  readonly customer_name?: string | null;
  readonly document_type?: string | null;
  readonly due_at?: string | null;
  readonly context?: QuickContext | null;
}

export interface QuickRecordRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly url: string | null;
  readonly status: string | null;
  readonly module: string | null;
  readonly label_key: string | null;
}

export interface QuickCreateResponse {
  readonly type: QuickTypeKey;
  readonly entity_type: string;
  readonly record: QuickRecordRef;
  readonly next_step: {
    readonly code: string;
    readonly deadline_at: string | null;
    readonly due_on: string | null;
  };
  readonly complete_fields: readonly string[];
  readonly context_link: {
    readonly kind: 'link' | 'requirement' | 'attached';
    readonly entity_type?: string | null;
    readonly entity_id?: string | null;
    readonly requirement_ref?: string | null;
  } | null;
}

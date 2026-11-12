/**
 * M24 document management DTOs (`/api/v1/orgs/{org}/…`, module `documents`),
 * mirroring `app/modules/documents/schemas.py` in coreflow-core. Datetimes are
 * naive-UTC ISO strings; dates are `YYYY-MM-DD`.
 */

/** A person reference `{id, name}`. */
export interface PersonRef {
  readonly id: string;
  readonly name: string | null;
}

/** `{items, total}` page of a list endpoint. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- document types ---------------------------------------------------------------

export interface DocumentType {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly numbering_prefix: string | null;
  readonly numbering_pattern: string | null;
  readonly numbering_enabled: boolean;
  readonly next_number: number;
  readonly next_code: string | null;
  readonly default_review_interval_months: number | null;
  readonly default_acknowledgement_required: boolean;
  readonly retention_rule_id: string | null;
  readonly active: boolean;
  readonly document_count: number;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface DocumentTypeCreate {
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly numbering_prefix?: string | null;
  readonly numbering_pattern?: string | null;
  readonly default_review_interval_months?: number | null;
  readonly default_acknowledgement_required?: boolean;
  readonly retention_rule_id?: string | null;
  readonly active?: boolean;
}

export interface DocumentTypeUpdate extends Partial<Omit<DocumentTypeCreate, 'key'>> {
  readonly next_number?: number | null;
  readonly change_reason?: string | null;
}

// --- templates ----------------------------------------------------------------------

export interface DocumentTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly document_type_id: string | null;
  readonly document_type_key: string | null;
  readonly document_type_name: string | null;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
  /** Only on `GET /document-templates/{id}`. */
  readonly content?: string | null;
}

export interface TemplateCreate {
  readonly name: string;
  readonly description?: string | null;
  readonly content: string;
  readonly document_type_id?: string | null;
}

export type TemplateUpdate = Partial<TemplateCreate>;

export interface DocumentFromTemplate {
  readonly title: string;
  readonly type?: string | null;
  readonly doc_code?: string | null;
  readonly owner_user_id?: string | null;
  readonly visibility?: 'organization' | 'restricted';
}

// --- retention rules ----------------------------------------------------------------

export const RETENTION_APPLIES_TO = ['document', 'external_document', 'record'] as const;
export type RetentionAppliesTo = (typeof RETENTION_APPLIES_TO)[number];
export const RETENTION_TRIGGERS = ['created', 'approved', 'obsoleted'] as const;
export type RetentionTrigger = (typeof RETENTION_TRIGGERS)[number];
export const RETENTION_DISPOSITIONS = ['destroy', 'archive', 'review'] as const;
export type RetentionDisposition = (typeof RETENTION_DISPOSITIONS)[number];

export interface RetentionRule {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly applies_to: RetentionAppliesTo;
  readonly retention_months: number;
  readonly trigger: RetentionTrigger;
  readonly disposition: RetentionDisposition;
  readonly legal_basis: string | null;
  readonly active: boolean;
  readonly usage_count: number;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface RetentionRuleCreate {
  readonly name: string;
  readonly description?: string | null;
  readonly applies_to: RetentionAppliesTo;
  readonly retention_months: number;
  readonly trigger: RetentionTrigger;
  readonly disposition: RetentionDisposition;
  readonly legal_basis?: string | null;
  readonly active: boolean;
}

export interface RetentionRuleUpdate extends Partial<RetentionRuleCreate> {
  readonly change_reason?: string | null;
}

export interface RuleRef {
  readonly id: string;
  readonly name: string;
  readonly disposition: RetentionDisposition;
}

export type ControlledKind = 'document' | 'external_document';

export interface RetentionDueItem {
  readonly kind: ControlledKind;
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly status: string;
  readonly retention_rule: RuleRef | null;
  readonly retention_until: string;
  readonly overdue: boolean;
  readonly url: string;
}

// --- external documents -------------------------------------------------------------

export const EXTERNAL_STATUSES = ['current', 'superseded', 'withdrawn'] as const;
export type ExternalStatus = (typeof EXTERNAL_STATUSES)[number];
export const EXTERNAL_SORTS = ['title', 'code', '-updated_at', 'next_review_at'] as const;
export type ExternalSort = (typeof EXTERNAL_SORTS)[number];

export interface ExternalDocument {
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly publisher: string | null;
  readonly reference: string | null;
  readonly version: string | null;
  /** The publisher's link (not the portal URL). */
  readonly url: string | null;
  readonly issued_on: string | null;
  readonly status: ExternalStatus;
  readonly status_changed_at: string | null;
  readonly document_type_id: string | null;
  readonly document_type_name: string | null;
  readonly owner: PersonRef | null;
  readonly review_interval_months: number | null;
  readonly next_review_at: string | null;
  readonly last_reviewed_at: string | null;
  readonly review_overdue: boolean;
  readonly retention_rule_id: string | null;
  readonly retention_rule_name: string | null;
  readonly notes: string | null;
  readonly portal_url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ExternalCreate {
  readonly title: string;
  readonly code?: string | null;
  readonly publisher?: string | null;
  readonly reference?: string | null;
  readonly version?: string | null;
  readonly url?: string | null;
  readonly issued_on?: string | null;
  readonly status?: ExternalStatus;
  readonly document_type_id?: string | null;
  readonly owner_user_id?: string | null;
  readonly review_interval_months?: number | null;
  readonly next_review_at?: string | null;
  readonly retention_rule_id?: string | null;
  readonly notes?: string | null;
}

export interface ExternalUpdate extends Partial<ExternalCreate> {
  readonly change_reason?: string | null;
}

export interface ExternalListQuery {
  readonly q?: string;
  readonly status?: readonly ExternalStatus[];
  readonly owner?: string;
  readonly review_due?: boolean;
  readonly sort?: ExternalSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- master document list -----------------------------------------------------------

export const REGISTER_SORTS = ['code', 'title', 'type', '-updated_at', 'next_review_at'] as const;
export type RegisterSort = (typeof REGISTER_SORTS)[number];

export interface RegisterItem {
  readonly kind: ControlledKind;
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly type: string | null;
  readonly type_name: string | null;
  readonly status: string;
  readonly revision: string | null;
  readonly approved_at: string | null;
  readonly owner: PersonRef | null;
  readonly next_review_at: string | null;
  readonly review_overdue: boolean;
  readonly acknowledgement_required: boolean;
  readonly open_campaigns: number;
  readonly retention_rule: RuleRef | null;
  readonly retention_until: string | null;
  readonly publisher: string | null;
  readonly updated_at: string;
  readonly url: string;
}

export interface RegisterQuery {
  readonly q?: string;
  readonly type?: string;
  readonly status?: string;
  readonly owner?: string;
  readonly review_due?: boolean;
  readonly include_external?: boolean;
  readonly sort?: RegisterSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- revision history / compare -----------------------------------------------------

export interface RevisionHistoryItem {
  readonly id: string;
  readonly rev: string;
  readonly status: string;
  readonly change_reason: string | null;
  readonly author: PersonRef | null;
  readonly submitted_by: PersonRef | null;
  readonly submitted_at: string | null;
  readonly approved_by: PersonRef | null;
  readonly approved_at: string | null;
  readonly created_at: string;
  readonly is_current_approved: boolean;
  readonly is_working: boolean;
}

export interface RevisionHistory {
  readonly document: { readonly id: string; readonly title: string; readonly code: string | null };
  /** Newest first. */
  readonly items: readonly RevisionHistoryItem[];
}

export type DiffOp = 'equal' | 'insert' | 'delete' | 'replace';

export interface DiffSegment {
  readonly op: Exclude<DiffOp, 'replace'>;
  readonly text: string;
}

export interface DiffBlock {
  readonly op: DiffOp;
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly segments?: readonly DiffSegment[] | null;
}

export interface DiffStats {
  readonly added_lines: number;
  readonly removed_lines: number;
  readonly changed_blocks: number;
  readonly identical: boolean;
  readonly similarity: number;
}

export interface RevisionCompare {
  readonly from: RevisionHistoryItem;
  readonly to: RevisionHistoryItem;
  readonly blocks: readonly DiffBlock[];
  readonly stats: DiffStats;
}

// --- campaigns ----------------------------------------------------------------------

export const CAMPAIGN_STATUSES = ['draft', 'active', 'completed', 'closed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const CAMPAIGN_SORTS = ['-created_at', 'due_at', 'title'] as const;
export type CampaignSort = (typeof CAMPAIGN_SORTS)[number];
export const AUDIENCE_TYPES = ['user', 'role', 'department', 'all'] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export interface AudienceEntry {
  readonly type: AudienceType;
  /** User id, role key or department id; absent for `all`. */
  readonly value?: string | null;
}

export interface CampaignStats {
  readonly total: number;
  readonly acknowledged: number;
  readonly pending: number;
  readonly overdue: number;
  readonly percent: number;
}

export interface CampaignRecipient {
  readonly user_id: string;
  readonly name: string | null;
  readonly notified_at: string | null;
  readonly acknowledged_at: string | null;
  readonly task_id: string | null;
  readonly overdue: boolean;
}

export interface Campaign {
  readonly id: string;
  readonly title: string;
  readonly message: string | null;
  readonly status: CampaignStatus;
  readonly require_acknowledgement: boolean;
  readonly audience: readonly AudienceEntry[];
  readonly due_at: string | null;
  readonly document: {
    readonly id: string;
    readonly title: string | null;
    readonly code: string | null;
    readonly status: string | null;
    readonly url: string;
  };
  readonly revision_id: string | null;
  readonly revision: string | null;
  readonly stats: CampaignStats;
  readonly launched_at: string | null;
  readonly launched_by: PersonRef | null;
  readonly completed_at: string | null;
  readonly closed_at: string | null;
  readonly created_by: PersonRef | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly url: string;
}

export interface CampaignDetail extends Campaign {
  readonly recipients: readonly CampaignRecipient[];
  /** People skipped (cannot read the document) on launch / add. */
  readonly skipped: number;
  readonly added?: number | null;
}

export interface CampaignCreate {
  readonly document_id: string;
  readonly title?: string | null;
  readonly message?: string | null;
  readonly require_acknowledgement: boolean;
  readonly audience: readonly AudienceEntry[];
  readonly due_at?: string | null;
  readonly launch?: boolean;
}

export interface CampaignUpdate {
  readonly title?: string;
  readonly message?: string | null;
  readonly require_acknowledgement?: boolean;
  readonly audience?: readonly AudienceEntry[];
  readonly due_at?: string | null;
}

export interface CampaignListQuery {
  readonly document_id?: string;
  readonly status?: readonly CampaignStatus[];
  readonly q?: string;
  readonly sort?: CampaignSort;
  readonly limit?: number;
  readonly offset?: number;
}

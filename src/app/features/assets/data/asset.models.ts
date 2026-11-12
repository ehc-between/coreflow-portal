/**
 * DTOs of the M19 assets module API (`/api/v1/orgs/{org}/assets`), mirroring the
 * backend schemas in `app/modules/assets/schemas.py`. Calendar dates are
 * `YYYY-MM-DD`; timestamps are naive UTC.
 */

export const ASSET_TYPES = [
  'information',
  'software',
  'hardware',
  'service',
  'people',
  'facility',
  'other',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const LEVELS = ['low', 'medium', 'high'] as const;
export type Level = (typeof LEVELS)[number];

export const CRITICALITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const LIFECYCLE_STATUSES = [
  'planned',
  'in_use',
  'maintenance',
  'retired',
  'disposed',
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const CALIBRATION_RESULTS = ['pass', 'adjusted', 'fail'] as const;
export type CalibrationResult = (typeof CALIBRATION_RESULTS)[number];

export const CALIBRATION_STATUSES = ['ok', 'due_soon', 'overdue', 'not_scheduled'] as const;
export type CalibrationStatus = (typeof CALIBRATION_STATUSES)[number];

export const ASSET_SORTS = [
  'code',
  '-code',
  'name',
  '-name',
  'next_calibration_due',
  '-next_calibration_due',
  '-updated_at',
  '-created_at',
] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

export const REVIEW_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const DECISIONS = ['pending', 'keep', 'revoke', 'modify'] as const;
export type Decision = (typeof DECISIONS)[number];

export const REVIEW_SORTS = [
  'due_on',
  '-due_on',
  'code',
  '-code',
  '-updated_at',
  '-created_at',
] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const CHANGE_TYPES = ['standard', 'normal', 'emergency'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_CATEGORIES = [
  'application',
  'infrastructure',
  'network',
  'security',
  'process',
  'document',
  'organisation',
  'facility',
  'supplier',
  'product',
  'other',
] as const;
export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const REVIEW_OUTCOMES = [
  'successful',
  'partially_successful',
  'failed',
  'rolled_back',
] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

/** Workflow states of the default change-request template (`change_request_default`). */
export const CHANGE_STATES = [
  'draft',
  'assessment',
  'approved',
  'implementing',
  'review',
  'closed',
  'rejected',
  'cancelled',
] as const;
export type ChangeState = (typeof CHANGE_STATES)[number];

export const CHANGE_SORTS = [
  '-updated_at',
  '-created_at',
  'code',
  '-code',
  'planned_start',
  '-planned_start',
] as const;
export type ChangeSort = (typeof CHANGE_SORTS)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface Items<T> {
  readonly items: readonly T[];
}

// --- assets ------------------------------------------------------------------------------

/** The editable fields of an asset (create body; PATCH accepts any subset). */
export interface AssetFields {
  readonly name: string;
  readonly asset_type: AssetType;
  readonly classification: Classification;
  readonly lifecycle_status: LifecycleStatus;
  readonly description: string | null;
  readonly category: string | null;
  readonly confidentiality: Level | null;
  readonly integrity: Level | null;
  readonly availability: Level | null;
  readonly criticality: Criticality | null;
  readonly owner_user_id: string | null;
  readonly custodian_user_id: string | null;
  readonly department_id: string | null;
  readonly location: string | null;
  readonly vendor: string | null;
  readonly model: string | null;
  readonly serial_number: string | null;
  readonly version: string | null;
  readonly contains_personal_data: boolean;
  readonly handling_rules: string | null;
  readonly acquired_on: string | null;
  readonly warranty_until: string | null;
  readonly end_of_life_on: string | null;
  readonly review_date: string | null;
  readonly retired_on: string | null;
  readonly disposed_on: string | null;
  readonly disposal_method: string | null;
  readonly requires_calibration: boolean;
  readonly calibration_interval_months: number | null;
  readonly measurement_range: string | null;
  readonly accuracy: string | null;
  readonly next_calibration_due: string | null;
  readonly notes: string | null;
}

export type CreateAssetRequest = Partial<AssetFields> & {
  readonly name: string;
  readonly last_calibrated_on?: string | null;
};

export type UpdateAssetRequest = Partial<AssetFields> & { readonly change_reason?: string | null };

export interface Asset extends AssetFields {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly owner: UserRef | null;
  readonly custodian: UserRef | null;
  readonly last_calibrated_on: string | null;
  readonly calibration_status: CalibrationStatus | null;
  readonly url: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AssetDetail extends Asset {
  readonly recent_calibrations: readonly Calibration[];
  readonly open_tasks: number;
}

export interface AssetListQuery {
  readonly q?: string;
  readonly type?: readonly AssetType[];
  readonly classification?: readonly Classification[];
  readonly lifecycle?: readonly LifecycleStatus[];
  readonly owner?: string;
  readonly department_id?: string;
  readonly requires_calibration?: boolean;
  readonly calibration_due_within_days?: number;
  readonly contains_personal_data?: boolean;
  readonly sort?: AssetSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface Calibration {
  readonly id: string;
  readonly asset_id: string;
  readonly performed_on: string;
  readonly performed_by: string | null;
  readonly certificate_number: string | null;
  readonly result: CalibrationResult;
  readonly notes: string | null;
  readonly impact_assessment: string | null;
  readonly needs_impact_assessment: boolean;
  readonly next_due_on: string | null;
  readonly created_by: UserRef | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CalibrationRequest {
  readonly performed_on: string;
  readonly result: CalibrationResult;
  readonly performed_by?: string | null;
  readonly certificate_number?: string | null;
  readonly notes?: string | null;
  readonly impact_assessment?: string | null;
  readonly next_due_on?: string | null;
}

// --- access reviews ----------------------------------------------------------------------

export interface SystemAssetRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly url: string;
}

export interface ReviewCounts {
  readonly total: number;
  readonly pending: number;
  readonly keep: number;
  readonly revoke: number;
  readonly modify: number;
  readonly unremediated: number;
}

export interface AccessReview {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly title: string;
  readonly status: ReviewStatus;
  readonly system_asset: SystemAssetRef | null;
  readonly system_name: string | null;
  readonly scope: string | null;
  readonly reviewer: UserRef | null;
  readonly due_on: string;
  readonly overdue: boolean;
  readonly frequency_months: number | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly completed_by: UserRef | null;
  readonly attestation: string | null;
  readonly task_id: string | null;
  readonly previous_review_id: string | null;
  readonly next_review_id: string | null;
  readonly counts: ReviewCounts;
  readonly url: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReviewItem {
  readonly id: string;
  readonly review_id: string;
  readonly subject_name: string;
  readonly subject_user: UserRef | null;
  readonly account: string | null;
  readonly access_level: string | null;
  readonly decision: Decision;
  readonly note: string | null;
  readonly decided_by: UserRef | null;
  readonly decided_at: string | null;
  readonly remediated_at: string | null;
  readonly remediated_by: UserRef | null;
  readonly position: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AccessReviewDetail extends AccessReview {
  readonly items: readonly ReviewItem[];
  readonly can_work: boolean;
  readonly can_manage: boolean;
}

export interface ReviewItemInput {
  readonly subject_name: string;
  readonly subject_user_id?: string | null;
  readonly account?: string | null;
  readonly access_level?: string | null;
}

export interface ReviewItemUpdate {
  readonly subject_name?: string;
  readonly subject_user_id?: string | null;
  readonly account?: string | null;
  readonly access_level?: string | null;
  readonly decision?: Decision;
  readonly note?: string | null;
  readonly remediated?: boolean;
}

export interface AccessReviewFields {
  readonly title: string | null;
  readonly system_asset_id: string | null;
  readonly system_name: string | null;
  readonly scope: string | null;
  readonly reviewer_user_id: string;
  readonly due_on: string;
  readonly frequency_months: number | null;
}

export type CreateAccessReviewRequest = AccessReviewFields & {
  readonly items?: readonly ReviewItemInput[];
};

export type UpdateAccessReviewRequest = Partial<AccessReviewFields>;

export interface AccessReviewListQuery {
  readonly q?: string;
  readonly status?: readonly ReviewStatus[];
  readonly reviewer?: string;
  readonly system_asset_id?: string;
  readonly due_within_days?: number;
  readonly sort?: ReviewSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- change requests ---------------------------------------------------------------------

export interface ChangeFields {
  readonly title: string;
  readonly change_type: ChangeType;
  readonly category: ChangeCategory;
  readonly description: string | null;
  readonly reason: string | null;
  readonly impact_assessment: string | null;
  readonly risk_level: RiskLevel | null;
  readonly risk_assessment: string | null;
  readonly implementation_plan: string | null;
  readonly rollback_plan: string | null;
  readonly planned_start: string | null;
  readonly planned_end: string | null;
  readonly owner_user_id: string | null;
  readonly department_id: string | null;
}

export type CreateChangeRequest = Partial<ChangeFields> & {
  readonly title: string;
  readonly asset_ids?: readonly string[];
};

export type UpdateChangeRequest = Partial<ChangeFields> & {
  readonly implemented_at?: string | null;
  readonly review_outcome?: ReviewOutcome | null;
  readonly review_notes?: string | null;
  readonly change_reason?: string | null;
};

/** A localized label as the workflow engine returns it (`{en, nb}` or a plain string). */
export type LocalizedLabel = Readonly<Record<string, string>> | string;

export interface ChangeRequest extends ChangeFields {
  readonly id: string;
  readonly org_id: string;
  readonly code: string;
  readonly implemented_at: string | null;
  readonly review_outcome: ReviewOutcome | null;
  readonly review_notes: string | null;
  readonly owner: UserRef | null;
  readonly requested_by: UserRef | null;
  readonly status: string;
  readonly status_label: LocalizedLabel;
  readonly status_category: string;
  readonly pending_approval: boolean;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ChangeWorkflowSummary {
  readonly state: string;
  readonly label: LocalizedLabel;
  readonly category: string;
  readonly state_entered_at: string | null;
  readonly sla_due_at: string | null;
  readonly closed_at: string | null;
  readonly pending_approval: boolean;
}

export interface AssetRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly url: string;
}

export interface ChangeDetail extends ChangeRequest {
  readonly workflow: ChangeWorkflowSummary;
  readonly locked_fields: readonly string[];
  readonly closed: boolean;
  readonly data: Readonly<Record<string, unknown>>;
  readonly affected_assets: readonly AssetRef[];
  readonly open_tasks: number;
}

export interface ChangeListQuery {
  readonly q?: string;
  readonly status?: readonly string[];
  readonly open?: boolean;
  readonly type?: ChangeType;
  readonly category?: readonly ChangeCategory[];
  readonly risk_level?: readonly RiskLevel[];
  readonly owner?: string;
  readonly asset_id?: string;
  readonly sort?: ChangeSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- assists -----------------------------------------------------------------------------

export interface ControlSuggestion {
  readonly ref: string;
  readonly title?: string | null;
  readonly reason?: string | null;
}

/** Result of the `assets.suggest_classification` assist. */
export interface ClassificationSuggestion {
  readonly asset_type?: AssetType | null;
  readonly classification: Classification;
  readonly confidentiality?: Level | null;
  readonly integrity?: Level | null;
  readonly availability?: Level | null;
  readonly criticality?: Criticality | null;
  readonly contains_personal_data?: boolean | null;
  readonly handling_rules?: string | null;
  readonly rationale?: string | null;
  readonly controls?: readonly ControlSuggestion[];
}

/** Result of the `assets.assess_change` assist. */
export interface ChangeAssessmentSuggestion {
  readonly risk_level: RiskLevel;
  readonly impact_assessment: string;
  readonly risk_assessment?: string | null;
  readonly rollback_plan?: string | null;
  readonly suggested_change_type?: ChangeType | null;
  readonly affected_areas?: readonly string[];
  readonly controls?: readonly ControlSuggestion[];
}

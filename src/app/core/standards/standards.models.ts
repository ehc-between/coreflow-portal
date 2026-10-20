/**
 * ISO & standards DTOs, mirroring coreflow-core's standards module. Every
 * endpoint lives under `v1/orgs/{org_id}`.
 */

/** A text available in both supported languages (our own explanation copy). */
export interface LocalizedText {
  readonly en: string;
  readonly nb: string;
}

/** Coverage status of a single requirement. */
export type RequirementStatus = 'covered' | 'partial' | 'not_started' | 'not_applicable';

/** Coverage counts for a whole standard (overview). */
export interface StandardCompleteness {
  readonly applicable: number;
  readonly covered: number;
  readonly partial: number;
  readonly not_started: number;
  readonly not_applicable: number;
  /** 0–100. */
  readonly pct: number;
}

/** A row of `GET standards`: a catalogue standard and the org's state for it. */
export interface StandardSummary {
  readonly key: string;
  readonly name: string;
  readonly edition: string;
  readonly enabled: boolean;
  /** The org's enablement record (null until first enabled) — owns the licensed PDF. */
  readonly org_standard_id: string | null;
  readonly has_licensed_text: boolean;
  readonly completeness: StandardCompleteness;
}

/** Coverage roll-up for a clause subtree. */
export interface ClauseRollup {
  readonly applicable: number;
  readonly covered: number;
  readonly partial: number;
  readonly not_started: number;
  /** 0–100. */
  readonly pct: number;
}

/** Statuses a manual override can set (not-applicable goes through `applicable`). */
export type CoverageOverride = Exclude<RequirementStatus, 'not_applicable'>;

export type ClauseKind = 'clause' | 'annex_control';

/** A requirement inside the clause tree. */
export interface Requirement {
  /** Stable requirement reference (unique across standards). */
  readonly ref: string;
  readonly text: LocalizedText;
  readonly evidence_examples: LocalizedText;
  readonly status: RequirementStatus;
  readonly applicable: boolean;
  readonly justification: string | null;
  /** Confirmed evidence links. */
  readonly confirmed_links: readonly RequirementLink[];
  /** AI suggestions awaiting review. */
  readonly suggested_links: readonly RequirementLink[];
  /** Manual status override (null = derived from confirmed links) and its note. */
  readonly status_override: CoverageOverride | null;
  readonly note: string | null;
}

/** A node of `GET standards/{key}/tree`. */
export interface ClauseNode {
  readonly number: string;
  readonly title: string;
  readonly kind: ClauseKind;
  /** Annex A control theme (e.g. "organizational"); null for regular clauses. */
  readonly theme: string | null;
  /** Our own explanation; may be empty. */
  readonly summary: LocalizedText | null;
  readonly rollup: ClauseRollup;
  readonly children: readonly ClauseNode[];
  readonly requirements: readonly Requirement[];
}

/** Requirement in the clause detail, carrying every link (any status, incl. rejected). */
export interface RequirementDetail extends Requirement {
  readonly links: readonly RequirementLink[];
}

/** `GET standards/{key}/clauses/{number}`. */
export interface ClauseDetail extends Omit<ClauseNode, 'requirements'> {
  /** The org's own copy of the clause text (from their licensed PDF), or null. */
  readonly licensed_text: string | null;
  readonly requirements: readonly RequirementDetail[];
}

/** Body of `PATCH standard-requirements/{ref}` — only the fields present change. */
export interface RequirementPatch {
  readonly applicable?: boolean;
  readonly justification?: string | null;
  /** null clears the override (back to the computed status). */
  readonly status_override?: CoverageOverride | null;
  readonly note?: string | null;
}

/** Record kinds a requirement link can point at. */
export type LinkEntityType = 'document' | 'deviation' | 'deviation_action' | 'attachment';

export type LinkStatus = 'suggested' | 'confirmed' | 'rejected';

export type LinkSource = 'ai' | 'user';

/** Evidence link between a requirement and a record. */
export interface RequirementLink {
  readonly id: string;
  readonly requirement_ref: string;
  readonly standard_key: string;
  readonly clause_number: string;
  readonly entity_type: LinkEntityType;
  readonly entity_id: string;
  /** Display label of the linked record (null if it no longer resolves). */
  readonly entity_label: string | null;
  readonly status: LinkStatus;
  readonly source: LinkSource;
  /** 0–1, AI suggestions only. */
  readonly confidence?: number | null;
  readonly rationale?: string | null;
  readonly created_at: string;
  readonly confirmed_by_name?: string | null;
}

/** Query for `GET requirement-links` — by requirement, or by record. */
export type RequirementLinkQuery =
  | { readonly requirement_ref: string }
  | { readonly entity_type: LinkEntityType; readonly entity_id: string };

/** Body of `POST requirement-links`. */
export interface CreateRequirementLinkRequest {
  readonly requirement_ref: string;
  readonly entity_type: LinkEntityType;
  readonly entity_id: string;
}

/** `{job_id}` returned when a background job is queued. */
export interface StandardJobStarted {
  readonly job_id: string;
}

export type StandardJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type StandardJobKind = 'ai_map' | 'extract_text';

/** `GET standard-jobs/{id}`. */
export interface StandardJob {
  readonly id: string;
  readonly kind: StandardJobKind;
  readonly status: StandardJobStatus;
  /** 0–100. */
  readonly progress: number;
  readonly suggestions_created: number;
  readonly error?: string | null;
}

/**
 * ISO & standards DTOs, mirroring coreflow-core's standards module. Every
 * endpoint lives under `v1/orgs/{org_id}`.
 */

/** A text available in both supported languages (our own explanation copy). */
export interface LocalizedText {
  readonly en: string;
  readonly nb: string;
}

/** Per-language lists (e.g. typical evidence); a language may be missing. */
export type LocalizedList = Readonly<Partial<Record<'en' | 'nb', readonly string[]>>>;

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
  /**
   * The latest whole-standard AI mapping run, or null when the org's existing
   * records have never been mapped to this standard.
   */
  readonly last_mapping?: StandardMapping | null;
  /** Platform framework key (`iso9001`, `gdpr`, …); null outside the framework list. */
  readonly framework?: string | null;
  /** ISO standard or EU regulation. */
  readonly kind?: StandardKind;
}

/** Whether a catalogue entry is an ISO standard or an EU regulation. */
export type StandardKind = 'standard' | 'regulation';

/** Summary of the latest whole-standard AI mapping run (`last_mapping`). */
export interface StandardMapping {
  readonly job_id: string;
  readonly status: StandardJobStatus;
  /** ISO timestamp; null while queued / running. */
  readonly finished_at: string | null;
  readonly suggestions_created: number;
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

export type ClauseKind = 'clause' | 'annex_control' | 'article' | 'recital' | 'annex';

/** Extra catalogue facts on a clause (EU AI Act: the roles and risk classes it applies to). */
export interface ClauseMeta {
  readonly roles?: readonly string[];
  readonly risk_classes?: readonly string[];
}

/** A requirement inside the clause tree. */
export interface Requirement {
  /**
   * Opaque, standard-qualified requirement reference ("<standard key>:<ref>",
   * e.g. "iso27001-2022:A.8.13.r1"). Always sent back exactly as received.
   */
  readonly ref: string;
  readonly text: LocalizedText;
  /** Typical evidence, one item per entry. */
  readonly evidence_examples: LocalizedList | null;
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
  /** Clause title — our own Norwegian translation, falling back to English. */
  readonly title: LocalizedText;
  readonly kind: ClauseKind;
  /** Annex A control theme (e.g. "organizational"); null for regular clauses. */
  readonly theme: string | null;
  /** Our own explanation; may be empty. */
  readonly summary: LocalizedText | null;
  /** Our own implementation guidance, when the catalogue has any. */
  readonly guidance: LocalizedText | null;
  /** The Harmonised Structure clause this clause implements ("6.1"), shared across ISO standards. */
  readonly hs?: string | null;
  readonly meta?: ClauseMeta | null;
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

/** The record kinds with built-in evidence handling. */
export type BuiltinLinkEntityType = 'document' | 'deviation' | 'deviation_action' | 'attachment';

/**
 * Record kinds a requirement link can point at: the built-in ones plus any
 * linkable entity type a module registers (`^[a-z][a-z0-9_]{0,31}$`).
 */
export type LinkEntityType = string;

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
  /**
   * Display label of the linked record (null if it no longer resolves). For
   * deviations this is the code only, never the title.
   */
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

export type StandardJobKind = 'ai_map' | 'extract_text' | 'ai_draft';

/** What an AI mapping job covers. */
export type StandardJobScope = 'standard' | 'document' | 'requirement';

/** Body of `POST standards/{key}/ai-map`: the whole standard, one document or one requirement. */
export interface AiMapTarget {
  readonly document_id?: string;
  readonly requirement_ref?: string;
}

/** `GET standard-jobs/{id}`. */
export interface StandardJob {
  readonly id: string;
  readonly kind: StandardJobKind;
  readonly status: StandardJobStatus;
  /** 0–100. */
  readonly progress: number;
  readonly suggestions_created: number;
  readonly error?: string | null;
  /** AI mapping jobs only. */
  readonly scope?: StandardJobScope | null;
  /** Requirement-scoped `ai_map` and `ai_draft` jobs. */
  readonly requirement_ref?: string | null;
  /** `ai_draft` jobs: the drafted proposal, once done. */
  readonly proposal_id?: string | null;
}

/** A document cited by the requirement guidance stream. */
export interface GuidanceSource {
  readonly id: string;
  readonly title: string;
  readonly doc_code?: string | null;
}

/**
 * A parsed event of `POST standard-requirements/{ref}/ai-help` (SSE), plus the
 * synthetic `not-configured` event the stream client maps a 503 to.
 */
export type GuidanceEvent =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'sources'; readonly sources: readonly GuidanceSource[] }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'not-configured' };

// --- Frameworks (cross-framework catalogue, mappings, readiness) ------------------

/** A row of `GET frameworks`: one framework of the catalogue and the org's state for it. */
export interface FrameworkSummary {
  readonly framework: string;
  readonly standard_key: string;
  readonly name: string;
  readonly kind: StandardKind;
  readonly enabled: boolean;
  /** Whether the framework is among the frameworks in the organisation profile. */
  readonly in_profile: boolean;
  /** 0–100 for an enabled framework, else null. */
  readonly readiness: number | null;
}

/** A row of `GET frameworks/readiness` (one per enabled standard). */
export interface FrameworkReadiness {
  readonly framework: string | null;
  readonly standard_key: string;
  readonly applicable: number;
  readonly covered: number;
  readonly partial: number;
  /** Covered requirements whose evidence is recent (within 365 days). */
  readonly fresh: number;
  /** 0–100. */
  readonly score: number;
}

export type MappingRelation = 'equivalent' | 'related' | 'supports';

/** `GET standards/{key}/clauses/{number}/mappings`: a clause elsewhere this clause maps to. */
export interface ClauseMappingItem {
  readonly relation: MappingRelation;
  readonly standard_key: string;
  readonly framework: string | null;
  readonly number: string;
  readonly title: LocalizedText;
  readonly note: LocalizedText | null;
  /** `hs` = derived from the shared Harmonised Structure; `curated` = a mapping we maintain. */
  readonly source: 'hs' | 'curated';
}

/** A module whose records can evidence a clause. */
export interface ModuleSupport {
  readonly key: string;
  readonly entity_types: readonly string[];
  readonly enabled: boolean;
}

/** `GET clause-support?ref=`. */
export interface ClauseSupport {
  readonly ref: string;
  readonly modules: readonly ModuleSupport[];
}

/** A requirement a record could evidence (`GET evidence-suggestions`). */
export interface EvidenceSuggestion {
  /** Qualified requirement ref ("iso9001-2026:7.5.1.r1"). */
  readonly ref: string;
  readonly standard_key: string;
  /** Clause number. */
  readonly number: string;
  /** Clause title in English, and our Norwegian title. */
  readonly title: string;
  readonly title_nb: string | null;
  readonly text: Partial<LocalizedText>;
  /** Status of an existing link between the record and this requirement, if any. */
  readonly link_status: LinkStatus | null;
}

export interface EvidenceSuggestions {
  readonly requirements: readonly EvidenceSuggestion[];
}

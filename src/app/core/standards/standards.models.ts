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

/** How an act is named in the UI: ISO standard, EU regulation or EU directive (NIS2). */
export type LegalForm = 'standard' | 'regulation' | 'directive';

/**
 * May requirements of a clause be marked not applicable? ISO clauses 4–10 never
 * (`not_allowed`); ISO 9001 clause 8 only when the scope (4.3) justifies it
 * (`conditional`); Annex A controls, EU acts and custom catalogues always.
 */
export type ExclusionRule = 'allowed' | 'not_allowed' | 'conditional';

/** Confirmed evidence is recent (< 1 year), older, or only weak documents. */
export type EvidenceState = 'fresh' | 'stale' | 'weak';

/**
 * A linked document as evidence: approved and current, a draft, past its review
 * date, or obsolete. The last three are weak evidence (they count as partial).
 */
export type EvidenceQuality = 'current' | 'draft' | 'review_overdue' | 'obsolete';

/** A member referenced by id with their display name. */
export interface UserRef {
  readonly id: string;
  readonly name?: string | null;
}

/** The framework's certification from the audits module (audits readers only). */
export interface CertificationInfo {
  readonly id: string;
  readonly status: string;
  readonly certification_body: string;
  readonly certificate_number?: string | null;
  readonly issued_at?: string | null;
  readonly expires_at?: string | null;
  readonly next_surveillance_at?: string | null;
  readonly url: string;
}

/** A risk treated by an Annex A control (from its SoA entry). */
export interface SoaRisk {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly url: string;
}

/**
 * The control's Statement of Applicability entry (risk module): the single source
 * of applicability and justification for ISO 27001 / 42001 Annex A controls.
 * Present only when the SoA exists and the user may read the risk module.
 */
export interface SoaInfo {
  readonly id: string;
  readonly applicable: boolean;
  readonly implementation_status: string;
  readonly justification?: string | null;
  readonly inclusion_reasons?: readonly string[];
  readonly implementation_notes?: string | null;
  readonly owner?: UserRef | null;
  readonly reviewed_at?: string | null;
  readonly risks?: readonly SoaRisk[];
  readonly treatment_count?: number;
  /** Portal path of the entry in the SoA. */
  readonly url: string;
}

export interface AuditPlanRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly date?: string | null;
  readonly url: string;
}

export interface AuditFindingRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly finding_type: string;
  readonly status: string;
  readonly plan_code?: string | null;
  readonly url: string;
}

/** What the audits module says about a clause (audits readers only). */
export interface ClauseAuditFacts {
  readonly last_audited_at?: string | null;
  readonly next_audit_at?: string | null;
  readonly plans?: readonly AuditPlanRef[];
  readonly open_findings?: readonly AuditFindingRef[];
  readonly open_findings_count?: number;
  readonly open_nc_count?: number;
}

/** A row of `GET standards`: a catalogue standard and the org's state for it. */
export interface StandardSummary {
  readonly key: string;
  readonly name: string;
  /** Our own Norwegian name ("Personvernforordningen (GDPR)"); older backends omit it. */
  readonly name_nb?: string | null;
  /** Short name per language ("ISO 27001", "KI-forordningen"). */
  readonly short_name?: LocalizedText | null;
  /** NIS2 is a directive; older backends omit it (see `kind`). */
  readonly legal_form?: LegalForm;
  /**
   * THE headline number of the standard (weighted; equals the readiness score).
   * Null when the standard is not enabled; older backends omit it.
   */
  readonly score?: number | null;
  readonly certification?: CertificationInfo | null;
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

/**
 * Extra catalogue facts on a clause or requirement (EU AI Act: the roles and
 * risk classes it applies to and, for Art. 50, the transparency triggers).
 */
export interface ClauseMeta {
  readonly roles?: readonly string[];
  readonly risk_classes?: readonly string[];
  readonly transparency?: readonly string[];
}

/**
 * Where a requirement's effective applicability comes from: the org's own
 * decision (`manual`), the EU AI Act derivation from the org's AI systems
 * (`derived`), or the plain default (applicable).
 */
export type ApplicabilitySource = 'manual' | 'derived' | 'default';

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
  /** Effective applicability: the org's decision, else the derived value, else true. */
  readonly applicable: boolean;
  /** Who answers for the requirement (A03; older backends omit the auditor fields). */
  readonly owner?: UserRef | null;
  /** Target date, YYYY-MM-DD. */
  readonly due_date?: string | null;
  readonly reviewed_at?: string | null;
  readonly reviewed_by?: UserRef | null;
  /** Who set the manual status override, and when. */
  readonly override_by?: UserRef | null;
  readonly override_at?: string | null;
  /** The record that set the applicability (e.g. the SoA entry); null when set by hand. */
  readonly applicability_set_by?: {
    readonly entity_type: string;
    readonly entity_id: string;
  } | null;
  /** May the requirement be marked not applicable? */
  readonly exclusion?: ExclusionRule;
  /** Freshness of the confirmed evidence; null when nothing is linked. */
  readonly evidence_state?: EvidenceState | null;
  /** Every confirmed link is a weak document (the status is then `partial`). */
  readonly weak_evidence?: boolean;
  /** Annex A controls: the control's SoA entry (the same for every requirement of it). */
  readonly soa?: SoaInfo | null;
  /** Missing on older payloads (see `applicabilitySource()`). */
  readonly applicability_source?: ApplicabilitySource;
  /** EU AI Act: the applicability derived from the org's AI systems, even when overridden. */
  readonly derived_applicable?: boolean | null;
  /** EU AI Act: why the point is (not) applicable according to the derivation. */
  readonly derived_reason?: LocalizedText | null;
  /** EU AI Act: the roles, risk classes and transparency triggers of this point. */
  readonly meta?: ClauseMeta | null;
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
  /** The number as shown per language ("Kapittel II", "Art. 21 nr. 2 bokstav d"). */
  readonly label?: LocalizedText | null;
  /** URL slug of the number ("chapter-ii"); the clause endpoint and the route accept it. */
  readonly slug?: string | null;
  readonly exclusion?: ExclusionRule;
  /** Annex A controls: the control's SoA entry. */
  readonly soa?: SoaInfo | null;
  /** Audit plans citing the clause and its open findings (audits readers only). */
  readonly audit?: ClauseAuditFacts | null;
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
  /**
   * The org's applicability decision; `null` clears it (back to the default or,
   * for the EU AI Act, to the value derived from the org's AI systems).
   */
  readonly applicable?: boolean | null;
  readonly justification?: string | null;
  /** null clears the override (back to the computed status). */
  readonly status_override?: CoverageOverride | null;
  readonly note?: string | null;
  /** The member who answers for the requirement; null clears. */
  readonly owner_user_id?: string | null;
  /** Target date (YYYY-MM-DD); null clears. */
  readonly due_date?: string | null;
  /** `true` stamps "reviewed by me, now". */
  readonly reviewed?: boolean;
}

/** The record kinds with built-in evidence handling. */
export type BuiltinLinkEntityType = 'document' | 'deviation' | 'deviation_action' | 'attachment';

/**
 * Record kinds a requirement link can point at: the built-in ones plus any
 * linkable entity type a module registers (`^[a-z][a-z0-9_]{0,31}$`).
 */
export type LinkEntityType = string;

export type LinkStatus = 'suggested' | 'confirmed' | 'rejected';

/** Who wrote the link: an AI suggestion, a user, or platform code (fields, declarations). */
export type LinkSource = 'ai' | 'user' | 'system';

/**
 * Why a link exists (P1): typed by a user (`manual`), an AI suggestion, a record
 * field that cites the clause (`field`), the record type's declarations, a
 * create-from-here flow, or other platform code.
 */
export type LinkOrigin = 'manual' | 'ai' | 'field' | 'declaration' | 'flow' | 'system';

/**
 * How a requirement is shown everywhere (P1, plan 2.1): "<short> · <number>",
 * with the clause title in the request language as subtitle or tooltip, and
 * "(krav 2 av 3)" when the clause has several requirements. The raw `.rN` ref
 * is never shown.
 */
export interface RequirementLabel {
  readonly ref: string;
  /** "ISO 27001", "GDPR", "KI-forordningen" (request language). */
  readonly short: string;
  readonly number: string;
  /** Clause title in the request language. */
  readonly title: string;
  /** Requirement text in the request language (may be empty). */
  readonly text?: string;
  readonly standard_key: string;
  readonly framework?: string | null;
  /** 1-based position of the requirement within its clause. */
  readonly req_index: number;
  readonly req_count: number;
}

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
  /** Why the link exists (older backends omit it: treat as `manual`). */
  readonly origin?: LinkOrigin;
  /** For `origin: 'field'`: the record field citing the requirement (e.g. `control_refs`). */
  readonly origin_field?: string | null;
  /** Display label in the request language (list endpoint only; null elsewhere). */
  readonly label?: RequirementLabel | null;
  /** 0–1, AI suggestions only. */
  readonly confidence?: number | null;
  readonly rationale?: string | null;
  readonly created_at: string;
  readonly confirmed_by_name?: string | null;
  readonly confirmed_at?: string | null;
  /** A03: the record behind the link: its page, status, code and module. */
  readonly entity_url?: string | null;
  readonly entity_status?: string | null;
  readonly entity_code?: string | null;
  readonly module?: string | null;
  /** Documents only: how good the evidence is, and the version in force. */
  readonly evidence_quality?: EvidenceQuality | null;
  readonly document_version?: string | null;
  readonly document_approved_at?: string | null;
  readonly document_next_review_at?: string | null;
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
  /** `ai` when accepting an assistant proposal, `flow` for create-from-here. Default `manual`. */
  readonly origin?: 'manual' | 'ai' | 'flow';
}

/** Confirmed / suggested requirement counts of one record (list rows). */
export interface RequirementCoverageCounts {
  readonly confirmed: number;
  readonly suggested: number;
}

/** `GET requirement-coverage?entity_type&ids` (zeros for ids without links). */
export interface RequirementCoverageResponse {
  readonly items: Readonly<Record<string, RequirementCoverageCounts>>;
}

/** One entry of "Foreslåtte krav" (`POST requirement-links/suggest`). */
export interface RequirementSuggestion {
  readonly ref: string;
  readonly label: RequirementLabel | null;
  readonly status: 'suggested';
  /** `ai` (stored suggestion) or `declaration` (virtual: the type usually evidences it). */
  readonly origin: LinkOrigin;
  /** The stored link, or null for a virtual suggestion (confirm it through bulk `items`). */
  readonly link_id: string | null;
  readonly confidence?: number | null;
  readonly rationale?: string | null;
}

export interface SuggestRequirementsResponse {
  /** The queued (or reused) AI `record_map` job when AI is configured, else null. */
  readonly job_id: string | null;
  readonly suggestions: readonly RequirementSuggestion[];
}

/** A virtual suggestion to confirm or reject in bulk. */
export interface BulkLinkItem {
  readonly requirement_ref: string;
  readonly entity_type: LinkEntityType;
  readonly entity_id: string;
}

/** `POST requirement-links/bulk` (≤200 ids and ≤200 items; all or nothing). */
export interface BulkLinksRequest {
  readonly action: 'confirm' | 'reject';
  readonly ids?: readonly string[];
  readonly items?: readonly BulkLinkItem[];
}

export interface BulkLinksResponse {
  readonly updated: number;
}

/** `{job_id}` returned when a background job is queued. */
export interface StandardJobStarted {
  readonly job_id: string;
}

export type StandardJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type StandardJobKind = 'ai_map' | 'extract_text' | 'ai_draft' | 'record_map';

/** What an AI mapping job covers. */
export type StandardJobScope = 'standard' | 'document' | 'requirement' | 'record';

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
  /** `record_map` jobs: the record whose requirements are suggested. */
  readonly entity_type?: string | null;
  readonly entity_id?: string | null;
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
  /** EU AI Act: points left out as not applicable (derived) from the org's AI systems. */
  readonly derived_not_applicable?: number;
  /** Covered requirements per evidence origin (a requirement counts under each origin it has). */
  readonly by_origin?: Readonly<Partial<Record<LinkOrigin, number>>>;
  /** Covered requirements per record type (`risk`, `document`, …). */
  readonly by_entity_type?: Readonly<Record<string, number>>;
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

// --- Requirements everywhere (P1): evidence, gaps, catalogue -------------------

/** The record behind an evidence link (the registry's `EntityRefDto`). */
export interface EvidenceEntity {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  /** Portal path of the record's page, or null when it has none. */
  readonly url: string | null;
  readonly status: string | null;
  readonly module: string | null;
  /** Global i18n key of the record type's name (`modules.entities.<type>`). */
  readonly label_key: string | null;
}

/** One link of `GET standard-requirements/{ref}/evidence`. */
export interface EvidenceLink {
  readonly id: string;
  readonly status: LinkStatus;
  readonly origin: LinkOrigin;
  readonly origin_field: string | null;
  readonly confidence: number | null;
  readonly rationale: string | null;
  readonly entity: EvidenceEntity;
  /** Documents only: how good the evidence is, and the version in force. */
  readonly evidence_quality?: EvidenceQuality | null;
  readonly document_version?: string | null;
  readonly document_approved_at?: string | null;
}

export interface ModuleCount {
  readonly module: string;
  readonly count: number;
}

/** A record type whose declarations cover a requirement ("Kan dokumenteres med"). */
export interface EvidencingType {
  readonly module: string;
  readonly entity_type: string;
  readonly label_key: string;
  /** New-record route plus `?fromRequirement=<ref>`, or null for sub-records. */
  readonly create_url: string | null;
  /** The module is enabled for the org. */
  readonly enabled: boolean;
  /** Enabled, has a create page, and the caller may create records of this type. */
  readonly can_create?: boolean;
  /** Live records of the type the caller can see (null when unknown). */
  readonly record_count?: number | null;
  /** The type's register page. */
  readonly list_url?: string | null;
}

export interface EvidenceRequirementInfo {
  readonly ref: string;
  readonly label: RequirementLabel | null;
  readonly text: Partial<LocalizedText>;
  readonly evidence_examples: LocalizedList | null;
  readonly clause_number: string;
  readonly clause_title: LocalizedText;
  readonly standard_key: string;
  readonly framework: string | null;
  readonly applicable: boolean;
  readonly justification: string | null;
  readonly owner?: UserRef | null;
  readonly due_date?: string | null;
  readonly reviewed_at?: string | null;
  readonly reviewed_by?: UserRef | null;
  readonly exclusion?: ExclusionRule;
  readonly evidence_state?: EvidenceState | null;
  readonly soa?: SoaInfo | null;
}

/** `GET standard-requirements/{ref}/evidence`: evidence from every module. */
export interface RequirementEvidence {
  readonly requirement: EvidenceRequirementInfo;
  readonly status: RequirementStatus;
  /** Only records the caller may read. */
  readonly links: readonly EvidenceLink[];
  /** Confirmed links per module. */
  readonly by_module: readonly ModuleCount[];
  readonly can_be_evidenced_by: readonly EvidencingType[];
  readonly mappings: readonly ClauseMappingItem[];
  /** Audit plans citing the clause and its open findings (audits readers only). */
  readonly audit?: ClauseAuditFacts | null;
}

// --- A03: bulk evidence actions and export ----------------------------------------

/** Body of `POST standards/{key}/clauses/{number}/links`. */
export interface ClauseLinkRequest {
  readonly entity_type: LinkEntityType;
  readonly entity_id: string;
  /** Requirements of the clause the record does not evidence (opt-out). */
  readonly exclude_refs?: readonly string[];
}

export interface ClauseLinkResponse {
  readonly linked: number;
  readonly refs: readonly string[];
}

export interface ReuseEvidenceResponse {
  readonly suggested: number;
  readonly records: number;
}

export interface SuggestFromRecordsResponse {
  readonly created: number;
  readonly records_checked: number;
  readonly by_type: Readonly<Record<string, number>>;
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

/** One uncovered requirement of `GET frameworks/gaps`. */
export interface RequirementGap {
  readonly ref: string;
  readonly number: string;
  readonly title: string;
  readonly text: string;
  /** Top-level chapter ("8", "A.8", "30"). */
  readonly chapter: string;
  readonly status: 'not_started' | 'partial';
  readonly label: RequirementLabel | null;
  readonly fix_in: readonly EvidencingType[];
}

export interface GapsResponse {
  readonly total: number;
  readonly items: readonly RequirementGap[];
}

/** Query of `GET frameworks/gaps`. */
export interface GapsQuery {
  readonly chapter?: string | null;
  readonly limit?: number;
  readonly offset?: number;
}

/** A clause of the whole catalogue (`GET requirement-catalogue`), for pickers. */
export interface CatalogueClause {
  /** Canonical clause ref (`iso27001:A.8.13`): the value to store in record fields. */
  readonly clause_ref: string;
  readonly number: string;
  /** Title in the request language. */
  readonly title: string;
  readonly title_en: string;
  readonly title_nb: string;
  readonly kind: ClauseKind;
  readonly short: string;
  readonly standard_key: string;
  readonly framework: string;
  readonly requirement_count: number;
  /** The standard is enabled for the org (only enabled standards produce links). */
  readonly enabled: boolean;
}

/**
 * A plain clause title (`GET requirement-catalogue/titles`, simplify U39): beginners see
 * "Kompetanse" instead of "Felles ISO-krav · 7.2". When `found` is false all titles are
 * empty and the portal shows `short · number`.
 */
export interface ClauseTitle {
  /** Canonical `<framework>:<number>` (`hs:7.2`, `iso27001:A.6.3`). */
  readonly clause_ref: string;
  readonly framework: string;
  readonly number: string;
  /** "ISO 27001", "GDPR", "Felles ISO-krav". */
  readonly short: string;
  /** Title in the request language. */
  readonly title: string;
  readonly title_en: string;
  readonly title_nb: string;
  readonly found: boolean;
}

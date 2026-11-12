/**
 * DTOs for the org module registry, org profile, terminology and setup wizard
 * (`/api/v1/orgs/{org_id}/modules|profile|terminology|setup`). Mirrors the
 * backend schemas in `app/platform/modules/schemas.py` (snake_case on the wire).
 */

/** Framework keys the backend accepts (`registry.FRAMEWORK_KEYS`), in display order. */
export const FRAMEWORK_KEYS = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
  'gdpr',
  'eu_ai_act',
  'nis2',
] as const;
export type FrameworkKey = (typeof FRAMEWORK_KEYS)[number];

export const SIZE_BANDS = ['1-10', '11-50', '51-250', '251-1000', '1000+'] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];

export const AI_ACT_ROLES = ['provider', 'deployer', 'both', 'none', 'unknown'] as const;
export type AiActRole = (typeof AI_ACT_ROLES)[number];

export const CERTIFICATION_STATUSES = ['planned', 'in_progress', 'certified'] as const;
export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

/** Terminology languages the backend accepts. */
export const TERM_LANGS = ['en', 'nb'] as const;
export type TermLang = (typeof TERM_LANGS)[number];

/** One module in `GET /modules` (sorted by key). */
export interface OrgModule {
  readonly key: string;
  /** Global i18n key, `modules.names.<key>`. */
  readonly name_key: string;
  /** Global i18n key, `modules.descriptions.<key>`. */
  readonly description_key: string;
  readonly portal_path: string | null;
  readonly enabled: boolean;
  readonly always_on: boolean;
  readonly depends_on: readonly string[];
  readonly frameworks: readonly string[];
  /** Keys of enabled modules that depend on this one. */
  readonly required_by: readonly string[];
}

export interface Site {
  readonly name: string;
  /** ISO 3166 alpha-2. */
  readonly country: string;
  readonly city?: string | null;
  readonly kind?: string | null;
}

export interface CertificationTarget {
  readonly framework: string;
  /** `YYYY-MM-DD`. */
  readonly target_date?: string | null;
  readonly certification_body?: string | null;
  readonly status: CertificationStatus;
}

/** The editable fields (`PUT /profile`). */
export interface OrgProfileUpdate {
  readonly industry: string | null;
  readonly size_band: SizeBand | null;
  readonly countries: readonly string[];
  readonly sites: readonly Site[];
  readonly frameworks: readonly string[];
  readonly certification_targets: readonly CertificationTarget[];
  readonly ai_act_role: AiActRole;
  readonly description: string | null;
}

/** `GET /profile`: defaults with null timestamps before the first save. */
export interface OrgProfile extends OrgProfileUpdate {
  readonly org_id: string;
  readonly setup_step: string | null;
  readonly setup_completed_at: string | null;
  readonly updated_by: string | null;
  readonly created_at: string | null;
  readonly updated_at: string | null;
}

export interface TermForms {
  readonly one: string;
  readonly other: string;
}

/** Per-language override of one term; languages without a value are omitted. */
export type TermOverride = Partial<Record<TermLang, TermForms>>;

export type TermOverrides = Readonly<Record<string, TermOverride>>;

/** `GET /terminology`. */
export interface Terminology {
  readonly terms: TermOverrides;
  readonly term_keys: readonly string[];
}

/** `GET /setup`, `PUT /setup/step`. */
export interface SetupState {
  readonly completed_at: string | null;
  readonly step: string | null;
}

export interface RecommendationsRequest {
  readonly frameworks: readonly string[];
  readonly industry?: string | null;
  readonly size_band?: SizeBand | null;
}

export interface ModuleRecommendation {
  readonly key: string;
  readonly recommended: boolean;
  /** Global i18n key, `modules.reasons.<key>`. */
  readonly reason_key: string;
  readonly frameworks: readonly string[];
}

export interface RecommendationsResponse {
  readonly modules: readonly ModuleRecommendation[];
}

export interface CompleteSetupRequest {
  readonly modules: readonly string[];
  readonly step?: string;
}

export interface CompleteSetupResponse {
  /** Every module on afterwards (requested + dependencies), sorted. */
  readonly enabled: readonly string[];
  readonly completed_at: string;
}

/** Error bodies (`{"detail": {...}}`) the module endpoints return. */
export type ModuleErrorDetail =
  | { readonly code: 'unknown_module'; readonly module: string }
  | { readonly code: 'module_always_on'; readonly module: string }
  | {
      readonly code: 'module_dependency_disabled';
      readonly module: string;
      readonly missing: readonly string[];
    }
  | {
      readonly code: 'module_required_by';
      readonly module: string;
      readonly modules: readonly string[];
    }
  | { readonly code: 'unknown_modules'; readonly modules: readonly string[] }
  | { readonly code: 'unknown_term'; readonly terms: readonly string[] }
  | { readonly code: 'module_disabled'; readonly module: string };

/** The default (empty) profile, used before the first load. */
export function emptyProfile(orgId: string): OrgProfile {
  return {
    org_id: orgId,
    industry: null,
    size_band: null,
    countries: [],
    sites: [],
    frameworks: [],
    certification_targets: [],
    ai_act_role: 'unknown',
    description: null,
    setup_step: null,
    setup_completed_at: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
  };
}

/** The editable subset of a profile (read-only fields dropped). */
export function toProfileUpdate(profile: OrgProfileUpdate): OrgProfileUpdate {
  return {
    industry: profile.industry,
    size_band: profile.size_band,
    countries: profile.countries,
    sites: profile.sites,
    frameworks: profile.frameworks,
    certification_targets: profile.certification_targets,
    ai_act_role: profile.ai_act_role,
    description: profile.description,
  };
}

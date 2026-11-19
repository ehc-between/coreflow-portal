/**
 * The output platform (U11, "Dokumenter og rapporter"): the named documents and
 * exports CoreFlow builds from the data the organisation entered. Mirrors the
 * backend DTOs in `app/platform/outputs/schemas.py`. Titles, descriptions and
 * clause labels arrive as `{en, nb}`; preflight labels and messages arrive
 * already rendered in the request language.
 */

/** Who a document is for. The library groups outputs by the first audience. */
export const OUTPUT_AUDIENCES = [
  'auditor',
  'authority',
  'customers',
  'board',
  'employees',
] as const;
export type OutputAudience = (typeof OUTPUT_AUDIENCES)[number];

/** The closed vocabulary of output types (outputs.md section 5.2). */
export const OUTPUT_KINDS = [
  'register_export',
  'record_report',
  'compiled_controlled',
  'pack',
  'public',
] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export const OUTPUT_FORMATS = ['pdf', 'docx', 'xlsx', 'csv'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const OUTPUT_LANGS = ['nb', 'en'] as const;
export type OutputLang = (typeof OUTPUT_LANGS)[number];

/** What an output is about: the whole org, one standard, or one record. */
export type OutputSubject = 'org' | 'standard' | 'record';

/** `{en, nb}` text from the API. */
export type LocalizedText = Readonly<Record<string, string>>;

export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}

export interface ClauseLabel {
  /** `framework:number`, e.g. `gdpr:30`. */
  readonly ref: string;
  readonly framework: string;
  readonly number: string;
  readonly label: LocalizedText;
}

export interface OutputReadiness {
  readonly ready: boolean;
  /** Required checks not met. */
  readonly missing: number;
  /** Recommended checks not met. */
  readonly recommended: number;
}

/** The newest generated file of an output (for the subject asked about). */
export interface LastGenerated {
  readonly id: string;
  readonly version: number;
  readonly status: 'final' | 'draft' | string;
  readonly format: string;
  readonly lang: string;
  readonly generated_at: string;
  readonly generated_by: UserRef | null;
  readonly has_gaps: boolean;
  readonly url: string;
  readonly download_url: string;
}

/** One output in the catalogue (`GET outputs`). */
export interface Output {
  readonly key: string;
  readonly module: string;
  readonly kind: OutputKind | string;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly audience: readonly string[];
  readonly clauses: readonly ClauseLabel[];
  readonly permission: string;
  readonly formats: readonly string[];
  readonly default_format: string | null;
  readonly subject: OutputSubject | string;
  readonly entity_type: string | null;
  readonly frameworks: readonly string[];
  readonly evidence: boolean;
  /** Outputs made in their own flow (e.g. `/reports/audit-packs`). */
  readonly route: string | null;
  readonly register_key: string | null;
  readonly has_preflight: boolean;
  /** False for own-flow outputs: they cannot be generated here. */
  readonly generates: boolean;
  /** Null until the subject is known (standard_key / entity_id). */
  readonly readiness: OutputReadiness | null;
  readonly last: LastGenerated | null;
}

export interface OutputList {
  readonly items: readonly Output[];
  readonly audiences: readonly string[];
  readonly kinds: readonly string[];
}

/** Filters for `GET outputs`. */
export interface OutputQuery {
  readonly module?: string | null;
  readonly standard_key?: string | null;
  readonly audience?: string | null;
  readonly kind?: string | null;
  readonly entity_type?: string | null;
  readonly entity_id?: string | null;
  readonly readiness?: boolean;
  readonly lang?: string | null;
}

/** The subject and (register exports) list filters of one generation. */
export interface OutputParams {
  readonly standard_key?: string | null;
  readonly entity_id?: string | null;
  readonly filters?: Readonly<Record<string, unknown>>;
}

export interface PreflightRequest extends OutputParams {
  readonly lang?: OutputLang | null;
}

export interface GenerateRequest extends OutputParams {
  readonly format?: OutputFormat | string | null;
  readonly lang?: OutputLang | null;
  /** "Lag likevel": the gaps are listed and marked in the file. */
  readonly accept_gaps?: boolean;
}

export interface PreflightSample {
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly url: string | null;
}

export type PreflightSeverity = 'required' | 'recommended';

export interface PreflightItem {
  readonly key: string;
  readonly label: string;
  readonly severity: PreflightSeverity | string;
  readonly met: boolean;
  readonly outcome: string;
  readonly message: string;
  /** Where to fix it. */
  readonly url: string | null;
  readonly counts: Readonly<Record<string, number>>;
  readonly samples: readonly PreflightSample[];
}

export interface PreflightResult {
  readonly output_key: string;
  readonly lang: string;
  readonly ready: boolean;
  readonly missing: number;
  readonly recommended: number;
  readonly items: readonly PreflightItem[];
}

/** A preflight check as stored on a generated file. */
export interface StoredPreflightItem {
  readonly key: string;
  readonly label: string;
  readonly severity: string;
  readonly met: boolean;
  readonly outcome: string | null;
  readonly message: string | null;
  readonly url: string | null;
}

/** One stored, immutable generated file. */
export interface GeneratedOutput {
  readonly id: string;
  readonly output_key: string;
  readonly output_title: LocalizedText | null;
  readonly module: string;
  readonly kind: string;
  readonly title: string;
  readonly version: number;
  readonly status: 'final' | 'draft' | string;
  readonly origin: 'user' | 'ai' | string;
  readonly format: string;
  readonly lang: string;
  readonly file_name: string;
  readonly size_bytes: number;
  readonly sha256: string;
  readonly rows: number;
  readonly standard_key: string | null;
  readonly subject_type: string | null;
  readonly subject_id: string | null;
  readonly params: Readonly<Record<string, unknown>>;
  readonly preflight: readonly StoredPreflightItem[];
  readonly has_gaps: boolean;
  readonly ai_draft: boolean;
  readonly clauses: readonly ClauseLabel[];
  /** The clauses this file is evidence for (newest final file without gaps). */
  readonly evidence_for: readonly ClauseLabel[];
  readonly current: boolean;
  readonly superseded_at: string | null;
  readonly generated_at: string;
  readonly generated_by: UserRef | null;
  /** Portal link, `/library/generated/{id}`. */
  readonly url: string;
  readonly download_url: string;
}

export interface GeneratedList {
  readonly items: readonly GeneratedOutput[];
  readonly total: number;
}

export interface GeneratedQuery {
  readonly output_key?: string | null;
  readonly module?: string | null;
  readonly standard_key?: string | null;
  readonly entity_type?: string | null;
  readonly entity_id?: string | null;
  /** Only the current (not superseded) versions. */
  readonly current?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface SourceCheck {
  readonly id: string;
  /** The source data changed since the file was made: offer a new version. */
  readonly changed: boolean;
  readonly checked_at: string;
  readonly latest_version: number;
}

export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** Org branding applied to every generated PDF / Word file (Settings → Branding). */
export interface Branding {
  readonly accent_color: string | null;
  readonly footer_text: string | null;
  readonly classification: Classification | string | null;
  readonly default_lang: OutputLang | string | null;
  readonly has_logo: boolean;
  readonly logo_url: string | null;
  readonly classifications: readonly string[];
  readonly default_accent: string;
  readonly updated_at: string | null;
}

/** PATCH body: only the sent fields change; `null` clears one. */
export interface BrandingUpdate {
  readonly accent_color?: string | null;
  readonly footer_text?: string | null;
  readonly classification?: Classification | null;
  readonly default_lang?: OutputLang | null;
}

/** Logo limits enforced by the backend (422 `unsupported_logo_type`, 413 `logo_too_large`). */
export const LOGO_TYPES = ['image/png', 'image/jpeg'] as const;
export const LOGO_MAX_BYTES = 512 * 1024;
export const FOOTER_MAX_LENGTH = 200;

/** Portal link of a generated file (matches the backend's `url`). */
export function generatedLink(id: string): string {
  return `/library/generated/${id}`;
}

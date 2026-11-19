/**
 * Starter setup ("Kom i gang med et forslag"): the review list a provider returns from
 * `POST v1/orgs/{org}/starter-setup/{key}/ai-proposals` (SSE `result` event) and the
 * accept call. Nothing is saved until the user accepts a selection.
 */

export type StarterFieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'bool'
  | 'tags'
  | 'exclusions'
  | 'lookup'
  | 'raci';

export interface StarterField {
  readonly name: string;
  readonly kind: StarterFieldKind;
  readonly options: readonly string[];
  readonly option_set: string | null;
  readonly required: boolean;
}

export interface StarterExclusion {
  clause: string;
  justification: string;
}

export interface StarterItem {
  readonly key: string;
  readonly group: string;
  readonly why: string;
  readonly hints?: readonly string[];
  readonly fields: Record<string, unknown>;
}

export interface StarterContextSummary {
  readonly industry: string | null;
  readonly size_band: string | null;
  readonly frameworks: readonly string[];
  readonly sites: number;
  readonly registers: Readonly<Record<string, number>>;
}

export type StarterSource = 'ai' | 'template';
export type StarterFallback = 'ai_unavailable' | 'ai_failed' | 'ai_empty' | null;

export interface StarterResult {
  readonly provider: string;
  readonly entity_type: string;
  readonly mode: 'records' | 'single';
  readonly group_set: string;
  readonly title_field: string;
  readonly fields: readonly StarterField[];
  readonly ai_available: boolean;
  readonly source: StarterSource;
  readonly fallback: StarterFallback;
  readonly header: Record<string, unknown> | null;
  readonly items: readonly StarterItem[];
  readonly skipped: readonly string[];
  readonly context: StarterContextSummary;
  readonly lookups?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export type StarterEvent =
  | { readonly type: 'status'; readonly text: string; readonly key?: string }
  | { readonly type: 'result'; readonly data: StarterResult }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'not-configured' };

export interface StarterCreated {
  readonly entity_type: string;
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly url: string | null;
}

export interface StarterAcceptResult {
  readonly created: readonly StarterCreated[];
  readonly skipped: readonly string[];
}

export interface StarterAcceptBody {
  readonly source: StarterSource;
  readonly items: readonly { readonly fields: Record<string, unknown> }[];
  readonly header?: Record<string, unknown> | null;
  readonly lang?: string;
}

/** `context.interested_parties` -> `context_interested_parties` (dots nest i18n keys). */
export function providerI18nKey(key: string): string {
  return key.replace(/\./g, '_');
}

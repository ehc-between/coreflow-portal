import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../core/http/error.interceptor';
import {
  ClauseLabel,
  LocalizedText,
  OUTPUT_AUDIENCES,
  Output,
  OutputLang,
  PreflightItem,
} from '../../core/outputs/outputs.models';

/** Transloco scope of the output components and the library (`assets/i18n/outputs`). */
export const OUTPUTS_SCOPE = 'outputs';

/** `{en, nb}` text in the given language, falling back to English, then any value. */
export function localized(text: LocalizedText | null | undefined, lang: string): string {
  if (!text) {
    return '';
  }
  return text[lang] || text['en'] || Object.values(text)[0] || '';
}

/** The document language to preselect: the UI language when it is one we generate in. */
export function defaultOutputLang(uiLang: string): OutputLang {
  return uiLang === 'en' ? 'en' : 'nb';
}

/** The format to preselect: the output's default, else its first. */
export function defaultFormat(output: Pick<Output, 'formats' | 'default_format'>): string {
  return output.default_format || output.formats[0] || 'pdf';
}

/** The audience an output is listed under in the library (its first one). */
export function primaryAudience(output: Pick<Output, 'audience'>): string {
  return output.audience[0] ?? 'auditor';
}

export interface AudienceGroup {
  readonly audience: string;
  readonly items: readonly Output[];
}

/**
 * Library sections "Til revisor", "Til Datatilsynet"…: each output under its first
 * audience, sections in the fixed audience order, empty sections left out.
 */
export function groupByAudience(outputs: readonly Output[]): AudienceGroup[] {
  const order: readonly string[] = OUTPUT_AUDIENCES;
  const groups = new Map<string, Output[]>();
  for (const output of outputs) {
    const audience = primaryAudience(output);
    const list = groups.get(audience) ?? [];
    list.push(output);
    groups.set(audience, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => rank(order, a) - rank(order, b))
    .map(([audience, items]) => ({ audience, items }));
}

function rank(order: readonly string[], value: string): number {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

/** A clause as readers know it: the label from the API, else `framework number`. */
export function clauseText(clause: ClauseLabel, lang: string): string {
  return localized(clause.label, lang) || `${clause.framework} ${clause.number}`.trim();
}

/** Required checks first, then recommended; unmet before met. */
export function sortPreflight(items: readonly PreflightItem[]): PreflightItem[] {
  const weight = (item: PreflightItem) =>
    (item.met ? 2 : 0) + (item.severity === 'required' ? 0 : 1);
  return [...items].sort((a, b) => weight(a) - weight(b));
}

/** "12 KB" / "1.4 MB" style size, rounded for people (the locale formats the number). */
export function fileSize(bytes: number, locale: string): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb).toLocaleString(locale)} KB`;
  }
  return `${(kb / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}

/** Codes the output endpoints return in `detail: {code}`; each has `outputs.errors.<code>`. */
export const OUTPUT_ERROR_CODES = [
  'output_not_found',
  'module_disabled',
  'preflight_incomplete',
  'output_has_own_flow',
  'standard_not_enabled',
  'standard_required',
  'standard_not_found',
  'entity_required',
  'entity_type_required',
  'format_not_available',
  'unsupported_filter',
  'export_unavailable',
  'unsupported_logo_type',
  'logo_too_large',
] as const;

/**
 * The translation key for a failed output request: `outputs.errors.<code>` when
 * the code is known, `outputs.errors.forbidden` for a bare 403, else the neutral
 * status message. The backend's English text is never shown.
 */
export function outputErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && (OUTPUT_ERROR_CODES as readonly string[]).includes(detail.code)) {
    return `outputs.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'outputs.errors.forbidden';
    }
    if (error.status === 413) {
      return 'outputs.errors.logo_too_large';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}

/** The `detail` of a 409 `preflight_incomplete`: the checks that block generating. */
export function preflightFromError(error: unknown): readonly PreflightItem[] | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
    return null;
  }
  const detail = (error.error as { detail?: { code?: unknown; items?: unknown } } | null)?.detail;
  if (!detail || detail.code !== 'preflight_incomplete' || !Array.isArray(detail.items)) {
    return null;
  }
  return detail.items as PreflightItem[];
}

/** Save a downloaded file under `name` (object URL + temporary link). */
export function saveFile(blob: Blob, name: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  doc.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

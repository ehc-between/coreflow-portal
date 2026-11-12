import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the reports endpoints return in a 4xx `detail: {code}`; each has `reports.errors.<code>`. */
export const REPORT_ERROR_CODES = [
  'module_disabled',
  'forbidden',
  'unknown_framework',
  'report_definition_not_found',
  'audit_pack_not_found',
  'register_not_found',
  'register_unavailable',
  'unknown_column',
  'unsupported_filter',
  'invalid_filters',
  'invalid_status',
  'standard_required',
  'standard_not_found',
  'standard_not_enabled',
  'invalid_window',
  'window_too_large',
  'invalid_owner',
  'invalid_assignee',
  'invalid_rrule',
  'role_not_found',
  'unknown_widget',
  'dashboard_not_found',
  'unknown_register',
  'audit_pack_too_large',
  'audit_pack_empty',
] as const;

export type ReportErrorCode = (typeof REPORT_ERROR_CODES)[number];

export function isReportErrorCode(code: string): code is ReportErrorCode {
  return (REPORT_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The translation key for a failed reports request: `reports.errors.<code>` when
 * the code is known, `reports.errors.forbidden` for a bare 403, otherwise the
 * neutral status message. The backend's English text is never shown.
 */
export function reportErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && isReportErrorCode(detail.code)) {
    return `reports.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'reports.errors.forbidden';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'errors.generic';
}

/**
 * Like {@link reportErrorKey} for file downloads, whose error body arrives as a
 * Blob: the JSON inside is parsed first so coded errors still map.
 */
export async function blobErrorKey(error: unknown): Promise<string> {
  if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
    try {
      const body: unknown = JSON.parse(await error.error.text());
      return reportErrorKey(
        new HttpErrorResponse({ error: body, status: error.status, statusText: error.statusText }),
      );
    } catch {
      return reportErrorKey(new HttpErrorResponse({ status: error.status }));
    }
  }
  return reportErrorKey(error);
}

/** Save a downloaded file in the browser. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

/** A safe file name stem from free text (`Q3 open deviations` -> `q3-open-deviations`). */
export function fileStem(text: string, fallback = 'report'): string {
  const stem = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return stem || fallback;
}

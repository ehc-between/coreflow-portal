import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';

/** Codes the assets endpoints return in a 4xx `detail: {code}`; each has `assets.errors.<code>`. */
export const ASSET_ERROR_CODES = [
  'attestation_required',
  'change_closed',
  'change_locked',
  'field_required',
  'invalid_asset',
  'invalid_calibration_interval',
  'invalid_custodian',
  'invalid_dates',
  'invalid_department',
  'invalid_frequency',
  'invalid_owner',
  'invalid_reviewer',
  'invalid_subject_user',
  'invalid_system_asset',
  'items_pending',
  'module_disabled',
  'nothing_to_remediate',
  'reason_required',
  'review_closed',
  'review_empty',
  'review_not_planned',
  'system_required',
  'too_many_assets',
  'too_many_items',
  'workflow_unavailable',
] as const;

export type AssetErrorCode = (typeof ASSET_ERROR_CODES)[number];

export function isAssetErrorCode(code: string): code is AssetErrorCode {
  return (ASSET_ERROR_CODES as readonly string[]).includes(code);
}

/** The raw `detail` object of a coded error response (or null). */
function rawDetail(error: unknown): Readonly<Record<string, unknown>> | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  return detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : null;
}

/** A translation key plus its params for a failed assets request. */
export interface AssetErrorMessage {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * The translation key for a failed assets request: the coded message when known,
 * `assets.errors.forbidden` for a 403, `assets.errors.invalid` for other 422s,
 * otherwise the neutral status message. The backend's English text is never shown.
 */
export function assetErrorKey(error: unknown): string {
  return assetErrorMessage(error).key;
}

/** Like `assetErrorKey`, with params (`pending` for `items_pending`, `count` for locked fields). */
export function assetErrorMessage(error: unknown): AssetErrorMessage {
  const detail = codedErrorDetail(error);
  if (detail && isAssetErrorCode(detail.code)) {
    const raw = rawDetail(error) ?? {};
    const params: Record<string, unknown> = {};
    if (typeof raw['pending'] === 'number') {
      params['pending'] = raw['pending'];
    }
    if (Array.isArray(raw['fields'])) {
      params['count'] = raw['fields'].length;
    }
    return { key: `assets.errors.${detail.code}`, params };
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return { key: 'assets.errors.forbidden', params: {} };
    }
    if (error.status === 422) {
      return { key: 'assets.errors.invalid', params: {} };
    }
    return { key: httpErrorMessageKey(error.status), params: {} };
  }
  return { key: 'assets.errors.generic', params: {} };
}

/** Field names a 409 `change_locked` error lists (empty otherwise). */
export function lockedFields(error: unknown): readonly string[] {
  const raw = rawDetail(error);
  if (raw?.['code'] !== 'change_locked' || !Array.isArray(raw['fields'])) {
    return [];
  }
  return raw['fields'].filter((f): f is string => typeof f === 'string');
}

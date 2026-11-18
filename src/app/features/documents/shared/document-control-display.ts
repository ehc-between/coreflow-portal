import { ExternalStatus } from '../data/document-control.models';

/**
 * The shared lifecycle value of an external document's status, for `toneFor`:
 * the edition in use ("current") reads as in force; the others keep their word.
 */
export function externalLifecycle(status: ExternalStatus | string): string {
  return status === 'current' ? 'effective' : status;
}

/** `YYYY-MM-DD` of an ISO datetime / date (for `<input type="date">`), '' when null. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/**
 * A `<input type="date">` value as a naive-UTC datetime at the end of that day
 * (`YYYY-MM-DDT23:59:59`), or null when blank. Used for campaign due dates.
 */
export function endOfDay(value: string): string | null {
  return value ? `${value}T23:59:59` : null;
}

/** Trimmed text or null (so blank optional fields clear on the server). */
export function textOrNull(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v ? v : null;
}

/** An integer from a number input, or null when blank / not an integer. */
export function intOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/** Trigger a browser download of a Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Router link of a backend portal `url` (`/documents/…`), else null. */
export function portalLink(url: string | null | undefined): string | null {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

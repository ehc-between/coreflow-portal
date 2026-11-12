import { withUtcDefault } from '../../../core/i18n/locale';

const pad = (n: number) => String(n).padStart(2, '0');

/** A naive-UTC API date-time -> the `YYYY-MM-DD` of a date input ('' when empty). */
export function toDateInput(value: unknown): string {
  return typeof value === 'string' ? (value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '') : '';
}

/** A date input value -> a naive-UTC midnight for the API (null when empty). */
export function fromDateInput(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : null;
}

/** A naive-UTC API date-time -> the local `YYYY-MM-DDTHH:mm` of a datetime-local input. */
export function toDateTimeInput(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    return '';
  }
  const d = new Date(withUtcDefault(value));
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** A local datetime-local value -> naive UTC (`YYYY-MM-DDTHH:mm:ss`) for the API. */
export function fromDateTimeInput(value: string): string | null {
  if (!value) {
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19);
}

/** The current moment as a datetime-local value. */
export function nowDateTimeInput(now = new Date()): string {
  return toDateTimeInput(now.toISOString().slice(0, 19));
}

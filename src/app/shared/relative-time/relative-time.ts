import { Pipe, PipeTransform } from '@angular/core';
import { withUtcDefault } from '../../core/i18n/locale';

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/**
 * Format an ISO timestamp relative to `now` ("5 minutes ago", "for 5 minutter
 * siden") in the given UI language. Anything under a minute is "now".
 *
 * The backend serialises naive UTC datetimes without an offset
 * ("2026-10-19T10:00:00"), which `Date` would read as *local* time; a
 * date-time without `Z` / `±hh:mm` is therefore treated as UTC.
 */
export function formatRelativeTime(iso: string, lang: string, now: number = Date.now()): string {
  const then = new Date(withUtcDefault(iso)).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const seconds = Math.round((then - now) / 1000);
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.trunc(seconds / size), unit);
    }
  }
  return format.format(0, 'second');
}

/**
 * `{{ createdAt | relativeTime: lang : now }}` — pure; pass the active language
 * and a `now` timestamp so the text refreshes when either changes.
 */
@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | null | undefined, lang: string, now?: number): string {
    return value ? formatRelativeTime(value, lang, now) : '';
  }
}

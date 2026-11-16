import { formatDate, formatNumber, formatPercent } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { withUtcDefault } from '../../core/i18n/locale';

/**
 * Date-time without seconds: the locale's medium date + short time
 * (nb "20. okt. 2026, 11:00", en "Oct 20, 2026, 11:00 AM"). `'medium'` is mapped
 * to this too, because a compliance record never needs the seconds.
 */
export const DATE_TIME_FORMAT = 'dateTime';

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Format an ISO date / date-time in an Angular locale; '' for empty or unparsable input. */
export function formatLocalDate(
  value: string | number | Date | null | undefined,
  format: string,
  locale: string,
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  try {
    const input = typeof value === 'string' ? withUtcDefault(value) : value;
    if (format === DATE_TIME_FORMAT || format === 'medium') {
      // A bare date has no time of day; never invent "00:00".
      if (typeof value === 'string' && BARE_DATE.test(value)) {
        return formatDate(input, 'mediumDate', locale);
      }
      return `${formatDate(input, 'mediumDate', locale)}, ${formatDate(input, 'shortTime', locale)}`;
    }
    return formatDate(input, format, locale);
  } catch {
    return '';
  }
}

/**
 * `{{ value | localDate }}` (date-time, no seconds) or `{{ value | localDate: 'mediumDate' }}`
 * — like Angular's DatePipe, but in the
 * *active UI language* (nb → "20. okt. 2026") instead of the static LOCALE_ID,
 * and treating the backend's naive UTC date-times as UTC. Impure so it follows
 * a runtime language switch; reading the language signal ties the host view
 * to it, so zoneless change detection re-renders on switch.
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);
  private last: { value: unknown; format: string; locale: string; result: string } | null = null;

  transform(value: string | number | Date | null | undefined, format = DATE_TIME_FORMAT): string {
    const locale = this.language.locale();
    const last = this.last;
    if (last && last.value === value && last.format === format && last.locale === locale) {
      return last.result;
    }
    const result = formatLocalDate(value, format, locale);
    this.last = { value, format, locale, result };
    return result;
  }
}

/**
 * Format a date-only field (a due date, a review date, a dynamic `date` field)
 * as the calendar day it names, with no timezone shift: a value stored as
 * "2026-10-20" or "2026-10-20T00:00:00Z" renders as 20 October in every
 * timezone. Only the leading `YYYY-MM-DD` is used; '' for empty or unparsable input.
 */
export function formatLocalDay(
  value: string | null | undefined,
  format: string,
  locale: string,
): string {
  const day = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  // A bare YYYY-MM-DD is read by formatDate as a local calendar date.
  return day ? formatLocalDate(day, format, locale) : '';
}

/**
 * `{{ due_at | localDay }}` — {@link LocalDatePipe}'s date-only mode: the
 * calendar day of a date-only field, never shifted by the viewer's timezone.
 */
@Pipe({ name: 'localDay', pure: false })
export class LocalDayPipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | null | undefined, format = 'mediumDate'): string {
    return formatLocalDay(value, format, this.language.locale());
  }
}

/** `{{ count | localNumber }}` — digit grouping / decimals in the active UI language. */
@Pipe({ name: 'localNumber', pure: false })
export class LocalNumberPipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: number | string | null | undefined, digitsInfo?: string): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? formatNumber(n, this.language.locale(), digitsInfo) : String(value);
  }
}

/** `{{ 42 | localPercent }}` — a 0–100 share as a percentage in the active UI language ("42 %" in nb). */
@Pipe({ name: 'localPercent', pure: false })
export class LocalPercentPipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: number | null | undefined, digitsInfo = '1.0-0'): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '';
    }
    return formatPercent(value / 100, this.language.locale(), digitsInfo);
  }
}

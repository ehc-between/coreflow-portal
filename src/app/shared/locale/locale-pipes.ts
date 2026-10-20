import { formatDate, formatNumber, formatPercent } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { withUtcDefault } from '../../core/i18n/locale';

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
    return formatDate(typeof value === 'string' ? withUtcDefault(value) : value, format, locale);
  } catch {
    return '';
  }
}

/**
 * `{{ value | localDate: 'mediumDate' }}` — like Angular's DatePipe, but in the
 * *active UI language* (nb → "20. okt. 2026") instead of the static LOCALE_ID,
 * and treating the backend's naive UTC date-times as UTC. Impure so it follows
 * a runtime language switch; reading the language signal ties the host view
 * to it, so zoneless change detection re-renders on switch.
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);
  private last: { value: unknown; format: string; locale: string; result: string } | null = null;

  transform(value: string | number | Date | null | undefined, format = 'mediumDate'): string {
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

import { BadgeTone } from '../../../shared/ui/badge/badge';
import { ContactNext, ContactRole, ContactTab, ContactTone } from './contacts.models';

/** A translation key plus its params (rendered with the `transloco` pipe). */
export interface Phrase {
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

/** Contact tone -> design-system badge tone. */
export function badgeTone(tone: ContactTone | null | undefined): BadgeTone {
  switch (tone) {
    case 'ok':
      return 'pass';
    case 'warn':
      return 'warn';
    case 'bad':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** `923456781` -> `923 456 781`; other values unchanged. */
export function formatOrgNumber(value: string | null | undefined): string {
  const v = value ?? '';
  return /^\d{9}$/.test(v) ? `${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6)}` : v;
}

/** The register role a tab filters on (`null`: all companies, or the agreements tab). */
export function roleOfTab(tab: ContactTab): ContactRole | null {
  switch (tab) {
    case 'customers':
      return 'customer';
    case 'suppliers':
      return 'supplier';
    case 'processors':
      return 'processor';
    default:
      return null;
  }
}

/** A `?tab=` value, defaulting to `all`. */
export function parseTab(raw: string | null | undefined): ContactTab {
  const tabs: readonly ContactTab[] = ['all', 'customers', 'suppliers', 'processors', 'agreements'];
  return tabs.includes(raw as ContactTab) ? (raw as ContactTab) : 'all';
}

/** The month name of an ISO date in `locale` ("mars"). */
export function monthName(iso: string, locale: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, { month: 'long' }).format(date);
}

/** A short date ("27. november", "27 November") in `locale`; the year only when not this year. */
export function shortDate(
  iso: string | null | undefined,
  locale: string,
  today = new Date(),
): string {
  if (!iso) {
    return '';
  }
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const sameYear = date.getFullYear() === today.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/** The "Neste" cell of a company row (`contacts` scope key). */
export function nextPhrase(next: ContactNext | null | undefined, locale: string): Phrase | null {
  if (!next) {
    return null;
  }
  const params = next.params ?? {};
  if (next.key === 'openComplaints' && Number(params['count']) === 1) {
    return { key: 'contacts.next.openComplaintsOne' };
  }
  if (next.key === 'renewsOn') {
    return {
      key: 'contacts.next.renewsOn',
      params: { month: monthName(String(params['date'] ?? ''), locale) },
    };
  }
  return { key: `contacts.next.${next.key}`, params };
}

/** Whether "Neste" renders as a pill (urgent) or as plain muted text. */
export function nextIsPill(next: ContactNext | null | undefined): boolean {
  return !!next && (next.tone === 'warn' || next.tone === 'bad');
}

const EEA = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
]);

/** "Norge (EØS)" / "USA (utenfor EØS)" as a phrase; `null` when the country is unknown. */
export function locationPhrase(
  country: string | null | undefined,
  countryName: (code: string) => string,
): Phrase | null {
  const code = (country ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return country ? { key: 'contacts.card.personalData.outside', params: { country } } : null;
  }
  const name = countryName(code);
  return {
    key: EEA.has(code) ? 'contacts.card.personalData.eea' : 'contacts.card.personalData.outside',
    params: { country: name },
  };
}

const KNOWN_LEVELS = ['low', 'medium', 'high', 'critical', 'very_high', 'very_low', 'moderate'];

/** A risk level as a `contacts` key when known, else the raw text (custom matrices). */
export function riskLevelKey(level: string | null | undefined): string | null {
  const v = (level ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return KNOWN_LEVELS.includes(v) ? `contacts.card.risks.level.${v}` : null;
}

/** "oppsigelse 1 mnd" for whole months (30-day steps), else days. */
export function noticePhrase(days: number | null | undefined): Phrase | null {
  if (!days) {
    return null;
  }
  if (days % 30 === 0) {
    return { key: 'contacts.card.agreements.noticeMonths', params: { months: days / 30 } };
  }
  return { key: 'contacts.card.agreements.noticeDays', params: { days } };
}

/** Days from `today` to an ISO date (negative when past). */
export function daysUntil(iso: string | null | undefined, today = new Date()): number | null {
  if (!iso) {
    return null;
  }
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((date.getTime() - start.getTime()) / 86_400_000);
}

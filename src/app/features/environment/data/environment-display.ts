import { BadgeTone } from '../../../shared/ui/badge/badge';
import { DrillOutcome, RecordStatus, ScoringCriterion, ScoringMethod } from './environment.models';

export function statusTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case 'active':
      return 'pass';
    case 'draft':
      return 'info';
    default:
      return 'neutral';
  }
}

export function outcomeTone(outcome: DrillOutcome | string | null | undefined): BadgeTone {
  switch (outcome) {
    case 'effective':
      return 'pass';
    case 'partially_effective':
      return 'warn';
    case 'ineffective':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** `-updated_at` -> `updated_atDesc` (the i18n key under `environment.sorts`). */
export function sortKey(sort: string): string {
  return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
}

/** Status filter option -> statuses sent to the API (`open` = draft + active). */
export function statusesForFilter(filter: string): readonly RecordStatus[] {
  if (filter === 'open') {
    return ['draft', 'active'];
  }
  return filter === 'draft' || filter === 'active' || filter === 'retired' ? [filter] : [];
}

/** The calendar day (`YYYY-MM-DD`) of a naive UTC datetime or date, or ''. */
export function toDay(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** A date-only form value as the naive datetime the API stores (midnight), or null. */
export function dayToDatetime(day: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00` : null;
}

/** A `datetime-local` value (local time) as a naive UTC ISO datetime, or null. */
export function localToUtc(local: string): string | null {
  if (!local) {
    return null;
  }
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19);
}

/** A naive UTC datetime as a `datetime-local` value in the viewer's time zone. */
export function utcToLocal(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Today as `YYYY-MM-DD` in the viewer's time zone, shifted by `days`. */
export function localDay(days = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A criterion's label in the active language (falls back to English, then the key). */
export function criterionLabel(criterion: ScoringCriterion, lang: string): string {
  return criterion.label[lang] || criterion.label['en'] || criterion.key;
}

/**
 * The score the backend will compute for `scores` under `method`, or null while a
 * criterion is still unscored (mirrors `app/modules/environment/scoring.py`).
 */
export function previewScore(
  method: Pick<ScoringMethod, 'method' | 'criteria'>,
  scores: Readonly<Record<string, number | null | undefined>>,
): number | null {
  const values = method.criteria.map((c) => scores[c.key]);
  if (values.some((v) => v === null || v === undefined)) {
    return null;
  }
  if (method.method === 'product') {
    return values.reduce<number>((acc, v) => acc * (v as number), 1);
  }
  const total = method.criteria.reduce((acc, c, i) => acc + c.weight * (values[i] as number), 0);
  return Math.round(total * 100) / 100;
}

/** kg CO2e as tonnes, rounded to 2 decimals. */
export function kgToTonnes(kg: number | null | undefined): number {
  return Math.round(((kg ?? 0) / 1000) * 100) / 100;
}

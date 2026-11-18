import {
  DrillOutcome,
  LocalText,
  RecordStatus,
  ScoringCriterion,
  ScoringMethod,
  TargetStatus,
} from './environment.models';

/**
 * The value an `app-status-badge meaning="compliance"` shows for a drill outcome
 * (worked → pass, partly → warn, did not work → fail); the label stays the
 * module's own (`environment.outcomes.<outcome>`).
 */
export function outcomeBadgeValue(outcome: DrillOutcome | string | null | undefined): string {
  switch (outcome) {
    case 'effective':
      return 'compliant';
    case 'partially_effective':
      return 'partial';
    case 'ineffective':
      return 'non_compliant';
    default:
      return 'unknown';
  }
}

/**
 * The value an `app-status-badge meaning="compliance"` shows for a metric's target
 * status: on track → pass, off track → warn (a to-do, never red), no target or no
 * data → neutral.
 */
export function targetBadgeValue(status: TargetStatus | string | null | undefined): string {
  switch (status) {
    case 'on_track':
      return 'met';
    case 'off_track':
      return 'partial';
    default:
      return 'not_assessed';
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

/** A bilingual text in the active language (falls back to English, then ''). */
export function localText(text: LocalText | null | undefined, lang: string): string {
  return text?.[lang] || text?.['en'] || '';
}

/** A criterion's label in the active language (falls back to English, then the key). */
export function criterionLabel(criterion: ScoringCriterion, lang: string): string {
  return localText(criterion.label, lang) || criterion.key;
}

/** What one score value of a criterion means ("Merkbar, men begrenset …"), or ''. */
export function levelText(criterion: ScoringCriterion, level: number, lang: string): string {
  return localText(criterion.levels?.[String(level)], lang);
}

/** The values of the method's scale, low to high. */
export function scaleValues(method: Pick<ScoringMethod, 'scale_min' | 'scale_max'>): number[] {
  const count = Math.max(0, method.scale_max - method.scale_min + 1);
  return Array.from({ length: count }, (_, i) => method.scale_min + i);
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

/**
 * A unit as people write it: `m3` -> `m³`, `m2` -> `m²`, `co2` -> `CO₂`. Anything
 * else is shown as stored.
 */
export function displayUnit(unit: string | null | undefined): string {
  return (unit ?? '')
    .replace(/\bm3\b/g, 'm³')
    .replace(/\bm2\b/g, 'm²')
    .replace(/\bco2e?\b/gi, (m) => (m.toLowerCase() === 'co2e' ? 'CO₂e' : 'CO₂'));
}

/** Direction of a change for an arrow: up, down or flat (|change| < 0.5 %). */
export function changeDirection(pct: number | null | undefined): 'up' | 'down' | 'flat' | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return null;
  }
  if (Math.abs(pct) < 0.5) {
    return 'flat';
  }
  return pct > 0 ? 'up' : 'down';
}

/**
 * Whether a change is good news for a metric: less is better for `decrease`
 * metrics (energy, waste), more for `increase` metrics. Null when flat or unknown.
 */
export function changeIsGood(
  pct: number | null | undefined,
  direction: string | null | undefined,
): boolean | null {
  const dir = changeDirection(pct);
  if (!dir || dir === 'flat') {
    return null;
  }
  return direction === 'increase' ? dir === 'up' : dir === 'down';
}

/** The year of a `YYYY-MM-DD` date, or null. */
export function yearOf(value: string | null | undefined): number | null {
  const m = value?.match(/^(\d{4})-/);
  return m ? Number(m[1]) : null;
}

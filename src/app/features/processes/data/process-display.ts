import { MapNodeType, ProcessCategory, ProcessHealth, ProcessStatus } from './process.models';

export function statusKey(status: ProcessStatus | string): string {
  return `processes.status.${status}`;
}

export function categoryKey(category: ProcessCategory | string): string {
  return `processes.category.${category}`;
}

export function nodeTypeKey(type: MapNodeType | string): string {
  return `processes.map.nodeTypes.${type}`;
}

/** Label of a framework tag (`iso9001` -> "ISO 9001"). */
export function frameworkKey(framework: string): string {
  return `processes.frameworks.${framework}`;
}

/**
 * The review interval in words: "Hvert år" for 12, "Hvert 2. år" for 24 / 36,
 * "Hver måned" for 1, otherwise "Hver N. måned". Returns the key and its params.
 */
export function intervalText(months: number): { key: string; params: Record<string, number> } {
  if (months === 1) {
    return { key: 'processes.review.everyMonth', params: {} };
  }
  if (months === 12) {
    return { key: 'processes.review.everyYear', params: {} };
  }
  if (months % 12 === 0) {
    return { key: 'processes.review.everyNYears', params: { count: months / 12 } };
  }
  return { key: 'processes.review.everyNMonths', params: { count: months } };
}

/** Lifecycle-style value for the completeness chip (all in place = done). */
export function healthValue(health: ProcessHealth | null | undefined): string {
  if (!health || health.total === 0) {
    return 'unknown';
  }
  if (health.done >= health.total) {
    return 'done';
  }
  return health.done >= Math.ceil(health.total / 2) ? 'in_progress' : 'draft';
}

/** Compliance-style value of a KPI result (on track = met). */
export function kpiResultValue(status: string | null | undefined): string {
  switch (status) {
    case 'on_track':
      return 'met';
    case 'at_risk':
      return 'partial';
    case 'off_track':
      return 'not_met';
    default:
      return 'not_assessed';
  }
}

/** A naive-UTC ISO datetime from a `yyyy-mm-dd` date input (null when empty). */
export function dateInputToIso(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : null;
}

/** The `yyyy-mm-dd` part of an ISO datetime, for a date input. */
export function isoToDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** SVG polyline points of a small trend line (values oldest first). */
export function sparkPoints(values: readonly number[], width = 64, height = 18): string {
  if (values.length < 2) {
    return '';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  return values
    .map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`,
    )
    .join(' ');
}

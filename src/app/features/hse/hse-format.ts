import {
  ConsultationStatus,
  ControlType,
  PpeStatus,
  RISK_LEVELS,
  RiskLevel,
  SjaStep,
} from './data/hse.models';

/**
 * The shared tone-map value (`app-status-badge meaning="lifecycle"`) of a PPE status:
 * in stock = ready (green), issued = in use, out of service = blocked, retired = grey.
 */
export function ppeStatusValue(status: PpeStatus): string {
  switch (status) {
    case 'in_stock':
      return 'effective';
    case 'issued':
      return 'active';
    case 'out_of_service':
      return 'blocked';
    case 'retired':
      return 'retired';
  }
}

/** The shared tone-map value of a consultation status (held = done). */
export function consultationStatusValue(status: ConsultationStatus): string {
  return status === 'held' ? 'completed' : status;
}

/** The lifecycle value of a safety-round task (overdue wins over its status). */
export function roundStatusValue(status: string, overdue: boolean): string {
  return overdue ? 'overdue' : status;
}

/** Position of a risk level (low = 0 … critical = 3; none = -1). */
export function riskRank(level: RiskLevel | '' | null | undefined): number {
  return level ? RISK_LEVELS.indexOf(level) : -1;
}

/** Residual risk is set and not lower than the risk before controls (an SJA red flag). */
export function residualNotLower(
  before: RiskLevel | '' | null | undefined,
  residual: RiskLevel | '' | null | undefined,
): boolean {
  return !!before && !!residual && riskRank(residual) >= riskRank(before);
}

/** The hierarchy-of-controls tag of control `index` of a step (null when untagged). */
export function controlTypeOf(step: SjaStep, index: number): ControlType | null {
  return step.control_types?.[index] ?? null;
}

/** Every control of the step is tagged PPE: the step relies only on the last line of defence. */
export function ppeOnly(types: readonly (ControlType | null | '')[]): boolean {
  return types.length > 0 && types.every((t) => t === 'ppe');
}

/** The translation key and params of an inspection interval in plain words. */
export function intervalText(days: number | null | undefined): {
  key: string;
  params?: Record<string, unknown>;
} | null {
  if (!days || days < 1) {
    return null;
  }
  if (days === 7) {
    return { key: 'hse.interval.weekly' };
  }
  if (days >= 28 && days <= 31) {
    return { key: 'hse.interval.monthly' };
  }
  if (days >= 89 && days <= 92) {
    return { key: 'hse.interval.quarterly' };
  }
  if (days >= 180 && days <= 184) {
    return { key: 'hse.interval.halfYearly' };
  }
  if (days === 365 || days === 366) {
    return { key: 'hse.interval.yearly' };
  }
  if (days === 730 || days === 731) {
    return { key: 'hse.interval.everyTwoYears' };
  }
  return { key: 'hse.interval.days', params: { days } };
}

/** Multi-line text -> trimmed, non-empty lines. */
export function linesToList(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** A list -> one item per line (for a textarea). */
export function listToLines(items: readonly string[] | null | undefined): string {
  return (items ?? []).join('\n');
}

/** Blank -> null, otherwise the trimmed text (optional text fields on the wire). */
export function textOrNull(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text ? text : null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * A `<input type="datetime-local">` value (viewer's local time) -> the backend's naive
 * UTC wire value (`YYYY-MM-DDTHH:MM:SS`), or null when blank/unparsable.
 */
export function localInputToWire(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 19);
}

/** A naive UTC wire date-time -> a `datetime-local` value in the viewer's timezone ('' if empty). */
export function wireToLocalInput(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A `<input type="date">` day -> the start of that day as a naive wire value (or null). */
export function dayToWire(day: string | null | undefined): string | null {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00` : null;
}

/** A `<input type="date">` day -> the end of that day as a naive wire value (or null). */
export function dayEndToWire(day: string | null | undefined): string | null {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T23:59:59` : null;
}

/** Hazard and control totals of a list of steps. */
export function stepTotals(steps: readonly SjaStep[]): { hazards: number; controls: number } {
  return steps.reduce(
    (acc, step) => ({
      hazards: acc.hazards + step.hazards.length,
      controls: acc.controls + step.controls.length,
    }),
    { hazards: 0, controls: 0 },
  );
}

/** Steps that would block a submit (a hazard and a control are required per step). */
export function incompleteSteps(steps: readonly SjaStep[]): number[] {
  return steps
    .map((step, index) => (step.hazards.length > 0 && step.controls.length > 0 ? -1 : index))
    .filter((index) => index >= 0);
}

/** Which period phrasing fits: both ends, only a start ("from … "), only an end, or none. */
export function periodKind(
  start: string | null | undefined,
  end: string | null | undefined,
): 'range' | 'from' | 'until' | 'none' {
  if (start && end) {
    return 'range';
  }
  if (start) {
    return 'from';
  }
  return end ? 'until' : 'none';
}

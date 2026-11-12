import { BadgeTone } from '../../shared/ui/badge/badge';
import { ConsultationStatus, PpeStatus, RiskLevel, SjaStatus, SjaStep } from './data/hse.models';

/** Badge tone of an SJA status. */
export function sjaStatusTone(status: SjaStatus): BadgeTone {
  switch (status) {
    case 'draft':
      return 'neutral';
    case 'in_review':
      return 'info';
    case 'approved':
      return 'accent';
    case 'completed':
      return 'pass';
    case 'cancelled':
      return 'warn';
  }
}

/** Badge tone of a PPE status. */
export function ppeStatusTone(status: PpeStatus): BadgeTone {
  switch (status) {
    case 'in_stock':
      return 'pass';
    case 'issued':
      return 'info';
    case 'out_of_service':
      return 'fail';
    case 'retired':
      return 'neutral';
  }
}

/** Badge tone of a consultation status. */
export function consultationStatusTone(status: ConsultationStatus): BadgeTone {
  switch (status) {
    case 'planned':
      return 'info';
    case 'held':
      return 'pass';
    case 'cancelled':
      return 'neutral';
  }
}

/** Badge tone of a risk level (none = neutral). */
export function riskTone(level: RiskLevel | null | undefined): BadgeTone {
  switch (level) {
    case 'low':
      return 'pass';
    case 'medium':
      return 'warn';
    case 'high':
    case 'critical':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** Multi-line text -> trimmed, non-empty lines (participants, hazards, controls). */
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

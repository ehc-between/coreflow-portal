import { BadgeTone } from '../../shared/ui/badge/badge';
import {
  CLOSED_OBJECTIVE_STATUSES,
  Kpi,
  KpiStatus,
  MeasurementStatus,
  ObjectiveStatus,
  Trend,
} from './data/objectives.models';

/** The Transloco scope (portal path) and the module key of M08. */
export const OBJECTIVES_SCOPE = 'objectives';
export const OBJECTIVES_MODULE = 'objectives';

export const objectiveStatusKey = (status: ObjectiveStatus) =>
  `objectives.objectiveStatus.${status}`;
export const kpiStatusKey = (status: KpiStatus) => `objectives.kpiStatus.${status}`;
/** Health of a KPI from its last measurement; `null` (never measured) is "no data". */
export const healthKey = (status: MeasurementStatus | null) =>
  `objectives.health.${status ?? 'no_data'}`;
export const trendKey = (trend: Trend) => `objectives.trend.${trend}`;
export const managementSystemKey = (system: string) => `objectives.managementSystems.${system}`;

export function objectiveStatusTone(status: ObjectiveStatus): BadgeTone {
  switch (status) {
    case 'active':
      return 'info';
    case 'achieved':
      return 'pass';
    case 'not_achieved':
      return 'fail';
    case 'cancelled':
      return 'neutral';
    default:
      return 'accent';
  }
}

export function kpiStatusTone(status: KpiStatus): BadgeTone {
  return status === 'active' ? 'info' : 'neutral';
}

export function healthTone(status: MeasurementStatus | null): BadgeTone {
  switch (status) {
    case 'on_track':
      return 'pass';
    case 'at_risk':
      return 'warn';
    case 'off_track':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** CSS colour of a measurement status, for chart markers (always paired with a label). */
export function healthColor(status: MeasurementStatus | null): string {
  switch (status) {
    case 'on_track':
      return 'var(--pass)';
    case 'at_risk':
      return 'var(--warn)';
    case 'off_track':
      return 'var(--fail)';
    default:
      return 'var(--fg-subtle)';
  }
}

export function trendTone(trend: Trend): BadgeTone {
  switch (trend) {
    case 'improving':
      return 'pass';
    case 'worsening':
      return 'fail';
    default:
      return 'neutral';
  }
}

export function isClosedObjective(status: ObjectiveStatus): boolean {
  return CLOSED_OBJECTIVE_STATUSES.includes(status);
}

/**
 * Client-side check of the threshold rule the backend enforces: a warning value
 * needs a target, and sits on the "worse" side of it (at or below the target
 * when higher is better, at or above when lower is better). Returns the error
 * code the server would answer with, or null.
 */
export function thresholdError(
  direction: Kpi['direction'],
  target: number | null,
  warning: number | null,
): 'warning_without_target' | 'invalid_thresholds' | null {
  if (warning === null) {
    return null;
  }
  if (target === null) {
    return 'warning_without_target';
  }
  if (direction === 'higher' ? warning > target : warning < target) {
    return 'invalid_thresholds';
  }
  return null;
}

/** Parse a number input's text (`,` accepted as a decimal separator); '' is null, junk NaN. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Today as `YYYY-MM-DD` in the user's local time zone. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `YYYY-MM-DD` that is `months` after `from` (clamped to the end of shorter months). */
export function addMonthsIso(from: string, months: number): string {
  const [y, m, d] = from.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return todayIso(target);
}

/** Strip a `user:` / `department:` prefix from an assignee option value. */
export function optionId(value: string, prefix: 'user' | 'department'): string | null {
  return value.startsWith(`${prefix}:`) ? value.slice(prefix.length + 1) : null;
}

/** Empty text becomes null (so a cleared field is sent as "no value"). */
export function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

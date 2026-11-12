import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  FindingStatus,
  InspectionResult,
  InspectionStatus,
  QuestionType,
  Severity,
  TEMPLATE_CATEGORIES,
  TemplateStatus,
} from './inspection.models';

export function templateStatusKey(status: TemplateStatus | string): string {
  return `inspections.templateStatus.${status}`;
}

export function templateStatusTone(status: TemplateStatus | string): BadgeTone {
  switch (status) {
    case 'active':
      return 'pass';
    case 'archived':
      return 'neutral';
    default:
      return 'info';
  }
}

export function inspectionStatusKey(status: InspectionStatus | string): string {
  return `inspections.status.${status}`;
}

export function inspectionStatusTone(status: InspectionStatus | string): BadgeTone {
  switch (status) {
    case 'in_progress':
      return 'accent';
    case 'completed':
      return 'pass';
    case 'cancelled':
      return 'neutral';
    default:
      return 'info';
  }
}

export function resultKey(result: InspectionResult | string): string {
  return `inspections.result.${result}`;
}

export function resultTone(result: InspectionResult | string | null): BadgeTone {
  return result === 'passed' ? 'pass' : result === 'failed' ? 'fail' : 'neutral';
}

export function severityKey(severity: Severity | string): string {
  return `inspections.severity.${severity}`;
}

export function severityTone(severity: Severity | string): BadgeTone {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'fail';
    case 'medium':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function findingStatusKey(status: FindingStatus | string): string {
  return `inspections.findingStatus.${status}`;
}

export function findingStatusTone(status: FindingStatus | string): BadgeTone {
  return status === 'open' ? 'warn' : 'pass';
}

export function questionTypeKey(type: QuestionType | string): string {
  return `inspections.questionTypes.${type}`;
}

/** A translated label key for a known category, or null (show the raw text). */
export function categoryKey(category: string | null | undefined): string | null {
  return category && (TEMPLATE_CATEGORIES as readonly string[]).includes(category)
    ? `inspections.category.${category}`
    : null;
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

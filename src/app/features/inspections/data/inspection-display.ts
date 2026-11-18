import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import {
  FindingStatus,
  InspectionResult,
  InspectionStatus,
  QuestionType,
  SEVERITIES,
  Severity,
  SubjectType,
  TEMPLATE_CATEGORIES,
  TemplateStatus,
} from './inspection.models';

/**
 * Display helpers of the inspections area. Colours come from the shared tone map
 * (`app-status-badge` with meaning `lifecycle` for statuses and results, `severity`
 * for severities); this file only maps values to the module's own wording.
 */

/** Sub-pages of Inspeksjoner (`app-module-nav` under the page header). */
export const INSPECTIONS_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'inspections.sections.inspections', link: '/inspections', exact: true },
  { labelKey: 'inspections.sections.findings', link: '/inspections/findings' },
  { labelKey: 'inspections.sections.schedules', link: '/inspections/schedules' },
];

/** The gear in the page header: checklist templates are the module's configuration. */
export const INSPECTIONS_SETTINGS_LINK = '/settings/modules/inspections';

export function templateStatusKey(status: TemplateStatus | string): string {
  return `inspections.templateStatus.${status}`;
}

export function inspectionStatusKey(status: InspectionStatus | string): string {
  return `inspections.status.${status}`;
}

export function resultKey(result: InspectionResult | string): string {
  return `inspections.result.${result}`;
}

export function severityKey(severity: Severity | string): string {
  return `inspections.severity.${severity}`;
}

export function findingStatusKey(status: FindingStatus | string): string {
  return `inspections.findingStatus.${status}`;
}

export function questionTypeKey(type: QuestionType | string): string {
  return `inspections.questionTypes.${type}`;
}

export function subjectTypeKey(type: SubjectType | string): string {
  return `inspections.subject.types.${type}`;
}

/** A translated label key for a known category, or null (show the raw text). */
export function categoryKey(category: string | null | undefined): string | null {
  return category && (TEMPLATE_CATEGORIES as readonly string[]).includes(category)
    ? `inspections.category.${category}`
    : null;
}

/** Whether `severity` is at or above `threshold` (low < medium < high < critical). */
export function atLeast(severity: Severity | string, threshold: Severity | string): boolean {
  const order = SEVERITIES as readonly string[];
  return order.indexOf(severity) >= order.indexOf(threshold);
}

/** High and critical findings should become deviations (the panel's primary action). */
export function isSerious(severity: Severity | string): boolean {
  return atLeast(severity, 'high');
}

/**
 * The template name when it adds information to the inspection title (it is hidden
 * when the title is the template name, or starts with it as in "Vernerunde – Lager").
 */
export function distinctTemplateTitle(
  title: string,
  templateTitle: string | null | undefined,
): string | null {
  const t = (templateTitle ?? '').trim();
  if (!t) {
    return null;
  }
  const own = title.trim().toLowerCase();
  return own === t.toLowerCase() || own.startsWith(t.toLowerCase()) ? null : t;
}

/** A naive-UTC ISO datetime from a `yyyy-mm-dd` date input (null when empty). */
export function dateInputToIso(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : null;
}

/** The end of a `yyyy-mm-dd` day as a naive-UTC ISO datetime (for "to" date filters). */
export function dateInputToIsoEnd(value: string | null | undefined): string | null {
  const start = dateInputToIso(value);
  return start ? start.replace('T00:00:00', 'T23:59:59') : null;
}

/** The `yyyy-mm-dd` part of an ISO datetime, for a date input. */
export function isoToDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** Save a downloaded file (export, PDF report) under `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

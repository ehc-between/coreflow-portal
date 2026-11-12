import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  AssessmentKind,
  AssessmentStatus,
  ClassificationAnswers,
  ClassificationReason,
  MonitoringResult,
  RiskClass,
  SystemStatus,
} from './ai-governance.models';

/** Backend module key (permission prefix, page-context `module`). */
export const AI_GOVERNANCE_MODULE = 'ai_governance';
/** Portal path, Transloco scope and guidance file name. */
export const AI_GOVERNANCE_SCOPE = 'ai-governance';
export const AI_SYSTEM_ENTITY = 'ai_system';
export const AI_ASSESSMENT_ENTITY = 'ai_assessment';

export const AI_GOV_PERMISSIONS = {
  read: 'ai_governance:read',
  write: 'ai_governance:write',
  manage: 'ai_governance:manage',
  approve: 'ai_governance:approve',
} as const;

export function riskTone(risk: RiskClass | string): BadgeTone {
  switch (risk) {
    case 'prohibited':
      return 'fail';
    case 'high':
      return 'warn';
    case 'limited':
      return 'info';
    case 'minimal':
      return 'pass';
    default:
      return 'neutral';
  }
}

export function systemStatusTone(status: SystemStatus | string): BadgeTone {
  switch (status) {
    case 'in_use':
      return 'pass';
    case 'in_development':
      return 'info';
    case 'suspended':
      return 'warn';
    case 'retired':
      return 'neutral';
    default:
      return 'accent';
  }
}

export function assessmentStatusTone(status: AssessmentStatus | string): BadgeTone {
  switch (status) {
    case 'approved':
      return 'pass';
    case 'completed':
      return 'info';
    default:
      return 'warn';
  }
}

export function monitoringTone(result: MonitoringResult | string): BadgeTone {
  switch (result) {
    case 'pass':
      return 'pass';
    case 'warn':
      return 'warn';
    case 'fail':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** Tone of an obligation task's status (F2 statuses), `neutral` when no task exists. */
export function obligationTaskTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case 'done':
      return 'pass';
    case 'in_progress':
      return 'info';
    case 'blocked':
      return 'fail';
    case 'cancelled':
      return 'neutral';
    case 'open':
      return 'warn';
    default:
      return 'neutral';
  }
}

export const riskKey = (risk: string): string => `aiGovernance.risk.${risk}`;
export const statusKey = (status: string): string => `aiGovernance.status.${status}`;
export const roleKey = (role: string): string => `aiGovernance.role.${role}`;
export const kindKey = (kind: string): string => `aiGovernance.kind.${kind}`;
export const assessmentStatusKey = (status: string): string =>
  `aiGovernance.assessmentStatus.${status}`;
export const monitoringKindKey = (kind: string): string => `aiGovernance.monitoringKind.${kind}`;
export const monitoringResultKey = (result: string): string =>
  `aiGovernance.monitoringResult.${result}`;
export const literacySourceKey = (source: string): string =>
  `aiGovernance.literacySource.${source}`;
export const docSectionKey = (key: string): string => `aiGovernance.docSections.${key}.title`;
export const docSectionHintKey = (key: string): string => `aiGovernance.docSections.${key}.hint`;
export const prohibitedKey = (key: string): string => `aiGovernance.prohibited.${key}`;
export const annexIiiKey = (key: string): string => `aiGovernance.annexIii.${key}`;
export const transparencyKey = (key: string): string => `aiGovernance.transparency.${key}`;

/** Label / hint keys of an impact or FRIA section. */
export function assessmentSectionKey(kind: AssessmentKind | string, section: string): string {
  return `aiGovernance.sections.${kind === 'fria' ? 'fria' : 'impact'}.${section}.title`;
}
export function assessmentSectionHintKey(kind: AssessmentKind | string, section: string): string {
  return `aiGovernance.sections.${kind === 'fria' ? 'fria' : 'impact'}.${section}.hint`;
}

export interface ReasonText {
  readonly key: string;
  readonly params: Record<string, unknown>;
  /** A catalogue label key to translate into `params.item` before rendering. */
  readonly itemKey: string | null;
}

/**
 * How to render a classification reason code (`prohibited.<practice>`,
 * `high.annex_i`, `high.<area>`, `high.profiling`, `exception.art6_3`,
 * `transparency.<trigger>`, `minimal.none`, `gpai.model`, `gpai.systemic`).
 */
export function reasonText(reason: ClassificationReason): ReasonText {
  const [group, ...rest] = reason.code.split('.');
  const item = rest.join('.');
  const params = { ref: reason.ref };
  switch (group) {
    case 'prohibited':
      return { key: 'aiGovernance.reasons.prohibited', params, itemKey: prohibitedKey(item) };
    case 'transparency':
      return { key: 'aiGovernance.reasons.transparency', params, itemKey: transparencyKey(item) };
    case 'high':
      if (item === 'annex_i' || item === 'profiling') {
        return { key: `aiGovernance.reasons.high_${item}`, params, itemKey: null };
      }
      return { key: 'aiGovernance.reasons.high_area', params, itemKey: annexIiiKey(item) };
    case 'exception':
      return { key: 'aiGovernance.reasons.exception_art6_3', params, itemKey: null };
    case 'minimal':
      return { key: 'aiGovernance.reasons.minimal', params, itemKey: null };
    case 'gpai':
      return {
        key:
          item === 'systemic' ? 'aiGovernance.reasons.gpai_systemic' : 'aiGovernance.reasons.gpai',
        params,
        itemKey: null,
      };
    default:
      return {
        key: 'aiGovernance.reasons.other',
        params: { ...params, code: reason.code },
        itemKey: null,
      };
  }
}

/** Empty wizard answers (every question answered "no"). */
export function emptyAnswers(): ClassificationAnswers {
  return {
    role: null,
    prohibited_practices: [],
    annex_i_safety_component: false,
    annex_iii_areas: [],
    art6_3_exception: false,
    profiling: false,
    transparency: [],
    gpai: false,
    gpai_systemic_risk: false,
    deployer_public_service: false,
    deployer_credit_or_insurance: false,
    notes: null,
  };
}

const BOOL_KEYS = [
  'annex_i_safety_component',
  'art6_3_exception',
  'profiling',
  'gpai',
  'gpai_systemic_risk',
  'deployer_public_service',
  'deployer_credit_or_insurance',
] as const;
const LIST_KEYS = ['prohibited_practices', 'annex_iii_areas', 'transparency'] as const;

/**
 * Wizard answers from untrusted input (a stored assessment's `answers`, or an
 * assistant suggestion): booleans and string lists only, unknown values in a
 * list are dropped when `allowed` lists are given.
 */
export function normalizeAnswers(
  raw: unknown,
  allowed?: Partial<Record<(typeof LIST_KEYS)[number], readonly string[]>>,
): ClassificationAnswers {
  const base = emptyAnswers();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const key of BOOL_KEYS) {
    if (typeof src[key] === 'boolean') {
      out[key] = src[key];
    }
  }
  for (const key of LIST_KEYS) {
    const value = src[key];
    if (Array.isArray(value)) {
      const allow = allowed?.[key];
      out[key] = [
        ...new Set(
          value.filter((v): v is string => typeof v === 'string' && (!allow || allow.includes(v))),
        ),
      ];
    }
  }
  if (typeof src['role'] === 'string') {
    out['role'] = src['role'];
  }
  if (typeof src['notes'] === 'string') {
    out['notes'] = src['notes'];
  }
  if (!out['gpai']) {
    out['gpai_systemic_risk'] = false;
  }
  return out as unknown as ClassificationAnswers;
}

/** Toggle `value` in a list (returns a new list). */
export function toggleIn(list: readonly string[], value: string, on: boolean): string[] {
  const without = list.filter((v) => v !== value);
  return on ? [...without, value] : without;
}

/** Split a comma / newline separated tag input into trimmed, unique, non-empty values. */
export function parseTags(text: string, max = 20): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].slice(0, max);
}

/** A section map of an impact / FRIA assessment's answers (string values only). */
export function sectionAnswers(answers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (answers && typeof answers === 'object') {
    for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
      if (typeof value === 'string') {
        out[key] = value;
      }
    }
  }
  return out;
}

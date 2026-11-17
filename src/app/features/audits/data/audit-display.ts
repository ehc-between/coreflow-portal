import { ToneMeaning } from '../../../shared/ui/tones';
import { parseClause } from '../../../shared/requirement-links/clause-picker';
import {
  CertificationStatus,
  ChecklistResult,
  FindingStatus,
  FindingType,
  PlanStatus,
  ProgrammeStatus,
  RiskLevel,
} from './audit.models';

/**
 * What an audit value means for `app-status-badge` (docs/ux-guide.md, "Tone map"):
 * the shared meaning + the shared value that carries the colour, and the module's
 * own label key. No local colour rules.
 */
export interface AuditBadge {
  readonly meaning: ToneMeaning;
  readonly value: string;
  readonly labelKey: string;
}

const PLAN_VALUE: Readonly<Record<string, string>> = {
  planned: 'planned',
  in_progress: 'in_progress',
  reporting: 'in_progress',
  report_review: 'pending_approval',
  closed: 'closed',
  cancelled: 'cancelled',
};

const FINDING_STATUS_VALUE: Readonly<Record<string, string>> = {
  open: 'open',
  in_progress: 'in_progress',
  pending_verification: 'pending',
  closed: 'closed',
  cancelled: 'cancelled',
};

const FINDING_TYPE_VALUE: Readonly<Record<string, string>> = {
  major_nc: 'major',
  minor_nc: 'minor',
  observation: 'observation',
  ofi: 'opportunity',
};

const CERTIFICATION_VALUE: Readonly<Record<string, string>> = {
  planned: 'planned',
  in_progress: 'in_progress',
  certified: 'approved',
  suspended: 'on_hold',
  withdrawn: 'withdrawn',
  expired: 'expiring',
};

const CHECKLIST_VALUE: Readonly<Record<string, { meaning: ToneMeaning; value: string }>> = {
  unanswered: { meaning: 'compliance', value: 'not_assessed' },
  conforming: { meaning: 'compliance', value: 'compliant' },
  nonconforming: { meaning: 'compliance', value: 'non_compliant' },
  observation: { meaning: 'severity', value: 'observation' },
  not_applicable: { meaning: 'compliance', value: 'not_applicable' },
};

export function planStatusBadge(status: PlanStatus | string): AuditBadge {
  return {
    meaning: 'lifecycle',
    value: PLAN_VALUE[status] ?? status,
    labelKey: `audits.planStatus.${status}`,
  };
}

export function programmeStatusBadge(status: ProgrammeStatus | string): AuditBadge {
  return { meaning: 'lifecycle', value: status, labelKey: `audits.programmeStatus.${status}` };
}

export function findingTypeBadge(type: FindingType | string): AuditBadge {
  return {
    meaning: 'severity',
    value: FINDING_TYPE_VALUE[type] ?? type,
    labelKey: `audits.findingType.${type}`,
  };
}

export function findingStatusBadge(status: FindingStatus | string): AuditBadge {
  return {
    meaning: 'lifecycle',
    value: FINDING_STATUS_VALUE[status] ?? status,
    labelKey: `audits.findingStatus.${status}`,
  };
}

export function certificationStatusBadge(status: CertificationStatus | string): AuditBadge {
  return {
    meaning: 'lifecycle',
    value: CERTIFICATION_VALUE[status] ?? status,
    labelKey: `audits.certificationStatus.${status}`,
  };
}

export function riskBadge(level: RiskLevel | string): AuditBadge {
  return { meaning: 'severity', value: level, labelKey: `audits.risk.${level}` };
}

export function checklistResultBadge(result: ChecklistResult | string): AuditBadge {
  const mapped = CHECKLIST_VALUE[result] ?? { meaning: 'compliance' as const, value: result };
  return { ...mapped, labelKey: `audits.checklistResult.${result}` };
}

/** Percentage (0-100, rounded) of answered checklist questions. */
export function checklistProgress(answered: number, total: number): number {
  return total > 0 ? Math.round((answered / total) * 100) : 0;
}

/** The `YYYY-MM-DD` part of a naive UTC datetime, for a date input ('' when empty). */
export function toDateInput(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** A date input value as a naive UTC datetime at midnight, or null when blank. */
export function fromDateInput(value: string | null | undefined): string | null {
  const day = value?.trim().match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  return day ? `${day}T00:00:00` : null;
}

/** Trimmed text, or null when blank (optional API fields). */
export function textOrNull(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text ? text : null;
}

/** Display name of an audit team member (user name, else the external name). */
export function auditorName(a: {
  readonly user: { readonly name: string | null; readonly id: string } | null;
  readonly external_name: string | null;
}): string {
  return a.user?.name || a.external_name || a.user?.id || '';
}

/** The lead auditor's name: the member, else the external lead (UX audit #19). */
export function leadAuditorName(p: {
  readonly lead_auditor: { readonly name: string | null } | null;
  readonly lead_auditor_name?: string | null;
  readonly auditors?: readonly {
    readonly role: string;
    readonly user: { readonly name: string | null; readonly id: string } | null;
    readonly external_name: string | null;
  }[];
}): string | null {
  const lead = p.auditors?.find((a) => a.role === 'lead');
  return p.lead_auditor?.name || p.lead_auditor_name || (lead ? auditorName(lead) : null) || null;
}

/** Sum of the counts of `keys` (all keys when omitted) in a value -> count map. */
export function sumCounts(
  counts: Readonly<Record<string, number>>,
  keys?: readonly string[],
): number {
  return Object.entries(counts)
    .filter(([k]) => !keys || keys.includes(k))
    .reduce((n, [, v]) => n + v, 0);
}

/**
 * The frameworks a set of clause refs belongs to (`hs` refs belong to every ISO
 * standard, so they add none). Used to narrow pickers and suggestions.
 */
export function frameworksOfClauses(refs: readonly string[]): string[] {
  const out = new Set<string>();
  for (const ref of refs) {
    const { framework } = parseClause(ref);
    if (framework && framework !== 'hs') {
      out.add(framework);
    }
  }
  return [...out];
}

/** Query params of "Plan an audit for this" from a coverage gap's `suggest` prefill. */
export function planPrefillParams(
  suggest: Readonly<Record<string, readonly string[]>>,
  programmeId: string | null,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (programmeId) {
    params['programme'] = programmeId;
  }
  const map: Readonly<Record<string, string>> = {
    frameworks: 'frameworks',
    clause_refs: 'clauses',
    process_ids: 'processes',
    auditee_department_ids: 'departments',
  };
  for (const [key, param] of Object.entries(map)) {
    const values = suggest[key];
    if (values?.length) {
      params[param] = values.join(',');
    }
  }
  return params;
}

/** A comma-separated query param as a list (empty values dropped, duplicates removed). */
export function listParam(value: string | null | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}

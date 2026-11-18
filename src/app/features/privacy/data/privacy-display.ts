import { RecordRowDateKind } from '../../../shared/ui/record-row/record-row';
import { ToneMeaning } from '../../../shared/ui/tones';
import {
  ConsentRecord,
  CountryStatus,
  DataBreach,
  DataSubjectRequest,
  Dpia,
  LegalBasisAssessment,
  PrivacyRecord,
  Processor,
  RetentionSchedule,
  RopaEntry,
  TransferAssessment,
} from './privacy.models';
import { RegisterDef } from './privacy-registers';

/** Every status value across the registers (`privacy.status.<value>`). */
export function statusKey(status: string): string {
  return `privacy.status.${status}`;
}

export function optionKey(set: string, value: string): string {
  return `privacy.options.${set}.${value}`;
}

/**
 * The shared lifecycle word a privacy status is coloured as (`toneFor('lifecycle', …)`,
 * docs/ux-guide.md "Tone map"); statuses the shared map already knows pass through.
 */
const LIFECYCLE_ALIAS: Readonly<Record<string, string>> = {
  screening: 'in_progress',
  not_required: 'archived',
  awaiting_decision: 'pending_approval',
  verifying: 'in_progress',
  assessing: 'in_progress',
  notified: 'pending',
  onboarding: 'planned',
  offboarded: 'retired',
  suspended: 'on_hold',
};

/** The value to hand `app-status-badge meaning="lifecycle"` for a privacy status. */
export function statusToneValue(status: string): string {
  return LIFECYCLE_ALIAS[status] ?? status;
}

/**
 * A short fact shown as a badge on a list row or a header: an i18n key with params,
 * coloured by the shared tone map (`meaning` + `value`, see `app-status-badge`).
 */
export interface RowFact {
  readonly key: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly meaning: ToneMeaning;
  readonly value: string;
  /** A date param that the template formats (`date` key in params). */
  readonly date?: string | null;
}

const HIGH = { meaning: 'severity', value: 'high' } as const;
const MEDIUM = { meaning: 'severity', value: 'medium' } as const;
const DUE = { meaning: 'lifecycle', value: 'due' } as const;
const INFO = { meaning: 'lifecycle', value: 'received' } as const;
const NEUTRAL = { meaning: 'lifecycle', value: 'archived' } as const;
const PENDING = { meaning: 'lifecycle', value: 'pending' } as const;
const OVERDUE = { meaning: 'lifecycle', value: 'overdue' } as const;

function isClosed(register: RegisterDef, record: PrivacyRecord): boolean {
  return register.closedStatuses.includes(record.status);
}

/** The warning badges of a list row (deadlines and missing safeguards first). */
export function rowFacts(register: RegisterDef, record: PrivacyRecord): readonly RowFact[] {
  switch (register.key) {
    case 'dsr': {
      const r = record as DataSubjectRequest;
      const facts: RowFact[] = [];
      if (r.closed_at === null && r.days_remaining !== null) {
        facts.push(
          r.is_overdue
            ? { key: 'privacy.dsr.overdue', ...HIGH, date: r.effective_due_at }
            : {
                key: 'privacy.dsr.daysLeft',
                params: { days: r.days_remaining },
                ...(r.days_remaining <= 7 ? DUE : INFO),
              },
        );
      }
      if (r.extended) {
        facts.push({ key: 'privacy.dsr.extendedBadge', ...NEUTRAL });
      }
      return facts;
    }
    case 'breach': {
      const r = record as DataBreach;
      if (r.status === 'closed') {
        return [];
      }
      if (r.status === 'notified' || r.awaiting_closure) {
        return [{ key: 'privacy.breach.awaitingClosure', ...PENDING }];
      }
      return [clockFact(r)];
    }
    case 'dpia': {
      const r = record as Dpia;
      const facts: RowFact[] = [];
      if (r.screening_result === 'required' && r.status === 'screening') {
        facts.push({ key: 'privacy.dpia.requiredBadge', ...DUE });
      }
      if (r.prior_consultation_required) {
        facts.push({ key: 'privacy.dpia.priorConsultation', ...HIGH });
      }
      return [...facts, ...reviewFact(register, record)];
    }
    case 'processor': {
      const r = record as Processor;
      const dpaOk = r.dpa_status === 'signed' || r.dpa_status === 'not_required';
      const facts: RowFact[] = dpaOk ? [] : [{ key: 'privacy.processor.noDpaBadge', ...DUE }];
      if (r.country_status === 'third_country') {
        facts.push({ key: 'privacy.countryStatus.third_country', ...INFO });
      }
      return [...facts, ...reviewFact(register, record)];
    }
    case 'transfer': {
      const r = record as TransferAssessment;
      const facts: RowFact[] = [];
      if (r.tia_status === 'in_progress') {
        facts.push({ key: 'privacy.transfer.tiaOpenBadge', ...DUE });
      }
      return [...facts, ...reviewFact(register, record)];
    }
    case 'retention': {
      const r = record as RetentionSchedule;
      return r.execution_overdue
        ? [{ key: 'privacy.retention.deletionOverdue', ...OVERDUE }]
        : reviewFact(register, record);
    }
    default:
      return reviewFact(register, record);
  }
}

/** The 72-hour clock of a breach as a fact (red in the last 24 hours and after). */
export function clockFact(r: DataBreach): RowFact {
  if (r.clock_status === 'running' && r.hours_remaining !== null) {
    return {
      key: 'privacy.breach.clock.hoursLeft',
      params: { hours: Math.max(0, Math.floor(r.hours_remaining)) },
      ...(r.hours_remaining <= 24 ? HIGH : MEDIUM),
    };
  }
  const tones: Readonly<Record<string, Pick<RowFact, 'meaning' | 'value'>>> = {
    overdue: HIGH,
    late: HIGH,
    met: { meaning: 'compliance', value: 'met' },
    running: MEDIUM,
  };
  return { key: `privacy.breach.clock.${r.clock_status}`, ...(tones[r.clock_status] ?? NEUTRAL) };
}

function reviewFact(register: RegisterDef, record: PrivacyRecord): RowFact[] {
  const due = (record as { review_due_at?: string | null }).review_due_at;
  if (!due || isClosed(register, record)) {
    return [];
  }
  const overdue = new Date(`${due.slice(0, 10)}T23:59:59`).getTime() < Date.now();
  return overdue ? [{ key: 'privacy.common.reviewOverdueBadge', ...OVERDUE }] : [];
}

/** A subtitle part: an i18n key (with params) or literal text. */
export interface SubtitlePart {
  readonly key?: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly text?: string;
  /** A date the caller formats (date only). */
  readonly date?: string | null;
  /** A country code the caller names in the UI language. */
  readonly country?: string | null;
}

/** The facts an auditor scans for, per register, shown under the row title. */
export function rowSubtitle(register: RegisterDef, record: PrivacyRecord): readonly SubtitlePart[] {
  const parts: SubtitlePart[] = [];
  switch (register.key) {
    case 'ropa': {
      const r = record as RopaEntry;
      parts.push({ key: optionKey('ropaRole', r.role) });
      if (r.legal_basis) {
        parts.push({ key: optionKey('legalBasis', r.legal_basis) });
      } else {
        parts.push({ key: 'privacy.list.noLegalBasis' });
      }
      if (r.completeness && r.completeness.missing.length) {
        parts.push({
          key: 'privacy.ropa.completenessShort',
          params: { filled: r.completeness.filled, total: r.completeness.total },
        });
      }
      break;
    }
    case 'dpia': {
      const r = record as Dpia;
      parts.push({ key: optionKey('screeningResult', r.screening_result) });
      if (r.residual_risk) {
        parts.push({
          key: 'privacy.dpia.residualSummary',
          params: { level: optionKey('level', r.residual_risk) },
        });
      }
      break;
    }
    case 'dsr': {
      const r = record as DataSubjectRequest;
      parts.push({ key: optionKey('dsrType', r.request_type) });
      parts.push({ key: 'privacy.list.receivedOn', date: r.received_at });
      break;
    }
    case 'breach': {
      const r = record as DataBreach;
      if (r.risk_level) {
        parts.push({ key: optionKey('breachRisk', r.risk_level) });
      }
      parts.push({ key: 'privacy.list.awareOn', date: r.aware_at });
      break;
    }
    case 'processor': {
      const r = record as Processor;
      if (r.country) {
        parts.push({ country: r.country });
      }
      parts.push({
        key: 'privacy.processor.dpaBadge',
        params: { status: optionKey('dpaStatus', r.dpa_status) },
      });
      break;
    }
    case 'transfer': {
      const r = record as TransferAssessment;
      parts.push({ country: r.destination_country });
      parts.push({ key: optionKey('mechanism', r.mechanism) });
      break;
    }
    case 'retention': {
      const r = record as RetentionSchedule;
      parts.push(retentionPeriodPart(r));
      parts.push({ key: optionKey('disposal', r.disposal_method) });
      break;
    }
    case 'consent': {
      const r = record as ConsentRecord;
      parts.push({ key: optionKey('consentMethod', r.method) });
      parts.push({ key: 'privacy.list.givenOn', date: r.given_at });
      break;
    }
    case 'lba': {
      const r = record as LegalBasisAssessment;
      parts.push({ key: optionKey('legalBasis', r.legal_basis) });
      break;
    }
  }
  return parts;
}

/** The retention period in the UI language: "36 months" from the months, else the text. */
export function retentionPeriodPart(r: RetentionSchedule): SubtitlePart {
  if (typeof r.retention_months === 'number') {
    return { key: 'privacy.retention.months', params: { count: r.retention_months } };
  }
  return { text: r.retention_period ?? '' };
}

/** The date shown in the row's date column, and what it means. */
export function rowDate(
  register: RegisterDef,
  record: PrivacyRecord,
): { readonly date: string | null; readonly kind: RecordRowDateKind; readonly overdue: boolean } {
  if (register.key === 'dsr') {
    const r = record as DataSubjectRequest;
    return { date: r.closed_at ? null : r.effective_due_at, kind: 'due', overdue: r.is_overdue };
  }
  if (register.key === 'retention') {
    const r = record as RetentionSchedule;
    if (r.next_execution_due_at) {
      return { date: r.next_execution_due_at, kind: 'next', overdue: !!r.execution_overdue };
    }
  }
  const due = (record as { review_due_at?: string | null }).review_due_at ?? null;
  if (!due || isClosed(register, record)) {
    return {
      date: register.key === 'breach' ? (record as DataBreach).aware_at : null,
      kind: 'date',
      overdue: false,
    };
  }
  return {
    date: due,
    kind: 'next',
    overdue: new Date(`${due.slice(0, 10)}T23:59:59`).getTime() < Date.now(),
  };
}

/** The label key of a country's chapter V status. */
export function countryStatusKey(status: CountryStatus | null | undefined): string {
  return `privacy.countryStatus.${status ?? 'unknown'}`;
}

/** Where a country code stands, from the `GET /countries` lists. */
export function classifyCountry(
  code: string | null | undefined,
  lists: {
    readonly eea: readonly string[];
    readonly adequacy: readonly string[];
    readonly adequacy_partial: readonly string[];
  },
): CountryStatus {
  const c = (code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) {
    return 'unknown';
  }
  if (!lists.eea.length && !lists.adequacy.length) {
    return 'unknown';
  }
  if (lists.eea.includes(c)) {
    return 'eea';
  }
  if (lists.adequacy.includes(c)) {
    return 'adequacy';
  }
  if (lists.adequacy_partial.includes(c)) {
    return 'adequacy_partial';
  }
  return 'third_country';
}

/** The transfer tool that usually fits a country (shown as a hint on the transfer form). */
export function suggestedMechanism(status: CountryStatus): string | null {
  switch (status) {
    case 'adequacy':
      return 'adequacy';
    case 'adequacy_partial':
    case 'third_country':
      return 'sccs';
    default:
      return null;
  }
}

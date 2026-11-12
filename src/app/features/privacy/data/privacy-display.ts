import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  ClockStatus,
  DataBreach,
  DataSubjectRequest,
  Dpia,
  PrivacyRecord,
  Processor,
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

const TONES: Readonly<Record<string, BadgeTone>> = {
  draft: 'neutral',
  active: 'pass',
  retired: 'neutral',
  screening: 'info',
  not_required: 'neutral',
  in_progress: 'info',
  awaiting_decision: 'warn',
  approved: 'pass',
  rejected: 'fail',
  received: 'info',
  verifying: 'info',
  completed: 'pass',
  withdrawn: 'neutral',
  open: 'fail',
  assessing: 'warn',
  notified: 'info',
  closed: 'neutral',
  onboarding: 'info',
  offboarded: 'neutral',
  suspended: 'warn',
};

export function statusTone(status: string): BadgeTone {
  return TONES[status] ?? 'neutral';
}

const CLOCK_TONES: Readonly<Record<ClockStatus, BadgeTone>> = {
  running: 'warn',
  overdue: 'fail',
  met: 'pass',
  late: 'fail',
  not_required: 'neutral',
};

export function clockTone(status: ClockStatus): BadgeTone {
  return CLOCK_TONES[status] ?? 'neutral';
}

/** A short fact shown on a list row: an i18n key with params and a tone. */
export interface RowFact {
  readonly key: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly tone: BadgeTone | 'plain';
  /** A date param that the template formats (`date` key in params). */
  readonly date?: string | null;
}

function isClosed(register: RegisterDef, record: PrivacyRecord): boolean {
  return register.closedStatuses.includes(record.status);
}

/** The register-specific facts of a list row (deadlines first). */
export function rowFacts(register: RegisterDef, record: PrivacyRecord): readonly RowFact[] {
  switch (register.key) {
    case 'dsr': {
      const r = record as DataSubjectRequest;
      const facts: RowFact[] = [{ key: optionKey('dsrType', r.request_type), tone: 'plain' }];
      if (r.closed_at === null && r.days_remaining !== null) {
        facts.push(
          r.is_overdue
            ? { key: 'privacy.dsr.overdue', tone: 'fail', date: r.effective_due_at }
            : {
                key: 'privacy.dsr.daysLeft',
                params: { days: r.days_remaining },
                tone: r.days_remaining <= 7 ? 'warn' : 'info',
                date: r.effective_due_at,
              },
        );
      }
      if (r.extended) {
        facts.push({ key: 'privacy.dsr.extendedBadge', tone: 'neutral' });
      }
      return facts;
    }
    case 'breach': {
      const r = record as DataBreach;
      const facts: RowFact[] = [];
      if (r.risk_level) {
        facts.push({ key: optionKey('breachRisk', r.risk_level), tone: 'plain' });
      }
      facts.push(clockFact(r));
      return facts;
    }
    case 'dpia': {
      const r = record as Dpia;
      const facts: RowFact[] = [
        {
          key: optionKey('screeningResult', r.screening_result),
          tone: r.screening_result === 'required' ? 'warn' : 'plain',
        },
      ];
      if (r.prior_consultation_required) {
        facts.push({ key: 'privacy.dpia.priorConsultation', tone: 'fail' });
      }
      return [...facts, ...reviewFact(register, record)];
    }
    case 'processor': {
      const r = record as Processor;
      const dpaOk = r.dpa_status === 'signed' || r.dpa_status === 'not_required';
      return [
        {
          key: 'privacy.processor.dpaBadge',
          params: { status: optionKey('dpaStatus', r.dpa_status) },
          tone: dpaOk ? 'pass' : 'warn',
        },
        ...reviewFact(register, record),
      ];
    }
    case 'transfer': {
      const r = record as TransferAssessment;
      return [
        {
          key: 'privacy.transfer.destination',
          params: { country: r.destination_country },
          tone: 'plain',
        },
        { key: optionKey('mechanism', r.mechanism), tone: 'plain' },
        {
          key: 'privacy.transfer.tiaBadge',
          params: { status: optionKey('tiaStatus', r.tia_status) },
          tone: r.tia_status === 'in_progress' ? 'warn' : 'neutral',
        },
        ...reviewFact(register, record),
      ];
    }
    default:
      return reviewFact(register, record);
  }
}

/** The 72-hour clock of a breach as a row fact. */
export function clockFact(r: DataBreach): RowFact {
  if (r.clock_status === 'running' && r.hours_remaining !== null) {
    return {
      key: 'privacy.breach.clock.hoursLeft',
      params: { hours: Math.max(0, Math.floor(r.hours_remaining)) },
      tone: r.hours_remaining <= 24 ? 'fail' : 'warn',
    };
  }
  return { key: `privacy.breach.clock.${r.clock_status}`, tone: clockTone(r.clock_status) };
}

function reviewFact(register: RegisterDef, record: PrivacyRecord): RowFact[] {
  const due = (record as { review_due_at?: string | null }).review_due_at;
  if (!due || isClosed(register, record)) {
    return [];
  }
  const overdue = new Date(`${due.slice(0, 10)}T23:59:59`).getTime() < Date.now();
  return [
    {
      key: overdue ? 'privacy.common.reviewOverdue' : 'privacy.common.reviewDue',
      tone: overdue ? 'fail' : 'plain',
      date: due,
    },
  ];
}

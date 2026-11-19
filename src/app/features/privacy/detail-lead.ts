import { RecordMissingItem } from '../../shared/kit/record-detail-layout';
import { StatusLineTone } from '../../shared/kit/record-sections';
import {
  DataBreach,
  DataSubjectRequest,
  Dpia,
  PrivacyGap,
  PrivacyRecord,
  RopaEntry,
  TransferAssessment,
} from './data/privacy.models';
import { RegisterKey } from './data/privacy-registers';
import { gapKindKey, splitRoute } from './privacy-gaps';

/** One field of "Hovedinformasjon": the record field and, optionally, a plainer label. */
export interface LeadField {
  readonly key: string;
  readonly labelKey?: string;
}

const lead = (register: string, ...keys: string[]): readonly LeadField[] =>
  keys.map((key) => ({ key, labelKey: `privacy.lead.${register}.${key}` }));

/**
 * The 2-4 fields a reader comes to each kind of privacy record for
 * (docs/ux-guide.md §2.7, rule 3). Everything else sits under "Flere detaljer".
 * The breach's two notification decisions are added by the page itself.
 */
export const LEAD_FIELDS: Readonly<Record<RegisterKey, readonly LeadField[]>> = {
  // What we use the data for, on what legal basis, whose data and which data.
  ropa: lead('ropa', 'purposes', 'legal_basis', 'data_subject_categories', 'data_categories'),
  // Which processing is assessed, why a DPIA is needed, the measures and what risk is left.
  dpia: lead('dpia', 'ropa_entry_id', 'screening', 'measures', 'residual_risk'),
  // What the person asks for, who they are, and what we did.
  dsr: lead('dsr', 'request_type', 'requester_name', 'outcome'),
  // What happened and how serious it is for the people affected.
  breach: lead('breach', 'description', 'risk_level'),
  // Where the data goes, on what basis, and whether that is safe.
  transfer: lead(
    'transfer',
    'destination_country',
    'mechanism',
    'tia_conclusion',
    'supplementary_measures',
  ),
  processor: [
    { key: 'dpa_contract_id' },
    { key: 'dpa_status' },
    { key: 'country' },
    { key: 'data_categories' },
  ],
  retention: [
    { key: 'data_category' },
    { key: 'retention_months' },
    { key: 'trigger_event' },
    { key: 'disposal_method' },
  ],
  consent: [{ key: 'subject_reference' }, { key: 'method' }, { key: 'notice_document_id' }],
  lba: [
    { key: 'legal_basis' },
    { key: 'justification' },
    { key: 'balancing_test' },
    { key: 'safeguards' },
  ],
};

/** The status sentence of "Hovedinformasjon": an i18n key, its params and its tone. */
export interface StatusSentence {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly tone: StatusLineTone;
}

/** Helpers the sentence needs from the page (formatting, names). */
export interface SentenceContext {
  readonly day: (iso: string | null | undefined) => string;
  readonly moment: (iso: string | null | undefined) => string;
  readonly userName: (id: string | null | undefined) => string;
  readonly country: (code: string | null | undefined) => string;
  /** The status as a word ("Under arbeid"). */
  readonly status: (status: string) => string;
}

const OPEN_DSR = ['received', 'verifying', 'in_progress'];

const DPIA_KEYS: Readonly<Record<string, true>> = {
  screening: true,
  in_progress: true,
  awaiting_decision: true,
};

/**
 * "Status – what it means" for the record (docs/ux-guide.md §2.7, rule 4), or null
 * when the badge in the header says enough. Open work is `warn`, never `fail`;
 * only a legal deadline that has passed is `fail`.
 */
export function statusSentence(
  register: RegisterKey,
  record: PrivacyRecord,
  ctx: SentenceContext,
): StatusSentence | null {
  const s = record.status;
  const k = (key: string) => `privacy.lead.status.${register}.${key}`;
  const say = (
    key: string,
    tone: StatusLineTone,
    params: Record<string, unknown> = {},
  ): StatusSentence => ({ key: k(key), params, tone });
  switch (register) {
    case 'ropa': {
      const c = (record as RopaEntry).completeness;
      const missing = c ? c.total - c.filled : 0;
      if (s === 'retired') {
        return say('retired', 'neutral');
      }
      if (s === 'active') {
        return missing > 0
          ? say('activeIncomplete', 'warn', { count: missing })
          : say('active', 'pass');
      }
      return missing > 0 && c
        ? say('draft', 'warn', { filled: c.filled, total: c.total })
        : say('draftComplete', 'warn');
    }
    case 'dpia': {
      const d = record as Dpia;
      if (s === 'approved' || s === 'rejected') {
        return say(s, s === 'approved' ? 'pass' : 'warn', {
          name: ctx.userName(d.decided_by),
          date: ctx.day(d.decided_at),
        });
      }
      if (s === 'not_required') {
        return say('not_required', 'neutral');
      }
      return say(s in DPIA_KEYS ? s : 'in_progress', 'warn');
    }
    case 'dsr': {
      const r = record as DataSubjectRequest;
      if (OPEN_DSR.includes(s) && !r.closed_at) {
        if (r.is_overdue) {
          return say('overdue', 'fail', { date: ctx.day(r.effective_due_at) });
        }
        return say('open', 'warn', {
          status: ctx.status(s),
          date: ctx.day(r.effective_due_at),
          days: r.days_remaining ?? 0,
        });
      }
      if (s === 'completed') {
        return say('completed', 'pass', { date: ctx.day(r.responded_at ?? r.closed_at) });
      }
      return say(s === 'rejected' ? 'rejected' : 'withdrawn', 'neutral', {
        date: ctx.day(r.closed_at),
      });
    }
    case 'breach': {
      const b = record as DataBreach;
      if (s === 'closed') {
        return say('closed', 'pass', { date: ctx.day(b.closed_at) });
      }
      if (s === 'notified') {
        return say('notified', 'warn');
      }
      if (b.clock_status === 'overdue') {
        return say('overdue', 'fail', { deadline: ctx.moment(b.notification_deadline) });
      }
      if (b.clock_status === 'running' && b.hours_remaining !== null) {
        return say('running', 'warn', {
          status: ctx.status(s),
          hours: Math.max(0, Math.floor(b.hours_remaining)),
          deadline: ctx.moment(b.notification_deadline),
        });
      }
      return say('decide', 'warn', { status: ctx.status(s) });
    }
    case 'transfer': {
      const t = record as TransferAssessment;
      const country = ctx.country(t.destination_country);
      if (s === 'active') {
        return say('active', 'pass', { country });
      }
      if (s === 'suspended') {
        return say('suspended', 'warn', { country });
      }
      if (s === 'retired') {
        return say('retired', 'neutral', { country });
      }
      return say('draft', 'warn', { country });
    }
    default:
      return null;
  }
}

/** Gap kinds whose title starts with the record's own code ("ROPA-0003 mangler …"). */
const CODE_FIRST = new Set([
  'lia_missing',
  'dpia_missing',
  'transfer_missing',
  'dpa_missing',
  'retention_missing',
  'ropa_incomplete',
]);

/** The inputs of {@link privacyMissing}. */
export interface MissingInput {
  readonly register: RegisterKey;
  readonly record: PrivacyRecord;
  readonly gaps: readonly PrivacyGap[];
  /** The text params of a gap (see `gapParams`). */
  readonly gapParams: (gap: PrivacyGap) => Record<string, unknown>;
  /** "Denne posten" in the UI language (replaces the code on the record's own page). */
  readonly thisRecord: string;
  /** Field labels, joined (for the Art. 30 line). */
  readonly fieldList: (keys: readonly string[]) => string;
  readonly editLink: readonly unknown[] | null;
  readonly closed: boolean;
  readonly reviewOverdue: boolean;
  readonly reviewDue: string;
}

/**
 * What is still missing for a privacy record ("Oppfølging", docs/ux-guide.md §2.7):
 * the register gaps with their prefilled fix, the Art. 30 facts of a processing
 * activity, an overdue review and a missing owner. Each line is a link.
 */
export function privacyMissing(input: MissingInput): RecordMissingItem[] {
  const { record, register, editLink } = input;
  const items: RecordMissingItem[] = [];
  for (const gap of input.gaps) {
    const fix = splitRoute(gap.fix.url);
    const params = input.gapParams(gap);
    items.push({
      key: `gap:${gap.key}`,
      labelKey: `${gapKindKey(gap.kind)}.title`,
      params: CODE_FIRST.has(gap.kind) ? { ...params, code: input.thisRecord } : params,
      link: fix.path,
      queryParams: fix.query ?? undefined,
    });
  }
  const art30 = register === 'ropa' ? ((record as RopaEntry).completeness?.missing ?? []) : [];
  if (art30.length && editLink && !input.gaps.some((g) => g.kind === 'ropa_incomplete')) {
    items.push({
      key: 'art30',
      labelKey: 'privacy.missing.art30',
      params: { fields: input.fieldList(art30) },
      link: editLink,
    });
  }
  if (input.reviewOverdue && !input.closed && editLink) {
    items.push({
      key: 'review',
      labelKey: 'privacy.missing.review',
      params: { date: input.reviewDue },
      link: editLink,
    });
  }
  if (!record.owner_user_id && !input.closed && editLink) {
    items.push({ key: 'owner', labelKey: 'privacy.missing.owner', link: editLink });
  }
  return items;
}

/** Whether a review date (a calendar day) has passed. */
export function isPastDay(day: string | null | undefined, now = Date.now()): boolean {
  return !!day && new Date(`${day.slice(0, 10)}T23:59:59`).getTime() < now;
}

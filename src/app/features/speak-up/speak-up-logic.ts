import {
  DATE_TIME_FORMAT as DATE_TIME,
  formatDueDay,
  formatLocalDate,
} from '../../shared/locale/locale-pipes';
import { withUtcDefault } from '../../core/i18n/locale';
import {
  Affected,
  CaseItem,
  KINDS,
  NextStep,
  Proposal,
  SPEAK_UP_TYPES,
  Severity,
  SpeakUpRequest,
  SpeakUpType,
} from './data/speak-up.models';

/** The editable form of step 2 ("Sjekk forslaget"). */
export interface SpeakUpForm {
  readonly type: SpeakUpType;
  readonly kind: string | null;
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly affected: readonly Affected[];
  readonly ownerId: string | null;
  /** `YYYY-MM-DD` (date input), or '' for none. */
  readonly due: string;
  readonly immediate: string;
  readonly customerName: string;
}

const DUE_DAYS: Record<Severity, number> = { high: 7, medium: 14, low: 30 };

/** The chips of step 1, in prototype order, limited to the types the caller may file. */
export function chipTypes(available: ReadonlySet<string>): SpeakUpType[] {
  return SPEAK_UP_TYPES.filter((t) => available.has(t));
}

/** A short title from free text (first sentence, at most 80 characters). */
export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  return sentence.length > 80 ? `${sentence.slice(0, 79).trimEnd()}…` : sentence;
}

/** `YYYY-MM-DD` of a date, in local time. */
export function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The form from a proposal. */
export function formFromProposal(p: Proposal): SpeakUpForm {
  return {
    type: p.type,
    kind: p.kind,
    title: p.title,
    description: p.description,
    severity: p.severity,
    affected: p.affected,
    ownerId: p.owner?.user_id ?? null,
    due: p.due_at && !p.deadline ? dayOf(new Date(withUtcDefault(p.due_at))) : '',
    immediate: p.immediate_actions ?? '',
    customerName: '',
  };
}

/** The form when no proposal is available: the chip's type, the user's text, defaults. */
export function fallbackForm(
  text: string,
  type: SpeakUpType,
  meId: string | null,
  now: Date = new Date(),
): SpeakUpForm {
  const severity: Severity = type === 'data_breach' ? 'high' : 'medium';
  const due = new Date(now);
  due.setDate(due.getDate() + DUE_DAYS[severity]);
  return {
    type,
    kind: type === 'near_miss' ? 'near_miss' : type === 'security_incident' ? 'other' : null,
    title: titleFrom(text),
    description: text.trim(),
    severity,
    affected: [],
    ownerId: meId,
    due: type === 'data_breach' ? '' : dayOf(due),
    immediate: '',
    customerName: '',
  };
}

/** The 72-hour GDPR deadline the breach type always carries (also without a proposal). */
export function breachDeadline(now: Date = new Date()): string {
  return new Date(now.getTime() + 72 * 3600 * 1000).toISOString();
}

/** A complaint needs a customer when none is among the affected records. */
export function needsCustomerName(form: SpeakUpForm): boolean {
  return form.type === 'complaint' && !form.affected.some((a) => a.entity_type === 'customer');
}

/** The request body of `POST /speak-up`. */
export function toRequest(form: SpeakUpForm): SpeakUpRequest {
  const kinds = KINDS[form.type];
  return {
    type: form.type,
    kind: kinds && form.kind && kinds.includes(form.kind) ? form.kind : null,
    title: form.title.trim(),
    description: form.description.trim() || null,
    severity: form.severity,
    owner_user_id: form.ownerId,
    due_at: form.due ? `${form.due}T12:00:00` : null,
    affected: form.affected.map((a) => ({ entity_type: a.entity_type, id: a.id })),
    immediate_actions: form.immediate.trim() || null,
    customer_name: needsCustomerName(form) ? form.customerName.trim() || null : null,
  };
}

/** The i18n key of a next step: the "no date" variant when its date is missing. */
export function nextStepKey(step: NextStep): string {
  const dated = ['ownerFollowsUp', 'complaintAnswer'];
  if (dated.includes(step.key) && !step.params['due']) {
    return `speakup.next.${step.key}NoDate`;
  }
  return `speakup.next.${step.key}`;
}

/** The "Frist" column: a pill when overdue or due within 7 days, else a muted day. */
export interface DueCell {
  readonly text: string;
  readonly tone: 'bad' | 'warn' | null;
}

export function dueCell(
  item: Pick<CaseItem, 'due_at' | 'tone'>,
  locale: string,
  now: Date = new Date(),
): DueCell | null {
  if (!item.due_at) {
    return null;
  }
  const at = new Date(withUtcDefault(item.due_at));
  const ms = at.getTime() - now.getTime();
  if (ms < 0) {
    return { text: formatDueDay(dayOf(at), locale, now), tone: 'bad' };
  }
  if (ms < 7 * 24 * 3600 * 1000) {
    const weekday = formatLocalDate(item.due_at, 'EEEE', locale);
    const time = formatLocalDate(item.due_at, 'shortTime', locale);
    const text = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${time}`;
    return { text, tone: item.tone === 'bad' ? 'bad' : 'warn' };
  }
  return { text: formatDueDay(dayOf(at), locale, now), tone: null };
}

/**
 * A near deadline in words: nb "fredag kl. 14:10", en "Friday 2:10 PM"; a date when it
 * is a week or more away.
 */
export function whenText(iso: string, locale: string, now: Date = new Date()): string {
  const at = new Date(withUtcDefault(iso));
  if (at.getTime() - now.getTime() >= 6 * 24 * 3600 * 1000 || at.getTime() < now.getTime()) {
    return formatLocalDate(iso, DATE_TIME, locale);
  }
  const weekday = formatLocalDate(iso, 'EEEE', locale);
  const time = formatLocalDate(iso, 'shortTime', locale);
  return locale === 'nb' ? `${weekday} kl. ${time}` : `${weekday} ${time}`;
}

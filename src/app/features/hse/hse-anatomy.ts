import type { RecordMissingItem } from '../../shared/kit/record-page-context';
import type { StatusLineTone } from '../../shared/kit/record-sections';
import { Consultation, Ppe, Sja } from './data/hse.models';
import { incompleteSteps } from './hse-format';

/**
 * Detail-page anatomy (docs/ux-guide.md §2.7) for the HSE records (SJA, PPE,
 * worker consultation): the status sentence of "Hovedinformasjon" and the
 * actionable lines of the "Oppfølging" card.
 */

/** A status sentence: an i18n key, its params and the tone. */
export interface StatusSentence {
  readonly key: string;
  readonly params?: Record<string, unknown>;
  readonly tone: StatusLineTone;
}

/** "Godkjent – arbeidet kan gjøres med tiltakene i analysen." Open work is amber, never red. */
export function sjaStatusSentence(sja: Pick<Sja, 'status'>): StatusSentence {
  const key = `hse.sja.statusLine.${sja.status}`;
  switch (sja.status) {
    case 'approved':
    case 'completed':
      return { key, tone: 'pass' };
    case 'cancelled':
      return { key, tone: 'neutral' };
    default:
      return { key, tone: 'warn' };
  }
}

/** What an SJA still needs before the work can start safely. */
export function sjaMissing(
  sja: Sja,
  options: {
    readonly editLink: readonly unknown[];
    /** The user may edit the analysis now (draft or in review, `hse:write`). */
    readonly editable: boolean;
    /** The user may record sign-offs (`hse:write`). */
    readonly canWrite: boolean;
    /** Scrolls to the participants, or null. */
    readonly showParticipants: (() => void) | null;
  },
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  const { editLink, editable } = options;
  if (editable) {
    if (!sja.steps.length) {
      items.push({ key: 'steps', labelKey: 'hse.sja.missing.steps', link: editLink });
    } else {
      const open = incompleteSteps(sja.steps).map((i) => i + 1);
      if (open.length) {
        items.push({
          key: 'incomplete',
          labelKey: 'hse.sja.missing.incomplete',
          params: { steps: open.join(', ') },
          link: editLink,
        });
      }
    }
    if (!sja.participants.length && !(sja.participant_users ?? []).length) {
      items.push({ key: 'participants', labelKey: 'hse.sja.missing.participants', link: editLink });
    }
    if (!sja.emergency_measures?.trim()) {
      items.push({ key: 'emergency', labelKey: 'hse.sja.missing.emergency', link: editLink });
    }
    if (!sja.owner) {
      items.push({ key: 'owner', labelKey: 'hse.sja.missing.owner', link: editLink });
    }
  }
  const signOff = sja.sign_off;
  const signable = sja.status === 'in_review' || sja.status === 'approved';
  if (signable && signOff && signOff.expected > 0 && !signOff.complete && options.canWrite) {
    const count = signOff.expected - signOff.signed;
    items.push({
      key: 'signOff',
      labelKey: count === 1 ? 'hse.sja.missing.signOffOne' : 'hse.sja.missing.signOff',
      params: { count },
      ...(options.showParticipants ? { action: options.showParticipants } : {}),
    });
  }
  if (options.canWrite && sja.status !== 'cancelled' && sja.status !== 'completed') {
    const none = (sja.ppe_coverage ?? []).filter((c) => c.warning === 'none').length;
    if (none > 0) {
      items.push({
        key: 'ppe',
        labelKey: 'hse.sja.missing.ppe',
        params: { count: none },
        link: ['/hse/ppe/new'],
      });
    }
  }
  return items;
}

/** "Utlevert – i bruk hos Ola Nordmann." Expired is red (do not use); a due inspection is amber. */
export function ppeStatusSentence(
  ppe: Pick<
    Ppe,
    'status' | 'expired' | 'inspection_overdue' | 'overdue' | 'holder' | 'holder_name'
  >,
): StatusSentence {
  const base = 'hse.ppe.statusLine.';
  if (ppe.status === 'retired') {
    return { key: base + 'retired', tone: 'neutral' };
  }
  if (ppe.expired) {
    return { key: base + 'expired', tone: 'fail' };
  }
  if (ppe.inspection_overdue || ppe.overdue) {
    return { key: base + 'inspectionOverdue', tone: 'warn' };
  }
  if (ppe.status === 'out_of_service') {
    return { key: base + 'out_of_service', tone: 'warn' };
  }
  if (ppe.status === 'issued') {
    const name = ppe.holder?.name || ppe.holder_name;
    return name
      ? { key: base + 'issuedTo', params: { name }, tone: 'pass' }
      : { key: base + 'issued', tone: 'pass' };
  }
  return { key: base + 'in_stock', tone: 'pass' };
}

/** What a PPE item needs now: an inspection, a deviation after a failed one, a plan, an owner. */
export function ppeMissing(
  ppe: Ppe,
  options: {
    readonly editLink: readonly unknown[];
    readonly canWrite: boolean;
    /** Opens the inspection panel. */
    readonly inspect: () => void;
    /** Starts "Opprett avvik" after a failed inspection, or null (no failure / no permission). */
    readonly deviation: (() => void) | null;
  },
): RecordMissingItem[] {
  if (!options.canWrite || ppe.status === 'retired') {
    return [];
  }
  const items: RecordMissingItem[] = [];
  if (ppe.expired) {
    items.push({ key: 'expired', labelKey: 'hse.ppe.missing.expired', link: options.editLink });
  } else if (ppe.inspection_overdue || ppe.overdue) {
    items.push({ key: 'inspect', labelKey: 'hse.ppe.missing.inspect', action: options.inspect });
  }
  if (options.deviation) {
    items.push({
      key: 'deviation',
      labelKey: 'hse.ppe.missing.deviation',
      action: options.deviation,
    });
  }
  if (!ppe.next_inspection_at && !ppe.inspection_interval_days) {
    items.push({ key: 'plan', labelKey: 'hse.ppe.missing.plan', link: options.editLink });
  }
  if (!ppe.responsible) {
    items.push({ key: 'owner', labelKey: 'hse.ppe.missing.owner', link: options.editLink });
  }
  return items;
}

/** A planned consultation whose date has passed (it should be recorded as held). */
export function consultationPassed(
  c: Pick<Consultation, 'status' | 'scheduled_at'>,
  now = Date.now(),
): boolean {
  const at = c.scheduled_at;
  return (
    c.status === 'planned' &&
    !!at &&
    new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(at) ? at : `${at}Z`).getTime() < now
  );
}

/**
 * "Gjennomført 3. nov. 2026 – med verneombud til stede." `date` formats a date-time
 * for the sentence.
 */
export function consultationStatusSentence(
  c: Pick<Consultation, 'status' | 'scheduled_at' | 'held_at' | 'worker_representative_present'>,
  date: (value: string) => string,
  now = Date.now(),
): StatusSentence {
  const base = 'hse.consultation.statusLine.';
  if (c.status === 'cancelled') {
    return { key: base + 'cancelled', tone: 'neutral' };
  }
  if (c.status === 'held') {
    const params = c.held_at ? { date: date(c.held_at) } : undefined;
    if (!c.worker_representative_present) {
      return { key: base + (params ? 'heldNoRepOn' : 'heldNoRep'), params, tone: 'warn' };
    }
    return { key: base + (params ? 'heldOn' : 'held'), params, tone: 'pass' };
  }
  if (consultationPassed(c, now)) {
    return { key: base + 'passed', tone: 'warn' };
  }
  return c.scheduled_at
    ? { key: base + 'plannedOn', params: { date: date(c.scheduled_at) }, tone: 'info' }
    : { key: base + 'planned', tone: 'warn' };
}

/** What a consultation still needs: recording, decisions turned into tasks, representatives. */
export function consultationMissing(
  c: Consultation,
  options: {
    readonly editLink: readonly unknown[];
    readonly canWrite: boolean;
    /** Opens the "mark as held" panel. */
    readonly hold: () => void;
    readonly now?: number;
  },
): RecordMissingItem[] {
  if (!options.canWrite || c.status === 'cancelled') {
    return [];
  }
  const items: RecordMissingItem[] = [];
  const { editLink } = options;
  const reps = (c.representative_users ?? []).length + (c.worker_representatives ?? []).length;
  if (c.status === 'planned') {
    if (consultationPassed(c, options.now)) {
      items.push({ key: 'hold', labelKey: 'hse.consultation.missing.hold', action: options.hold });
    }
    if (!c.scheduled_at) {
      items.push({ key: 'date', labelKey: 'hse.consultation.missing.date', link: editLink });
    }
    if (!c.topics?.trim()) {
      items.push({ key: 'topics', labelKey: 'hse.consultation.missing.topics', link: editLink });
    }
    if (reps === 0) {
      items.push({ key: 'reps', labelKey: 'hse.consultation.missing.reps', link: editLink });
    }
  } else {
    if (!c.decisions?.trim() && !c.summary?.trim()) {
      items.push({
        key: 'outcome',
        labelKey: 'hse.consultation.missing.outcome',
        link: editLink,
      });
    }
    if (c.decisions?.trim() && !c.actions?.total) {
      items.push({
        key: 'tasks',
        labelKey: 'hse.consultation.missing.tasks',
        link: ['/hse/consultations', c.id],
        queryParams: { tab: 'tasks' },
      });
    }
    if ((c.actions?.overdue ?? 0) > 0) {
      items.push({
        key: 'overdue',
        labelKey:
          c.actions.overdue === 1
            ? 'hse.consultation.missing.overdueOne'
            : 'hse.consultation.missing.overdue',
        params: { count: c.actions.overdue },
        link: ['/hse/consultations', c.id],
        queryParams: { tab: 'tasks' },
      });
    }
  }
  if (!c.owner) {
    items.push({ key: 'owner', labelKey: 'hse.consultation.missing.owner', link: editLink });
  }
  return items;
}

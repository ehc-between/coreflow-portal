import { RecordMissingItem } from '../../../shared/kit/record-detail-layout';
import { StatusLineTone } from '../../../shared/kit/record-sections';
import { ControlledStatus, Policy, Responsibility, ScopeStatement } from '../data/context.models';

/** The record kinds on the leadership detail page (scope, policy, roles). */
export type LeadershipKind = 'scope' | 'policy' | 'responsibility';

/** What the "Oppfølging" card needs to build the missing lines. */
export interface MissingContext {
  readonly editLink: readonly unknown[];
  readonly reviewOverdue: boolean;
  /** "Merk som gjennomgått" when the user may do it, else null. */
  readonly review: (() => void) | null;
  /** "Kommuniser" (policy) when the user may do it, else null. */
  readonly communicate?: (() => void) | null;
}

/** Tone of the status sentence of an approval-controlled record (done is green). */
export const CONTROLLED_TONE: Readonly<Record<ControlledStatus, StatusLineTone>> = {
  approved: 'pass',
  in_review: 'info',
  draft: 'warn',
  retired: 'neutral',
};

/**
 * The status sentence of a responsibility: the RACI gaps first (no "A", no "R",
 * the same person doing and approving), else "Fullstendig". Archived is neutral.
 */
export function raciStatus(r: Responsibility): { key: string; tone: StatusLineTone } {
  if (r.status === 'archived') {
    return { key: 'context.leadDetail.status.responsibility.archived', tone: 'neutral' };
  }
  const order = ['no_accountable', 'no_responsible', 'segregation_of_duties'];
  const first = order.find((w) => r.warnings?.includes(w));
  return first
    ? { key: `context.raci.warningText.${first}`, tone: 'warn' }
    : { key: 'context.leadDetail.status.responsibility.ok', tone: 'pass' };
}

function blank(value: string | null | undefined): boolean {
  return !value?.trim();
}

/** What a scope still needs ("Oppfølging", docs/ux-guide.md §2.7). */
function scopeMissing(r: ScopeStatement, ctx: MissingContext): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (r.warnings?.includes('soa_missing')) {
    items.push({ key: 'soa', labelKey: 'context.leadDetail.missing.soa', link: '/standards/soa' });
  }
  if (blank(r.statement)) {
    items.push({
      key: 'statement',
      labelKey: 'context.leadDetail.missing.scopeStatement',
      link: ctx.editLink,
    });
  }
  if (blank(r.products_services)) {
    items.push({
      key: 'products',
      labelKey: 'context.leadDetail.missing.products',
      link: ctx.editLink,
    });
  }
  if (!r.processes?.length) {
    items.push({
      key: 'processes',
      labelKey: 'context.leadDetail.missing.processes',
      link: ctx.editLink,
    });
  }
  return items;
}

/** What a policy still needs. */
function policyMissing(r: Policy, ctx: MissingContext): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (blank(r.statement)) {
    items.push({
      key: 'statement',
      labelKey: 'context.leadDetail.missing.policyStatement',
      link: ctx.editLink,
    });
  }
  if (!r.documents?.length) {
    items.push({
      key: 'document',
      labelKey: 'context.leadDetail.missing.document',
      link: ctx.editLink,
    });
  }
  if (r.status === 'approved' && !(r.acknowledgements?.total ?? 0) && ctx.communicate) {
    items.push({
      key: 'communicate',
      labelKey: 'context.leadDetail.missing.communicate',
      action: ctx.communicate,
    });
  }
  return items;
}

/** What a responsibility still needs. */
function raciMissing(r: Responsibility, ctx: MissingContext): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  const has = (letter: string) => r.assignments.some((a) => a.raci === letter);
  if (!has('A')) {
    items.push({
      key: 'accountable',
      labelKey: 'context.leadDetail.missing.accountable',
      link: ctx.editLink,
    });
  }
  if (!has('R')) {
    items.push({
      key: 'responsible',
      labelKey: 'context.leadDetail.missing.responsible',
      link: ctx.editLink,
    });
  }
  if (blank(r.description)) {
    items.push({
      key: 'description',
      labelKey: 'context.leadDetail.missing.raciDescription',
      link: ctx.editLink,
    });
  }
  return items;
}

/**
 * The actionable lines at the top of the "Oppfølging" card: an overdue review
 * first, then what the record type needs (main fields, connections), then the
 * owner.
 */
export function leadershipMissing(
  kind: LeadershipKind,
  record: ScopeStatement | Policy | Responsibility,
  ctx: MissingContext,
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (ctx.reviewOverdue && ctx.review) {
    items.push({
      key: 'review',
      labelKey: 'context.leadDetail.missing.review',
      action: ctx.review,
    });
  }
  if (kind === 'scope') {
    items.push(...scopeMissing(record as ScopeStatement, ctx));
  } else if (kind === 'policy') {
    items.push(...policyMissing(record as Policy, ctx));
  } else {
    items.push(...raciMissing(record as Responsibility, ctx));
  }
  if (!record.owner) {
    items.push({
      key: 'owner',
      labelKey:
        kind === 'responsibility'
          ? 'context.leadDetail.missing.maintainer'
          : 'context.leadDetail.missing.owner',
      link: ctx.editLink,
    });
  }
  return items;
}

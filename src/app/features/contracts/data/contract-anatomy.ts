import { StatusLineTone } from '../../../shared/kit/record-sections';
import { Contract, ContractAction, ContractWarning, Party } from './contract.models';
import { isClosedContract } from './contract-display';

/** The status sentence at the top of "Hovedinformasjon" (docs/ux-guide.md §2.7). */
export interface ContractStatusSentence {
  readonly key: string;
  readonly tone: StatusLineTone;
  /** `date` param (end date or termination date), raw ISO; the page formats it. */
  readonly date: string | null;
}

/**
 * "Aktiv – gjelder til 22. jan. 2027." Green only for a contract in force; open work
 * (draft, approval, signing) is amber, a closed contract is neutral.
 */
export function contractStatusSentence(c: Contract): ContractStatusSentence {
  switch (c.status) {
    case 'draft':
      return { key: 'contracts.detail.statusLine.draft', tone: 'warn', date: null };
    case 'in_review':
      return { key: 'contracts.detail.statusLine.in_review', tone: 'info', date: null };
    case 'approved':
      return { key: 'contracts.detail.statusLine.approved', tone: 'warn', date: null };
    case 'active':
      return c.end_date
        ? {
            key: c.auto_renew
              ? 'contracts.detail.statusLine.activeRenews'
              : 'contracts.detail.statusLine.activeUntil',
            tone: 'pass',
            date: c.end_date,
          }
        : { key: 'contracts.detail.statusLine.activeOpen', tone: 'pass', date: null };
    case 'terminated':
      return c.termination_date
        ? {
            key: 'contracts.detail.statusLine.terminatedOn',
            tone: 'neutral',
            date: c.termination_date,
          }
        : { key: 'contracts.detail.statusLine.terminated', tone: 'neutral', date: null };
    case 'expired':
      return { key: 'contracts.detail.statusLine.expired', tone: 'neutral', date: null };
    default:
      return { key: 'contracts.detail.statusLine.unknown', tone: 'neutral', date: null };
  }
}

/** The other side(s) of the contract: every party that is not our own organisation. */
export function counterpartiesOf(c: Contract): readonly Party[] {
  return c.parties.filter((p) => !p.is_internal);
}

/** Where a to-do line of the "Oppfølging" card takes the user. */
export type ContractTodoTarget =
  | { readonly kind: 'edit' }
  | { readonly kind: 'section'; readonly id: string }
  | { readonly kind: 'action'; readonly action: ContractAction };

export interface ContractTodo {
  readonly key: string;
  readonly labelKey: string;
  readonly target: ContractTodoTarget;
}

/** Section anchors on the Details tab (the to-do lines scroll to them). */
export const CONTRACT_SECTIONS = {
  parties: 'contract-parties',
  dpa: 'contract-dpa',
  versions: 'contract-versions',
  keyDates: 'contract-key-dates',
} as const;

const EDIT: ContractTodoTarget = { kind: 'edit' };

/**
 * What is missing on the contract, as actionable lines (most important first): the
 * server's warnings, phrased as the thing to do, plus a contract without a
 * counterparty. Nothing for closed contracts or for people who cannot edit.
 */
export function contractTodos(c: Contract): readonly ContractTodo[] {
  if (!c.can_edit || isClosedContract(c.status)) {
    return [];
  }
  const can = (a: ContractAction) => c.allowed_actions.includes(a);
  const target = (w: ContractWarning): ContractTodoTarget => {
    switch (w) {
      case 'dpa_missing':
      case 'dpa_incomplete':
        return { kind: 'section', id: CONTRACT_SECTIONS.dpa };
      case 'signed_copy_missing':
        return { kind: 'section', id: CONTRACT_SECTIONS.versions };
      case 'review_overdue':
        return can('review') ? { kind: 'action', action: 'review' } : EDIT;
      case 'notice_soon':
        return can('renew') ? { kind: 'action', action: 'renew' } : EDIT;
      default:
        return EDIT;
    }
  };
  const todos: ContractTodo[] = [];
  if (counterpartiesOf(c).length === 0) {
    todos.push({
      key: 'counterparty',
      labelKey: 'contracts.detail.todo.counterparty',
      target: { kind: 'section', id: CONTRACT_SECTIONS.parties },
    });
  }
  for (const w of c.warnings ?? []) {
    todos.push({ key: w, labelKey: `contracts.detail.todo.${w}`, target: target(w) });
  }
  return todos;
}

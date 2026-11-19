import { NextStep, NextStepKind, nextSteps } from './obligation-display';
import { Obligation } from './obligation.models';

/** Tone of the status sentence (docs/ux-guide.md §2.7: `warn` for open work, never `fail`). */
export type ObligationSentenceTone = 'pass' | 'warn' | 'info' | 'neutral';

export interface ObligationSentence {
  /** `obligations.detail.sentence.<kind>`. */
  readonly kind: string;
  readonly tone: ObligationSentenceTone;
}

/**
 * The status sentence at the top of "Hovedinformasjon": are we compliant, in plain
 * words ("Delvis i samsvar – siste vurdering fant mangler som må følges opp.").
 * Retired and draft obligations are not evaluated, so their lifecycle wins.
 */
export function obligationSentence(o: Obligation): ObligationSentence {
  if (o.status === 'retired') {
    return { kind: 'retired', tone: 'neutral' };
  }
  if (o.status === 'draft') {
    return { kind: 'draft', tone: 'info' };
  }
  switch (o.compliance_status) {
    case 'compliant':
      return { kind: 'compliant', tone: 'pass' };
    case 'partially_compliant':
      return { kind: 'partially_compliant', tone: 'warn' };
    case 'non_compliant':
      return { kind: 'non_compliant', tone: 'warn' };
    case 'not_applicable':
      return { kind: 'not_applicable', tone: 'neutral' };
    default:
      return { kind: 'not_evaluated', tone: 'warn' };
  }
}

/** What the current user can do from an Oppfølging line. */
export interface ObligationTodoAccess {
  /** May record an evaluation (and a deviation from it). */
  readonly canRecord: boolean;
  /** May edit the obligation. */
  readonly canEdit: boolean;
}

/** One actionable line of the Oppfølging card. */
export interface ObligationTodo {
  readonly kind: NextStepKind | 'owner';
  readonly params: Readonly<Record<string, string | number>>;
}

/** Steps that are a to-do for this user (the rest are explained elsewhere or not theirs). */
function actionable(step: NextStep, access: ObligationTodoAccess): boolean {
  switch (step.kind) {
    case 'overdue':
    case 'firstEvaluation':
    case 'noFollowUp':
      return access.canRecord;
    case 'draft':
    case 'noSchedule':
    case 'renewal':
    case 'expired':
      return access.canEdit;
    case 'changes':
      return true;
    default:
      return false;
  }
}

/**
 * The "Hva mangler" lines of an obligation, most urgent first: the open next steps
 * (evaluation overdue, no follow-up, no plan, renewal …) the user can act on, and a
 * missing owner. Retired obligations need nothing.
 */
export function obligationTodos(
  o: Obligation,
  access: ObligationTodoAccess,
  today: Date = new Date(),
): ObligationTodo[] {
  if (o.status === 'retired') {
    return [];
  }
  const todos: ObligationTodo[] = nextSteps(o, today)
    .filter((s) => actionable(s, access))
    .map((s) => ({ kind: s.kind, params: s.params }));
  if (!o.owner && access.canEdit) {
    todos.push({ kind: 'owner', params: {} });
  }
  return todos;
}

/** A curated "ask CoreFlow to …" action shown in the command palette. */
export interface AgentAction {
  /** Stable id; label and prompt are `ask.palette.actions.<key>.label|prompt`. */
  readonly key: string;
  /** Icon name (see shared Icon set). */
  readonly icon: string;
  /** Module the action is about (its name tags the row); null = platform-wide. */
  readonly module: string | null;
}

/** `ask` scope key of an action's visible label. */
export function actionLabelKey(action: AgentAction): string {
  return `ask.palette.actions.${action.key}.label`;
}

/** `ask` scope key of the question sent to the assistant (in the UI language). */
export function actionPromptKey(action: AgentAction): string {
  return `ask.palette.actions.${action.key}.prompt`;
}

/**
 * What the assistant can do, in display order. Each prompt is translated, so an nb
 * user asks in Norwegian and the answer comes back in Norwegian; each fits one of
 * the assistant's generic tools (my work, requirement coverage, gaps, lists with
 * filters, drafts that are confirmed before they are saved).
 */
export const AGENT_ACTIONS: readonly AgentAction[] = [
  { key: 'whatNow', icon: 'home', module: null },
  { key: 'coverage', icon: 'iso', module: 'standards' },
  { key: 'gaps', icon: 'iso', module: 'standards' },
  { key: 'openDeviations', icon: 'alert', module: 'deviations' },
  { key: 'registerDeviation', icon: 'alert', module: 'deviations' },
  { key: 'topRisks', icon: 'risk', module: 'risk' },
  { key: 'draftProcedure', icon: 'procedures', module: 'documents' },
  { key: 'summariseDocument', icon: 'documents', module: 'documents' },
  { key: 'planAudit', icon: 'audit', module: 'audits' },
  { key: 'trainingDue', icon: 'training', module: 'training' },
  { key: 'assignTask', icon: 'inbox', module: 'tasks' },
];

/** A curated agent action shown in the command palette's AGENT ACTIONS section. */
export interface AgentAction {
  /** i18n key for the visible label. */
  readonly labelKey: string;
  /** Icon name (see shared Icon set). */
  readonly icon: string;
  /** Decorative right-aligned "Category · Agent" tag (matches the design; not a real agent). */
  readonly tag: string;
  /** Seed prompt submitted to the Ask CoreFlow chat when the action is chosen. */
  readonly prompt: string;
}

/** The showcase list of what CoreFlow's agents can do, in display order. */
export const AGENT_ACTIONS: readonly AgentAction[] = [
  {
    labelKey: 'commandPalette.actions.draftNcr',
    icon: 'alert',
    tag: 'QA · Quinn',
    prompt: 'Draft a non-conformance report',
  },
  {
    labelKey: 'commandPalette.actions.isoGap',
    icon: 'iso',
    tag: 'Compliance · Iris',
    prompt: 'Run an ISO 9001 clause gap analysis',
  },
  {
    labelKey: 'commandPalette.actions.summarizeDoc',
    icon: 'documents',
    tag: 'Documents · Atlas',
    prompt: 'Summarize a document for me',
  },
  {
    labelKey: 'commandPalette.actions.createProcedure',
    icon: 'procedures',
    tag: 'Procedures · Atlas',
    prompt: 'Create a procedure from a template',
  },
  {
    labelKey: 'commandPalette.actions.projectStatus',
    icon: 'projects',
    tag: 'Projects · Pace',
    prompt: 'Generate a project status report',
  },
  {
    labelKey: 'commandPalette.actions.trainingQuiz',
    icon: 'training',
    tag: 'Training · Mentor',
    prompt: 'Build a training quiz',
  },
  {
    labelKey: 'commandPalette.actions.registerDeviation',
    icon: 'alert',
    tag: 'Deviations · Quinn',
    prompt: 'Register a deviation',
  },
  {
    labelKey: 'commandPalette.actions.riskAnalysis',
    icon: 'risk',
    tag: 'Risk · Iris',
    prompt: 'Run a risk analysis',
  },
  {
    labelKey: 'commandPalette.actions.planAudit',
    icon: 'audit',
    tag: 'Audits · Iris',
    prompt: 'Plan an internal audit',
  },
  {
    labelKey: 'commandPalette.actions.assignTask',
    icon: 'inbox',
    tag: 'Anywhere · Copilot',
    prompt: 'Assign a task to a teammate',
  },
];

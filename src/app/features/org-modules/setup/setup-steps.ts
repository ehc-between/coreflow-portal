import { ModuleRecommendation, OrgModule, SetupState } from '../../../core/modules/module.models';

/** The wizard steps, in order (the backend stores the current one as `setup_step`). */
export const SETUP_STEPS = ['profile', 'frameworks', 'modules', 'roles', 'tasks', 'done'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export function isSetupStep(value: string | null | undefined): value is SetupStep {
  return !!value && (SETUP_STEPS as readonly string[]).includes(value);
}

/**
 * Where the wizard opens: the saved step while setup is unfinished, otherwise
 * the start (a completed setup is being re-run).
 */
export function resumeStep(state: SetupState | null): SetupStep {
  if (!state || state.completed_at) {
    return 'profile';
  }
  return isSetupStep(state.step) && state.step !== 'done' ? state.step : 'profile';
}

/** The step after / before `step` (clamped). */
export function nextStep(step: SetupStep): SetupStep {
  return SETUP_STEPS[Math.min(SETUP_STEPS.indexOf(step) + 1, SETUP_STEPS.length - 1)];
}

export function previousStep(step: SetupStep): SetupStep {
  return SETUP_STEPS[Math.max(SETUP_STEPS.indexOf(step) - 1, 0)];
}

/** A wizard row for one module: the recommendation plus its current state. */
export interface ModuleChoice {
  readonly key: string;
  readonly recommended: boolean;
  readonly reasonKey: string;
  readonly frameworks: readonly string[];
  /** Already on for the org (completing setup never turns modules off). */
  readonly alreadyEnabled: boolean;
  readonly dependsOn: readonly string[];
}

/**
 * Merges the recommendations with the module list: recommended first, then the
 * rest, each alphabetical by key. Always-on modules are not listed (the
 * backend leaves them out of the recommendations too).
 */
export function moduleChoices(
  recommendations: readonly ModuleRecommendation[],
  modules: readonly OrgModule[],
): ModuleChoice[] {
  const byKey = new Map(modules.map((m) => [m.key, m]));
  return recommendations
    .filter((r) => !byKey.get(r.key)?.always_on)
    .map((r) => ({
      key: r.key,
      recommended: r.recommended,
      reasonKey: r.reason_key,
      frameworks: r.frameworks,
      alreadyEnabled: byKey.get(r.key)?.enabled ?? false,
      dependsOn: byKey.get(r.key)?.depends_on ?? [],
    }))
    .sort((a, b) =>
      a.recommended === b.recommended ? a.key.localeCompare(b.key) : a.recommended ? -1 : 1,
    );
}

/** The initial selection: recommended or already enabled. */
export function initialSelection(choices: readonly ModuleChoice[]): Set<string> {
  return new Set(choices.filter((c) => c.recommended || c.alreadyEnabled).map((c) => c.key));
}

/** A suggested first task: its i18n id, days until due and the module it needs (if any). */
export interface FirstTask {
  readonly id: string;
  readonly dueInDays: number;
  readonly module: string | null;
}

export const FIRST_TASKS: readonly FirstTask[] = [
  { id: 'reviewProfile', dueInDays: 7, module: null },
  { id: 'inviteTeam', dueInDays: 7, module: null },
  { id: 'policy', dueInDays: 14, module: 'documents' },
  { id: 'applicability', dueInDays: 21, module: 'standards' },
  { id: 'deviations', dueInDays: 14, module: 'deviations' },
  { id: 'risk', dueInDays: 30, module: 'risk' },
  { id: 'audit', dueInDays: 60, module: 'audits' },
];

/** The first tasks that make sense for the chosen modules. */
export function firstTasksFor(modules: ReadonlySet<string>): FirstTask[] {
  return FIRST_TASKS.filter((task) => !task.module || modules.has(task.module));
}

/** A naive-UTC ISO date-time `days` from `now` at 12:00 UTC. */
export function dueAt(days: number, now: Date = new Date()): string {
  const due = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 12),
  );
  return due.toISOString().slice(0, 19);
}

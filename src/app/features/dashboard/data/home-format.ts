import { HttpErrorResponse } from '@angular/common/http';
import { scopeAlias } from '../../../core/notifications/notification-text';
import { Journey, JourneyPhase, JourneyStep, NextAction } from './home.models';

/** A synchronous translator (`LanguageService.translate`). */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/** The frameworks CoreFlow ships a journey for (one catalogue file each). */
export const JOURNEY_FRAMEWORKS = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso45001',
  'iso42001',
  'gdpr',
  'nis2',
  'eu_ai_act',
] as const;

/**
 * A backend key in `scope:path` form (`home:next.gap.title`) as a Transloco key
 * (`home.next.gap.title`). A module scope uses Transloco's alias
 * (`management-review:nextActions.overdue.title` -> `managementReview.nextActions…`).
 * Keys without a scope pass through unchanged.
 */
export function scopedKey(key: string): string {
  const at = key.indexOf(':');
  return at > 0 ? `${scopeAlias(key.slice(0, at))}.${key.slice(at + 1)}` : key;
}

/** The module scope (`management-review`) of a `scope:path` key, or null. */
export function keyScope(key: string): string | null {
  const at = key.indexOf(':');
  return at > 0 ? key.slice(0, at) : null;
}

/** i18n key (scope `home`) of a framework's short label, e.g. "ISO 27001". */
export function frameworkShortKey(framework: string): string {
  return `home.standards.${framework}.short`;
}

/** The journey route of a framework. */
export function journeyUrl(framework: string): string {
  return `/standards/journey/${framework}`;
}

/** Whether a framework key is one of the frameworks with a journey. */
export function hasJourney(framework: string): boolean {
  return (JOURNEY_FRAMEWORKS as readonly string[]).includes(framework);
}

/**
 * The readable label of a canonical clause ref (`iso27001:A.5.9` -> "ISO 27001 · A.5.9").
 * Shared ISO clauses (`hs:7.2`) read "Common ISO requirement · 7.2"; a requirement ref
 * (`…:8.4.1.r2`) drops its `.rN` suffix. Never shows the raw ref.
 */
export function clauseLabel(ref: string, t: Translate): string {
  const at = ref.indexOf(':');
  if (at <= 0) {
    return ref;
  }
  const framework = ref
    .slice(0, at)
    .replace(/-\d{4}$/, '')
    .replace(/-/g, '_');
  const number = ref.slice(at + 1).replace(/\.r\d+$/, '');
  const short = framework === 'hs' ? t('home.standards.hs.short') : t(frameworkShortKey(framework));
  return `${short} · ${number}`;
}

/** The greeting key for the hour of day (0-23). */
export function greetingKey(hour: number): string {
  if (hour >= 5 && hour < 10) {
    return 'home.greeting.morning';
  }
  if (hour >= 10 && hour < 18) {
    return 'home.greeting.day';
  }
  return 'home.greeting.evening';
}

/** The first name of a display name ("Kari Nordmann" -> "Kari"). */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}

// --- next actions ----------------------------------------------------------------------

/** Translation name of an action (`home:next.<name>.title` -> `<name>`). */
export function actionName(action: NextAction): string {
  const match = /next\.([a-z_]+)\.title$/.exec(action.title_key);
  return match ? match[1] : action.kind;
}

/** What a next action needs to render: translated texts, icon, button and tone. */
export interface ActionView {
  readonly key: string;
  readonly title: string;
  readonly why: string;
  readonly icon: string;
  /** i18n key of the one button. */
  readonly ctaKey: string;
  readonly url: string;
  readonly urgent: boolean;
  readonly moduleName: string | null;
}

const ACTION_ICONS: Record<string, string> = {
  overdue: 'alert',
  due_soon: 'clock',
  review: 'inbox',
  setup: 'sliders',
  gap: 'target',
  confirm_suggestions: 'link',
  journey_step: 'flag',
};

const ACTION_CTA: Record<string, string> = {
  overdue: 'home.next.cta.open',
  overdue_many: 'home.next.cta.seeAll',
  due_soon: 'home.next.cta.open',
  review: 'home.next.cta.review',
  setup: 'home.next.cta.continueSetup',
  enable_standard: 'home.next.cta.chooseStandards',
  confirm_suggestions: 'home.next.cta.confirm',
  confirm_connections: 'home.next.cta.confirm',
  suggestions: 'home.next.cta.reviewSuggestions',
  journey_step: 'home.next.cta.doStep',
  journey_link: 'home.next.cta.link',
  journey_enable_module: 'home.next.cta.openJourney',
  start_journey: 'home.next.cta.startJourney',
  gap: 'home.next.cta.document',
};

/**
 * Fill the action's params with readable values before translating: the standard's
 * short name (the backend sends the long English catalogue name), the module's name,
 * the item kind label and the wizard step.
 */
export function actionParams(action: NextAction, t: Translate): Record<string, unknown> {
  const params: Record<string, unknown> = { ...action.params };
  const framework = typeof params['framework'] === 'string' ? params['framework'] : null;
  if (framework) {
    params['standard'] = t(frameworkShortKey(framework));
  }
  const module = typeof params['module'] === 'string' ? params['module'] : action.module;
  params['moduleName'] = module ? t(`modules.names.${module}`) : '';
  const kindKey = params['kind_label_key'];
  params['kind'] = typeof kindKey === 'string' ? t(scopedKey(kindKey)) : '';
  const step = params['step'];
  if (actionName(action) === 'setup') {
    params['step'] = t(`home.setupSteps.${typeof step === 'string' ? step : 'profile'}`);
  }
  const days = Number(params['days']);
  if (params['days'] !== undefined && Number.isFinite(days)) {
    params['days'] = Math.abs(days);
    params['when'] = whenText(action.kind === 'overdue' ? -Math.abs(days) : days, t);
  }
  // A code, when present, reads "PRO-004 · Title"; without it, the title alone.
  const code = typeof params['code'] === 'string' && params['code'] ? params['code'] : null;
  const title = typeof params['title'] === 'string' ? params['title'] : '';
  params['label'] = code ? `${code} · ${title}` : title;
  return params;
}

/**
 * A relative day in words: `-3` -> "3 days ago", `-1` -> "yesterday", `0` -> "today",
 * `1` -> "tomorrow", `5` -> "in 5 days" (keys `home.when.*`).
 */
export function whenText(days: number, t: Translate): string {
  if (days === 0) {
    return t('home.when.today');
  }
  if (days === -1) {
    return t('home.when.yesterday');
  }
  if (days === 1) {
    return t('home.when.tomorrow');
  }
  return days < 0 ? t('home.when.daysAgo', { days: -days }) : t('home.when.inDays', { days });
}

/** The title / why keys to translate: one awaiting review item names the item itself. */
function actionKeys(action: NextAction): { title: string; why: string } {
  const title = scopedKey(action.title_key);
  const why = scopedKey(action.why_key);
  if (actionName(action) === 'review' && Number(action.params['count']) === 1) {
    return { title: `${title}One`, why: `${why}One` };
  }
  // U07: the one system-suggestion row names requirements, unless it also holds
  // suggested connections ("Gå gjennom 15 forslag").
  if (actionName(action) === 'suggestions' && Number(action.params['connections']) > 0) {
    return { title: `${title.replace(/\.title$/, '')}.titleMixed`, why };
  }
  return { title, why };
}

export function actionView(action: NextAction, t: Translate): ActionView {
  const name = actionName(action);
  const params = actionParams(action, t);
  const keys = actionKeys(action);
  const module = (params['module'] as string | undefined) ?? action.module;
  return {
    key: action.key,
    title: t(keys.title, params),
    why: t(keys.why, params),
    icon: ACTION_ICONS[action.kind] ?? 'flag',
    ctaKey: ACTION_CTA[name] ?? ACTION_CTA[action.kind] ?? 'home.next.cta.open',
    url: action.url,
    urgent: action.kind === 'overdue',
    moduleName: module ? t(`modules.names.${module}`) : null,
  };
}

/** Split a portal URL into a router path and query params (`/my-work?tab=review`). */
export function splitUrl(url: string): { path: string; query: Record<string, string> } {
  const [path, search = ''] = url.split('?');
  const query: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(search)) {
    query[k] = v;
  }
  return { path: path || '/', query };
}

// --- standards -------------------------------------------------------------------------

/** "+3 points in 30 days" / "−2 …" / null when unchanged. */
export function trendParams(trend: number): { key: string; points: number } | null {
  if (!trend) {
    return null;
  }
  return trend > 0
    ? { key: 'home.status.trendUp', points: trend }
    : { key: 'home.status.trendDown', points: Math.abs(trend) };
}

// --- journeys --------------------------------------------------------------------------

/** How a step should look: done, skipped, waiting for a link, module off, or to do. */
export type StepState = 'done' | 'skipped' | 'needs_link' | 'module_off' | 'todo';

export function stepState(step: JourneyStep): StepState {
  if (step.status === 'done') {
    return 'done';
  }
  if (step.status === 'skipped') {
    return 'skipped';
  }
  if (!step.module_enabled) {
    return 'module_off';
  }
  return step.needs_link ? 'needs_link' : 'todo';
}

/** The first step still open across the journey (the one to highlight), or null. */
export function nextOpenStep(journey: Journey): JourneyStep | null {
  for (const phase of journey.phases) {
    const step = phase.steps.find((s) => s.status === 'todo');
    if (step) {
      return step;
    }
  }
  return null;
}

/** Phases open by default: the one holding the next open step (or all when done). */
export function defaultOpenPhases(journey: Journey): Set<string> {
  const next = nextOpenStep(journey);
  return new Set(next ? [next.phase] : journey.phases.map((p) => p.key));
}

/** "2 of 3" text params of a phase. */
export function phaseCounts(phase: JourneyPhase): { done: number; total: number } {
  return { done: phase.done, total: phase.total };
}

/** The main link of a step: its action, else its own URL. */
export function stepActionUrl(step: JourneyStep): string | null {
  return step.action?.url ?? step.url ?? null;
}

/** i18n key of the step's main button, from its action kind. */
export function stepActionKey(step: JourneyStep): string {
  switch (step.action?.kind) {
    case 'create':
      return 'home.journey.step.actions.create';
    case 'lesson':
      return 'home.journey.step.actions.lesson';
    case 'task':
      return 'home.journey.step.actions.task';
    default:
      return 'home.journey.step.actions.open';
  }
}

/** i18n key + params describing a step's progress line, or null when there is none. */
export function progressText(
  step: JourneyStep,
): { key: string; params: Record<string, unknown> } | null {
  const p = step.progress;
  if (!p) {
    return null;
  }
  if (step.done_when === 'coverage') {
    return {
      key: 'home.journey.step.progress.coverage',
      params: { current: p.current, target: p.target },
    };
  }
  if (p.linked !== null && p.linked !== undefined) {
    return {
      key: 'home.journey.step.progress.linked',
      params: { current: p.current, target: p.target, linked: p.linked },
    };
  }
  return {
    key: 'home.journey.step.progress.records',
    params: { current: p.current, target: p.target },
  };
}

/** The `detail.code` of an API error (`journey_exists`, `module_disabled`, …), or null. */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === 'object' && 'code' in detail) {
    const code = (detail as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

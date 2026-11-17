import { HttpErrorResponse } from '@angular/common/http';
import {
  actionView,
  apiErrorCode,
  clauseLabel,
  defaultOpenPhases,
  firstName,
  greetingKey,
  hasJourney,
  journeyUrl,
  nextOpenStep,
  progressText,
  keyScope,
  scopedKey,
  splitUrl,
  stepActionKey,
  stepState,
  trendParams,
  whenText,
} from './home-format';
import { NextAction } from './home.models';
import { makeJourney, makeStep } from './home.testing';

/** A translator that shows key + params, so assertions can see what was asked for. */
const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}${JSON.stringify(params)}` : key;

function action(over: Partial<NextAction>): NextAction {
  return {
    key: 'k',
    kind: 'overdue',
    title_key: 'home:next.overdue.title',
    why_key: 'home:next.overdue.why',
    params: {},
    url: '/tasks/t-1',
    priority: 0,
    module: null,
    ...over,
  };
}

describe('home format helpers', () => {
  it('turns scoped backend keys into Transloco keys', () => {
    expect(scopedKey('home:next.gap.title')).toBe('home.next.gap.title');
    expect(scopedKey('tasks:work.kinds.task')).toBe('tasks.work.kinds.task');
    expect(scopedKey('common.save')).toBe('common.save');
    // Module scopes use Transloco's alias (the scope file is loaded by the list).
    expect(scopedKey('management-review:nextActions.overdue.title')).toBe(
      'managementReview.nextActions.overdue.title',
    );
    expect(keyScope('management-review:nextActions.overdue.title')).toBe('management-review');
    expect(keyScope('common.save')).toBeNull();
  });

  it('labels clause refs without raw suffixes, and shared ISO clauses plainly', () => {
    expect(clauseLabel('iso27001:A.5.9', t)).toBe('home.standards.iso27001.short · A.5.9');
    expect(clauseLabel('iso9001-2026:8.4.1.r2', t)).toBe('home.standards.iso9001.short · 8.4.1');
    expect(clauseLabel('eu-ai-act-2024:26', t)).toBe('home.standards.eu_ai_act.short · 26');
    expect(clauseLabel('hs:7.2', t)).toBe('home.standards.hs.short · 7.2');
  });

  it('greets by the time of day and uses the first name', () => {
    expect(greetingKey(7)).toBe('home.greeting.morning');
    expect(greetingKey(13)).toBe('home.greeting.day');
    expect(greetingKey(22)).toBe('home.greeting.evening');
    expect(greetingKey(2)).toBe('home.greeting.evening');
    expect(firstName('Kari Nordmann')).toBe('Kari');
    expect(firstName(null)).toBe('');
  });

  it('knows which frameworks have a journey', () => {
    expect(hasJourney('iso27001')).toBe(true);
    expect(hasJourney('eu_ai_act')).toBe(true);
    expect(hasJourney('soc2')).toBe(false);
    expect(journeyUrl('gdpr')).toBe('/standards/journey/gdpr');
  });

  it('says relative days in words', () => {
    expect(whenText(0, t)).toBe('home.when.today');
    expect(whenText(-1, t)).toBe('home.when.yesterday');
    expect(whenText(1, t)).toBe('home.when.tomorrow');
    expect(whenText(-4, t)).toBe('home.when.daysAgo{"days":4}');
    expect(whenText(3, t)).toBe('home.when.inDays{"days":3}');
  });

  it('builds an overdue action with the item label, kind and a past deadline', () => {
    const view = actionView(
      action({
        params: {
          title: 'Fix the valve',
          code: 'AVV-3',
          kind_label_key: 'tasks:work.kinds.deviation_action',
          days: 2,
        },
        module: 'deviations',
      }),
      t,
    );
    expect(view.title).toContain('home.next.overdue.title');
    expect(view.title).toContain('"label":"AVV-3 · Fix the valve"');
    expect(view.why).toContain('"kind":"tasks.work.kinds.deviation_action"');
    expect(view.why).toContain('"when":"home.when.daysAgo{\\"days\\":2}"');
    expect(view.urgent).toBe(true);
    expect(view.icon).toBe('alert');
    expect(view.ctaKey).toBe('home.next.cta.open');
    expect(view.moduleName).toBe('modules.names.deviations');
  });

  it('names a single awaiting review item, and counts several', () => {
    const one = actionView(
      action({
        kind: 'review',
        title_key: 'home:next.review.title',
        why_key: 'home:next.review.why',
        params: { count: 1, title: 'Supplier procedure', code: 'PRO-004' },
      }),
      t,
    );
    expect(one.title.startsWith('home.next.review.titleOne')).toBe(true);
    expect(one.ctaKey).toBe('home.next.cta.review');
    const many = actionView(
      action({
        kind: 'review',
        title_key: 'home:next.review.title',
        why_key: 'home:next.review.why',
        params: { count: 3 },
      }),
      t,
    );
    expect(many.title.startsWith('home.next.review.title{')).toBe(true);
  });

  it('shows the short standard name in gap actions instead of the catalogue name', () => {
    const view = actionView(
      action({
        kind: 'gap',
        title_key: 'home:next.gap.title',
        why_key: 'home:next.gap.why',
        params: {
          standard: 'ISO 9001 Quality management systems — Requirements',
          framework: 'iso9001',
        },
        module: 'standards',
      }),
      t,
    );
    expect(view.title).toContain('"standard":"home.standards.iso9001.short"');
    expect(view.ctaKey).toBe('home.next.cta.document');
  });

  it('picks the button for journey and setup actions', () => {
    expect(
      actionView(action({ kind: 'journey_step', title_key: 'home:next.journey_link.title' }), t)
        .ctaKey,
    ).toBe('home.next.cta.link');
    const setup = actionView(
      action({ kind: 'setup', title_key: 'home:next.setup.title', params: { step: 'modules' } }),
      t,
    );
    expect(setup.ctaKey).toBe('home.next.cta.continueSetup');
    expect(setup.why).toContain('"step":"home.setupSteps.modules"');
  });

  it('splits URLs with a query', () => {
    expect(splitUrl('/my-work?tab=review')).toEqual({ path: '/my-work', query: { tab: 'review' } });
    expect(splitUrl('/standards')).toEqual({ path: '/standards', query: {} });
  });

  it('describes the 30-day trend', () => {
    expect(trendParams(0)).toBeNull();
    expect(trendParams(3)).toEqual({ key: 'home.status.trendUp', points: 3 });
    expect(trendParams(-2)).toEqual({ key: 'home.status.trendDown', points: 2 });
  });

  it('derives the state of a step', () => {
    expect(stepState(makeStep({ status: 'done' }))).toBe('done');
    expect(stepState(makeStep({ status: 'skipped' }))).toBe('skipped');
    expect(stepState(makeStep({ module_enabled: false }))).toBe('module_off');
    expect(stepState(makeStep({ needs_link: true }))).toBe('needs_link');
    expect(stepState(makeStep())).toBe('todo');
  });

  it('finds the next open step and opens its phase', () => {
    const journey = makeJourney();
    expect(nextOpenStep(journey)?.key).toBe('assess-risks');
    expect([...defaultOpenPhases(journey)]).toEqual(['risk']);
    const done = makeJourney({ phases: [journey.phases[0]] });
    expect(nextOpenStep(done)).toBeNull();
    expect([...defaultOpenPhases(done)]).toEqual(['scope']);
  });

  it('describes step progress and the main button', () => {
    expect(progressText(makeStep())).toEqual({
      key: 'home.journey.step.progress.linked',
      params: { current: 0, target: 1, linked: 0 },
    });
    expect(
      progressText(makeStep({ done_when: 'coverage', progress: { current: 3, target: 50 } }))?.key,
    ).toBe('home.journey.step.progress.coverage');
    expect(progressText(makeStep({ progress: null }))).toBeNull();
    expect(stepActionKey(makeStep())).toBe('home.journey.step.actions.create');
    expect(stepActionKey(makeStep({ action: { kind: 'open', url: '/risk' } }))).toBe(
      'home.journey.step.actions.open',
    );
  });

  it('reads the error code of an API error', () => {
    const conflict = new HttpErrorResponse({
      status: 409,
      error: { detail: { code: 'journey_exists', id: 'j-1' } },
    });
    expect(apiErrorCode(conflict)).toBe('journey_exists');
    expect(apiErrorCode(new HttpErrorResponse({ status: 500, error: 'boom' }))).toBeNull();
    expect(apiErrorCode(new Error('x'))).toBeNull();
  });
});

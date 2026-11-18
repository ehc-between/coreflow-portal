import guideEn from '../../../assets/guidance/en/processes.json';
import guideNb from '../../../assets/guidance/nb/processes.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import kitNb from '../../../assets/i18n/kit/nb.json';
import en from '../../../assets/i18n/processes/en.json';
import nb from '../../../assets/i18n/processes/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { GuidanceFile } from '../../core/guidance/guidance.models';
import { PROCESS_FIELD_LABELS, STATUS_ACTIONS } from './detail/process-detail';
import { PROCESS_ERROR_CODES } from './data/process-errors';
import {
  HEALTH_KEYS,
  MAP_NODE_TYPES,
  PROCESS_CATEGORIES,
  PROCESS_FRAMEWORKS,
  PROCESS_STATUSES,
  REVIEW_CHECKS,
  REVIEW_OUTCOMES,
  TURTLE_LEGS,
  TURTLE_LIST_FIELDS,
} from './data/process.models';

type Tree = Record<string, unknown>;

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Tree).flatMap(strings);
  }
  return [];
}

/** Event-kind keys the backend emits (`processes:notifications.*` / `processes:timeline.*`). */
const EVENT_KEYS = [
  'created',
  'updated',
  'ownerChanged',
  'statusChanged',
  'mapUpdated',
  'reviewed',
  'documentAttached',
  'documentDetached',
  'interactionAdded',
  'interactionRemoved',
  'deleted',
];

describe('processes i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => {
    expectKeyParity(en, nb);
  });

  it('keeps the guidance files at full en/nb parity', () => {
    expectKeyParity(guideEn, guideNb);
  });

  it('has no empty strings and no vendor names', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      const all = strings(file);
      expect(all.filter((s) => !s.trim())).toEqual([]);
      expect(all.filter((s) => /claude|anthropic|openai|gpt/i.test(s))).toEqual([]);
    }
  });

  it('defines every dynamic key the pages build', () => {
    for (const lang of [en, nb]) {
      const has = (key: string) => expect(typeof lookup(lang, key), key).toBe('string');
      PROCESS_STATUSES.forEach((s) => has(`status.${s}`));
      PROCESS_CATEGORIES.forEach((c) => {
        has(`category.${c}`);
        has(`category.${c}Plural`);
      });
      MAP_NODE_TYPES.forEach((t) => has(`map.nodeTypes.${t}`));
      PROCESS_ERROR_CODES.forEach((c) => has(`errors.${c}`));
      TURTLE_LIST_FIELDS.forEach((f) => {
        has(`fields.${f}`);
        has(`turtle.${f}`);
      });
      Object.values(PROCESS_FIELD_LABELS).forEach((k) => has(k.replace(/^processes\./, '')));
      for (const targets of Object.values(STATUS_ACTIONS)) {
        targets.forEach((t) => {
          has(`statusActions.${t}`);
          has(`statusActions.message.${t}`);
        });
      }
      ['code', 'codeDesc', 'title', 'updatedDesc', 'nextReview'].forEach((s) => has(`sort.${s}`));
      ['draft', 'in_review', 'approved', 'obsolete'].forEach((s) => has(`document.status.${s}`));
      ['outgoing', 'incoming'].forEach((d) => has(`interactions.direction.${d}`));
      ['noStart', 'noEnd', 'unconnected', 'decisionBranches', 'unlabelled'].forEach((k) =>
        has(`map.issues.${k}`),
      );
      ['self', 'duplicate', 'missing', 'limit'].forEach((k) => has(`map.connectErrors.${k}`));
      ['list.steps', 'list.stepsOne', 'review.months', 'review.monthsOne'].forEach(has);
      HEALTH_KEYS.forEach((k) => {
        has(`health.items.${k}`);
        has(`health.fix.${k}`);
      });
      REVIEW_CHECKS.forEach((k) => {
        has(`review.checks.${k}`);
        has(`review.data.${k}`);
      });
      REVIEW_OUTCOMES.forEach((o) => {
        has(`review.outcome.${o}`);
        has(`review.outcomeHint.${o}`);
      });
      PROCESS_FRAMEWORKS.forEach((f) => has(`frameworks.${f}`));
      TURTLE_LEGS.forEach((leg) => {
        has(`turtle.${leg}`);
        has(`linkLeg.subtitle.${leg}`);
      });
      ['on_track', 'at_risk', 'off_track', 'no_target', 'none'].forEach((k) =>
        has(`kpi.result.${k}`),
      );
      ['yes', 'no', 'unset'].forEach((k) => has(`review.answer.${k}`));
      ['everyMonth', 'everyYear', 'everyNYears', 'everyNMonths'].forEach((k) => has(`review.${k}`));
      ['map', 'table'].forEach((k) => has(`interactionMap.view.${k}`));
      ['process', 'party'].forEach((k) => has(`interactions.kind.${k}`));
      // Keys the backend sends (scoped `processes:` keys).
      ['tasks.reviewTitle', 'nextActions.firstReview', 'nextActions.firstReviewWhy'].forEach(has);
      ['nextActions.noOwner', 'nextActions.noOwnerWhy'].forEach(has);
      EVENT_KEYS.forEach((k) => {
        has(`notifications.${k}`);
        has(`timeline.${k}`);
      });
    }
  });

  it('labels the create-from-here flows the backend registers for a process', () => {
    for (const kit of [kitEn, kitNb]) {
      const flows = (kit as { flows: { process?: Record<string, string> } }).flows.process ?? {};
      for (const key of ['to_deviation', 'to_risk', 'to_task', 'to_audit_plan', 'to_kpi']) {
        expect(typeof flows[key], key).toBe('string');
      }
    }
  });

  it('ships guidance for every page, a micro-lesson and the tours', () => {
    const file = guideEn as GuidanceFile;
    for (const page of ['list', 'detail', 'form', 'map', 'interactionMap']) {
      expect(file.pages?.[page]?.intro?.title, page).toBeTruthy();
      expect(file.pages?.[page]?.why?.clauses?.length, page).toBeGreaterThan(0);
    }
    expect(file.pages?.['list']?.empty?.cta).toBeTruthy();
    const lesson = file.lessons?.['process-approach'];
    expect(lesson?.sections.length).toBeGreaterThanOrEqual(3);
    for (const q of lesson?.quiz ?? []) {
      expect(q.answer).toBeLessThan(q.options.length);
    }
    expect(file.tours?.['list']?.length).toBeGreaterThan(0);
    expect(file.tours?.['map']?.length).toBeGreaterThan(0);
    for (const field of [
      ...TURTLE_LIST_FIELDS,
      'title',
      'purpose',
      'kpis',
      'owner',
      'frameworks',
    ]) {
      expect(file.pages?.['form']?.fields?.[field]?.help, field).toBeTruthy();
    }
    const withRequirements = Object.values(file.pages?.['form']?.fields ?? {}).filter(
      (f) => (f.requirements?.length ?? 0) > 0,
    );
    expect(withRequirements.length).toBeGreaterThanOrEqual(3);
    expect(file.glossary?.['turtle']?.term).toBeTruthy();
  });
});

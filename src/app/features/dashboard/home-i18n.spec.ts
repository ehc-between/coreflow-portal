import globalEn from '../../../assets/i18n/en.json';
import globalNb from '../../../assets/i18n/nb.json';
import en from '../../../assets/i18n/home/en.json';
import nb from '../../../assets/i18n/home/nb.json';
import platformEn from '../../../assets/guidance/en/platform.json';
import platformNb from '../../../assets/guidance/nb/platform.json';
import { JOURNEY_FRAMEWORKS } from './data/home-format';
import { SETUP_STEPS } from '../org-modules/setup/setup-steps';

type Tree = Record<string, unknown>;

function shape(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Tree).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  }
  return [path];
}

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

/** The next-action names the backend sends (`home:next.<name>.title` / `.why`). */
const ACTION_NAMES = [
  'overdue',
  'overdue_many',
  'review',
  'due_soon',
  'setup',
  'enable_standard',
  'confirm_suggestions',
  'confirm_connections',
  'journey_step',
  'journey_link',
  'journey_enable_module',
  'start_journey',
  'gap',
];

const EVENT_NAMES = [
  'started',
  'step_updated',
  'step_task_created',
  'completed',
  'archived',
  'reactivated',
];

describe('home i18n', () => {
  it('keeps the home scope at full en/nb parity', () => {
    expect(shape(nb).sort()).toEqual(shape(en).sort());
  });

  it('keeps the platform guidance at full en/nb parity', () => {
    expect(shape(platformNb).sort()).toEqual(shape(platformEn).sort());
  });

  it('has a title and a reason for every next action the backend sends', () => {
    for (const lang of [en, nb]) {
      for (const name of ACTION_NAMES) {
        expect(typeof lookup(lang, `next.${name}.title`), name).toBe('string');
        expect(typeof lookup(lang, `next.${name}.why`), name).toBe('string');
      }
      expect(typeof lookup(lang, 'next.review.titleOne')).toBe('string');
      expect(typeof lookup(lang, 'next.review.whyOne')).toBe('string');
    }
  });

  it('defines the journey event texts the backend emits', () => {
    for (const lang of [en, nb]) {
      for (const name of EVENT_NAMES) {
        expect(typeof lookup(lang, `notifications.journey.${name}`), name).toBe('string');
        expect(typeof lookup(lang, `timeline.journey.${name}`), name).toBe('string');
      }
    }
  });

  it('names every standard with a journey, the shared ISO clauses and every wizard step', () => {
    for (const lang of [en, nb]) {
      for (const fw of [...JOURNEY_FRAMEWORKS, 'hs']) {
        expect(typeof lookup(lang, `standards.${fw}.short`), fw).toBe('string');
        expect(typeof lookup(lang, `standards.${fw}.name`), fw).toBe('string');
      }
      for (const step of SETUP_STEPS) {
        expect(typeof lookup(lang, `setupSteps.${step}`), step).toBe('string');
      }
      for (const state of ['done', 'skipped', 'needs_link', 'module_off', 'todo']) {
        expect(typeof lookup(lang, `journey.step.state.${state}`), state).toBe('string');
      }
    }
  });

  it('labels the journey entity type and gives the home and journey pages guidance', () => {
    expect(lookup(globalEn, 'modules.entities.journey')).toBe('Journey');
    expect(lookup(globalNb, 'modules.entities.journey')).toBe('Reise');
    for (const guide of [platformEn, platformNb]) {
      for (const page of ['dashboard', 'journey']) {
        expect(lookup(guide, `pages.${page}.intro.title`), page).toBeTruthy();
      }
    }
  });

  it('has no empty strings and never names a vendor or model', () => {
    const banned = /\b(claude|anthropic|openai|gpt|gemini|llama|mistral)\b/i;
    for (const file of [en, nb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
      expect(strings(file).filter((s) => banned.test(s))).toEqual([]);
    }
  });

  it('uses the nb glossary: kravdekning, not modenhet; never "rammeverk" or "dashbord"', () => {
    const banned = /\b(rammeverk|dashbord|modenhet|kravpunkt|evidens)\b/i;
    expect(strings(nb).filter((s) => banned.test(s))).toEqual([]);
  });
});

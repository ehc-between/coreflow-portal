import en from '../../../assets/i18n/context/en.json';
import nb from '../../../assets/i18n/context/nb.json';
import guidanceEn from '../../../assets/guidance/en/context.json';
import guidanceNb from '../../../assets/guidance/nb/context.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import {
  ADDRESSED_STATUSES,
  ANALYSIS_METHODS,
  ASSIGNEE_TYPES,
  COLUMN_WARNINGS,
  CONTROLLED_STATUSES,
  FOLLOW_UP_TYPES,
  FRAMEWORK_KEYS,
  LEVELS,
  PARTY_CATEGORIES,
  PARTY_PRIORITIES,
  PARTY_TYPES,
  PESTLE_CATEGORIES,
  POLICY_KINDS,
  RACI_ROLES,
  RACI_WARNINGS,
  SETUP_STEP_KEYS,
  SIMPLE_STATUSES,
  SWOT_CATEGORIES,
} from './data/context.models';
import { CONTEXT_ERROR_CODES, KINDS, KIND_ORDER } from './context-kinds';
import { SORT_OPTIONS } from './list/list-config';

type Dict = Record<string, unknown>;

function paths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => paths(item, `${prefix}.${i}`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Dict).flatMap(([key, v]) =>
      paths(v, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function get(dict: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Dict | undefined)?.[key], dict);
}

function params(text: unknown): string[] {
  return typeof text === 'string'
    ? [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort()
    : [];
}

describe('context i18n', () => {
  it('keeps en and nb at full key parity', () => {
    expectKeyParity(en, nb);
  });

  it('uses the same interpolation params in every language', () => {
    for (const path of paths(en)) {
      expect(params(get(nb, path)), path).toEqual(params(get(en, path)));
    }
  });

  it('has no empty strings and no vendor or model names', () => {
    for (const [lang, dict] of Object.entries({ en, nb, guidanceEn, guidanceNb })) {
      for (const path of paths(dict)) {
        const text = get(dict, path);
        if (typeof text !== 'string') {
          continue;
        }
        expect(text.trim(), `${lang}:${path}`).not.toBe('');
        expect(text, `${lang}:${path}`).not.toMatch(/claude|anthropic|openai|\bgpt/i);
      }
    }
  });

  const groups: [string, readonly string[]][] = [
    ['status', [...CONTROLLED_STATUSES, ...SIMPLE_STATUSES]],
    ['methods', ANALYSIS_METHODS],
    ['categories', [...SWOT_CATEGORIES, ...PESTLE_CATEGORIES]],
    ['categoryHints', [...SWOT_CATEGORIES, ...PESTLE_CATEGORIES]],
    ['levels', LEVELS],
    ['partyCategories', PARTY_CATEGORIES],
    ['partyTypes', PARTY_TYPES],
    ['addressed', ADDRESSED_STATUSES],
    ['priorities', PARTY_PRIORITIES],
    ['priorityHints', PARTY_PRIORITIES],
    ['policyKinds', POLICY_KINDS],
    ['frameworks', FRAMEWORK_KEYS],
    ['assigneeTypes', ASSIGNEE_TYPES],
    ['raci.roles', RACI_ROLES],
    ['raci.warnings', RACI_WARNINGS],
    ['raci.warningText', RACI_WARNINGS],
    ['errors', CONTEXT_ERROR_CODES],
    [
      'actions',
      [
        'submit',
        'approve',
        'return',
        'review',
        'retire',
        'edit',
        'delete',
        'communicate',
        'reviewSimple',
      ],
    ],
    ['notices', ['submit', 'approve', 'return', 'review', 'retire', 'created', 'saved']],
    ['ai.improve', KIND_ORDER],
    ['ai.prompts.improve', KIND_ORDER],
    ['list.search', KIND_ORDER],
    ['list.descriptions', KIND_ORDER],
    ['overview.setup.steps', SETUP_STEP_KEYS],
    ['overview.setup.todo', SETUP_STEP_KEYS],
    ['party.registers.hint', PARTY_CATEGORIES],
    ['party.registers.open', PARTY_CATEGORIES],
    ['analysis.followUp', FOLLOW_UP_TYPES],
    ['analysis.impact', LEVELS],
    ['raci.warningSummary', [...RACI_WARNINGS, ...COLUMN_WARNINGS]],
    ['policy.ack.states', ['done', 'open', 'overdue']],
    [
      'overview.attention',
      [
        'partiesNotAddressed',
        'withoutAccountable',
        'withoutResponsible',
        'segregation',
        'analysesWithoutFollowUp',
        'policiesNotCommunicated',
        'policiesWithoutObjectives',
        'reviewsOverdue',
        'inReview',
        'none',
      ],
    ],
    ['next.reviewOverdue', ['title', 'why']],
    ['next.policyNotCommunicated', ['title', 'why']],
  ];

  it.each(groups)('translates every %s value', (group, values) => {
    for (const value of values) {
      expect(typeof get(en, `${group}.${value}`), `${group}.${value}`).toBe('string');
    }
  });

  it('labels every kind and every sort option', () => {
    for (const kind of KIND_ORDER) {
      for (const key of ['one', 'plural', 'new', 'create', 'edit']) {
        expect(typeof get(en, `kinds.${kind}.${key}`), `${kind}.${key}`).toBe('string');
      }
    }
    for (const option of SORT_OPTIONS) {
      expect(typeof get(en, option.label.replace(/^context\./, '')), option.value).toBe('string');
    }
    for (const action of ['approve', 'return', 'review', 'retire']) {
      for (const key of ['title', 'message', 'label']) {
        expect(typeof get(en, `lifecycle.${action}.${key}`)).toBe('string');
      }
    }
  });

  it('has the notification and timeline keys of every event kind the backend declares', () => {
    const prefixes = ['analysis', 'party', 'scope', 'policy', 'responsibility'];
    const names = [
      ...prefixes.flatMap((p) =>
        ['Created', 'Updated', 'Deleted', 'OwnerChanged'].map((v) => p + v),
      ),
      ...['analysis', 'scope', 'policy'].flatMap((p) =>
        ['Submitted', 'Approved', 'Returned', 'Reviewed', 'Retired'].map((v) => p + v),
      ),
      'scopeSuperseded',
      'policyCommunicated',
      'policyReminded',
      'partyReviewed',
      'responsibilityAssigned',
      'responsibilityReviewed',
    ];
    for (const name of names) {
      expect(typeof get(en, `notifications.${name}`), name).toBe('string');
      expect(typeof get(en, `timeline.${name}`), name).toBe('string');
    }
  });
});

describe('context guidance', () => {
  it('keeps en and nb at full key parity', () => {
    expectKeyParity(guidanceEn, guidanceNb);
  });

  it('keeps quiz answers, minutes, pass marks and clause references identical', () => {
    for (const path of paths(guidanceEn).filter((p) =>
      /answer$|minutes$|pass_mark$|clauses\.\d+$|target$/.test(p),
    )) {
      expect(get(guidanceNb, path), path).toEqual(get(guidanceEn, path));
    }
  });

  it('has an intro and a why-it-matters note for every page the module renders', () => {
    const pages = [
      'overview',
      'raci-matrix',
      ...KIND_ORDER.flatMap((kind) =>
        ['list', 'detail', 'form'].map((p) => `${KINDS[kind].guidance}-${p}`),
      ),
    ];
    for (const page of pages) {
      expect(get(guidanceEn, `pages.${page}.intro.title`), page).toBeTruthy();
      expect(get(guidanceEn, `pages.${page}.why.body`), page).toBeTruthy();
      expect(
        (get(guidanceEn, `pages.${page}.why.clauses`) as string[]).length,
        page,
      ).toBeGreaterThan(0);
    }
    for (const kind of KIND_ORDER) {
      const g = KINDS[kind].guidance;
      expect(get(guidanceEn, `pages.${g}-list.empty.cta`), kind).toBeTruthy();
      expect(get(guidanceEn, `pages.${g}-form.fields.owner.help`), kind).toBeTruthy();
      expect((get(guidanceEn, `tours.${g}`) as unknown[]).length, kind).toBeGreaterThan(0);
    }
  });

  it('has the lessons the pages offer, each with a quiz', () => {
    for (const lesson of ['context-foundation', 'interested-parties', 'policies-and-raci']) {
      expect((get(guidanceEn, `lessons.${lesson}.sections`) as unknown[]).length).toBeGreaterThan(
        0,
      );
      expect((get(guidanceEn, `lessons.${lesson}.quiz`) as unknown[]).length).toBeGreaterThan(0);
    }
  });
});

describe('kit flow labels', () => {
  it('labels the 16 context create-from-here flows in both languages', async () => {
    const kitEn = (await import('../../../assets/i18n/kit/en.json')).default as Dict;
    const kitNb = (await import('../../../assets/i18n/kit/nb.json')).default as Dict;
    const flows = [
      'context_analysis.to_risk',
      'context_analysis.to_opportunity',
      'context_analysis.to_objective',
      'context_analysis.to_task',
      'interested_party.to_obligation',
      'interested_party.to_risk',
      'interested_party.to_task',
      'scope_statement.to_risk',
      'scope_statement.to_task',
      'scope_statement.to_deviation',
      'policy.to_objective',
      'policy.to_document',
      'policy.to_task',
      'policy.to_deviation',
      'responsibility.to_task',
      'responsibility.to_deviation',
    ];
    for (const flow of flows) {
      expect(typeof get(kitEn, `flows.${flow}`), flow).toBe('string');
      expect(typeof get(kitNb, `flows.${flow}`), flow).toBe('string');
    }
  });

  it('never uses the forbidden nb words in the module copy', () => {
    for (const path of paths(nb)) {
      const text = get(nb, path);
      if (typeof text === 'string') {
        expect(text, path).not.toMatch(/rammeverk|ISO HS|\bklausul|Støtter krav|Ikke angitt/i);
      }
    }
  });
});

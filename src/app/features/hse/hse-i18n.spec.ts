import guidanceEn from '../../../assets/guidance/en/hse.json';
import guidanceNb from '../../../assets/guidance/nb/hse.json';
import en from '../../../assets/i18n/hse/en.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import kitNb from '../../../assets/i18n/kit/nb.json';
import nb from '../../../assets/i18n/hse/nb.json';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../core/tasks/task.models';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { actionView } from '../dashboard/data/home-format';
import { HSE_ERROR_CODES } from './data/hse-errors';
import {
  CONTROL_TYPES,
  CONSULTATION_KINDS,
  CONSULTATION_SORTS,
  CONSULTATION_STATUSES,
  PPE_CATEGORIES,
  PPE_SORTS,
  PPE_STATUSES,
  RISK_LEVELS,
  SJA_ACTIONS,
  SJA_SORTS,
  SJA_STATUSES,
  SJA_WARNING_KEYS,
  GETTING_STARTED_STEPS,
  TRAINING_CHECK_STATUSES,
} from './data/hse.models';
import { SJA_FIELD_LABELS } from './sja/sja-detail';

type Dict = Record<string, unknown>;

function get(dict: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Dict | undefined)?.[key], dict);
}

/** Every leaf (path, value) of a JSON object. */
function leaves(value: unknown, prefix = ''): [string, unknown][] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => leaves(item, `${prefix}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Dict).flatMap(([key, v]) =>
      leaves(v, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [[prefix, value]];
}

function params(text: unknown): string[] {
  return typeof text === 'string'
    ? [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort()
    : [];
}

const sortKey = (sort: string) => sort.replace(/^-/, 'desc_');

describe('hse i18n', () => {
  it('keeps en and nb at full key parity', () => {
    expectKeyParity(en, nb);
  });

  it('uses the same params in every language, with no empty strings or vendor names', () => {
    for (const [path, text] of leaves(en)) {
      expect(params(get(nb, path)), path).toEqual(params(text));
    }
    for (const [lang, dict] of Object.entries({ en, nb })) {
      for (const [path, text] of leaves(dict)) {
        expect(String(text).trim(), `${lang}:${path}`).not.toBe('');
        expect(String(text), `${lang}:${path}`).not.toMatch(/claude|anthropic|openai|gpt/i);
      }
    }
  });

  const groups: [string, readonly string[]][] = [
    ['sja.status', SJA_STATUSES],
    ['sja.actions', SJA_ACTIONS],
    ['sja.reasonMessage', SJA_ACTIONS],
    ['sja.done', SJA_ACTIONS],
    ['sja.sort', SJA_SORTS.map(sortKey)],
    ['ppe.status', PPE_STATUSES],
    ['ppe.sort', PPE_SORTS.map(sortKey)],
    ['ppe.list.dueFilter', ['any', 'overdue', '30']],
    ['ppe.badge', ['inspectionOverdue', 'expired']],
    ['ppe.issue.training', TRAINING_CHECK_STATUSES],
    ['controlType', [...CONTROL_TYPES, 'none']],
    ['sja.warnings', SJA_WARNING_KEYS],
    ['sja.ppe.warning', ['none', 'all_overdue']],
    ['sja.trail', ['created', 'submitted', 'approved', 'completed', 'cancelled']],
    [
      'overview.reason',
      ['expired', 'inspection_overdue', 'due_soon', 'awaiting_approval', 'overdue', 'planned'],
    ],
    ['overview.start', GETTING_STARTED_STEPS.map((step) => `${step}.title`)],
    [
      'interval',
      ['weekly', 'monthly', 'quarterly', 'halfYearly', 'yearly', 'everyTwoYears', 'days'],
    ],
    ['ppe.inspection.result', ['pass', 'fail']],
    ['ppeCategory', PPE_CATEGORIES],
    ['risk', [...RISK_LEVELS, 'none']],
    ['consultation.status', CONSULTATION_STATUSES],
    ['consultation.kind', CONSULTATION_KINDS],
    ['consultation.sort', CONSULTATION_SORTS.map(sortKey)],
    ['rounds.status', TASK_STATUSES],
    ['rounds.priority', TASK_PRIORITIES],
    ['rounds.filter', ['open', 'all']],
    ['rounds.schedule', ['once', 'recurring']],
    ['overview.sections', ['sja', 'ppe', 'consultations', 'safetyRounds']],
    ['errors', [...HSE_ERROR_CODES, 'forbidden', 'validation']],
  ];

  it.each(groups)('translates every %s value', (group, values) => {
    for (const value of values) {
      expect(typeof get(en, `${group}.${value}`), `${group}.${value}`).toBe('string');
    }
  });

  it('has a label for every revision field', () => {
    for (const key of Object.values(SJA_FIELD_LABELS)) {
      expect(typeof get(en, key.replace(/^hse\./, '')), key).toBe('string');
    }
  });

  it('has the title and timeline keys of every event kind the backend declares', () => {
    const names = [
      ...[
        'Created',
        'Updated',
        'Submitted',
        'Approved',
        'Returned',
        'Revised',
        'Completed',
        'Cancelled',
        'Deleted',
      ].map((v) => `sja${v}`),
      ...[
        'Created',
        'Updated',
        'Issued',
        'Returned',
        'Inspected',
        'InspectionFailed',
        'Deleted',
      ].map((v) => `ppe${v}`),
      ...['Created', 'Updated', 'Held', 'Cancelled', 'Deleted'].map((v) => `consultation${v}`),
      'sjaSignedOff',
    ];
    expect(names).toHaveLength(22);
    for (const name of names) {
      expect(typeof get(en, `notifications.${name}`), name).toBe('string');
      expect(typeof get(en, `timeline.${name}`), name).toBe('string');
    }
  });

  it('has the next-action keys the backend sends (hse:next.<name>.title / .why)', () => {
    for (const name of ['sjaAwaiting', 'ppeOverdue', 'consultationUnrecorded']) {
      for (const part of ['title', 'why']) {
        expect(typeof get(en, `next.${name}.${part}`), `${name}.${part}`).toBe('string');
        expect(typeof get(nb, `next.${name}.${part}`), `${name}.${part}`).toBe('string');
      }
    }
  });

  it('resolves every next action through the home page key rules', () => {
    // Home reads `<key>One` for a single "review" item (home-format actionKeys).
    const cases = [
      ['sjaAwaiting', 'review', 1],
      ['sjaAwaiting', 'review', 2],
      ['ppeOverdue', 'overdue', 1],
      ['consultationUnrecorded', 'overdue', 1],
    ] as const;
    for (const [name, kind, count] of cases) {
      const keys: string[] = [];
      actionView(
        {
          key: `hse.${name}`,
          kind,
          title_key: `hse:next.${name}.title`,
          why_key: `hse:next.${name}.why`,
          params: { count, code: 'SJA-0001', title: 'Job' },
          url: '/hse',
          priority: 1,
          module: 'hse',
        },
        (key) => {
          keys.push(key);
          return key;
        },
      );
      for (const key of keys.filter((k) => k.startsWith('hse.next.'))) {
        const path = key.slice('hse.'.length);
        expect(typeof get(en, path), key).toBe('string');
        expect(typeof get(nb, path), key).toBe('string');
      }
      expect(keys.filter((k) => k.startsWith('hse.next.'))).toHaveLength(2);
    }
  });

  it('labels every create-from-here flow the backend registers (kit flows.<key>)', () => {
    const flows = {
      sja: ['to_deviation', 'to_risk', 'to_task', 'to_document'],
      ppe_item: ['to_deviation', 'to_task'],
      worker_consultation: ['to_task', 'to_deviation', 'to_risk'],
    };
    for (const [source, targets] of Object.entries(flows)) {
      for (const target of targets) {
        expect(typeof get(kitEn, `flows.${source}.${target}`), `${source}.${target}`).toBe(
          'string',
        );
        expect(typeof get(kitNb, `flows.${source}.${target}`), `${source}.${target}`).toBe(
          'string',
        );
      }
    }
  });
});

describe('hse guidance', () => {
  it('keeps en and nb at full key parity', () => {
    expectKeyParity(guidanceEn, guidanceNb);
  });

  it('keeps quiz answers, minutes, pass marks and clause references identical', () => {
    for (const [path, value] of leaves(guidanceEn)) {
      if (/answer$|minutes$|pass_mark$|clauses\[|target$/.test(path)) {
        const nbPath = path.replace(/\[(\d+)\]/g, '.$1');
        expect(get(guidanceNb, nbPath), path).toEqual(value);
      }
    }
  });

  it('has an intro and a why-it-matters note on every page, and empty states on every list', () => {
    const pages = [
      'overview',
      'sja',
      'sja-detail',
      'sja-edit',
      'ppe',
      'ppe-detail',
      'ppe-edit',
      'consultations',
      'consultation-detail',
      'consultation-edit',
      'safety-rounds',
    ];
    for (const page of pages) {
      expect(get(guidanceEn, `pages.${page}.intro.title`), page).toBeTruthy();
      expect(get(guidanceEn, `pages.${page}.why.body`), page).toBeTruthy();
      expect(
        (get(guidanceEn, `pages.${page}.why.clauses`) as string[]).length,
        page,
      ).toBeGreaterThan(0);
    }
    for (const page of ['sja', 'ppe', 'consultations', 'safety-rounds']) {
      expect(get(guidanceEn, `pages.${page}.empty.cta`), page).toBeTruthy();
    }
  });

  it('has field help for the fields the forms point at', () => {
    const fields: Record<string, string[]> = {
      'sja-edit': [
        'title',
        'job_description',
        'participants',
        'steps',
        'hazards',
        'controls',
        'risk_level',
        'residual_risk_level',
        'required_ppe',
        'emergency_measures',
        'change_reason',
      ],
      'ppe-edit': [
        'category',
        'standard_ref',
        'supplier',
        'quantity',
        'required_course',
        'inspection_interval_days',
        'expires_at',
        'status',
      ],
      'ppe-detail': ['holder', 'next_inspection_at'],
      'consultation-edit': ['kind', 'topics', 'participants', 'worker_representatives'],
      'consultation-detail': ['summary', 'decisions'],
      'safety-rounds': ['assignee', 'lead_days', 'checklist'],
    };
    for (const [page, keys] of Object.entries(fields)) {
      for (const key of keys) {
        expect(get(guidanceEn, `pages.${page}.fields.${key}.help`), `${page}.${key}`).toBeTruthy();
      }
    }
  });

  it('says which requirements the key fields of each form document', () => {
    const forms: Record<string, number> = { 'sja-edit': 3, 'ppe-edit': 3, 'consultation-edit': 3 };
    for (const [page, min] of Object.entries(forms)) {
      const fields = get(guidanceEn, `pages.${page}.fields`) as Record<
        string,
        { requirements?: string[] }
      >;
      const withRefs = Object.values(fields).filter((f) => f.requirements?.length);
      expect(withRefs.length, page).toBeGreaterThanOrEqual(min);
    }
  });

  it('explains the terms the pages mark with app-term', () => {
    for (const term of ['sja', 'ppe', 'hierarchy-of-controls', 'worker-representative']) {
      expect(get(guidanceEn, `glossary.${term}.definition`), term).toBeTruthy();
      expect(get(guidanceNb, `glossary.${term}.definition`), term).toBeTruthy();
    }
  });

  it('has the lessons and tours the pages open', () => {
    for (const lesson of [
      'iso45001-basics',
      'sja-basics',
      'ppe-last-line',
      'worker-participation',
    ]) {
      const sections = get(guidanceEn, `lessons.${lesson}.sections`) as unknown[];
      expect(sections.length, lesson).toBeGreaterThan(0);
      const quiz = get(guidanceEn, `lessons.${lesson}.quiz`) as {
        options: string[];
        answer: number;
      }[];
      for (const q of quiz) {
        expect(q.answer).toBeLessThan(q.options.length);
      }
    }
    for (const tour of ['overview', 'sja']) {
      expect((get(guidanceEn, `tours.${tour}`) as unknown[]).length, tour).toBeGreaterThan(0);
    }
  });

  it('uses only clause references the module declares or ISO 45001 / HS clauses', () => {
    for (const [path, value] of leaves(guidanceEn)) {
      if (/clauses\[/.test(path)) {
        expect(String(value), path).toMatch(/^(iso45001|hs):\d+(\.\d+)*$/);
      }
    }
  });
});

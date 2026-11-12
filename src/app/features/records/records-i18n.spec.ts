import en from '../../../assets/i18n/records/en.json';
import nb from '../../../assets/i18n/records/nb.json';
import guidanceEn from '../../../assets/guidance/en/records.json';
import guidanceNb from '../../../assets/guidance/nb/records.json';
import {
  APPROVAL_MODES,
  ASSIGNEE_TYPES,
  DATA_ERROR_CODES,
  FIELD_TYPES,
  NOTIFY_TYPES,
  STATE_CATEGORIES,
  TASK_PRIORITIES,
} from '../../core/records/record.models';
import {
  ISSUE_CODES,
  KNOWN_GUARDS,
  RECORDS_ERROR_CODES,
  TRANSITION_REASONS,
} from '../../core/records/records-errors';
import { MODULE_KEYS, ROLE_OPTIONS } from './designer-model';

type Dict = Record<string, unknown>;

/** Every leaf path of a JSON object, with array indexes. */
function paths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => paths(item, `${prefix}[${i}]`));
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

/** `{{ name }}` params of a string. */
function params(text: unknown): string[] {
  return typeof text === 'string'
    ? [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort()
    : [];
}

const LANGS: Record<string, Dict> = { en, nb };

describe('records i18n', () => {
  it('has the same keys in every language', () => {
    expect(paths(nb).sort()).toEqual(paths(en).sort());
  });

  it('uses the same interpolation params in every language', () => {
    for (const path of paths(en)) {
      expect(params(get(nb, path)), path).toEqual(params(get(en, path)));
    }
  });

  it('has no empty strings and no vendor names', () => {
    for (const [lang, dict] of Object.entries(LANGS)) {
      for (const path of paths(dict)) {
        const text = get(dict, path) as string;
        expect(text.trim(), `${lang}:${path}`).not.toBe('');
        expect(text, `${lang}:${path}`).not.toMatch(/claude|anthropic|openai|gpt/i);
      }
    }
  });

  const groups: [string, readonly string[]][] = [
    ['fieldTypes', FIELD_TYPES],
    ['categories', STATE_CATEGORIES],
    ['modules', [...MODULE_KEYS, 'other']],
    ['roles', ROLE_OPTIONS],
    ['approvalModes', APPROVAL_MODES],
    ['assigneeTypes', ASSIGNEE_TYPES],
    ['notifyTypes', NOTIFY_TYPES],
    ['priorities', TASK_PRIORITIES],
    ['errors', RECORDS_ERROR_CODES.filter((c) => c !== 'transition_not_allowed')],
    ['errors.reasons', TRANSITION_REASONS],
    ['guards', [...KNOWN_GUARDS, 'unknown']],
    ['issues', [...ISSUE_CODES, 'unknown']],
    ['form.errors', DATA_ERROR_CODES],
    ['panel.decisionLine', ['pending', 'approved', 'rejected', 'cancelled']],
    ['list.tab', ['types', 'workflows', 'templates']],
    ['designer.tab', ['fields', 'workflow', 'preview', 'history']],
  ];

  it.each(groups)('translates every %s value', (group, values) => {
    for (const value of values) {
      expect(typeof get(en, `${group}.${value}`), `${group}.${value}`).toBe('string');
    }
  });

  it('has the event title and timeline keys the backend declares', () => {
    const names = [
      'started',
      'transitioned',
      'approvalRequested',
      'approvalDecided',
      ...['recordType', 'workflow'].flatMap((p) =>
        ['Created', 'Updated', 'Published', 'Deleted'].map((v) => `${p}${v}`),
      ),
    ];
    for (const name of names) {
      expect(typeof get(en, `notifications.${name}`), name).toBe('string');
      expect(typeof get(en, `timeline.${name}`), name).toBe('string');
    }
  });
});

describe('records guidance', () => {
  it('has the same structure in every language', () => {
    expect(paths(guidanceNb).sort()).toEqual(paths(guidanceEn).sort());
  });

  it('keeps quiz answers and clause references identical across languages', () => {
    for (const path of paths(guidanceEn).filter((p) =>
      /answer$|minutes$|pass_mark$|clauses\[/.test(p),
    )) {
      expect(get(guidanceNb, path.replace(/\[(\d+)\]/g, '.$1')), path).toEqual(
        get(guidanceEn, path.replace(/\[(\d+)\]/g, '.$1')),
      );
    }
  });

  it('has an intro, a why-it-matters note and field help for every designer page', () => {
    for (const page of ['list', 'designer', 'workflow']) {
      expect(get(guidanceEn, `pages.${page}.intro.title`), page).toBeTruthy();
      expect(get(guidanceEn, `pages.${page}.why.body`), page).toBeTruthy();
    }
    expect(get(guidanceEn, 'pages.list.empty.cta')).toBeTruthy();
    expect(get(guidanceEn, 'pages.workflows.empty.cta')).toBeTruthy();
    for (const type of FIELD_TYPES) {
      expect(get(guidanceEn, `pages.designer.fields.type_${type}.help`), type).toBeTruthy();
    }
    for (const lesson of ['workflows-101', 'designing-record-types']) {
      expect(get(guidanceEn, `lessons.${lesson}.sections`), lesson).toBeTruthy();
    }
  });
});

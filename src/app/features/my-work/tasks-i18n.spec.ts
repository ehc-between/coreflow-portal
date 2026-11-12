import guideEn from '../../../assets/guidance/en/tasks.json';
import guideNb from '../../../assets/guidance/nb/tasks.json';
import en from '../../../assets/i18n/tasks/en.json';
import nb from '../../../assets/i18n/tasks/nb.json';
import { TASK_ERROR_CODES } from '../../core/tasks/task-errors';
import { KNOWN_WORK_SOURCES, TASK_PRIORITIES, TASK_STATUSES } from '../../core/tasks/task.models';
import { RRULE_FREQS, WEEKDAYS } from '../../shared/tasks/rrule';
import { BOARD_COLUMNS, DUE_FILTERS, MY_WORK_VIEWS } from './my-work-data';
import { STATUS_FILTERS } from './tasks/task-list';

type Tree = Record<string, unknown>;

/** Every leaf path of a JSON tree (arrays by index), for structural comparison. */
function shape(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Tree).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  }
  return [path];
}

function lookup(tree: Tree, key: string): unknown {
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

describe('tasks i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => {
    expect(shape(nb).sort()).toEqual(shape(en).sort());
  });

  it('keeps the guidance files at full en/nb parity', () => {
    expect(shape(guideNb).sort()).toEqual(shape(guideEn).sort());
  });

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it.each([
    ['status', TASK_STATUSES],
    ['priority', TASK_PRIORITIES],
    ['sources', KNOWN_WORK_SOURCES],
    ['errors', TASK_ERROR_CODES],
    ['rrule.freqs', RRULE_FREQS],
    ['rrule.weekdays', WEEKDAYS],
    ['rrule.weekdaysShort', WEEKDAYS],
    ['board.columns', BOARD_COLUMNS],
    ['filters.dueOptions', DUE_FILTERS],
    ['filters.statusOptions', STATUS_FILTERS],
    ['myWork.views', MY_WORK_VIEWS],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb] as Tree[]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('defines the scoped event texts the backend emits', () => {
    for (const lang of [en, nb] as Tree[]) {
      for (const kind of ['created', 'assigned', 'completed', 'reopened', 'cancelled']) {
        expect(typeof lookup(lang, `notifications.${kind}`)).toBe('string');
        expect(typeof lookup(lang, `timeline.${kind}`)).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with clauses, and lessons a valid quiz', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of ['myWork', 'list', 'detail', 'form', 'recurring']) {
        const p = (guide.pages as Tree)[page] as Tree;
        expect(p['intro'], page).toBeTruthy();
        expect(((p['why'] as Tree)['clauses'] as string[]).length, page).toBeGreaterThan(0);
      }
      for (const lesson of Object.values(guide.lessons)) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|openai|gpt|gemini|llama|mistral)\b/i;
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => banned.test(s))).toEqual([]);
    }
  });
});

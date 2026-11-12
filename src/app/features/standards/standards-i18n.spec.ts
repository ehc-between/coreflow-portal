import en from '../../../assets/i18n/standards/en.json';
import nb from '../../../assets/i18n/standards/nb.json';
import globalEn from '../../../assets/i18n/en.json';
import { STANDARDS_LESSONS } from './guide/standards-lesson';

interface Tree {
  readonly [key: string]: Tree | string;
}

/** Every leaf path of a translation tree ("a.b.c"). */
function leaves(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`),
  );
}

function get(tree: Tree, path: string): Tree | string | undefined {
  return path
    .split('.')
    .reduce<
      Tree | string | undefined
    >((node, key) => (node && typeof node === 'object' ? node[key] : undefined), tree);
}

/** `{{param}}` names used in a string, sorted. */
function params(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();
}

describe('standards scope translations', () => {
  const enLeaves = leaves(en as Tree);

  it('has full key parity between en and nb', () => {
    expect(leaves(nb as Tree).sort()).toEqual([...enLeaves].sort());
  });

  it('uses the same params in every language', () => {
    for (const path of enLeaves) {
      expect(params(get(nb as Tree, path) as string), path).toEqual(
        params(get(en as Tree, path) as string),
      );
    }
  });

  it('never fills a string with an empty value', () => {
    for (const path of enLeaves) {
      expect((get(en as Tree, path) as string).trim(), path).not.toBe('');
      expect((get(nb as Tree, path) as string).trim(), path).not.toBe('');
    }
  });

  it('does not shadow a global standards key (scope keys merge into the same namespace)', () => {
    const global = new Set(leaves((globalEn as unknown as { standards: Tree }).standards));
    expect(enLeaves.filter((path) => global.has(path))).toEqual([]);
  });

  it('has the event notification and timeline keys of the backend event kinds', () => {
    const kinds = [
      'evidenceLinked',
      'evidenceRejected',
      'evidenceUnlinked',
      'standardEnabled',
      'standardDisabled',
      'requirementUpdated',
    ];
    for (const kind of kinds) {
      expect(typeof get(en as Tree, `notifications.${kind}`)).toBe('string');
      expect(typeof get(en as Tree, `timeline.${kind}`)).toBe('string');
    }
  });

  it('has every text of every micro-lesson', () => {
    for (const lesson of Object.values(STANDARDS_LESSONS)) {
      const base = `lesson.${lesson.key}`;
      const keys = [
        'title',
        'question',
        'explanation',
        ...lesson.sections.flatMap((s) => [`${s}Heading`, `${s}Body`]),
        ...lesson.options,
      ];
      for (const key of keys) {
        expect(typeof get(en as Tree, `${base}.${key}`), `${base}.${key}`).toBe('string');
      }
      expect(lesson.answer).toBeLessThan(lesson.options.length);
    }
  });

  it('has the guide steps of every guided page', () => {
    for (const page of ['overview', 'readiness']) {
      for (const key of ['title', 'body', 'step1', 'step2', 'step3', 'why']) {
        expect(typeof get(en as Tree, `guide.${page}.${key}`), `${page}.${key}`).toBe('string');
      }
    }
  });

  it('contains no vendor or model names', () => {
    const all = JSON.stringify([en, nb]);
    expect(all).not.toMatch(/claude|anthropic|openai|\bgpt\b|gemini/i);
  });
});

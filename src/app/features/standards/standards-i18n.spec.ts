import guideEn from '../../../assets/guidance/en/standards.json';
import guideNb from '../../../assets/guidance/nb/standards.json';
import en from '../../../assets/i18n/standards/en.json';
import nb from '../../../assets/i18n/standards/nb.json';
import globalEn from '../../../assets/i18n/en.json';
import { expectKeyParity } from '../../../testing/i18n-parity';

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

/**
 * `{{param}}` names used in a string, sorted. Event payloads carry a Norwegian
 * twin of display params (`standard_name_nb`, `requirement_label_nb`), so the
 * `_nb` suffix counts as the same param.
 */
function params(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1].replace(/_nb$/, '')).sort();
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

  it('shows display names in notifications, never raw standard keys', () => {
    for (const kind of ['standardEnabled', 'standardDisabled', 'requirementUpdated']) {
      expect(get(en as Tree, `notifications.${kind}`)).toContain('{{standard_name}}');
      expect(get(nb as Tree, `notifications.${kind}`)).toContain('{{standard_name_nb}}');
    }
    expect(JSON.stringify([en, nb])).not.toContain('{{standard_key}}');
  });

  it('keeps the guidance file at full en/nb parity', () => expectKeyParity(guideEn, guideNb));

  it('has an intro for every page with a help strip, a lesson and a tour', () => {
    for (const page of ['overview', 'readiness', 'workspace', 'gaps']) {
      expect(guideEn.pages[page as keyof typeof guideEn.pages].intro.title, page).toBeTruthy();
    }
    expect(Object.keys(guideEn.lessons)).toEqual(
      expect.arrayContaining(['requirements-and-evidence', 'readiness']),
    );
    expect(guideEn.tours.overview.length).toBeGreaterThan(0);
    for (const lesson of Object.values(guideEn.lessons)) {
      for (const q of lesson.quiz) {
        expect(q.answer).toBeLessThan(q.options.length);
      }
    }
  });

  it('uses the nb glossary words (no "bevis", "påbegynt", "rammeverk" or "AI")', () => {
    const text = JSON.stringify([nb, guideNb]);
    // "Beredskap" as a translation of "readiness" is banned; compounds such as
    // "Beredskapsplan" (emergency preparedness plan, ISO 14001/45001) are fine.
    expect(text).not.toMatch(/\bbevis\b|påbegynt|rammeverk|\bberedskap(en)?\b/i);
    expect(text).not.toMatch(/\bAI\b/);
  });

  it('contains no vendor or model names', () => {
    const all = JSON.stringify([en, nb, guideEn, guideNb]);
    expect(all).not.toMatch(/claude|anthropic|openai|\bgpt\b|gemini/i);
  });
});

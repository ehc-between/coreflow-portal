import askEn from '../../../assets/i18n/ask/en.json';
import askNb from '../../../assets/i18n/ask/nb.json';
import { ANSWER_FEEDBACK_REASONS } from '../../core/ai/ai.models';
import { AGENT_ACTIONS } from '../command-palette/command-palette.actions';
import { HOWTO_ENTRIES } from './ask-howto';
import { STATUS_CATEGORIES, TYPED_STATUS_CATEGORIES } from './ask-status';
import { ALL_SUGGESTION_KEYS } from './ask-suggestions';

function shape(value: unknown, path = ''): string[] {
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      shape(child, path ? `${path}.${key}` : key),
    );
  }
  if (typeof value === 'string' && !value.trim()) {
    return [`${path}:EMPTY`];
  }
  return [`${path}:${typeof value}`];
}

function params(value: unknown, path = ''): string[] {
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      params(child, path ? `${path}.${key}` : key),
    );
  }
  if (typeof value !== 'string') {
    return [];
  }
  const found = [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();
  return found.length ? [`${path}:${found.join(',')}`] : [];
}

/** Read `ask.<path>` from a scope file (the scope name is the first key segment). */
function lookup(file: unknown, key: string): unknown {
  return key
    .replace(/^ask\./, '')
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], file);
}

describe('ask scope i18n', () => {
  const files = { en: askEn, nb: askNb };

  it('en and nb have the same keys and no empty strings', () => {
    expect(shape(askNb).sort()).toEqual(shape(askEn).sort());
  });

  it('en and nb use the same interpolation params', () => {
    expect(params(askNb).sort()).toEqual(params(askEn).sort());
  });

  it('translates every status category the server sends, and the typed variants', () => {
    for (const [lang, file] of Object.entries(files)) {
      for (const category of STATUS_CATEGORIES) {
        expect(
          lookup(file, `ask.status.categories.${category}`),
          `${lang} ${category}`,
        ).toBeTruthy();
      }
      for (const category of TYPED_STATUS_CATEGORIES) {
        expect(String(lookup(file, `ask.status.typed.${category}`))).toContain('{{type}}');
      }
    }
  });

  it('has every suggestion, action, how-to and feedback reason', () => {
    const keys = [
      ...ALL_SUGGESTION_KEYS,
      ...AGENT_ACTIONS.flatMap((a) => [
        `ask.palette.actions.${a.key}.label`,
        `ask.palette.actions.${a.key}.prompt`,
      ]),
      ...HOWTO_ENTRIES.flatMap((h) =>
        ['title', 'question', 'keywords'].map((part) => `ask.howto.${h.key}.${part}`),
      ),
      ...ANSWER_FEEDBACK_REASONS.map((r) => `ask.feedback.reasons.${r}`),
    ];
    for (const [lang, file] of Object.entries(files)) {
      for (const key of keys) {
        expect(typeof lookup(file, key), `${lang} ${key}`).toBe('string');
      }
    }
  });

  it('never collides with the global ask.* keys', () => {
    // The scope merges into the same `ask` namespace as the global panel strings.
    for (const key of ['title', 'intro', 'sources', 'proposal', 'error', 'working']) {
      expect(Object.keys(askEn)).not.toContain(key);
    }
  });

  it('uses the nb glossary and never names a vendor or model', () => {
    const nb = JSON.stringify(askNb);
    expect(nb).not.toMatch(/\bdashbord|\bbevis\b|\bevidens|\bklausul|\brammeverk/i);
    expect(nb).not.toMatch(/\bAI\b/);
    const text = JSON.stringify([askEn, askNb]);
    expect(text).not.toMatch(/claude|anthropic|openai|gpt|gemini|llm/i);
  });
});

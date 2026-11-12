import searchEn from '../../../assets/i18n/search/en.json';
import searchNb from '../../../assets/i18n/search/nb.json';
import guidanceEn from '../../../assets/guidance/en/search.json';
import guidanceNb from '../../../assets/guidance/nb/search.json';

/**
 * Key paths of a JSON value. Arrays contribute their length (so a lesson keeps the
 * same number of sections, steps and quiz options in every language), objects
 * their keys; leaf strings must be non-empty.
 */
function shape(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return [
      `${path}[${value.length}]`,
      ...value.flatMap((item, i) => shape(item, `${path}[${i}]`)),
    ];
  }
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

/** Interpolation params used by each string, so translations keep them. */
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

describe('search scope i18n and guidance', () => {
  it('en and nb translations have the same keys', () => {
    expect(shape(searchNb).sort()).toEqual(shape(searchEn).sort());
  });

  it('en and nb translations use the same interpolation params', () => {
    expect(params(searchNb).sort()).toEqual(params(searchEn).sort());
  });

  it('en and nb guidance have the same structure', () => {
    expect(shape(guidanceNb).sort()).toEqual(shape(guidanceEn).sort());
  });

  it('declares the ai_action timeline and notification keys the backend points at', () => {
    for (const verb of ['proposed', 'confirmed', 'rejected', 'expired', 'failed'] as const) {
      expect(searchEn.timeline.aiAction[verb]).toBeTruthy();
      expect(searchEn.notifications.aiAction[verb]).toBeTruthy();
    }
  });

  it('every lesson quiz answer points at an existing option', () => {
    for (const guidance of [guidanceEn, guidanceNb]) {
      for (const lesson of Object.values(guidance.lessons)) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeGreaterThanOrEqual(0);
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const text = JSON.stringify([searchEn, searchNb, guidanceEn, guidanceNb]);
    expect(text).not.toMatch(/claude|anthropic|openai|gpt|gemini|llm/i);
  });
});

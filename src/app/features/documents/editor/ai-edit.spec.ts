import { AI_QUICK_ACTIONS, TRANSLATE_PRESETS } from './ai-edit';

describe('AI edit actions', () => {
  it('exposes the quick actions in display order with i18n keys', () => {
    expect(AI_QUICK_ACTIONS.map((a) => a.mode)).toEqual([
      'improve',
      'rewrite',
      'shorten',
      'expand',
      'fix',
    ]);
    for (const action of AI_QUICK_ACTIONS) {
      expect(action.labelKey.startsWith('documents.editor.ai.')).toBe(true);
    }
  });

  it('offers English and Norwegian translation presets', () => {
    expect(TRANSLATE_PRESETS.map((p) => p.instruction)).toEqual(['English', 'Norwegian']);
  });
});

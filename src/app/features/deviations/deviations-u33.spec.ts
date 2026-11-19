import { convertToParamMap } from '@angular/router';
import { Action } from '../../core/deviations/deviation.models';
import { effectWord } from './detail/effect-check';
import { filtersFromParams, toDeviationFilters } from './deviations-list';
import en from '../../../assets/i18n/deviations/en.json';
import nb from '../../../assets/i18n/deviations/nb.json';

const action = (patch: Partial<Action>): Action => ({
  id: 'a',
  deviation_id: 'd',
  kind: 'corrective',
  description: 'Fix',
  status: 'open',
  created_at: '2026-01-01T00:00:00Z',
  ...patch,
});

/** U33: deviations and HMS, beginner version. */
describe('U33 deviations beginner version', () => {
  it('opens the HMS near-miss view from ?event_kind and sends it to the list', () => {
    const filters = filtersFromParams(convertToParamMap({ event_kind: 'near_miss' }));
    expect(filters).toEqual({ event_kind: 'near_miss' });
    expect(toDeviationFilters('', filters).event_kind).toBe('near_miss');
  });

  it('answers "Virket det?" per action in plain words', () => {
    expect(effectWord(action({ status: 'in_progress' }))).toBe('notDone');
    expect(effectWord(action({ status: 'done' }))).toBe('unchecked');
    expect(effectWord(action({ status: 'done', effectiveness_review_due_at: '2026-12-03' }))).toBe(
      'due',
    );
    expect(effectWord(action({ status: 'verified', effectiveness: 'effective' }))).toBe('worked');
    expect(effectWord(action({ status: 'verified', effectiveness: 'not_effective' }))).toBe(
      'failed',
    );
  });

  it('has the plain card titles in both languages', () => {
    expect(nb.plain.why.title).toBe('Hvorfor skjedde det?');
    expect(nb.plain.what.title).toBe('Hva gjør vi?');
    expect(nb.plain.effect.title).toBe('Virket det?');
    expect(Object.keys(en.plain.effect.words)).toEqual(Object.keys(nb.plain.effect.words));
    expect(Object.keys(en.eventKind)).toEqual(Object.keys(nb.eventKind));
  });
});

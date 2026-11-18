import { toneFor } from '../../shared/ui/tones';
import {
  STANDARD_OPTIONS,
  actionStatusToneValue,
  canJudgeEffect,
  effectivenessToneValue,
  isOverdue,
  statusToneValue,
} from './deviation-enums';

describe('deviation-enums', () => {
  it('maps deviation statuses onto the shared lifecycle tones', () => {
    expect(toneFor('lifecycle', statusToneValue('closed'))).toBe('pass');
    expect(toneFor('lifecycle', statusToneValue('investigating'))).toBe('accent');
    expect(toneFor('lifecycle', statusToneValue('verification'))).toBe('accent');
    expect(toneFor('lifecycle', statusToneValue('cancelled'))).toBe('neutral');
    expect(toneFor('lifecycle', statusToneValue('open'))).toBe('info');
  });

  it('uses the shared severity map (low is neutral, never green)', () => {
    expect(toneFor('severity', 'critical')).toBe('fail');
    expect(toneFor('severity', 'medium')).toBe('warn');
    expect(toneFor('severity', 'low')).toBe('neutral');
  });

  it('maps action statuses and effectiveness onto the tone map', () => {
    expect(toneFor('lifecycle', actionStatusToneValue('verified'))).toBe('pass');
    expect(toneFor('lifecycle', actionStatusToneValue('done'))).toBe('accent');
    expect(toneFor('lifecycle', effectivenessToneValue('effective'))).toBe('pass');
    expect(toneFor('lifecycle', effectivenessToneValue('not_effective'))).toBe('fail');
  });

  it('judges the effect only of finished actions', () => {
    expect(canJudgeEffect('done')).toBe(true);
    expect(canJudgeEffect('verified')).toBe(true);
    expect(canJudgeEffect('open')).toBe(false);
  });

  it('offers every standard the API accepts, including NIS2, ISO 42001 and the AI Act', () => {
    expect(STANDARD_OPTIONS).toEqual(
      expect.arrayContaining(['iso42001', 'nis2', 'eu_ai_act', 'gdpr', 'iso9001']),
    );
  });

  it('treats a past due date on an active item as overdue', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isOverdue(past, 'open')).toBe(true);
  });

  it('never reports closed or cancelled items as overdue', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isOverdue(past, 'closed')).toBe(false);
    expect(isOverdue(past, 'cancelled')).toBe(false);
    expect(isOverdue(undefined, 'open')).toBe(false);
  });
});

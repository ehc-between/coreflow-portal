import {
  actionStatusTone,
  effectivenessTone,
  isOverdue,
  severityTone,
  statusTone,
} from './deviation-enums';

describe('deviation-enums', () => {
  it('maps deviation statuses to tones', () => {
    expect(statusTone('closed')).toBe('pass');
    expect(statusTone('investigating')).toBe('warn');
    expect(statusTone('cancelled')).toBe('neutral');
    expect(statusTone('open')).toBe('info');
  });

  it('maps severities to tones', () => {
    expect(severityTone('critical')).toBe('fail');
    expect(severityTone('medium')).toBe('warn');
    expect(severityTone('low')).toBe('neutral');
  });

  it('maps action statuses to tones', () => {
    expect(actionStatusTone('verified')).toBe('pass');
    expect(actionStatusTone('done')).toBe('accent');
    expect(actionStatusTone('in_progress')).toBe('warn');
    expect(actionStatusTone('cancelled')).toBe('neutral');
    expect(actionStatusTone('open')).toBe('info');
  });

  it('maps effectiveness to tones', () => {
    expect(effectivenessTone('effective')).toBe('pass');
    expect(effectivenessTone('not_effective')).toBe('fail');
    expect(effectivenessTone('pending')).toBe('warn');
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

import { formatRelativeTime } from './relative-time';

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');

  it('formats past times in the given language', () => {
    expect(formatRelativeTime('2026-10-19T11:55:00Z', 'en', now)).toBe('5 minutes ago');
    expect(formatRelativeTime('2026-10-19T09:00:00Z', 'en', now)).toBe('3 hours ago');
    expect(formatRelativeTime('2026-10-18T12:00:00Z', 'en', now)).toBe('yesterday');
    expect(formatRelativeTime('2026-10-19T11:55:00Z', 'nb', now)).toBe('for 5 minutter siden');
  });

  it('treats anything under a minute as now', () => {
    expect(formatRelativeTime('2026-10-19T11:59:30Z', 'en', now)).toBe('now');
  });

  it('reads an offset-less backend timestamp as UTC', () => {
    expect(formatRelativeTime('2026-10-19T11:55:00', 'en', now)).toBe('5 minutes ago');
    expect(formatRelativeTime('2026-10-19T11:55:00.123456', 'en', now)).toBe('5 minutes ago');
    expect(formatRelativeTime('2026-10-19T13:55:00+02:00', 'en', now)).toBe('5 minutes ago');
  });

  it('returns an empty string for invalid input', () => {
    expect(formatRelativeTime('nope', 'en', now)).toBe('');
  });
});

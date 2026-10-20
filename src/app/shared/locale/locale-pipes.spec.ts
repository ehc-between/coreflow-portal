import { formatNumber } from '@angular/common';
import { localeForLang, withUtcDefault } from '../../core/i18n/locale';
import { formatLocalDate, formatLocalDay } from './locale-pipes';

describe('locale formatting', () => {
  it('maps UI languages to registered Angular locales', () => {
    expect(localeForLang('nb')).toBe('nb');
    expect(localeForLang('en')).toBe('en');
    expect(localeForLang('xx')).toBe('en');
  });

  it('formats dates in Norwegian for nb', () => {
    expect(formatLocalDate('2026-10-20', 'mediumDate', 'nb')).toBe('20. okt. 2026');
    expect(formatLocalDate('2026-10-20', 'mediumDate', 'en')).toBe('Oct 20, 2026');
  });

  it('groups digits per locale', () => {
    // nb groups with a (narrow) no-break space.
    expect(formatNumber(1234, 'nb').replace(/\s/g, ' ')).toBe('1 234');
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });

  it('treats naive backend date-times as UTC and leaves date-only values alone', () => {
    expect(withUtcDefault('2026-10-19T10:00:00')).toBe('2026-10-19T10:00:00Z');
    expect(withUtcDefault('2026-10-19T10:00:00Z')).toBe('2026-10-19T10:00:00Z');
    expect(withUtcDefault('2026-10-19')).toBe('2026-10-19');
  });

  it('formats date-only fields as their calendar day, whatever the time part', () => {
    expect(formatLocalDay('2026-10-20', 'mediumDate', 'en')).toBe('Oct 20, 2026');
    expect(formatLocalDay('2026-10-20T00:00:00Z', 'mediumDate', 'en')).toBe('Oct 20, 2026');
    expect(formatLocalDay('2026-10-20T23:30:00+02:00', 'mediumDate', 'nb')).toBe('20. okt. 2026');
    expect(formatLocalDay('2026-10-20T00:00:00', 'mediumDate', 'en')).toBe('Oct 20, 2026');
    expect(formatLocalDay(null, 'mediumDate', 'en')).toBe('');
    expect(formatLocalDay('soon', 'mediumDate', 'en')).toBe('');
  });

  it('returns an empty string for missing values', () => {
    expect(formatLocalDate(null, 'mediumDate', 'nb')).toBe('');
    expect(formatLocalDate('', 'mediumDate', 'nb')).toBe('');
  });
});

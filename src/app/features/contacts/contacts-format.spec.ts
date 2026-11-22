import {
  badgeTone,
  daysUntil,
  formatOrgNumber,
  locationPhrase,
  monthName,
  nextIsPill,
  nextPhrase,
  noticePhrase,
  parseTab,
  riskLevelKey,
  roleOfTab,
} from './data/contacts-format';

describe('contacts format helpers', () => {
  it('maps tones, tabs and org numbers', () => {
    expect(badgeTone('ok')).toBe('pass');
    expect(badgeTone('bad')).toBe('fail');
    expect(badgeTone('plain')).toBe('neutral');
    expect(parseTab('suppliers')).toBe('suppliers');
    expect(parseTab('nope')).toBe('all');
    expect(parseTab(null)).toBe('all');
    expect(roleOfTab('processors')).toBe('processor');
    expect(roleOfTab('agreements')).toBeNull();
    expect(formatOrgNumber('923456781')).toBe('923 456 781');
    expect(formatOrgNumber('GB123')).toBe('GB123');
  });

  it('builds the "Neste" phrase', () => {
    expect(nextPhrase(null, 'nb')).toBeNull();
    expect(
      nextPhrase({ key: 'noticeIn', params: { days: 5 }, tone: 'warn', due_at: null }, 'nb'),
    ).toEqual({ key: 'contacts.next.noticeIn', params: { days: 5 } });
    expect(
      nextPhrase(
        { key: 'openComplaints', params: { count: 1 }, tone: 'plain', due_at: null },
        'nb',
      ),
    ).toEqual({ key: 'contacts.next.openComplaintsOne' });
    const renews = nextPhrase(
      { key: 'renewsOn', params: { date: '2027-03-14' }, tone: 'plain', due_at: null },
      'nb',
    );
    expect(renews?.params?.['month']).toBe(monthName('2027-03-14', 'nb'));
    expect(nextIsPill({ key: 'signDpa', params: {}, tone: 'bad', due_at: null })).toBe(true);
    expect(nextIsPill({ key: 'renewsOn', params: {}, tone: 'plain', due_at: null })).toBe(false);
  });

  it('labels locations, risk levels and notice periods', () => {
    const name = (code: string) => (code === 'NO' ? 'Norge' : code);
    expect(locationPhrase('NO', name)).toEqual({
      key: 'contacts.card.personalData.eea',
      params: { country: 'Norge' },
    });
    expect(locationPhrase('US', name)?.key).toBe('contacts.card.personalData.outside');
    expect(locationPhrase(null, name)).toBeNull();
    expect(riskLevelKey('Medium')).toBe('contacts.card.risks.level.medium');
    expect(riskLevelKey('Very high')).toBe('contacts.card.risks.level.very_high');
    expect(riskLevelKey('Egen skala')).toBeNull();
    expect(noticePhrase(30)).toEqual({
      key: 'contacts.card.agreements.noticeMonths',
      params: { months: 1 },
    });
    expect(noticePhrase(14)?.key).toBe('contacts.card.agreements.noticeDays');
    expect(noticePhrase(null)).toBeNull();
    expect(daysUntil('2026-11-27', new Date(2026, 10, 22, 15))).toBe(5);
  });
});

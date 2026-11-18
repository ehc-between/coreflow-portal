import { ReportingObligation } from '../../core/deviations/deviation.models';
import {
  clauseRefsOf,
  clausesFromRefs,
  deviationsNav,
  eventTimesErrorKey,
  hoursLeft,
  isOpenObligation,
  localToUtc,
  obligationToneValue,
  personOptions,
  utcToLocal,
} from './deviation-display';

describe('deviation-display', () => {
  it('shows the e-mail only when names are ambiguous or missing', () => {
    const out = personOptions([
      { id: '1', name: 'Super', email: 'a@x.no' },
      { id: '2', name: 'Super', email: 'b@x.no' },
      { id: '3', name: 'Kari Nordmann', email: 'k@x.no' },
      { id: '4', name: '', email: 'n@x.no' },
    ]);
    expect(out.map((o) => o.name)).toEqual([
      'Kari Nordmann',
      'n@x.no',
      'Super (a@x.no)',
      'Super (b@x.no)',
    ]);
  });

  it('converts between cited clauses and canonical clause refs', () => {
    expect(clauseRefsOf([{ standard: 'hs', clause: '10.2' }])).toEqual(['hs:10.2']);
    expect(clausesFromRefs(['iso27001-2022:A.5.24', 'eu_ai_act:73', 'iso22301:8.4', 'x'])).toEqual([
      { standard: 'iso27001', clause: 'A.5.24' },
      { standard: 'eu_ai_act', clause: '73' },
    ]);
  });

  it('round-trips date-times through local input values as naive UTC', () => {
    const local = utcToLocal('2026-03-04T10:15:00');
    expect(localToUtc(local)).toBe('2026-03-04T10:15:00');
    expect(localToUtc('')).toBeNull();
  });

  it('explains event times the API would reject', () => {
    const now = new Date('2026-03-04T12:00:00Z');
    expect(eventTimesErrorKey('2026-03-06T10:00', '', now)).toBe('deviations.facts.errors.future');
    expect(eventTimesErrorKey('2026-03-03T10:00', '2026-03-02T10:00', now)).toBe(
      'deviations.facts.errors.order',
    );
    expect(eventTimesErrorKey('2026-03-02T10:00', '2026-03-03T10:00', now)).toBeNull();
  });

  it('counts down to an authority deadline', () => {
    const o = {
      key: 'gdpr_33',
      status: 'pending',
      deadline_at: '2026-03-04T12:00:00',
    } as ReportingObligation;
    expect(hoursLeft(o, new Date('2026-03-04T02:00:00Z'))).toBe(10);
    expect(hoursLeft(o, new Date('2026-03-04T15:00:00Z'))).toBe(-3);
    expect(isOpenObligation(o)).toBe(true);
    expect(isOpenObligation({ ...o, status: 'notified' })).toBe(false);
    expect(obligationToneValue('closed_unreported')).toBe('failed');
  });

  it('shows received reports in the module nav only to intake handlers', () => {
    expect(deviationsNav({ intake: false }).map((i) => i.link)).toEqual([
      '/deviations',
      '/deviations/actions',
      '/deviations/stats',
    ]);
    const withIntake = deviationsNav({ intake: true, newReports: 2 });
    expect(withIntake[2]).toEqual(
      expect.objectContaining({ link: '/deviations/intake', count: 2 }),
    );
  });
});

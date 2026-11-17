import { showsQuestion } from '../findings/finding-panel';
import { defaultTitle } from '../inspections/inspection-form';
import { toScheduleFields, EMPTY_SCHEDULE_FORM } from '../schedules/schedules-list';
import { atLeast, dateInputToIsoEnd, distinctTemplateTitle, isSerious } from './inspection-display';
import { memberLabels } from './inspection-references';

describe('inspection display helpers', () => {
  it('hides the checklist name when the title already says it', () => {
    expect(distinctTemplateTitle('Vernerunde', 'Vernerunde')).toBeNull();
    expect(distinctTemplateTitle('Vernerunde – Lager', 'Vernerunde')).toBeNull();
    expect(distinctTemplateTitle('Lager i november', 'Vernerunde')).toBe('Vernerunde');
    expect(distinctTemplateTitle('X', null)).toBeNull();
  });

  it('defaults the title to "Checklist – Place"', () => {
    expect(defaultTitle('Vernerunde', ' Lager ')).toBe('Vernerunde – Lager');
    expect(defaultTitle('Vernerunde', '')).toBe('Vernerunde');
    expect(defaultTitle(null, 'Lager')).toBe('');
  });

  it('orders severities and treats high and critical as serious', () => {
    expect(atLeast('critical', 'high')).toBe(true);
    expect(atLeast('medium', 'high')).toBe(false);
    expect(isSerious('high')).toBe(true);
    expect(isSerious('medium')).toBe(false);
  });

  it('ends a "to" date filter at the end of the day', () => {
    expect(dateInputToIsoEnd('2026-03-31')).toBe('2026-03-31T23:59:59');
    expect(dateInputToIsoEnd('')).toBeNull();
  });

  it('only repeats the question when it differs from the finding title', () => {
    expect(showsQuestion({ title: 'Exits clear?', question_text: 'exits clear?' })).toBe(false);
    expect(showsQuestion({ title: 'Blocked exit', question_text: 'Exits clear?' })).toBe(true);
    expect(showsQuestion({ title: 'Blocked exit', question_text: null })).toBe(false);
  });

  it('disambiguates people who share a name', () => {
    const labels = memberLabels([
      { id: '1', name: 'Super', email: 'a@x.no' },
      { id: '2', name: 'Super', email: 'b@x.no' },
      { id: '3', name: '', email: 'c@x.no' },
      { id: '4', name: 'Kari', email: 'k@x.no' },
    ]);
    expect(labels.map((l) => l.name)).toEqual([
      'Super (a@x.no)',
      'Super (b@x.no)',
      'c@x.no',
      'Kari',
    ]);
  });

  it('sends a schedule subject only when both kind and record are chosen', () => {
    const base = { ...EMPTY_SCHEDULE_FORM, startDate: '2026-12-01' };
    expect(
      toScheduleFields({ ...base, subject: { type: 'asset', id: null, title: null } }),
    ).toMatchObject({ subject_type: null, subject_id: null });
    expect(
      toScheduleFields({ ...base, subject: { type: 'asset', id: 'a-1', title: 'Truck' } }),
    ).toMatchObject({ subject_type: 'asset', subject_id: 'a-1' });
  });
});

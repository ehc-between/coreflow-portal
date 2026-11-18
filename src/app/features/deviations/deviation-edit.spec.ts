import { DeviationDetail } from '../../core/deviations/deviation.models';
import { utcToLocal } from './deviation-display';
import { buildDeviationPatch, editFormFrom } from './deviation-edit';

const base: DeviationDetail = {
  id: 'd1',
  code: 'DEV-1',
  title: 'Leak',
  type_id: 't1',
  standards: ['iso9001'],
  clauses: [{ standard: 'iso9001', clause: '8.7' }],
  tags: ['valve'],
  severity: 'medium',
  status: 'open',
  source: 'internal',
  department_id: 'dep1',
  raised_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  due_at: '2026-02-01T00:00:00Z',
  occurred_at: '2026-01-01T08:00:00',
  visibility: 'organization',
  data: { a: 1 },
  actions: [],
  events: [],
};

describe('buildDeviationPatch', () => {
  it('is empty when nothing changed', () => {
    expect(buildDeviationPatch(base, editFormFrom(base))).toEqual({});
  });

  it('starts the requirement picker from the cited clauses', () => {
    expect(editFormFrom(base).refs).toEqual(['iso9001:8.7']);
  });

  it('sends cited requirements as canonical clause rows, never the standards', () => {
    const form = {
      ...editFormFrom(base),
      refs: ['iso9001:8.7', 'iso14001-2015:6.1', 'hs:10.2', 'iso9001:8.7'],
      tags: ['valve', 'leak'],
    };
    expect(buildDeviationPatch(base, form)).toEqual({
      clauses: [
        { standard: 'iso9001', clause: '8.7' },
        { standard: 'iso14001', clause: '6.1' },
        { standard: 'hs', clause: '10.2' },
      ],
      tags: ['valve', 'leak'],
    });
  });

  it('sends changed event facts and clears them with null', () => {
    const form = {
      ...editFormFrom(base),
      occurredAt: '',
      detectedAt: utcToLocal('2026-01-01T09:30:00'),
      location: ' Lager 2 ',
      immediateAction: 'Stopped the line',
    };
    expect(buildDeviationPatch(base, form)).toEqual({
      occurred_at: null,
      detected_at: '2026-01-01T09:30:00',
      location: 'Lager 2',
      immediate_action: 'Stopped the line',
    });
  });

  it('changes and clears the department (null clears)', () => {
    expect(buildDeviationPatch(base, { ...editFormFrom(base), departmentId: 'dep2' })).toEqual({
      department_id: 'dep2',
    });
    expect(buildDeviationPatch(base, { ...editFormFrom(base), departmentId: '' })).toEqual({
      department_id: null,
    });
  });

  it('keeps the core-field behaviour (trimmed title, cleared due date, whole data)', () => {
    const form = { ...editFormFrom(base), title: ' New ', dueAt: '', data: { a: 2 } };
    expect(buildDeviationPatch(base, form)).toEqual({
      title: 'New',
      due_at: null,
      data: { a: 2 },
    });
  });
});

describe('buildDeviationPatch root cause method', () => {
  it('sends null (not an empty string) when the method is cleared', () => {
    const dev: DeviationDetail = { ...base, root_cause_method: 'five_why' };
    expect(buildDeviationPatch(dev, { ...editFormFrom(dev), rootCauseMethod: '' })).toEqual({
      root_cause_method: null,
    });
  });

  it('accepts "not needed" with a reason', () => {
    const patch = buildDeviationPatch(base, {
      ...editFormFrom(base),
      rootCauseMethod: 'not_needed',
      rootCause: 'One-off typo, fixed at once.',
    });
    expect(patch).toEqual({
      root_cause_method: 'not_needed',
      root_cause: 'One-off typo, fixed at once.',
    });
  });
});

import { DeviationDetail } from '../../core/deviations/deviation.models';
import { buildDeviationPatch, editFormFrom, toClauseRefs } from './deviation-edit';

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
  visibility: 'organization',
  data: { a: 1 },
  actions: [],
  events: [],
};

describe('buildDeviationPatch', () => {
  it('is empty when nothing changed', () => {
    expect(buildDeviationPatch(base, editFormFrom(base))).toEqual({});
  });

  it('sends changed standards, clauses and tags', () => {
    const form = {
      ...editFormFrom(base),
      standards: ['iso9001', 'iso14001'] as const,
      clauses: [
        { standard: 'iso9001' as const, clause: ' 8.7 ' },
        { standard: 'iso14001' as const, clause: '6.1' },
        { standard: 'iso9001' as const, clause: '  ' },
      ],
      tags: ['valve', 'leak'],
    };
    expect(buildDeviationPatch(base, form)).toEqual({
      standards: ['iso9001', 'iso14001'],
      clauses: [
        { standard: 'iso9001', clause: '8.7' },
        { standard: 'iso14001', clause: '6.1' },
      ],
      tags: ['valve', 'leak'],
    });
  });

  it('ignores blank clause rows and whitespace when comparing clauses', () => {
    const form = {
      ...editFormFrom(base),
      clauses: [
        { standard: 'iso9001' as const, clause: '8.7 ' },
        { standard: 'iso9001' as const, clause: '' },
      ],
    };
    expect(buildDeviationPatch(base, form)).toEqual({});
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
});

describe('toClauseRefs', () => {
  it('drops blank rows and trims', () => {
    expect(
      toClauseRefs([
        { standard: 'iso9001', clause: ' 4.1 ' },
        { standard: 'iso9001', clause: '' },
      ]),
    ).toEqual([{ standard: 'iso9001', clause: '4.1' }]);
  });
});

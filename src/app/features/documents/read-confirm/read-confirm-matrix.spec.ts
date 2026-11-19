import { approveBody } from '../../../core/documents/documents-api';
import { AcknowledgementMatrix } from '../../../core/documents/document.models';
import { filterPeople, matrixCsv } from './read-confirm-matrix';

const MATRIX: AcknowledgementMatrix = {
  documents: [
    {
      id: 'd1',
      doc_code: 'POL-1',
      title: 'Security',
      type: 'policy',
      revision: 'A',
      scope: 'audience',
      acknowledged: 1,
      total: 2,
    },
    {
      id: 'd2',
      doc_code: null,
      title: 'Code of conduct',
      type: 'policy',
      revision: 'B',
      scope: 'readers',
      acknowledged: 0,
      total: 1,
    },
  ],
  people: [
    {
      user_id: 'u1',
      name: 'Emma',
      email: 'emma@example.no',
      acknowledged: 1,
      total: 1,
      cells: [{ status: 'acknowledged', acknowledged_at: '2026-11-01T10:00:00' }, null],
    },
    {
      user_id: 'u2',
      name: 'Lars',
      email: 'lars@example.no',
      acknowledged: 0,
      total: 2,
      cells: [
        { status: 'pending', acknowledged_at: null },
        { status: 'pending', acknowledged_at: null },
      ],
    },
  ],
};

describe('read-confirm matrix helpers', () => {
  it('filters by search and by missing confirmations', () => {
    expect(filterPeople(MATRIX.people, '', false).map((p) => p.user_id)).toEqual(['u1', 'u2']);
    expect(filterPeople(MATRIX.people, 'LARS', false).map((p) => p.user_id)).toEqual(['u2']);
    expect(filterPeople(MATRIX.people, '', true).map((p) => p.user_id)).toEqual(['u2']);
  });

  it('exports one row per person and one column per document', () => {
    const csv = matrixCsv(MATRIX, MATRIX.people, {
      person: 'Person',
      email: 'Email',
      missing: 'Missing',
    }).split('\r\n');
    expect(csv[0]).toBe('"Person","Email","POL-1 Security","Code of conduct"');
    expect(csv[1]).toBe('"Emma","emma@example.no","2026-11-01T10:00:00",""');
    expect(csv[2]).toBe('"Lars","lars@example.no","Missing","Missing"');
  });

  it('builds the approve body with the publishing answers', () => {
    expect(approveBody('  ', {})).toBeNull();
    expect(approveBody('Ok', { readers: [], readBy: '2026-12-31' })).toEqual({ note: 'Ok' });
    expect(
      approveBody(null, {
        readers: [{ type: 'department', value: 'dep-1' }],
        readBy: '2026-12-31',
        reviewIntervalMonths: 12,
      }),
    ).toEqual({
      readers: [{ type: 'department', value: 'dep-1' }],
      read_by: '2026-12-31',
      review_interval_months: 12,
    });
  });
});

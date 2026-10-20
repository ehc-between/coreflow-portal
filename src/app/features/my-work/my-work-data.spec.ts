import { DeviationListItem } from '../../core/deviations/deviation.models';
import { DocumentSummary, Proposal } from '../../core/documents/document.models';
import { assembleApprovals, assembleOwnedDeviations } from './my-work-data';

function deviation(overrides: Partial<DeviationListItem>): DeviationListItem {
  return {
    id: 'id',
    code: 'DEV-1',
    title: 'Deviation',
    type_id: 'type',
    standards: [],
    clauses: [],
    tags: [],
    severity: 'medium',
    status: 'open',
    source: 'internal',
    raised_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('assembleOwnedDeviations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops closed and cancelled deviations', () => {
    const rows = assembleOwnedDeviations([
      deviation({ id: 'a', status: 'open' }),
      deviation({ id: 'b', status: 'closed' }),
      deviation({ id: 'c', status: 'cancelled' }),
      deviation({ id: 'd', status: 'verification' }),
    ]);
    expect(rows.map((r) => r.item.id)).toEqual(['a', 'd']);
  });

  it('sorts by due date soonest first, undated last, ties by code', () => {
    const rows = assembleOwnedDeviations([
      deviation({ id: 'none', code: 'DEV-9' }),
      deviation({ id: 'late', code: 'DEV-3', due_at: '2026-12-01T00:00:00Z' }),
      deviation({ id: 'early', code: 'DEV-2', due_at: '2026-10-01T00:00:00Z' }),
      deviation({ id: 'none2', code: 'DEV-1' }),
    ]);
    expect(rows.map((r) => r.item.id)).toEqual(['early', 'late', 'none2', 'none']);
  });

  it('flags deviations past their due date as overdue', () => {
    const rows = assembleOwnedDeviations([
      deviation({ id: 'past', due_at: '2026-10-18T00:00:00Z' }),
      deviation({ id: 'future', due_at: '2026-10-20T00:00:00Z' }),
      deviation({ id: 'undated' }),
    ]);
    expect(rows.map((r) => [r.item.id, r.overdue])).toEqual([
      ['past', true],
      ['future', false],
      ['undated', false],
    ]);
  });
});

describe('assembleApprovals', () => {
  const proposal = (id: string, createdAt: string, summary = ''): Proposal => ({
    id,
    kind: 'document',
    title: `Proposal ${id}`,
    summary,
    status: 'pending',
    created_by_user_id: 'u',
    created_at: createdAt,
  });
  const doc = (id: string, updatedAt: string, status: DocumentSummary['status']) =>
    ({
      id,
      type: 'procedure',
      title: `Doc ${id}`,
      doc_code: `DOC-${id}`,
      status,
      owner_user_id: 'u',
      current_rev: 1,
      updated_at: updatedAt,
    }) satisfies DocumentSummary;

  it('merges proposals and in-review documents, oldest first, with links', () => {
    const items = assembleApprovals(
      [proposal('p1', '2026-10-10T00:00:00Z', 'Tighten wording')],
      [
        doc('d1', '2026-10-05T00:00:00Z', 'in_review'),
        doc('d2', '2026-10-12T00:00:00Z', 'in_review'),
      ],
    );
    expect(items.map((i) => [i.kind, i.id])).toEqual([
      ['document', 'd1'],
      ['proposal', 'p1'],
      ['document', 'd2'],
    ]);
    expect(items[0]).toMatchObject({ link: ['/documents', 'd1'], detail: 'DOC-d1' });
    expect(items[1]).toMatchObject({ link: ['/review', 'p1'], detail: 'Tighten wording' });
  });

  it('ignores documents not in review and blank proposal summaries', () => {
    const items = assembleApprovals(
      [proposal('p1', '2026-10-10T00:00:00Z')],
      [doc('d1', '2026-10-05T00:00:00Z', 'approved')],
    );
    expect(items).toHaveLength(1);
    expect(items[0].detail).toBeNull();
  });

  it('is empty when nothing is pending', () => {
    expect(assembleApprovals([], [])).toEqual([]);
  });
});

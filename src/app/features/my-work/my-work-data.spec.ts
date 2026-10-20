import { ActionListItem, DeviationListItem } from '../../core/deviations/deviation.models';
import { DocumentSummary, Proposal } from '../../core/documents/document.models';
import { assembleApprovals, assembleMyActions, assembleOwnedDeviations } from './my-work-data';

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

  it('keeps every row the server returned (active filtering is server-side)', () => {
    const rows = assembleOwnedDeviations([
      deviation({ id: 'a', status: 'open' }),
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

describe('assembleMyActions', () => {
  const action = (overrides: Partial<ActionListItem>): ActionListItem => ({
    id: 'a',
    deviation_id: 'dev',
    kind: 'corrective',
    description: 'Fix it',
    status: 'open',
    created_at: '2026-01-01T00:00:00Z',
    deviation_code: 'DEV-1',
    deviation_title: 'Deviation',
    deviation_status: 'open',
    deviation_severity: 'medium',
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the server order and reports the total', () => {
    const items = [action({ id: 'x', due_at: '2026-10-01T00:00:00Z' }), action({ id: 'y' })];
    const result = assembleMyActions({ items, total: 2 });
    expect(result.items.map((a) => a.id)).toEqual(['x', 'y']);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('uses the server overdue count when given, even beyond the page', () => {
    const result = assembleMyActions(
      { items: [action({ id: 'x', due_at: '2026-10-01T00:00:00Z' })], total: 80 },
      12,
    );
    expect(result.overdueCount).toBe(12);
    expect(result.truncated).toBe(true);
  });

  it('falls back to counting open / in-progress rows past their due date', () => {
    const result = assembleMyActions({
      items: [
        action({ id: 'late', due_at: '2026-10-18T00:00:00Z' }),
        action({ id: 'lateWip', status: 'in_progress', due_at: '2026-10-01T00:00:00Z' }),
        action({ id: 'lateDone', status: 'done', due_at: '2026-10-01T00:00:00Z' }),
        action({ id: 'future', due_at: '2026-10-20T00:00:00Z' }),
        action({ id: 'undated' }),
      ],
      total: 5,
    });
    expect(result.overdueCount).toBe(2);
  });

  it('is empty when the user has no open actions', () => {
    expect(assembleMyActions({ items: [], total: 0 })).toEqual({
      items: [],
      overdueCount: 0,
      total: 0,
      truncated: false,
    });
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

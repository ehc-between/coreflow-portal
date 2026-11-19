import { DocumentDetail, DocumentRevision } from '../../core/documents/document.models';
import { documentMissing, documentStatusLine } from './document-anatomy';

const rev = (
  id: string,
  label: string,
  extra: Partial<DocumentRevision> = {},
): DocumentRevision => ({
  id,
  rev: label,
  status: 'approved',
  author_user_id: 'u-1',
  created_at: '2026-10-01T00:00:00Z',
  ...extra,
});

function doc(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    id: 'doc-1',
    type: 'procedure',
    title: 'Quality manual',
    doc_code: 'QM-1',
    status: 'approved',
    owner_user_id: 'u-1',
    current_revision: rev('r-a', 'A'),
    revisions: [],
    ...overrides,
  };
}

const K = 'documents.page.detail.status';

describe('documentStatusLine', () => {
  it('calls an approved document done (green)', () => {
    const line = documentStatusLine(doc());
    expect(line.key).toBe(`${K}.approved`);
    expect(line.tone).toBe('pass');
    expect(line.extraKey).toBeNull();
  });

  it('treats a never-approved draft as a to-do, never red', () => {
    const line = documentStatusLine(doc({ status: 'draft', current_revision: null }));
    expect(line.key).toBe(`${K}.draft`);
    expect(line.tone).toBe('warn');
  });

  it('says which version applies while a new one is written', () => {
    const line = documentStatusLine(doc({ status: 'draft', draft_revision: rev('r-b', 'B') }));
    expect(line.key).toBe(`${K}.revising`);
    expect(line.tone).toBe('pass');
    expect(line.extraKey).toBe(`${K}.stillApplies`);
    expect(line.extraParams).toEqual({ rev: 'A' });
  });

  it('names the requested approver while in review', () => {
    const named = documentStatusLine(
      doc({
        status: 'in_review',
        draft_revision: rev('r-b', 'B', { requested_approver_name: 'Kari' }),
      }),
    );
    expect(named.key).toBe(`${K}.inReview`);
    expect(named.params).toEqual({ name: 'Kari' });
    expect(named.tone).toBe('warn');
    const anyone = documentStatusLine(
      doc({ status: 'in_review', current_revision: null, draft_revision: rev('r-a', 'A') }),
    );
    expect(anyone.key).toBe(`${K}.inReviewAny`);
    expect(anyone.extraKey).toBeNull();
  });

  it('keeps obsolete neutral', () => {
    expect(documentStatusLine(doc({ status: 'obsolete' })).tone).toBe('neutral');
  });
});

describe('documentMissing', () => {
  const base = {
    canEdit: true,
    canManage: true,
    reviewOverdue: false,
    editLink: ['/documents', 'doc-1', 'edit'],
    planReview: () => undefined,
  };

  it('is empty for an approved document on schedule', () => {
    expect(documentMissing(doc(), base)).toEqual([]);
  });

  it('asks drafters to make the requested changes', () => {
    const items = documentMissing(
      doc({
        status: 'draft',
        pending_change_request: { comment: 'Fix', by_name: 'Kari', at: '2026-11-01' },
      }),
      base,
    );
    expect(items.map((i) => i.key)).toEqual(['changes']);
    expect(items[0].link).toEqual(base.editLink);
  });

  it('lists an overdue review for managers only, with an action', () => {
    const planReview = vi.fn();
    const items = documentMissing(doc(), { ...base, reviewOverdue: true, planReview });
    expect(items.map((i) => i.key)).toEqual(['review']);
    items[0].action?.();
    expect(planReview).toHaveBeenCalled();
    expect(documentMissing(doc(), { ...base, reviewOverdue: true, canManage: false })).toEqual([]);
    expect(documentMissing(doc({ status: 'obsolete' }), { ...base, reviewOverdue: true })).toEqual(
      [],
    );
  });
});

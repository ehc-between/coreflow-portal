import { DocumentDetail } from '../../../core/documents/document.models';
import { withAcknowledgement } from './document-acknowledge';
import { REVIEW_DUE_SOON_DAYS, reviewState, toDateInput } from './document-review';
import { controlChanges } from './document-review-panel';
import { defaultVersionView } from './document-version-banner';

const NOW = new Date('2026-10-20T12:00:00Z');
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

describe('reviewState', () => {
  it('trusts the backend overdue flag', () => {
    expect(reviewState({ status: 'approved', review_overdue: true }, NOW)).toBe('overdue');
  });

  it('flags a past review date as overdue and a near one as due', () => {
    expect(reviewState({ status: 'approved', next_review_at: daysFromNow(-1) }, NOW)).toBe(
      'overdue',
    );
    expect(
      reviewState({ status: 'approved', next_review_at: daysFromNow(REVIEW_DUE_SOON_DAYS) }, NOW),
    ).toBe('due');
    expect(
      reviewState(
        { status: 'approved', next_review_at: daysFromNow(REVIEW_DUE_SOON_DAYS + 1) },
        NOW,
      ),
    ).toBeNull();
  });

  it('never flags obsolete documents or documents without a review date', () => {
    expect(reviewState({ status: 'obsolete', review_overdue: true }, NOW)).toBeNull();
    expect(reviewState({ status: 'approved', next_review_at: null }, NOW)).toBeNull();
    expect(reviewState({ status: 'approved', next_review_at: 'not a date' }, NOW)).toBeNull();
  });
});

describe('toDateInput', () => {
  it('keeps the date part of an ISO datetime', () => {
    expect(toDateInput('2027-03-01T00:00:00Z')).toBe('2027-03-01');
    expect(toDateInput(null)).toBe('');
  });
});

const rev = (id: string, label: string) => ({
  id,
  rev: label,
  status: 'approved',
  author_user_id: 'u-1',
  created_at: '2026-10-01T00:00:00Z',
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

describe('defaultVersionView', () => {
  it('opens the draft for drafters while one is pending', () => {
    expect(defaultVersionView(doc({ status: 'in_review', draft_revision: rev('r-b', 'B') }))).toBe(
      'draft',
    );
  });

  it('opens the approved revision when there is no separate draft', () => {
    expect(defaultVersionView(doc())).toBe('approved');
    expect(defaultVersionView(doc({ draft_revision: rev('r-a', 'A') }))).toBe('approved');
  });
});

describe('withAcknowledgement', () => {
  it('uses the server document when it carries the acknowledgement', () => {
    const server = doc({ acknowledgement: { required: true, acknowledged_at: 'x' } });
    expect(withAcknowledgement(doc(), server)).toBe(server);
  });

  it('marks the current document acknowledged when the response is thin', () => {
    const result = withAcknowledgement(doc(), null, NOW);
    expect(result.acknowledgement).toEqual({
      required: true,
      acknowledged_at: NOW.toISOString(),
    });
  });
});

describe('controlChanges', () => {
  const base = doc({
    review_interval_months: 12,
    next_review_at: '2027-01-31',
    acknowledgement: { required: false, acknowledged_at: null },
  });

  it('sends only what changed', () => {
    expect(controlChanges(base, { interval: '12', next: '2027-01-31', ack: true })).toEqual({
      acknowledgement_required: true,
    });
  });

  it('omits an untouched empty date so the backend can schedule it from the interval', () => {
    const unscheduled = doc({ review_interval_months: null, next_review_at: null });
    expect(controlChanges(unscheduled, { interval: '6', next: '', ack: false })).toEqual({
      review_interval_months: 6,
    });
  });

  it('clears the interval and the date explicitly', () => {
    expect(controlChanges(base, { interval: '', next: '', ack: false })).toEqual({
      review_interval_months: null,
      next_review_at: null,
    });
  });
});

describe('reviewState calendar dates', () => {
  // 00:30 local time: a UTC-based comparison could land on the previous day.
  const earlyMorning = new Date(2026, 9, 20, 0, 30);

  it('is not overdue on the review date itself', () => {
    expect(reviewState({ status: 'approved', next_review_at: '2026-10-20' }, earlyMorning)).toBe(
      'due',
    );
  });

  it('is overdue only from the day after', () => {
    expect(reviewState({ status: 'approved', next_review_at: '2026-10-19' }, earlyMorning)).toBe(
      'overdue',
    );
  });

  it('defers to an explicit backend flag', () => {
    expect(
      reviewState(
        { status: 'approved', next_review_at: '2026-10-19', review_overdue: false },
        earlyMorning,
      ),
    ).toBe('due');
  });
});

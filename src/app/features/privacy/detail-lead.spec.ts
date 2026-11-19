import { PrivacyGap, PrivacyRecord } from './data/privacy.models';
import { LEAD_FIELDS, SentenceContext, privacyMissing, statusSentence } from './detail-lead';

const ctx: SentenceContext = {
  day: (iso) => (iso ? iso.slice(0, 10) : ''),
  moment: (iso) => iso ?? '',
  userName: (id) => id ?? 'someone',
  country: (code) => code ?? '',
  status: (s) => s,
};

function rec(extra: Record<string, unknown>): PrivacyRecord {
  return {
    id: 'r-1',
    org_id: 'o-1',
    code: 'ROPA-0001',
    title: 'T',
    description: null,
    status: 'draft',
    owner_user_id: 'u-1',
    created_by: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    url: '/privacy/ropa/r-1',
    ...extra,
  } as PrivacyRecord;
}

describe('privacy detail lead', () => {
  it('keeps the lead to 2-4 fields per register', () => {
    for (const fields of Object.values(LEAD_FIELDS)) {
      expect(fields.length).toBeGreaterThanOrEqual(2);
      expect(fields.length).toBeLessThanOrEqual(4);
    }
  });

  it('says how complete a draft processing activity is', () => {
    const s = statusSentence(
      'ropa',
      rec({ completeness: { filled: 5, total: 7, missing: ['retention_period'] } }),
      ctx,
    );
    expect(s).toEqual({
      key: 'privacy.lead.status.ropa.draft',
      params: { filled: 5, total: 7 },
      tone: 'warn',
    });
  });

  it('marks an overdue request as failed and a closed breach as done', () => {
    const dsr = statusSentence(
      'dsr',
      rec({ status: 'in_progress', is_overdue: true, effective_due_at: '2026-11-01T00:00:00' }),
      ctx,
    );
    expect(dsr?.key).toBe('privacy.lead.status.dsr.overdue');
    expect(dsr?.tone).toBe('fail');
    const breach = statusSentence('breach', rec({ status: 'closed', closed_at: null }), ctx);
    expect(breach?.tone).toBe('pass');
  });

  it('lists gaps as links and names the record itself', () => {
    const gap = {
      key: 'g-1',
      kind: 'lia_missing',
      severity: 'high',
      article: 'gdpr:6',
      entity_type: 'ropa_entry',
      entity_id: 'r-1',
      code: 'ROPA-0001',
      title: 'T',
      url: '/privacy/ropa/r-1',
      params: {},
      fix: {
        action: 'create',
        entity_type: 'legal_basis_assessment',
        url: '/privacy/legal-basis/new?ropa_entry_id=r-1',
        prefill: {},
      },
    } as PrivacyGap;
    const items = privacyMissing({
      register: 'ropa',
      record: rec({ owner_user_id: null }),
      gaps: [gap],
      gapParams: (g) => ({ code: g.code }),
      thisRecord: 'This record',
      fieldList: (keys) => keys.join(', '),
      editLink: ['/privacy', 'ropa', 'r-1', 'edit'],
      closed: false,
      reviewOverdue: true,
      reviewDue: '2026-01-01',
    });
    expect(items.map((i) => i.key)).toEqual(['gap:g-1', 'review', 'owner']);
    expect(items[0].link).toBe('/privacy/legal-basis/new');
    expect(items[0].queryParams).toEqual({ ropa_entry_id: 'r-1' });
    expect(items[0].params).toEqual({ code: 'This record' });
  });
});

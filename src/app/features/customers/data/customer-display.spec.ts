import { HttpErrorResponse } from '@angular/common/http';
import { normaliseOrgNumber } from '../../../shared/customers/also-customer';
import { customerStatusBadge } from '../../../shared/customers/customer.models';
import { customerMissing } from '../customer-detail';
import { draftFrom, fieldsFrom } from '../customer-form-page';
import { sectionViews, splitUrl, trendPoints } from '../detail/customer-sections';
import { sameTextIds } from '../matches/customer-matches';
import {
  customerErrorKey,
  fillFromLookup,
  formatOrgNumber,
  norwegianOrgNumber,
  orgNumberChecksumOk,
  registryWarnings,
  statusSentence,
  takenBy,
} from './customer-display';
import {
  CustomerDetail,
  CustomerOverview,
  MatchGroup,
  MatchOut,
  RegistryLookup,
} from './customer.models';

const TODAY = new Date(2026, 10, 19);

const overview = (over: Partial<CustomerOverview> = {}): CustomerOverview => ({
  customer: { id: 'c1', code: 'CUS-0001', name: 'Fjord', status: 'active', deleted: false },
  facts: {},
  sections: [],
  pending_matches: 0,
  ...over,
});

describe('org. numbers', () => {
  it('normalises Norwegian numbers and checks mod-11 as a warning only', () => {
    expect(norwegianOrgNumber('NO 923 609 016 MVA')).toBe('923609016');
    expect(norwegianOrgNumber('12345')).toBeNull();
    expect(orgNumberChecksumOk('923609016')).toBe(true);
    // Demo numbers deliberately fail mod-11 (D4).
    expect(orgNumberChecksumOk('999000001')).toBe(false);
    expect(formatOrgNumber('923609016')).toBe('923 609 016');
    expect(normaliseOrgNumber('NO 912 345 678 MVA')).toBe('912345678');
    expect(normaliseOrgNumber(' gb123 ')).toBe('GB123');
    expect(normaliseOrgNumber('')).toBeNull();
  });
});

describe('statusSentence', () => {
  it('lists open claims and a close renewal as to-dos (warn)', () => {
    const s = statusSentence(
      'active',
      { open_claims: 2, next_renewal: { date: '2027-01-03', days: 45, contract_id: 'k1' } },
      TODAY,
    );
    expect(s.tone).toBe('warn');
    expect(s.leadKey).toBe('customers.sentence.status.active');
    expect(s.parts.map((p) => p.key)).toEqual([
      'customers.sentence.claims',
      'customers.sentence.renewal',
    ]);
    expect(s.parts[1].params).toEqual({ count: 45 });
  });

  it('prefers the notice date within 60 days, uses …One for one, and keeps three parts', () => {
    const s = statusSentence(
      'active',
      {
        open_claims: 1,
        open_breaches: 1,
        next_renewal: { date: '2027-03-01', days: 102, contract_id: 'k', notice_by: '2026-12-01' },
        open_requirements: 3,
      },
      TODAY,
    );
    expect(s.parts.map((p) => p.key)).toEqual([
      'customers.sentence.claimsOne',
      'customers.sentence.breachesOne',
      'customers.sentence.noticeBy',
    ]);
  });

  it('is pass for an active customer with nothing open and neutral for a prospect', () => {
    expect(statusSentence('active', {}, TODAY)).toMatchObject({
      tone: 'pass',
      restKey: 'customers.sentence.rest.active',
    });
    expect(statusSentence('prospect', null, TODAY).tone).toBe('neutral');
    expect(
      statusSentence('active', { next_renewal: { date: 'x', days: 400, contract_id: 'k' } }, TODAY)
        .parts,
    ).toEqual([]);
  });

  it('mentions falling satisfaction', () => {
    const s = statusSentence(
      'active',
      {
        satisfaction: {
          score: 70,
          trend: 'down',
          points: [],
          complaints_12m: 0,
          compliments_12m: 0,
        },
      },
      TODAY,
    );
    expect(s.parts.map((p) => p.key)).toEqual(['customers.sentence.satisfactionDown']);
  });
});

describe('lookup and form', () => {
  const lookup: RegistryLookup = {
    org_number: '923609016',
    name: 'EQUINOR ASA',
    legal_name: 'EQUINOR ASA',
    org_form: 'ASA',
    address_line: 'Forusbeen 50',
    postal_code: '4035',
    city: 'STAVANGER',
    country: 'NO',
    industry_code: '06.100',
    industry_label: 'Utvinning av råolje',
    website: null,
    registry: { bankrupt: false, checked_at: '2026-11-19T10:00:00Z' },
    existing_customer: null,
    also_supplier: null,
  };

  it('fills only empty fields and never overwrites what the user typed', () => {
    const draft = { ...draftFrom(null), name: 'Equinor', city: '' };
    const { draft: next, filled } = fillFromLookup(draft, lookup);
    expect(next.name).toBe('Equinor');
    expect(next.city).toBe('STAVANGER');
    expect(next.address_line).toBe('Forusbeen 50');
    expect(filled).not.toContain('name');
    expect(filled).toContain('legal_name');
    // country already 'NO' in a new draft: not counted as filled
    expect(filled).not.toContain('country');
  });

  it('sends blanks as null, the org. number as digits and the registry snapshot', () => {
    const body = fieldsFrom(
      { ...draftFrom(null), name: ' Fjord AS ', org_number: '923 609 016' },
      lookup.registry,
    );
    expect(body.name).toBe('Fjord AS');
    expect(body.org_number).toBe('923609016');
    expect(body.legal_name).toBeNull();
    expect(body.registry).toEqual(lookup.registry);
    expect(fieldsFrom(draftFrom(null), null)).not.toHaveProperty('registry');
  });

  it('reads the existing customer of a 409 and maps coded errors', () => {
    const err = new HttpErrorResponse({
      status: 409,
      error: {
        detail: {
          code: 'customer_org_number_taken',
          customer: { id: 'c9', code: 'CUS-0009', name: 'Fjord AS', status: 'active' },
        },
      },
    });
    expect(takenBy(err)?.name).toBe('Fjord AS');
    expect(customerErrorKey(err)).toBe('customers.errors.customer_org_number_taken');
    expect(customerErrorKey(new HttpErrorResponse({ status: 403 }))).toBe(
      'customers.errors.forbidden',
    );
    expect(takenBy(new HttpErrorResponse({ status: 422 }))).toBeNull();
  });

  it('warns about bankrupt and deleted companies', () => {
    expect(registryWarnings({ bankrupt: true, deleted_on: '2025-01-01' })).toEqual([
      'customers.registry.bankrupt',
      'customers.registry.deleted',
    ]);
    expect(registryWarnings(null)).toEqual([]);
  });
});

describe('card helpers', () => {
  it('orders sections, hides empty ones without a runnable flow, and keeps unknown keys last', () => {
    const views = sectionViews(
      overview({
        sections: [
          {
            key: 'zzz',
            module: 'x',
            total: 1,
            open: 0,
            items: [item('a')],
            list_url: null,
            flow_key: null,
          },
          {
            key: 'projects',
            module: 'projects',
            total: 0,
            open: 0,
            items: [],
            list_url: null,
            flow_key: 'customer.to_project',
          },
          {
            key: 'claims',
            module: 'deviations',
            total: 7,
            open: 2,
            items: [1, 2, 3, 4, 5, 6].map((n) => item(`d${n}`)),
            list_url: '/deviations?customer_id=c1',
            flow_key: 'customer.to_claim',
          },
          {
            key: 'documents',
            module: 'documents',
            total: 0,
            open: 0,
            items: [],
            list_url: null,
            flow_key: 'customer.to_document',
          },
        ],
      }),
      new Set(['customer.to_claim', 'customer.to_project']),
    );
    expect(views.map((v) => v.key)).toEqual(['claims', 'projects', 'zzz']);
    expect(views[0].items.length).toBe(5);
    expect(views[0].flowKey).toBe('customer.to_claim');
    expect(splitUrl('/deviations?customer_id=c1')).toEqual({
      path: '/deviations',
      query: { customer_id: 'c1' },
    });
  });

  it('draws a trend only with two or more answered quarters', () => {
    const sat = (scores: (number | null)[]) => ({
      score: 80,
      trend: 'up' as const,
      points: scores.map((score, i) => ({
        period: `2026-Q${i + 1}`,
        score,
        n: score === null ? 0 : 3,
      })),
      complaints_12m: 0,
      compliments_12m: 0,
    });
    expect(trendPoints(sat([80]))).toBeNull();
    expect(trendPoints(sat([50, null, 100]), 100, 20)).toBe('0,10 100,0');
  });

  it('lists the follow-up to-dos of a customer', () => {
    const c = {
      id: 'c1',
      can_edit: true,
      owner: null,
      contacts: [],
      org_number: null,
      country: 'NO',
    } as unknown as CustomerDetail;
    const add = vi.fn();
    const items = customerMissing(
      c,
      overview({
        pending_matches: 2,
        facts: {
          next_renewal: {
            date: '2027-01-03',
            days: 45,
            contract_id: 'k1',
            code: 'CT-0003',
            notice_by: '2026-12-04',
          },
        },
      }),
      ['/customers', 'c1', 'edit'],
      add,
      true,
      TODAY,
    );
    expect(items.map((i) => i.key)).toEqual(['notice', 'matches', 'owner', 'contact', 'orgnr']);
    expect(items[0].link).toEqual(['/contracts', 'k1']);
    items[3].action?.();
    expect(add).toHaveBeenCalled();
    expect(
      customerMissing({ ...c, can_edit: false }, null, [], add, false, TODAY).map((i) => i.key),
    ).toEqual([]);
  });

  it('finds matches with the same text across groups', () => {
    const m = (id: string, text: string) => ({ id, source_text: text }) as MatchOut;
    const groups = [
      { proposed: null, proposed_name: 'Fjord', items: [m('1', 'Fjord A/S'), m('2', 'Other')] },
      { proposed: null, proposed_name: 'X', items: [m('3', ' fjord  a/s ')] },
    ] as MatchGroup[];
    expect(sameTextIds(groups, groups[0].items[0])).toEqual(['1', '3']);
  });

  it('maps customer statuses to badge tones', () => {
    expect(customerStatusBadge('prospect').value).toBe('new');
    expect(customerStatusBadge('former').labelKey).toBe('customers.status.former');
    expect(customerStatusBadge('weird').labelKey).toBe('customers.status.active');
  });
});

function item(id: string) {
  return {
    entity_type: 'deviation',
    entity_id: id,
    title: id,
    code: id,
    url: null,
    status: null,
    module: null,
    label_key: null,
  };
}

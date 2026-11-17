import { HttpErrorResponse } from '@angular/common/http';
import { makeContract } from '../contracts.testing';
import { extractionChanges, isReadableFile } from '../contract-ai-panel';
import { actionInputs, proposedRenewalEnd, reviewState } from '../contract-workflow-bar';
import { signingSteps } from '../contract-detail';
import { deadlineTaskParams } from '../contract-deadlines';
import { reviewMonths } from '../contract-settings';
import { matchPeople } from '../contract-person-picker';
import { partyUpdate } from '../contract-parties';
import { copyMissing } from '../contract-versions';
import { statusesForFilter, warningsForFilter } from '../contracts-list';
import { contractListParams } from './contracts-api';
import {
  actionVariant,
  addMonthsIso,
  contractStatusKey,
  daysUntil,
  deadlineKindKey,
  dpaComplianceValue,
  isClosedContract,
  personalDataRoleKey,
  reviewItemKey,
  warningKey,
} from './contract-display';
import { contractErrorKey } from './contract-errors';
import {
  applyExtraction,
  emptyContractForm,
  emptyParty,
  displayAmount,
  formFromContract,
  formFromPrefill,
  normaliseAmount,
  roleOf,
  toCreateRequest,
  toUpdateRequest,
  validateContractForm,
} from './contract-form-model';
import { obligationFromExtraction } from './obligations';

describe('contract form model', () => {
  it('builds a create request with nulls for empty fields and only named parties', () => {
    const body = toCreateRequest({
      ...emptyContractForm(),
      title: '  Hosting ',
      contract_type: 'supplier',
      value_amount: '1 200,50',
      currency: 'nok',
      notice_period_days: '90',
      parties: [emptyParty({ name: 'Acme', is_internal: true }), emptyParty()],
    });
    expect(body.title).toBe('Hosting');
    expect(body.value_amount).toBe('1200.50');
    expect(body.currency).toBe('NOK');
    expect(body.notice_period_days).toBe(90);
    expect(body.end_date).toBeNull();
    expect(body.owner_user_id).toBeUndefined();
    // No role chosen: the server derives it from the contract type.
    expect(body.parties).toEqual([
      {
        name: 'Acme',
        is_internal: true,
        org_number: null,
        contact_name: null,
        contact_email: null,
      },
    ]);
  });

  it('sends only the changed fields on update, with the change reason', () => {
    const original = formFromContract(makeContract());
    const body = toUpdateRequest(original, { ...original, end_date: '2027-12-31' }, ' Extended ');
    expect(body).toEqual({ end_date: '2027-12-31', change_reason: 'Extended' });
    expect(toUpdateRequest(original, original, '')).toEqual({});
  });

  it('validates title, dates, amount, currency and whole numbers', () => {
    const errors = validateContractForm({
      ...emptyContractForm(),
      start_date: '2026-05-01',
      end_date: '2026-01-01',
      value_amount: 'abc',
      currency: 'NO',
      notice_period_days: '1.5',
    });
    expect(Object.keys(errors).sort()).toEqual(
      ['currency', 'end_date', 'notice_period_days', 'title', 'value_amount'].sort(),
    );
    expect(normaliseAmount('10,5')).toBe('10.5');
    expect(normaliseAmount('10.555')).toBeNull();
  });

  it('reads amounts the way people type them, in either language', () => {
    expect(normaliseAmount('850 000')).toBe('850000');
    expect(normaliseAmount('850\u00a0000,50')).toBe('850000.50');
    expect(normaliseAmount('850,000.50')).toBe('850000.50');
    expect(normaliseAmount('850.000,50')).toBe('850000.50');
    expect(normaliseAmount('850,000')).toBe('850000');
    expect(normaliseAmount('1.250.000')).toBe('1250000');
    expect(displayAmount('850000.00', 'en-GB')).toBe('850,000');
    expect(displayAmount('850000.5', 'en-GB')).toBe('850,000.50');
    expect(displayAmount('abc', 'en-GB')).toBe('abc');
  });

  it('sends the GDPR role (and keeps the legacy flag in step) and only a renewal term that applies', () => {
    const body = toCreateRequest({
      ...emptyContractForm(),
      title: 'Payroll',
      personal_data_role: 'we_process',
      transfer_basis: 'scc',
      transfer_countries: ' USA ',
      renewal_term_months: '12',
      auto_renew: false,
    });
    expect(body.personal_data_role).toBe('we_process');
    expect(body.processes_personal_data).toBe(true);
    expect(body.transfer_basis).toBe('scc');
    expect(body.transfer_countries).toBe('USA');
    expect(body.renewal_term_months).toBeNull();
    const none = toCreateRequest({ ...emptyContractForm(), title: 'NDA', transfer_basis: 'scc' });
    expect(none.processes_personal_data).toBe(false);
    expect(none.transfer_basis).toBeNull();
    expect(roleOf({ processes_personal_data: true })).toBe('they_process');
    expect(roleOf({ personal_data_role: 'joint_controllers', processes_personal_data: true })).toBe(
      'joint_controllers',
    );
  });

  it('links parties picked from the supplier register', () => {
    const body = toCreateRequest({
      ...emptyContractForm(),
      title: 'Hosting',
      supplier_id: 'sup-1',
      parties: [
        emptyParty({ name: 'Nordic Cloud AS', role: 'supplier', supplier_id: 'sup-1' }),
        emptyParty({ name: 'Us', is_internal: true, supplier_id: 'sup-9' }),
      ],
    });
    expect(body.supplier_id).toBe('sup-1');
    expect(body.parties?.[0]).toMatchObject({ role: 'supplier', supplier_id: 'sup-1' });
    // Our own organisation is never linked to a supplier.
    expect(body.parties?.[1].supplier_id).toBeUndefined();
  });

  it('unlinks a party from its supplier on edit', () => {
    const party = { ...makeContract().parties[1], supplier_id: 'sup-1' };
    const body = partyUpdate(party, {
      ...emptyParty({ name: 'Cloudy AS' }),
      role: '',
      supplier_id: null,
    });
    expect(body.supplier_id).toBeNull();
    expect(body.role).toBe('processor');
  });

  it('seeds the new-contract form from a create-from-here prefill', () => {
    const fromSupplier = formFromPrefill(emptyContractForm(), {
      title: 'Nordic Cloud AS',
      contract_type: 'supplier',
      supplier_id: 'sup-1',
      parties: [{ name: 'Nordic Cloud AS', role: 'supplier', is_internal: false }],
      unknown: 'ignored',
    });
    expect(fromSupplier.contract_type).toBe('supplier');
    expect(fromSupplier.supplier_id).toBe('sup-1');
    expect(fromSupplier.parties[0]).toMatchObject({ name: 'Nordic Cloud AS', role: 'supplier' });
    const toDpa = formFromPrefill(emptyContractForm(), {
      title: 'DPA: Hosting',
      contract_type: 'dpa',
      personal_data_role: 'they_process',
      transfer_basis: 'adequacy',
      start_date: '2026-01-01',
      parties: [{ name: 'Cloudy AS', role: 'processor', supplier_id: 'sup-2' }, 'junk'],
    });
    expect(toDpa.personal_data_role).toBe('they_process');
    expect(toDpa.transfer_basis).toBe('adequacy');
    expect(toDpa.start_date).toBe('2026-01-01');
    expect(toDpa.parties).toHaveLength(1);
    expect(toDpa.parties[0].supplier_id).toBe('sup-2');
  });

  it('applies an extraction without overwriting what the user typed', () => {
    const next = applyExtraction(
      { ...emptyContractForm(), title: 'My title', parties: [emptyParty({ name: 'Acme' })] },
      {
        title: 'Extracted title',
        contract_type: 'dpa',
        start_date: '2026-01-01',
        end_date: 'soon',
        notice_period_days: 30,
        currency: 'eur',
        auto_renew: true,
        parties: [
          { name: 'acme', role: 'controller' },
          { name: 'Cloudy AS', role: 'processor', org_number: '123' },
        ],
      },
    );
    expect(next.title).toBe('My title');
    expect(next.contract_type).toBe('customer');
    expect(next.start_date).toBe('2026-01-01');
    expect(next.end_date).toBe('');
    expect(next.notice_period_days).toBe('30');
    expect(next.currency).toBe('EUR');
    expect(next.auto_renew).toBe(true);
    expect(next.parties.map((p) => p.name)).toEqual(['Acme', 'Cloudy AS']);
    expect(next.parties[1].role).toBe('processor');
  });
});

describe('contract display helpers', () => {
  it('maps statuses, kinds and DPA states to keys and tone-map values', () => {
    expect(contractStatusKey('in_review')).toBe('contracts.status.in_review');
    expect(contractStatusKey('weird')).toBe('contracts.status.unknown');
    expect(deadlineKindKey('notice_deadline')).toBe('contracts.deadlineKinds.notice_deadline');
    // The two review kinds are one.
    expect(deadlineKindKey('review_date')).toBe('contracts.deadlineKinds.review');
    expect(deadlineKindKey('custom')).toBe('contracts.deadlineKinds.other');
    expect(dpaComplianceValue('missing')).toBe('gap');
    expect(dpaComplianceValue('incomplete')).toBe('partial');
    expect(dpaComplianceValue('covered')).toBe('covered');
    expect(dpaComplianceValue('not_required')).toBe('not_applicable');
    expect(warningKey('dpa_missing')).toBe('contracts.warnings.dpa_missing.label');
    expect(warningKey('nope')).toBe('contracts.warnings.other');
    expect(personalDataRoleKey('we_process')).toBe('contracts.personalDataRoles.we_process.label');
    expect(reviewItemKey('security_clauses')).toBe('contracts.reviewItems.security_clauses');
    expect(reviewItemKey('x')).toBe('contracts.reviewItems.unknown');
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(isClosedContract('terminated')).toBe(true);
    expect(isClosedContract('active')).toBe(false);
    expect(actionVariant('terminate')).toBe('danger');
  });

  it('counts days to a date', () => {
    const today = new Date(2026, 10, 12);
    expect(daysUntil('2026-11-15', today)).toBe(3);
    expect(daysUntil('2026-11-10', today)).toBe(-2);
    expect(daysUntil(null, today)).toBeNull();
  });

  it('maps coded errors to scoped keys', () => {
    const coded = new HttpErrorResponse({
      status: 409,
      error: { detail: { code: 'contract_closed', message: 'Closed' } },
    });
    expect(contractErrorKey(coded)).toBe('contracts.errors.contract_closed');
    expect(contractErrorKey(new HttpErrorResponse({ status: 403 }))).toBe(
      'contracts.errors.forbidden',
    );
    expect(contractErrorKey(new HttpErrorResponse({ status: 500 }))).toBe('errors.server');
  });
});

describe('contract list and workflow helpers', () => {
  it('builds csv query params and drops empty values', () => {
    expect(
      contractListParams({
        q: ' cloud ',
        status: ['draft', 'active'],
        type: [],
        owner: 'me',
        sort: 'end_date',
        limit: 25,
        offset: 0,
      }),
    ).toEqual({
      q: 'cloud',
      status: 'draft,active',
      type: undefined,
      owner: 'me',
      expiring_within_days: undefined,
      processes_personal_data: undefined,
      personal_data_role: undefined,
      supplier_id: undefined,
      warning: undefined,
      dpa_missing: undefined,
      sort: 'end_date',
      limit: 25,
      offset: 0,
    });
    expect(statusesForFilter('open')).toEqual(['draft', 'in_review', 'approved', 'active']);
    expect(statusesForFilter('all')).toEqual([]);
    expect(statusesForFilter('expired')).toEqual(['expired']);
    expect(
      contractListParams({
        warning: ['dpa_missing', 'review_overdue'],
        personal_data_role: ['we_process'],
      }),
    ).toMatchObject({ warning: 'dpa_missing,review_overdue', personal_data_role: 'we_process' });
    expect(warningsForFilter('dpa_missing')).toEqual(['dpa_missing']);
    expect(warningsForFilter('any').length).toBe(8);
    expect(warningsForFilter('')).toEqual([]);
  });

  it('accepts an approval only with every question answered and no "no"', () => {
    const items = ['requirements_defined', 'terms_acceptable'];
    expect(reviewState(items, {})).toEqual({ complete: false, declined: false });
    expect(reviewState(items, { requirements_defined: 'yes', terms_acceptable: 'na' })).toEqual({
      complete: true,
      declined: false,
    });
    expect(reviewState(items, { requirements_defined: 'no', terms_acceptable: 'yes' })).toEqual({
      complete: true,
      declined: true,
    });
  });

  it('guides an approved contract through signing and flags signed versions without a copy', () => {
    const version = {
      id: 'v1',
      version_no: 1,
      change_summary: 'First',
      effective_date: null,
      signed: true,
      attachment_id: null,
      created_by: null,
      created_at: '2026-01-01T00:00:00',
    };
    expect(copyMissing(version)).toBe(true);
    expect(copyMissing({ ...version, attachment_id: 'a1' })).toBe(false);
    expect(copyMissing({ ...version, copy_missing: false })).toBe(false);
    const steps = signingSteps(
      makeContract({ status: 'approved', versions: [version], allowed_actions: ['activate'] }),
    );
    expect(steps).toEqual({ copy: false, signed: true, canActivate: true });
  });

  it('builds the follow-up task of a deadline and validates the review interval', () => {
    expect(
      deadlineTaskParams(
        {
          contract_id: 'c-1',
          code: 'CT-0001',
          title: 'Hosting',
          contract_type: 'supplier',
          status: 'active',
          kind: 'notice_deadline',
          label: null,
          due_date: '2026-12-17',
          overdue: false,
          key_date_id: null,
          url: '/contracts/c-1',
        },
        'Notice deadline',
      ),
    ).toEqual({
      entity_type: 'contract',
      entity_id: 'c-1',
      title: 'Notice deadline: CT-0001 Hosting',
      due: '2026-12-17',
    });
    expect(reviewMonths('12')).toBe(12);
    expect(reviewMonths('0')).toBeNull();
    expect(reviewMonths('61')).toBeNull();
    expect(reviewMonths('1.5')).toBeNull();
  });

  it('finds people by name or email, ignoring case and accents', () => {
    const people = [
      { id: '1', name: 'Kari Nordmann', email: 'kari@demo.no' },
      { id: '2', name: 'Super', email: 'super.one@demo.no' },
      { id: '3', name: 'Super', email: 'super.two@demo.no' },
      { id: '4', name: 'Bjørn Ås', email: 'bjorn@demo.no' },
    ];
    expect(matchPeople(people, 'two').map((p) => p.id)).toEqual(['3']);
    expect(matchPeople(people, 'KARI').map((p) => p.id)).toEqual(['1']);
    expect(matchPeople(people, 'as').map((p) => p.id)).toContain('4');
    expect(matchPeople(people, '')).toHaveLength(4);
  });

  it('knows which inputs each action needs', () => {
    expect(actionInputs('reject')).toEqual({ note: 'required', date: null });
    expect(actionInputs('terminate')).toEqual({ note: 'required', date: 'effective' });
    expect(actionInputs('renew')).toEqual({ note: 'optional', date: 'newEnd' });
    expect(actionInputs('approve')).toEqual({ note: 'required', date: null });
    expect(actionInputs('review')).toEqual({ note: 'optional', date: 'nextReview' });
  });

  it('proposes the renewed end date from the renewal term', () => {
    expect(
      proposedRenewalEnd(makeContract({ end_date: '2026-12-31', renewal_term_months: 12 })),
    ).toBe('2027-12-31');
    expect(
      proposedRenewalEnd(makeContract({ end_date: '2026-01-31', renewal_term_months: 1 })),
    ).toBe('2026-02-28');
    expect(proposedRenewalEnd(makeContract({ renewal_term_months: null }))).toBe('');
  });
});

describe('contract AI helpers', () => {
  it('turns an extraction into changes for empty fields and new parties only', () => {
    const contract = makeContract({ governing_law: null, review_date: null, auto_renew: true });
    const { update, parties } = extractionChanges(contract, {
      title: 'Other title',
      governing_law: 'Sweden',
      end_date: '2030-01-01',
      auto_renew: false,
      parties: [{ name: 'Cloudy AS' }, { name: 'New Sub AS', role: 'sub_processor' }],
    });
    expect(update).toEqual({ governing_law: 'Sweden' });
    expect(parties).toEqual([
      { name: 'New Sub AS', role: 'sub_processor', is_internal: false, org_number: null },
    ]);
  });

  it('recognises files the analysis can read', () => {
    const file = (filename: string, content_type: string) =>
      ({ filename, content_type }) as Parameters<typeof isReadableFile>[0];
    expect(isReadableFile(file('a.pdf', 'application/pdf'))).toBe(true);
    expect(isReadableFile(file('a.txt', 'text/plain'))).toBe(true);
    expect(isReadableFile(file('a.docx', 'application/msword'))).toBe(false);
  });

  it('maps an extracted obligation to an obligation task', () => {
    expect(
      obligationFromExtraction({
        title: 'Quarterly report',
        party: 'Supplier',
        due_date: '2026-03-31',
        recurring: 'quarterly',
      }),
    ).toEqual({
      title: 'Quarterly report',
      description: 'Supplier · quarterly',
      due_at: '2026-03-31T23:59:59',
    });
    expect(obligationFromExtraction({ title: 'X', due_date: 'monthly' }).due_at).toBeNull();
  });
});

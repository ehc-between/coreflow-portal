import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import {
  emptyEmployeeForm,
  toEmployeeUpdate,
  validateEmployeeForm,
} from './data/employee-form-model';
import { PeopleApi } from './data/people-api';
import { addMonthsIso, complianceLook, employeeStatusLook } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { AwarenessDraft, awarenessDraftValid, toAwarenessIn } from './employee-awareness';
import { primaryActionFor } from './employee-detail';
import { summaryTiles } from './employees-list';
import { rowsFrom, toTemplateItems } from './people-settings';
import { makeEmployee } from './people.testing';
import { clauseTitleKey, splitClause } from './ui/clause-label';
import { complianceDetail } from './ui/employee-compliance';
import { gapDraftValid } from './ui/gap-action-dialog';
import { buildOrgTree } from './ui/org-chart';

const BASE = 'http://test/api';
const url = (path: string) => `${BASE}/v1/orgs/org-1/people/${path}`;

describe('People A11 API paths', () => {
  let api: PeopleApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    api = TestBed.inject(PeopleApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the connected views of one person', () => {
    api.compliance('org-1', 'e-1').subscribe();
    api.training('org-1', 'e-1').subscribe();
    api.handover('org-1', 'e-1').subscribe();
    api.competenceRecord('org-1', 'e-1').subscribe();
    for (const path of ['compliance', 'training', 'handover', 'competence-record']) {
      http.expectOne(url(`employees/e-1/${path}`)).flush({});
    }
  });

  it('filters the register by flag', () => {
    api.listEmployees('org-1', { flag: 'screening_missing' }).subscribe();
    const req = http.expectOne((r) => r.url === url('employees'));
    expect(req.request.params.get('flag')).toBe('screening_missing');
    req.flush({ items: [], total: 0 });
  });

  it('creates, evaluates and lists gap actions', () => {
    api
      .createGapAction('org-1', {
        employee_id: 'e-1',
        competence_id: 'c-1',
        kind: 'training',
        course_id: 'k-1',
      })
      .subscribe();
    const create = http.expectOne(url('competence-actions'));
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toMatchObject({ kind: 'training', course_id: 'k-1' });
    create.flush({});

    api.updateGapAction('org-1', 'a-1', { status: 'effective' }).subscribe();
    const patch = http.expectOne(url('competence-actions/a-1'));
    expect(patch.request.method).toBe('PATCH');
    patch.flush({});

    api.gapActions('org-1', { employee_id: 'e-1', status: ['open', 'done'] }).subscribe();
    const list = http.expectOne((r) => r.url === url('competence-actions'));
    expect(list.request.params.get('status')).toBe('open,done');
    list.flush({ items: [], total: 0 });
  });

  it('imports users and reads the suggested account links', () => {
    api.userMatches('org-1').subscribe();
    http.expectOne(url('user-matches')).flush({ suggestions: [], members_without_employee: [] });
    api.importUsers('org-1', { user_ids: ['u-1', 'u-2'], status: 'active' }).subscribe();
    const req = http.expectOne(url('employees/import-users'));
    expect(req.request.body).toEqual({ user_ids: ['u-1', 'u-2'], status: 'active' });
    req.flush({ items: [], total: 0 });
  });

  it('saves and resets the checklist templates per language', () => {
    api.checklistTemplatesFor('org-1', 'nb').subscribe();
    const get = http.expectOne((r) => r.url === url('checklist-templates'));
    expect(get.request.params.get('lang')).toBe('nb');
    get.flush({ onboarding: [], offboarding: [] });

    api
      .saveChecklistTemplate('org-1', 'onboarding', 'en', [
        { text: 'Sign NDA', category: 'confidentiality', required: true },
      ])
      .subscribe();
    const put = http.expectOne((r) => r.url === url('checklist-templates/onboarding'));
    expect(put.request.method).toBe('PUT');
    expect(put.request.params.get('lang')).toBe('en');
    put.flush({ onboarding: [], offboarding: [] });

    api.resetChecklistTemplate('org-1', 'offboarding').subscribe();
    expect(http.expectOne(url('checklist-templates/offboarding')).request.method).toBe('DELETE');
  });

  it('marks a position as reviewed and reads the org chart', () => {
    api.markPositionReviewed('org-1', 'p-1', { next_review_on: '2027-11-01' }).subscribe();
    const req = http.expectOne(url('positions/p-1/reviewed'));
    expect(req.request.method).toBe('POST');
    req.flush({});
    api.orgChart('org-1').subscribe();
    http.expectOne(url('positions/org-chart')).flush({ nodes: [] });
  });

  it('downloads the CSV exports with the same filters', () => {
    api.exportCsv('org-1', 'gaps', { status: 'missing' }).subscribe();
    const req = http.expectOne((r) => r.url === url('gaps/export'));
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('status')).toBe('missing');
    req.flush(new Blob(['a,b']));
  });
});

describe('People A11 helpers', () => {
  it('turns the summary into six filter tiles', () => {
    const tiles = summaryTiles({
      employees_by_status: { onboarding: 1, active: 3, on_leave: 0, offboarding: 1, former: 4 },
      positions: 3,
      competences: 5,
      open_checklists: 2,
      overdue_checklists: 0,
      gaps: 2,
      expiring_soon: 1,
      missing_confidentiality: 0,
      screening_missing: 1,
      no_user_account: 0,
    });
    expect(tiles.map((t) => t.key)).toEqual([
      'current',
      'gaps',
      'expiringSoon',
      'missingConfidentiality',
      'screeningMissing',
      'noUserAccount',
    ]);
    expect(tiles[0]).toMatchObject({ value: 5, flag: null });
    // "Expiring soon" is its own tile and filter (not a sub-line of another tile).
    expect(tiles[2]).toMatchObject({ value: 1, flag: 'expiring_soon', tone: 'warn' });
    expect(tiles[3]).toMatchObject({ value: 0, tone: 'pass' });
  });

  it('U24: flag tiles count people like ?flag=, the gap tile opens the gap list', () => {
    const tiles = summaryTiles({
      employees_by_status: { onboarding: 0, active: 4, on_leave: 0, offboarding: 0, former: 0 },
      positions: 1,
      competences: 3,
      open_checklists: 0,
      overdue_checklists: 0,
      gaps: 8,
      expiring_soon: 5,
      missing_confidentiality: 2,
      employees_by_flag: { expiring_soon: 2, missing_confidentiality: 2 },
    });
    // Eight competence cells: the gap list shows each person/competence pair.
    expect(tiles[1]).toMatchObject({
      key: 'gaps',
      value: 8,
      flag: null,
      link: '/people/matrix',
      queryParams: { view: 'gaps' },
    });
    // Five expiring competences held by two people: the tile shows the two people.
    expect(tiles[2]).toMatchObject({ key: 'expiringSoon', value: 2, flag: 'expiring_soon' });
  });

  it('offers "open checklist" instead of starting a second one', () => {
    expect(primaryActionFor(makeEmployee({ open_onboarding_id: 'cl-1' }))).toEqual({
      kind: 'openChecklist',
      checklist: 'onboarding',
      id: 'cl-1',
    });
    expect(
      primaryActionFor(makeEmployee({ open_onboarding_id: 'cl-1', open_offboarding_id: 'cl-2' })),
    ).toMatchObject({ checklist: 'offboarding', id: 'cl-2' });
    expect(primaryActionFor(makeEmployee({ status: 'onboarding' }))).toEqual({
      kind: 'start',
      checklist: 'onboarding',
    });
    expect(primaryActionFor(makeEmployee())).toEqual({ kind: 'edit' });
    expect(primaryActionFor(makeEmployee({ can_edit: false }))).toBeNull();
  });

  it('describes each control in one line', () => {
    expect(
      complianceDetail({
        key: 'screening',
        clause_refs: ['iso27001:A.6.1'],
        status: 'ok',
        done_on: '2025-01-01',
        recheck_on: '2028-01-01',
      }),
    ).toEqual({
      key: 'people.compliance.detail.okUntil',
      params: { date: '2025-01-01', recheck: '2028-01-01' },
    });
    expect(
      complianceDetail({ key: 'competence', clause_refs: ['hs:7.2'], status: 'missing', gaps: 2 }),
    ).toEqual({ key: 'people.compliance.detail.competenceGaps', params: { count: 2 } });
    expect(
      complianceDetail({
        key: 'equipment_returned',
        clause_refs: ['iso27001:A.5.11'],
        status: 'pending',
        outstanding: 3,
      }).key,
    ).toBe('people.compliance.detail.assetsOutstanding');
    expect(
      complianceDetail({ key: 'confidentiality', clause_refs: [], status: 'missing' }).key,
    ).toBe('people.compliance.detail.missing');
  });

  it('never shows a missing control in red', () => {
    expect(complianceLook('missing')).toEqual({ meaning: 'compliance', value: 'partial' });
    expect(complianceLook('ok')).toEqual({ meaning: 'compliance', value: 'met' });
    expect(employeeStatusLook('former')).toEqual({ meaning: 'lifecycle', value: 'archived' });
  });

  it('reads clause refs in plain words', () => {
    expect(splitClause('iso27001:A.6.6')).toEqual({ framework: 'iso27001', number: 'A.6.6' });
    expect(splitClause('iso27001-2022:A.6.6.r2')).toEqual({
      framework: 'iso27001',
      number: 'A.6.6',
    });
    expect(clauseTitleKey('hs:7.2')).toBe('people.clauses.hs_7_2');
    expect(clauseTitleKey('nis2:21.2.g')).toBe('people.clauses.nis2_21_2_g');
  });

  it('requires the policy document for "policy read"', () => {
    const base: AwarenessDraft = {
      id: null,
      topic: '',
      kind: 'policy',
      completed_on: '2026-11-01',
      document: null,
      notes: '',
    };
    expect(awarenessDraftValid(base)).toBe(false);
    const withDoc = { ...base, document: { id: 'd-1', code: 'POL-1', title: 'Security policy' } };
    expect(awarenessDraftValid(withDoc)).toBe(true);
    expect(toAwarenessIn(withDoc)).toMatchObject({
      topic: null,
      kind: 'policy',
      document_id: 'd-1',
    });
    expect(awarenessDraftValid({ ...base, kind: 'briefing', topic: 'Fire drill' })).toBe(true);
    expect(awarenessDraftValid({ ...base, kind: 'briefing' })).toBe(false);
  });

  it('only sends editable template rows with text', () => {
    const rows = rowsFrom([
      {
        text: 'Sign NDA',
        category: 'confidentiality',
        required: true,
        system_key: null,
        action_key: 'confidentiality_signed',
      },
      { text: 'Access removed', category: 'access', required: true, system_key: 'access_revoked' },
    ]);
    expect(rows[1].system).toBe(true);
    expect(toTemplateItems([...rows, { ...rows[0], key: 99, text: '  ' }])).toEqual([
      {
        text: 'Sign NDA',
        category: 'confidentiality',
        required: true,
        action_key: 'confidentiality_signed',
      },
    ]);
  });

  it('builds the reporting tree from "reports to"', () => {
    const node = (id: string, title: string, reports_to_id: string | null) => ({
      id,
      title,
      code: null,
      risk_level: 'low' as const,
      reports_to_id,
      holders: [],
      url: `/people/positions/${id}`,
    });
    const tree = buildOrgTree([
      node('b', 'Technician', 'a'),
      node('a', 'Manager', null),
      node('c', 'Orphan', 'missing'),
    ]);
    expect(tree.map((t) => t.node.title)).toEqual(['Manager', 'Orphan']);
    expect(tree[0].children.map((t) => t.node.title)).toEqual(['Technician']);
  });

  it('needs a course and a user account to assign training', () => {
    expect(gapDraftValid('training', '', true)).toBe(false);
    expect(gapDraftValid('training', 'k-1', false)).toBe(false);
    expect(gapDraftValid('training', 'k-1', true)).toBe(true);
    expect(gapDraftValid('task', '', false)).toBe(true);
  });

  it('asks for a legal basis for a police certificate and sends scope changes', () => {
    const form = {
      ...emptyEmployeeForm(),
      full_name: 'Ada',
      screening_scope: ['criminal_record' as const],
    };
    expect(validateEmployeeForm(form)['screening_legal_basis']).toBe(
      'people.form.errors.legalBasisRequired',
    );
    expect(
      validateEmployeeForm({
        ...form,
        screening_legal_basis: 'Security Act',
        screening_completed_on: '2026-01-01',
        screening_recheck_on: '2025-01-01',
      })['screening_recheck_on'],
    ).toBe('people.form.errors.recheckAfterCheck');
    const body = toEmployeeUpdate(
      emptyEmployeeForm(),
      { ...emptyEmployeeForm(), screening_scope: ['identity'] },
      '',
    );
    expect(body).toEqual({ screening_scope: ['identity'] });
  });

  it('computes dates and error keys', () => {
    expect(addMonthsIso('2026-11-17', 12)).toBe('2027-11-17');
    expect(addMonthsIso('2026-11-17', 1)).toBe('2026-12-17');
    expect(peopleErrorKey({})).toBe('errors.generic');
  });
});

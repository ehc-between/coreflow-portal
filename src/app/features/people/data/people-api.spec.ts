import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { assigneeFromValue } from '../employee-checklists';
import {
  emptyEmployeeForm,
  formFromEmployee,
  toEmployeeCreate,
  toEmployeeUpdate,
  validateEmployeeForm,
} from './employee-form-model';
import { PeopleApi, employeeListParams, gapParams, matrixParams } from './people-api';
import { cellStatusTone, sortKey, textOrNull, todayIso } from './people-display';
import { peopleErrorExtra, peopleErrorKey } from './people-errors';
import { toRequirementsBody } from '../position-requirements';
import { toCompetenceFields, validityOk } from '../competence-editor';
import { makeEmployee } from '../people.testing';

const BASE = 'http://test/api';
const url = (path: string) => `${BASE}/v1/orgs/org-1/people/${path}`;

describe('PeopleApi', () => {
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

  it('lists employees with csv statuses and drops empty filters', () => {
    api
      .listEmployees('org-1', { q: ' ada ', status: ['active', 'on_leave'], position_id: '' })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('employees'));
    expect(req.request.params.get('q')).toBe('ada');
    expect(req.request.params.get('status')).toBe('active,on_leave');
    expect(req.request.params.has('position_id')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('records an assessment with PUT on the competence path', () => {
    api.assessCompetence('org-1', 'e-1', 'c-1', { level: 3 }).subscribe();
    const req = http.expectOne(url('employees/e-1/competences/c-1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ level: 3 });
    req.flush({ employee_id: 'e-1', position_id: null, items: [], gap_count: 0 });
  });

  it('replaces position requirements as a whole', () => {
    api
      .replaceRequirements('org-1', 'p-1', [
        { competence_id: 'c-1', required_level: 2, mandatory: true },
      ])
      .subscribe();
    const req = http.expectOne(url('positions/p-1/requirements'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.requirements).toHaveLength(1);
    expect(req.request.body.change_reason).toBeUndefined();
    req.flush({});
  });

  it('starts, completes and cancels checklists on their own paths', () => {
    api.startChecklist('org-1', 'e-1', { kind: 'onboarding' }).subscribe();
    expect(http.expectOne(url('employees/e-1/checklists')).request.body).toEqual({
      kind: 'onboarding',
    });
    api.completeChecklist('org-1', 'cl-1').subscribe();
    expect(http.expectOne(url('checklists/cl-1/complete')).request.method).toBe('POST');
    api.cancelChecklist('org-1', 'cl-1').subscribe();
    expect(http.expectOne(url('checklists/cl-1/cancel')).request.method).toBe('POST');
  });

  it('uses the restricted disciplinary and awareness paths', () => {
    api.disciplinary('org-1', 'e-1').subscribe();
    http.expectOne(url('employees/e-1/disciplinary')).flush({ items: [], total: 0 });
    api.updateDisciplinary('org-1', 'd-1', { status: 'closed' }).subscribe();
    expect(http.expectOne(url('disciplinary/d-1')).request.method).toBe('PATCH');
    api.deleteAwareness('org-1', 'a-1').subscribe();
    expect(http.expectOne(url('awareness/a-1')).request.method).toBe('DELETE');
  });
});

describe('people query params', () => {
  it('builds matrix and gap params', () => {
    expect(matrixParams({ competence_ids: ['a', 'b'], include_former: false })).toEqual({
      department_id: undefined,
      position_id: undefined,
      competence_ids: 'a,b',
      include_former: undefined,
    });
    expect(gapParams({ status: ['gap', 'expired'], mandatory_only: true })).toMatchObject({
      status: 'gap,expired',
      mandatory_only: true,
    });
    expect(employeeListParams({ sort: '-name' })).toMatchObject({ sort: '-name' });
  });
});

describe('employee form model', () => {
  it('validates name, email and dates', () => {
    const errors = validateEmployeeForm({
      ...emptyEmployeeForm(),
      email: 'nope',
      start_date: '2026-05-01',
      end_date: '2026-04-01',
    });
    expect(Object.keys(errors).sort()).toEqual(['email', 'end_date', 'full_name']);
  });

  it('creates with nulls for blanks and the onboarding flag', () => {
    const body = toEmployeeCreate({ ...emptyEmployeeForm(), full_name: ' Ada ' }, true);
    expect(body.full_name).toBe('Ada');
    expect(body.email).toBeNull();
    expect(body.start_onboarding).toBe(true);
  });

  it('patches only changed fields and the reason', () => {
    const before = formFromEmployee(makeEmployee());
    const body = toEmployeeUpdate(before, { ...before, job_title: 'Lead' }, ' promoted ');
    expect(body).toEqual({ job_title: 'Lead', change_reason: 'promoted' });
    expect(toEmployeeUpdate(before, before, '')).toEqual({});
  });
});

describe('people helpers', () => {
  it('maps errors to scoped keys', () => {
    const coded = new HttpErrorResponse({
      status: 409,
      error: { detail: { code: 'checklist_incomplete', open_required: 2 } },
    });
    expect(peopleErrorKey(coded)).toBe('people.errors.checklist_incomplete');
    expect(peopleErrorExtra(coded, 'open_required')).toBe(2);
    expect(peopleErrorKey(new HttpErrorResponse({ status: 404 }))).toBe('people.errors.notFound');
    expect(peopleErrorKey(new HttpErrorResponse({ status: 403 }))).toBe('people.errors.forbidden');
    expect(peopleErrorKey(new Error('x'))).toBe('errors.generic');
  });

  it('formats values', () => {
    expect(sortKey('-start_date')).toBe('start_dateDesc');
    expect(textOrNull('  ')).toBeNull();
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(cellStatusTone('expired')).toBe('fail');
    expect(cellStatusTone('met')).toBe('pass');
  });

  it('encodes the checklist assignee', () => {
    expect(assigneeFromValue('role:hr_manager')).toEqual({ type: 'role', value: 'hr_manager' });
    expect(assigneeFromValue('')).toBeUndefined();
    expect(assigneeFromValue('team:x')).toBeUndefined();
  });

  it('builds requirement bodies and competence fields', () => {
    expect(
      toRequirementsBody([
        { competence_id: '', competence_name: '', required_level: 2, mandatory: true, note: '' },
        {
          competence_id: 'c-1',
          competence_name: 'X',
          required_level: 3,
          mandatory: false,
          note: ' ',
        },
      ]),
    ).toEqual([{ competence_id: 'c-1', required_level: 3, mandatory: false, note: null }]);
    expect(
      toCompetenceFields({
        name: ' First aid ',
        category: 'certificate',
        description: '',
        validity_months: '24',
        status: 'active',
      }),
    ).toEqual({
      name: 'First aid',
      category: 'certificate',
      description: null,
      validity_months: 24,
    });
    expect(validityOk('')).toBe(true);
    expect(validityOk('0')).toBe(false);
    expect(validityOk('241')).toBe(false);
    expect(validityOk('1.5')).toBe(false);
  });
});

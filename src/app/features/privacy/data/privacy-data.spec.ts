import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { makeBreach, makeDsr, makeRopa } from '../privacy.testing';
import { PrivacyApi, privacyListParams } from './privacy-api';
import { screeningResult } from './privacy.models';
import { fromDateInput, fromDateTimeInput, toDateInput, toDateTimeInput } from './privacy-dates';
import { clockFact, rowFacts } from './privacy-display';
import { privacyError } from './privacy-errors';
import {
  createBody,
  emptyValues,
  mergeRopaDraft,
  updateBody,
  validate,
  valuesFromRecord,
} from './privacy-form-model';
import { REGISTERS, REGISTER_LIST, isRegisterKey, registerByEntityType } from './privacy-registers';

const BASE = 'http://test/api';
const url = (path: string) => `${BASE}/v1/orgs/org-1/privacy/${path}`;

describe('privacy registers', () => {
  it('matches the backend segments, entity types and code prefixes', () => {
    expect(REGISTER_LIST.map((r) => [r.segment, r.entityType, r.codePrefix])).toEqual([
      ['ropa', 'ropa_entry', 'ROPA'],
      ['dpias', 'dpia', 'DPIA'],
      ['data-subject-requests', 'data_subject_request', 'DSR'],
      ['breaches', 'data_breach', 'BR'],
      ['processors', 'processor', 'PRC'],
      ['transfers', 'transfer_assessment', 'TIA'],
      ['retention-schedules', 'retention_schedule', 'RET'],
      ['consents', 'consent_record', 'CON'],
      ['legal-basis-assessments', 'legal_basis_assessment', 'LBA'],
    ]);
  });

  it('guards personal-data registers with privacy:requests and keeps no revisions for them', () => {
    for (const r of REGISTER_LIST) {
      const personal = r.key === 'dsr' || r.key === 'consent';
      expect(r.readPermission, r.key).toBe(personal ? 'privacy:requests' : 'privacy:read');
      expect(r.writePermission, r.key).toBe(personal ? 'privacy:requests' : 'privacy:write');
      expect(r.revisions, r.key).toBe(!personal);
      expect(r.personal, r.key).toBe(personal);
    }
  });

  it('looks registers up by entity type and key', () => {
    expect(registerByEntityType('data_breach')?.key).toBe('breach');
    expect(registerByEntityType('risk')).toBeNull();
    expect(isRegisterKey('lba')).toBe(true);
    expect(isRegisterKey('risk')).toBe(false);
  });
});

describe('privacyListParams', () => {
  it('joins statuses, drops empty values and adds register filters', () => {
    expect(
      privacyListParams({
        q: '  payroll ',
        status: ['draft', 'active'],
        owner: '',
        sort: 'due',
        limit: 25,
        offset: 0,
        overdue: true,
        extra: { role: 'controller', legal_basis: '' },
      }),
    ).toEqual({
      q: 'payroll',
      status: 'draft,active',
      owner: undefined,
      sort: 'due',
      limit: 25,
      offset: 0,
      overdue: true,
      role: 'controller',
    });
  });
});

describe('PrivacyApi', () => {
  let api: PrivacyApi;
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
    api = TestBed.inject(PrivacyApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('calls the register endpoints by segment', () => {
    api.list('org-1', REGISTERS.dsr, { status: ['received'] }).subscribe();
    const list = http.expectOne((r) => r.url === url('data-subject-requests'));
    expect(list.request.params.get('status')).toBe('received');
    list.flush({ items: [], total: 0 });

    api.get('org-1', REGISTERS.breach, 'b-1').subscribe();
    http.expectOne(url('breaches/b-1')).flush(makeBreach());

    api.create('org-1', REGISTERS.ropa, { title: 'Payroll' }).subscribe();
    const create = http.expectOne(url('ropa'));
    expect(create.request.method).toBe('POST');
    create.flush(makeRopa());

    api.update('org-1', REGISTERS.retention, 'x', { status: 'active' }).subscribe();
    const patch = http.expectOne(url('retention-schedules/x'));
    expect(patch.request.method).toBe('PATCH');
    patch.flush({});

    api.remove('org-1', REGISTERS.consent, 'c').subscribe();
    const del = http.expectOne(url('consents/c'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('calls the actions, overview and screening endpoints', () => {
    api.extendRequest('org-1', 'd-1', 'Complex').subscribe();
    const extend = http.expectOne(url('data-subject-requests/d-1/extend'));
    expect(extend.request.body).toEqual({ reason: 'Complex' });
    extend.flush(makeDsr({ extended: true }));

    api.decide('org-1', REGISTERS.lba, 'l-1', { decision: 'approved' }).subscribe();
    const decide = http.expectOne(url('legal-basis-assessments/l-1/decision'));
    expect(decide.request.body).toEqual({ decision: 'approved' });
    decide.flush({});

    api.overview('org-1').subscribe();
    http.expectOne(url('overview')).flush({});

    api.screen('org-1', { large_scale: true }).subscribe();
    const screen = http.expectOne(url('dpia-screening'));
    expect(screen.request.body).toEqual({ screening: { large_scale: true } });
    screen.flush({ result: 'recommended', met: ['large_scale'], criteria: [] });
  });
});

describe('screeningResult', () => {
  it('applies the two-criteria rule', () => {
    expect(screeningResult({}).result).toBe('not_required');
    expect(screeningResult({ large_scale: true }).result).toBe('recommended');
    expect(screeningResult({ large_scale: true, sensitive_data: true, foo: true }).met).toEqual([
      'sensitive_data',
      'large_scale',
    ]);
  });
});

describe('privacy dates', () => {
  it('converts date inputs to naive UTC midnights and back', () => {
    expect(fromDateInput('2027-01-15')).toBe('2027-01-15T00:00:00');
    expect(fromDateInput('')).toBeNull();
    expect(toDateInput('2027-01-15T00:00:00')).toBe('2027-01-15');
    expect(toDateInput(null)).toBe('');
  });

  it('round-trips date-times through local time', () => {
    const wire = '2026-11-11T08:30:00';
    expect(fromDateTimeInput(toDateTimeInput(wire))).toBe(wire);
    expect(fromDateTimeInput('')).toBeNull();
    expect(toDateTimeInput('nonsense')).toBe('');
  });
});

describe('privacy form model', () => {
  it('builds a create body from visible, filled fields only', () => {
    const values = {
      ...emptyValues(REGISTERS.ropa),
      title: ' Payroll ',
      data_categories: ['Bank account'],
      special_category_condition: 'employment', // hidden: no special categories
      transfer_countries: ['US'], // hidden: no transfers
      review_due_at: '2027-01-15',
    };
    expect(createBody(REGISTERS.ropa, values)).toEqual({
      title: 'Payroll',
      role: 'controller',
      data_categories: ['Bank account'],
      review_due_at: '2027-01-15T00:00:00',
    });
  });

  it('never sends edit-only fields on create and create-only fields on edit', () => {
    const create = createBody(REGISTERS.breach, {
      ...emptyValues(REGISTERS.breach),
      title: 'Lost laptop',
      authority_notification_required: true,
    });
    expect(create).not.toHaveProperty('authority_notification_required');

    const original = valuesFromRecord(REGISTERS.breach, makeBreach());
    const body = updateBody(
      REGISTERS.breach,
      original,
      { ...original, aware_at: '2026-01-01T10:00', authority_notification_required: false },
      'Assessed',
    );
    expect(body).toEqual({ authority_notification_required: false, change_reason: 'Assessed' });
  });

  it('sends only changed fields on update, clearing emptied ones', () => {
    const original = valuesFromRecord(REGISTERS.ropa, makeRopa());
    expect(updateBody(REGISTERS.ropa, original, original, 'no-op')).toEqual({});
    const body = updateBody(
      REGISTERS.ropa,
      original,
      { ...original, retention_period: '', recipients: [], owner_user_id: '' },
      '',
    );
    expect(body).toEqual({ retention_period: null, recipients: [] });
  });

  it('validates required visible fields', () => {
    expect(validate(REGISTERS.dsr, emptyValues(REGISTERS.dsr), 'create')).toEqual({
      request_type: 'privacy.form.required',
      requester_name: 'privacy.form.required',
    });
    expect(
      validate(
        REGISTERS.transfer,
        { ...emptyValues(REGISTERS.transfer), mechanism: 'sccs' },
        'create',
      ),
    ).toEqual({ title: 'privacy.form.required', destination_country: 'privacy.form.required' });
  });

  it('merges an assistant ROPA draft without overwriting a typed title', () => {
    const merged = mergeRopaDraft(
      { ...emptyValues(REGISTERS.ropa), title: 'Mine' },
      {
        title: 'Theirs',
        purposes: 'Deliver orders',
        data_categories: ['Email', ' '],
        legal_basis: 'contract',
      },
    );
    expect(merged['title']).toBe('Mine');
    expect(merged['purposes']).toBe('Deliver orders');
    expect(merged['data_categories']).toEqual(['Email']);
    expect(merged['legal_basis']).toBe('contract');
  });

  it('cleans up DPIA risks for the wire', () => {
    const body = createBody(REGISTERS.dpia, {
      ...emptyValues(REGISTERS.dpia),
      title: 'Tracking',
      risks: [
        {
          description: ' Over-monitoring ',
          likelihood: 'high',
          severity: 'medium',
          mitigation: '',
        },
        { description: '  ', likelihood: 'low', severity: 'low' },
      ],
      screening: { large_scale: true },
    });
    expect(body['risks']).toEqual([
      {
        description: 'Over-monitoring',
        likelihood: 'high',
        severity: 'medium',
        mitigation: null,
        residual: null,
      },
    ]);
    expect(body['screening']).toEqual({ large_scale: true });
  });
});

describe('privacy display', () => {
  it('shows the request deadline and the breach clock on list rows', () => {
    const dsr = rowFacts(REGISTERS.dsr, makeDsr());
    expect(dsr.map((f) => f.key)).toEqual([
      'privacy.options.dsrType.access',
      'privacy.dsr.daysLeft',
    ]);
    const overdue = rowFacts(REGISTERS.dsr, makeDsr({ is_overdue: true, days_remaining: -2 }));
    expect(overdue[1]).toMatchObject({ key: 'privacy.dsr.overdue', tone: 'fail' });

    expect(clockFact(makeBreach())).toMatchObject({
      key: 'privacy.breach.clock.hoursLeft',
      params: { hours: 30 },
      tone: 'warn',
    });
    expect(clockFact(makeBreach({ clock_status: 'late', hours_remaining: null }))).toMatchObject({
      key: 'privacy.breach.clock.late',
      tone: 'fail',
    });
  });
});

describe('privacyError', () => {
  it('maps coded errors with their fields, and plain statuses', () => {
    const coded = new HttpErrorResponse({
      status: 422,
      error: { detail: { code: 'ropa_incomplete', fields: ['purposes', 'legal_basis'] } },
    });
    expect(privacyError(coded)).toEqual({
      key: 'privacy.errors.ropa_incomplete',
      fields: ['purposes', 'legal_basis'],
    });
    const single = new HttpErrorResponse({
      status: 422,
      error: { detail: { code: 'decision_reason_required', field: 'subjects_decision_reason' } },
    });
    expect(privacyError(single).fields).toEqual(['subjects_decision_reason']);
    expect(privacyError(new HttpErrorResponse({ status: 403 })).key).toBe(
      'privacy.errors.forbidden',
    );
    expect(privacyError(new HttpErrorResponse({ status: 404 })).key).toBe(
      'privacy.errors.notFound',
    );
    expect(privacyError(new Error('x')).key).toBe('errors.generic');
  });
});

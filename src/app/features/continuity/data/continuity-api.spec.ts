import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ContinuityApi } from './continuity-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/continuity${path}`;

describe('ContinuityApi', () => {
  let api: ContinuityApi;
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
    api = TestBed.inject(ContinuityApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the overview', () => {
    api.overview(ORG).subscribe();
    const req = http.expectOne(url('/overview'));
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('lists BIAs with csv filters, flags, sort and paging', () => {
    api
      .listBias(ORG, {
        q: 'payroll',
        status: ['draft', 'approved'],
        criticality: ['critical'],
        owner: 'me',
        uncovered: true,
        sort: 'rto_minutes',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('/bias'));
    const p = req.request.params;
    expect(p.get('q')).toBe('payroll');
    expect(p.get('status')).toBe('draft,approved');
    expect(p.get('criticality')).toBe('critical');
    expect(p.get('owner')).toBe('me');
    expect(p.get('uncovered')).toBe('true');
    expect(p.has('review_due')).toBe(false);
    expect(p.get('sort')).toBe('rto_minutes');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('creates and patches a BIA without the generic toast', () => {
    api.createBia(ORG, { title: 'Payroll' } as never).subscribe();
    const create = http.expectOne(url('/bias'));
    expect(create.request.method).toBe('POST');
    expect(create.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    create.flush({});

    api.updateBia(ORG, 'b-1', { rto_minutes: 60, change_reason: 'Tested' }).subscribe();
    const patch = http.expectOne(url('/bias/b-1'));
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ rto_minutes: 60, change_reason: 'Tested' });
    patch.flush({});
  });

  it('posts controlled-record actions with a note', () => {
    api.biaAction(ORG, 'b-1', 'reject', 'Targets missing').subscribe();
    const bia = http.expectOne(url('/bias/b-1/reject'));
    expect(bia.request.method).toBe('POST');
    expect(bia.request.body).toEqual({ note: 'Targets missing' });
    bia.flush({});

    api.planAction(ORG, 'p-1', 'approve').subscribe();
    const plan = http.expectOne(url('/plans/p-1/approve'));
    expect(plan.request.body).toEqual({ note: null });
    plan.flush({});
  });

  it('lists plans by type and BIA', () => {
    api.listPlans(ORG, { type: 'disaster_recovery', bia_id: 'b-1', review_due: true }).subscribe();
    const req = http.expectOne((r) => r.url === url('/plans'));
    expect(req.request.params.get('type')).toBe('disaster_recovery');
    expect(req.request.params.get('bia_id')).toBe('b-1');
    expect(req.request.params.get('review_due')).toBe('true');
    req.flush({ items: [], total: 0 });
  });

  it('sets up an exercise schedule on a plan', () => {
    api
      .scheduleExercises(ORG, 'p-1', {
        rrule: 'FREQ=YEARLY',
        dtstart: '2027-10-01T00:00:00',
        lead_days: 14,
      })
      .subscribe();
    const req = http.expectOne(url('/plans/p-1/exercise-schedule'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body.rrule).toBe('FREQ=YEARLY');
    req.flush({});
  });

  it('completes, cancels and reopens exercises', () => {
    api
      .completeExercise(ORG, 'e-1', { conducted_on: '2026-11-01', outcome: 'successful' })
      .subscribe();
    const complete = http.expectOne(url('/exercises/e-1/complete'));
    expect(complete.request.body).toEqual({ conducted_on: '2026-11-01', outcome: 'successful' });
    complete.flush({});

    api.exerciseAction(ORG, 'e-1', 'cancel', 'Storm').subscribe();
    const cancel = http.expectOne(url('/exercises/e-1/cancel'));
    expect(cancel.request.body).toEqual({ note: 'Storm' });
    cancel.flush({});

    api.exerciseAction(ORG, 'e-1', 'reopen').subscribe();
    const reopen = http.expectOne(url('/exercises/e-1/reopen'));
    expect(reopen.request.body).toEqual({});
    reopen.flush({});
  });

  it('adds a follow-up action to an exercise', () => {
    api.addFollowUp(ORG, 'e-1', { title: 'Update the call tree' }).subscribe();
    const req = http.expectOne(url('/exercises/e-1/follow-ups'));
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('filters ICT services by readiness', () => {
    api.listIct(ORG, { status: 'active', readiness: ['gap', 'attention'] }).subscribe();
    const req = http.expectOne((r) => r.url === url('/ict-systems'));
    expect(req.request.params.get('status')).toBe('active');
    expect(req.request.params.get('readiness')).toBe('gap,attention');
    req.flush({ items: [], total: 0 });
  });

  it('lists the org-wide or a plan contact list and unwraps the items', () => {
    let items: readonly unknown[] = [];
    api.listContacts(ORG, 'plan', 'p-1').subscribe((r) => (items = r));
    const req = http.expectOne((r) => r.url === url('/contacts'));
    expect(req.request.params.get('scope')).toBe('plan');
    expect(req.request.params.get('plan_id')).toBe('p-1');
    req.flush({ items: [{ id: 'c-1' }] });
    expect(items).toEqual([{ id: 'c-1' }]);

    api.listContacts(ORG).subscribe();
    const org = http.expectOne((r) => r.url === url('/contacts'));
    expect(org.request.params.get('scope')).toBe('org');
    expect(org.request.params.has('plan_id')).toBe(false);
    org.flush({ items: [] });
  });

  it('deletes a contact', () => {
    api.deleteContact(ORG, 'c-1').subscribe();
    const req = http.expectOne(url('/contacts/c-1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

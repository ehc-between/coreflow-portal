import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { HseApi } from './hse-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/hse/${path}`;

describe('HseApi', () => {
  let api: HseApi;
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
    api = TestBed.inject(HseApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the overview', () => {
    api.overview(ORG).subscribe();
    const req = http.expectOne(url('overview'));
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('lists SJAs with filters (status as csv)', () => {
    api
      .listSja(ORG, {
        q: 'roof',
        status: ['draft', 'in_review'],
        owner: 'me',
        sort: 'work_start_at',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('sja'));
    const p = req.request.params;
    expect(p.get('q')).toBe('roof');
    expect(p.get('status')).toBe('draft,in_review');
    expect(p.get('owner')).toBe('me');
    expect(p.get('sort')).toBe('work_start_at');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('omits empty filters', () => {
    api.listSja(ORG, { status: [] }).subscribe();
    const req = http.expectOne((r) => r.url === url('sja'));
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('q')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('creates, updates and deletes SJAs without the generic error toast', () => {
    api
      .createSja(ORG, { title: 'Roof fan', related: [{ entity_type: 'risk', entity_id: 'r1' }] })
      .subscribe();
    const create = http.expectOne(url('sja'));
    expect(create.request.method).toBe('POST');
    expect(create.request.body.related).toEqual([{ entity_type: 'risk', entity_id: 'r1' }]);
    expect(create.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    create.flush({});

    api.updateSja(ORG, 's1', { title: 'New', change_reason: 'Scope' }).subscribe();
    const update = http.expectOne(url('sja/s1'));
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ title: 'New', change_reason: 'Scope' });
    update.flush({});

    api.deleteSja(ORG, 's1').subscribe();
    const del = http.expectOne(url('sja/s1'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('runs SJA transitions with an optional reason', () => {
    api.transitionSja(ORG, 's1', 'submit').subscribe();
    const submit = http.expectOne(url('sja/s1/transitions/submit'));
    expect(submit.request.body).toEqual({});
    submit.flush({});

    api.transitionSja(ORG, 's1', 'return', 'Missing a control').subscribe();
    const ret = http.expectOne(url('sja/s1/transitions/return'));
    expect(ret.request.method).toBe('POST');
    expect(ret.request.body).toEqual({ reason: 'Missing a control' });
    ret.flush({});
  });

  it('lists PPE with the due and holder filters', () => {
    api
      .listPpe(ORG, { status: ['issued'], category: 'head', holder: 'me', due_within_days: 30 })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('ppe'));
    const p = req.request.params;
    expect(p.get('status')).toBe('issued');
    expect(p.get('category')).toBe('head');
    expect(p.get('holder')).toBe('me');
    expect(p.get('due_within_days')).toBe('30');
    req.flush({ items: [], total: 0 });
  });

  it('issues, returns and inspects PPE', () => {
    api.issuePpe(ORG, 'p1', { holder_name: 'Kari' }).subscribe();
    const issue = http.expectOne(url('ppe/p1/issue'));
    expect(issue.request.body).toEqual({ holder_name: 'Kari' });
    issue.flush({});

    api.returnPpe(ORG, 'p1').subscribe();
    http.expectOne(url('ppe/p1/return')).flush({});

    let inspections: unknown;
    api.listInspections(ORG, 'p1').subscribe((items) => (inspections = items));
    http.expectOne(url('ppe/p1/inspections')).flush({ items: [{ id: 'i1' }] });
    expect(inspections).toEqual([{ id: 'i1' }]);

    api.recordInspection(ORG, 'p1', { result: 'fail', notes: 'Torn strap' }).subscribe();
    const inspect = http.expectOne(url('ppe/p1/inspections'));
    expect(inspect.request.method).toBe('POST');
    expect(inspect.request.body).toEqual({ result: 'fail', notes: 'Torn strap' });
    inspect.flush({});
  });

  it('holds and cancels consultations', () => {
    api.listConsultations(ORG, { status: ['planned'], kind: 'meeting' }).subscribe();
    const list = http.expectOne((r) => r.url === url('consultations'));
    expect(list.request.params.get('kind')).toBe('meeting');
    list.flush({ items: [], total: 0 });

    api
      .holdConsultation(ORG, 'c1', { summary: 'Ok', worker_representative_present: true })
      .subscribe();
    const hold = http.expectOne(url('consultations/c1/hold'));
    expect(hold.request.body.worker_representative_present).toBe(true);
    hold.flush({});

    api.cancelConsultation(ORG, 'c1').subscribe();
    http.expectOne(url('consultations/c1/cancel')).flush({});
  });

  it('creates follow-up actions on the record API of each entity type', () => {
    api.createAction(ORG, 'sja', 's1', { title: 'Buy rails' }).subscribe();
    http.expectOne(url('sja/s1/actions')).flush({});
    api.createAction(ORG, 'ppe_item', 'p1', { title: 'Replace' }).subscribe();
    http.expectOne(url('ppe/p1/actions')).flush({});
    api.createAction(ORG, 'worker_consultation', 'c1', { title: 'Follow up' }).subscribe();
    http.expectOne(url('consultations/c1/actions')).flush({});
  });

  it('plans and lists safety rounds and loads the checklist template', () => {
    api.checklistTemplate(ORG, 'nb').subscribe();
    const template = http.expectOne((r) => r.url === url('safety-rounds/checklist-template'));
    expect(template.request.params.get('lang')).toBe('nb');
    template.flush({ lang: 'nb', items: [] });

    api.listSafetyRounds(ORG, { status: ['open', 'blocked'] }).subscribe();
    const list = http.expectOne((r) => r.url === url('safety-rounds'));
    expect(list.request.params.get('status')).toBe('open,blocked');
    list.flush({ items: [], total: 0 });

    api.createSafetyRound(ORG, { title: 'Round', rrule: 'FREQ=MONTHLY' }).subscribe();
    const create = http.expectOne(url('safety-rounds'));
    expect(create.request.method).toBe('POST');
    create.flush({});
  });
});

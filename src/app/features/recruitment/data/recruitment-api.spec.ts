import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { RecruitmentApi } from './recruitment-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/recruitment/${path}`;

describe('RecruitmentApi', () => {
  let api: RecruitmentApi;
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
    api = TestBed.inject(RecruitmentApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists requisitions with comma-separated statuses and omits empty filters', () => {
    api
      .listRequisitions(ORG, {
        q: 'analyst',
        status: ['open', 'on_hold'],
        owner: 'me',
        sort: 'title',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('requisitions'));
    expect(req.request.method).toBe('GET');
    const p = req.request.params;
    expect(p.get('q')).toBe('analyst');
    expect(p.get('status')).toBe('open,on_hold');
    expect(p.get('owner')).toBe('me');
    expect(p.get('sort')).toBe('title');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    expect(p.has('department_id')).toBe(false);
    req.flush({ items: [], total: 0 });

    api.listRequisitions(ORG, { q: '', status: [] }).subscribe();
    const bare = http.expectOne((r) => r.url === url('requisitions'));
    expect(bare.request.params.keys()).toEqual([]);
    bare.flush({ items: [], total: 0 });
  });

  it('posts workflow transitions, with a note only for approve / reject', () => {
    api.transitionRequisition(ORG, 'r1', 'submit').subscribe();
    const submit = http.expectOne(url('requisitions/r1/submit'));
    expect(submit.request.method).toBe('POST');
    expect(submit.request.body).toEqual({});
    expect(submit.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    submit.flush({});

    api.transitionRequisition(ORG, 'r1', 'reject', 'Too senior').subscribe();
    expect(http.expectOne(url('requisitions/r1/reject')).request.body).toEqual({
      note: 'Too senior',
    });

    api.closeRequisition(ORG, 'r1', 'filled').subscribe();
    expect(http.expectOne(url('requisitions/r1/close')).request.body).toEqual({
      outcome: 'filled',
      note: null,
    });
  });

  it('replaces the hiring team', () => {
    api.setTeam(ORG, 'r1', [{ user_id: 'u1', team_role: 'interviewer' }]).subscribe();
    const req = http.expectOne(url('requisitions/r1/team'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ members: [{ user_id: 'u1', team_role: 'interviewer' }] });
  });

  it('filters candidates by talent pool and retention', () => {
    api
      .listCandidates(ORG, { talent_pool: false, retention_before: '2026-12-01T00:00:00Z' })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('candidates'));
    expect(req.request.params.get('talent_pool')).toBe('false');
    expect(req.request.params.get('retention_before')).toBe('2026-12-01T00:00:00Z');
  });

  it('erases a candidate with DELETE and records privacy with POST', () => {
    api.eraseCandidate(ORG, 'c1').subscribe();
    expect(http.expectOne(url('candidates/c1')).request.method).toBe('DELETE');
    api.setPrivacy(ORG, 'c1', { talent_pool_consent: false }).subscribe();
    const privacy = http.expectOne(url('candidates/c1/privacy'));
    expect(privacy.request.method).toBe('POST');
    expect(privacy.request.body).toEqual({ talent_pool_consent: false });
  });

  it('lists applications by stage and moves, offers and hires', () => {
    api
      .listApplications(ORG, { requisition_id: 'r1', stage: ['applied', 'screening'] })
      .subscribe();
    const list = http.expectOne((r) => r.url === url('applications'));
    expect(list.request.params.get('stage')).toBe('applied,screening');
    expect(list.request.params.get('requisition_id')).toBe('r1');

    api.move(ORG, 'a1', { stage: 'rejected', rejection_reason: 'not_qualified' }).subscribe();
    expect(http.expectOne(url('applications/a1/move')).request.body).toEqual({
      stage: 'rejected',
      rejection_reason: 'not_qualified',
    });
    api.extendOffer(ORG, 'a1', { start_date: '2027-01-01' }).subscribe();
    http.expectOne(url('applications/a1/offer'));
    api.respondOffer(ORG, 'a1', { accepted: true }).subscribe();
    http.expectOne(url('applications/a1/offer/respond'));
    api.hire(ORG, 'a1').subscribe();
    http.expectOne(url('applications/a1/hire'));
    api.planChecks(ORG, 'a1').subscribe();
    http.expectOne(url('applications/a1/checks/plan'));
  });

  it('schedules interviews, files scorecards and updates checks on their own paths', () => {
    api
      .scheduleInterview(ORG, 'a1', {
        kind: 'video',
        scheduled_at: '2026-11-20T09:00:00.000Z',
        duration_minutes: 45,
        interviewer_user_ids: ['u1'],
      })
      .subscribe();
    expect(http.expectOne(url('applications/a1/interviews')).request.method).toBe('POST');
    api.updateInterview(ORG, 'i1', { status: 'completed' }).subscribe();
    expect(http.expectOne(url('interviews/i1')).request.method).toBe('PATCH');
    api.createScorecard(ORG, 'a1', { ratings: [], submit: false }).subscribe();
    http.expectOne(url('applications/a1/scorecards'));
    api.updateScorecard(ORG, 's1', { submit: true }).subscribe();
    expect(http.expectOne(url('scorecards/s1')).request.method).toBe('PATCH');
    api.updateCheck(ORG, 'k1', { status: 'waived', notes: 'Internal transfer' }).subscribe();
    expect(http.expectOne(url('checks/k1')).request.body).toEqual({
      status: 'waived',
      notes: 'Internal transfer',
    });
  });

  it('reads and writes the GDPR settings and runs the purge', () => {
    api.getSettings(ORG).subscribe();
    http.expectOne(url('settings')).flush({});
    api.updateSettings(ORG, { retention_days: 180, talent_pool_days: 730 }).subscribe();
    expect(http.expectOne(url('settings')).request.method).toBe('PUT');
    let erased = -1;
    api.purgeExpired(ORG).subscribe((res) => (erased = res.erased));
    http.expectOne(url('purge-expired')).flush({ erased: 3 });
    expect(erased).toBe(3);
  });
});

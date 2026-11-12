import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ProjectsApi, projectListParams } from './projects-api';

const BASE = 'http://test/api';
const url = (path: string) => `${BASE}/v1/orgs/org-1/projects${path}`;

describe('projectListParams', () => {
  it('joins statuses, drops unset values and trims the query', () => {
    expect(
      projectListParams({
        q: '  portal ',
        status: ['active', 'on_hold'],
        owner: 'me',
        overdue: true,
        sort: 'due_date',
        limit: 25,
        offset: 0,
      }),
    ).toEqual({
      q: 'portal',
      status: 'active,on_hold',
      owner: 'me',
      member: undefined,
      kind: undefined,
      department_id: undefined,
      overdue: true,
      sort: 'due_date',
      limit: 25,
      offset: 0,
    });
    expect(projectListParams({ q: '   ', status: [] })['q']).toBeUndefined();
    expect(projectListParams({ status: [] })['status']).toBeUndefined();
  });
});

describe('ProjectsApi', () => {
  let api: ProjectsApi;
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
    api = TestBed.inject(ProjectsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists with query params and skips the generic error toast', () => {
    api.list('org-1', { status: ['active'], member: 'me' }).subscribe();
    const req = http.expectOne((r) => r.url === url(''));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('active');
    expect(req.request.params.get('member')).toBe('me');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ items: [], total: 0 });
  });

  it('unwraps the item lists of the sub-resources', () => {
    const counts: number[] = [];
    api.members('org-1', 'p-1').subscribe((items) => counts.push(items.length));
    api.milestones('org-1', 'p-1').subscribe((items) => counts.push(items.length));
    api.designReviews('org-1', 'p-1').subscribe((items) => counts.push(items.length));
    api.lessons('org-1', 'p-1').subscribe((items) => counts.push(items.length));
    api
      .setMember('org-1', 'p-1', 'u-2', 'reviewer')
      .subscribe((items) => counts.push(items.length));
    http.expectOne(url('/p-1/members')).flush({ items: [{}] });
    http.expectOne(url('/p-1/milestones')).flush({ items: [{}, {}] });
    http.expectOne(url('/p-1/design-reviews')).flush({ items: [] });
    http.expectOne(url('/p-1/lessons')).flush({ items: [{}, {}, {}] });
    const put = http.expectOne(url('/p-1/members/u-2'));
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ role: 'reviewer' });
    put.flush({ items: [{}, {}] });
    expect(counts).toEqual([1, 2, 0, 3, 2]);
  });

  it('uses the documented paths and methods', () => {
    api.get('org-1', 'p-1').subscribe();
    api.create('org-1', { title: 'T' }).subscribe();
    api.update('org-1', 'p-1', { title: 'U', change_reason: 'why' }).subscribe();
    api.delete('org-1', 'p-1').subscribe();
    api.close('org-1', 'p-1', { outcome: 'completed', closeout_summary: 'Done' }).subscribe();
    api.reopen('org-1', 'p-1', { reason: 'More work' }).subscribe();
    api.summary('org-1', 'p-1').subscribe();
    api.plan('org-1', 'p-1').subscribe();
    api.removeMember('org-1', 'p-1', 'u-2').subscribe();
    api.addMilestone('org-1', 'p-1', { title: 'M' }).subscribe();
    api.updateMilestone('org-1', 'p-1', 'm-1', { status: 'done' }).subscribe();
    api.deleteMilestone('org-1', 'p-1', 'm-1').subscribe();
    api.addDesignReview('org-1', 'p-1', { title: 'R' }).subscribe();
    api.updateDesignReview('org-1', 'p-1', 'r-1', { outcome: 'passed' }).subscribe();
    api.deleteDesignReview('org-1', 'p-1', 'r-1').subscribe();
    api.addLesson('org-1', 'p-1', { title: 'L' }).subscribe();
    api.updateLesson('org-1', 'p-1', 'l-1', { title: 'L2' }).subscribe();
    api.deleteLesson('org-1', 'p-1', 'l-1').subscribe();

    const expected: [string, string][] = [
      ['GET', '/p-1'],
      ['POST', ''],
      ['PATCH', '/p-1'],
      ['DELETE', '/p-1'],
      ['POST', '/p-1/close'],
      ['POST', '/p-1/reopen'],
      ['GET', '/p-1/summary'],
      ['GET', '/p-1/plan'],
      ['DELETE', '/p-1/members/u-2'],
      ['POST', '/p-1/milestones'],
      ['PATCH', '/p-1/milestones/m-1'],
      ['DELETE', '/p-1/milestones/m-1'],
      ['POST', '/p-1/design-reviews'],
      ['PATCH', '/p-1/design-reviews/r-1'],
      ['DELETE', '/p-1/design-reviews/r-1'],
      ['POST', '/p-1/lessons'],
      ['PATCH', '/p-1/lessons/l-1'],
      ['DELETE', '/p-1/lessons/l-1'],
    ];
    for (const [method, path] of expected) {
      const req = http.expectOne({ method, url: url(path) });
      expect(req.request.context.get(SKIP_ERROR_TOAST), path).toBe(true);
      req.flush({});
    }
  });
});

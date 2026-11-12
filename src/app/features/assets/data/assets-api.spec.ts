import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { AssetsApi } from './assets-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/assets${path}`;

describe('AssetsApi', () => {
  let api: AssetsApi;
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
    api = TestBed.inject(AssetsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists assets with csv filters, flags and paging', () => {
    api
      .list(ORG, {
        q: 'laptop',
        type: ['hardware', 'software'],
        classification: ['restricted'],
        lifecycle: ['in_use'],
        owner: 'me',
        requires_calibration: true,
        sort: '-name',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url(''));
    const p = req.request.params;
    expect(req.request.method).toBe('GET');
    expect(p.get('q')).toBe('laptop');
    expect(p.get('type')).toBe('hardware,software');
    expect(p.get('classification')).toBe('restricted');
    expect(p.get('lifecycle')).toBe('in_use');
    expect(p.get('owner')).toBe('me');
    expect(p.get('requires_calibration')).toBe('true');
    expect(p.has('contains_personal_data')).toBe(false);
    expect(p.get('sort')).toBe('-name');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('creates an asset without the generic error toast', () => {
    api.create(ORG, { name: 'Scale' }).subscribe();
    const req = http.expectOne(url(''));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Scale' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('reads calibrations due and records a calibration', () => {
    api.calibrationsDue(ORG, 90).subscribe();
    const due = http.expectOne((r) => r.url === url('/calibrations-due'));
    expect(due.request.params.get('within_days')).toBe('90');
    due.flush({ items: [] });

    api.addCalibration(ORG, 'a-1', { performed_on: '2026-11-01', result: 'fail' }).subscribe();
    const add = http.expectOne(url('/a-1/calibrations'));
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual({ performed_on: '2026-11-01', result: 'fail' });
    add.flush({});

    api.deleteCalibration(ORG, 'c-1').subscribe();
    const del = http.expectOne(url('/calibrations/c-1'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('lists access reviews and completes one with an attestation', () => {
    api
      .listReviews(ORG, { status: ['planned', 'in_progress'], reviewer: 'me', due_within_days: 30 })
      .subscribe();
    const list = http.expectOne((r) => r.url === url('/access-reviews'));
    expect(list.request.params.get('status')).toBe('planned,in_progress');
    expect(list.request.params.get('reviewer')).toBe('me');
    expect(list.request.params.get('due_within_days')).toBe('30');
    list.flush({ items: [], total: 0 });

    api.completeReview(ORG, 'r-1', 'All checked').subscribe();
    const complete = http.expectOne(url('/access-reviews/r-1/complete'));
    expect(complete.request.method).toBe('POST');
    expect(complete.request.body).toEqual({ attestation: 'All checked' });
    complete.flush({});

    api.cancelReview(ORG, 'r-1', 'System retired').subscribe();
    const cancel = http.expectOne(url('/access-reviews/r-1/cancel'));
    expect(cancel.request.body).toEqual({ reason: 'System retired' });
    cancel.flush({});
  });

  it('works the accounts of a review', () => {
    api.addReviewItems(ORG, 'r-1', [{ subject_name: 'Kari' }]).subscribe();
    const add = http.expectOne(url('/access-reviews/r-1/items'));
    expect(add.request.body).toEqual({ items: [{ subject_name: 'Kari' }] });
    add.flush({ items: [] });

    api.importMembers(ORG, 'r-1').subscribe();
    http.expectOne(url('/access-reviews/r-1/items/import-members')).flush({ items: [] });

    api.updateReviewItem(ORG, 'r-1', 'i-1', { decision: 'revoke', note: 'Left' }).subscribe();
    const patch = http.expectOne(url('/access-reviews/r-1/items/i-1'));
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ decision: 'revoke', note: 'Left' });
    patch.flush({});
  });

  it('lists change requests with the open flag and creates one with assets', () => {
    api
      .listChanges(ORG, {
        open: true,
        type: 'emergency',
        risk_level: ['high', 'critical'],
        asset_id: 'a-1',
      })
      .subscribe();
    const list = http.expectOne((r) => r.url === url('/changes'));
    const p = list.request.params;
    expect(p.get('open')).toBe('true');
    expect(p.get('type')).toBe('emergency');
    expect(p.get('risk_level')).toBe('high,critical');
    expect(p.get('asset_id')).toBe('a-1');
    expect(p.has('status')).toBe(false);
    list.flush({ items: [], total: 0 });

    api.createChange(ORG, { title: 'Upgrade', asset_ids: ['a-1'] }).subscribe();
    const create = http.expectOne(url('/changes'));
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ title: 'Upgrade', asset_ids: ['a-1'] });
    create.flush({});

    api.updateChange(ORG, 'c-1', { review_outcome: 'successful' }).subscribe();
    const patch = http.expectOne(url('/changes/c-1'));
    expect(patch.request.method).toBe('PATCH');
    patch.flush({});
  });
});

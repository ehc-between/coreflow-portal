import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { DeviationsApi } from './deviations-api';
import { DeviationIntakeApi, PublicIntakeApi } from './intake-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const DEV = 'dev-1';

describe('M03 API clients', () => {
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
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('DeviationsApi (M03 additions)', () => {
    let api: DeviationsApi;
    beforeEach(() => (api = TestBed.inject(DeviationsApi)));

    it('runs a workflow transition with comment and language, explained in place', () => {
      api.transition(ORG, DEV, 'start investigation', { comment: 'go', lang: 'nb' }).subscribe();
      const req = http.expectOne(
        `${BASE}/v1/orgs/${ORG}/deviations/${DEV}/transitions/start%20investigation`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ comment: 'go', lang: 'nb' });
      expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
      req.flush({});
    });

    it('serialises repeatable status, category and record type filters', () => {
      api
        .listDeviations(ORG, {
          status: ['received', 'open'],
          category: 'in_progress',
          record_type_id: 'rt-1',
        })
        .subscribe();
      const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/deviations`);
      expect(req.request.params.getAll('status')).toEqual(['received', 'open']);
      expect(req.request.params.get('category')).toBe('in_progress');
      expect(req.request.params.get('record_type_id')).toBe('rt-1');
      req.flush({ items: [], total: 0 });
    });

    it('lists and installs templates', () => {
      api.listTemplates(ORG).subscribe();
      http.expectOne(`${BASE}/v1/orgs/${ORG}/deviation-templates`).flush({ items: [] });

      api.installTemplate(ORG, 'customer_complaint', { lang: 'nb' }).subscribe();
      const req = http.expectOne(
        `${BASE}/v1/orgs/${ORG}/deviation-templates/customer_complaint/install`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ lang: 'nb' });
      req.flush({});
    });

    it('fetches similar cases with a limit', () => {
      api.similar(ORG, DEV, 3).subscribe();
      const req = http.expectOne(
        (r) => r.url === `${BASE}/v1/orgs/${ORG}/deviations/${DEV}/similar`,
      );
      expect(req.request.params.get('limit')).toBe('3');
      req.flush({ items: [] });
    });

    it('creates, updates, applies and deletes root-cause worksheets', () => {
      const base = `${BASE}/v1/orgs/${ORG}/deviations/${DEV}/root-causes`;
      api.listRootCauses(ORG, DEV).subscribe();
      http.expectOne(base).flush({ items: [] });

      api.createRootCause(ORG, DEV, { method: 'five_whys', whys: [], apply: true }).subscribe();
      const create = http.expectOne(base);
      expect(create.request.method).toBe('POST');
      expect(create.request.body).toEqual({ method: 'five_whys', whys: [], apply: true });
      create.flush({});

      api.updateRootCause(ORG, DEV, 'r1', { conclusion: 'x' }).subscribe();
      const update = http.expectOne(`${base}/r1`);
      expect(update.request.method).toBe('PATCH');
      update.flush({});

      api.applyRootCause(ORG, DEV, 'r1').subscribe();
      const apply = http.expectOne(`${base}/r1/apply`);
      expect(apply.request.method).toBe('POST');
      apply.flush({});

      api.deleteRootCause(ORG, DEV, 'r1').subscribe();
      expect(http.expectOne(`${base}/r1`).request.method).toBe('DELETE');
    });

    it('sends the effectiveness review date (null cancels) on an action update', () => {
      api.updateAction(ORG, DEV, 'a1', { effectiveness_review_due_at: null }).subscribe();
      const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/deviations/${DEV}/actions/a1`);
      expect(req.request.body).toEqual({ effectiveness_review_due_at: null });
      req.flush({});
    });
  });

  describe('DeviationIntakeApi', () => {
    let api: DeviationIntakeApi;
    beforeEach(() => (api = TestBed.inject(DeviationIntakeApi)));

    it('reads, saves and rotates the intake settings', () => {
      const base = `${BASE}/v1/orgs/${ORG}/deviation-intake`;
      api.getSettings(ORG).subscribe();
      http.expectOne(base).flush({});

      api
        .saveSettings(ORG, { enabled: true, mode: 'whistleblowing', allow_contact: false })
        .subscribe();
      const put = http.expectOne(base);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({
        enabled: true,
        mode: 'whistleblowing',
        allow_contact: false,
      });
      put.flush({});

      api.rotateToken(ORG).subscribe();
      expect(http.expectOne(`${base}/rotate-token`).request.method).toBe('POST');
    });

    it('lists, triages, dismisses and converts reports', () => {
      const base = `${BASE}/v1/orgs/${ORG}/deviation-intake/reports`;
      api.listReports(ORG, { status: 'new', limit: 25, offset: 25 }).subscribe();
      const list = http.expectOne((r) => r.url === base);
      expect(list.request.params.get('status')).toBe('new');
      expect(list.request.params.get('offset')).toBe('25');
      list.flush({ items: [], total: 0 });

      api.getReport(ORG, 'r1').subscribe();
      http.expectOne(`${base}/r1`).flush({});

      api.triage(ORG, 'r1', { public_note: 'Looking into it' }).subscribe();
      const triage = http.expectOne(`${base}/r1/triage`);
      expect(triage.request.body).toEqual({ public_note: 'Looking into it' });
      triage.flush({});

      api.dismiss(ORG, 'r1').subscribe();
      http.expectOne(`${base}/r1/dismiss`).flush({});

      api.convert(ORG, 'r1', { severity: 'high', type_id: 't1', data: {} }).subscribe();
      const convert = http.expectOne(`${base}/r1/convert`);
      expect(convert.request.body).toEqual({ severity: 'high', type_id: 't1', data: {} });
      convert.flush({});
    });
  });

  describe('PublicIntakeApi', () => {
    let api: PublicIntakeApi;
    beforeEach(() => (api = TestBed.inject(PublicIntakeApi)));

    it('uses the unauthenticated public paths', () => {
      const base = `${BASE}/v1/public/deviation-intake/tok`;
      api.get('tok').subscribe();
      http.expectOne(base).flush({});

      api
        .submit('tok', { title: 'Leak', description: 'Water on the floor', website: '' })
        .subscribe();
      const submit = http.expectOne(`${base}/reports`);
      expect(submit.request.method).toBe('POST');
      expect(submit.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
      submit.flush({});

      api.status('tok', ' abcd-efgh-ijkl-mnop ').subscribe();
      http.expectOne(`${base}/reports/ABCD-EFGH-IJKL-MNOP`).flush({});
    });
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { RiskApi } from './risk-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const RISK = `${BASE}/v1/orgs/${ORG}/risk`;

describe('RiskApi', () => {
  let api: RiskApi;
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
    api = TestBed.inject(RiskApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists risks with csv status and level filters', () => {
    api
      .listRisks(ORG, {
        q: ' laptop ',
        status: ['identified', 'assessed'],
        level: ['high', 'critical'],
        register_id: 'reg-1',
        owner: 'me',
        review_due: true,
        include_closed: false,
        sort: '-score',
        limit: 50,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${RISK}/risks`);
    const p = req.request.params;
    expect(req.request.method).toBe('GET');
    expect(p.get('q')).toBe('laptop');
    expect(p.get('status')).toBe('identified,assessed');
    expect(p.get('level')).toBe('high,critical');
    expect(p.get('register_id')).toBe('reg-1');
    expect(p.get('owner')).toBe('me');
    expect(p.get('review_due')).toBe('true');
    expect(p.get('include_closed')).toBe('false');
    expect(p.get('sort')).toBe('-score');
    expect(p.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('omits empty filters', () => {
    api.listRisks(ORG, { q: '', status: [], level: [] }).subscribe();
    const req = http.expectOne((r) => r.url === `${RISK}/risks`);
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ items: [], total: 0 });
  });

  it('creates a risk without the generic error toast', () => {
    api.createRisk(ORG, { title: 'Stolen laptop' }).subscribe();
    const req = http.expectOne(`${RISK}/risks`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Stolen laptop' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('accepts, revokes and reviews a risk', () => {
    api.acceptRisk(ORG, 'r-1', { note: 'ok', expires_at: null }).subscribe();
    http.expectOne(`${RISK}/risks/r-1/accept`).flush({});
    api.revokeAcceptance(ORG, 'r-1', '').subscribe();
    const revoke = http.expectOne(`${RISK}/risks/r-1/revoke-acceptance`);
    expect(revoke.request.body).toEqual({ reason: null });
    revoke.flush({});
    api.reviewRisk(ORG, 'r-1', { note: 'still valid' }).subscribe();
    const review = http.expectOne(`${RISK}/risks/r-1/review`);
    expect(review.request.method).toBe('POST');
    review.flush({});
  });

  it('manages treatments under the risk and by id', () => {
    api.createTreatment(ORG, 'r-1', { title: 'Encrypt disks' }).subscribe();
    http.expectOne(`${RISK}/risks/r-1/treatments`).flush({});
    api.updateTreatment(ORG, 't-1', { status: 'done' }).subscribe();
    const patch = http.expectOne(`${RISK}/treatments/t-1`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush({});
    api.deleteTreatment(ORG, 't-1').subscribe();
    expect(http.expectOne(`${RISK}/treatments/t-1`).request.method).toBe('DELETE');
  });

  it('asks for the heat map quietly (a missing matrix is not an error toast)', () => {
    api.heatmap(ORG, { basis: 'residual', register_id: 'reg-1' }).subscribe();
    const req = http.expectOne((r) => r.url === `${RISK}/heatmap`);
    expect(req.request.params.get('basis')).toBe('residual');
    expect(req.request.params.get('register_id')).toBe('reg-1');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('generates, reads, edits and exports the SoA', () => {
    api.generateSoa(ORG, 'iso27001-2022').subscribe();
    const gen = http.expectOne(`${RISK}/soa/generate`);
    expect(gen.request.body).toEqual({ standard_key: 'iso27001-2022' });
    gen.flush({});
    api.getSoa(ORG, 'iso27001-2022', { applicable: false }).subscribe();
    const get = http.expectOne((r) => r.url === `${RISK}/soa/iso27001-2022`);
    expect(get.request.params.get('applicable')).toBe('false');
    get.flush({});
    api.updateSoaEntry(ORG, 'e-1', { applicable: false, justification: 'n/a' }).subscribe();
    expect(http.expectOne(`${RISK}/soa/entries/e-1`).request.method).toBe('PATCH');
    api.exportSoa(ORG, 'iso27001-2022').subscribe();
    const csv = http.expectOne(`${RISK}/soa/iso27001-2022/export.csv`);
    expect(csv.request.responseType).toBe('blob');
    csv.flush(new Blob(['a,b']));
  });

  it('reaches matrices, registers, opportunities and setup', () => {
    api.setup(ORG).subscribe();
    http.expectOne(`${RISK}/setup`).flush({});
    api.matrixTemplates(ORG).subscribe();
    http.expectOne(`${RISK}/matrix-templates`).flush({ items: [] });
    api.updateMatrix(ORG, 'm-1', { name: 'X' }).subscribe();
    http.expectOne(`${RISK}/matrices/m-1`).flush({});
    api.listRegisters(ORG, 'hse').subscribe();
    const regs = http.expectOne((r) => r.url === `${RISK}/registers`);
    expect(regs.request.params.get('category')).toBe('hse');
    regs.flush({ items: [], total: 0 });
    api.listOpportunities(ORG, { status: ['identified', 'planned'] }).subscribe();
    const opps = http.expectOne((r) => r.url === `${RISK}/opportunities`);
    expect(opps.request.params.get('status')).toBe('identified,planned');
    opps.flush({ items: [], total: 0 });
  });
});

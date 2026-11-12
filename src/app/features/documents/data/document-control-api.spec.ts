import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { DocumentControlApi, cleanParams } from './document-control-api';
import { documentControlErrorKey } from './document-control-errors';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;

describe('DocumentControlApi', () => {
  let api: DocumentControlApi;
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
    api = TestBed.inject(DocumentControlApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists document types, optionally with inactive ones', () => {
    api.listTypes(ORG).subscribe();
    const plain = http.expectOne((r) => r.url === `${ROOT}/document-types`);
    expect(plain.request.params.has('include_inactive')).toBe(false);
    plain.flush([]);

    api.listTypes(ORG, true).subscribe();
    const all = http.expectOne((r) => r.url === `${ROOT}/document-types`);
    expect(all.request.params.get('include_inactive')).toBe('true');
    all.flush([]);
  });

  it('creates and patches a type quietly (the page shows coded errors)', () => {
    api.createType(ORG, { key: 'procedure', name: 'Procedure' }).subscribe();
    const create = http.expectOne(`${ROOT}/document-types`);
    expect(create.request.method).toBe('POST');
    expect(create.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    create.flush({});

    api.updateType(ORG, 't1', { next_number: 10, change_reason: 'reset' }).subscribe();
    const patch = http.expectOne(`${ROOT}/document-types/t1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ next_number: 10, change_reason: 'reset' });
    patch.flush({});
  });

  it('creates a document from a template', () => {
    api.createFromTemplate(ORG, 'tpl-1', { title: 'Complaints' }).subscribe();
    const req = http.expectOne(`${ROOT}/document-templates/tpl-1/documents`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Complaints' });
    req.flush({ id: 'd1' });
  });

  it('queries the master list and omits blank filters', () => {
    api
      .register(ORG, {
        q: ' policy ',
        type: '',
        status: 'approved',
        review_due: false,
        include_external: true,
        sort: 'code',
        limit: 100,
        offset: 0,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/document-register`);
    const p = req.request.params;
    expect(p.get('q')).toBe('policy');
    expect(p.has('type')).toBe(false);
    expect(p.get('status')).toBe('approved');
    expect(p.has('review_due')).toBe(false);
    expect(p.get('include_external')).toBe('true');
    expect(p.get('offset')).toBe('0');
    req.flush({ items: [], total: 0 });
  });

  it('exports the master list as a blob without paging', () => {
    api.exportRegister(ORG, { include_external: true, limit: 100, offset: 200 }).subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/document-register/export`);
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.has('limit')).toBe(false);
    expect(req.request.params.has('offset')).toBe(false);
    req.flush(new Blob(['kind,code']));
  });

  it('lists external documents with a csv status filter', () => {
    api
      .listExternal(ORG, { status: ['current', 'superseded'], review_due: true, sort: 'title' })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/external-documents`);
    expect(req.request.params.get('status')).toBe('current,superseded');
    expect(req.request.params.get('review_due')).toBe('true');
    req.flush({ items: [], total: 0 });
  });

  it('records an external document review', () => {
    api.markExternalReviewed(ORG, 'x1', { next_review_at: '2027-01-01', note: null }).subscribe();
    const req = http.expectOne(`${ROOT}/external-documents/x1/reviewed`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('compares two revisions', () => {
    api.compare(ORG, 'd1', 'r1', 'r2').subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/documents/d1/compare`);
    expect(req.request.params.get('from_revision_id')).toBe('r1');
    expect(req.request.params.get('to_revision_id')).toBe('r2');
    req.flush({ from: {}, to: {}, blocks: [], stats: {} });

    api.revisionHistory(ORG, 'd1').subscribe();
    http.expectOne(`${ROOT}/documents/d1/revision-history`).flush({ document: {}, items: [] });
  });

  it('drives the campaign lifecycle', () => {
    api
      .createCampaign(ORG, {
        document_id: 'd1',
        require_acknowledgement: true,
        audience: [{ type: 'role', value: 'member' }],
        launch: true,
      })
      .subscribe();
    const create = http.expectOne(`${ROOT}/document-campaigns`);
    expect(create.request.body.launch).toBe(true);
    create.flush({});

    api.launchCampaign(ORG, 'c1').subscribe();
    http.expectOne(`${ROOT}/document-campaigns/c1/launch`).flush({});
    api.addRecipients(ORG, 'c1', [{ type: 'user', value: 'u2' }]).subscribe();
    const add = http.expectOne(`${ROOT}/document-campaigns/c1/recipients`);
    expect(add.request.body).toEqual({ audience: [{ type: 'user', value: 'u2' }] });
    add.flush({});
    api.remindCampaign(ORG, 'c1').subscribe();
    http.expectOne(`${ROOT}/document-campaigns/c1/remind`).flush({ reminded: 2 });
    api.closeCampaign(ORG, 'c1').subscribe();
    http.expectOne(`${ROOT}/document-campaigns/c1/close`).flush({});
    api.deleteCampaign(ORG, 'c1').subscribe();
    const del = http.expectOne(`${ROOT}/document-campaigns/c1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('lists campaigns with a csv status filter', () => {
    api.listCampaigns(ORG, { status: ['draft', 'active'], sort: 'due_at' }).subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/document-campaigns`);
    expect(req.request.params.get('status')).toBe('draft,active');
    expect(req.request.params.get('sort')).toBe('due_at');
    req.flush({ items: [], total: 0 });
  });

  it('asks for the retention report window', () => {
    api.retentionDue(ORG, 30).subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/retention-due`);
    expect(req.request.params.get('within_days')).toBe('30');
    req.flush({ items: [] });
  });
});

describe('cleanParams', () => {
  it('drops empty, null and false values and trims text', () => {
    expect(
      cleanParams({ a: ' x ', b: '', c: null, d: undefined, e: false, f: true, g: 0 }),
    ).toEqual({
      a: 'x',
      f: true,
      g: 0,
    });
  });
});

describe('documentControlErrorKey', () => {
  const error = (status: number, detail?: unknown) =>
    new HttpErrorResponse({ status, error: detail === undefined ? null : { detail } });

  it('maps known codes to scoped keys', () => {
    expect(documentControlErrorKey(error(409, { code: 'campaign_status', message: 'x' }))).toBe(
      'documents.control.errors.campaign_status',
    );
    expect(documentControlErrorKey(error(422, { code: 'invalid_numbering_pattern' }))).toBe(
      'documents.control.errors.invalid_numbering_pattern',
    );
  });

  it('falls back by status and never shows the backend message', () => {
    expect(documentControlErrorKey(error(403, 'Insufficient permissions'))).toBe(
      'documents.control.errors.forbidden',
    );
    expect(documentControlErrorKey(error(404, 'not found'))).toBe(
      'documents.control.errors.notFound',
    );
    expect(documentControlErrorKey(error(409, { code: 'something_new' }))).toBe('errors.generic');
    expect(documentControlErrorKey(error(500))).toBe('errors.server');
    expect(documentControlErrorKey(new Error('x'))).toBe('errors.generic');
  });
});

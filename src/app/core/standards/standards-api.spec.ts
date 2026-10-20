import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SseClient } from '../ai/sse-client';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { JOB_POLL_INTERVAL_MS, StandardsApi, isJobFinished } from './standards-api';
import { StandardJob } from './standards.models';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;

function job(over: Partial<StandardJob> = {}): StandardJob {
  return {
    id: 'j',
    kind: 'ai_map',
    status: 'running',
    progress: 10,
    suggestions_created: 0,
    ...over,
  };
}

describe('StandardsApi', () => {
  let api: StandardsApi;
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
    api = TestBed.inject(StandardsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('lists the org standards', () => {
    api.list(ORG).subscribe();
    const req = http.expectOne(`${ROOT}/standards`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('enables / disables a standard with PUT {enabled}', () => {
    api.setEnabled(ORG, 'iso9001', false).subscribe();
    const req = http.expectOne(`${ROOT}/standards/iso9001`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ enabled: false });
    req.flush({});
  });

  it('fetches the tree and an encoded clause', () => {
    api.getTree(ORG, 'iso27001').subscribe();
    http.expectOne(`${ROOT}/standards/iso27001/tree`).flush([]);

    api.getClause(ORG, 'iso27001-2022', 'A.8.13').subscribe();
    const req = http.expectOne(`${ROOT}/standards/iso27001-2022/clauses/A.8.13`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('patches a requirement by its opaque, qualified ref (encoded, without toasts)', () => {
    api
      .updateRequirement(ORG, 'iso27001-2022:A.8.13.r1', {
        applicable: false,
        justification: 'n/a',
      })
      .subscribe();
    const req = http.expectOne(`${ROOT}/standard-requirements/iso27001-2022%3AA.8.13.r1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ applicable: false, justification: 'n/a' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('lists links by requirement or by record', () => {
    api.listLinks(ORG, { requirement_ref: 'r-1' }).subscribe();
    const byReq = http.expectOne((r) => r.url === `${ROOT}/requirement-links`);
    expect(byReq.request.params.get('requirement_ref')).toBe('r-1');
    expect(byReq.request.params.has('entity_type')).toBe(false);
    byReq.flush([]);

    api.listLinks(ORG, { entity_type: 'document', entity_id: 'd-1' }).subscribe();
    const byEntity = http.expectOne((r) => r.url === `${ROOT}/requirement-links`);
    expect(byEntity.request.params.get('entity_type')).toBe('document');
    expect(byEntity.request.params.get('entity_id')).toBe('d-1');
    byEntity.flush([]);
  });

  it('creates, confirms, rejects and deletes links', () => {
    const body = { requirement_ref: 'r-1', entity_type: 'deviation' as const, entity_id: 'dv-1' };
    api.createLink(ORG, body).subscribe();
    const create = http.expectOne(`${ROOT}/requirement-links`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(body);
    create.flush({});

    api.confirmLink(ORG, 'l-1').subscribe();
    expect(http.expectOne(`${ROOT}/requirement-links/l-1/confirm`).request.method).toBe('POST');

    api.rejectLink(ORG, 'l-1').subscribe();
    expect(http.expectOne(`${ROOT}/requirement-links/l-1/reject`).request.method).toBe('POST');

    api.deleteLink(ORG, 'l-1').subscribe();
    expect(http.expectOne(`${ROOT}/requirement-links/l-1`).request.method).toBe('DELETE');
  });

  it('starts AI mapping for a whole standard or one document', () => {
    api.startAiMap(ORG, 'iso9001').subscribe();
    const all = http.expectOne(`${ROOT}/standards/iso9001/ai-map`);
    expect(all.request.method).toBe('POST');
    expect(all.request.body).toEqual({});
    all.flush({ job_id: 'j-1' });

    api.startAiMap(ORG, 'iso9001', 'doc-1').subscribe();
    const one = http.expectOne(`${ROOT}/standards/iso9001/ai-map`);
    expect(one.request.body).toEqual({ document_id: 'doc-1' });
    one.flush({ job_id: 'j-2' });
  });

  it('starts a requirement-scoped AI mapping', () => {
    api.startAiMap(ORG, 'iso27001', { requirement_ref: 'iso27001:A.5.1.r1' }).subscribe();
    const req = http.expectOne(`${ROOT}/standards/iso27001/ai-map`);
    expect(req.request.body).toEqual({ requirement_ref: 'iso27001:A.5.1.r1' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ job_id: 'j-4' });
  });

  it('starts an AI draft for a requirement (ref encoded per segment)', () => {
    api.startAiDraft(ORG, 'iso27001:A.5/1.r1', 'nb').subscribe();
    const req = http.expectOne(`${ROOT}/standard-requirements/iso27001%3AA.5/1.r1/ai-draft`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ lang: 'nb' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ job_id: 'j-5' });
  });

  it('streams requirement guidance through the SSE client', () => {
    const sse = TestBed.inject(SseClient);
    const cancel = vi.fn();
    const post = vi.spyOn(sse, 'post').mockReturnValue({ cancel });
    const onEvent = vi.fn();
    const stream = api.streamGuidance(ORG, 'iso27001:A.5.1.r1', 'en', onEvent);
    expect(post).toHaveBeenCalledWith(
      `v1/orgs/${ORG}/standard-requirements/iso27001%3AA.5.1.r1/ai-help`,
      { lang: 'en' },
      onEvent,
    );
    stream.cancel();
    expect(cancel).toHaveBeenCalled();
  });

  it('starts licensed-text extraction', () => {
    api.extractLicensedText(ORG, 'iso27001').subscribe();
    const req = http.expectOne(`${ROOT}/standards/iso27001/licensed-text/extract`);
    expect(req.request.method).toBe('POST');
    req.flush({ job_id: 'j-3' });
  });

  describe('isJobFinished', () => {
    it('is false while queued or running, true otherwise', () => {
      expect(isJobFinished(job({ status: 'queued' }))).toBe(false);
      expect(isJobFinished(job({ status: 'running' }))).toBe(false);
      expect(isJobFinished(job({ status: 'done' }))).toBe(true);
      expect(isJobFinished(job({ status: 'failed' }))).toBe(true);
    });
  });

  describe('pollJob', () => {
    it('polls until the job finishes, emitting every snapshot, then completes', () => {
      vi.useFakeTimers();
      const seen: StandardJob[] = [];
      let completed = false;
      api.pollJob(ORG, 'j-1').subscribe({
        next: (j) => seen.push(j),
        complete: () => (completed = true),
      });

      vi.advanceTimersByTime(0);
      http.expectOne(`${ROOT}/standard-jobs/j-1`).flush(job({ status: 'queued', progress: 0 }));
      vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS);
      http.expectOne(`${ROOT}/standard-jobs/j-1`).flush(job({ progress: 50 }));
      vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS);
      http
        .expectOne(`${ROOT}/standard-jobs/j-1`)
        .flush(job({ status: 'done', progress: 100, suggestions_created: 4 }));

      expect(seen.map((j) => j.progress)).toEqual([0, 50, 100]);
      expect(seen.at(-1)?.suggestions_created).toBe(4);
      expect(completed).toBe(true);

      // No further requests once finished.
      vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS * 3);
      http.expectNone(`${ROOT}/standard-jobs/j-1`);
    });

    it('stops on a failed job', () => {
      vi.useFakeTimers();
      let completed = false;
      api.pollJob(ORG, 'j-2', 100).subscribe({ complete: () => (completed = true) });
      vi.advanceTimersByTime(0);
      http.expectOne(`${ROOT}/standard-jobs/j-2`).flush(job({ status: 'failed', error: 'x' }));
      expect(completed).toBe(true);
      vi.advanceTimersByTime(500);
      http.expectNone(`${ROOT}/standard-jobs/j-2`);
    });

    it('does not overlap a slow request with the next tick', () => {
      vi.useFakeTimers();
      api.pollJob(ORG, 'j-3', 100).subscribe();
      vi.advanceTimersByTime(0);
      const first = http.expectOne(`${ROOT}/standard-jobs/j-3`);
      vi.advanceTimersByTime(350);
      // Still only the one in-flight request.
      http.expectNone(`${ROOT}/standard-jobs/j-3`);
      first.flush(job({ status: 'done', progress: 100 }));
    });

    it('propagates an error and stops polling', () => {
      vi.useFakeTimers();
      let failed = false;
      api.pollJob(ORG, 'j-4', 100).subscribe({ error: () => (failed = true) });
      vi.advanceTimersByTime(0);
      http
        .expectOne(`${ROOT}/standard-jobs/j-4`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      expect(failed).toBe(true);
      vi.advanceTimersByTime(500);
      http.expectNone(`${ROOT}/standard-jobs/j-4`);
    });
  });
});

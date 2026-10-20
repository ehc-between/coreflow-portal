import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../auth/auth.interceptor';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { CreateAttachmentResponse } from './attachment.models';
import { FakeXhr, attachment, nextRequest } from './attachments.testing';
import { AttachmentUploadError, AttachmentsApi, UploadEvent } from './attachments-api';
import { STORAGE_XHR_FACTORY } from './storage-upload';

const BASE = 'http://test/api';
const ORG = 'org-1';
const DEV = 'dev-1';
const ABC_SHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const S3_URL = 'https://bucket.s3.eu-north-1.amazonaws.com/orgs/org-1/x?X-Amz-Signature=abc';

function created(): CreateAttachmentResponse {
  return {
    attachment: attachment({ status: 'pending', completed_at: null }),
    upload: {
      url: S3_URL,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        'x-amz-checksum-sha256': 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
        'x-amz-server-side-encryption': 'AES256',
      },
      expires_at: '2099-01-01T00:00:00Z',
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('AttachmentsApi', () => {
  let api: AttachmentsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    FakeXhr.instances = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // The real auth interceptor is installed to prove the storage PUT never
        // goes through it (it would attach the bearer to API requests).
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        { provide: AuthService, useValue: { accessToken: () => 'tok', refresh: vi.fn() } },
        { provide: STORAGE_XHR_FACTORY, useValue: () => new FakeXhr() },
      ],
    });
    api = TestBed.inject(AttachmentsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists attachments for a record without the generic error toast', () => {
    api.list(ORG, 'deviation', DEV).subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/attachments`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('entity_type')).toBe('deviation');
    expect(req.request.params.get('entity_id')).toBe(DEV);
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush([]);
  });

  it('requests a download link and deletes', () => {
    api.download(ORG, 'att-1').subscribe();
    http.expectOne(`${BASE}/v1/orgs/${ORG}/attachments/att-1/download`).flush({
      url: 'https://s3/x',
      filename: 'a.pdf',
      expires_at: '2099-01-01T00:00:00Z',
    });
    api.delete(ORG, 'att-1').subscribe();
    const del = http.expectOne(`${BASE}/v1/orgs/${ORG}/attachments/att-1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('runs hash → create → PUT to storage → complete', async () => {
    const file = new File(['abc'], 'evidence.pdf', { type: 'application/pdf' });
    const events: UploadEvent[] = [];
    let done = false;
    api.upload(ORG, 'deviation', DEV, file).subscribe({
      next: (e) => events.push(e),
      complete: () => (done = true),
    });

    const create = await nextRequest(http, `${BASE}/v1/orgs/${ORG}/attachments`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({
      entity_type: 'deviation',
      entity_id: DEV,
      filename: 'evidence.pdf',
      content_type: 'application/pdf',
      size_bytes: 3,
      sha256: ABC_SHA,
    });
    expect(create.request.headers.get('Authorization')).toBe('Bearer tok');
    create.flush(created());

    // The PUT goes straight to storage with exactly the presigned headers.
    expect(FakeXhr.instances).toHaveLength(1);
    const xhr = FakeXhr.instances[0];
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe(S3_URL);
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.headers).toEqual(created().upload.headers);
    expect(xhr.headers['Authorization']).toBeUndefined();
    expect(xhr.body).toBe(file);
    http.expectNone(S3_URL);

    xhr.respond(200);
    const complete = http.expectOne(`${BASE}/v1/orgs/${ORG}/attachments/att-1/complete`);
    expect(complete.request.method).toBe('POST');
    complete.flush(attachment());

    expect(done).toBe(true);
    expect(events.map((e) => e.kind)).toEqual([
      'hashed',
      'created',
      'progress',
      'progress',
      'completing',
      'done',
    ]);
    expect(events[0]).toEqual({ kind: 'hashed', sha256: ABC_SHA });
  });

  it('wraps a create failure with its phase and status', async () => {
    const file = new File(['abc'], 'a.pdf', { type: 'application/pdf' });
    let error: unknown;
    api.upload(ORG, 'deviation', DEV, file, { sha256: ABC_SHA }).subscribe({
      error: (e) => (error = e),
    });
    await tick();
    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/attachments`)
      .flush({ detail: 'too big' }, { status: 413, statusText: 'Too Large' });
    expect(error).toBeInstanceOf(AttachmentUploadError);
    expect((error as AttachmentUploadError).phase).toBe('create');
    expect((error as AttachmentUploadError).status).toBe(413);
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('a storage failure carries the created row for resume, and resume skips create', async () => {
    const file = new File(['abc'], 'a.pdf', { type: 'application/pdf' });
    let error: AttachmentUploadError | undefined;
    api.upload(ORG, 'deviation', DEV, file, { sha256: ABC_SHA }).subscribe({
      error: (e: AttachmentUploadError) => (error = e),
    });
    await tick();
    http.expectOne(`${BASE}/v1/orgs/${ORG}/attachments`).flush(created());
    FakeXhr.instances[0].respond(403);
    expect(error?.phase).toBe('upload');
    expect(error?.status).toBe(403);
    expect(error?.created?.attachment.id).toBe('att-1');

    api
      .upload(ORG, 'deviation', DEV, file, { sha256: ABC_SHA, created: error!.created })
      .subscribe();
    await tick();
    http.expectNone(`${BASE}/v1/orgs/${ORG}/attachments`);
    FakeXhr.instances[1].respond(200);
    http.expectOne(`${BASE}/v1/orgs/${ORG}/attachments/att-1/complete`).flush(attachment());
  });

  it('a 422 on complete is reported as a complete-phase failure', async () => {
    const file = new File(['abc'], 'a.pdf', { type: 'application/pdf' });
    let error: AttachmentUploadError | undefined;
    api.upload(ORG, 'deviation', DEV, file, { sha256: ABC_SHA, created: created() }).subscribe({
      error: (e: AttachmentUploadError) => (error = e),
    });
    await tick();
    FakeXhr.instances[0].respond(200);
    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/attachments/att-1/complete`)
      .flush({ detail: 'mismatch' }, { status: 422, statusText: 'Unprocessable' });
    expect(error?.phase).toBe('complete');
    expect(error?.status).toBe(422);
    expect(error?.created).not.toBeNull();
  });

  it('unsubscribing aborts the storage PUT (cancel)', async () => {
    const file = new File(['abc'], 'a.pdf', { type: 'application/pdf' });
    const sub = api
      .upload(ORG, 'deviation', DEV, file, { sha256: ABC_SHA, created: created() })
      .subscribe();
    await tick();
    sub.unsubscribe();
    expect(FakeXhr.instances[0].aborted).toBe(true);
  });
});

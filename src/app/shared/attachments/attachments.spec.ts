import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { FakeXhr, attachment, nextRequest } from '../../core/attachments/attachments.testing';
import { CreateAttachmentResponse } from '../../core/attachments/attachment.models';
import { STORAGE_XHR_FACTORY } from '../../core/attachments/storage-upload';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Attachments } from './attachments';

const BASE = 'http://test/api';
const ORG = 'org-1';
const DEV = 'dev-1';
const LIST_URL = `${BASE}/v1/orgs/${ORG}/attachments`;

const tick = () => new Promise((resolve) => setTimeout(resolve));

function createdResponse(): CreateAttachmentResponse {
  return {
    attachment: attachment({ id: 'att-new', filename: 'new.pdf', status: 'pending' }),
    upload: {
      url: 'https://bucket.s3.amazonaws.com/k?sig=1',
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf', 'x-amz-checksum-sha256': 'x' },
      expires_at: '2099-01-01T00:00:00Z',
    },
  };
}

function setup(canEdit = true, compact = false) {
  FakeXhr.instances = [];
  TestBed.configureTestingModule({
    imports: [Attachments, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal(ORG).asReadonly() },
      },
      { provide: STORAGE_XHR_FACTORY, useValue: () => new FakeXhr() },
    ],
  });
  const fixture: ComponentFixture<Attachments> = TestBed.createComponent(Attachments);
  const ref = fixture.componentRef as ComponentRef<Attachments>;
  ref.setInput('entityType', 'deviation');
  ref.setInput('entityId', DEV);
  ref.setInput('canEdit', canEdit);
  ref.setInput('compact', compact);
  const http = TestBed.inject(HttpTestingController);
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

async function render(fixture: ComponentFixture<Attachments>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
}

function expectList(http: HttpTestingController) {
  return http.expectOne((r) => r.url === LIST_URL && r.method === 'GET');
}

describe('Attachments', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists attachments and shows the uploader to editors', async () => {
    const { fixture, http, el } = setup(true);
    await render(fixture);
    const req = expectList(http);
    expect(req.request.params.get('entity_type')).toBe('deviation');
    req.flush([attachment()]);
    await render(fixture);

    expect(el.textContent).toContain('evidence.pdf');
    expect(el.textContent).toContain('Ada');
    expect(el.querySelector('[data-testid="attachments-dropzone"]')).not.toBeNull();
  });

  it('hides attach and delete from readers', async () => {
    const { fixture, http, el } = setup(false);
    await render(fixture);
    expectList(http).flush([attachment()]);
    await render(fixture);

    expect(el.textContent).toContain('evidence.pdf');
    expect(el.querySelector('[data-testid="attachments-dropzone"]')).toBeNull();
    expect(el.querySelector('[aria-label^="attachments.deleteNamed"]')).toBeNull();
  });

  it('uploads a file end to end and adds it to the list', async () => {
    const { fixture, http, el } = setup(true);
    await render(fixture);
    expectList(http).flush([]);

    fixture.componentInstance.addFiles([new File(['abc'], 'new.pdf', { type: 'application/pdf' })]);
    (await nextRequest(http, (r) => r.url === LIST_URL && r.method === 'POST')).flush(
      createdResponse(),
    );
    await render(fixture);
    expect(el.querySelector('[role="progressbar"]')).not.toBeNull();

    FakeXhr.instances[0].respond(200);
    http
      .expectOne(`${LIST_URL}/att-new/complete`)
      .flush(attachment({ id: 'att-new', filename: 'new.pdf' }));
    await render(fixture);

    expect(el.querySelector('[data-testid="attachments-uploads"]')).toBeNull();
    expect(el.textContent).toContain('new.pdf');
  });

  it('shows a translated error without retry for a refused file type (415)', async () => {
    const { fixture, http, el } = setup(true);
    await render(fixture);
    expectList(http).flush([]);

    fixture.componentInstance.addFiles([new File(['abc'], 'a.pdf', { type: 'application/pdf' })]);
    (await nextRequest(http, (r) => r.url === LIST_URL && r.method === 'POST')).flush(
      { detail: 'nope' },
      { status: 415, statusText: 'Unsupported' },
    );
    await render(fixture);

    const uploads = el.querySelector('[data-testid="attachments-uploads"]');
    expect(uploads?.textContent).toContain('attachments.errors.typeNotAllowed');
    expect(uploads?.textContent).not.toContain('attachments.retry');
  });

  it('shows a translated error without retry when create is forbidden (403)', async () => {
    const { fixture, http, el } = setup(true);
    await render(fixture);
    expectList(http).flush([]);

    fixture.componentInstance.addFiles([new File(['abc'], 'a.pdf', { type: 'application/pdf' })]);
    (await nextRequest(http, (r) => r.url === LIST_URL && r.method === 'POST')).flush(
      { detail: 'nope' },
      { status: 403, statusText: 'Forbidden' },
    );
    await render(fixture);

    const uploads = el.querySelector('[data-testid="attachments-uploads"]');
    expect(uploads?.textContent).toContain('attachments.errors.forbidden');
    expect(uploads?.textContent).not.toContain('attachments.retry');
  });

  it('offers retry after a verification mismatch (422 on complete) and resumes without re-creating', async () => {
    const { fixture, http, el } = setup(true);
    await render(fixture);
    expectList(http).flush([]);

    fixture.componentInstance.addFiles([new File(['abc'], 'new.pdf', { type: 'application/pdf' })]);
    (await nextRequest(http, (r) => r.url === LIST_URL && r.method === 'POST')).flush(
      createdResponse(),
    );
    FakeXhr.instances[0].respond(200);
    http
      .expectOne(`${LIST_URL}/att-new/complete`)
      .flush({ detail: 'mismatch' }, { status: 422, statusText: 'Unprocessable' });
    await render(fixture);

    const uploads = el.querySelector('[data-testid="attachments-uploads"]')!;
    expect(uploads.textContent).toContain('attachments.errors.verifyFailed');
    const retry = Array.from(uploads.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('attachments.retry'),
    )!;
    retry.click();
    await tick();
    http.expectNone((r) => r.url === LIST_URL && r.method === 'POST');
    expect(FakeXhr.instances).toHaveLength(2);
    FakeXhr.instances[1].respond(200);
    http
      .expectOne(`${LIST_URL}/att-new/complete`)
      .flush(attachment({ id: 'att-new', filename: 'new.pdf' }));
    await render(fixture);
    expect(el.textContent).toContain('new.pdf');
  });

  it('quietly hides the uploader when storage is not set up (503)', async () => {
    const { fixture, http, el } = setup(true);
    await render(fixture);
    expectList(http).flush([]);

    fixture.componentInstance.addFiles([new File(['abc'], 'a.pdf', { type: 'application/pdf' })]);
    (await nextRequest(http, (r) => r.url === LIST_URL && r.method === 'POST')).flush(
      { detail: 'not configured' },
      { status: 503, statusText: 'Unavailable' },
    );
    await render(fixture);

    expect(el.querySelector('[data-testid="attachments-dropzone"]')).toBeNull();
    expect(el.querySelector('[data-testid="attachments-uploads"]')).toBeNull();
    expect(el.querySelector('[data-testid="attachments-unavailable"]')?.textContent).toContain(
      'attachments.unavailable',
    );
    expect(el.querySelector('[role="alert"]')).toBeNull();

    // Further files are ignored while unavailable.
    fixture.componentInstance.addFiles([new File(['abc'], 'b.pdf', { type: 'application/pdf' })]);
    await tick();
    http.expectNone((r) => r.method === 'POST');
  });

  it('rejects blocked extensions before contacting the server', async () => {
    const { fixture, http, el } = setup(true);
    await render(fixture);
    expectList(http).flush([]);

    fixture.componentInstance.addFiles([new File(['x'], 'run.exe')]);
    await tick();
    await render(fixture);
    http.expectNone((r) => r.method === 'POST');
    expect(el.textContent).toContain('attachments.errors.typeNotAllowed');
  });

  it('compact variant renders nothing for readers when there are no files', async () => {
    const { fixture, http, el } = setup(false, true);
    await render(fixture);
    expectList(http).flush([]);
    await render(fixture);
    expect(el.textContent?.trim()).toBe('');
  });
});

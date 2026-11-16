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
import { Attachments, SCAN_POLL_MS } from './attachments';

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

function setup(canEdit = true, compact = false, permissions: readonly string[] = []) {
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
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, permissions }).asReadonly(),
        },
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

  it('explains a closed deviation (409 deviation_closed) without retry', async () => {
    const { fixture, http, el } = setup(true);
    await render(fixture);
    expectList(http).flush([]);

    fixture.componentInstance.addFiles([new File(['abc'], 'a.pdf', { type: 'application/pdf' })]);
    (await nextRequest(http, (r) => r.url === LIST_URL && r.method === 'POST')).flush(
      { detail: { code: 'deviation_closed' } },
      { status: 409, statusText: 'Conflict' },
    );
    await render(fixture);

    const uploads = el.querySelector('[data-testid="attachments-uploads"]');
    expect(uploads?.textContent).toContain('attachments.errors.deviationClosed');
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

  describe('malware scan and content checks (S04)', () => {
    afterEach(() => vi.useRealTimers());

    function nameButton(el: HTMLElement, name: string): HTMLButtonElement {
      return Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === name,
      )!;
    }

    it('badges a quarantined file and never requests a download for it', async () => {
      const { fixture, http, el } = setup(false);
      await render(fixture);
      expectList(http).flush([
        attachment({ id: 'bad', filename: 'eicar.txt', status: 'quarantined' }),
      ]);
      await render(fixture);

      expect(el.querySelector('[data-testid="attachment-scan-state"]')?.textContent).toContain(
        'attachments.scan.quarantined',
      );
      const name = nameButton(el, 'eicar.txt');
      expect(name.disabled).toBe(true);
      name.click();
      (fixture.componentInstance as unknown as { download(a: unknown): void }).download(
        attachment({ id: 'bad', status: 'quarantined' }),
      );
      await tick();
      http.expectNone(`${LIST_URL}/bad/download`);
    });

    it('badges a file being scanned, then re-reads the list until it is clean', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { fixture, http, el } = setup(false);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(0);
      expectList(http).flush([attachment({ id: 'a', filename: 'scan.pdf', status: 'scanning' })]);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="attachment-scan-state"]')?.textContent).toContain(
        'attachments.scan.scanning',
      );
      expect(nameButton(el, 'scan.pdf').disabled).toBe(true);

      await vi.advanceTimersByTimeAsync(SCAN_POLL_MS);
      expectList(http).flush([attachment({ id: 'a', filename: 'scan.pdf' })]);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="attachment-scan-state"]')).toBeNull();
      expect(nameButton(el, 'scan.pdf').disabled).toBe(false);
      // Settled: no further polling.
      await vi.advanceTimersByTimeAsync(SCAN_POLL_MS * 2);
      http.expectNone((r) => r.url === LIST_URL);
    });

    it('explains a download refused because the file is still being scanned (409)', async () => {
      const { fixture, http, el } = setup(false);
      await render(fixture);
      expectList(http).flush([attachment()]);
      await render(fixture);

      nameButton(el, 'evidence.pdf').click();
      http
        .expectOne(`${LIST_URL}/att-1/download`)
        .flush(
          { detail: { code: 'attachment_scanning', message: 'x' } },
          { status: 409, statusText: 'Conflict' },
        );
      // The list is re-read to show the current state.
      expectList(http).flush([attachment({ status: 'scanning' })]);
      await render(fixture);

      expect(el.querySelector('[role="alert"]')?.textContent).toContain(
        'attachments.errors.stillScanning',
      );
      expect(el.querySelector('[data-testid="attachment-scan-state"]')).not.toBeNull();
    });

    it('rejects a file whose content is a program (415 executable_content on complete) without retry', async () => {
      const { fixture, http, el } = setup(true);
      await render(fixture);
      expectList(http).flush([]);

      fixture.componentInstance.addFiles([
        new File(['MZ'], 'report.docx', { type: 'application/msword' }),
      ]);
      (await nextRequest(http, (r) => r.url === LIST_URL && r.method === 'POST')).flush(
        createdResponse(),
      );
      FakeXhr.instances[0].respond(200);
      http
        .expectOne(`${LIST_URL}/att-new/complete`)
        .flush(
          { detail: { code: 'executable_content', message: 'x' } },
          { status: 415, statusText: 'Unsupported' },
        );
      await render(fixture);

      const uploads = el.querySelector('[data-testid="attachments-uploads"]')!;
      expect(uploads.textContent).toContain('attachments.errors.executableContent');
      expect(uploads.textContent).not.toContain('attachments.retry');
      expect(el.textContent).not.toContain('new.pdf');
    });

    it('explains a refused macro-enabled file (415 macro_blocked on create)', async () => {
      const { fixture, http, el } = setup(true);
      await render(fixture);
      expectList(http).flush([]);

      fixture.componentInstance.addFiles([new File(['abc'], 'budget.xlsm')]);
      (await nextRequest(http, (r) => r.url === LIST_URL && r.method === 'POST')).flush(
        { detail: { code: 'macro_blocked', message: 'x' } },
        { status: 415, statusText: 'Unsupported' },
      );
      await render(fixture);

      const uploads = el.querySelector('[data-testid="attachments-uploads"]')!;
      expect(uploads.textContent).toContain('attachments.errors.macroBlocked');
      expect(uploads.textContent).not.toContain('attachments.retry');
    });

    it('lists an upload the scanner quarantined, badged and with a warning', async () => {
      const { fixture, http, el } = setup(true);
      await render(fixture);
      expectList(http).flush([]);

      fixture.componentInstance.addFiles([
        new File(['abc'], 'new.pdf', { type: 'application/pdf' }),
      ]);
      (await nextRequest(http, (r) => r.url === LIST_URL && r.method === 'POST')).flush(
        createdResponse(),
      );
      FakeXhr.instances[0].respond(200);
      http
        .expectOne(`${LIST_URL}/att-new/complete`)
        .flush(attachment({ id: 'att-new', filename: 'new.pdf', status: 'quarantined' }));
      await render(fixture);

      expect(el.querySelector('[role="alert"]')?.textContent).toContain(
        'attachments.errors.uploadQuarantined',
      );
      expect(nameButton(el, 'new.pdf').disabled).toBe(true);
    });
  });

  describe('legal hold (S04)', () => {
    it('is hidden from users without org:manage', async () => {
      const { fixture, http, el } = setup(true);
      await render(fixture);
      expectList(http).flush([attachment()]);
      await render(fixture);
      expect(el.querySelector('[data-testid="attachment-hold-toggle"]')).toBeNull();
    });

    it('is hidden on the compact chips even for admins', async () => {
      const { fixture, http, el } = setup(true, true, ['org:manage']);
      await render(fixture);
      expectList(http).flush([attachment()]);
      await render(fixture);
      expect(el.querySelector('[data-testid="attachment-hold-toggle"]')).toBeNull();
    });

    it('lets an org admin set a hold and shows the badge', async () => {
      const { fixture, http, el } = setup(false, false, ['org:manage']);
      await render(fixture);
      expectList(http).flush([attachment()]);
      await render(fixture);

      el.querySelector<HTMLButtonElement>('[data-testid="attachment-hold-toggle"]')!.click();
      const put = http.expectOne(`${LIST_URL}/att-1/legal-hold`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ legal_hold: true });
      put.flush(attachment({ legal_hold: true }));
      await render(fixture);

      expect(el.querySelector('[data-testid="attachment-hold"]')?.textContent).toContain(
        'attachments.hold.badge',
      );
      expect(el.querySelector('[data-testid="attachment-hold-toggle"]')?.textContent).toContain(
        'attachments.hold.release',
      );
    });

    it('explains a hold on a file that is already purged (409 already_purged)', async () => {
      const { fixture, http, el } = setup(false, false, ['org:manage']);
      await render(fixture);
      expectList(http).flush([attachment()]);
      await render(fixture);

      el.querySelector<HTMLButtonElement>('[data-testid="attachment-hold-toggle"]')!.click();
      http
        .expectOne(`${LIST_URL}/att-1/legal-hold`)
        .flush({ detail: { code: 'already_purged' } }, { status: 409, statusText: 'Conflict' });
      await render(fixture);

      expect(el.querySelector('[role="alert"]')?.textContent).toContain(
        'attachments.errors.alreadyPurged',
      );
    });
  });

  it('compact variant renders nothing for readers when there are no files', async () => {
    const { fixture, http, el } = setup(false, true);
    await render(fixture);
    expectList(http).flush([]);
    await render(fixture);
    expect(el.textContent?.trim()).toBe('');
  });
});

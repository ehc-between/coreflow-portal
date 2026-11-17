import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OrgAttachmentSettings } from './org-attachment-settings';

const BASE = 'http://test/api';
const ORG = 'org-1';
const URL = `${BASE}/v1/orgs/${ORG}/settings`;

async function setup(settings: Record<string, unknown>) {
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [OrgAttachmentSettings, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: NotificationService, useValue: toasts },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal(ORG).asReadonly() } },
    ],
  });
  const fixture = TestBed.createComponent(OrgAttachmentSettings);
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  const get = http.expectOne(URL);
  expect(get.request.method).toBe('GET');
  get.flush(settings);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const toggle = () => root.querySelector<HTMLButtonElement>('[data-testid="macro-switch"]')!;
  return { fixture, http, toasts, toggle };
}

describe('OrgAttachmentSettings', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows the loaded macro setting', async () => {
    const { toggle } = await setup({
      require_document_segregation: false,
      allow_macro_attachments: true,
    });
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('treats a server without the setting as off (fail closed)', async () => {
    const { toggle } = await setup({ require_document_segregation: true });
    expect(toggle().getAttribute('aria-checked')).toBe('false');
  });

  it('PUTs only the macro field and keeps what the server saved', async () => {
    const { fixture, http, toasts, toggle } = await setup({
      require_document_segregation: true,
      allow_macro_attachments: false,
    });
    toggle().click();
    await fixture.whenStable();

    const put = http.expectOne(URL);
    expect(put.request.method).toBe('PUT');
    // Never resends other settings, so it can't clobber a concurrent change.
    expect(put.request.body).toEqual({ allow_macro_attachments: true });
    expect(toggle().disabled).toBe(true);
    put.flush({ require_document_segregation: true, allow_macro_attachments: true });
    await fixture.whenStable();

    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(toasts.success).toHaveBeenCalledWith('settings.attachments.saved');
  });

  it('reverts and reports when the save fails', async () => {
    const { fixture, http, toasts, toggle } = await setup({
      require_document_segregation: false,
      allow_macro_attachments: false,
    });
    toggle().click();
    await fixture.whenStable();

    http.expectOne(URL).flush(null, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();

    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(toasts.error).toHaveBeenCalledWith('settings.attachments.saveFailed');
  });
});

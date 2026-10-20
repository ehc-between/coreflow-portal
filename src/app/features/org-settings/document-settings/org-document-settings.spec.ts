import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OrgDocumentSettings } from './org-document-settings';

const BASE = 'http://test/api';
const ORG = 'org-1';
const URL = `${BASE}/v1/orgs/${ORG}/settings`;

async function setup(initial: boolean) {
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [OrgDocumentSettings, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: NotificationService, useValue: toasts },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal(ORG).asReadonly() } },
    ],
  });
  const fixture = TestBed.createComponent(OrgDocumentSettings);
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  const get = http.expectOne(URL);
  expect(get.request.method).toBe('GET');
  get.flush({ require_document_segregation: initial });
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const toggle = () => root.querySelector<HTMLButtonElement>('[data-testid="segregation-switch"]')!;
  return { fixture, http, toasts, toggle };
}

describe('OrgDocumentSettings', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows the loaded segregation setting', async () => {
    const { toggle } = await setup(true);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('PUTs the flipped value and keeps what the server saved', async () => {
    const { fixture, http, toasts, toggle } = await setup(false);
    toggle().click();
    await fixture.whenStable();

    const put = http.expectOne(URL);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ require_document_segregation: true });
    expect(toggle().disabled).toBe(true);
    put.flush({ require_document_segregation: true });
    await fixture.whenStable();

    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(toggle().disabled).toBe(false);
    expect(toasts.success).toHaveBeenCalledWith('settings.documents.saved');
  });

  it('reverts and reports when the save fails', async () => {
    const { fixture, http, toasts, toggle } = await setup(true);
    toggle().click();
    await fixture.whenStable();

    http.expectOne(URL).flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(toasts.error).toHaveBeenCalledWith('settings.documents.saveFailed');
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import rootEn from '../../../../assets/i18n/en.json';
import en from '../../../../assets/i18n/outputs/en.json';
import { APP_CONFIG } from '../../../core/config/app-config';
import { Branding } from '../../../core/outputs/outputs.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { BrandingPage } from './branding-page';

const BASE = 'http://test/api';
const ROOT = `${BASE}/v1/orgs/org-1/settings/branding`;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const BRANDING: Branding = {
  accent_color: null,
  footer_text: 'Acme AS',
  classification: 'internal',
  default_lang: null,
  has_logo: false,
  logo_url: null,
  classifications: ['public', 'internal', 'confidential', 'restricted'],
  default_accent: '#1f6feb',
  updated_at: null,
};

describe('BrandingPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en: rootEn, 'outputs/en': en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: BASE, i18n: { availableLanguages: ['en'] } },
        },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal('org-1').asReadonly(),
            currentOrg: signal({
              id: 'org-1',
              name: 'Org',
              roles: [],
              permissions: ['org:manage'],
            }).asReadonly(),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only the changed fields, and null to clear one', async () => {
    const fixture = TestBed.createComponent(BrandingPage);
    fixture.detectChanges();
    http.expectOne(ROOT).flush(BRANDING);
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const footer = el.querySelector('[data-testid="branding-footer"]') as HTMLTextAreaElement;
    footer.value = '  ';
    footer.dispatchEvent(new Event('input'));
    const accent = el.querySelector('[data-testid="branding-accent"]') as HTMLInputElement;
    accent.value = '#123abc';
    accent.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (el.querySelector('[data-testid="branding-save"] button') as HTMLButtonElement).click();
    const req = http.expectOne(ROOT);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ accent_color: '#123abc', footer_text: null });
    req.flush({ ...BRANDING, accent_color: '#123abc', footer_text: null });
  });

  it('blocks an invalid colour and an oversized logo before calling the server', async () => {
    const fixture = TestBed.createComponent(BrandingPage);
    fixture.detectChanges();
    http.expectOne(ROOT).flush(BRANDING);
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const accent = el.querySelector('[data-testid="branding-accent"]') as HTMLInputElement;
    accent.value = 'blue';
    accent.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(
      (el.querySelector('[data-testid="branding-save"] button') as HTMLButtonElement).disabled,
    ).toBe(true);

    const input = el.querySelector('[data-testid="branding-logo-input"]') as HTMLInputElement;
    const big = new File([new Uint8Array(600 * 1024)], 'logo.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [big] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="branding-logo-error"]')?.textContent).toContain(
      'too large',
    );
  });
});

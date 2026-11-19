import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import rootEn from '../../../assets/i18n/en.json';
import en from '../../../assets/i18n/outputs/en.json';
import { APP_CONFIG } from '../../core/config/app-config';
import { Output } from '../../core/outputs/outputs.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RegisterExport, registerExportFilters, registerOutputKey } from './register-export';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function output(overrides: Partial<Output> = {}): Output {
  return {
    key: 'register.processes',
    module: 'processes',
    kind: 'register_export',
    title: { en: 'Processes', nb: 'Prosesser' },
    description: { en: 'The register.', nb: 'Registeret.' },
    audience: ['auditor'],
    clauses: [],
    permission: 'processes:read',
    formats: ['xlsx', 'csv', 'pdf'],
    default_format: 'xlsx',
    subject: 'org',
    entity_type: null,
    frameworks: [],
    evidence: false,
    route: null,
    register_key: 'processes',
    has_preflight: false,
    generates: true,
    filter_params: ['q', 'status', 'from', 'to'],
    statuses: ['draft', 'active', 'retired'],
    readiness: { ready: true, missing: 0, recommended: 0 },
    last: null,
    ...overrides,
  };
}

describe('registerExportFilters', () => {
  it('keeps only the filters and statuses the register accepts', () => {
    const out = output();
    expect(
      registerExportFilters(out, { q: '  lager ', status: 'active', severity: 'high' } as never),
    ).toEqual({ q: 'lager', status: ['active'] });
    // A list-only status ("open" = several statuses) is not sent.
    expect(registerExportFilters(out, { q: '', status: 'open' })).toEqual({});
    expect(registerExportFilters(out, { status: ['draft', 'x'] })).toEqual({ status: ['draft'] });
    expect(
      registerExportFilters(output({ filter_params: ['q'] }), { q: 'a', status: 'active' }),
    ).toEqual({ q: 'a' });
    expect(registerExportFilters(out, { from: new Date('2026-01-02T03:04:05Z') })).toEqual({
      from: '2026-01-02T03:04:05',
    });
    expect(registerExportFilters(out, null)).toEqual({});
    expect(registerOutputKey('risk_register')).toBe('register.risk_register');
  });
});

@Component({
  imports: [RegisterExport],
  template: `<app-register-export register="processes" [filters]="{ q: 'x' }" />`,
})
class Host {}

describe('RegisterExport', () => {
  function setup() {
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
            currentOrgId: signal(ORG).asReadonly(),
            currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions: [] }).asReadonly(),
          },
        },
      ],
    });
    return TestBed.inject(HttpTestingController);
  }

  it('shows "Export" for the register output and opens the dialog with its filters', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await tick();
    http.expectOne(`${ROOT}/outputs/register.processes`).flush(output());
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector(
      '[data-testid="register-export-processes"]',
    ) as HTMLButtonElement;
    expect(button.textContent).toContain('Export');
    button.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-generate-dialog')).not.toBeNull();
    http.match(() => true).forEach((req) => req.flush({}));
    http.verify({ ignoreCancelled: true });
  });

  it('shows nothing when the user may not make the export', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await tick();
    http
      .expectOne(`${ROOT}/outputs/register.processes`)
      .flush({ detail: 'Insufficient permissions' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    http.verify();
  });
});

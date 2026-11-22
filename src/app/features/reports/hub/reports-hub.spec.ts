import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import rootEn from '../../../../assets/i18n/en.json';
import outputsEn from '../../../../assets/i18n/outputs/en.json';
import en from '../../../../assets/i18n/reports/en.json';
import { APP_CONFIG } from '../../../core/config/app-config';
import { ModuleService } from '../../../core/modules/module.service';
import { Output } from '../../../core/outputs/outputs.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { of } from 'rxjs';
import { libraryRootTarget, moved, toReportsWhenReachable } from '../../library/library-redirects';
import { ReportsHub } from './reports-hub';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function output(overrides: Partial<Output> = {}): Output {
  return {
    key: 'privacy.ropa_controller',
    module: 'privacy',
    kind: 'compiled_controlled',
    title: { en: 'Records of processing', nb: 'Protokoll' },
    description: { en: '12 processing activities', nb: '12 behandlinger' },
    audience: ['authority', 'auditor'],
    clauses: [],
    permission: 'privacy:read',
    formats: ['pdf'],
    default_format: 'pdf',
    subject: 'org',
    entity_type: null,
    frameworks: ['gdpr'],
    evidence: false,
    route: null,
    register_key: null,
    has_preflight: true,
    generates: true,
    readiness: { ready: true, missing: 0, recommended: 0 },
    last: null,
    ...overrides,
  };
}

function setup(permissions: string[], modules = ['reports']) {
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en: rootEn, 'reports/en': en, 'outputs/en': outputsEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE, i18n: { availableLanguages: ['en'] } } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
        },
      },
      {
        provide: ModuleService,
        useValue: {
          isEnabled: (key: string) => modules.includes(key),
          enabledKeys: signal(new Set(modules)).asReadonly(),
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('ReportsHub', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists outputs by recipient with status and one action each', async () => {
    const http = setup(['reports:read']);
    const fixture = TestBed.createComponent(ReportsHub);
    fixture.detectChanges();
    await tick();
    http
      .expectOne((r) => r.url === `${ROOT}/outputs` && r.params.get('readiness') === 'true')
      .flush({
        items: [
          output(),
          output({
            key: 'privacy.notice_applicants',
            audience: ['employees'],
            readiness: { ready: false, missing: 1, recommended: 0 },
          }),
          output({ key: 'register.deviations', kind: 'register_export', audience: ['auditor'] }),
        ],
        audiences: [],
        kinds: [],
      });
    http.expectOne((r) => r.url === `${ROOT}/generated-outputs`).flush({ items: [], total: 0 });
    await tick();
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Reports');
    const auditor = el.querySelector('[data-testid="reports-group-auditor"]')!;
    expect(auditor.textContent).toContain('Records of processing');
    expect(auditor.textContent).not.toContain('register.deviations');
    expect(auditor.querySelector('[data-testid="report-status"]')?.textContent).toContain('Ready');
    expect(auditor.querySelector('[data-testid="report-download"]')).not.toBeNull();
    const people = el.querySelector('[data-testid="reports-group-people"]')!;
    expect(people.textContent).toContain('1 missing');
    expect(people.querySelector('[data-testid="report-missing"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="reports-group-board"]')?.textContent).toContain(
      'Nothing to deliver here yet.',
    );
    // Standards workspace only with the standards module.
    expect(el.querySelector('[data-testid="reports-hub-standards"]')).toBeNull();
    const links = [...el.querySelectorAll('[data-testid^="reports-link-"]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toContain('/reports/status');
    expect(links).toContain('/reports/saved');
    expect(links).toContain('/registers');
    expect(links).not.toContain('/settings/branding');
  });

  it('shows one group with ?to= and falls back to /library links without the Reports module', async () => {
    const http = setup([], []);
    const fixture = TestBed.createComponent(ReportsHub);
    fixture.componentRef.setInput('to', 'authority');
    fixture.detectChanges();
    await tick();
    http
      .expectOne((r) => r.url === `${ROOT}/outputs`)
      .flush({
        items: [output()],
        audiences: [],
        kinds: [],
      });
    http.expectOne((r) => r.url === `${ROOT}/generated-outputs`).flush({ items: [], total: 0 });
    await tick();
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelectorAll('[data-testid^="reports-group-"]:not([data-testid$="-empty"])'),
    ).toHaveLength(1);
    expect(el.querySelector('[data-testid="reports-group-authority"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="reports-hub-all"]')).not.toBeNull();
    const links = [...el.querySelectorAll('[data-testid^="reports-link-"]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual(['/library/saved', '/library', '/registers']);
  });
});

describe('library redirects', () => {
  function setupRouter(modules: readonly string[], permissions: readonly string[]): Router {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
          },
        },
        {
          provide: ModuleService,
          useValue: {
            ensureLoaded: () => of(true),
            isEnabled: (key: string) => modules.includes(key),
          },
        },
        provideRouter([
          {
            path: 'library',
            children: [
              {
                path: '',
                pathMatch: 'full',
                canActivate: [toReportsWhenReachable(libraryRootTarget)],
                children: [],
              },
              {
                path: 'generated/:id',
                canActivate: [
                  toReportsWhenReachable((r) => ['/reports/generated', r.params['id']]),
                ],
                children: [],
              },
              {
                path: 'audit-packs/:id',
                redirectTo: moved((p) => ['/reports/audit-packs', p['id']]),
              },
            ],
          },
          { path: 'reports', children: [] },
          { path: 'reports/all', children: [] },
          { path: 'reports/exports', children: [] },
          { path: 'reports/generated/:id', children: [] },
          { path: 'reports/audit-packs/:id', children: [] },
        ]),
      ],
    });
    return TestBed.inject(Router);
  }

  it('sends /library to the hub, the catalogue or exports, keeping the query', async () => {
    const router = setupRouter(['reports'], ['reports:read']);
    await router.navigateByUrl('/library');
    expect(router.url).toBe('/reports');
    await router.navigateByUrl('/library?module=privacy');
    expect(router.url).toBe('/reports/all?module=privacy');
    await router.navigateByUrl('/library?kind=register_export&register=x');
    expect(router.url).toBe('/reports/exports?kind=register_export&register=x');
    await router.navigateByUrl('/library/generated/g1');
    expect(router.url).toBe('/reports/generated/g1');
    await router.navigateByUrl('/library/audit-packs/p1?flow=t');
    expect(router.url).toBe('/reports/audit-packs/p1?flow=t');
  });

  it('keeps serving the old page without the Reports module or reports:read', async () => {
    let router = setupRouter([], ['reports:read']);
    await router.navigateByUrl('/library/generated/g1');
    expect(router.url).toBe('/library/generated/g1');
    TestBed.resetTestingModule();
    router = setupRouter(['reports'], []);
    await router.navigateByUrl('/library?module=privacy');
    expect(router.url).toBe('/library?module=privacy');
  });
});

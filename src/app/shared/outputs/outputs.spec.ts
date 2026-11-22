import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import rootEn from '../../../assets/i18n/en.json';
import rootNb from '../../../assets/i18n/nb.json';
import en from '../../../assets/i18n/outputs/en.json';
import nb from '../../../assets/i18n/outputs/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { APP_CONFIG } from '../../core/config/app-config';
import { ModuleService } from '../../core/modules/module.service';
import { OutputsApi } from '../../core/outputs/outputs-api';
import {
  CLASSIFICATIONS,
  GeneratedOutput,
  OUTPUT_AUDIENCES,
  OUTPUT_FORMATS,
  OUTPUT_KINDS,
  OUTPUT_LANGS,
  Output,
  PreflightItem,
} from '../../core/outputs/outputs.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { REPORTS_REDIRECTS } from '../../features/library/library-redirects';
import { PageHeader } from '../ui/page-header/page-header';
import { GenerateDialog } from './generate-dialog';
import { LIBRARY_SECTIONS } from './library-nav';
import { OutputCard } from './output-card';
import { OutputsPanel } from './outputs-panel';
import {
  OUTPUT_ERROR_CODES,
  clauseText,
  defaultFormat,
  defaultOutputLang,
  fileSize,
  groupByAudience,
  localized,
  outputErrorKey,
  preflightFromError,
  sortPreflight,
} from './output-display';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

type Tree = Record<string, unknown>;
const lookup = (tree: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);

function output(overrides: Partial<Output> = {}): Output {
  return {
    key: 'register.deviations',
    module: 'deviations',
    kind: 'register_export',
    title: { en: 'Deviation log', nb: 'Avvikslogg' },
    description: { en: 'Every deviation.', nb: 'Alle avvik.' },
    audience: ['auditor'],
    clauses: [
      {
        ref: 'iso9001:10.2',
        framework: 'iso9001',
        number: '10.2',
        label: { en: 'ISO 9001 10.2', nb: 'ISO 9001 10.2' },
      },
    ],
    permission: 'deviations:read',
    formats: ['pdf', 'xlsx'],
    default_format: 'xlsx',
    subject: 'org',
    entity_type: null,
    frameworks: ['iso9001'],
    evidence: false,
    route: null,
    register_key: 'deviations',
    has_preflight: true,
    generates: true,
    readiness: { ready: true, missing: 0, recommended: 0 },
    last: null,
    ...overrides,
  };
}

function generated(overrides: Partial<GeneratedOutput> = {}): GeneratedOutput {
  return {
    id: 'gen-1',
    output_key: 'register.deviations',
    output_title: { en: 'Deviation log', nb: 'Avvikslogg' },
    module: 'deviations',
    kind: 'register_export',
    title: 'Avvikslogg',
    version: 2,
    status: 'final',
    origin: 'user',
    format: 'pdf',
    lang: 'nb',
    file_name: 'avvikslogg-v2.pdf',
    size_bytes: 2048,
    sha256: 'abc',
    rows: 4,
    standard_key: null,
    subject_type: 'org',
    subject_id: null,
    params: {},
    preflight: [],
    has_gaps: false,
    ai_draft: false,
    clauses: [],
    evidence_for: [],
    current: true,
    superseded_at: null,
    generated_at: '2026-11-18T10:00:00Z',
    generated_by: { id: 'u1', name: 'Kari' },
    url: '/library/generated/gen-1',
    download_url: '/api/v1/orgs/org-1/generated-outputs/gen-1/download',
    ...overrides,
  };
}

function item(overrides: Partial<PreflightItem> = {}): PreflightItem {
  return {
    key: 'owner',
    label: 'Every deviation has an owner',
    severity: 'required',
    met: true,
    outcome: 'met',
    message: '',
    url: null,
    counts: {},
    samples: [],
    ...overrides,
  };
}

let activeHttp: HttpTestingController | null = null;

function configure(permissions: string[] = ['dashboard:view']) {
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
        useValue: { enabledKeys: signal(new Set(['reports', 'documents'])).asReadonly() },
      },
    ],
  });
  activeHttp = TestBed.inject(HttpTestingController);
  return activeHttp;
}

afterEach(() => {
  activeHttp?.verify();
  activeHttp = null;
});

describe('output display helpers', () => {
  it('picks the language, falling back to English', () => {
    expect(localized({ en: 'Log', nb: 'Logg' }, 'nb')).toBe('Logg');
    expect(localized({ en: 'Log' }, 'nb')).toBe('Log');
    expect(localized(null, 'nb')).toBe('');
    expect(defaultOutputLang('en')).toBe('en');
    expect(defaultOutputLang('sv')).toBe('nb');
    expect(defaultFormat(output())).toBe('xlsx');
    expect(defaultFormat(output({ default_format: null }))).toBe('pdf');
  });

  it('groups outputs under their first audience, in the fixed order', () => {
    const groups = groupByAudience([
      output({ key: 'a', audience: ['board', 'auditor'] }),
      output({ key: 'b', audience: ['authority'] }),
      output({ key: 'c', audience: ['auditor'] }),
    ]);
    expect(groups.map((g) => g.audience)).toEqual(['auditor', 'authority', 'board']);
    expect(groups[0].items.map((o) => o.key)).toEqual(['c']);
  });

  it('shows clauses as readers know them and sorts unmet required checks first', () => {
    expect(
      clauseText({ ref: 'gdpr:30', framework: 'gdpr', number: '30', label: { en: '' } }, 'nb'),
    ).toBe('gdpr 30');
    const sorted = sortPreflight([
      item({ key: 'ok' }),
      item({ key: 'rec', met: false, severity: 'recommended' }),
      item({ key: 'req', met: false }),
    ]);
    expect(sorted.map((i) => i.key)).toEqual(['req', 'rec', 'ok']);
    expect(fileSize(2048, 'en')).toBe('2 KB');
  });

  it('maps coded errors to output keys and never shows backend text', () => {
    const coded = (status: number, code: string, extra = {}) =>
      new HttpErrorResponse({ status, error: { detail: { code, ...extra } } });
    expect(outputErrorKey(coded(409, 'standard_not_enabled'))).toBe(
      'outputs.errors.standard_not_enabled',
    );
    expect(outputErrorKey(new HttpErrorResponse({ status: 403 }))).toBe('outputs.errors.forbidden');
    const items = [item({ met: false })];
    expect(preflightFromError(coded(409, 'preflight_incomplete', { missing: 1, items }))).toEqual(
      items,
    );
    expect(preflightFromError(coded(409, 'output_has_own_flow'))).toBeNull();
  });
});

describe('outputs i18n', () => {
  it('has the same keys in en and nb', () => {
    expectKeyParity(en, nb);
  });

  it('has a label for every audience, kind, format, language, classification and error', () => {
    const keys = [
      ...OUTPUT_AUDIENCES.flatMap((a) => [`groups.${a}`, `audiences.${a}`]),
      ...OUTPUT_KINDS.map((k) => `kinds.${k}`),
      ...OUTPUT_FORMATS.map((f) => `formats.${f}`),
      ...OUTPUT_LANGS.map((l) => `langs.${l}`),
      ...CLASSIFICATIONS.map((c) => `classification.${c}`),
      ...OUTPUT_ERROR_CODES.map((c) => `errors.${c}`),
      'errors.forbidden',
      ...LIBRARY_SECTIONS.map((s) => s.labelKey.replace(/^outputs\./, '')),
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(nb, key), `nb ${key}`).toBe('string');
    }
    for (const root of [rootEn, rootNb]) {
      expect(typeof lookup(root, 'nav.library')).toBe('string');
      expect(typeof lookup(root, 'modules.entities.generated_output')).toBe('string');
      expect(typeof lookup(root, 'settings.hub.cards.branding')).toBe('string');
    }
  });

  it('uses the agreed Norwegian terms and no vendor names', () => {
    expect(nb.actions.make).toBe('Lag dokument');
    expect(nb.actions.makeAnyway).toBe('Lag likevel');
    expect(nb.preflight.fix).toBe('Fyll ut nå');
    expect(nb.classification).toEqual({
      public: 'Åpen',
      internal: 'Intern',
      confidential: 'Fortrolig',
      restricted: 'Strengt fortrolig',
    });
    const text = JSON.stringify([en, nb]);
    expect(text).not.toMatch(/claude|anthropic|gpt|openai/i);
  });
});

describe('OutputsApi', () => {
  it('calls the org-scoped endpoints', () => {
    const http = configure();
    const api = TestBed.inject(OutputsApi);
    api.list(ORG, { module: 'privacy', readiness: true }).subscribe();
    const list = http.expectOne((r) => r.url === `${ROOT}/outputs`);
    expect(list.request.params.get('module')).toBe('privacy');
    expect(list.request.params.get('readiness')).toBe('true');
    list.flush({ items: [], audiences: [], kinds: [] });

    api.generate(ORG, 'register.deviations', { format: 'pdf', accept_gaps: true }).subscribe();
    const gen = http.expectOne(`${ROOT}/outputs/register.deviations/generate`);
    expect(gen.request.method).toBe('POST');
    expect(gen.request.body).toEqual({ format: 'pdf', accept_gaps: true });
    gen.flush(generated());

    api.download(ORG, 'gen-1').subscribe();
    const dl = http.expectOne(`${ROOT}/generated-outputs/gen-1/download`);
    expect(dl.request.responseType).toBe('blob');
    dl.flush(new Blob(['x']));

    const logo = new Blob(['png'], { type: 'image/png' });
    api.uploadLogo(ORG, logo).subscribe();
    const put = http.expectOne(`${ROOT}/settings/branding/logo`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toBe(logo);
    put.flush({});

    api.updateBranding(ORG, { footer_text: null }).subscribe();
    const patch = http.expectOne(`${ROOT}/settings/branding`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ footer_text: null });
    patch.flush({});
  });
});

describe('GenerateDialog', () => {
  async function open(out: Output) {
    const http = configure();
    const fixture = TestBed.createComponent(GenerateDialog);
    fixture.componentRef.setInput('output', out);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('runs the preflight, then makes the document', async () => {
    const { http, fixture, el } = await open(output());
    const check = http.expectOne(`${ROOT}/outputs/register.deviations/preflight`);
    expect(check.request.body.lang).toBe('en');
    check.flush({
      output_key: 'x',
      lang: 'en',
      ready: true,
      missing: 0,
      recommended: 0,
      items: [item()],
    });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="preflight-ready"]')).not.toBeNull();

    (el.querySelector('[data-testid="generate-submit"] button') as HTMLButtonElement).click();
    const gen = http.expectOne(`${ROOT}/outputs/register.deviations/generate`);
    expect(gen.request.body).toEqual(
      expect.objectContaining({ format: 'xlsx', lang: 'en', accept_gaps: false }),
    );
    gen.flush(generated());
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="generate-done"]')).not.toBeNull();
    expect(el.textContent).toContain('The document is ready');
  });

  it('offers "make it anyway" with links to the gaps', async () => {
    const { http, fixture, el } = await open(output());
    http.expectOne(`${ROOT}/outputs/register.deviations/preflight`).flush({
      output_key: 'x',
      lang: 'en',
      ready: false,
      missing: 1,
      recommended: 0,
      items: [
        item({
          key: 'owner',
          met: false,
          message: '2 have no owner',
          url: '/deviations?owner=none',
        }),
      ],
    });
    fixture.detectChanges();
    expect(el.textContent).toContain('1 thing is missing.');
    const fix = el.querySelector('[data-testid="preflight-item-owner"] a') as HTMLAnchorElement;
    expect(fix.getAttribute('href')).toBe('/deviations?owner=none');

    (el.querySelector('[data-testid="generate-anyway"] button') as HTMLButtonElement).click();
    const gen = http.expectOne(`${ROOT}/outputs/register.deviations/generate`);
    expect(gen.request.body.accept_gaps).toBe(true);
    gen.flush(generated({ has_gaps: true }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="generate-done-gaps"]')).not.toBeNull();
  });

  it('asks for a standard before checking a per-standard output', async () => {
    const { http, fixture, el } = await open(
      output({ key: 'standards.coverage_report', subject: 'standard' }),
    );
    fixture.componentRef.setInput('standards', [{ key: 'iso9001', name: 'ISO 9001' }]);
    fixture.detectChanges();
    http.expectNone(`${ROOT}/outputs/standards.coverage_report/preflight`);
    const select = el.querySelector('[data-testid="generate-standard"]') as HTMLSelectElement;
    select.value = 'iso9001';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await tick();
    const check = http.expectOne(`${ROOT}/outputs/standards.coverage_report/preflight`);
    expect(check.request.body.standard_key).toBe('iso9001');
    check.flush({
      output_key: 'x',
      lang: 'en',
      ready: true,
      missing: 0,
      recommended: 0,
      items: [],
    });
  });
});

describe('OutputCard', () => {
  it('shows title, audience, readiness and one primary action', async () => {
    configure();
    const fixture = TestBed.createComponent(OutputCard);
    fixture.componentRef.setInput(
      'output',
      output({
        readiness: { ready: false, missing: 3, recommended: 0 },
        audience: ['auditor', 'board'],
      }),
    );
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Deviation log');
    expect(el.textContent).toContain('auditor, board');
    expect(el.textContent).toContain('3 missing');
    expect(el.querySelector('[data-testid="output-formats"]')?.textContent).toContain(
      'PDF · Excel · nb/en',
    );
    expect(el.querySelectorAll('[data-testid="output-make"]').length).toBe(1);
  });

  it('links own-flow outputs to their page instead of generating', async () => {
    configure();
    const fixture = TestBed.createComponent(OutputCard);
    fixture.componentRef.setInput(
      'output',
      output({
        key: 'reports.audit_pack',
        generates: false,
        route: '/reports/audit-packs',
        readiness: null,
      }),
    );
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="output-make"]')).toBeNull();
    expect(el.querySelector('[data-testid="output-open-flow"]')?.getAttribute('href')).toBe(
      '/reports/audit-packs',
    );
  });
});

describe('OutputsPanel', () => {
  it('leaves out excluded kinds', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(OutputsPanel);
    fixture.componentRef.setInput('excludeKinds', ['register_export']);
    fixture.detectChanges();
    await tick();
    http
      .expectOne((r) => r.url === `${ROOT}/outputs`)
      .flush({
        items: [
          output(),
          output({
            key: 'standards.coverage_report',
            kind: 'compiled_controlled',
            title: { en: 'Status report', nb: 'Statusrapport' },
          }),
        ],
        audiences: [],
        kinds: [],
      });
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Status report');
    expect(el.textContent).not.toContain('Deviation log');

    fixture.componentRef.setInput('excludeKinds', []);
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    expect(el.textContent).toContain('Deviation log');
  });
});

@Component({
  imports: [PageHeader],
  template: `<app-page-header titleKey="x" outputsModule="privacy" />`,
})
class HeaderHost {}

describe('"Dokumenter og rapporter" in the page header', () => {
  it('links to the library filtered to the module', async () => {
    configure();
    const fixture = TestBed.createComponent(HeaderHost);
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="outputs-link"]',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/library?module=privacy');
    expect(link.textContent).toContain('Documents and reports');
  });
});

describe('Reports redirects', () => {
  it('moves old /reports/* sub-pages under Rapporter and keeps the query string', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          ...REPORTS_REDIRECTS,
          { path: 'reports/custom/:id/edit', children: [] },
          { path: 'reports/custom/new', children: [] },
          { path: 'reports/exports', children: [] },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/reports/definitions/d1/edit');
    expect(router.url).toBe('/reports/custom/d1/edit');
    await router.navigateByUrl('/reports/definitions/new?x=1');
    expect(router.url).toBe('/reports/custom/new?x=1');
    await router.navigateByUrl('/reports/registers?register=deviations');
    expect(router.url).toBe('/reports/exports?register=deviations');
  });
});

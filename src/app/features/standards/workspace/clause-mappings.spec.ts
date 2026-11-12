import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../assets/i18n/en.json';
import scoped from '../../../../assets/i18n/standards/en.json';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { ClauseMappings } from './clause-mappings';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const tick = () => new Promise((resolve) => setTimeout(resolve));

async function setup() {
  const ask = { showWith: vi.fn() };
  TestBed.configureTestingModule({
    imports: [
      ClauseMappings,
      TranslocoTestingModule.forRoot({
        langs: { en, 'standards/en': scoped },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: APP_CONFIG,
        useValue: { apiBaseUrl: BASE, i18n: { availableLanguages: ['en', 'nb'] } },
      },
      { provide: AskPanelService, useValue: ask },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions: [] }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ClauseMappings);
  fixture.componentRef.setInput('standardKey', 'iso27001-2022');
  fixture.componentRef.setInput('number', 'A.5.34');
  fixture.detectChanges();
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const toggle = el.querySelector('button') as HTMLButtonElement;
  return { http, el, render, ask, toggle };
}

function flushAll(http: HttpTestingController) {
  http.expectOne(`${ROOT}/standards/iso27001-2022/clauses/A.5.34/mappings`).flush([
    {
      relation: 'related',
      standard_key: 'gdpr-2016',
      framework: 'gdpr',
      number: '32',
      title: { en: 'Security of processing', nb: 'Sikkerhet ved behandlingen' },
      note: { en: 'Both ask for appropriate technical measures.', nb: 'Begge krever tiltak.' },
      source: 'curated',
    },
    {
      relation: 'equivalent',
      standard_key: 'iso9001-2026',
      framework: 'iso9001',
      number: '6.1',
      title: { en: 'Actions to address risks', nb: 'Tiltak for å håndtere risikoer' },
      note: null,
      source: 'hs',
    },
  ]);
  const support = http.expectOne((r) => r.url === `${ROOT}/clause-support`);
  expect(support.request.params.get('ref')).toBe('iso27001-2022:A.5.34');
  support.flush({
    ref: 'iso27001-2022:A.5.34',
    modules: [
      { key: 'documents', entity_types: ['document'], enabled: true },
      { key: 'privacy', entity_types: ['ropa_entry'], enabled: false },
    ],
  });
  http.expectOne(`${ROOT}/standards`).flush([
    { key: 'iso27001-2022', name: 'ISO/IEC 27001', enabled: true },
    { key: 'iso9001-2026', name: 'ISO 9001', enabled: true },
    { key: 'gdpr-2016', name: 'GDPR', enabled: false },
  ]);
}

describe('ClauseMappings', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads nothing until opened', async () => {
    const { http, el, toggle } = await setup();
    http.expectNone(() => true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.textContent).toContain('Also satisfies');
  });

  it('lists equivalent clauses first, then curated ones, with links and notes', async () => {
    const { http, el, render, toggle } = await setup();
    toggle.click();
    await render();
    flushAll(http);
    await render();

    const links = Array.from(el.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/standards/iso9001-2026/6.1',
      '/standards/gdpr-2016/32',
    ]);
    expect(links[0].textContent).toContain('ISO 9001');
    expect(el.textContent).toContain('Both ask for appropriate technical measures.');
    // GDPR is not enabled for the org.
    expect(el.textContent).toContain('Not enabled');
    // Records that can be evidence: enabled modules plus a hint for disabled ones.
    expect(el.textContent).toContain('Records that can be evidence');
    expect(el.textContent).toContain('Document');
    expect(el.textContent).toContain('Module not enabled');

    // Re-opening does not reload.
    toggle.click();
    await render();
    toggle.click();
    await render();
    http.expectNone(() => true);
  });

  it('asks the assistant how the mapped clauses relate', async () => {
    const { http, el, render, toggle, ask } = await setup();
    toggle.click();
    await render();
    flushAll(http);
    await render();
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Ask how these relate'),
      ) as HTMLButtonElement
    ).click();
    const prompt = ask.showWith.mock.calls[0][0] as string;
    expect(prompt).toContain('A.5.34');
    expect(prompt).toContain('ISO/IEC 27001');
    expect(prompt).toContain('GDPR 32 Security of processing');
  });

  it('explains a failure and retries on the next open', async () => {
    const { http, el, render, toggle } = await setup();
    toggle.click();
    await render();
    http
      .expectOne(`${ROOT}/standards/iso27001-2022/clauses/A.5.34/mappings`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne((r) => r.url === `${ROOT}/clause-support`).flush({ ref: 'x', modules: [] });
    http.expectOne(`${ROOT}/standards`).flush([]);
    await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load the related clauses.",
    );

    toggle.click();
    await render();
    toggle.click();
    await render();
    flushAll(http);
  });
});

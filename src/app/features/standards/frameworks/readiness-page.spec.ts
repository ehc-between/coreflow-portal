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
import { StandardSummary } from '../../../core/standards/standards.models';
import { AskPanelService } from '../../ask/ask-panel.service';
import { ReadinessPage } from './readiness-page';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const tick = () => new Promise((resolve) => setTimeout(resolve));

function standard(over: Partial<StandardSummary> = {}): StandardSummary {
  return {
    key: 'iso9001-2026',
    name: 'ISO 9001',
    edition: '2026',
    enabled: true,
    org_standard_id: 'os-1',
    has_licensed_text: false,
    completeness: {
      applicable: 10,
      covered: 5,
      partial: 2,
      not_started: 3,
      not_applicable: 0,
      pct: 50,
    },
    ...over,
  };
}

async function setup() {
  const ask = { showWith: vi.fn() };
  localStorage.clear();
  TestBed.configureTestingModule({
    imports: [
      ReadinessPage,
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
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
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
  const fixture = TestBed.createComponent(ReadinessPage);
  fixture.detectChanges();
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { http, el, render, ask };
}

describe('ReadinessPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows each enabled framework with its score, breakdown and a summarise action', async () => {
    const { http, el, render, ask } = await setup();
    http
      .expectOne(`${ROOT}/standards`)
      .flush([standard(), standard({ key: 'gdpr-2016', name: 'GDPR', enabled: false })]);
    http.expectOne(`${ROOT}/frameworks`).flush([
      {
        framework: 'iso9001',
        standard_key: 'iso9001-2026',
        name: 'ISO 9001',
        kind: 'standard',
        enabled: true,
        in_profile: true,
        readiness: 52,
      },
      {
        framework: 'gdpr',
        standard_key: 'gdpr-2016',
        name: 'GDPR',
        kind: 'regulation',
        enabled: false,
        in_profile: false,
        readiness: null,
      },
    ]);
    http.expectOne(`${ROOT}/frameworks/readiness`).flush([
      {
        framework: 'iso9001',
        standard_key: 'iso9001-2026',
        applicable: 10,
        covered: 5,
        partial: 2,
        fresh: 3,
        score: 52,
      },
    ]);
    await render();

    const cards = el.querySelectorAll('ul > li h2');
    expect(Array.from(cards).map((h) => h.textContent?.trim())).toEqual(['ISO 9001']);
    expect(el.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('52');
    expect(el.textContent).toContain('10 applicable requirements');
    expect(el.textContent).toContain('Covered, recent evidence: 3');
    expect(el.textContent).toContain('Covered, evidence older than a year: 2');
    expect(el.textContent).toContain('Partly covered: 2');
    expect(el.textContent).toContain('Not started: 3');

    const summarise = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Summarise'),
    ) as HTMLButtonElement;
    summarise.click();
    expect(ask.showWith).toHaveBeenCalledTimes(1);
    const prompt = ask.showWith.mock.calls[0][0] as string;
    expect(prompt).toContain('ISO 9001');
    expect(prompt).toContain('52%');
    expect(prompt).toContain('3 covered with recent evidence');
  });

  it('teaches with an empty state when no framework is enabled', async () => {
    const { http, el, render } = await setup();
    http.expectOne(`${ROOT}/standards`).flush([standard({ enabled: false })]);
    http.expectOne(`${ROOT}/frameworks`).flush([]);
    http.expectOne(`${ROOT}/frameworks/readiness`).flush([]);
    await render();
    expect(el.textContent).toContain('No frameworks enabled yet');
    expect(el.querySelector('a[href="/standards"]')).toBeTruthy();
  });

  it('falls back to the completeness when the framework endpoints fail', async () => {
    const { http, el, render } = await setup();
    http.expectOne(`${ROOT}/standards`).flush([standard()]);
    http.expectOne(`${ROOT}/frameworks`).flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne(`${ROOT}/frameworks/readiness`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await render();
    expect(el.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(el.textContent).toContain('10 applicable requirements');
  });

  it('shows the guide and the readiness micro-lesson with its check question', async () => {
    const { http, el, render } = await setup();
    http.expectOne(`${ROOT}/standards`).flush([]);
    http.expectOne(`${ROOT}/frameworks`).flush([]);
    http.expectOne(`${ROOT}/frameworks/readiness`).flush([]);
    await render();
    expect(el.textContent).toContain('What the readiness score tells you');

    const start = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Start the lesson'),
    ) as HTMLButtonElement;
    start.click();
    await render();
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(3);
    radios[1].click();
    await render();
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Check answer'),
      ) as HTMLButtonElement
    ).click();
    await render();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Correct.');
  });
});

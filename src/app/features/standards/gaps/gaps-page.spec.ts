import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementGap } from '../../../core/standards/standards.models';
import { GAPS_PAGE_SIZE, GapsPage, fixActions } from './gaps-page';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const KEY = 'iso27001-2022';
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function gap(number: string, over: Partial<RequirementGap> = {}): RequirementGap {
  return {
    ref: `${KEY}:${number}.r1`,
    number,
    title: `Clause ${number}`,
    text: `Requirement ${number}`,
    chapter: number.split('.')[0],
    status: 'not_started',
    label: {
      ref: `${KEY}:${number}.r1`,
      short: 'ISO 27001',
      number,
      title: `Clause ${number}`,
      standard_key: KEY,
      framework: 'iso27001',
      req_index: 1,
      req_count: 2,
    },
    fix_in: [
      {
        module: 'context',
        entity_type: 'context_analysis',
        label_key: 'modules.entities.context_analysis',
        create_url: `/context/analyses/new?fromRequirement=${KEY}:${number}.r1`,
        enabled: true,
        can_create: true,
      },
      {
        module: 'hse',
        entity_type: 'sja',
        label_key: 'modules.entities.sja',
        create_url: '/hse/sja/new',
        enabled: false,
      },
    ],
    ...over,
  };
}

async function setup() {
  TestBed.configureTestingModule({
    imports: [GapsPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
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
          currentOrg: signal({
            id: ORG,
            name: 'Org',
            roles: [],
            permissions: ['standards:read'],
          }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(GapsPage);
  fixture.componentRef.setInput('key', KEY);
  fixture.detectChanges();
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  http
    .match((r) => r.url.endsWith('/entity-types'))
    .forEach((r) => r.flush({ items: [], link_types: [] }));
  http.expectOne(`${ROOT}/standards`).flush([{ key: KEY, name: 'ISO/IEC 27001:2022' }]);
  http
    .expectOne(`${ROOT}/standards/${KEY}/tree`)
    .flush([
      { number: '4', title: { en: 'Context', nb: 'Kontekst' }, children: [], requirements: [] },
    ]);
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, http, el, render };
}

describe('fixActions', () => {
  it('offers only fixes in enabled modules', () => {
    expect(fixActions(gap('4.1')).map((t) => t.entity_type)).toEqual(['context_analysis']);
  });
});

describe('GapsPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists the gaps with a create action per record type and a link to the requirement', async () => {
    const { http, el, render } = await setup();
    const req = http.expectOne((r) => r.url === `${ROOT}/frameworks/gaps`);
    expect(req.request.params.get('standard_key')).toBe(KEY);
    expect(req.request.params.get('limit')).toBe(String(GAPS_PAGE_SIZE));
    expect(req.request.params.get('offset')).toBe('0');
    req.flush({ total: 2, items: [gap('4.1'), gap('4.3', { status: 'partial' })] });
    await render();
    const items = el.querySelectorAll('[data-testid="gaps-list"] > li');
    expect(items).toHaveLength(2);
    const create = items[0].querySelectorAll<HTMLAnchorElement>('[data-testid="gap-create"]');
    expect(create).toHaveLength(1);
    expect(create[0].getAttribute('href')).toBe(
      `/context/analyses/new?fromRequirement=${KEY}:4.1.r1`,
    );
    expect(items[0].querySelector('[data-testid="gap-open"]')?.getAttribute('href')).toBe(
      `/standards/${KEY}/4.1?req=${KEY}:4.1.r1`,
    );
    expect(items[0].querySelector('[data-testid="requirement-chip"]')?.textContent).toContain(
      'ISO 27001 · 4.1',
    );
    expect(el.querySelector('[data-testid="gaps-total"]')?.textContent).toContain(
      'standards.reqs.gaps.count',
    );
  });

  it('filters by chapter', async () => {
    const { http, el, render } = await setup();
    http.expectOne((r) => r.url === `${ROOT}/frameworks/gaps`).flush({ total: 0, items: [] });
    await render();
    const select = el.querySelector<HTMLSelectElement>('[data-testid="gaps-chapter"]')!;
    select.value = '4';
    select.dispatchEvent(new Event('change'));
    await render();
    const req = http.expectOne((r) => r.url === `${ROOT}/frameworks/gaps`);
    expect(req.request.params.get('chapter')).toBe('4');
    req.flush({ total: 0, items: [] });
    await render();
    expect(el.textContent).toContain('standards.reqs.gaps.none');
  });

  it('explains a standard that is not enabled (409)', async () => {
    const { http, el, render } = await setup();
    http
      .expectOne((r) => r.url === `${ROOT}/frameworks/gaps`)
      .flush({ detail: { code: 'standard_not_enabled' } }, { status: 409, statusText: 'Conflict' });
    await render();
    expect(el.textContent).toContain('standards.reqs.gaps.notEnabled');
  });
});

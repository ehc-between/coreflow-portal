import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ClauseNode, RequirementLink } from '../../core/standards/standards.models';
import { SupportsRequirements } from './supports-requirements';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const tick = () => new Promise((resolve) => setTimeout(resolve));

function link(over: Partial<RequirementLink> = {}): RequirementLink {
  return {
    id: 'l-1',
    requirement_ref: 'r-7.5',
    standard_key: 'iso9001',
    clause_number: '7.5',
    entity_type: 'document',
    entity_id: 'doc-1',
    entity_label: 'Quality manual',
    status: 'confirmed',
    source: 'user',
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

const TREE: ClauseNode[] = [
  {
    number: '7.5',
    title: 'Documented information',
    kind: 'clause',
    theme: null,
    summary: null,
    rollup: { applicable: 2, covered: 1, partial: 0, not_started: 1, pct: 50 },
    children: [],
    requirements: [
      {
        ref: 'r-7.5',
        text: { en: 'Documents are controlled', nb: 'Dokumenter er styrt' },
        evidence_examples: { en: '', nb: '' },
        status: 'covered',
        applicable: true,
        justification: null,
        confirmed_links: [],
        suggested_links: [],
        status_override: null,
        note: null,
      },
      {
        ref: 'r-7.5-b',
        text: { en: 'Records are retained', nb: 'Registreringer oppbevares' },
        evidence_examples: { en: '', nb: '' },
        status: 'not_started',
        applicable: true,
        justification: null,
        confirmed_links: [],
        suggested_links: [],
        status_override: null,
        note: null,
      },
    ],
  },
];

async function setup(permissions: string[]) {
  TestBed.configureTestingModule({
    imports: [SupportsRequirements, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: APP_CONFIG,
        useValue: { apiBaseUrl: BASE, i18n: { availableLanguages: ['en', 'nb'] } },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SupportsRequirements);
  fixture.componentRef.setInput('entityType', 'document');
  fixture.componentRef.setInput('entityId', 'doc-1');
  fixture.detectChanges();
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, http, el, render };
}

function expectLinks(http: HttpTestingController) {
  return http.expectOne((r) => r.url === `${ROOT}/requirement-links` && r.method === 'GET');
}

describe('SupportsRequirements', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders nothing and makes no requests without standards:read', async () => {
    const { el, http } = await setup([]);
    http.expectNone(() => true);
    expect(el.textContent?.trim()).toBe('');
  });

  it('lists the record links (hiding rejected) with the standard name', async () => {
    const { http, el, render } = await setup(['standards:read']);
    const req = expectLinks(http);
    expect(req.request.params.get('entity_type')).toBe('document');
    expect(req.request.params.get('entity_id')).toBe('doc-1');
    req.flush([
      link(),
      link({ id: 'l-2', clause_number: '9.2', status: 'rejected' }),
      link({ id: 'l-3', clause_number: '8.1', status: 'suggested', source: 'ai' }),
    ]);
    http
      .expectOne(`${ROOT}/standards`)
      .flush([{ key: 'iso9001', name: 'ISO 9001', enabled: true }]);
    await render();

    const items = Array.from(el.querySelectorAll('li')).map((li) => li.textContent?.trim());
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('ISO 9001 · 7.5');
    expect(items[1]).toContain('ISO 9001 · 8.1');
    // Read-only: no manage controls.
    expect(el.querySelectorAll('li button').length).toBe(0);
  });

  it('confirms a suggestion and links a new requirement for managers', async () => {
    const { http, el, render } = await setup(['standards:read', 'standards:manage']);
    expectLinks(http).flush([link({ id: 'l-3', status: 'suggested', source: 'ai' })]);
    http.expectOne(`${ROOT}/standards`).flush([]);
    await render();

    // Confirm the suggestion (first action button in the row).
    (el.querySelector('li button') as HTMLButtonElement).click();
    const confirm = http.expectOne(`${ROOT}/requirement-links/l-3/confirm`);
    confirm.flush(link({ id: 'l-3', status: 'confirmed', source: 'ai' }));
    await render();
    expect(el.querySelector('li')?.className).not.toContain('accent');

    // Open the picker: loads enabled standards + their trees.
    (el.querySelector('h2 + button') as HTMLButtonElement).click();
    await render();
    http.expectOne(`${ROOT}/standards`).flush([
      { key: 'iso9001', name: 'ISO 9001', enabled: true },
      { key: 'iso14001', name: 'ISO 14001', enabled: false },
    ]);
    http.expectOne(`${ROOT}/standards/iso9001/tree`).flush(TREE);
    await render();

    const input = el.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'records';
    input.dispatchEvent(new Event('input'));
    await render();

    const option = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Records are retained'),
    ) as HTMLButtonElement;
    expect(option).toBeTruthy();
    option.click();
    const create = http.expectOne(
      (r) => r.url === `${ROOT}/requirement-links` && r.method === 'POST',
    );
    expect(create.request.body).toEqual({
      requirement_ref: 'r-7.5-b',
      entity_type: 'document',
      entity_id: 'doc-1',
    });
    create.flush(link({ id: 'l-9', requirement_ref: 'r-7.5-b', clause_number: '7.5' }));
    await render();
    expect(el.querySelectorAll('ul > li').length).toBe(2);
  });
});

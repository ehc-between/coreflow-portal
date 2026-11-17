import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import {
  RequirementLabel,
  RequirementLink,
  RequirementSuggestion,
} from '../../core/standards/standards.models';
import {
  SUGGEST_DELAY_MS,
  SupportsRequirements,
  fieldLabelKey,
  mergeSuggestions,
  linkRow,
} from './supports-requirements';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function label(number: string, over: Partial<RequirementLabel> = {}): RequirementLabel {
  return {
    ref: `iso27001-2022:${number}.r1`,
    short: 'ISO 27001',
    number,
    title: `Title ${number}`,
    text: '',
    standard_key: 'iso27001-2022',
    framework: 'iso27001',
    req_index: 1,
    req_count: 1,
    ...over,
  };
}

function link(over: Partial<RequirementLink> = {}): RequirementLink {
  const number = over.clause_number ?? 'A.8.13';
  return {
    id: 'l-1',
    requirement_ref: `iso27001-2022:${number}.r1`,
    standard_key: 'iso27001-2022',
    clause_number: number,
    entity_type: 'risk',
    entity_id: 'rec-1',
    entity_label: 'RSK-0001',
    status: 'confirmed',
    source: 'user',
    origin: 'manual',
    origin_field: null,
    label: label(number),
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

function suggestion(
  number: string,
  over: Partial<RequirementSuggestion> = {},
): RequirementSuggestion {
  return {
    ref: `iso27001-2022:${number}.r1`,
    label: label(number),
    status: 'suggested',
    origin: 'declaration',
    link_id: null,
    confidence: null,
    rationale: null,
    ...over,
  };
}

async function setup(
  permissions: string[],
  options: {
    entityType?: string;
    actions?: { id: string; description: string }[];
    canEdit?: boolean;
  } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      SupportsRequirements,
      TranslocoTestingModule.forRoot({ langs: { en: {}, 'standards/en': {} } }),
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
  fixture.componentRef.setInput('entityType', options.entityType ?? 'risk');
  fixture.componentRef.setInput('entityId', 'rec-1');
  fixture.componentRef.setInput('actions', options.actions ?? []);
  if (options.canEdit !== undefined) {
    fixture.componentRef.setInput('canEdit', options.canEdit);
  }
  const emitted: (readonly RequirementLink[])[] = [];
  fixture.componentInstance.linksChange.subscribe((l) => emitted.push(l));
  fixture.detectChanges();
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const render = async (ms = 0) => {
    await tick(ms);
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const rows = () =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-testid="supports-row"]')).map((row) => ({
      status: row.dataset['status'],
      text: row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      row,
    }));
  return { fixture, http, el, render, rows, emitted };
}

const isList =
  (entityId = 'rec-1') =>
  (r: { url: string; method: string; params: { get(k: string): string | null } }) =>
    r.url === `${ROOT}/requirement-links` &&
    r.method === 'GET' &&
    r.params.get('entity_id') === entityId;

describe('SupportsRequirements', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders nothing and makes no requests without standards:read', async () => {
    const { el, http } = await setup([]);
    http.expectNone(() => true);
    expect(el.textContent?.trim()).toBe('');
  });

  it('shows confirmed links as readable chips, hides rejected ones, and marks field links', async () => {
    const { http, render, rows, el, emitted } = await setup(['standards:read', 'standards:manage']);
    const list = http.expectOne(isList());
    expect(list.request.params.get('entity_type')).toBe('risk');
    expect(list.request.params.get('lang')).toBe('en');
    list.flush([
      link(),
      link({ id: 'l-2', clause_number: 'A.5.30', status: 'rejected' }),
      link({ id: 'l-3', clause_number: '6.1.2', origin: 'field', origin_field: 'control_refs' }),
    ]);
    await render();
    const shown = rows();
    expect(shown.map((r) => r.status)).toEqual(['confirmed', 'confirmed']);
    // Sorted by clause number; never the raw ".r1" ref.
    expect(shown[0].text).toContain('ISO 27001 · 6.1.2');
    expect(shown[1].text).toContain('ISO 27001 · A.8.13');
    expect(el.textContent).not.toContain('.r1');
    // The field link says where it comes from and cannot be removed here.
    expect(shown[0].row.querySelector('[data-testid="from-field"]')?.textContent).toContain(
      'standards.reqs.fromField',
    );
    expect(shown[0].row.querySelector('[data-testid="row-remove"]')).toBeNull();
    expect(shown[1].row.querySelector('[data-testid="row-remove"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="supports-count"]')?.textContent?.trim()).toBe('2');
    // Something is confirmed: no automatic suggestions, but they can be asked for.
    await render(SUGGEST_DELAY_MS + 20);
    http.expectNone(`${ROOT}/requirement-links/suggest`);
    expect(el.querySelector('[data-testid="find-more"]')).not.toBeNull();
    expect(emitted.at(-1)?.map((l) => l.id)).toEqual(['l-1', 'l-3']);
  });

  it('read-only users see links and stored suggestions without actions or suggest calls', async () => {
    const { http, render, rows, el } = await setup(['standards:read']);
    http.expectOne(isList()).flush([link({ status: 'suggested', source: 'ai', origin: 'ai' })]);
    await render(SUGGEST_DELAY_MS + 20);
    http.expectNone(`${ROOT}/requirement-links/suggest`);
    expect(rows().map((r) => r.status)).toEqual(['suggested']);
    expect(el.querySelector('[data-testid="row-confirm"]')).toBeNull();
    expect(el.querySelector('[data-testid="supports-add"]')).toBeNull();
  });

  it('suggests requirements by itself when nothing is linked, and confirms one in a click', async () => {
    const { http, render, rows } = await setup(['standards:read', 'standards:manage']);
    http.expectOne(isList()).flush([]);
    await render(SUGGEST_DELAY_MS + 20);
    const suggest = http.expectOne(`${ROOT}/requirement-links/suggest?lang=en`);
    expect(suggest.request.method).toBe('POST');
    expect(suggest.request.body).toEqual({ entity_type: 'risk', entity_id: 'rec-1' });
    suggest.flush({ job_id: null, suggestions: [suggestion('6.1.2'), suggestion('8.2')] });
    await render();
    expect(rows().map((r) => r.status)).toEqual(['suggested', 'suggested']);

    rows()[0].row.querySelector<HTMLButtonElement>('[data-testid="row-confirm"]')!.click();
    await render();
    const bulk = http.expectOne(`${ROOT}/requirement-links/bulk`);
    expect(bulk.request.body).toEqual({
      action: 'confirm',
      items: [
        { requirement_ref: 'iso27001-2022:6.1.2.r1', entity_type: 'risk', entity_id: 'rec-1' },
      ],
    });
    bulk.flush({ updated: 1 });
    await render();
    http.expectOne(isList()).flush([link({ clause_number: '6.1.2' })]);
    await render();
    const after = rows();
    expect(after.map((r) => [r.status, r.text.includes('6.1.2')])).toEqual([
      ['confirmed', true],
      ['suggested', false],
    ]);
  });

  it('confirms all suggestions at once (stored by id, virtual by item)', async () => {
    const { http, render, el } = await setup(['standards:read', 'standards:manage']);
    http
      .expectOne(isList())
      .flush([
        link({ id: 'l-9', clause_number: '8.2', status: 'suggested', source: 'ai', origin: 'ai' }),
      ]);
    await render(SUGGEST_DELAY_MS + 20);
    http.expectOne(`${ROOT}/requirement-links/suggest?lang=en`).flush({
      job_id: null,
      suggestions: [suggestion('8.2', { link_id: 'l-9', origin: 'ai' }), suggestion('6.1.2')],
    });
    await render();
    el.querySelector<HTMLButtonElement>('[data-testid="confirm-all"]')!.click();
    await render();
    const bulk = http.expectOne(`${ROOT}/requirement-links/bulk`);
    expect(bulk.request.body).toEqual({
      action: 'confirm',
      ids: ['l-9'],
      items: [
        { requirement_ref: 'iso27001-2022:6.1.2.r1', entity_type: 'risk', entity_id: 'rec-1' },
      ],
    });
    bulk.flush({ updated: 2 });
    await render();
    http.expectOne(isList()).flush([]);
    await render();
  });

  it('rejects a virtual suggestion (stored, so it never comes back) and hides it at once', async () => {
    const { http, render, rows } = await setup(['standards:read'], { canEdit: true });
    http.expectOne(isList()).flush([]);
    await render(SUGGEST_DELAY_MS + 20);
    // canEdit from the host is enough to manage this record's links.
    http
      .expectOne(`${ROOT}/requirement-links/suggest?lang=en`)
      .flush({ job_id: null, suggestions: [suggestion('6.1.2')] });
    await render();
    rows()[0].row.querySelector<HTMLButtonElement>('[data-testid="row-reject"]')!.click();
    await render();
    expect(rows()).toHaveLength(0);
    const bulk = http.expectOne(`${ROOT}/requirement-links/bulk`);
    expect(bulk.request.body.action).toBe('reject');
    bulk.flush({ updated: 1 });
    await render();
    http
      .expectOne(isList())
      .flush([link({ clause_number: '6.1.2', status: 'rejected', origin: 'declaration' })]);
    await render();
    expect(rows()).toHaveLength(0);
  });

  it('removes a manual link and explains a 409 from a field-managed link', async () => {
    const { http, render, rows, el } = await setup(['standards:read', 'standards:manage']);
    http.expectOne(isList()).flush([link()]);
    await render();
    rows()[0].row.querySelector<HTMLButtonElement>('[data-testid="row-remove"]')!.click();
    await render();
    http
      .expectOne(`${ROOT}/requirement-links/l-1`)
      .flush({ detail: { code: 'managed_by_field' } }, { status: 409, statusText: 'Conflict' });
    await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'standards.reqs.managedByField',
    );
  });

  it('adds a requirement from the catalogue: one requirement in the clause links at once', async () => {
    const { http, render, el } = await setup(['standards:read', 'standards:manage']);
    http.expectOne(isList()).flush([link()]);
    await render();
    el.querySelector<HTMLButtonElement>('[data-testid="supports-add"]')!.click();
    await render();
    const box = el.querySelector<HTMLInputElement>('[data-testid="catalogue-query"]')!;
    box.value = 'A.5.30';
    box.dispatchEvent(new Event('input'));
    await render(250);
    const search = http.expectOne((r) => r.url === `${ROOT}/requirement-catalogue`);
    expect(search.request.params.get('q')).toBe('A.5.30');
    search.flush([
      {
        clause_ref: 'iso27001:A.5.30',
        number: 'A.5.30',
        title: 'ICT readiness',
        title_en: 'ICT readiness',
        title_nb: 'IKT-beredskap',
        kind: 'annex_control',
        short: 'ISO 27001',
        standard_key: 'iso27001-2022',
        framework: 'iso27001',
        requirement_count: 1,
        enabled: true,
      },
      {
        clause_ref: 'nis2:21',
        number: '21',
        title: 'Off',
        title_en: 'Off',
        title_nb: 'Av',
        kind: 'article',
        short: 'NIS2',
        standard_key: 'nis2-2022',
        framework: 'nis2',
        requirement_count: 2,
        enabled: false,
      },
    ]);
    await render();
    const results = el.querySelectorAll<HTMLButtonElement>('[data-testid="catalogue-result"]');
    // Standards the org has not enabled produce no evidence: not offered here.
    expect(results).toHaveLength(1);
    results[0].click();
    await render();
    http
      .expectOne(`${ROOT}/standards/iso27001-2022/clauses/A.5.30`)
      .flush({ requirements: [{ ref: 'iso27001-2022:A.5.30.r1', text: { en: 'x', nb: 'x' } }] });
    await render();
    const create = http.expectOne(
      (r) => r.url === `${ROOT}/requirement-links` && r.method === 'POST',
    );
    expect(create.request.body).toEqual({
      requirement_ref: 'iso27001-2022:A.5.30.r1',
      entity_type: 'risk',
      entity_id: 'rec-1',
    });
    create.flush(link({ id: 'l-2', clause_number: 'A.5.30', label: null }));
    await render();
    http.expectOne(isList()).flush([link(), link({ id: 'l-2', clause_number: 'A.5.30' })]);
    await render();
    expect(el.querySelectorAll('[data-testid="supports-row"]')).toHaveLength(2);
  });

  it('groups links on the deviation actions under each action', async () => {
    const { http, render, el } = await setup(['standards:read'], {
      entityType: 'deviation',
      actions: [{ id: 'a-1', description: 'Replace the ladder' }],
    });
    http.expectOne(isList()).flush([]);
    http
      .expectOne(isList('a-1'))
      .flush([link({ id: 'l-a', entity_id: 'a-1', entity_type: 'deviation_action' })]);
    await render();
    const group = el.querySelector('[data-testid="action-group"]');
    expect(group?.textContent).toContain('standards.reqs.onAction');
    expect(el.querySelectorAll('[data-testid="supports-row"]')).toHaveLength(1);
  });
});

describe('supports-requirements helpers', () => {
  it('labels known fields and falls back to a generic name', () => {
    expect(fieldLabelKey('control_refs')).toBe('standards.reqs.fields.control_refs');
    expect(fieldLabelKey('mystery')).toBe('standards.reqs.fields.generic');
    expect(fieldLabelKey(null)).toBe('standards.reqs.fields.generic');
  });

  it('merges stored and virtual suggestions without repeating known or rejected refs', () => {
    const stored = [
      linkRow(link({ status: 'suggested', clause_number: '8.2' }), () => 'ISO 27001'),
    ];
    const merged = mergeSuggestions(
      stored,
      [
        suggestion('8.2', { link_id: 'l-1' }),
        suggestion('6.1.2'),
        suggestion('A.5.30'),
        suggestion('9.1', { label: null }),
      ],
      new Set(['iso27001-2022:8.2.r1', 'iso27001-2022:A.5.30.r1']),
      'rec-1',
    );
    expect(merged.map((r) => [r.ref, r.linkId])).toEqual([
      ['iso27001-2022:8.2.r1', 'l-1'],
      ['iso27001-2022:6.1.2.r1', null],
    ]);
  });

  it('falls back to a local label when the backend sends none', () => {
    const row = linkRow(
      link({
        label: null,
        requirement_ref: 'gdpr-2016:33.r2',
        clause_number: '33',
        standard_key: 'gdpr-2016',
      }),
      () => 'GDPR',
    );
    expect(row.label.short).toBe('GDPR');
    expect(row.label.number).toBe('33');
    expect(row.label.req_index).toBe(2);
  });
});

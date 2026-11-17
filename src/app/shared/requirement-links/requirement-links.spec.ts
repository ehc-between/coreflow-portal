import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ClausePicker, parseClause, toRefs } from './clause-picker';
import { CoverageChip, coverageState } from './coverage-chip';
import { COVERAGE_BATCH, RequirementCoverageService, chunk } from './requirement-coverage.service';
import {
  compareNumbers,
  fallbackLabel,
  frameworkOf,
  groupByStandard,
  reqIndexOf,
  requirementRoute,
  shortNameKey,
} from './requirement-label';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

let activeHttp: HttpTestingController | null = null;

/** Verify only when the test configured TestBed (pure-function tests do not). */
function verifyHttp(): void {
  activeHttp?.verify();
  activeHttp = null;
}

function configure(permissions: string[], imports: unknown[] = []) {
  TestBed.configureTestingModule({
    imports: [...(imports as never[]), TranslocoTestingModule.forRoot({ langs: { en: {} } })],
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
    ],
  });
  activeHttp = TestBed.inject(HttpTestingController);
  return activeHttp;
}

describe('requirement labels', () => {
  it('derives the framework of a catalogue standard key', () => {
    expect(frameworkOf('iso27001-2022')).toBe('iso27001');
    expect(frameworkOf('eu-ai-act-2024')).toBe('eu_ai_act');
    expect(frameworkOf('gdpr-2016')).toBe('gdpr');
    expect(frameworkOf('hs')).toBe('hs');
  });

  it('translates only the names that differ per language (never "ISO HS")', () => {
    expect(shortNameKey('hs')).toBe('standards.reqs.short.hs');
    expect(shortNameKey('eu_ai_act')).toBe('standards.reqs.short.eu_ai_act');
    expect(shortNameKey('iso9001')).toBeNull();
  });

  it('builds a fallback label without the raw .rN suffix', () => {
    const label = fallbackLabel(
      {
        requirement_ref: 'iso9001-2026:8.4.1.r3',
        standard_key: 'iso9001-2026',
        clause_number: '8.4.1',
      },
      'ISO 9001',
    );
    expect(label).toMatchObject({ short: 'ISO 9001', number: '8.4.1', req_index: 3, req_count: 1 });
    expect(reqIndexOf('x:8.4.1')).toBeNull();
  });

  it('routes to the requirement in its workspace', () => {
    expect(
      requirementRoute({
        standard_key: 'iso9001-2026',
        number: '8.4.1',
        ref: 'iso9001-2026:8.4.1.r1',
      }),
    ).toEqual({
      commands: ['/standards', 'iso9001-2026', '8.4.1'],
      queryParams: { req: 'iso9001-2026:8.4.1.r1' },
    });
  });

  it('orders clause numbers naturally and groups by standard', () => {
    expect(['A.8.13', 'A.8.2', '10.1', '9.2'].sort(compareNumbers)).toEqual([
      '9.2',
      '10.1',
      'A.8.2',
      'A.8.13',
    ]);
    const groups = groupByStandard(['a1', 'b1', 'a2'], (s) => s[0]);
    expect(groups.map((g) => [g.key, g.items])).toEqual([
      ['a', ['a1', 'a2']],
      ['b', ['b1']],
    ]);
  });
});

describe('RequirementCoverageService', () => {
  afterEach(verifyHttp);

  it('chunks ids into batches of at most 200', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(COVERAGE_BATCH).toBe(200);
  });

  it('batches every row of a render pass into one request and caches the counts', async () => {
    const http = configure(['standards:read']);
    const service = TestBed.inject(RequirementCoverageService);
    expect(service.counts('risk', 'a')).toBeNull();
    expect(service.counts('risk', 'b')).toBeNull();
    expect(service.counts('risk', 'a')).toBeNull();
    await tick();
    const req = http.expectOne((r) => r.url === `${ROOT}/requirement-coverage`);
    expect(req.request.params.get('entity_type')).toBe('risk');
    expect(req.request.params.get('ids')).toBe('a,b');
    // Ids without links come back as zeros (or are missing): both are cached.
    req.flush({ items: { a: { confirmed: 3, suggested: 1 } } });
    expect(service.counts('risk', 'a')).toEqual({ confirmed: 3, suggested: 1 });
    expect(service.counts('risk', 'b')).toEqual({ confirmed: 0, suggested: 0 });
    await tick();
    http.expectNone((r) => r.url === `${ROOT}/requirement-coverage`);
  });

  it('splits large lists into several requests and refetches after invalidation', async () => {
    const http = configure(['standards:read']);
    const service = TestBed.inject(RequirementCoverageService);
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    let result: Record<string, unknown> = {};
    service.load('document', ids).subscribe((r) => (result = r));
    const reqs = http.match((r) => r.url === `${ROOT}/requirement-coverage`);
    expect(reqs.map((r) => r.request.params.get('ids')!.split(',').length)).toEqual([200, 50]);
    reqs.forEach((r) => r.flush({ items: {} }));
    expect(Object.keys(result)).toHaveLength(250);

    service.invalidate('document', ['id-1']);
    service.load('document', ['id-1', 'id-2']).subscribe();
    const again = http.expectOne((r) => r.url === `${ROOT}/requirement-coverage`);
    expect(again.request.params.get('ids')).toBe('id-1');
    again.flush({ items: { 'id-1': { confirmed: 1, suggested: 0 } } });
  });

  it('does not retry a failed batch in a loop', async () => {
    const http = configure(['standards:read']);
    const service = TestBed.inject(RequirementCoverageService);
    service.counts('risk', 'a');
    await tick();
    http
      .expectOne((r) => r.url === `${ROOT}/requirement-coverage`)
      .flush('no', { status: 500, statusText: 'Server error' });
    expect(service.counts('risk', 'a')).toBeNull();
    await tick();
    http.expectNone((r) => r.url === `${ROOT}/requirement-coverage`);
  });

  it('fetches nothing without standards:read', async () => {
    const http = configure([]);
    const service = TestBed.inject(RequirementCoverageService);
    expect(service.counts('risk', 'a')).toBeNull();
    await tick();
    http.expectNone(() => true);
  });
});

describe('CoverageChip', () => {
  afterEach(verifyHttp);

  it('says what a row documents', () => {
    expect(coverageState({ confirmed: 2, suggested: 5 })).toBe('documents');
    expect(coverageState({ confirmed: 0, suggested: 5 })).toBe('suggested');
    expect(coverageState({ confirmed: 0, suggested: 0 })).toBe('none');
  });

  it('renders the given counts, or loads them by record', async () => {
    @Component({
      imports: [CoverageChip],
      template: `
        <app-coverage-chip [counts]="{ confirmed: 3, suggested: 0 }" />
        <app-coverage-chip entityType="risk" entityId="r-1" />
        <app-coverage-chip entityType="risk" entityId="r-2" />
      `,
    })
    class Host {}
    const http = configure(['standards:read'], [Host]);
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await tick();
    const req = http.expectOne((r) => r.url === `${ROOT}/requirement-coverage`);
    expect(req.request.params.get('ids')).toBe('r-1,r-2');
    req.flush({ items: { 'r-1': { confirmed: 0, suggested: 13 } } });
    fixture.detectChanges();
    await fixture.whenStable();
    const chips = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        '[data-testid="coverage-chip"]',
      ),
    );
    expect(chips.map((c) => c.dataset['state'])).toEqual(['documents', 'suggested', 'none']);
    expect(chips[0].textContent).toContain('standards.reqs.coverage.documents');
  });
});

describe('ClausePicker', () => {
  afterEach(verifyHttp);

  it('parses stored refs in both the canonical and the standard-key form', () => {
    expect(parseClause('iso27001:A.8.13')).toEqual({
      ref: 'iso27001:A.8.13',
      framework: 'iso27001',
      number: 'A.8.13',
    });
    expect(parseClause('iso27001-2022:A.8.13').framework).toBe('iso27001');
    expect(parseClause('free text').framework).toBe('');
    expect(toRefs(['a', '', 3])).toEqual(['a']);
    expect(toRefs('x')).toEqual(['x']);
    expect(toRefs(null)).toEqual([]);
  });

  async function mount(multiple: boolean, initial: string[] | string | null) {
    @Component({
      imports: [ClausePicker, ReactiveFormsModule],
      template: `<app-clause-picker
        [formControl]="control"
        [multiple]="multiple"
        [frameworks]="['iso27001']"
      />`,
    })
    class Host {
      control = new FormControl<string[] | string | null>(initial);
      multiple = multiple;
    }
    const http = configure(['standards:read'], [Host]);
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const render = async (ms = 0) => {
      await tick(ms);
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { http, fixture, el, render, host: fixture.componentInstance };
  }

  const CLAUSE = {
    clause_ref: 'iso27001:A.8.13',
    number: 'A.8.13',
    title: 'Information backup',
    title_en: 'Information backup',
    title_nb: 'Sikkerhetskopiering av informasjon',
    kind: 'annex_control',
    short: 'ISO 27001',
    standard_key: 'iso27001-2022',
    framework: 'iso27001',
    requirement_count: 3,
    enabled: true,
  };

  it('writes the control value, searches the catalogue and emits canonical refs', async () => {
    const { http, el, render, host } = await mount(true, ['iso27001-2022:A.5.9']);
    const values = () =>
      Array.from(el.querySelectorAll('[data-testid="clause-picker-value"]')).map((v) =>
        v.textContent?.replace(/\s+/g, ' ').trim(),
      );
    expect(values()).toEqual(['ISO 27001 · A.5.9']);

    const box = el.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    box.value = 'backup';
    box.dispatchEvent(new Event('input'));
    await render(250);
    const search = http.expectOne((r) => r.url === `${ROOT}/requirement-catalogue`);
    expect(search.request.params.get('q')).toBe('backup');
    expect(search.request.params.get('frameworks')).toBe('iso27001');
    search.flush([CLAUSE]);
    await render();
    expect(box.getAttribute('aria-expanded')).toBe('true');
    // Keyboard: Enter picks the active option.
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await render();
    expect(host.control.value).toEqual(['iso27001-2022:A.5.9', 'iso27001:A.8.13']);
    expect(host.control.touched).toBe(true);
    expect(values()).toEqual(['ISO 27001 · A.5.9', 'ISO 27001 · A.8.13']);

    el.querySelector<HTMLButtonElement>('[data-testid="clause-picker-value"] button')!.click();
    await render();
    expect(host.control.value).toEqual(['iso27001:A.8.13']);
  });

  it('holds one ref in single mode and follows the disabled state', async () => {
    const { http, el, render, host } = await mount(false, null);
    const box = el.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    box.value = 'A.8.13';
    box.dispatchEvent(new Event('input'));
    await render(250);
    http.expectOne((r) => r.url === `${ROOT}/requirement-catalogue`).flush([CLAUSE]);
    await render();
    el.querySelector<HTMLElement>('[data-testid="clause-picker-option"]')!.click();
    await render();
    expect(host.control.value).toBe('iso27001:A.8.13');
    // One value: the text box is gone until it is removed.
    expect(el.querySelector('input[role="combobox"]')).toBeNull();

    host.control.disable();
    await render();
    expect(el.querySelector('[data-testid="clause-picker-value"] button')).toBeNull();
  });
});

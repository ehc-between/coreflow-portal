import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/locations/en.json';
import nb from '../../../assets/i18n/locations/nb.json';
import { PageContextService } from '../../core/ai/page-context';
import { APP_CONFIG } from '../../core/config/app-config';
import {
  FulfilsItem,
  LocationResult,
  LocationVocabulary,
  RequirementLocations as Data,
} from '../../core/locations/locations.models';
import { locationForPath } from '../../core/locations/locations.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { BasisSummary } from './basis-summary';
import { FulfilsRequirements, groupFulfils, routeOfRef } from './fulfils-requirements';
import { LocationFillIn } from './location-fill-in';
import { locationText } from './location-hint';
import { locationLink, placeName } from './location-links';
import { DEFAULT_PRESETS, presetRules } from './location-override-dialog';
import { worstOutcome } from './location-status-icon';
import { RequirementLocations } from './requirement-locations';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const REF = 'iso9001-2026:4.2.r3';
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

let activeHttp: HttpTestingController | null = null;

function configure(permissions: string[] = ['standards:read']) {
  TestBed.configureTestingModule({
    imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
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

afterEach(() => {
  activeHttp?.verify();
  activeHttp = null;
});

function place(overrides: Partial<LocationResult> = {}): LocationResult {
  return {
    key: 'context.interested_parties',
    module: 'context',
    module_enabled: true,
    label: 'Kontekst og ledelse: interessenter',
    route: '/context/interested-parties',
    query: {},
    url: '/context/interested-parties',
    description: 'Registrer interessentene som har betydning.',
    kind: 'register',
    role: 'primary',
    outcome: 'partial',
    score: 0.57,
    text: '7 interessenter registrert, 3 ikke håndtert',
    message: { key: 'locations:rules.all_in_state.partial', params: { total: 7, missing: 3 } },
    counts: { total: 7, missing: 3 },
    as_of: '2026-11-17T10:00:00',
    fresh: true,
    stale: false,
    samples: [
      {
        entity_type: 'interested_party',
        entity_id: 'ip-4',
        title: 'Data Protection Authority',
        code: 'IP-4',
        url: '/context/interested-parties/ip-4',
        status: 'active',
        module: 'context',
        label_key: null,
      },
    ],
    rules: [],
    origin: 'seed',
    override: null,
    note: null,
    create_url: '/context/interested-parties/new?fromRequirement=iso9001-2026%3A4.2.r3',
    ...overrides,
  };
}

function data(overrides: Partial<Data> = {}): Data {
  return {
    requirement: { ref: REF, label: null },
    status: { status: 'partial', basis: 'location', fresh: true, text: 'Status fra …' },
    primary: [place()],
    supporting: [],
    disabled: [],
    links: { confirmed: 1, suggested: 0 },
    ...overrides,
  };
}

function fulfils(overrides: Partial<FulfilsItem> = {}): FulfilsItem {
  return {
    ref: 'iso9001-2026:4.2.r1',
    label: { short: 'ISO 9001', number: '4.2', title: 'Interessenter' },
    standard_key: 'iso9001-2026',
    framework: 'iso9001',
    role: 'primary',
    outcome: 'met',
    text: '7 interessenter registrert',
    status: 'covered',
    ...overrides,
  };
}

describe('requirement-locations helpers', () => {
  it('takes the worst outcome, and not_evaluable only when nothing else is known', () => {
    expect(worstOutcome(['met', 'partial', 'met'])).toBe('partial');
    expect(worstOutcome(['met', 'not_met'])).toBe('not_met');
    expect(worstOutcome(['not_evaluable', 'met'])).toBe('met');
    expect(worstOutcome([])).toBe('not_evaluable');
  });

  it('names a place without its module prefix for buttons', () => {
    expect(placeName('Kontekst og ledelse: interessenter')).toBe('Interessenter');
    expect(placeName('Oppgaver')).toBe('Oppgaver');
  });

  it('tags portal links with the requirement and rejects off-site urls', () => {
    expect(locationLink('/risk/soa/iso27001-2022?control=A.5.1', REF)).toEqual({
      path: '/risk/soa/iso27001-2022',
      queryParams: { control: 'A.5.1', fromRequirement: REF },
    });
    expect(locationLink('/context/interested-parties')).toEqual({
      path: '/context/interested-parties',
      queryParams: null,
    });
    expect(locationLink('https://evil.example/x', REF)).toBeNull();
    expect(locationLink('//evil.example/x', REF)).toBeNull();
  });

  it('matches a page to its place by exact path, ignoring query and placeholders', () => {
    const vocab = [
      { key: 'context.raci_matrix', route: '/context/responsibilities/matrix' },
      { key: 'context.responsibilities', route: '/context/responsibilities' },
      { key: 'risk.soa', route: '/risk/soa/{standard_key}' },
    ] as LocationVocabulary[];
    expect(locationForPath(vocab, '/context/responsibilities?status=active')?.key).toBe(
      'context.responsibilities',
    );
    expect(locationForPath(vocab, '/context/responsibilities/')?.key).toBe(
      'context.responsibilities',
    );
    expect(locationForPath(vocab, '/risk/soa/{standard_key}')).toBeNull();
    expect(locationForPath(vocab, '/processes')).toBeNull();
  });

  it('picks the location text in the active language with an English fallback', () => {
    expect(
      locationText({ location_text: { en: '2 not handled', nb: '2 ikke håndtert' } }, 'nb'),
    ).toBe('2 ikke håndtert');
    expect(locationText({ location_text: { en: '2 not handled' } }, 'nb')).toBe('2 not handled');
    expect(locationText({}, 'nb')).toBe('');
  });

  it('groups what a place fulfils per clause: filled-in first, ISO first, natural order', () => {
    const groups = groupFulfils([
      fulfils({
        ref: 'gdpr-2016:30.r1',
        standard_key: 'gdpr-2016',
        label: { short: 'GDPR', number: '30', title: 'z' },
      }),
      fulfils({
        ref: 'iso14001-2015:4.2.r1',
        standard_key: 'iso14001-2015',
        label: { short: 'ISO 14001', number: '4.2', title: 'x' },
      }),
      fulfils({
        ref: 'iso9001-2026:9.3.2.r1',
        role: 'supporting',
        label: { short: 'ISO 9001', number: '9.3.2', title: 'y' },
      }),
      fulfils({ ref: 'iso9001-2026:4.2.r2', outcome: 'partial' }),
      fulfils({ ref: 'iso9001-2026:4.2.r1' }),
    ]);
    expect(groups.map((g) => `${g.label.short} ${g.label.number}`)).toEqual([
      'ISO 9001 4.2',
      'ISO 14001 4.2',
      'GDPR 30',
      'ISO 9001 9.3.2',
    ]);
    expect(groups[0].outcome).toBe('partial');
    expect(groups[0].items.map((i) => i.ref)).toEqual([
      'iso9001-2026:4.2.r1',
      'iso9001-2026:4.2.r2',
    ]);
    // Supporting-only clauses have no primary outcome of their own.
    expect(groups[3].outcome).toBe('not_evaluable');
  });

  it('routes back to a requirement from its ref alone', () => {
    expect(routeOfRef(REF)).toEqual(
      expect.objectContaining({ commands: expect.arrayContaining(['iso9001-2026']) }),
    );
  });

  it('maps rule presets 1:1 to rule JSON, only for kinds the place allows', () => {
    const placeSpec = {
      rule_kinds: ['has_entries', 'all_in_state', 'reviewed_within'],
      states: [
        { key: 'active', label: 'aktiv' },
        { key: 'handled', label: 'håndtert' },
      ],
    };
    const presets = {
      ...DEFAULT_PRESETS,
      on: { has_entries: true, all_in_state: true, reviewed_within: true, none_overdue: true },
      min: 3,
      state: 'handled',
      days: 180,
    };
    expect(presetRules(presets, placeSpec)).toEqual([
      { kind: 'has_entries', min: 3, where: { state: 'active' } },
      { kind: 'all_in_state', state: 'handled', among: 'active' },
      { kind: 'reviewed_within', days: 180 },
    ]);
    expect(presetRules(presets, { rule_kinds: ['has_entries'], states: [] })).toEqual([
      { kind: 'has_entries', min: 3 },
    ]);
    expect(presetRules(presets, null)).toEqual([]);
  });
});

describe('locations i18n', () => {
  function shape(value: unknown, path = ''): string[] {
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
        shape(v, path ? `${path}.${k}` : k),
      );
    }
    return [`${path}:${typeof value}`];
  }
  function strings(value: unknown, path = ''): [string, string][] {
    if (typeof value === 'string') {
      return [[path, value]];
    }
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      strings(v, path ? `${path}.${k}` : k),
    );
  }
  const params = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

  it('has the same keys in en and nb', () => {
    expect(shape(nb).sort()).toEqual(shape(en).sort());
  });

  it('uses the same interpolation params in en and nb', () => {
    const nbMap = new Map(strings(nb));
    for (const [key, text] of strings(en)) {
      expect({ key, params: params(nbMap.get(key) ?? '') }).toEqual({ key, params: params(text) });
    }
  });

  it('never names an AI vendor or model', () => {
    const all = JSON.stringify([en, nb]);
    expect(all).not.toMatch(/claude|anthropic|gpt|openai/i);
  });
});

describe('RequirementLocations', () => {
  async function render(payload: Data | 'error', permissions: string[] = []) {
    const http = configure(permissions);
    const fixture = TestBed.createComponent(RequirementLocations);
    fixture.componentRef.setInput('ref', REF);
    fixture.componentRef.setInput('canManage', permissions.includes('standards:manage'));
    fixture.detectChanges();
    await tick();
    const req = http.expectOne((r) => r.url === `${ROOT}/requirement-locations`);
    expect(req.request.params.get('ref')).toBe(REF);
    if (payload === 'error') {
      req.flush({ detail: 'x' }, { status: 404, statusText: 'Not Found' });
    } else {
      req.flush(payload);
    }
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows each primary place with its status, samples and a link to the exact page', async () => {
    const el = await render(data());
    expect(el.querySelector('[data-testid="requirement-locations"]')).not.toBeNull();
    const card = el.querySelector('[data-testid="location-card"]')!;
    expect(card.getAttribute('data-outcome')).toBe('partial');
    expect(card.textContent).toContain('Kontekst og ledelse: interessenter');
    expect(card.querySelector('[data-testid="location-status"]')!.textContent).toContain(
      '7 interessenter registrert, 3 ikke håndtert',
    );
    expect(card.querySelector('[data-testid="location-samples"]')!.textContent).toContain(
      'IP-4 Data Protection Authority',
    );
    const go = card.querySelector('[data-testid="location-go"]')!.getAttribute('href')!;
    expect(go).toContain('/context/interested-parties');
    expect(decodeURIComponent(go)).toContain(`fromRequirement=${REF}`);
    expect(card.querySelector('[data-testid="location-create"]')).not.toBeNull();
    // Without standards:manage there is nothing to adjust.
    expect(el.querySelector('[data-testid="location-adjust"]')).toBeNull();
    expect(el.querySelector('[data-testid="location-add"]')).toBeNull();
  });

  it('renders nothing when the requirement has no mapping or the call fails', async () => {
    let el = await render(data({ primary: [] }));
    expect(el.querySelector('[data-testid="requirement-locations"]')).toBeNull();
    TestBed.resetTestingModule();
    el = await render('error');
    expect(el.querySelector('[data-testid="requirement-locations"]')).toBeNull();
  });

  it('says when the module is off, instead of a status', async () => {
    const el = await render(
      data({ primary: [place({ module_enabled: false, outcome: 'not_evaluable' })] }),
    );
    expect(el.querySelector('[data-testid="location-module-off"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="location-status"]')).toBeNull();
    expect(el.querySelector('[data-testid="location-create"]')).toBeNull();
  });

  it('lists supporting places and folds switched-off mappings with their justification', async () => {
    const el = await render(
      data({
        supporting: [
          place({
            key: 'obligations.register',
            label: 'Lovregister',
            role: 'supporting',
            outcome: 'not_met',
            text: 'Ingen',
          }),
        ],
        disabled: [
          place({
            key: 'context.policies',
            label: 'Policyer',
            origin: 'override',
            override: {
              id: 'ov-1',
              action: 'disable',
              justification: 'Eget dokument',
              by_name: 'Kari',
              at: '2026-11-01T00:00:00',
            },
          }),
        ],
      }),
      ['standards:read', 'standards:manage'],
    );
    expect(
      el.querySelector('[data-testid="requirement-locations-supporting"]')!.textContent,
    ).toContain('Lovregister');
    const disabled = el.querySelector('[data-testid="requirement-locations-disabled"]')!;
    expect(disabled.textContent).toContain('Eget dokument');
    expect(disabled.querySelector('[data-testid="location-restore"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="location-adjust"]')).not.toBeNull();
  });

  it('only shows the status basis line when the place does not decide the status', async () => {
    let el = await render(data());
    expect(el.querySelector('[data-testid="requirement-locations-basis"]')).toBeNull();
    TestBed.resetTestingModule();
    el = await render(
      data({
        status: { status: 'covered', basis: 'manual', fresh: true, text: 'Satt manuelt av Kari' },
      }),
    );
    expect(el.querySelector('[data-testid="requirement-locations-basis"]')!.textContent).toContain(
      'Satt manuelt av Kari',
    );
  });
});

describe('FulfilsRequirements', () => {
  async function render(url: string, items: FulfilsItem[]) {
    const http = configure();
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(FulfilsRequirements);
    fixture.componentRef.setInput('locationKey', 'context.interested_parties');
    fixture.detectChanges();
    await tick();
    http
      .expectOne(`${ROOT}/locations/context.interested_parties/requirements?lang=en`)
      .flush({ location: { key: 'context.interested_parties' }, items });
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('lists the clauses this place fulfils and tells the assistant', async () => {
    TestBed.resetTestingModule();
    const pageContext = () => TestBed.inject(PageContextService);
    const fixture = await render('/', [
      fulfils(),
      fulfils({ ref: 'iso9001-2026:4.2.r3', outcome: 'partial', text: '3 ikke håndtert' }),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid="fulfils-chip"]').length).toBe(1);
    expect(el.querySelector('[data-testid="fulfils-banner"]')).toBeNull();
    // The refs are added to whichever page context is active, never replacing it.
    pageContext().set({}, { module: 'context', view: 'list' });
    expect(pageContext().current()?.module).toBe('context');
    expect(pageContext().current()?.requirements).toEqual([
      'iso9001-2026:4.2.r1',
      'iso9001-2026:4.2.r3',
    ]);
    fixture.destroy();
    expect(pageContext().current()?.requirements ?? []).toEqual([]);
  });

  it('turns into a banner when the page was opened from a requirement', async () => {
    TestBed.resetTestingModule();
    const fixture = await render(`/?fromRequirement=${encodeURIComponent('iso9001-2026:4.2.r3')}`, [
      fulfils({ ref: 'iso9001-2026:4.2.r3', outcome: 'partial', text: '3 ikke håndtert' }),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    const banner = el.querySelector('[data-testid="fulfils-banner"]')!;
    expect(banner.textContent).toContain('3 ikke håndtert');
    expect(el.querySelector('[data-testid="fulfils-back"]')!.getAttribute('href')).toContain(
      '/standards/iso9001-2026',
    );
    expect(el.querySelector('[data-testid="fulfils-requirements"]')).toBeNull();
  });
});

describe('LocationFillIn and BasisSummary', () => {
  it('links the primary places of a gap, tagged with the requirement', async () => {
    configure();
    const fixture = TestBed.createComponent(LocationFillIn);
    fixture.componentRef.setInput('gap', {
      ref: REF,
      fill_in: [{ ...place(), outcome: 'partial', text: '3 ikke håndtert' }],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const link = el.querySelector('[data-testid="gap-fill-in"] a')!;
    expect(link.textContent).toContain('Kontekst og ledelse: interessenter');
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain(`fromRequirement=${REF}`);
  });

  it('renders nothing for a gap without places, or readiness without by_basis', async () => {
    configure();
    const gap = TestBed.createComponent(LocationFillIn);
    gap.componentRef.setInput('gap', { ref: REF });
    gap.detectChanges();
    expect(
      (gap.nativeElement as HTMLElement).querySelector('[data-testid="gap-fill-in"]'),
    ).toBeNull();
    const basis = TestBed.createComponent(BasisSummary);
    basis.componentRef.setInput('readiness', { standard_key: 'iso9001-2026' });
    basis.detectChanges();
    expect(
      (basis.nativeElement as HTMLElement).querySelector('[data-testid="readiness-basis"]'),
    ).toBeNull();
    basis.componentRef.setInput('readiness', { by_basis: { location: 41, links: 12 } });
    basis.detectChanges();
    await basis.whenStable();
    expect(
      (basis.nativeElement as HTMLElement).querySelector('[data-testid="readiness-basis"]'),
    ).not.toBeNull();
  });
});

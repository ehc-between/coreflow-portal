import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { expectKeyParity } from '../../../testing/i18n-parity';
import en from '../../../assets/i18n/registers/en.json';
import nb from '../../../assets/i18n/registers/nb.json';
import rootEn from '../../../assets/i18n/en.json';
import rootNb from '../../../assets/i18n/nb.json';
import { LanguageService } from '../../core/i18n/language.service';
import { LocationsApi } from '../../core/locations/locations-api';
import { LocationCount } from '../../core/locations/locations.models';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RegisterCatalogService } from '../../core/registers/register-catalog.service';
import { ShellPreferencesService } from '../../core/shell/shell-preferences.service';
import {
  REGISTER_GROUPS,
  SETUP_REGISTERS,
  arrangeRows,
  searchRows,
  splitLabel,
  toRows,
} from './register-groups';
import { RegistersHub } from './registers-hub';

function loc(key: string, over: Partial<LocationCount> = {}): LocationCount {
  const [module, rest] = key.split('.');
  return {
    key,
    module,
    module_enabled: true,
    label: `Module ${module}: ${rest.replace(/_/g, ' ')}`,
    route: `/${module}/${rest}`,
    query: {},
    url: `/${module}/${rest}`,
    description: '',
    kind: 'register',
    entity_type: null,
    count: 3,
    last_updated_at: '2026-11-01T10:00:00',
    needed_by: ['iso9001-2026'],
    folded: false,
    ...over,
  };
}

const ITEMS: LocationCount[] = [
  loc('assets.calibration', { label: 'Eiendeler og endringer: kalibrering' }),
  loc('assets.access_reviews', {
    label: 'Eiendeler og endringer: tilgangsgjennomganger',
    route: '/assets/access-reviews',
  }),
  loc('assets.changes', { label: 'Eiendeler og endringer: endringshåndtering' }),
  loc('deviations.register', { route: '/deviations' }),
  // Shares its page with risk.risks: listed once, still found by its own words.
  loc('risk.risks', { route: '/risk/risks' }),
  loc('risk.treatments', { route: '/risk/risks' }),
  loc('privacy.processors', { count: 0, needed_by: [], folded: true }),
  loc('deviations.types', { kind: 'settings', count: null }),
  loc('feedback.insights', { kind: 'page' }),
  loc('hse.safety_rounds', { kind: 'page', route: '/hse/safety-rounds' }),
  loc('settings.modules', { kind: 'settings' }),
  loc('risk.soa', { route: '/risk/soa/{standard_key}' }),
  loc('brand_new.things'),
];

describe('register grouping', () => {
  it('splits "Module: thing" labels', () => {
    expect(splitLabel('Eiendeler og endringer: kalibrering')).toEqual({
      title: 'Kalibrering',
      area: 'Eiendeler og endringer',
    });
    expect(splitLabel('Oppgaver')).toEqual({ title: 'Oppgaver', area: null });
  });

  it('keeps lists only, once per link, in group order', () => {
    const rows = toRows(ITEMS);
    const keys = rows.map((r) => r.key);
    expect(keys).toContain('hse.safety_rounds');
    expect(keys).toContain('deviations.types');
    expect(keys).not.toContain('feedback.insights');
    expect(keys).not.toContain('settings.modules');
    expect(keys).not.toContain('risk.soa');
    expect(keys).not.toContain('risk.treatments');
    expect(keys.filter((k) => k === 'risk.risks')).toHaveLength(1);
    expect(rows.find((r) => r.key === 'brand_new.things')?.group).toBe('other');
    expect(keys.indexOf('risk.risks')).toBeLessThan(keys.indexOf('deviations.register'));
  });

  it('keys pins by route path, as the menu does', () => {
    const rows = toRows(ITEMS);
    expect(rows.find((r) => r.key === 'deviations.register')?.pinKey).toBe('deviations');
    expect(rows.find((r) => r.key === 'hse.safety_rounds')?.pinKey).toBe('hse/safety-rounds');
  });

  it('folds empty unneeded registers and setup lists', () => {
    const rows = toRows(ITEMS);
    expect(rows.find((r) => r.key === 'privacy.processors')?.folded).toBe(true);
    expect(rows.find((r) => r.key === 'deviations.types')?.folded).toBe(true);
    expect(rows.find((r) => r.key === 'assets.calibration')?.folded).toBe(false);
  });

  it('finds registers by everyday words, in both languages', () => {
    const rows = toRows(ITEMS);
    const first = (q: string) => searchRows(rows, q)[0]?.key;
    expect(first('kalibrering')).toBe('assets.calibration');
    expect(first('tilgangsgjennomgang')).toBe('assets.access_reviews');
    expect(first('endringer')).toBe('assets.changes');
    expect(first('brannmur')).toBe('assets.changes');
    expect(first('nestenulykke')).toBe('deviations.register');
    expect(first('Databehandler')).toBe('privacy.processors');
    expect(first('calibration')).toBe('assets.calibration');
    expect(first('behandlingsplan')).toBe('risk.risks');
    expect(searchRows(rows, 'eiendeler  kalibrering').map((r) => r.key)).toEqual([
      'assets.calibration',
    ]);
    expect(searchRows(rows, 'xyzzy')).toEqual([]);
    expect(searchRows(rows, '  ')).toHaveLength(rows.length);
  });

  it('puts every row in exactly one section, pins first', () => {
    const rows = toRows(ITEMS);
    const { pinned, groups, folded } = arrangeRows(rows, [
      'assets/changes',
      'privacy/processors',
      'unknown/thing',
    ]);
    expect(pinned.map((r) => r.key)).toEqual(['assets.changes', 'privacy.processors']);
    const all = [...pinned, ...groups.flatMap((g) => g.rows), ...folded].map((r) => r.key);
    expect([...all].sort()).toEqual(rows.map((r) => r.key).sort());
    expect(new Set(all).size).toBe(all.length);
    expect(folded.map((r) => r.key)).toEqual(['deviations.types']);
  });

  it('declares each location key at most once', () => {
    const keys = [...REGISTER_GROUPS.flatMap((g) => g.registers), ...SETUP_REGISTERS];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('register i18n', () => {
  it('keeps en/nb at parity', () => expectKeyParity(en, nb));

  it('names every group and the page title', () => {
    for (const group of REGISTER_GROUPS) {
      expect(typeof (en.groups as Record<string, unknown>)[group.key]).toBe('string');
    }
    expect(rootEn.nav.registers).toBe('Registers');
    expect(rootNb.nav.registers).toBe('Registre');
  });
});

describe('RegisterCatalogService', () => {
  function catalogWith(vocabulary: ReturnType<typeof vi.fn>) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: LocationsApi, useValue: { vocabulary } },
        { provide: SelectedOrgService, useValue: { currentOrgId: signal('org-1') } },
        { provide: LanguageService, useValue: { active: signal('nb') } },
      ],
    });
    return TestBed.inject(RegisterCatalogService);
  }

  it('names registers by route path from the vocabulary, once per org and language', () => {
    const vocabulary = vi.fn(() => of(ITEMS));
    const catalog = catalogWith(vocabulary);
    expect(catalog.entries()).toBeNull();
    catalog.ensure();
    catalog.ensure();
    expect(vocabulary).toHaveBeenCalledTimes(1);
    expect(vocabulary).toHaveBeenCalledWith('org-1', 'nb');
    expect(catalog.entries()?.get('assets/calibration')).toEqual({
      path: 'assets/calibration',
      title: 'Kalibrering',
      module: 'assets',
    });
    // Two places on one page: the first declared names it.
    expect(catalog.entries()?.get('risk/risks')?.title).toBe('Risks');
    expect(catalog.entries()?.has('risk/soa/{standard_key}')).toBe(false);
  });

  it('takes what the hub already loaded, and stays quiet when the call fails', () => {
    const vocabulary = vi.fn(() => throwError(() => new Error('down')));
    const catalog = catalogWith(vocabulary);
    catalog.ensure();
    expect(catalog.entries()).toBeNull();
    catalog.remember('org-1', 'nb', ITEMS);
    catalog.ensure();
    expect(vocabulary).toHaveBeenCalledTimes(1);
    expect(catalog.entries()?.get('hse/safety-rounds')?.module).toBe('hse');
    catalog.remember('org-2', 'nb', ITEMS);
    expect(catalog.entries()).toBeNull();
  });
});

describe('RegistersHub', () => {
  function setup(
    counts = vi.fn(() => of({ items: ITEMS, generated_at: '2026-11-18T08:00:00' })),
    opts: { pins?: string[] | null; loaded?: boolean } = {},
  ) {
    const pins = signal<readonly string[] | null>(opts.pins ?? null);
    const prefs = {
      pins: pins.asReadonly(),
      loaded: signal(opts.loaded ?? true).asReadonly(),
      saving: signal(false).asReadonly(),
      setPins: vi.fn((next: readonly string[] | null) => pins.set(next)),
    };
    const remember = vi.fn();
    TestBed.configureTestingModule({
      imports: [RegistersHub, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocationsApi, useValue: { counts } },
        { provide: ShellPreferencesService, useValue: prefs },
        { provide: RegisterCatalogService, useValue: { remember } },
        { provide: ModuleService, useValue: { isEnabled: () => true } },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal('org-1'),
            currentOrg: signal({
              id: 'org-1',
              name: 'Acme',
              roles: ['ciso'],
              permissions: ['assets:read', 'risk:read'],
            }),
          },
        },
        {
          provide: LanguageService,
          useValue: { active: signal('nb'), translate: (k: string) => k },
        },
      ],
    });
    const fixture = TestBed.createComponent(RegistersHub);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const keys = (selector: string) =>
      Array.from(el.querySelectorAll(`${selector} [data-testid="register-row"]`)).map((r) =>
        r.getAttribute('data-key'),
      );
    const pinButton = (key: string) =>
      el.querySelector<HTMLButtonElement>(`[data-key="${key}"] [data-testid="register-pin"]`)!;
    return { fixture, el, counts, keys, prefs, remember, pinButton };
  }

  it('loads the lists, and shows pins, groups and the folded rest', () => {
    const { el, counts, keys, remember } = setup();
    expect(counts).toHaveBeenCalledWith('org-1', 'nb', ['register', 'page', 'settings']);
    expect(remember).toHaveBeenCalledWith('org-1', 'nb', ITEMS);
    // The CISO defaults of the menu: a register row each, and the assets start page.
    expect(keys('[data-testid="registers-pinned"]')).toEqual([
      'risk.risks',
      'pin:assets',
      'assets.access_reviews',
      'assets.changes',
    ]);
    expect(keys('[data-group="suppliersAssets"]')).toEqual(['assets.calibration']);
    expect(keys('[data-testid="registers-folded"]')).toEqual([
      'privacy.processors',
      'deviations.types',
    ]);
    expect(el.querySelector('[data-testid="registers-folded"] summary')?.textContent).toContain(
      'registers.more.title',
    );
    const link = el.querySelector<HTMLAnchorElement>(
      '[data-key="assets.calibration"] [data-testid="register-link"]',
    );
    expect(link?.getAttribute('href')).toBe('/assets/calibration');
    const startPage = el.querySelector('[data-key="pin:assets"] [data-testid="register-link"]');
    expect(startPage?.getAttribute('href')).toBe('/assets');
  });

  it('searches across all sections', () => {
    const { fixture, el, keys } = setup();
    const input = el.querySelector<HTMLInputElement>('[data-testid="registers-search"]')!;
    input.value = 'databehandler';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(keys('')).toEqual(['privacy.processors']);
    expect(el.querySelector('[data-testid="registers-folded"]')).toBeNull();
  });

  it('pins and unpins through the shell preferences, by route path', () => {
    const { fixture, keys, prefs, pinButton } = setup();
    pinButton('assets.calibration').click();
    fixture.detectChanges();
    expect(prefs.setPins).toHaveBeenLastCalledWith([
      'risk/risks',
      'assets',
      'assets/access-reviews',
      'assets/changes',
      'assets/calibration',
    ]);
    expect(keys('[data-testid="registers-pinned"]')).toContain('assets.calibration');
    // Five pinned: the rest cannot be pinned until one is unpinned.
    expect(pinButton('deviations.register').disabled).toBe(true);
    pinButton('risk.risks').click();
    fixture.detectChanges();
    expect(prefs.setPins).toHaveBeenLastCalledWith([
      'assets',
      'assets/access-reviews',
      'assets/changes',
      'assets/calibration',
    ]);
    expect(pinButton('deviations.register').disabled).toBe(false);
  });

  it('drops pins it cannot show on the next change', () => {
    const { keys, prefs, pinButton } = setup(undefined, { pins: ['gone/away', 'deviations'] });
    expect(keys('[data-testid="registers-pinned"]')).toEqual(['deviations.register']);
    pinButton('assets.changes').click();
    expect(prefs.setPins).toHaveBeenLastCalledWith(['deviations', 'assets/changes']);
  });

  it('waits for the preferences before pins can change', () => {
    const { pinButton } = setup(undefined, { loaded: false });
    expect(pinButton('assets.calibration').disabled).toBe(true);
  });

  it('offers a retry when the counts cannot be read', () => {
    const { el } = setup(vi.fn(() => throwError(() => new Error('down'))));
    expect(el.querySelector('[data-testid="error-retry"]')).not.toBeNull();
  });
});

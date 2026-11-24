import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../assets/i18n/en.json';
import nb from '../../assets/i18n/nb.json';
import shellEn from '../../assets/i18n/shell/en.json';
import shellNb from '../../assets/i18n/shell/nb.json';
import { APP_CONFIG } from '../core/config/app-config';
import { LanguageService } from '../core/i18n/language.service';
import { formatLocalDate } from '../shared/locale/locale-pipes';
import { LanguageSwitcher } from '../shared/language-switcher/language-switcher';
import { AREAS, AreaContext, activeAreaKey, itemVisible, visibleAreas } from './areas';
import { NAV_ITEMS } from './nav';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const lookup = (obj: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

/** Every key path of a nested translation object, sorted. */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj)
    .flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
    .sort();
}

const ALL_ON: AreaContext = {
  isEnabled: () => true,
  permissions: [
    ...NAV_ITEMS.flatMap((i) => (typeof i.permission === 'string' ? [i.permission] : [])),
    'tasks:read',
    'deviations:intake',
  ],
  superuser: false,
};

describe('IA v2 areas (docs/ia-v2.md §2)', () => {
  it('has the nine areas of the prototype, in order', () => {
    expect(AREAS.map((a) => a.key)).toEqual([
      'home',
      'speakUp',
      'annual',
      'company',
      'people',
      'contacts',
      'handbook',
      'documents',
      'reports',
    ]);
    expect(AREAS.map((a) => lookup(nb, a.labelKey))).toEqual([
      'Oversikt',
      'Avvik',
      'Årshjul',
      'Bedriften',
      'Folk',
      'Kontakter',
      'Håndbok',
      'Dokumenter',
      'Rapporter',
    ]);
    // Oversikt has no dropdown, like the prototype.
    expect(AREAS[0].items).toEqual([]);
  });

  it('has every area and dropdown label and hint in both languages', () => {
    for (const area of AREAS) {
      const keys = [area.labelKey, ...area.items.flatMap((i) => [i.labelKey, i.hintKey])];
      for (const key of keys) {
        expect(typeof lookup(en, key), `en ${key}`).toBe('string');
        expect(typeof lookup(nb, key), `nb ${key}`).toBe('string');
      }
    }
    for (const kind of ['core', 'management', 'support']) {
      expect(typeof lookup(nb, `nav.areas.handbook.kinds.${kind}`)).toBe('string');
    }
    expect(lookup(nb, 'nav.areas.seeAll')).toBe('Se hele oversikten →');
  });

  it('keeps the global nav.areas and the shell scope at key parity', () => {
    expect(keyPaths(lookup(en, 'nav.areas'))).toEqual(keyPaths(lookup(nb, 'nav.areas')));
    expect(keyPaths(shellEn)).toEqual(keyPaths(shellNb));
    expect(lookup(shellNb, 'showRequirements.label')).toBe('Vis krav');
    expect(lookup(shellNb, 'ask.label')).toBe('Spør CoreFlow');
  });

  it('uses the prototype wording in the dropdowns', () => {
    const label = (area: string, item: string) => lookup(nb, `nav.areas.${area}.items.${item}`);
    expect(label('speakUp', 'cases')).toEqual({
      label: 'Alle saker',
      hint: 'Avvik, hendelser, brudd og klager',
    });
    expect(label('reports', 'standards')).toEqual({
      label: 'Standarder (ekspertvisning)',
      hint: 'Krav for krav, for revisorer og konsulenter',
    });
  });

  it('hides items whose module is off or permission missing, never an open overview', () => {
    const areas = visibleAreas(AREAS, {
      isEnabled: (m) => m !== 'audits' && m !== 'processes',
      permissions: ['inspections:read'],
      superuser: false,
    });
    const annual = areas.find((a) => a.key === 'annual')!;
    expect(annual.items.map((i) => i.key)).toEqual(['cycle', 'inspections']);
    // Every overview except Håndbok is open to all; Håndbok needs the processes module.
    expect(areas.map((a) => a.key)).not.toContain('handbook');
    expect(areas).toHaveLength(8);
    // Reports: the four recipients are for everyone, the expert view needs standards:read.
    expect(areas.find((a) => a.key === 'reports')!.items.map((i) => i.key)).toEqual([
      'auditor',
      'authority',
      'board',
      'people',
    ]);
  });

  it('shows everything to a user with every module and permission', () => {
    const areas = visibleAreas(AREAS, ALL_ON);
    expect(areas).toHaveLength(9);
    for (const area of areas) {
      expect(area.items.length).toBe(AREAS.find((a) => a.key === area.key)!.items.length);
    }
  });

  it('shows Fagområder while any topic module is on and readable', () => {
    const topics = AREAS.find((a) => a.key === 'company')!.items.find((i) => i.key === 'topics')!;
    const ctx = (mods: string[], perms: string[]): AreaContext => ({
      isEnabled: (m) => mods.includes(m),
      permissions: perms,
      superuser: false,
    });
    expect(itemVisible(topics, ctx(['environment'], ['environment:read']))).toBe(true);
    expect(itemVisible(topics, ctx([], ['environment:read']))).toBe(false);
    expect(itemVisible(topics, ctx(['privacy'], []))).toBe(false);
  });

  it('highlights the area of a URL by its longest prefix (§2.1)', () => {
    const cases: [string, string | null][] = [
      ['/home', 'home'],
      ['/dashboard', 'home'],
      ['/my-work?tab=overdue', 'home'],
      ['/tasks/abc', 'home'],
      ['/tasks/recurring', 'annual'],
      ['/chat/123', 'home'],
      ['/speak-up', 'speakUp'],
      ['/cases?tab=mine', 'speakUp'],
      ['/deviations/123', 'speakUp'],
      ['/privacy/breaches/1', 'speakUp'],
      ['/privacy/processors/1', 'contacts'],
      ['/privacy/ropa', 'company'],
      ['/privacy', 'company'],
      ['/feedback/items/1', 'speakUp'],
      ['/feedback', 'contacts'],
      ['/feedback/surveys/1', 'contacts'],
      ['/annual-cycle', 'annual'],
      ['/audits/plans/1', 'annual'],
      ['/management-review/reviews', 'annual'],
      ['/context/policies', 'company'],
      ['/company/topics', 'company'],
      ['/assets/123', 'company'],
      ['/assets/access-reviews/1', 'people'],
      ['/people', 'people'],
      ['/training/courses/1', 'people'],
      ['/hse/sja', 'people'],
      ['/contacts/acme', 'contacts'],
      ['/suppliers/1', 'contacts'],
      ['/contracts', 'contacts'],
      ['/handbook/p1', 'handbook'],
      ['/processes/1/map', 'handbook'],
      ['/documents/all?kind=policy', 'documents'],
      ['/reports?to=auditor', 'reports'],
      ['/library/saved', 'reports'],
      ['/standards/iso27001', 'reports'],
      ['/registers', 'reports'],
      ['/settings/modules', null],
      ['/account/learning', null],
      ['/admin/organizations', null],
      ['/peoplex', null],
    ];
    for (const [url, key] of cases) {
      expect(activeAreaKey(url), url).toBe(key);
    }
  });
});

describe('nav.ts module metadata (still read by search and the assistant)', () => {
  it('labels every module with modules.names.<key> in both languages', () => {
    for (const item of NAV_ITEMS.filter((i) => i.module)) {
      expect(item.labelKey).toBe(`modules.names.${item.module}`);
      expect(typeof lookup(en, item.labelKey), `en ${item.labelKey}`).toBe('string');
      expect(typeof lookup(nb, item.labelKey), `nb ${item.labelKey}`).toBe('string');
    }
  });
});

describe('LanguageSwitcher', () => {
  it('selects the active language and shows autonyms', async () => {
    TestBed.configureTestingModule({
      imports: [
        LanguageSwitcher,
        TranslocoTestingModule.forRoot({
          langs: { en, nb },
          translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: 'http://test/api', i18n: { availableLanguages: ['en', 'nb'] } },
        },
      ],
    });
    TestBed.inject(LanguageService).use('nb');
    const fixture = TestBed.createComponent(LanguageSwitcher);
    await fixture.whenStable();
    await tick();
    await fixture.whenStable();
    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    expect(select.value).toBe('nb');
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual([
      'English',
      'Norsk (bokmål)',
    ]);
    localStorage.clear();
  });
});

describe('localDate default format', () => {
  it('shows date-times without seconds and keeps bare dates as dates', () => {
    expect(formatLocalDate('2026-12-06T10:00:00', 'dateTime', 'nb')).toMatch(
      /^6\. des\. 2026, \d{2}:00$/,
    );
    expect(formatLocalDate('2026-12-06T10:00:00', 'medium', 'nb')).not.toMatch(/:\d{2}:\d{2}/);
    expect(formatLocalDate('2026-12-06', 'dateTime', 'nb')).toBe('6. des. 2026');
  });
});

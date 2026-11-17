import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../assets/i18n/en.json';
import nb from '../../assets/i18n/nb.json';
import { AuthService } from '../core/auth/auth.service';
import { APP_CONFIG } from '../core/config/app-config';
import { LanguageService } from '../core/i18n/language.service';
import { ModuleService } from '../core/modules/module.service';
import { InboxService } from '../core/notifications/inbox.service';
import { SelectedOrgService } from '../core/org/selected-org.service';
import { formatLocalDate } from '../shared/locale/locale-pipes';
import { LanguageSwitcher } from '../shared/language-switcher/language-switcher';
import { LEARNING_NAV_ITEM, NAV_ITEMS, NAV_SECTIONS } from './nav';
import { NavDrawerService } from './nav-drawer.service';
import { SideNav } from './side-nav/side-nav';

const ALL_READ = [
  'dashboard:view',
  ...NAV_ITEMS.flatMap((i) => (typeof i.permission === 'string' ? [i.permission] : [])),
];

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const lookup = (obj: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

function configure(imports: unknown[], orgId = 'org-1', permissions: string[] = []) {
  TestBed.configureTestingModule({
    imports: [
      ...(imports as never[]),
      TranslocoTestingModule.forRoot({
        langs: { en, nb },
        translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: APP_CONFIG,
        useValue: { apiBaseUrl: 'http://test/api', i18n: { availableLanguages: ['en', 'nb'] } },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(orgId).asReadonly(),
          currentOrg: signal({ id: orgId, name: 'Org', roles: [], permissions }).asReadonly(),
        },
      },
      { provide: ModuleService, useValue: { isEnabled: () => true } },
      {
        provide: InboxService,
        useValue: {
          unreadByOrg: signal(new Map<string, number>()).asReadonly(),
          unreadElsewhere: signal(0).asReadonly(),
          refreshByOrg: () => undefined,
        },
      },
      {
        provide: AuthService,
        useValue: { isSuperuser: signal(false), displayName: signal('Kari Nordmann') },
      },
    ],
  });
}

describe('Navigation structure', () => {
  it('follows the adopted IA, standards first under "Krav og styring"', () => {
    expect(NAV_SECTIONS.map((s) => s.labelKey)).toEqual([
      'nav.sections.home',
      'nav.sections.governance',
      'nav.sections.operations',
      'nav.sections.followUp',
      'nav.sections.topics',
      'nav.sections.people',
    ]);
    expect(NAV_SECTIONS[1].items[0].path).toBe('standards');
    expect(NAV_ITEMS.some((i) => i.path === 'review')).toBe(false);
  });

  it('labels every module with modules.names.<key> and uses distinct icons', () => {
    for (const item of NAV_ITEMS.filter((i) => i.module)) {
      expect(item.labelKey).toBe(`modules.names.${item.module}`);
    }
    const icons = NAV_ITEMS.map((i) => i.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('has every nav label in both languages', () => {
    const keys = [
      ...NAV_SECTIONS.map((s) => s.labelKey),
      ...NAV_ITEMS.map((i) => i.labelKey),
      LEARNING_NAV_ITEM.labelKey,
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(nb, key), `nb ${key}`).toBe('string');
    }
    expect(lookup(nb, 'modules.names.obligations')).toBe('Lover og forskrifter');
    expect(lookup(nb, 'modules.names.standards')).toBe('Standarder og krav');
  });
});

describe('NavDrawerService', () => {
  afterEach(() => localStorage.clear());

  it('remembers hidden items and collapsed sections per org', () => {
    configure([], 'org-a');
    const drawer = TestBed.inject(NavDrawerService);
    drawer.toggleHidden('risk');
    drawer.toggleCollapsed('nav.sections.people');
    expect(drawer.hidden().has('risk')).toBe(true);
    expect(JSON.parse(localStorage.getItem('coreflow.nav.hidden.org-a')!)).toEqual(['risk']);
    expect(JSON.parse(localStorage.getItem('coreflow.nav.collapsed.org-a')!)).toEqual([
      'nav.sections.people',
    ]);
    drawer.toggleHidden('risk');
    expect(drawer.hidden().has('risk')).toBe(false);
  });

  it('reads the stored state on start', () => {
    localStorage.setItem('coreflow.nav.hidden.org-b', JSON.stringify(['hse']));
    configure([], 'org-b');
    expect(TestBed.inject(NavDrawerService).hidden().has('hse')).toBe(true);
  });
});

describe('SideNav', () => {
  afterEach(() => localStorage.clear());

  it('shows sections, the learning centre and a customize mode without buttons in links', async () => {
    configure([SideNav], 'org-1', ALL_READ);
    const fixture = TestBed.createComponent(SideNav);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Standards and requirements');
    expect(el.textContent).toContain('Learning centre');
    expect(el.querySelector('a button')).toBeNull();

    el.querySelector<HTMLElement>('[data-testid="nav-customize"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('a button')).toBeNull();
    const toggle = el.querySelector<HTMLElement>('[data-testid="nav-toggle-risk"]')!;
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-label')).toBe('Show Risks and opportunities in the menu');
    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    el.querySelector<HTMLElement>('[data-testid="nav-customize"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('a[href="/risk"]')).toBeNull();
    expect(el.querySelector('a[href="/standards"]')).not.toBeNull();
  });

  it('collapses a section', async () => {
    configure([SideNav], 'org-1', ALL_READ);
    const fixture = TestBed.createComponent(SideNav);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const header = el.querySelector<HTMLElement>(
      '[data-testid="nav-section-nav.sections.people"]',
    )!;
    expect(header.getAttribute('aria-expanded')).toBe('true');
    header.click();
    await fixture.whenStable();
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('a[href="/training"]')).toBeNull();
  });
});

describe('LanguageSwitcher', () => {
  it('selects the active language and shows autonyms', async () => {
    configure([LanguageSwitcher]);
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

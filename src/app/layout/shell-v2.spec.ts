import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Routes, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../assets/i18n/en.json';
import nb from '../../assets/i18n/nb.json';
import shellEn from '../../assets/i18n/shell/en.json';
import shellNb from '../../assets/i18n/shell/nb.json';
import { AuthService } from '../core/auth/auth.service';
import { ModuleService } from '../core/modules/module.service';
import { SelectedOrgService } from '../core/org/selected-org.service';
import { ShellPreferencesService } from '../core/shell/shell-preferences.service';
import { LEARNING_NAV_ITEM, MODULE_NAV_ITEMS, NAV_ITEMS, SETTINGS_NAV_ITEM } from './nav';
import {
  NAV_DESTINATIONS,
  PIN_TARGETS,
  REGISTER_ACTIONS,
  ROLE_DEFAULT_PINS,
  defaultPins,
  hasShellRoute,
  navWorkspace,
  registerGroups,
} from './nav-v2';
import { SideNavV2 } from './side-nav-v2/side-nav-v2';

type Tree = Record<string, unknown>;

const lookup = (obj: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Tree | undefined)?.[k], obj);

function shape(value: unknown, path = ''): string[] {
  if (value && typeof value === 'object') {
    return Object.entries(value as Tree).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  }
  return [path];
}

/** Every module read permission plus the platform pages and the create permissions. */
const ADMIN_PERMISSIONS = [
  'dashboard:view',
  'org:manage',
  'tasks:write',
  ...MODULE_NAV_ITEMS.map((i) => i.permission as string),
  ...REGISTER_ACTIONS.map((a) => a.permission),
];

/** The seeded `member` role plus module reads (what the demo employee holds). */
const MEMBER_PERMISSIONS = [
  'dashboard:view',
  'documents:read',
  'deviations:read',
  'deviations:write',
  'standards:read',
  'risk:read',
  'privacy:read',
  'hse:read',
  'assets:read',
];

function render(opts: {
  roles: string[];
  permissions: string[];
  pins?: string[] | null;
  showAll?: boolean;
  routes?: Routes;
  url?: string;
}) {
  TestBed.configureTestingModule({
    imports: [
      SideNavV2,
      TranslocoTestingModule.forRoot({
        langs: { en, 'shell/en': shellEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(opts.routes ?? []),
      { provide: ModuleService, useValue: { isEnabled: () => true } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1').asReadonly(),
          currentOrg: signal({
            id: 'org-1',
            name: 'Org',
            roles: opts.roles,
            permissions: opts.permissions,
          }).asReadonly(),
          orgs: signal([]).asReadonly(),
        },
      },
      {
        provide: AuthService,
        useValue: {
          isSuperuser: signal(false),
          displayName: signal('Kari Nordmann'),
          isAuthenticated: signal(false),
          user: signal(null),
        },
      },
      {
        provide: ShellPreferencesService,
        useValue: {
          pins: signal(opts.pins ?? null).asReadonly(),
          showAll: signal(opts.showAll ?? false).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SideNavV2);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const destinations = Array.from(
    el.querySelectorAll<HTMLAnchorElement>('[data-testid^="nav-v2-"]'),
  ).filter((a) => !a.dataset['testid']!.startsWith('nav-v2-pin:'));
  const pins = Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-testid^="nav-v2-pin:"]'));
  const registrer = el.querySelector('[data-testid="nav-registrer"]');
  return { fixture, el, destinations, pins, registrer };
}

describe('Shell v2 navigation data', () => {
  it('maps roles to workspaces', () => {
    expect(navWorkspace(['member'], ['dashboard:view'])).toBe('employee');
    expect(navWorkspace([], [])).toBe('employee');
    expect(navWorkspace(['member', 'dpo'], [])).toBe('lead');
    expect(navWorkspace(['member'], ['org:manage'])).toBe('lead');
    expect(navWorkspace(['auditor'], [])).toBe('auditor');
    expect(navWorkspace(['custom_role'], [])).toBe('lead');
  });

  it('loses no old nav target: each is a destination, a register or behind "?"', () => {
    const destinationPaths = new Set(NAV_DESTINATIONS.map((d) => d.path));
    for (const hasLibrary of [false, true]) {
      const registerModules = registerGroups(hasLibrary).flatMap((g) => g.modules);
      // Registre lists each module exactly once.
      expect(new Set(registerModules).size).toBe(registerModules.length);
      for (const item of NAV_ITEMS) {
        const reachable =
          destinationPaths.has(item.path) ||
          registerModules.includes(item.module ?? '') ||
          (hasLibrary && ['documents', 'reports'].includes(item.module ?? ''));
        expect(reachable, `${item.path} (library: ${hasLibrary})`).toBe(true);
      }
    }
    expect(destinationPaths.has(SETTINGS_NAV_ITEM.path)).toBe(true);
    // The learning centre moved to the "?" menu (layout/help-menu).
    expect(LEARNING_NAV_ITEM.path).toBe('account/learning');
  });

  it('resolves every role default pin and caps the defaults at five', () => {
    for (const pins of Object.values(ROLE_DEFAULT_PINS)) {
      for (const key of pins) {
        expect(PIN_TARGETS.has(key), key).toBe(true);
      }
    }
    expect(defaultPins(['dpo', 'hse_manager', 'quality_manager'])).toEqual([
      'privacy/ropa',
      'privacy/breaches',
      'hse/sja',
      'deviations',
      'audits',
    ]);
    expect(defaultPins(['admin'])).toEqual([]);
  });

  it('detects shell child routes', () => {
    expect(hasShellRoute([{ path: '', children: [{ path: 'library' }] }], 'library')).toBe(true);
    expect(hasShellRoute([{ path: '', children: [{ path: 'registers' }] }], 'library')).toBe(false);
  });

  it('has every shell key in en and nb with the same structure', () => {
    expect(shape(shellNb).sort()).toEqual(shape(shellEn).sort());
    const keys = [
      ...NAV_DESTINATIONS.map((d) => d.labelKey),
      ...REGISTER_ACTIONS.map((a) => a.labelKey),
      ...registerGroups(false).map((g) => g.labelKey),
      ...[...PIN_TARGETS.values()].map((t) => t.labelKey),
    ];
    for (const key of keys) {
      const [scope, ...rest] = key.split('.');
      const [enTree, nbTree, path] =
        scope === 'shell' ? [shellEn, shellNb, rest.join('.')] : [en, nb, key];
      expect(typeof lookup(enTree, path), `en ${key}`).toBe('string');
      expect(typeof lookup(nbTree, path), `nb ${key}`).toBe('string');
    }
    for (const item of MODULE_NAV_ITEMS) {
      expect(typeof lookup(nb, `modules.descriptions.${item.module}`), item.module).toBe('string');
    }
    expect(lookup(shellNb, 'nav.library')).toBe('Dokumenter og rapporter');
    expect(lookup(shellNb, 'search.placeholder')).toBe('Finn eller spør …');
  });
});

describe('SideNavV2', () => {
  it('gives the admin seven entries: Registrer plus six destinations, and no pins', () => {
    const { destinations, pins, registrer } = render({
      roles: ['admin'],
      permissions: ADMIN_PERMISSIONS,
    });
    expect(registrer).not.toBeNull();
    expect(destinations.map((a) => a.dataset['testid'])).toEqual([
      'nav-v2-home',
      'nav-v2-myWork',
      'nav-v2-standards',
      'nav-v2-registers',
      'nav-v2-library',
      'nav-v2-settings',
    ]);
    expect(1 + destinations.length).toBe(7);
    expect(pins).toHaveLength(0);
    // Until the /library hub ships, "Dokumenter og rapporter" opens Documents.
    expect(destinations[4].getAttribute('href')).toBe('/documents');
  });

  it('opens /library once that route exists', () => {
    const { destinations } = render({
      roles: ['admin'],
      permissions: ADMIN_PERMISSIONS,
      routes: [{ path: '', children: [{ path: 'library', children: [] }] }],
    });
    expect(
      destinations.find((a) => a.dataset['testid'] === 'nav-v2-library')!.getAttribute('href'),
    ).toBe('/library');
  });

  it('gives an employee four entries, and "Vis alt" shows the rest', () => {
    const employee = render({ roles: ['member'], permissions: MEMBER_PERMISSIONS });
    expect(employee.registrer).not.toBeNull();
    expect(employee.destinations.map((a) => a.dataset['testid'])).toEqual([
      'nav-v2-home',
      'nav-v2-myWork',
      'nav-v2-library',
    ]);
    expect(1 + employee.destinations.length).toBeLessThanOrEqual(4);
    TestBed.resetTestingModule();

    const all = render({ roles: ['member'], permissions: MEMBER_PERMISSIONS, showAll: true });
    expect(all.destinations.map((a) => a.dataset['testid'])).toEqual([
      'nav-v2-home',
      'nav-v2-myWork',
      'nav-v2-standards',
      'nav-v2-registers',
      'nav-v2-library',
    ]);
  });

  it('only offers create forms the user may open', () => {
    const { el } = render({ roles: ['member'], permissions: MEMBER_PERMISSIONS });
    const actions = Array.from(el.querySelectorAll('[data-testid^="registrer-"]')).map((a) =>
      a.getAttribute('data-testid'),
    );
    expect(actions).toEqual(['registrer-deviation']);
    expect(el.querySelector('[data-testid="registrer-deviation"]')!.getAttribute('href')).toBe(
      '/deviations/new',
    );
  });

  it('hides Registrer when the user may not create anything', () => {
    const { registrer } = render({ roles: ['auditor'], permissions: ['dashboard:view'] });
    expect(registrer).toBeNull();
  });

  it('pins the role defaults, or the user own pins, skipping what the user cannot open', () => {
    const dpo = render({ roles: ['dpo'], permissions: ADMIN_PERMISSIONS });
    expect(dpo.pins.map((a) => a.getAttribute('href'))).toEqual([
      '/privacy/ropa',
      '/privacy/breaches',
    ]);
    expect(dpo.pins[0].textContent).toContain('Record of processing');
    TestBed.resetTestingModule();

    const own = render({
      roles: ['dpo'],
      permissions: ['dashboard:view', 'risk:read'],
      pins: ['risk', 'audits', 'unknown/key'],
    });
    expect(own.pins.map((a) => a.getAttribute('href'))).toEqual(['/risk']);
    TestBed.resetTestingModule();

    const none = render({ roles: ['dpo'], permissions: ADMIN_PERMISSIONS, pins: [] });
    expect(none.pins).toHaveLength(0);
  });

  it('marks Registre as current inside a register, and a pin over its module', async () => {
    const { fixture, el } = render({
      roles: ['dpo'],
      permissions: ADMIN_PERMISSIONS,
      routes: [{ path: '**', children: [] }],
    });
    const router = TestBed.inject((await import('@angular/router')).Router);
    await router.navigateByUrl('/risk/risks');
    fixture.detectChanges();
    expect(el.querySelector('[aria-current="page"]')?.getAttribute('data-testid')).toBe(
      'nav-v2-registers',
    );
    await router.navigateByUrl('/privacy/ropa/abc');
    fixture.detectChanges();
    expect(el.querySelector('[aria-current="page"]')?.getAttribute('data-testid')).toBe(
      'nav-v2-pin:privacy/ropa',
    );
  });
});

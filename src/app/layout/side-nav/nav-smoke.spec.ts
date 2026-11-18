import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Event,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  Route,
  Router,
  Routes,
  provideRouter,
} from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { filter, firstValueFrom } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { ModuleService } from '../../core/modules/module.service';
import { InboxService } from '../../core/notifications/inbox.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ADMIN_SECTION, LEARNING_NAV_ITEM, NAV_ITEMS, NavItem, SETTINGS_NAV_ITEM } from '../nav';
import { SideNav } from './side-nav';

/**
 * Nav smoke test (U01): click every sidebar link, for several roles, against the real
 * route table, and check where it lands. Guards and page components are stubbed out
 * (this is about the URL a link produces and the route it matches), but the lazy
 * feature route files are the real ones, so a link to a path that no route knows
 * falls through to the app's `**` redirect and lands on the dashboard, as the
 * `/account%2Flearning` link once did.
 */

@Component({ selector: 'app-stub-page', template: '' })
class StubPage {}

type LoadChildren = NonNullable<Route['loadChildren']>;

/** A route table with the same paths and redirects, no guards and stub pages. */
function stubRoutes(table: Routes): Routes {
  return table.map((route) => {
    const stub: Route = {
      path: route.path,
      matcher: route.matcher,
      pathMatch: route.pathMatch,
      redirectTo: route.redirectTo,
      outlet: route.outlet,
    };
    if (route.component || route.loadComponent) {
      stub.component = StubPage;
    }
    if (route.children) {
      stub.children = stubRoutes(route.children);
    }
    if (route.loadChildren) {
      stub.loadChildren = stubLoader(route.loadChildren);
    }
    return stub;
  });
}

function stubLoader(load: LoadChildren): LoadChildren {
  return async () => {
    const loaded = (await (load as () => Promise<unknown>)()) as Routes | { default: Routes };
    return stubRoutes(Array.isArray(loaded) ? loaded : loaded.default);
  };
}

/** The path (no leading slash, query or fragment) a router URL points at. */
function pathOf(url: string): string {
  return decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\//, '');
}

interface Persona {
  readonly name: string;
  readonly superuser: boolean;
  readonly permissions: readonly string[];
}

const MODULE_READ = NAV_ITEMS.flatMap((i) =>
  typeof i.permission === 'string' ? [i.permission] : [],
);

const PERSONAS: readonly Persona[] = [
  {
    name: 'super admin',
    superuser: true,
    permissions: ['dashboard:view', 'org:manage', 'tasks:read', ...MODULE_READ],
  },
  {
    name: 'quality lead',
    superuser: false,
    permissions: ['dashboard:view', 'users:invite', 'tasks:read', ...MODULE_READ],
  },
  {
    name: 'employee',
    superuser: false,
    permissions: ['dashboard:view', 'deviations:read', 'documents:read', 'training:read'],
  },
  { name: 'no permissions', superuser: false, permissions: [] },
];

function configure(persona: Persona) {
  TestBed.configureTestingModule({
    imports: [
      SideNav,
      TranslocoTestingModule.forRoot({
        langs: { en, nb },
        translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(stubRoutes(routes)),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: APP_CONFIG,
        useValue: { apiBaseUrl: 'http://test/api', i18n: { availableLanguages: ['en', 'nb'] } },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1').asReadonly(),
          currentOrg: signal({
            id: 'org-1',
            name: 'Org',
            roles: [],
            permissions: [...persona.permissions],
          }).asReadonly(),
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
        useValue: {
          isSuperuser: signal(persona.superuser),
          displayName: signal('Kari Nordmann'),
          orgs: signal({}),
        },
      },
    ],
  });
}

/** Every item the sidebar can link to, keyed by path. */
const ALL_ITEMS = new Map<string, NavItem>(
  [...NAV_ITEMS, LEARNING_NAV_ITEM, SETTINGS_NAV_ITEM, ...ADMIN_SECTION.items].map((i) => [
    i.path,
    i,
  ]),
);

async function click(router: Router, link: HTMLAnchorElement): Promise<Event> {
  const done = firstValueFrom(
    router.events.pipe(
      filter(
        (e) =>
          e instanceof NavigationEnd ||
          e instanceof NavigationError ||
          e instanceof NavigationCancel,
      ),
    ),
  );
  link.click();
  return done;
}

describe('Side nav smoke test', () => {
  afterEach(() => localStorage.clear());

  for (const persona of PERSONAS) {
    it(`lands every link where it points (${persona.name})`, async () => {
      configure(persona);
      const fixture = TestBed.createComponent(SideNav);
      await fixture.whenStable();
      const router = TestBed.inject(Router);
      const el = fixture.nativeElement as HTMLElement;
      const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('a[href]'));

      // Every role sees at least the learning centre.
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        const href = link.getAttribute('href')!;
        expect(href, 'no encoded slashes in nav links').not.toMatch(/%2F/i);
        const path = pathOf(href);
        expect(ALL_ITEMS.has(path), `${href} is a nav item`).toBe(true);

        const event = await click(router, link);
        expect(event, `${href} navigates`).toBeInstanceOf(NavigationEnd);
        const landed = pathOf(router.url);
        expect(
          landed === path || landed.startsWith(`${path}/`),
          `${href} landed on /${landed}`,
        ).toBe(true);
      }
    });
  }

  it('links the learning centre to /account/learning', async () => {
    configure(PERSONAS[2]);
    const fixture = TestBed.createComponent(SideNav);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector(`a[href="/${LEARNING_NAV_ITEM.path}"]`)).not.toBeNull();
    // The employee sees their modules but not the ones they cannot read.
    expect(el.querySelector('a[href="/deviations"]')).not.toBeNull();
    expect(el.querySelector('a[href="/risk"]')).toBeNull();
    expect(el.querySelector('a[href="/admin/organizations"]')).toBeNull();
  });
});

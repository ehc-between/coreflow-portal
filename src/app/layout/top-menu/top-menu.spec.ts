import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, Routes, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AREAS } from '../areas';
import { TopMenu } from './top-menu';

@Component({ selector: 'app-stub-page', template: '' })
class StubPage {}

type LoadChildren = NonNullable<Route['loadChildren']>;

/** The real route table with the same paths and redirects, no guards and stub pages. */
function stubRoutes(table: Routes): Routes {
  return table.map((route) => {
    const stub: Route = {
      path: route.path,
      matcher: route.matcher,
      pathMatch: route.pathMatch,
      redirectTo: route.redirectTo,
    };
    if (route.component || route.loadComponent) stub.component = StubPage;
    if (route.children) stub.children = stubRoutes(route.children);
    if (route.loadChildren) stub.loadChildren = stubLoader(route.loadChildren);
    return stub;
  });
}

function stubLoader(load: LoadChildren): LoadChildren {
  return async () => {
    const loaded = (await (load as () => Promise<unknown>)()) as Routes | { default: Routes };
    return stubRoutes(Array.isArray(loaded) ? loaded : loaded.default);
  };
}

function configure(opts: { permissions?: string[]; enabled?: (m: string) => boolean } = {}) {
  TestBed.configureTestingModule({
    imports: [
      TopMenu,
      TranslocoTestingModule.forRoot({
        langs: { en, nb },
        translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'nb' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(stubRoutes(routes)),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1').asReadonly(),
          currentOrg: signal({
            id: 'org-1',
            name: 'Org',
            roles: [],
            permissions: opts.permissions ?? ['processes:read', 'audits:read', 'standards:read'],
          }).asReadonly(),
        },
      },
      { provide: ModuleService, useValue: { isEnabled: opts.enabled ?? (() => true) } },
      { provide: AuthService, useValue: { isSuperuser: signal(false) } },
    ],
  });
  const fixture = TestBed.createComponent(TopMenu);
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  return { fixture, el, q, router: TestBed.inject(Router) };
}

/**
 * Targets another IA v2 engineer adds (§9.1): until their route lands, the old route
 * still answers there. Either landing is fine.
 */
const UNTIL_AREA_PAGES: Readonly<Record<string, string>> = {
  // HUBS adds the read view; today the URL forwards to the template settings.
  '/documents/templates': '/settings/modules/documents/templates',
};

/** The path (no query or fragment) of a router URL. */
const pathOf = (url: string) => url.split(/[?#]/)[0];

describe('TopMenu', () => {
  it('renders the nine areas with the label linking to the overview', async () => {
    const { fixture, el, q } = configure();
    await fixture.whenStable();
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Hovedmeny');
    expect(q('area-home')?.textContent?.trim()).toBe('Oversikt');
    expect(q('area-speakUp')?.getAttribute('href')).toBe('/speak-up');
    expect(q('area-handbook')?.getAttribute('href')).toBe('/handbook');
    // Oversikt has no dropdown button; the others do.
    expect(q('area-toggle-home')).toBeNull();
    expect(q('area-toggle-reports')).not.toBeNull();
  });

  it('opens a dropdown from ▾ with the sub-areas and "Se hele oversikten →"', async () => {
    const { fixture, q } = configure();
    await fixture.whenStable();
    const toggle = q<HTMLButtonElement>('area-toggle-annual')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const dd = q('area-dropdown')!;
    expect(dd.getAttribute('role')).toBe('menu');
    const items = Array.from(dd.querySelectorAll('[role="menuitem"]'));
    // Inspections and management review need their read permission (not held here).
    expect(items.map((a) => a.getAttribute('href'))).toEqual([
      '/annual-cycle',
      '/audits',
      '/annual-cycle',
    ]);
    expect(items.at(-1)?.textContent?.trim()).toBe('Se hele oversikten →');
    expect(dd.textContent).toContain('Intern og ekstern revisjon');

    // Clicking ▾ again closes it.
    toggle.click();
    await fixture.whenStable();
    expect(q('area-dropdown')).toBeNull();
  });

  it('opens with the keyboard, moves with arrows and closes on Escape back to ▾', async () => {
    const { fixture, q } = configure();
    await fixture.whenStable();
    const toggle = q<HTMLButtonElement>('area-toggle-reports')!;
    toggle.focus();
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    const dd = q('area-dropdown')!;
    const items = Array.from(dd.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(items[0]);
    dd.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
    dd.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    dd.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items.at(-1));
    dd.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(q('area-dropdown')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('closes on an outside click', async () => {
    const { fixture, q } = configure();
    await fixture.whenStable();
    q<HTMLButtonElement>('area-toggle-reports')!.click();
    await fixture.whenStable();
    expect(q('area-dropdown')).not.toBeNull();
    document.body.click();
    await fixture.whenStable();
    expect(q('area-dropdown')).toBeNull();
  });

  it('adds one row per process to Håndbok, after Prosesskart', async () => {
    const { fixture, q } = configure();
    await fixture.whenStable();
    q<HTMLButtonElement>('area-toggle-handbook')!.click();
    TestBed.inject(HttpTestingController)
      .expectOne('http://test/api/v1/orgs/org-1/processes/handbook')
      .flush({
        management: [{ id: 'm1', title: 'Strategi og mål' }],
        core: [{ id: 'c1', title: 'Salg og tilbud' }],
        support: [],
      });
    await fixture.whenStable();
    const rows = Array.from(q('area-dropdown')!.querySelectorAll('[role="menuitem"]')).map((a) =>
      a.children.length
        ? Array.from(a.children)
            .map((c) => c.textContent?.trim())
            .join(' ')
        : a.textContent?.trim(),
    );
    expect(rows).toEqual([
      'Prosesskart Hele bedriften fra start til slutt',
      'Salg og tilbud Kjerneprosess',
      'Strategi og mål Ledelsesprosess',
      'Alle prosedyrer Instrukser og sjekklister, per prosess',
      'Se hele oversikten →',
    ]);
  });

  it('highlights the area of the current page', async () => {
    const { fixture, q, router } = configure();
    await router.navigateByUrl('/suppliers/abc');
    await fixture.whenStable();
    expect(q('area-contacts')?.getAttribute('aria-current')).toBe('page');
    expect(q('area-home')?.getAttribute('aria-current')).toBeNull();
  });
});

describe('Top menu smoke test: every area and dropdown link resolves', () => {
  it('lands every link on its own path, not on the catch-all', async () => {
    const { router } = configure();
    const paths = new Set(AREAS.flatMap((a) => [a.path, ...a.items.map((i) => i.path)]));
    for (const path of paths) {
      await router.navigateByUrl('/no-access');
      const ok = await router.navigateByUrl(path);
      expect(ok, path).toBe(true);
      const landed = pathOf(router.url);
      // A module landing page may forward to its first tab (`/management-review/reviews`).
      const target = pathOf(path);
      expect(
        landed === target || landed.startsWith(`${target}/`) || UNTIL_AREA_PAGES[path] === landed,
        `${path} → ${landed}`,
      ).toBe(true);
    }
  });

  it('redirects the old landing pages and keeps the query string', async () => {
    const { router } = configure();
    const cases: [string, string][] = [
      ['/', '/home'],
      ['/dashboard', '/home'],
      ['/dashboard?x=1', '/home?x=1'],
      ['/procedures', '/handbook'],
      ['/iso', '/standards'],
      ['/learning', '/account/learning'],
    ];
    for (const [from, to] of cases) {
      await router.navigateByUrl(from);
      expect(router.url, from).toBe(to);
    }
  });

  it('keeps record URLs and module sub-pages working below the hubs', async () => {
    const { router } = configure();
    for (const url of ['/people/employees', '/documents/abc', '/reports/dashboards']) {
      await router.navigateByUrl(url);
      expect(router.url).toBe(url);
    }
  });
});

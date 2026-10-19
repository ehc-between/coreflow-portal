import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  Route,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { firstValueFrom, isObservable, Observable, Subject } from 'rxjs';
import { routes as appRoutes } from '../../app.routes';
import deviationRoutes from '../../features/deviations/deviations.routes';
import documentRoutes from '../../features/documents/documents.routes';
import { NAV_ITEMS } from '../../layout/nav';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { AuthUser } from './auth.models';
import { AuthService } from './auth.service';
import { FORBIDDEN_MESSAGE_KEY, permissionGuard } from './permission.guard';

type GuardResult = boolean | UrlTree;

/** Minimal AuthService stand-in: the real SelectedOrgService runs on top of it. */
class FakeAuth {
  readonly _token = signal<string | null>(null);
  readonly _user = signal<AuthUser | null>(null);
  readonly isAuthenticated = computed(() => this._token() !== null);
  readonly user = this._user.asReadonly();
  readonly orgs = computed(() => this._user()?.orgs ?? {});
  restore$ = new Subject<boolean>();
  restoreSession = vi.fn(() => this.restore$.asObservable());

  signIn(user: AuthUser): void {
    this._token.set('token');
    this._user.set(user);
  }
}

function user(orgs: Record<string, readonly string[]>, id = 'u1'): AuthUser {
  return {
    id,
    email: `${id}@example.com`,
    full_name: id,
    is_superuser: false,
    orgs: Object.fromEntries(
      Object.entries(orgs).map(([orgId, permissions]) => [
        orgId,
        { name: orgId, roles: [], permissions },
      ]),
    ),
  };
}

describe('permissionGuard', () => {
  let auth: FakeAuth;
  let notifications: NotificationService;
  let router: Router;

  beforeEach(() => {
    globalThis.localStorage?.clear();
    auth = new FakeAuth();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    notifications = TestBed.inject(NotificationService);
    router = TestBed.inject(Router);
  });

  function run(guard: CanActivateFn): GuardResult | Observable<GuardResult> {
    return TestBed.runInInjectionContext(
      () =>
        guard({} as ActivatedRouteSnapshot, { url: '/x' } as RouterStateSnapshot) as
          | GuardResult
          | Observable<GuardResult>,
    );
  }

  function url(result: GuardResult | Observable<GuardResult>): string | boolean {
    expect(isObservable(result)).toBe(false);
    const value = result as GuardResult;
    return value instanceof UrlTree ? router.serializeUrl(value) : value;
  }

  it('allows a user holding the permission in the selected org', () => {
    auth.signIn(user({ a: ['documents:draft'] }));
    expect(url(run(permissionGuard('documents:draft')))).toBe(true);
    expect(notifications.notifications()).toEqual([]);
  });

  it('redirects to the dashboard with a warning by default', () => {
    auth.signIn(user({ a: ['documents:read'] }));
    expect(url(run(permissionGuard('documents:draft')))).toBe('/dashboard');
    expect(notifications.notifications().map((n) => n.message)).toEqual([FORBIDDEN_MESSAGE_KEY]);
  });

  it('honours redirectTo and notify: false', () => {
    auth.signIn(user({ a: [] }));
    const guard = permissionGuard('dashboard:view', { redirectTo: '/my-work', notify: false });
    expect(url(run(guard))).toBe('/my-work');
    expect(notifications.notifications()).toEqual([]);
  });

  it('shows the warning once across a redirect chain', () => {
    auth.signIn(user({ a: [] }));
    run(permissionGuard('documents:draft', { redirectTo: '/documents' }));
    run(permissionGuard('documents:read'));
    expect(notifications.notifications()).toHaveLength(1);
  });

  it('evaluates against the selected org, not any org', () => {
    auth.signIn(user({ a: [], b: ['deviations:admin'] }));
    const selectedOrg = TestBed.inject(SelectedOrgService);
    const guard = permissionGuard('deviations:admin', { redirectTo: '/deviations' });

    expect(selectedOrg.currentOrgId()).toBe('a');
    expect(url(run(guard))).toBe('/deviations');

    selectedOrg.setCurrentOrg('b');
    expect(url(run(guard))).toBe(true);
  });

  it('waits for session restore on a hard refresh and does not falsely redirect', async () => {
    const result = run(permissionGuard('deviations:write'));
    expect(isObservable(result)).toBe(true);
    const pending = firstValueFrom(result as Observable<GuardResult>);

    // Silent refresh resolves: session + user applied, then the shared
    // refresh observable emits. No change detection / effects run in between.
    auth.signIn(user({ a: ['deviations:write'] }));
    auth.restore$.next(true);

    expect(await pending).toBe(true);
    expect(auth.restoreSession).toHaveBeenCalledTimes(1);
  });

  it('honours the persisted org choice on a hard refresh', async () => {
    globalThis.localStorage?.setItem('coreflow.org.u1', 'b');
    const pending = firstValueFrom(
      run(permissionGuard('deviations:admin')) as Observable<GuardResult>,
    );
    auth.signIn(user({ a: [], b: ['deviations:admin'] }));
    auth.restore$.next(true);
    expect(await pending).toBe(true);
  });

  it('sends an unauthenticated user to login when restore fails', async () => {
    const pending = firstValueFrom(
      run(permissionGuard('documents:read')) as Observable<GuardResult>,
    );
    auth.restore$.next(false);
    const result = await pending;
    expect(result instanceof UrlTree && router.serializeUrl(result)).toBe('/login');
    expect(notifications.notifications()).toEqual([]);
  });

  describe('route wiring', () => {
    const shell = appRoutes.find((r) => r.path === '' && r.children)!;

    function find(routes: readonly Route[], path: string): Route {
      const route = routes.find((r) => r.path === path);
      if (!route) {
        throw new Error(`route not found: ${path}`);
      }
      return route;
    }

    /** Runs every canActivate guard on the route; first non-true result wins. */
    function check(route: Route, perms: readonly string[]): string | boolean {
      TestBed.inject(NotificationService).clear();
      auth.signIn(user({ a: perms }));
      const guards = (route.canActivate ?? []) as CanActivateFn[];
      expect(guards.length).toBeGreaterThan(0);
      for (const guard of guards) {
        const result = url(run(guard));
        if (result !== true) {
          return result;
        }
      }
      return true;
    }

    const cases: readonly [string, Route, string, string][] = [
      ['/dashboard', find(shell.children!, 'dashboard'), 'dashboard:view', '/my-work'],
      ['/documents', find(shell.children!, 'documents'), 'documents:read', '/dashboard'],
      ['/deviations', find(shell.children!, 'deviations'), 'deviations:read', '/dashboard'],
      ['/documents/new', find(documentRoutes, 'new'), 'documents:draft', '/documents'],
      ['/documents/:id/edit', find(documentRoutes, ':id/edit'), 'documents:draft', '/documents'],
      ['/deviations/new', find(deviationRoutes, 'new'), 'deviations:write', '/deviations'],
      ['/deviations/types', find(deviationRoutes, 'types'), 'deviations:admin', '/deviations'],
      [
        '/deviations/types/new',
        find(deviationRoutes, 'types/new'),
        'deviations:admin',
        '/deviations',
      ],
      [
        '/deviations/types/:id',
        find(deviationRoutes, 'types/:id'),
        'deviations:admin',
        '/deviations',
      ],
    ];

    for (const [label, route, permission, deniedTo] of cases) {
      it(`${label} requires ${permission}`, () => {
        expect(check(route, [permission])).toBe(true);
        expect(check(route, [])).toBe(deniedTo);
      });
    }

    it('denied users of the default landing page fall back to an unguarded route', () => {
      const fallback = find(shell.children!, 'my-work');
      expect(fallback.canActivate ?? []).toEqual([]);
    });

    it('gates the Documents and Deviations nav items on the read permission', () => {
      const perm = (path: string) => NAV_ITEMS.find((i) => i.path === path)?.permission;
      expect(perm('dashboard')).toBe('dashboard:view');
      expect(perm('documents')).toBe('documents:read');
      expect(perm('deviations')).toBe('deviations:read');
    });
  });
});

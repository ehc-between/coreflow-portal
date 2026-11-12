import { Injectable, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { OrgModule } from './module.models';
import { ModulesApi } from './modules-api';

/** i18n key of the warning shown when a guard turns a user away from a disabled module. */
export const MODULE_DISABLED_MESSAGE_KEY = 'modules.disabledNotice';

/** Where a user lands when a module is disabled. */
export const MODULE_DISABLED_REDIRECT = '/dashboard';

interface LoadedModules {
  readonly orgId: string | null;
  readonly modules: readonly OrgModule[];
}

/**
 * The modules enabled for the selected org. Loads on every org change and on
 * {@link reload}. A key the registry doesn't list counts as enabled (it mirrors
 * the backend gate: modules that aren't built yet are not blocked); while the
 * list is loading, keyed modules count as disabled so a disabled module never
 * flashes into the nav. A failed load (e.g. an older backend) falls back to
 * "everything enabled" rather than hiding the app.
 */
@Injectable({ providedIn: 'root' })
export class ModuleService {
  private readonly api = inject(ModulesApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly state = signal<LoadedModules | null>(null);
  private pending: { readonly orgId: string; readonly request: Observable<boolean> } | null = null;

  /** Modules of the selected org (empty until loaded, or on a failed load). */
  readonly modules: Signal<readonly OrgModule[]> = computed(() => this.current()?.modules ?? []);

  /** True once the list for the selected org has been answered (successfully or not). */
  readonly loaded: Signal<boolean> = computed(() => this.current() !== null);

  /** Keys of the enabled modules of the selected org. */
  readonly enabledKeys: Signal<ReadonlySet<string>> = computed(
    () =>
      new Set(
        this.modules()
          .filter((m) => m.enabled)
          .map((m) => m.key),
      ),
  );

  private readonly known = computed(() => new Set(this.modules().map((m) => m.key)));

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        if (this.state()?.orgId !== orgId) {
          this.ensureLoaded().subscribe();
        }
      });
    });
  }

  /** Whether `key` is enabled for the selected org (reactive: reads signals). */
  isEnabled(key: string): boolean {
    if (!this.loaded()) {
      return false;
    }
    return !this.known().has(key) || this.enabledKeys().has(key);
  }

  /** Re-fetch the list for the selected org (after a change elsewhere). */
  reload(): void {
    this.pending = null;
    const orgId = this.selectedOrg.currentOrgId();
    this.fetch(orgId).subscribe();
  }

  /** Replace one module in place (after `PUT /modules/{key}`). */
  patch(item: OrgModule): void {
    this.state.update((state) =>
      state
        ? { ...state, modules: state.modules.map((m) => (m.key === item.key ? item : m)) }
        : state,
    );
  }

  /** Emits once the selected org's list is loaded (immediately when it already is). */
  ensureLoaded(): Observable<boolean> {
    const orgId = this.selectedOrg.currentOrgId();
    if (this.state()?.orgId === orgId) {
      return of(true);
    }
    if (this.pending && this.pending.orgId === orgId) {
      return this.pending.request;
    }
    return this.fetch(orgId);
  }

  private current(): LoadedModules | null {
    const state = this.state();
    return state && state.orgId === this.selectedOrg.currentOrgId() ? state : null;
  }

  private fetch(orgId: string | null): Observable<boolean> {
    if (!orgId) {
      this.state.set({ orgId: null, modules: [] });
      return of(true);
    }
    const request = this.api.list(orgId).pipe(
      catchError(() => of([] as OrgModule[])),
      tap((modules) => {
        if (this.selectedOrg.currentOrgId() === orgId) {
          this.state.set({ orgId, modules });
        }
      }),
      map(() => true),
      finalize(() => {
        if (this.pending?.orgId === orgId) {
          this.pending = null;
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.pending = { orgId: orgId, request };
    return request;
  }
}

/**
 * Route guard for a module area: waits for the selected org's module list, then
 * allows navigation while `key` is enabled. A disabled module sends the user to
 * the dashboard with a translated notice. Runs after the shell's authGuard, so
 * the session is already restored.
 */
export function moduleGuard(key: string): CanActivateFn {
  return () => {
    const modules = inject(ModuleService);
    const router = inject(Router);
    const notifications = inject(NotificationService);

    const decide = (): boolean | UrlTree => {
      if (modules.isEnabled(key)) {
        return true;
      }
      const alreadyShown = notifications
        .notifications()
        .some((n) => n.message === MODULE_DISABLED_MESSAGE_KEY);
      if (!alreadyShown) {
        notifications.warning(MODULE_DISABLED_MESSAGE_KEY);
      }
      return router.parseUrl(MODULE_DISABLED_REDIRECT);
    };

    if (modules.loaded()) {
      return decide();
    }
    return modules.ensureLoaded().pipe(map(() => decide()));
  };
}

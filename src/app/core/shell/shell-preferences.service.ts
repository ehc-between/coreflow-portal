import { Injectable, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { ShellPreferencesApi } from './shell-preferences-api';
import { MAX_PINS, ShellPreferencesDto, ShellPreferencesUpdate } from './shell-preferences.models';

/** localStorage key caching the effective shell choice per org (`coreflow.nav.v2.<orgId>`). */
export const NAV_V2_CACHE_PREFIX = 'coreflow.nav.v2.';
/** localStorage key of the per-user, per-org "Vis alt" switch (`coreflow.nav.showAll.<orgId>`). */
export const SHOW_ALL_PREFIX = 'coreflow.nav.showAll.';

/**
 * Which shell the signed-in user gets in the selected org, and their pins (U03).
 *
 * The org decides the default (`coreflow.nav.v2`, org settings); a member can switch
 * back to the old menu (or opt in early) for themselves. `navV2` is the effective
 * choice from `GET /me/orgs/{org}/preferences`; until that answers, the last known
 * value for the org (localStorage) avoids a flash of the wrong menu, and without
 * one the old menu shows. Loading fails quietly: the old menu is always safe.
 *
 * `showAll` ("Vis alt") lifts the role-based trimming of the new menu. It is a
 * per-user, per-org choice kept in localStorage (the server has no field for it).
 */
@Injectable({ providedIn: 'root' })
export class ShellPreferencesService {
  private readonly api = inject(ShellPreferencesApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);

  private readonly _prefs = signal<ShellPreferencesDto | null>(null);
  /** Org the loaded preferences belong to. */
  private readonly _prefsOrg = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _showAll = signal<ReadonlyMap<string, boolean>>(new Map());

  private readonly orgId = computed(() => this.selectedOrg.currentOrgId());

  /** Preferences for the current org, or null before they load (or when they failed). */
  private readonly current = computed(() =>
    this._prefsOrg() === this.orgId() ? this._prefs() : null,
  );

  /** True once the current org's preferences have loaded. */
  readonly loaded: Signal<boolean> = computed(() => this.current() !== null);
  readonly saving = this._saving.asReadonly();

  /** Whether the new seven-destination shell is shown. */
  readonly navV2: Signal<boolean> = computed(() => {
    const prefs = this.current();
    if (prefs) {
      return prefs.nav_v2 === true;
    }
    const org = this.orgId();
    return org ? readCache(org) : false;
  });
  /** The org default. */
  readonly orgNavV2: Signal<boolean> = computed(() => this.current()?.org_nav_v2 === true);
  /** The user's own choice; null follows the org. */
  readonly userNavV2: Signal<boolean | null> = computed(() => this.current()?.user_nav_v2 ?? null);
  /** The user's pins; null means "use the role defaults". */
  readonly pins: Signal<readonly string[] | null> = computed(() => this.current()?.pins ?? null);

  /**
   * Whether the account menu offers the menu switch: the org has the new menu on,
   * or the user has made a choice of their own (so they can always undo it).
   */
  readonly canSwitch: Signal<boolean> = computed(
    () => this.orgNavV2() || this.userNavV2() !== null,
  );

  /** "Vis alt": show every destination the user's permissions allow. */
  readonly showAll: Signal<boolean> = computed(() => {
    const org = this.orgId() ?? 'none';
    return this._showAll().get(org) ?? readFlag(SHOW_ALL_PREFIX + org);
  });

  private loadSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const signedIn = this.auth.isAuthenticated();
      const orgId = this.orgId();
      untracked(() => (signedIn && orgId ? this.load(orgId) : this.reset()));
    });
  }

  /** Re-fetch (e.g. after an admin changed the org default). */
  reload(): void {
    const orgId = this.orgId();
    if (orgId && this.auth.isAuthenticated()) {
      this.load(orgId);
    }
  }

  /** `false` = old menu, `true` = new menu, `null` = follow the organisation. */
  setNavV2(value: boolean | null): void {
    this.save({ nav_v2: value });
  }

  /** Replace the pins (`null` restores the role defaults). Extra pins beyond 5 are dropped. */
  setPins(pins: readonly string[] | null): void {
    this.save({ pins: pins === null ? null : [...new Set(pins)].slice(0, MAX_PINS) });
  }

  setShowAll(value: boolean): void {
    const org = this.orgId() ?? 'none';
    this._showAll.update((map) => new Map(map).set(org, value));
    writeFlag(SHOW_ALL_PREFIX + org, value);
  }

  private save(body: ShellPreferencesUpdate): void {
    const orgId = this.orgId();
    const previous = this.current();
    if (!orgId || !previous || this._saving()) {
      return;
    }
    // Optimistic: the menu changes at once and reverts if the server says no.
    this.apply(orgId, optimistic(previous, body));
    this._saving.set(true);
    this.api.update(orgId, body).subscribe({
      next: (prefs) => {
        this._saving.set(false);
        if (this.orgId() === orgId) {
          this.apply(orgId, prefs);
        }
      },
      error: () => {
        this._saving.set(false);
        if (this.orgId() === orgId) {
          this.apply(orgId, previous);
        }
        this.toasts.error('shell.prefs.saveFailed');
      },
    });
  }

  private load(orgId: string): void {
    this.loadSub?.unsubscribe();
    this.loadSub = this.api.get(orgId).subscribe({
      next: (prefs) => {
        if (this.orgId() === orgId) {
          this.apply(orgId, prefs);
        }
      },
      // Keep the cached / old menu: navigation must never depend on this call.
      error: () => undefined,
    });
  }

  private apply(orgId: string, prefs: ShellPreferencesDto): void {
    this._prefs.set(prefs);
    this._prefsOrg.set(orgId);
    writeFlag(NAV_V2_CACHE_PREFIX + orgId, prefs.nav_v2 === true);
  }

  private reset(): void {
    this.loadSub?.unsubscribe();
    this.loadSub = null;
    this._prefs.set(null);
    this._prefsOrg.set(null);
  }
}

/** The preferences as they will be once `body` is saved. */
function optimistic(prev: ShellPreferencesDto, body: ShellPreferencesUpdate): ShellPreferencesDto {
  let next = prev;
  if ('nav_v2' in body) {
    const user = body.nav_v2 ?? null;
    next = { ...next, user_nav_v2: user, nav_v2: user ?? prev.org_nav_v2 };
  }
  if ('pins' in body) {
    next = { ...next, pins: body.pins ?? null };
  }
  return next;
}

function readCache(orgId: string): boolean {
  return readFlag(NAV_V2_CACHE_PREFIX + orgId);
}

function readFlag(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, value ? '1' : '0');
  } catch {
    // Best effort (private mode).
  }
}

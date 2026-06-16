import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/** A single organisation the current user belongs to, flattened for the UI. */
export interface Org {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/** Prefix for the per-user localStorage key holding the chosen org id. */
const ORG_STORAGE_PREFIX = 'coreflow.org.';

/**
 * Tracks which organisation the user is currently acting within. The list comes
 * from `auth.user().orgs`; the active choice is persisted per user so it
 * survives reloads. On sign-in it resolves to the persisted org (if still a
 * member), else the first org, else null (e.g. a superuser with no memberships).
 */
@Injectable({ providedIn: 'root' })
export class SelectedOrgService {
  private readonly auth = inject(AuthService);

  /** Orgs the current user belongs to, sorted by display name. */
  readonly orgs = computed<readonly Org[]>(() => {
    const orgs = this.auth.user()?.orgs ?? {};
    return Object.entries(orgs)
      .map(([id, membership]) => ({
        id,
        name: membership.name,
        roles: membership.roles,
        permissions: membership.permissions,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  private readonly _currentOrgId = signal<string | null>(null);

  /** The active org id (null when signed out or membership-less). */
  readonly currentOrgId = this._currentOrgId.asReadonly();

  /** The active org object, or null. */
  readonly currentOrg = computed<Org | null>(() => {
    const id = this._currentOrgId();
    return this.orgs().find((org) => org.id === id) ?? null;
  });

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (!user) {
        this._currentOrgId.set(null);
        return;
      }
      const orgs = this.orgs();
      const stored = this.readStoredOrgId(user.id);
      const resolved =
        (stored && orgs.some((org) => org.id === stored) ? stored : null) ?? orgs[0]?.id ?? null;
      this._currentOrgId.set(resolved);
    });
  }

  /** Switch the active org and persist the choice for this user. */
  setCurrentOrg(orgId: string): void {
    this._currentOrgId.set(orgId);
    const userId = this.auth.user()?.id;
    if (!userId) {
      return;
    }
    try {
      globalThis.localStorage?.setItem(ORG_STORAGE_PREFIX + userId, orgId);
    } catch {
      // Persistence is best-effort (e.g. private mode / storage disabled).
    }
  }

  private readStoredOrgId(userId: string): string | null {
    try {
      return globalThis.localStorage?.getItem(ORG_STORAGE_PREFIX + userId) ?? null;
    } catch {
      return null;
    }
  }
}

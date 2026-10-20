import { Injectable, computed, inject, signal } from '@angular/core';
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

  /**
   * The org the user explicitly switched to this session, tagged with the user
   * it belongs to so a later sign-in as someone else never inherits it.
   */
  private readonly _explicit = signal<{ readonly userId: string; readonly orgId: string } | null>(
    null,
  );

  /**
   * The active org id (null when signed out or membership-less). Derived
   * synchronously from the auth state — not set by an effect — so it is
   * already correct the moment a session is restored. Route guards rely on
   * this: on a hard refresh they evaluate permissions right after the silent
   * refresh resolves, before any change detection (and thus effects) has run.
   * Resolution order: explicit choice (if still a member) → persisted choice
   * (if still a member) → first org → null.
   */
  readonly currentOrgId = computed<string | null>(() => {
    const user = this.auth.user();
    if (!user) {
      return null;
    }
    const orgs = this.orgs();
    const isMember = (id: string | null | undefined): id is string =>
      !!id && orgs.some((org) => org.id === id);
    const explicit = this._explicit();
    if (explicit?.userId === user.id && isMember(explicit.orgId)) {
      return explicit.orgId;
    }
    const stored = this.readStoredOrgId(user.id);
    return isMember(stored) ? stored : (orgs[0]?.id ?? null);
  });

  /** The active org object, or null. */
  readonly currentOrg = computed<Org | null>(() => {
    const id = this.currentOrgId();
    return this.orgs().find((org) => org.id === id) ?? null;
  });

  /** Switch the active org and persist the choice for this user. */
  setCurrentOrg(orgId: string): void {
    const userId = this.auth.user()?.id;
    if (!userId) {
      return;
    }
    this._explicit.set({ userId, orgId });
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

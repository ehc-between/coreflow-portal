import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import {
  AuthSession,
  AuthUser,
  ChangePasswordRequest,
  LoginRequest,
  OrgMembership,
} from './auth.models';

/**
 * First-party email/password auth facade. Holds the access token in MEMORY
 * only (never persisted); the long-lived session lives in an httpOnly refresh
 * cookie scoped to `/api/v1/auth`, so all auth requests use `withCredentials`.
 *
 * Permissions for UI gating come from `user().orgs` (the response is the source
 * of truth); the JWT is decoded only for `exp` / display fallbacks.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authBaseUrl = `${inject(APP_CONFIG).apiBaseUrl.replace(/\/+$/, '')}/v1/auth`;

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);

  /** Reactive authentication state. */
  readonly isAuthenticated = computed(() => this._accessToken() !== null);

  /** Whether the authenticated user is a platform super-admin. */
  readonly isSuperuser = computed(() => !!this._user()?.is_superuser);

  /** The authenticated user (null when signed out). */
  readonly user = this._user.asReadonly();

  /** Per-org roles/permissions for the current user. */
  readonly orgs = computed<Readonly<Record<string, OrgMembership>>>(() => this._user()?.orgs ?? {});

  /** Flattened, de-duplicated set of permissions across every org. */
  readonly permissions = computed<ReadonlySet<string>>(() => {
    const all = new Set<string>();
    for (const org of Object.values(this.orgs())) {
      for (const permission of org.permissions) {
        all.add(permission);
      }
    }
    return all;
  });

  /** Best-available display name for the current user. */
  readonly displayName = computed(() => {
    const user = this._user();
    return user?.full_name ?? user?.email ?? '';
  });

  /** Shared in-flight refresh, so concurrent 401s trigger a single refresh. */
  private refresh$: Observable<boolean> | null = null;

  /** Current access token (in-memory). Used by the auth interceptor. */
  accessToken(): string | null {
    return this._accessToken();
  }

  /** Authenticate with email/password and establish a session. */
  login(email: string, password: string): Observable<AuthUser> {
    const body: LoginRequest = { email, password };
    return this.http
      .post<AuthSession>(`${this.authBaseUrl}/login`, body, { withCredentials: true })
      .pipe(
        tap((session) => this.applySession(session)),
        map((session) => session.user),
      );
  }

  /**
   * Exchange the refresh cookie for a fresh access token. Single-flight: all
   * callers while a refresh is in progress share the same request. Resolves to
   * `true` on success, `false` (and clears state) on failure.
   */
  refresh(): Observable<boolean> {
    if (this.refresh$) {
      return this.refresh$;
    }
    this.refresh$ = this.http
      .post<AuthSession>(`${this.authBaseUrl}/refresh`, null, { withCredentials: true })
      .pipe(
        tap((session) => this.applySession(session)),
        map(() => true),
        catchError(() => {
          this.clearState();
          return of(false);
        }),
        finalize(() => {
          this.refresh$ = null;
        }),
        shareReplay(1),
      );
    return this.refresh$;
  }

  /** Restore a session on startup by refreshing; swallow failure (stay signed out). */
  restoreSession(): Observable<boolean> {
    return this.refresh();
  }

  /** Sign out: clear the server cookie, drop in-memory state, return to /login. */
  logout(): void {
    this.http
      .post(`${this.authBaseUrl}/logout`, null, { withCredentials: true })
      .pipe(finalize(() => this.clearState()))
      .subscribe({
        next: () => void this.router.navigateByUrl('/login'),
        error: () => void this.router.navigateByUrl('/login'),
      });
  }

  /** Revoke every session for the current user (all devices). */
  logoutAll(): Observable<void> {
    return this.http.post<void>(`${this.authBaseUrl}/logout-all`, null, { withCredentials: true });
  }

  /** Change the current user's password. */
  changePassword(oldPassword: string, newPassword: string): Observable<void> {
    const body: ChangePasswordRequest = { old_password: oldPassword, new_password: newPassword };
    return this.http.post<void>(`${this.authBaseUrl}/change-password`, body, {
      withCredentials: true,
    });
  }

  /**
   * Adopt a session established outside the login flow (e.g. accepting an
   * invitation as a new user). Sets the in-memory access token + user signals,
   * mirroring how `login` applies a session. The refresh cookie is set by the
   * server on that same response (the caller must use `withCredentials`).
   */
  adoptSession(session: AuthSession): void {
    this.applySession(session);
  }

  /** Clear in-memory auth state (no network). Used after a failed refresh. */
  clearState(): void {
    this._accessToken.set(null);
    this._user.set(null);
  }

  private applySession(session: AuthSession): void {
    this._accessToken.set(session.access_token);
    this._user.set(session.user);
  }
}

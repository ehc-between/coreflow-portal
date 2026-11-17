import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { MfaApi } from '../../../core/auth/mfa-api';
import { UserSession } from '../../../core/auth/mfa.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';

/** Browser and OS families recognised in a user-agent string (most specific first). */
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS: readonly [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/**
 * A short device description from a user-agent ("Firefox · Windows"), or null
 * when nothing is recognised (the page then shows a generic label).
 */
export function describeUserAgent(userAgent: string | null): string | null {
  if (!userAgent) {
    return null;
  }
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const parts = [browser, system].filter((part): part is string => !!part);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Where the user is signed in: every active session (device, sign-in time,
 * last activity, IP, whether it passed a second factor) with per-session
 * sign-out. Signing out this browser's own session ends it here too.
 */
@Component({
  selector: 'app-account-sessions',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    Icon,
    LoadingState,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto w-full max-w-2xl px-4 pt-6 pb-12 sm:px-6 sm:pt-8">
      <app-page-header titleKey="auth.sessions.title" descriptionKey="auth.sessions.subtitle" />

      @if (loading()) {
        <app-loading-state [rows]="3" />
      } @else if (loadError()) {
        <app-error-state (retry)="load()" />
      } @else if (sessions().length === 0) {
        <app-empty-state icon="devices" titleKey="auth.sessions.empty" [compact]="true" />
      } @else {
        <app-card [padded]="false">
          <ul>
            @for (session of sessions(); track session.id) {
              <li
                class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0"
                data-testid="session-row"
              >
                <span class="flex text-fg-subtle"><app-icon name="devices" [size]="16" /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="truncate text-ui font-semibold text-fg">
                      {{ device(session) ?? ('auth.sessions.unknownDevice' | transloco) }}
                    </span>
                    @if (session.current) {
                      <app-badge tone="accent">{{ 'auth.sessions.current' | transloco }}</app-badge>
                    }
                    @if (session.mfa) {
                      <app-badge tone="pass">{{ 'auth.sessions.verified' | transloco }}</app-badge>
                    }
                  </div>
                  <div class="text-meta text-fg-muted">
                    {{
                      'auth.sessions.signedIn'
                        | transloco: { date: session.signed_in_at | localDate }
                    }}
                    ·
                    {{
                      'auth.sessions.lastActive'
                        | transloco: { date: session.last_used_at | localDate }
                    }}
                    @if (session.ip) {
                      · {{ 'auth.sessions.ip' | transloco: { ip: session.ip } }}
                    }
                  </div>
                </div>
                <app-button
                  variant="ghost"
                  size="sm"
                  [attr.data-testid]="'session-revoke-' + session.id"
                  (click)="pending.set(session)"
                >
                  {{ 'auth.sessions.revoke' | transloco }}
                </app-button>
              </li>
            }
          </ul>
        </app-card>
      }

      <p class="mt-6 text-ui text-fg-muted">
        <a routerLink="/account/security" class="font-semibold text-accent hover:underline">
          {{ 'auth.mfa.link' | transloco }}
        </a>
      </p>
    </div>

    <app-confirm-dialog
      [open]="pending() !== null"
      [busy]="revoking()"
      [title]="'auth.sessions.revokeTitle' | transloco"
      [message]="
        (pending()?.current ? 'auth.sessions.revokeCurrentBody' : 'auth.sessions.revokeBody')
          | transloco
      "
      [confirmLabel]="'auth.sessions.revoke' | transloco"
      [cancelLabel]="'auth.mfa.action.cancel' | transloco"
      (confirmed)="revoke()"
      (cancelled)="pending.set(null)"
    />
  `,
})
export class AccountSessions implements OnInit {
  private readonly api = inject(MfaApi);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  protected readonly sessions = signal<readonly UserSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly pending = signal<UserSession | null>(null);
  protected readonly revoking = signal(false);

  protected readonly device = (session: UserSession): string | null =>
    describeUserAgent(session.user_agent);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.api.listSessions().subscribe({
      next: (sessions) => {
        // This browser first, then most recently active.
        this.sessions.set(
          [...sessions].sort(
            (a, b) =>
              Number(b.current) - Number(a.current) || b.last_used_at.localeCompare(a.last_used_at),
          ),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  protected revoke(): void {
    const session = this.pending();
    if (!session || this.revoking()) {
      return;
    }
    this.revoking.set(true);
    this.api.revokeSession(session.id).subscribe({
      next: () => {
        this.revoking.set(false);
        this.pending.set(null);
        if (session.current) {
          this.auth.endLocalSession();
          return;
        }
        this.sessions.update((all) => all.filter((item) => item.id !== session.id));
        this.notifications.success('auth.sessions.revokedToast');
      },
      error: () => {
        this.revoking.set(false);
        this.pending.set(null);
        this.notifications.error('auth.sessions.revokeFailed');
        this.load();
      },
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  InvitationApi,
  InvitePreview,
  isInvitationEmailMismatch,
  isNewUserSession,
} from '../../../core/admin/invitation-api';
import {
  PASSWORD_MIN_LENGTH,
  TranslatedMessage,
  isWeakPasswordError,
  rateLimitMessage,
  throttleMessage,
} from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { ACCEPT_INVITE_PATH, PendingInvitation } from '../../../core/auth/pending-invitation';
import { takeQueryToken } from '../../../core/auth/take-query-token';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { AuthShell } from '../auth-shell/auth-shell';

type ViewState = 'loading' | 'invalid' | 'new-user' | 'existing-user';

/**
 * Public accept-invitation page (outside the authenticated shell). Reads the
 * `?token=` query param (or a token stashed before a sign-in detour), previews
 * the invite, and either:
 * - onboards a brand-new user (set password, then session), or
 * - lets an EXISTING account join, but only while signed in as that account.
 *   The backend refuses to join an existing account on the token alone (that
 *   would let whoever holds the link attach someone else's account), so a
 *   signed-out user is sent to sign in and brought back here, and a user signed
 *   in as a different account is told to switch.
 */
@Component({
  selector: 'app-accept-invite',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    AuthShell,
    FormField,
    Button,
    Icon,
    Alert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accept-invite.html',
})
export class AcceptInvite implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invitations = inject(InvitationApi);
  private readonly auth = inject(AuthService);
  private readonly pending = inject(PendingInvitation);
  private readonly notifications = inject(NotificationService);

  protected readonly state = signal<ViewState>('loading');
  protected readonly preview = signal<InvitePreview | null>(null);
  protected readonly submitting = signal(false);
  /** Submit error shown in place (key + params), or null. */
  protected readonly error = signal<TranslatedMessage | null>(null);
  /** Set when the server refused the accept because a different account is signed in. */
  private readonly serverMismatch = signal(false);

  /** Email of the signed-in account, or null when signed out. */
  protected readonly signedInEmail = computed(() =>
    this.auth.isAuthenticated() ? (this.auth.user()?.email ?? null) : null,
  );

  /** Signed in, but not as the invited account. */
  protected readonly isMismatch = computed(() => {
    const current = this.signedInEmail();
    const invited = this.preview()?.email;
    if (!current || !invited) {
      return false;
    }
    return this.serverMismatch() || !sameEmail(current, invited);
  });

  private token = '';

  protected readonly form = this.fb.nonNullable.group({
    full_name: [''],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
  });

  ngOnInit(): void {
    // Read once, then scrubbed from the address bar; kept in memory only. After
    // the sign-in detour the token comes back from the in-memory stash instead.
    this.token = takeQueryToken(this.route, this.router) || this.pending.take();
    if (!this.token) {
      this.state.set('invalid');
      return;
    }

    this.invitations.getInvite(this.token).subscribe({
      next: (preview) => {
        if (!preview.valid) {
          this.state.set('invalid');
          return;
        }
        this.preview.set(preview);
        if (preview.user_exists) {
          this.showExistingUser();
        } else {
          this.state.set('new-user');
        }
      },
      error: () => this.state.set('invalid'),
    });
  }

  protected acceptNewUser(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    const { full_name, password } = this.form.getRawValue();
    const trimmedName = full_name.trim();

    this.invitations
      .acceptInvite({ token: this.token, password, full_name: trimmedName || undefined })
      .subscribe({
        next: (result) => {
          if (isNewUserSession(result)) {
            this.auth.adoptSession(result);
            void this.router.navigateByUrl('/dashboard');
            return;
          }
          // Server resolved this to an existing account: that path needs a sign-in.
          this.submitting.set(false);
          this.showExistingUser();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.error.set(acceptInviteErrorMessage(err));
        },
      });
  }

  /** Existing account, signed in as the invited email: join the org. */
  protected acceptExisting(): void {
    if (this.submitting() || !this.signedInEmail() || this.isMismatch()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    // No password or name: an existing account proves itself with its own session.
    this.invitations.acceptInvite({ token: this.token }).subscribe({
      next: (result) => {
        if (!isNewUserSession(result) && result.ok) {
          this.joined();
          return;
        }
        // The session went away (expired and could not be refreshed): sign in again.
        this.submitting.set(false);
        this.signIn();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        if (isInvitationEmailMismatch(err)) {
          this.serverMismatch.set(true);
          return;
        }
        this.error.set(acceptInviteErrorMessage(err));
      },
    });
  }

  /** Signed out: sign in, then come back here with the token from memory. */
  protected signIn(): void {
    this.pending.stash(this.token);
    void this.router.navigate(['/login'], { queryParams: { returnUrl: ACCEPT_INVITE_PATH } });
  }

  /** Signed in as the wrong account: sign out, then sign in as the invited one. */
  protected switchAccount(): void {
    this.pending.stash(this.token);
    this.auth.logout(ACCEPT_INVITE_PATH);
  }

  /**
   * Show the existing-account view. The startup session restore is not awaited
   * by bootstrap, so resolve it first (single-flight, shares the startup call)
   * to know whether the user is already signed in.
   */
  private showExistingUser(): void {
    if (this.auth.isAuthenticated()) {
      this.state.set('existing-user');
      return;
    }
    this.auth.restoreSession().subscribe({
      next: () => this.state.set('existing-user'),
      error: () => this.state.set('existing-user'),
    });
  }

  /** Membership added: refresh the session so the new org appears, then go in. */
  private joined(): void {
    const org = this.preview()?.org_name ?? '';
    this.auth.refresh().subscribe(() => {
      this.notifications.success('invite.joinedToast', { org });
      void this.router.navigateByUrl('/dashboard');
    });
  }
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Map an accept failure: limiter outage → "temporarily unavailable", any 429 →
 * generic "slow down", weak password → policy message, else the invite error.
 */
export function acceptInviteErrorMessage(error: unknown): TranslatedMessage {
  return (
    throttleMessage(error) ??
    rateLimitMessage(error, 'errors.rateLimited') ??
    (isWeakPasswordError(error) ? { key: 'auth.password.weak' } : { key: 'invite.error' })
  );
}

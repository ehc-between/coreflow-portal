import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, from, of, switchMap } from 'rxjs';
import { TranslatedMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { MfaApi } from '../../../core/auth/mfa-api';
import { MFA_ERROR, mfaErrorCode, mfaErrorMessage } from '../../../core/auth/mfa-errors';
import { MfaEnrolResponse, MfaFactor, MfaStatus } from '../../../core/auth/mfa.models';
import {
  createPasskey,
  isPasskeyCancelled,
  isWebAuthnSupported,
} from '../../../core/auth/webauthn';
import { NotificationService } from '../../../core/notifications/notification.service';
import { pluralKey } from '../../../shared/i18n/plural';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RecoveryCodesPanel } from './recovery-codes-panel';
import { TotpSetup } from './totp-setup';

/** An action that needs the password re-entered. */
type PasswordAction =
  | { readonly kind: 'remove'; readonly factor: MfaFactor }
  | { readonly kind: 'regenerate' };

/**
 * Own-account two-step verification: enrolled methods (authenticator apps and
 * passkeys), adding and removing them, and recovery codes. Also the landing
 * page for members whose org requires MFA (`mfaEnrolmentGuard`): it explains
 * why access is blocked and what to do.
 *
 * The first factor upgrades this session server-side and invalidates its
 * access token, so the page refreshes the session right after (new claims:
 * permissions in MFA-requiring orgs come back) and shows the one-time
 * recovery codes.
 */
@Component({
  selector: 'app-account-security',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FormField,
    Icon,
    LoadingState,
    PageHeader,
    RecoveryCodesPanel,
    TotpSetup,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-security.html',
})
export class AccountSecurity implements OnInit {
  private readonly api = inject(MfaApi);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);

  protected readonly pluralKey = pluralKey;
  protected readonly status = signal<MfaStatus | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /** Which add flow is open. */
  protected readonly adding = signal<'totp' | 'passkey' | null>(null);
  protected readonly passkeySupported = isWebAuthnSupported();
  protected readonly passkeyBusy = signal(false);
  protected readonly passkeyError = signal<TranslatedMessage | null>(null);
  protected readonly passkeyForm = this.fb.nonNullable.group({ label: [''] });

  /** Recovery codes to show once (after first enrolment or regeneration). */
  protected readonly newCodes = signal<readonly string[] | null>(null);

  protected readonly pendingPassword = signal<PasswordAction | null>(null);
  protected readonly passwordBusy = signal(false);
  protected readonly passwordError = signal<TranslatedMessage | null>(null);
  protected readonly passwordForm = this.fb.nonNullable.group({
    password: ['', [Validators.required]],
  });

  /** Names of the orgs whose policy requires MFA of this user. */
  protected readonly requiringOrgs = computed(() => {
    const orgs = this.auth.orgs();
    return (this.status()?.required_by_orgs ?? []).map((id) => orgs[id]?.name ?? id);
  });

  /**
   * The user already has a factor but this session didn't pass one (e.g. it
   * predates enrolment): changing factors needs a fresh, verified sign-in.
   */
  protected readonly needsVerifiedSession = computed(() => {
    const status = this.status();
    return !!status && status.enrolled && !status.session_verified;
  });

  ngOnInit(): void {
    this.load();
  }

  protected factorName(factor: MfaFactor): string | null {
    return factor.label.trim() || null;
  }

  protected openAdd(kind: 'totp' | 'passkey'): void {
    this.adding.set(kind);
    this.passkeyError.set(null);
    this.passkeyForm.reset({ label: '' });
  }

  protected closeAdd(): void {
    this.adding.set(null);
  }

  protected addPasskey(): void {
    if (this.passkeyBusy()) {
      return;
    }
    this.passkeyBusy.set(true);
    this.passkeyError.set(null);
    const label = this.passkeyForm.getRawValue().label.trim() || null;
    this.api
      .passkeyOptions()
      .pipe(
        switchMap((options) =>
          from(createPasskey(options.public_key)).pipe(
            switchMap((credential) =>
              this.api.registerPasskey(options.challenge_token, label, credential),
            ),
          ),
        ),
      )
      .subscribe({
        next: (response) => {
          this.passkeyBusy.set(false);
          this.onEnrolled(response);
        },
        error: (err: unknown) => {
          this.passkeyBusy.set(false);
          this.passkeyError.set(
            isPasskeyCancelled(err)
              ? { key: 'auth.mfa.error.passkeyCancelled' }
              : mfaErrorMessage(err),
          );
        },
      });
  }

  /** A factor was confirmed: refresh the session if the server asked, then reload. */
  protected onEnrolled(response: MfaEnrolResponse): void {
    this.adding.set(null);
    this.notifications.success('auth.mfa.enrolledToast');
    if (response.recovery_codes?.length) {
      this.newCodes.set(response.recovery_codes);
    }
    const refreshed: Observable<boolean> = response.reauthenticate ? this.auth.refresh() : of(true);
    refreshed.subscribe((ok) => {
      if (ok) {
        this.load();
      } else {
        // The session could not be renewed (e.g. revoked meanwhile): sign in again.
        this.auth.endLocalSession();
      }
    });
  }

  protected askRemove(factor: MfaFactor): void {
    this.openPassword({ kind: 'remove', factor });
  }

  protected askRegenerate(): void {
    this.openPassword({ kind: 'regenerate' });
  }

  protected cancelPassword(): void {
    if (!this.passwordBusy()) {
      this.pendingPassword.set(null);
    }
  }

  protected confirmPassword(): void {
    const action = this.pendingPassword();
    if (!action || this.passwordBusy() || this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { password } = this.passwordForm.getRawValue();
    this.passwordBusy.set(true);
    this.passwordError.set(null);
    const done = (): void => {
      this.passwordBusy.set(false);
      this.pendingPassword.set(null);
      this.load();
    };
    const failed = (err: unknown): void => {
      this.passwordBusy.set(false);
      this.passwordForm.controls.password.setValue('');
      if (mfaErrorCode(err) === MFA_ERROR.invalidPassword) {
        this.passwordError.set(mfaErrorMessage(err));
        return;
      }
      // Anything else (blocked by org policy, session not verified…) closes the dialog.
      this.pendingPassword.set(null);
      const message = mfaErrorMessage(err);
      this.notifications.error(message.key, message.params);
    };

    if (action.kind === 'remove') {
      this.api.removeFactor(action.factor.id, password).subscribe({
        next: () => {
          this.notifications.success('auth.mfa.removedToast');
          done();
        },
        error: failed,
      });
    } else {
      this.api.regenerateRecoveryCodes(password).subscribe({
        next: (codes) => {
          this.newCodes.set(codes.recovery_codes);
          done();
        },
        error: failed,
      });
    }
  }

  protected signOutToVerify(): void {
    this.auth.logout();
  }

  protected load(): void {
    this.loading.set(this.status() === null);
    this.loadError.set(false);
    this.api.status().subscribe({
      next: (status) => {
        this.status.set(status);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  private openPassword(action: PasswordAction): void {
    this.passwordForm.reset({ password: '' });
    this.passwordError.set(null);
    this.pendingPassword.set(action);
  }
}

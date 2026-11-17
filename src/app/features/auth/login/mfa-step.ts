import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, from, switchMap } from 'rxjs';
import { TranslatedMessage } from '../../../core/auth/auth-errors';
import { AuthUser, MfaChallenge, MfaMethod } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { MFA_ERROR, mfaErrorCode, mfaErrorMessage } from '../../../core/auth/mfa-errors';
import {
  getPasskeyAssertion,
  isPasskeyCancelled,
  isWebAuthnSupported,
} from '../../../core/auth/webauthn';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';

/** Order in which methods are offered first. */
const PREFERRED: readonly MfaMethod[] = ['webauthn', 'totp', 'recovery_code'];

/**
 * Sign-in step two: the password was right and the account has a second
 * factor. Offers the methods the server listed (passkey, authenticator-app
 * code, recovery code). Emits `verified` once the session is established, or
 * `expired` when the challenge is no longer valid (timed out, used, or burned
 * after too many wrong codes) so the host returns to the password step.
 */
@Component({
  selector: 'app-mfa-step',
  imports: [ReactiveFormsModule, TranslocoPipe, Alert, Button, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
      {{ 'auth.mfa.signIn.title' | transloco }}
    </h1>
    <p class="mt-1 text-[13.5px] text-fg-muted" data-testid="mfa-step-hint">
      {{ 'auth.mfa.signIn.hint.' + method() | transloco }}
    </p>

    @if (method() === 'webauthn') {
      <div class="mt-6 flex flex-col gap-4">
        @if (error(); as error) {
          <app-alert>{{ error.key | transloco: error.params }}</app-alert>
        }
        <app-button
          size="lg"
          [full]="true"
          [loading]="busy()"
          data-testid="mfa-passkey"
          (click)="usePasskey()"
        >
          {{ 'auth.mfa.signIn.usePasskey' | transloco }}
        </app-button>
      </div>
    } @else {
      <form class="mt-6 flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submitCode()">
        @if (method() === 'totp') {
          <app-form-field inputId="mfa-code" [label]="'auth.mfa.signIn.codeLabel' | transloco">
            <input
              id="mfa-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="10"
              formControlName="code"
              data-testid="mfa-code"
            />
          </app-form-field>
        } @else {
          <app-form-field
            inputId="mfa-recovery"
            [label]="'auth.mfa.signIn.recoveryLabel' | transloco"
          >
            <input
              id="mfa-recovery"
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              maxlength="64"
              formControlName="code"
              data-testid="mfa-code"
            />
          </app-form-field>
        }

        @if (error(); as error) {
          <app-alert>{{ error.key | transloco: error.params }}</app-alert>
        }

        <app-button type="submit" size="lg" [full]="true" [loading]="busy()" class="mt-1">
          {{ (busy() ? 'auth.mfa.signIn.verifying' : 'auth.mfa.signIn.verify') | transloco }}
        </app-button>
      </form>
    }

    @if (otherMethods().length > 0) {
      <div class="mt-5 flex flex-col items-start gap-1.5 border-t border-border pt-4">
        @for (other of otherMethods(); track other) {
          <button
            type="button"
            class="text-[12.5px] font-semibold text-accent hover:underline"
            [attr.data-testid]="'mfa-switch-' + other"
            (click)="switchTo(other)"
          >
            {{ 'auth.mfa.signIn.switch.' + other | transloco }}
          </button>
        }
      </div>
    }

    <button
      type="button"
      class="mt-4 text-[12.5px] font-semibold text-fg-muted hover:underline"
      (click)="cancelled.emit()"
    >
      {{ 'auth.mfa.signIn.back' | transloco }}
    </button>
  `,
})
export class MfaStep {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly challenge = input.required<MfaChallenge>();

  /** The session is established. */
  readonly verified = output<AuthUser>();
  /** The challenge is no longer usable; restart from the password step. */
  readonly expired = output<TranslatedMessage>();
  /** The user chose to go back to the password step. */
  readonly cancelled = output<void>();

  /** Methods offered, in preference order; passkeys only where the browser supports them. */
  protected readonly methods = computed(() => {
    const offered = this.challenge().methods;
    const passkeys = isWebAuthnSupported();
    return PREFERRED.filter(
      (method) => offered.includes(method) && (method !== 'webauthn' || passkeys),
    );
  });

  protected readonly method = linkedSignal<MfaMethod>(() => this.methods()[0] ?? 'recovery_code');
  protected readonly otherMethods = computed(() =>
    this.methods().filter((method) => method !== this.method()),
  );

  protected readonly busy = signal(false);
  protected readonly error = signal<TranslatedMessage | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
  });

  protected switchTo(method: MfaMethod): void {
    this.method.set(method);
    this.error.set(null);
    this.form.reset({ code: '' });
  }

  protected submitCode(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const method = this.method();
    const raw = this.form.getRawValue().code.trim();
    const code = method === 'totp' ? raw.replace(/\s+/g, '') : raw;
    this.run(this.auth.verifyMfa({ mfa_token: this.challenge().mfa_token, method, code }), () =>
      this.form.controls.code.setValue(''),
    );
  }

  protected usePasskey(): void {
    if (this.busy()) {
      return;
    }
    const token = this.challenge().mfa_token;
    this.run(
      this.auth.passkeySignInOptions(token).pipe(
        switchMap((options) => from(getPasskeyAssertion(options.public_key))),
        switchMap((credential) =>
          this.auth.verifyMfa({ mfa_token: token, method: 'webauthn', credential }),
        ),
      ),
    );
  }

  private run(request: Observable<AuthUser>, onRejected?: () => void): void {
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: (user) => this.verified.emit(user),
      error: (err: unknown) => {
        this.busy.set(false);
        if (mfaErrorCode(err) === MFA_ERROR.invalidToken) {
          this.expired.emit({ key: 'auth.mfa.error.invalidToken' });
          return;
        }
        onRejected?.();
        this.error.set(
          isPasskeyCancelled(err)
            ? { key: 'auth.mfa.error.passkeyCancelled' }
            : mfaErrorMessage(err),
        );
      },
    });
  }
}

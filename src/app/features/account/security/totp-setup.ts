import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatedMessage } from '../../../core/auth/auth-errors';
import { MfaApi } from '../../../core/auth/mfa-api';
import { MFA_ERROR, mfaErrorCode, mfaErrorMessage } from '../../../core/auth/mfa-errors';
import { MfaEnrolResponse, TotpSetup as TotpSetupDto } from '../../../core/auth/mfa.models';
import { QrCode } from '../../../shared/qr-code/qr-code';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';

/** The base32 secret in groups of four, easier to type by hand. */
export function groupSecret(secret: string): string {
  return secret
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/**
 * Add an authenticator app: (1) optional name → (2) scan the QR code (or type
 * the secret) and enter the six-digit code to confirm. Emits `enrolled` with
 * the server's answer (which carries the recovery codes on a first factor) or
 * `cancelled`. The pending enrolment expires server-side after 15 minutes.
 */
@Component({
  selector: 'app-totp-setup',
  imports: [ReactiveFormsModule, TranslocoPipe, QrCode, Alert, Button, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4" data-testid="totp-setup">
      <h3 class="font-display text-card font-bold text-fg">
        {{ 'auth.mfa.totp.title' | transloco }}
      </h3>

      @if (setup(); as setup) {
        <ol class="flex list-decimal flex-col gap-1 pl-5 text-ui text-fg-muted">
          <li>{{ 'auth.mfa.totp.step1' | transloco }}</li>
          <li>{{ 'auth.mfa.totp.step2' | transloco }}</li>
        </ol>
        <div class="flex flex-wrap items-start gap-5">
          <app-qr-code
            [value]="setup.otpauth_uri"
            [label]="'auth.mfa.totp.qrLabel' | transloco"
            [pixels]="176"
          />
          <div class="min-w-0 flex-1">
            <div class="text-meta font-semibold text-fg-muted">
              {{ 'auth.mfa.totp.manualLabel' | transloco }}
            </div>
            <code
              class="mt-1 block font-mono text-ui break-all text-fg select-all"
              data-testid="totp-secret"
              >{{ grouped(setup.secret) }}</code
            >
          </div>
        </div>

        <form class="flex flex-col gap-4" [formGroup]="codeForm" (ngSubmit)="confirm()">
          <app-form-field inputId="totp-code" [label]="'auth.mfa.totp.codeLabel' | transloco">
            <input
              id="totp-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="10"
              formControlName="code"
              data-testid="totp-code"
            />
          </app-form-field>
          @if (error(); as error) {
            <app-alert>{{ error.key | transloco: error.params }}</app-alert>
          }
          <div class="flex justify-end gap-2">
            <app-button variant="secondary" [disabled]="busy()" (click)="cancelled.emit()">
              {{ 'auth.mfa.action.cancel' | transloco }}
            </app-button>
            <app-button type="submit" [loading]="busy()" data-testid="totp-confirm">
              {{ 'auth.mfa.totp.confirm' | transloco }}
            </app-button>
          </div>
        </form>
      } @else {
        <form class="flex flex-col gap-4" [formGroup]="labelForm" (ngSubmit)="start()">
          <app-form-field inputId="totp-label" [label]="'auth.mfa.factor.nameLabel' | transloco">
            <input
              id="totp-label"
              type="text"
              maxlength="100"
              autocomplete="off"
              formControlName="label"
              [placeholder]="'auth.mfa.totp.namePlaceholder' | transloco"
            />
          </app-form-field>
          @if (error(); as error) {
            <app-alert>{{ error.key | transloco: error.params }}</app-alert>
          }
          <div class="flex justify-end gap-2">
            <app-button variant="secondary" [disabled]="busy()" (click)="cancelled.emit()">
              {{ 'auth.mfa.action.cancel' | transloco }}
            </app-button>
            <app-button type="submit" [loading]="busy()" data-testid="totp-start">
              {{ 'auth.mfa.action.continue' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </div>
  `,
})
export class TotpSetup {
  private readonly api = inject(MfaApi);
  private readonly fb = inject(FormBuilder);

  readonly enrolled = output<MfaEnrolResponse>();
  readonly cancelled = output<void>();

  protected readonly setup = signal<TotpSetupDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<TranslatedMessage | null>(null);

  protected readonly labelForm = this.fb.nonNullable.group({ label: [''] });
  protected readonly codeForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\s*\d[\d\s]{4,}\d\s*$/)]],
  });

  protected readonly grouped = groupSecret;

  protected start(): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const label = this.labelForm.getRawValue().label.trim() || null;
    this.api.startTotp(label).subscribe({
      next: (setup) => {
        this.busy.set(false);
        this.setup.set(setup);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(mfaErrorMessage(err));
      },
    });
  }

  protected confirm(): void {
    const setup = this.setup();
    if (!setup || this.busy()) {
      return;
    }
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      this.error.set({ key: 'auth.mfa.error.invalidCode' });
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const code = this.codeForm.getRawValue().code.replace(/\s+/g, '');
    this.api.confirmTotp(setup.factor_id, code).subscribe({
      next: (response) => {
        this.busy.set(false);
        this.enrolled.emit(response);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.codeForm.controls.code.setValue('');
        const code = mfaErrorCode(err);
        if (code === MFA_ERROR.enrolmentExpired || code === MFA_ERROR.enrolmentNotFound) {
          // Start over with a fresh secret.
          this.setup.set(null);
        }
        this.error.set(mfaErrorMessage(err));
      },
    });
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  PASSWORD_MIN_LENGTH,
  isWeakPasswordError,
  passwordsMatchValidator,
} from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { NewPasswordFields } from '../../../shared/new-password-fields/new-password-fields';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * Change the signed-in user's password (current + new + confirm). The server
 * keeps this session and revokes every other one.
 */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, TranslocoPipe, NewPasswordFields, Alert, Button, Card, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto w-full max-w-lg px-6 py-8">
      <h1 class="font-display text-[24px] font-bold tracking-[-0.02em] text-fg">
        {{ 'auth.changePassword.title' | transloco }}
      </h1>
      <p class="mt-1 text-[13.5px] text-fg-muted">
        {{ 'auth.changePassword.subtitle' | transloco }}
      </p>

      <app-card class="mt-6 block">
        <form class="flex flex-col gap-4 p-2" [formGroup]="form" (ngSubmit)="submit()">
          <app-form-field
            inputId="change-password-current"
            [label]="'auth.changePassword.current' | transloco"
          >
            <input
              id="change-password-current"
              type="password"
              formControlName="currentPassword"
              autocomplete="current-password"
            />
          </app-form-field>

          <app-new-password-fields idPrefix="change-password" />

          @if (error(); as error) {
            <app-alert>{{ error | transloco }}</app-alert>
          }

          <div class="mt-1 flex justify-end">
            <app-button type="submit" [loading]="submitting()">
              {{
                (submitting() ? 'auth.changePassword.saving' : 'auth.changePassword.submit')
                  | transloco
              }}
            </app-button>
          </div>
        </form>
      </app-card>
    </div>
  `,
})
export class ChangePassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  protected readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  protected readonly submitting = signal(false);
  /** i18n key of the submit error shown in place, or null. */
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    const { currentPassword, newPassword } = this.form.getRawValue();

    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.form.reset();
        this.notifications.success('auth.changePassword.success');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(changePasswordErrorKey(err));
      },
    });
  }
}

/** Map a change-password failure to an i18n key. */
export function changePasswordErrorKey(error: unknown): string {
  if ((error as { status?: number } | null)?.status === 400) {
    return 'auth.changePassword.wrongCurrent';
  }
  return isWeakPasswordError(error) ? 'auth.password.weak' : 'errors.generic';
}

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
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * Change the signed-in user's password (current + new + confirm). The server
 * keeps this session and revokes every other one.
 */
@Component({
  selector: 'app-change-password',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    NewPasswordFields,
    Alert,
    Button,
    FormActions,
    FormField,
    FormSection,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto w-full max-w-[808px] px-4 pt-5 pb-12 sm:px-8">
      <app-page-header
        titleKey="auth.changePassword.title"
        descriptionKey="auth.changePassword.subtitle"
      />

      <form class="flex flex-col gap-5" [formGroup]="form" (ngSubmit)="submit()">
        <app-form-section [columns]="1">
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
        </app-form-section>

        @if (error(); as error) {
          <app-alert>{{ error | transloco }}</app-alert>
        }

        <app-form-actions>
          <app-button type="submit" [loading]="submitting()">
            {{
              (submitting() ? 'auth.changePassword.saving' : 'auth.changePassword.submit')
                | transloco
            }}
          </app-button>
        </app-form-actions>
      </form>
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

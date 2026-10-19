import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  PASSWORD_MIN_LENGTH,
  isWeakPasswordError,
  passwordsMatchValidator,
} from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { NewPasswordFields } from '../../../shared/new-password-fields/new-password-fields';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { AuthShell } from '../auth-shell/auth-shell';

/**
 * Public reset-password page, reached from the emailed `/reset-password?token=`
 * link. On success the user is sent to /login with a success notice; an
 * invalid or expired token shows a message and a link to request a new one.
 */
@Component({
  selector: 'app-reset-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    AuthShell,
    NewPasswordFields,
    Button,
    Icon,
    Alert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell>
      @if (invalidToken()) {
        <h1 class="font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
          {{ 'auth.reset.invalidTitle' | transloco }}
        </h1>
        <p class="mt-1 text-[13.5px] text-fg-muted">{{ 'auth.reset.invalidBody' | transloco }}</p>
        <a
          routerLink="/forgot-password"
          class="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-accent hover:underline"
        >
          {{ 'auth.reset.requestNew' | transloco }}
          <app-icon name="arrow" [size]="15" />
        </a>
      } @else {
        <h1 class="font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
          {{ 'auth.reset.title' | transloco }}
        </h1>
        <p class="mt-1 text-[13.5px] text-fg-muted">{{ 'auth.reset.subtitle' | transloco }}</p>

        <form class="mt-6 flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()">
          <app-new-password-fields idPrefix="reset-password" />

          @if (error(); as error) {
            <app-alert>{{ error | transloco }}</app-alert>
          }

          <app-button type="submit" size="lg" [full]="true" [loading]="submitting()" class="mt-1">
            {{ (submitting() ? 'auth.reset.saving' : 'auth.reset.submit') | transloco }}
          </app-button>
        </form>
      }
    </app-auth-shell>
  `,
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  protected readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  protected readonly submitting = signal(false);
  protected readonly invalidToken = signal(!this.token);
  /** i18n key of the submit error shown in place, or null. */
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    this.auth.confirmPasswordReset(this.token, this.form.getRawValue().newPassword).subscribe({
      next: () => {
        void this.router.navigate(['/login'], { queryParams: { notice: 'passwordReset' } });
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        if (httpStatus(err) === 400) {
          this.invalidToken.set(true);
        } else if (isWeakPasswordError(err)) {
          this.error.set('auth.password.weak');
        } else {
          this.error.set('errors.generic');
        }
      },
    });
  }
}

function httpStatus(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

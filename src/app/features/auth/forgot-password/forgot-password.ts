import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { AuthShell } from '../auth-shell/auth-shell';

/**
 * Public "forgot password" page. Requests a reset email and always shows the
 * same neutral confirmation, so it never reveals whether an account exists.
 */
@Component({
  selector: 'app-forgot-password',
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
  template: `
    <app-auth-shell>
      @if (sentTo(); as email) {
        <h1 class="font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
          {{ 'auth.forgot.sentTitle' | transloco }}
        </h1>
        <p class="mt-1 text-[13.5px] text-fg-muted">
          {{ 'auth.forgot.sentBody' | transloco: { email } }}
        </p>
      } @else {
        <h1 class="font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
          {{ 'auth.forgot.title' | transloco }}
        </h1>
        <p class="mt-1 text-[13.5px] text-fg-muted">{{ 'auth.forgot.subtitle' | transloco }}</p>

        <form class="mt-6 flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()">
          <app-form-field inputId="forgot-email" [label]="'auth.label.email' | transloco">
            <input id="forgot-email" type="email" formControlName="email" autocomplete="email" />
          </app-form-field>

          @if (failed()) {
            <app-alert>{{ 'errors.generic' | transloco }}</app-alert>
          }

          <app-button type="submit" size="lg" [full]="true" [loading]="submitting()" class="mt-1">
            {{ (submitting() ? 'auth.forgot.sending' : 'auth.forgot.submit') | transloco }}
          </app-button>
        </form>
      }

      <a
        routerLink="/login"
        class="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-accent hover:underline"
      >
        <app-icon name="back" [size]="15" />
        {{ 'auth.forgot.backToLogin' | transloco }}
      </a>
    </app-auth-shell>
  `,
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly submitting = signal(false);
  protected readonly failed = signal(false);
  /** Email the (neutral) confirmation refers to, once submitted. */
  protected readonly sentTo = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.failed.set(false);
    const email = this.form.getRawValue().email.trim();

    this.auth.requestPasswordReset(email).subscribe({
      next: () => {
        this.submitting.set(false);
        this.sentTo.set(email);
      },
      error: () => {
        this.submitting.set(false);
        this.failed.set(true);
      },
    });
  }
}

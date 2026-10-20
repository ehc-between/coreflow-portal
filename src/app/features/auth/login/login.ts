import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatedMessage, rateLimitMessage } from '../../../core/auth/auth-errors';
import { AuthService, LoginNotice } from '../../../core/auth/auth.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AuthShell } from '../auth-shell/auth-shell';

const NOTICE_KEYS: Record<LoginNotice, string> = {
  passwordReset: 'auth.notice.passwordReset',
  signedOutAll: 'auth.notice.signedOutAll',
};

/**
 * Public login page (lives outside the authenticated shell). On success the
 * user is sent to `returnUrl` (set by the auth guard) or the dashboard. A
 * `?notice=` query param shows a one-off message after a redirect (password
 * reset, signed out of all devices).
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, AuthShell, FormField, Button, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<TranslatedMessage | null>(null);
  protected readonly notice = signal<string | null>(
    NOTICE_KEYS[inject(ActivatedRoute).snapshot.queryParamMap.get('notice') as LoginNotice] ?? null,
  );

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    this.notice.set(null);
    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => {
        const returnUrl =
          this.router.parseUrl(this.router.url).queryParams['returnUrl'] ?? '/dashboard';
        void this.router.navigateByUrl(returnUrl);
      },
      error: (err: unknown) => {
        this.error.set(loginErrorMessage(err));
        this.submitting.set(false);
      },
    });
  }
}

/** Map a login failure to a translated message (rate limit vs. bad credentials). */
export function loginErrorMessage(error: unknown): TranslatedMessage {
  const rateLimited = rateLimitMessage(error, 'auth.error.tooManyAttempts');
  if (rateLimited) {
    return rateLimited;
  }
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 400 || status === 422) {
    return { key: 'auth.error.invalidCredentials' };
  }
  return { key: 'errors.generic' };
}

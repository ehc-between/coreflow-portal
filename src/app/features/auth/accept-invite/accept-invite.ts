import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InvitationApi, InvitePreview, isNewUserSession } from '../../../core/admin/invitation-api';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { LanguageSwitcher } from '../../../shared/language-switcher/language-switcher';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';

type ViewState = 'loading' | 'invalid' | 'new-user' | 'existing-user';

/**
 * Public accept-invitation page (outside the authenticated shell). Reads the
 * `?token=` query param, previews the invite, and either onboards a brand-new
 * user (set password → session) or directs an existing user to sign in.
 */
@Component({
  selector: 'app-accept-invite',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    Card,
    FormField,
    Button,
    Icon,
    LanguageSwitcher,
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
  protected readonly theme = inject(ThemeService);

  protected readonly state = signal<ViewState>('loading');
  protected readonly preview = signal<InvitePreview | null>(null);
  protected readonly submitting = signal(false);
  protected readonly failed = signal(false);

  private token = '';

  protected readonly form = this.fb.nonNullable.group({
    full_name: [''],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
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
        this.state.set(preview.user_exists ? 'existing-user' : 'new-user');
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
    this.failed.set(false);
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
          // Server resolved this to an existing account — send them to sign in.
          this.submitting.set(false);
          this.state.set('existing-user');
        },
        error: () => {
          this.submitting.set(false);
          this.failed.set(true);
        },
      });
  }
}

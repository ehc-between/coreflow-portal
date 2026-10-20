import { HttpErrorResponse } from '@angular/common/http';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AdminApi } from '../../../core/admin/admin-api';
import { OrgSummary } from '../../../core/admin/admin.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';

/** Super-admin organisations surface: list every org and create new ones. */
@Component({
  selector: 'app-organizations',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Card,
    FormField,
    Button,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organizations.html',
})
export class Organizations {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminApi);
  private readonly notifications = inject(NotificationService);

  protected readonly orgs = signal<readonly OrgSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly slugTaken = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    slug: [''],
  });

  constructor() {
    this.load();
  }

  protected create(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.slugTaken.set(false);
    const { name, slug } = this.form.getRawValue();
    const trimmedSlug = slug.trim();

    this.admin.createOrg({ name: name.trim(), slug: trimmedSlug || undefined }).subscribe({
      next: () => {
        this.form.reset({ name: '', slug: '' });
        this.submitting.set(false);
        this.notifications.success('admin.org.createdToast');
        this.load();
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.slugTaken.set(true);
        }
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.admin.listOrgs().subscribe({
      next: (orgs) => {
        this.orgs.set(orgs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

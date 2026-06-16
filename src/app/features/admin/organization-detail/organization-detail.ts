import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AdminApi } from '../../../core/admin/admin-api';
import {
  CreatedInvitation,
  Invitation,
  OrgDetail,
  RoleKey,
} from '../../../core/admin/admin.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';

const ROLE_OPTIONS: readonly RoleKey[] = ['admin', 'member'];

/**
 * Super-admin organisation detail: members, an invite form, the most recent
 * invite's copyable accept URL, and the list of pending invitations.
 */
@Component({
  selector: 'app-organization-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    DatePipe,
    Card,
    FormField,
    Button,
    Badge,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organization-detail.html',
})
export class OrganizationDetail implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminApi);
  private readonly notifications = inject(NotificationService);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly roleOptions = ROLE_OPTIONS;

  protected readonly org = signal<OrgDetail | null>(null);
  protected readonly invitations = signal<readonly Invitation[]>([]);
  protected readonly loading = signal(true);
  protected readonly inviting = signal(false);
  protected readonly inviteConflict = signal(false);
  protected readonly lastInvite = signal<CreatedInvitation | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    role_key: ['member' as RoleKey, [Validators.required]],
  });

  ngOnInit(): void {
    this.load();
  }

  protected invite(): void {
    if (this.form.invalid || this.inviting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.inviting.set(true);
    this.inviteConflict.set(false);
    const { email, role_key } = this.form.getRawValue();

    this.admin.createInvitation(this.id(), { email: email.trim(), role_key }).subscribe({
      next: (invitation) => {
        this.inviting.set(false);
        this.lastInvite.set(invitation);
        this.form.reset({ email: '', role_key: 'member' });
        this.notifications.success('admin.invite.createdToast');
        this.loadInvitations();
      },
      error: (error: unknown) => {
        this.inviting.set(false);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.inviteConflict.set(true);
        }
      },
    });
  }

  protected copyAcceptUrl(): void {
    const url = this.lastInvite()?.accept_url;
    if (!url) {
      return;
    }
    void navigator.clipboard
      .writeText(url)
      .then(() => this.notifications.success('admin.copiedToast'));
  }

  protected revoke(invitation: Invitation): void {
    this.admin.revokeInvitation(invitation.id).subscribe({
      next: () => {
        if (this.lastInvite()?.id === invitation.id) {
          this.lastInvite.set(null);
        }
        this.notifications.success('admin.invite.revokedToast');
        this.loadInvitations();
      },
    });
  }

  protected roleBadgeKey(roleKey: string): string {
    return `admin.role.${roleKey}`;
  }

  private load(): void {
    this.loading.set(true);
    this.admin.getOrg(this.id()).subscribe({
      next: (org) => {
        this.org.set(org);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.loadInvitations();
  }

  private loadInvitations(): void {
    this.admin.listInvitations(this.id()).subscribe({
      next: (invitations) => this.invitations.set(invitations),
    });
  }
}

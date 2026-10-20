import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AdminApi } from '../../../core/admin/admin-api';
import {
  CreatedInvitation,
  Invitation,
  OrgDetail,
  OrgMember,
  RoleKey,
} from '../../../core/admin/admin.models';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { memberErrorKey } from '../../../core/org/member-errors';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import { ROLE_KEYS, roleNameKey } from '../../../core/org/roles';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';

const ROLE_OPTIONS: readonly RoleKey[] = ROLE_KEYS;

/**
 * Super-admin organisation detail: members (with global deactivate/reactivate),
 * an invite form, the most recent invite's copyable accept URL, and the list of
 * pending invitations.
 */
@Component({
  selector: 'app-organization-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Card,
    FormField,
    Button,
    Badge,
    Icon,
    ConfirmDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organization-detail.html',
})
export class OrganizationDetail implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminApi);
  private readonly notifications = inject(NotificationService);
  private readonly orgMembers = inject(OrgMembersApi);
  private readonly auth = inject(AuthService);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly roleOptions = ROLE_OPTIONS;

  protected readonly org = signal<OrgDetail | null>(null);
  protected readonly invitations = signal<readonly Invitation[]>([]);
  protected readonly loading = signal(true);
  protected readonly inviting = signal(false);
  protected readonly inviteConflict = signal(false);
  protected readonly lastInvite = signal<CreatedInvitation | null>(null);

  /** Account active state per user id (the admin org detail doesn't carry it, so it
   *  comes from the org members endpoint; a super-admin may read it). */
  protected readonly activeById = signal<Readonly<Record<string, boolean>>>({});
  /** Pending deactivate/reactivate confirmation. */
  protected readonly pendingToggle = signal<{
    readonly member: OrgMember;
    readonly action: 'deactivate' | 'reactivate';
  } | null>(null);
  protected readonly toggling = signal(false);
  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? null);

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
    return roleNameKey(roleKey);
  }

  /** Account active state, or null while unknown. */
  protected isActive(member: OrgMember): boolean | null {
    return this.activeById()[member.user_id] ?? null;
  }

  protected isSelf(member: OrgMember): boolean {
    return member.user_id === this.currentUserId();
  }

  protected askToggle(member: OrgMember, action: 'deactivate' | 'reactivate'): void {
    if (this.isSelf(member)) {
      return;
    }
    this.pendingToggle.set({ member, action });
  }

  protected cancelToggle(): void {
    this.pendingToggle.set(null);
  }

  protected confirmToggle(): void {
    const pending = this.pendingToggle();
    if (!pending || this.toggling()) {
      return;
    }
    const { member, action } = pending;
    const request =
      action === 'deactivate'
        ? this.admin.deactivateUser(member.user_id)
        : this.admin.reactivateUser(member.user_id);

    this.toggling.set(true);
    request.subscribe({
      next: (user) => {
        this.toggling.set(false);
        this.pendingToggle.set(null);
        this.activeById.update((map) => ({ ...map, [user.id]: user.is_active }));
        this.notifications.success(
          user.is_active ? 'admin.users.reactivatedToast' : 'admin.users.deactivatedToast',
          { name: member.full_name || member.email },
        );
      },
      error: (error: unknown) => {
        this.toggling.set(false);
        this.pendingToggle.set(null);
        this.notifications.error(memberErrorKey(error, action));
      },
    });
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
    this.loadActiveStates();
  }

  private loadActiveStates(): void {
    this.orgMembers.listMembers(this.id()).subscribe({
      next: (members) =>
        this.activeById.set(
          Object.fromEntries(members.map((member) => [member.user_id, member.is_active])),
        ),
    });
  }

  private loadInvitations(): void {
    this.admin.listInvitations(this.id()).subscribe({
      next: (invitations) => this.invitations.set(invitations),
    });
  }
}

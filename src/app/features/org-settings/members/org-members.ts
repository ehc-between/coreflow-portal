import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { memberErrorKey } from '../../../core/org/member-errors';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import { OrgMember, OrgRole } from '../../../core/org/org.models';
import { roleDescriptionKey, roleNameKey } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { canEditMember, grantableRoles, isSelf, roleSelectValue } from './member-rules';

/**
 * Settings → Members (requires `org:manage`): lists org members with their role and
 * active state, lets the caller change a member's role (only to `grantable` roles)
 * and remove a member after confirmation. The signed-in user cannot edit
 * themselves. Reloads when the selected org changes.
 */
@Component({
  selector: 'app-org-members',
  imports: [TranslocoPipe, Card, Badge, Button, Icon, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './org-members.html',
})
export class OrgMembers {
  private readonly api = inject(OrgMembersApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? null);

  protected readonly members = signal<readonly OrgMember[]>([]);
  protected readonly roles = signal<readonly OrgRole[]>([]);
  protected readonly loading = signal(false);

  /** Roles offered in the role select. */
  protected readonly grantable = computed(() => grantableRoles(this.roles()));

  /** User id whose role change is in flight. */
  protected readonly savingId = signal<string | null>(null);
  /** Shown after a successful role change: changes apply on the member's next token refresh. */
  protected readonly showRoleHint = signal(false);
  /** Inline, translated error for the last failed action. */
  protected readonly errorKey = signal<string | null>(null);

  protected readonly pendingRemoval = signal<OrgMember | null>(null);
  protected readonly removing = signal(false);

  protected readonly roleNameKey = roleNameKey;
  protected readonly roleDescriptionKey = roleDescriptionKey;
  protected readonly roleSelectValue = roleSelectValue;

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      this.members.set([]);
      this.roles.set([]);
      this.errorKey.set(null);
      this.showRoleHint.set(false);
      this.pendingRemoval.set(null);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected isSelf(member: OrgMember): boolean {
    return isSelf(member, this.currentUserId());
  }

  protected canEdit(member: OrgMember): boolean {
    return canEditMember(member, this.roles(), this.currentUserId());
  }

  protected displayName(member: OrgMember): string {
    return member.full_name?.trim() || member.email;
  }

  protected changeRole(member: OrgMember, select: HTMLSelectElement): void {
    const orgId = this.orgId();
    const roleKey = select.value;
    if (!orgId || !this.canEdit(member) || roleKey === roleSelectValue(member)) {
      return;
    }
    if (!this.grantable().some((role) => role.key === roleKey)) {
      select.value = roleSelectValue(member);
      return;
    }

    this.savingId.set(member.user_id);
    this.errorKey.set(null);
    this.showRoleHint.set(false);
    this.api.changeMemberRole(orgId, member.user_id, roleKey).subscribe({
      next: (updated) => {
        this.savingId.set(null);
        this.members.update((list) =>
          list.map((m) =>
            m.user_id === updated.user_id
              ? { ...m, roles: updated.roles, is_active: updated.is_active }
              : m,
          ),
        );
        this.showRoleHint.set(true);
        this.notifications.success('settings.members.roleChangedToast', {
          name: this.displayName(member),
        });
      },
      error: (error: unknown) => {
        this.savingId.set(null);
        select.value = roleSelectValue(member);
        this.fail(error, 'changeRole', orgId);
      },
    });
  }

  protected askRemove(member: OrgMember): void {
    if (!this.canEdit(member)) {
      return;
    }
    this.errorKey.set(null);
    this.pendingRemoval.set(member);
  }

  protected cancelRemove(): void {
    this.pendingRemoval.set(null);
  }

  protected confirmRemove(): void {
    const orgId = this.orgId();
    const member = this.pendingRemoval();
    if (!orgId || !member || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.api.removeMember(orgId, member.user_id).subscribe({
      next: () => {
        this.removing.set(false);
        this.pendingRemoval.set(null);
        this.members.update((list) => list.filter((m) => m.user_id !== member.user_id));
        this.notifications.success('settings.members.removedToast', {
          name: this.displayName(member),
        });
      },
      error: (error: unknown) => {
        this.removing.set(false);
        this.pendingRemoval.set(null);
        this.fail(error, 'remove', orgId);
      },
    });
  }

  private fail(error: unknown, action: 'changeRole' | 'remove', orgId: string): void {
    const key = memberErrorKey(error, action);
    this.errorKey.set(key);
    this.notifications.error(key);
    // The member may have been removed/changed elsewhere — resync.
    if (key === 'settings.errors.notMember') {
      this.loadMembers(orgId);
    }
  }

  private load(orgId: string): void {
    this.api.listRoles(orgId).subscribe({
      next: (roles) => {
        if (this.orgId() === orgId) this.roles.set(roles);
      },
    });
    this.loadMembers(orgId);
  }

  private loadMembers(orgId: string): void {
    this.loading.set(true);
    this.api.listMembers(orgId).subscribe({
      next: (members) => {
        if (this.orgId() !== orgId) return;
        this.members.set(
          [...members].sort((a, b) => this.displayName(a).localeCompare(this.displayName(b))),
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

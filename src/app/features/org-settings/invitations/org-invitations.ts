import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { memberErrorKey } from '../../../core/org/member-errors';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import { CreatedOrgInvitation, OrgInvitation, OrgRole } from '../../../core/org/org.models';
import { roleDescriptionKey, roleNameKey } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { grantableRoles } from '../members/member-rules';

/** Whether `invitation` is past `expires_at` (relative to `now`, default: the current time). */
export function isInvitationExpired(
  invitation: Pick<OrgInvitation, 'expires_at'>,
  now: number = Date.now(),
): boolean {
  const expires = Date.parse(invitation.expires_at);
  return !Number.isNaN(expires) && expires <= now;
}

/** Preferred default role in the invite form, when the caller may grant it. */
const DEFAULT_ROLE = 'member';

/**
 * Settings → Invitations (requires `users:invite`): invite by email with a
 * grantable role, list pending invitations, copy an accept link and revoke.
 *
 * The backend only returns the accept URL when an invitation is created, so
 * "copy link" is available for invitations created in this session; older ones
 * can be revoked and re-sent.
 */
@Component({
  selector: 'app-org-invitations',
  imports: [
    ReactiveFormsModule,
    LocalDatePipe,
    TranslocoPipe,
    Card,
    FormField,
    Button,
    Badge,
    Icon,
    ConfirmDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './org-invitations.html',
})
export class OrgInvitations {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(OrgMembersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly roles = signal<readonly OrgRole[]>([]);
  protected readonly invitations = signal<readonly OrgInvitation[]>([]);
  protected readonly loading = signal(false);
  protected readonly inviting = signal(false);
  protected readonly inviteErrorKey = signal<string | null>(null);
  protected readonly lastInvite = signal<CreatedOrgInvitation | null>(null);
  /** Accept URLs for invitations created in this session (id → url). */
  protected readonly acceptUrls = signal<Readonly<Record<string, string>>>({});

  protected readonly pendingRevoke = signal<OrgInvitation | null>(null);
  protected readonly revoking = signal(false);

  /** Roles offered in the invite form. */
  protected readonly grantable = computed(() => grantableRoles(this.roles()));

  protected readonly roleNameKey = roleNameKey;
  protected readonly roleDescriptionKey = roleDescriptionKey;

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    role_key: ['', [Validators.required]],
  });

  /** Role currently selected in the form (drives the description line). */
  protected readonly selectedRole = toSignal(this.form.controls.role_key.valueChanges, {
    initialValue: '',
  });

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      this.roles.set([]);
      this.invitations.set([]);
      this.lastInvite.set(null);
      this.acceptUrls.set({});
      this.inviteErrorKey.set(null);
      this.pendingRevoke.set(null);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected invite(): void {
    const orgId = this.orgId();
    if (!orgId || this.form.invalid || this.inviting()) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, role_key } = this.form.getRawValue();
    if (!this.grantable().some((role) => role.key === role_key)) {
      this.inviteErrorKey.set('settings.errors.escalation');
      return;
    }

    this.inviting.set(true);
    this.inviteErrorKey.set(null);
    this.api.createInvitation(orgId, { email: email.trim(), role_key }).subscribe({
      next: (invitation) => {
        this.inviting.set(false);
        this.lastInvite.set(invitation);
        this.acceptUrls.update((urls) => ({ ...urls, [invitation.id]: invitation.accept_url }));
        this.form.reset({ email: '', role_key: this.defaultRole() });
        this.notifications.success('settings.invitations.createdToast', {
          email: invitation.email,
        });
        this.loadInvitations(orgId);
      },
      error: (error: unknown) => {
        this.inviting.set(false);
        this.inviteErrorKey.set(memberErrorKey(error, 'invite'));
      },
    });
  }

  /** Past its expiry (the backend may still list it as pending until cleaned up). */
  protected isExpired(invitation: OrgInvitation): boolean {
    return isInvitationExpired(invitation);
  }

  protected acceptUrl(invitation: OrgInvitation): string | null {
    return this.acceptUrls()[invitation.id] ?? null;
  }

  protected copy(url: string | null | undefined): void {
    if (!url) {
      return;
    }
    void navigator.clipboard
      ?.writeText(url)
      .then(() => this.notifications.success('settings.invitations.copiedToast'))
      .catch(() => this.notifications.error('settings.invitations.copyFailed'));
  }

  protected askRevoke(invitation: OrgInvitation): void {
    this.pendingRevoke.set(invitation);
  }

  protected cancelRevoke(): void {
    this.pendingRevoke.set(null);
  }

  protected confirmRevoke(): void {
    const orgId = this.orgId();
    const invitation = this.pendingRevoke();
    if (!orgId || !invitation || this.revoking()) {
      return;
    }
    this.revoking.set(true);
    this.api.revokeInvitation(orgId, invitation.id).subscribe({
      next: () => {
        this.revoking.set(false);
        this.pendingRevoke.set(null);
        if (this.lastInvite()?.id === invitation.id) {
          this.lastInvite.set(null);
        }
        this.invitations.update((list) => list.filter((i) => i.id !== invitation.id));
        this.notifications.success('settings.invitations.revokedToast');
      },
      error: (error: unknown) => {
        this.revoking.set(false);
        this.pendingRevoke.set(null);
        this.notifications.error(memberErrorKey(error, 'revoke'));
        this.loadInvitations(orgId);
      },
    });
  }

  private defaultRole(): string {
    const grantable = this.grantable();
    return grantable.find((role) => role.key === DEFAULT_ROLE)?.key ?? grantable[0]?.key ?? '';
  }

  private load(orgId: string): void {
    this.api.listRoles(orgId).subscribe({
      next: (roles) => {
        if (this.orgId() !== orgId) return;
        this.roles.set(roles);
        this.form.controls.role_key.setValue(this.defaultRole());
      },
    });
    this.loadInvitations(orgId);
  }

  private loadInvitations(orgId: string): void {
    this.loading.set(true);
    this.api.listInvitations(orgId).subscribe({
      next: (invitations) => {
        if (this.orgId() !== orgId) return;
        this.invitations.set(invitations);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

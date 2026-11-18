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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { hasAnyPermission } from '../../../core/auth/permission';
import { OrgApi } from '../../../core/org/org-api';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { SettingsPeopleNav } from '../settings-nav/settings-nav';
import { NotificationService } from '../../../core/notifications/notification.service';
import { memberErrorKey } from '../../../core/org/member-errors';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import {
  BulkInvitationSkipped,
  CreatedOrgInvitation,
  DepartmentSummary,
  OrgInvitation,
  OrgRole,
} from '../../../core/org/org.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { relevantRoles, roleDescription, roleLabel } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { grantableRoles } from '../members/member-rules';

/** Whether `invitation` is past `expires_at` (relative to `now`, default: the current time). */
export function isInvitationExpired(
  invitation: Pick<OrgInvitation, 'expires_at'>,
  now: number = Date.now(),
): boolean {
  const expires = Date.parse(invitation.expires_at);
  return !Number.isNaN(expires) && expires <= now;
}

/** Whole days until `invitation` expires (0 = today; negative = expired). */
export function daysUntilExpiry(
  invitation: Pick<OrgInvitation, 'expires_at'>,
  now: number = Date.now(),
): number | null {
  const expires = Date.parse(invitation.expires_at);
  if (Number.isNaN(expires)) return null;
  return Math.floor((expires - now) / 86_400_000);
}

/** Most addresses one bulk invitation takes (backend limit). */
export const BULK_INVITE_MAX = 50;

/**
 * Split pasted text into unique, trimmed addresses (commas, semicolons, spaces or
 * new lines). Returns the valid ones and the ones that do not look like an email.
 */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const email = raw.trim().replace(/^<|>$/g, '');
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? valid : invalid).push(email);
  }
  return { valid, invalid };
}

/** Preferred default role in the invite form, when the caller may grant it. */
const DEFAULT_ROLE = 'member';

/**
 * Settings → Invitations (requires `users:invite`): invite one person or several
 * at once (up to 50 addresses) with a grantable role and, optionally, the
 * department they join on acceptance; list pending invitations with who invited,
 * the department and how many days are left, copy an accept link and revoke.
 *
 * The backend only returns the accept URL when an invitation is created, so
 * "copy link" is available for invitations created in this session; older ones
 * can be revoked and re-sent.
 */
@Component({
  selector: 'app-org-invitations',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    HelpStrip,
    SettingsPeopleNav,
    LocalDatePipe,
    TranslocoPipe,
    Card,
    FormField,
    Button,
    Badge,
    Icon,
    ConfirmDialog,
    EmptyState,
    LoadingState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './org-invitations.html',
})
export class OrgInvitations {
  private readonly fb = inject(FormBuilder);
  private readonly language = inject(LanguageService);
  private readonly api = inject(OrgMembersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly orgApi = inject(OrgApi);

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
  protected readonly departments = signal<readonly DepartmentSummary[]>([]);
  /** One address, or several pasted at once. */
  protected readonly bulk = signal(false);
  protected readonly bulkText = signal('');
  protected readonly bulkParsed = computed(() => parseEmails(this.bulkText()));
  protected readonly bulkSkipped = signal<readonly BulkInvitationSkipped[]>([]);
  protected readonly bulkMax = BULK_INVITE_MAX;
  protected readonly canManage = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'org:manage'),
  );
  protected readonly revoking = signal(false);

  /** Roles offered in the invite form. */
  protected readonly grantable = computed(() =>
    relevantRoles(
      grantableRoles(this.roles()),
      this.invitations().map((i) => i.role_key),
    ),
  );

  protected roleName(roleKey: string): string {
    return roleLabel((key) => this.language.translate(key), roleKey, this.roles());
  }

  protected roleDescription(roleKey: string): string {
    return roleDescription((key) => this.language.translate(key), roleKey);
  }

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    role_key: ['', [Validators.required]],
    department_id: [''],
  });

  /** Role currently selected in the form (drives the description line). */
  protected readonly selectedRole = toSignal(this.form.controls.role_key.valueChanges, {
    initialValue: '',
  });

  constructor() {
    providePageContext(() => ({
      module: null,
      entityType: 'invitation',
      view: 'settings',
      title: this.language.translate('settings.invitations.title'),
    }));

    effect(() => {
      const orgId = this.orgId();
      this.roles.set([]);
      this.invitations.set([]);
      this.lastInvite.set(null);
      this.acceptUrls.set({});
      this.inviteErrorKey.set(null);
      this.pendingRevoke.set(null);
      this.departments.set([]);
      this.bulkSkipped.set([]);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected invite(): void {
    if (this.bulk()) {
      this.inviteMany();
      return;
    }
    const orgId = this.orgId();
    if (!orgId || this.form.invalid || this.inviting()) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, role_key, department_id } = this.form.getRawValue();
    if (!this.grantable().some((role) => role.key === role_key)) {
      this.inviteErrorKey.set('settings.errors.escalation');
      return;
    }

    this.inviting.set(true);
    this.inviteErrorKey.set(null);
    this.api
      .createInvitation(orgId, {
        email: email.trim(),
        role_key,
        department_id: department_id || null,
      })
      .subscribe({
        next: (invitation) => {
          this.inviting.set(false);
          this.lastInvite.set(invitation);
          const url = invitation.accept_url;
          if (url) {
            this.acceptUrls.update((urls) => ({ ...urls, [invitation.id]: url }));
          }
          this.form.reset({
            email: '',
            role_key: this.defaultRole(),
            department_id: this.form.controls.department_id.value,
          });
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

  /** Invite every pasted address with the selected role (and department). */
  private inviteMany(): void {
    const orgId = this.orgId();
    const { role_key, department_id } = this.form.getRawValue();
    const emails = this.bulkParsed().valid;
    if (!orgId || this.inviting() || emails.length === 0 || emails.length > BULK_INVITE_MAX) {
      return;
    }
    if (!this.grantable().some((role) => role.key === role_key)) {
      this.inviteErrorKey.set('settings.errors.escalation');
      return;
    }
    this.inviting.set(true);
    this.inviteErrorKey.set(null);
    this.bulkSkipped.set([]);
    this.api
      .bulkInvite(orgId, { emails, role_key, department_id: department_id || null })
      .subscribe({
        next: (result) => {
          this.inviting.set(false);
          this.bulkSkipped.set(result.skipped);
          this.bulkText.set('');
          this.lastInvite.set(null);
          const urls: Record<string, string> = {};
          for (const invitation of result.created) {
            if (invitation.accept_url) urls[invitation.id] = invitation.accept_url;
          }
          this.acceptUrls.update((current) => ({ ...current, ...urls }));
          this.notifications.success(
            result.created.length === 1
              ? 'settings.invitations.bulkCreatedOne'
              : 'settings.invitations.bulkCreated',
            { count: result.created.length },
          );
          this.loadInvitations(orgId);
        },
        error: (error: unknown) => {
          this.inviting.set(false);
          this.inviteErrorKey.set(memberErrorKey(error, 'invite'));
        },
      });
  }

  protected daysLeft(invitation: OrgInvitation): number | null {
    return daysUntilExpiry(invitation);
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
    if (this.canManage()) {
      this.orgApi.listDepartments(orgId).subscribe({
        next: (departments) => {
          if (this.orgId() === orgId) this.departments.set(departments);
        },
        error: () => undefined,
      });
    }
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

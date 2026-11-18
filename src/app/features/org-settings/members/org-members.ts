import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { hasAnyPermission } from '../../../core/auth/permission';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { memberErrorKey } from '../../../core/org/member-errors';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import { OrgApi } from '../../../core/org/org-api';
import { DepartmentSummary, OrgMember, OrgRole } from '../../../core/org/org.models';
import { relevantRoles, roleDescription, roleLabel } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { RelativeTimePipe } from '../../../shared/relative-time/relative-time';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { Pager } from '../../../shared/ui/pager/pager';
import { Switch } from '../../../shared/ui/switch/switch';
import { SettingsPeopleNav } from '../settings-nav/settings-nav';
import {
  EMPTY_MEMBER_FILTER,
  MemberFilter,
  MemberStatusFilter,
  NO_DEPARTMENT,
  canEditMember,
  filterMembers,
  grantableRoles,
  isFiltered,
  isSelf,
  operatorCount,
} from './member-rules';
import { RoleEditor } from './role-editor';

/** Rows per page of the members list. */
export const MEMBERS_PAGE_SIZE = 25;

/**
 * `/settings/members` (org:manage): everyone with access to the organisation.
 * Search and filter by role, department and status; each row shows the access
 * level, departments, two-step sign-in and last activity, and links to the
 * person's entry in the People register. Access is changed in a dialog that
 * shows what the person gains or loses, and is saved explicitly. Platform
 * operator (service) accounts are hidden unless asked for.
 */
@Component({
  selector: 'app-org-members',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    RelativeTimePipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    Icon,
    LoadingState,
    MenuItem,
    OverflowMenu,
    PageHeader,
    HelpStrip,
    TourStepDirective,
    Pager,
    Switch,
    SettingsPeopleNav,
    RoleEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './org-members.html',
})
export class OrgMembers {
  private readonly api = inject(OrgMembersApi);
  private readonly orgApi = inject(OrgApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly lang = this.language.active;
  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? null);
  protected readonly noDepartment = NO_DEPARTMENT;
  protected readonly pageSize = MEMBERS_PAGE_SIZE;

  private readonly granted = computed(() => this.selectedOrg.currentOrg()?.permissions);
  protected readonly canInvite = computed(() => hasAnyPermission(this.granted(), 'users:invite'));
  protected readonly canReviewAccess = computed(() =>
    hasAnyPermission(this.granted(), ['assets:write', 'assets:manage']),
  );

  protected readonly members = signal<readonly OrgMember[]>([]);
  protected readonly roles = signal<readonly OrgRole[]>([]);
  protected readonly departments = signal<readonly DepartmentSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);

  protected readonly filter = signal<MemberFilter>(EMPTY_MEMBER_FILTER);
  protected readonly offset = signal(0);

  /** Roles offered in the access dialog. */
  protected readonly grantable = computed(() => grantableRoles(this.roles()));
  /** Seeded roles plus roles somebody holds (unused custom roles stay out of the dialog). */
  protected readonly editorRoles = computed(() =>
    relevantRoles(
      this.roles(),
      this.members().flatMap((m) => m.roles),
    ),
  );

  /** Member whose access is being changed (dialog open). */
  protected readonly editing = signal<OrgMember | null>(null);
  protected readonly saving = signal(false);
  /** Shown after a successful change: it applies on the member's next token refresh. */
  protected readonly showRoleHint = signal(false);
  /** Inline, translated error for the last failed action. */
  protected readonly errorKey = signal<string | null>(null);

  protected readonly pendingRemoval = signal<OrgMember | null>(null);
  protected readonly removing = signal(false);

  protected readonly hiddenOperators = computed(() =>
    this.filter().showOperators ? 0 : operatorCount(this.members()),
  );
  protected readonly filtered = computed(() => filterMembers(this.members(), this.filter()));
  protected readonly page = computed(() =>
    this.filtered().slice(this.offset(), this.offset() + MEMBERS_PAGE_SIZE),
  );
  protected readonly narrowed = computed(() => isFiltered(this.filter()));
  /** Staff members (operators excluded), for the header line. */
  protected readonly staffCount = computed(
    () => this.members().filter((m) => !m.is_platform_operator).length,
  );
  protected readonly withoutMfa = computed(
    () => this.members().filter((m) => !m.is_platform_operator && m.mfa_enabled === false).length,
  );
  /** Role keys present in the list, for the role filter. */
  protected readonly roleOptions = computed(() => {
    const keys = new Set(this.members().flatMap((m) => m.roles));
    return [...keys]
      .map((key) => ({ key, label: this.roleName(key) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  constructor() {
    providePageContext(() => ({
      module: null,
      entityType: 'org_member',
      view: 'settings',
      title: this.language.translate('settings.members.pageTitle'),
    }));

    effect(() => {
      const orgId = this.orgId();
      this.members.set([]);
      this.roles.set([]);
      this.departments.set([]);
      this.errorKey.set(null);
      this.showRoleHint.set(false);
      this.pendingRemoval.set(null);
      this.editing.set(null);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected roleName(roleKey: string): string {
    return roleLabel((key) => this.language.translate(key), roleKey, this.roles());
  }

  protected roleDescription(roleKey: string): string {
    return roleDescription((key) => this.language.translate(key), roleKey);
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

  protected hasName(member: OrgMember): boolean {
    return !!member.full_name?.trim();
  }

  protected patchFilter(patch: Partial<MemberFilter>): void {
    this.filter.update((current) => ({ ...current, ...patch }));
    this.offset.set(0);
  }

  protected setStatus(value: string): void {
    this.patchFilter({ status: (value || 'all') as MemberStatusFilter });
  }

  protected clearFilters(): void {
    this.filter.update((current) => ({
      ...EMPTY_MEMBER_FILTER,
      showOperators: current.showOperators,
    }));
    this.offset.set(0);
  }

  protected openEditor(member: OrgMember): void {
    if (!this.canEdit(member)) {
      return;
    }
    this.errorKey.set(null);
    this.editing.set(member);
  }

  protected saveRoles(roleKeys: readonly string[]): void {
    const orgId = this.orgId();
    const member = this.editing();
    if (!orgId || !member || this.saving()) {
      return;
    }
    if (!roleKeys.every((key) => this.grantable().some((role) => role.key === key))) {
      this.errorKey.set('settings.errors.escalation');
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    this.showRoleHint.set(false);
    this.api.setMemberRoles(orgId, member.user_id, roleKeys).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.editing.set(null);
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
        this.saving.set(false);
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

  protected reload(): void {
    const orgId = this.orgId();
    if (orgId) {
      this.load(orgId);
    }
  }

  private fail(error: unknown, action: 'changeRole' | 'remove', orgId: string): void {
    const key = memberErrorKey(error, action);
    this.errorKey.set(key);
    this.notifications.error(key);
    // The member may have been removed/changed elsewhere — resync.
    if (key === 'settings.errors.notMember') {
      this.editing.set(null);
      this.loadMembers(orgId);
    }
  }

  private load(orgId: string): void {
    this.api.listRoles(orgId).subscribe({
      next: (roles) => {
        if (this.orgId() === orgId) this.roles.set(roles);
      },
    });
    this.orgApi.listDepartments(orgId).subscribe({
      next: (departments) => {
        if (this.orgId() === orgId) this.departments.set(departments);
      },
      error: () => undefined,
    });
    this.loadMembers(orgId);
  }

  private loadMembers(orgId: string): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.api.listMembers(orgId).subscribe({
      next: (members) => {
        if (this.orgId() !== orgId) return;
        this.members.set(
          [...members].sort((a, b) => this.displayName(a).localeCompare(this.displayName(b))),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }
}

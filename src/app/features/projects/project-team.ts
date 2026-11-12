import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { MEMBER_ROLES, MemberRole, ProjectMember, isOneOf } from './data/project.models';
import { projectErrorKey } from './data/project-errors';
import { ProjectsApi } from './data/projects-api';

/**
 * The project team: everyone's role (manager, member, reviewer, stakeholder). With
 * the edit right people can be added, re-roled and removed; the owner is always a
 * manager and cannot be removed.
 */
@Component({
  selector: 'app-project-team',
  imports: [TranslocoPipe, FieldHelp, Badge, Button, ConfirmDialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="font-display text-[15px] font-bold text-fg">
        {{ 'projects.team.title' | transloco }}
        <span class="ml-1 text-[13px] font-normal text-fg-subtle">{{ members().length }}</span>
      </h2>
    </div>
    <app-field-help scope="projects" page="detail" field="team" />
    <ul class="mt-2 flex flex-col divide-y divide-border" data-testid="team">
      @for (m of members(); track m.user_id) {
        <li class="flex flex-wrap items-center gap-2 py-2">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13.5px] font-semibold text-fg">{{ m.name }}</span>
            @if (m.is_owner) {
              <app-badge tone="accent">{{ 'projects.team.owner' | transloco }}</app-badge>
            }
          </span>
          @if (canEdit() && !m.is_owner) {
            <label class="sr-only" [for]="'cf-team-role-' + m.user_id">
              {{ 'projects.team.roleFor' | transloco: { name: m.name } }}
            </label>
            <select
              [id]="'cf-team-role-' + m.user_id"
              class="h-8 rounded-[8px] border border-border bg-bg px-2 text-[12.5px] text-fg"
              [disabled]="busy()"
              (change)="setRole(m.user_id, $any($event.target).value)"
            >
              @for (r of roles; track r) {
                <option [value]="r" [selected]="m.role === r">
                  {{ 'projects.roles.' + r | transloco }}
                </option>
              }
            </select>
            <button
              type="button"
              class="rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
              [attr.aria-label]="'projects.team.removeNamed' | transloco: { name: m.name }"
              (click)="removing.set(m)"
              [attr.data-testid]="'remove-member-' + m.user_id"
            >
              <app-icon name="x" [size]="14" />
            </button>
          } @else {
            <span class="text-[12.5px] text-fg-muted">{{
              'projects.roles.' + m.role | transloco
            }}</span>
          }
        </li>
      } @empty {
        <li class="py-2 text-[13px] text-fg-muted">{{ 'projects.team.empty' | transloco }}</li>
      }
    </ul>

    @if (canEdit()) {
      <div class="mt-3 flex flex-wrap items-end gap-2">
        <div class="flex min-w-[160px] flex-1 flex-col gap-1">
          <label for="cf-team-add" class="text-[12.5px] font-semibold text-fg-muted">
            {{ 'projects.team.addPerson' | transloco }}
          </label>
          <select
            id="cf-team-add"
            class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="pick.set($any($event.target).value)"
            data-testid="team-add-user"
          >
            <option value="" [selected]="!pick()">
              {{ 'projects.team.choosePerson' | transloco }}
            </option>
            @for (u of addable(); track u.id) {
              <option [value]="u.id" [selected]="pick() === u.id">{{ u.label }}</option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cf-team-add-role" class="text-[12.5px] font-semibold text-fg-muted">
            {{ 'projects.team.role' | transloco }}
          </label>
          <select
            id="cf-team-add-role"
            class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="pickRole.set($any($event.target).value)"
          >
            @for (r of roles; track r) {
              <option [value]="r" [selected]="pickRole() === r">
                {{ 'projects.roles.' + r | transloco }}
              </option>
            }
          </select>
        </div>
        <app-button
          size="sm"
          variant="secondary"
          [disabled]="!pick() || busy()"
          (click)="add()"
          data-testid="team-add"
        >
          <app-icon name="userplus" [size]="14" />
          {{ 'projects.team.add' | transloco }}
        </app-button>
      </div>
    }

    <app-confirm-dialog
      [open]="!!removing()"
      [title]="'projects.team.removeTitle' | transloco"
      [message]="'projects.team.removeMessage' | transloco: { name: removing()?.name ?? '' }"
      [confirmLabel]="'projects.team.remove' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
  `,
})
export class ProjectTeam {
  private readonly api = inject(ProjectsApi);
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly projectId = input.required<string>();
  readonly members = input.required<readonly ProjectMember[]>();
  readonly canEdit = input(false);
  /** Emitted after a change (the page reloads the project). */
  readonly changed = output<void>();

  protected readonly roles = MEMBER_ROLES;
  protected readonly busy = signal(false);
  protected readonly pick = signal('');
  protected readonly pickRole = signal<MemberRole>('member');
  protected readonly removing = signal<ProjectMember | null>(null);

  protected readonly addable = computed(() => {
    const taken = new Set(this.members().map((m) => m.user_id));
    return this.assignees
      .options()
      .users.map((o) => ({ id: o.value.slice(5), label: o.label }))
      .filter((u) => !taken.has(u.id));
  });

  constructor() {
    this.assignees.ensureLoaded();
  }

  protected add(): void {
    const userId = this.pick();
    if (userId) {
      this.put(userId, this.pickRole(), 'projects.notices.memberAdded');
    }
  }

  protected setRole(userId: string, role: string): void {
    if (isOneOf(MEMBER_ROLES, role)) {
      this.put(userId, role, 'projects.notices.memberUpdated');
    }
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const member = this.removing();
    if (!orgId || !member || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.removeMember(orgId, this.projectId(), member.user_id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.notifications.success('projects.notices.memberRemoved', { name: member.name });
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  private put(userId: string, role: MemberRole, notice: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.setMember(orgId, this.projectId(), userId, role).subscribe({
      next: () => {
        this.busy.set(false);
        this.pick.set('');
        this.notifications.success(notice);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }
}

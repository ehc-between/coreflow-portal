import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOut } from '../../core/tasks/task.models';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { RoleNamePipe } from '../roles/role-name.pipe';
import { Icon } from '../ui/icon/icon';

/**
 * A task's assignee with an icon for its kind (person, role, department), or
 * "Unassigned". Roles show their translated name (seeded) or stored name (custom).
 */
@Component({
  selector: 'app-assignee-label',
  imports: [TranslocoPipe, Icon, RoleNamePipe],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (assignee(); as a) {
      <span class="inline-flex min-w-0 items-center gap-1.5">
        <app-icon [name]="icon()" [size]="13" class="flex-none text-fg-subtle" />
        <span class="sr-only">{{ 'tasks.assignee.types.' + a.type | transloco }}:</span>
        <span class="truncate">
          @if (a.type === 'role') {
            {{ a.value | roleName: a.name }}
          } @else {
            {{ a.name || a.value }}
          }
        </span>
      </span>
    } @else {
      <span class="text-fg-subtle">{{ 'tasks.assignee.unassigned' | transloco }}</span>
    }
  `,
})
export class AssigneeLabel {
  readonly assignee = input<AssigneeOut | null>(null);

  protected readonly icon = computed(() => {
    switch (this.assignee()?.type) {
      case 'role':
        return 'lock';
      case 'department':
        return 'people';
      default:
        return 'userplus';
    }
  });
}

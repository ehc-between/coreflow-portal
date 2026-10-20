import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ActionListItem } from '../../../core/deviations/deviation.models';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  actionKindLabelKey,
  actionStatusLabelKey,
  actionStatusTone,
  isActionOverdue,
} from '../deviation-enums';

/**
 * One row of a cross-deviation CAPA action list (My Work, the actions list):
 * kind, description, parent deviation, status, optional owner and due date
 * (overdue highlighted). The whole row links to the parent deviation, where
 * the action is edited.
 */
@Component({
  selector: 'app-action-list-row',
  imports: [LocalDatePipe, RouterLink, TranslocoPipe, Badge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = action();
    <a
      [routerLink]="['/deviations', a.deviation_id]"
      class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
      [class.bg-fail-soft]="overdue()"
    >
      <span class="w-[96px] flex-none">
        <app-badge tone="neutral">{{ kindLabelKey(a.kind) | transloco }}</app-badge>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[13.5px] font-semibold text-fg">{{ a.description }}</span>
        <span class="block truncate text-[12.5px] text-fg-muted">
          <span class="font-mono text-[12px] text-fg-subtle">{{ a.deviation_code }}</span>
          {{ a.deviation_title }}
        </span>
      </span>
      <app-badge [tone]="statusTone(a.status)">
        {{ statusLabelKey(a.status) | transloco }}
      </app-badge>
      @if (showOwner()) {
        <span
          class="hidden w-[120px] flex-none truncate text-right text-[12.5px] text-fg-subtle sm:block"
        >
          {{ a.owner_name ?? ('deviations.actions.unassigned' | transloco) }}
        </span>
      }
      <span
        class="flex w-[120px] flex-none items-center justify-end gap-1 text-[12.5px]"
        [class.font-semibold]="overdue()"
        [class.text-fail]="overdue()"
        [class.text-fg-muted]="!overdue()"
      >
        @if (overdue()) {
          <app-icon name="alert" [size]="13" />
        }
        @if (a.due_at) {
          {{ a.due_at | localDate: 'mediumDate' }}
        } @else {
          {{ 'myWork.owned.noDueDate' | transloco }}
        }
      </span>
    </a>
  `,
})
export class ActionListRow {
  readonly action = input.required<ActionListItem>();
  /** Show the owner column (off on My Work, where every row is the user's). */
  readonly showOwner = input(false);

  protected readonly overdue = computed(() =>
    isActionOverdue(this.action().due_at, this.action().status),
  );

  protected readonly kindLabelKey = actionKindLabelKey;
  protected readonly statusLabelKey = actionStatusLabelKey;
  protected readonly statusTone = actionStatusTone;
}

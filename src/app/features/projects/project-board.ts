import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, switchMap } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { EditableTaskStatus, TaskDetail, TaskStatus } from '../../core/tasks/task.models';
import { TasksApi } from '../../core/tasks/tasks-api';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Icon } from '../../shared/ui/icon/icon';
import { routerTarget } from './data/gantt';
import { BOARD_COLUMNS } from './data/project-display';
import { PlanItem } from './data/project.models';

/** Board columns with the plan's tasks; cancelled tasks are left out. */
export function boardColumns(
  items: readonly PlanItem[],
): readonly { readonly status: TaskStatus; readonly tasks: readonly PlanItem[] }[] {
  const tasks = items.filter((i) => i.kind === 'task');
  return BOARD_COLUMNS.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  }));
}

/**
 * The project's task board: every platform task on the project or on one of its
 * milestones, in columns by status. A card's status is changed with its select
 * (keyboard friendly, no drag and drop needed); moving to "done" completes the
 * task and moving out of "done" reopens it.
 */
@Component({
  selector: 'app-project-board',
  imports: [RouterLink, TranslocoPipe, LocalDayPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (taskCount() === 0) {
      <p class="py-6 text-center text-[13px] text-fg-muted" data-testid="board-empty">
        {{ 'projects.board.empty' | transloco }}
      </p>
    } @else {
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="board">
        @for (col of columns(); track col.status) {
          <section
            class="flex min-w-0 flex-col gap-2 rounded-tile bg-surface-2 p-2.5"
            [attr.aria-labelledby]="'cf-board-' + col.status"
            [attr.data-testid]="'board-col-' + col.status"
          >
            <h3
              [id]="'cf-board-' + col.status"
              class="flex items-center justify-between px-1 text-[12.5px] font-semibold text-fg-muted"
            >
              {{ 'projects.board.columns.' + col.status | transloco }}
              <span class="text-fg-subtle">{{ col.tasks.length }}</span>
            </h3>
            @for (t of col.tasks; track t.id) {
              <article
                class="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
              >
                <a
                  [routerLink]="target(t).path"
                  [queryParams]="target(t).query"
                  class="text-[13px] font-semibold break-words text-fg hover:underline"
                  >{{ t.title }}</a
                >
                <p class="flex flex-wrap items-center gap-x-2 text-[11.5px] text-fg-subtle">
                  @if (t.owner?.name; as name) {
                    <span>{{ name }}</span>
                  }
                  @if (t.end) {
                    <span [class.text-fail]="t.is_overdue" [class.font-semibold]="t.is_overdue">
                      @if (t.is_overdue) {
                        <app-icon name="alert" [size]="11" />
                      }
                      {{ 'projects.board.due' | transloco: { date: (t.end | localDay) } }}
                    </span>
                  }
                  @if (parentTitle(t); as parent) {
                    <span class="truncate">{{ parent }}</span>
                  }
                </p>
                @if (canMove()) {
                  <label class="sr-only" [for]="'cf-move-' + t.id">
                    {{ 'projects.board.moveLabel' | transloco: { title: t.title } }}
                  </label>
                  <select
                    [id]="'cf-move-' + t.id"
                    class="h-8 rounded-[8px] border border-border bg-bg px-2 text-[12px] text-fg"
                    [disabled]="busyId() === t.id"
                    (change)="move(t, $any($event.target).value)"
                    [attr.data-testid]="'move-' + t.id"
                  >
                    @for (s of statuses; track s) {
                      <option [value]="s" [selected]="t.status === s">
                        {{ 'projects.board.columns.' + s | transloco }}
                      </option>
                    }
                  </select>
                }
              </article>
            }
          </section>
        }
      </div>
    }
  `,
})
export class ProjectBoard {
  private readonly tasksApi = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly items = input.required<readonly PlanItem[]>();
  readonly canMove = input(false);
  /** Emitted after a task changed status (the page reloads the plan). */
  readonly changed = output<void>();

  protected readonly statuses = BOARD_COLUMNS;
  protected readonly busyId = signal<string | null>(null);
  protected readonly columns = computed(() => boardColumns(this.items()));
  protected readonly taskCount = computed(() =>
    this.columns().reduce((n, c) => n + c.tasks.length, 0),
  );
  private readonly titles = computed(
    () => new Map(this.items().map((i) => [i.id, i.title] as const)),
  );

  protected target(item: PlanItem) {
    return routerTarget(item.url);
  }

  protected parentTitle(item: PlanItem): string | null {
    return item.parent_id ? (this.titles().get(item.parent_id) ?? null) : null;
  }

  protected move(task: PlanItem, value: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const to = BOARD_COLUMNS.find((s) => s === value);
    if (!orgId || !to || to === task.status || this.busyId()) {
      return;
    }
    let call: Observable<TaskDetail>;
    if (to === 'done') {
      call = this.tasksApi.complete(orgId, task.id);
    } else if (task.status === 'done' || task.status === 'cancelled') {
      const reopened = this.tasksApi.reopen(orgId, task.id);
      call =
        to === 'open'
          ? reopened
          : reopened.pipe(
              switchMap(() =>
                this.tasksApi.update(orgId, task.id, { status: to as EditableTaskStatus }),
              ),
            );
    } else {
      call = this.tasksApi.update(orgId, task.id, { status: to as EditableTaskStatus });
    }
    this.busyId.set(task.id);
    call.subscribe({
      next: () => {
        this.busyId.set(null);
        this.changed.emit();
      },
      error: () => {
        this.busyId.set(null);
        this.notifications.error('projects.board.moveFailed');
        this.changed.emit();
      },
    });
  }
}

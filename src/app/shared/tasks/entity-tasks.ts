import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { taskErrorKey } from '../../core/tasks/task-errors';
import { AssigneeIn, Task } from '../../core/tasks/task.models';
import { TasksApi } from '../../core/tasks/tasks-api';
import { LocalDayPipe } from '../locale/locale-pipes';
import { Badge } from '../ui/badge/badge';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { SlideOver } from '../ui/slide-over/slide-over';
import { AssigneeLabel } from './assignee-label';
import { TaskForm, TaskFormResult, TaskFormValue } from './task-form';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import {
  isClosedStatus,
  taskPriorityKey,
  taskPriorityTone,
  taskStatusKey,
  taskStatusTone,
} from './task-display';

/** Tasks fetched per record (the API's page cap). */
const LIMIT = 200;

/**
 * The tasks on one record (deviation, risk, audit …), for record detail pages:
 * open tasks first with a tick box to complete them, a quick-add line, a full
 * form in a side panel, and closed tasks behind a toggle. Reads need
 * `tasks:read` (and read access to the record); `canCreate` should reflect the
 * caller's edit right on the record plus `tasks:write`.
 *
 *   <app-entity-tasks entityType="deviation" [entityId]="id" [canCreate]="canEdit()" />
 */
@Component({
  selector: 'app-entity-tasks',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Icon,
    SlideOver,
    AssigneeLabel,
    TaskForm,
  ],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-3" [attr.aria-label]="'tasks.entity.title' | transloco">
      <div class="flex items-center gap-2">
        <h3 class="font-display text-[15px] font-bold text-fg">
          {{ 'tasks.entity.title' | transloco }}
        </h3>
        @if (state() === 'ready') {
          <app-badge tone="neutral">{{ openTasks().length }}</app-badge>
        }
      </div>

      @if (state() === 'loading') {
        <p class="text-[13px] text-fg-muted">{{ 'tasks.common.loading' | transloco }}</p>
      } @else if (state() === 'error') {
        <p class="text-[13px] text-fail">{{ 'tasks.common.loadFailed' | transloco }}</p>
      } @else if (state() === 'ready') {
        @if (openTasks().length === 0) {
          <p class="text-[13px] text-fg-muted">{{ 'tasks.entity.empty' | transloco }}</p>
        } @else {
          <ul class="divide-y divide-border rounded-card border border-border bg-surface">
            @for (task of openTasks(); track task.id) {
              <li class="flex items-center gap-3 px-3 py-2.5" [class.bg-fail-soft]="task.overdue">
                <input
                  type="checkbox"
                  class="h-4 w-4 flex-none"
                  [checked]="busyId() === task.id"
                  [disabled]="busyId() === task.id"
                  [attr.aria-label]="'tasks.entity.complete' | transloco: { title: task.title }"
                  (change)="complete(task)"
                />
                <a
                  [routerLink]="['/tasks', task.id]"
                  class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg hover:underline"
                >
                  {{ task.title }}
                </a>
                <span class="hidden text-[12.5px] text-fg-muted sm:inline-flex">
                  <app-assignee-label [assignee]="task.assignee" />
                </span>
                @if (task.priority === 'high' || task.priority === 'urgent') {
                  <app-badge [tone]="priorityTone(task.priority)">
                    {{ priorityKey(task.priority) | transloco }}
                  </app-badge>
                }
                @if (task.status !== 'open') {
                  <app-badge [tone]="statusTone(task.status)">
                    {{ statusKey(task.status) | transloco }}
                  </app-badge>
                }
                <span
                  class="w-[96px] flex-none text-right text-[12.5px]"
                  [class.text-fail]="task.overdue"
                  [class.font-semibold]="task.overdue"
                  [class.text-fg-muted]="!task.overdue"
                >
                  {{ task.due_at | localDay }}
                </span>
              </li>
            }
          </ul>
        }

        @if (canCreate()) {
          <form
            class="flex flex-wrap items-center gap-2"
            (submit)="$event.preventDefault(); quickAdd()"
          >
            <input
              type="text"
              maxlength="255"
              class="h-9 min-w-0 flex-1 rounded-tile border border-border bg-bg px-3 text-[13.5px]"
              [attr.aria-label]="'tasks.entity.quickAddLabel' | transloco"
              [placeholder]="'tasks.entity.quickAddPlaceholder' | transloco"
              [value]="quickTitle()"
              [disabled]="adding()"
              (input)="quickTitle.set($any($event.target).value)"
            />
            <app-button
              size="sm"
              type="submit"
              [disabled]="!quickTitle().trim()"
              [loading]="adding()"
            >
              {{ 'tasks.entity.add' | transloco }}
            </app-button>
            <app-button size="sm" variant="ghost" (click)="formOpen.set(true)">
              {{ 'tasks.entity.moreOptions' | transloco }}
            </app-button>
          </form>
        }

        @if (closedTasks().length) {
          <button
            type="button"
            class="self-start text-[12.5px] font-semibold text-accent hover:underline"
            [attr.aria-expanded]="showClosed()"
            (click)="showClosed.set(!showClosed())"
          >
            {{
              (showClosed() ? 'tasks.entity.hideClosed' : 'tasks.entity.showClosed')
                | transloco: { count: closedTasks().length }
            }}
          </button>
          @if (showClosed()) {
            <ul class="divide-y divide-border rounded-card border border-border bg-surface">
              @for (task of closedTasks(); track task.id) {
                <li class="flex items-center gap-3 px-3 py-2">
                  <app-icon
                    [name]="task.status === 'done' ? 'checkcircle' : 'x'"
                    [size]="15"
                    class="flex-none text-fg-subtle"
                  />
                  <a
                    [routerLink]="['/tasks', task.id]"
                    class="min-w-0 flex-1 truncate text-[13px] text-fg-muted line-through hover:underline"
                  >
                    {{ task.title }}
                  </a>
                  <app-badge [tone]="statusTone(task.status)">
                    {{ statusKey(task.status) | transloco }}
                  </app-badge>
                </li>
              }
            </ul>
          }
        }
      }
    </section>

    <app-slide-over
      [open]="formOpen()"
      [title]="'tasks.new.title' | transloco"
      [closeLabel]="'tasks.common.close' | transloco"
      [width]="560"
      (closed)="formOpen.set(false)"
    >
      @if (formOpen()) {
        <app-task-form
          [value]="formValue()"
          (saved)="onSaved($event)"
          (cancelled)="formOpen.set(false)"
        />
      }
    </app-slide-over>
  `,
})
export class EntityTasks {
  private readonly api = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  readonly canCreate = input(false);
  readonly defaultAssignee = input<AssigneeIn | null>(null);
  /** Shown in the full form as "Linked to …". */
  readonly entityLabel = input<string | null>(null);

  protected readonly statusKey = taskStatusKey;
  protected readonly statusTone = taskStatusTone;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly priorityTone = taskPriorityTone;

  protected readonly state = signal<'idle' | 'loading' | 'error' | 'ready'>('idle');
  private readonly tasks = signal<readonly Task[]>([]);
  protected readonly openTasks = computed(() =>
    this.tasks().filter((t) => !isClosedStatus(t.status)),
  );
  protected readonly closedTasks = computed(() =>
    this.tasks().filter((t) => isClosedStatus(t.status)),
  );
  protected readonly showClosed = signal(false);
  protected readonly quickTitle = signal('');
  protected readonly adding = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly formValue = computed<TaskFormValue>(() => ({
    entityType: this.entityType(),
    entityId: this.entityId(),
    entityLabel: this.entityLabel(),
    assignee: this.defaultAssignee(),
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const entityType = this.entityType();
      const entityId = this.entityId();
      untracked(() => this.load(orgId, entityType, entityId));
    });
  }

  protected quickAdd(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const title = this.quickTitle().trim();
    if (!orgId || !title || this.adding()) {
      return;
    }
    this.adding.set(true);
    this.api
      .create(orgId, {
        title,
        entity_type: this.entityType(),
        entity_id: this.entityId(),
        assignee: this.defaultAssignee(),
      })
      .subscribe({
        next: (task) => {
          this.adding.set(false);
          this.quickTitle.set('');
          this.tasks.update((tasks) => sortTasks([...tasks, task]));
        },
        error: (error: unknown) => {
          this.adding.set(false);
          this.notifications.error(taskErrorKey(error));
        },
      });
  }

  protected complete(task: Task): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.busyId.set(task.id);
    this.api.complete(orgId, task.id).subscribe({
      next: (done) => {
        this.busyId.set(null);
        this.replace(done);
        this.notifications.success('tasks.notices.completed');
        // A recurring task may have spawned its next occurrence.
        if (done.recurrence_id) {
          this.load(orgId, this.entityType(), this.entityId(), false);
        }
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notifications.error(taskErrorKey(error));
      },
    });
  }

  protected onSaved(result: TaskFormResult): void {
    this.formOpen.set(false);
    if (result.task) {
      this.replace(result.task);
    }
  }

  private replace(task: Task): void {
    this.tasks.update((tasks) => {
      const exists = tasks.some((t) => t.id === task.id);
      return sortTasks(exists ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task]);
    });
  }

  private load(orgId: string | null, entityType: string, entityId: string, spinner = true): void {
    this.request.unsubscribe();
    if (!orgId || !entityType || !entityId) {
      this.state.set('idle');
      return;
    }
    if (spinner) {
      this.state.set('loading');
    }
    this.request = this.api
      .list(orgId, { entity_type: entityType, entity_id: entityId, sort: 'due_at', limit: LIMIT })
      .subscribe({
        next: (page) => {
          this.tasks.set(sortTasks(page.items));
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }
}

/** Soonest due first, undated last, then by title. */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ad = a.due_at ?? '￿';
    const bd = b.due_at ?? '￿';
    return ad === bd ? a.title.localeCompare(b.title) : ad < bd ? -1 : 1;
  });
}

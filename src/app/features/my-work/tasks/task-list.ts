import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import {
  OPEN_TASK_STATUSES,
  Task,
  TaskListQuery,
  TaskSort,
  TaskStatus,
} from '../../../core/tasks/task.models';
import { TasksApi } from '../../../core/tasks/tasks-api';
import { AskPanelService } from '../../ask/ask-panel.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { AssigneeLabel } from '../../../shared/tasks/assignee-label';
import { TaskGuideIntro } from '../../../shared/tasks/guidance/task-guide-intro';
import { TaskLesson } from '../../../shared/tasks/guidance/task-lesson';
import { TaskTeachingEmpty } from '../../../shared/tasks/guidance/task-teaching-empty';
import { TaskWhyItMatters } from '../../../shared/tasks/guidance/task-why-it-matters';
import {
  taskPriorityKey,
  taskPriorityTone,
  taskStatusKey,
  taskStatusTone,
} from '../../../shared/tasks/task-display';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { provideTasksPageContext } from '../tasks-page-context';

const PAGE_SIZE = 25;

export type StatusFilter = 'open' | 'done' | 'cancelled' | 'all';
export const STATUS_FILTERS: readonly StatusFilter[] = ['open', 'done', 'cancelled', 'all'];
export type AssigneeScope = 'me' | 'all';
const SORTS: readonly TaskSort[] = ['due_at', '-due_at', 'priority', '-created_at'];

/** The statuses a status filter asks the API for. */
export function statusesFor(filter: StatusFilter): readonly TaskStatus[] {
  switch (filter) {
    case 'open':
      return OPEN_TASK_STATUSES;
    case 'done':
      return ['done'];
    case 'cancelled':
      return ['cancelled'];
    default:
      return [];
  }
}

/**
 * Every task the caller can see in the current org (assigned to them, created by
 * them, or all tasks with `tasks:manage`), with filters on assignee scope and
 * status, free-text search, sorting and paging. Links to each task and the record
 * it belongs to.
 */
@Component({
  selector: 'app-task-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    AssigneeLabel,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    TaskGuideIntro,
    TaskLesson,
    TaskTeachingEmpty,
    TaskWhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1120px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/my-work"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'tasks.common.backToMyWork' | transloco }}
      </a>
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'tasks.list.title' | transloco }}
          </h1>
          <p class="mt-1.5 text-[14px] text-fg-muted">{{ 'tasks.list.subtitle' | transloco }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-button variant="ghost" size="sm" (click)="prioritise()">
            <app-icon name="spark" [size]="14" />
            {{ 'tasks.ai.prioritise' | transloco }}
          </app-button>
          <a
            routerLink="/tasks/recurring"
            class="rounded-tile px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft"
          >
            {{ 'tasks.myWork.recurring' | transloco }}
          </a>
          @if (canWrite()) {
            <app-button size="sm" (click)="newTask()">
              <app-icon name="plus" [size]="14" />
              {{ 'tasks.myWork.newTask' | transloco }}
            </app-button>
          }
        </div>
      </header>

      <div class="mb-4 flex flex-col gap-3">
        <app-task-guide-intro page="list" />
        <div><app-task-lesson lesson="assigning-work" /></div>
      </div>

      <div class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <form
          class="flex flex-col gap-1 lg:col-span-1"
          role="search"
          (submit)="$event.preventDefault(); search(searchInput.value)"
        >
          <label for="task-search" class="text-[12px] font-semibold text-fg-muted">
            {{ 'tasks.filters.search' | transloco }}
          </label>
          <input
            #searchInput
            id="task-search"
            type="search"
            class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px]"
            [placeholder]="'tasks.filters.searchPlaceholder' | transloco"
            [value]="q()"
            (search)="search(searchInput.value)"
          />
        </form>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
          {{ 'tasks.filters.assignee' | transloco }}
          <select
            class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setScope($any($event.target).value)"
          >
            <option value="me" [selected]="scope() === 'me'">
              {{ 'tasks.filters.assignedToMe' | transloco }}
            </option>
            <option value="all" [selected]="scope() === 'all'">
              {{ 'tasks.filters.everything' | transloco }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
          {{ 'tasks.filters.status' | transloco }}
          <select
            class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setStatus($any($event.target).value)"
          >
            @for (s of statusFilters; track s) {
              <option [value]="s" [selected]="status() === s">
                {{ 'tasks.filters.statusOptions.' + s | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
          {{ 'tasks.filters.sort' | transloco }}
          <select
            class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setSort($any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'tasks.filters.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'tasks.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail">
              {{ 'tasks.common.loadFailed' | transloco }}
            </p>
          }
          @case ('ready') {
            @if (tasks().length === 0) {
              @if (isFiltered()) {
                <p class="py-10 text-center text-[14px] text-fg-muted">
                  {{ 'tasks.filters.noMatch' | transloco }}
                </p>
              } @else {
                <app-task-teaching-empty
                  page="list"
                  [showAction]="canWrite()"
                  (action)="newTask()"
                />
              }
            } @else {
              <ul class="divide-y divide-border">
                @for (task of tasks(); track task.id) {
                  <li
                    class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
                    [class.bg-fail-soft]="task.overdue"
                  >
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/tasks', task.id]"
                        class="block truncate text-[13.5px] font-semibold text-fg hover:underline"
                        [class.line-through]="task.status === 'cancelled'"
                      >
                        {{ task.title }}
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        @if (task.entity; as entity) {
                          <span class="inline-flex items-center gap-1">
                            <app-icon name="link" [size]="12" />
                            @if (entity.code) {
                              <span class="font-mono">{{ entity.code }}</span>
                            }
                            {{ entity.title }}
                          </span>
                        }
                        @if (task.recurrence_id) {
                          <span class="inline-flex items-center gap-1">
                            <app-icon name="history" [size]="12" />
                            {{ 'tasks.common.recurring' | transloco }}
                          </span>
                        }
                        @if (task.checklist_total > 0) {
                          <span>
                            {{
                              'tasks.checklist.progress'
                                | transloco
                                  : { done: task.checklist_done, total: task.checklist_total }
                            }}
                          </span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-assignee-label [assignee]="task.assignee" />
                      <app-badge [tone]="priorityTone(task.priority)">{{
                        priorityKey(task.priority) | transloco
                      }}</app-badge>
                      <app-badge [tone]="statusTone(task.status)">{{
                        statusKey(task.status) | transloco
                      }}</app-badge>
                      <span
                        class="inline-flex w-[100px] items-center justify-end gap-1"
                        [class.text-fail]="task.overdue"
                        [class.font-semibold]="task.overdue"
                      >
                        @if (task.overdue) {
                          <app-icon name="alert" [size]="13" />
                          <span class="sr-only">{{ 'tasks.common.overdue' | transloco }}</span>
                        }
                        @if (task.due_at) {
                          {{ task.due_at | localDay }}
                        } @else {
                          {{ 'tasks.common.noDueDate' | transloco }}
                        }
                      </span>
                    </span>
                  </li>
                }
              </ul>
              <div class="border-t border-border px-4 py-2.5">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="tasks().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <div class="mt-6">
        <app-task-why-it-matters page="list" />
      </div>
    </div>
  `,
})
export class TaskList {
  private readonly api = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly sorts = SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = taskStatusKey;
  protected readonly statusTone = taskStatusTone;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly priorityTone = taskPriorityTone;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('tasks:write'),
  );

  protected readonly q = signal('');
  protected readonly scope = signal<AssigneeScope>('me');
  protected readonly status = signal<StatusFilter>('open');
  protected readonly sort = signal<TaskSort>('due_at');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly tasks = signal<readonly Task[]>([]);
  protected readonly total = signal(0);
  protected readonly isFiltered = computed(() => !!this.q() || this.status() !== 'open');

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    provideTasksPageContext(() => ({
      module: 'tasks',
      entityType: 'task',
      view: 'list',
      title: this.language.translate('tasks.list.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: TaskListQuery = {
        q: this.q() || undefined,
        assignee: this.scope() === 'me' ? 'me' : undefined,
        status: statusesFor(this.status()),
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected search(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setScope(value: AssigneeScope): void {
    this.offset.set(0);
    this.scope.set(value);
  }

  protected setStatus(value: StatusFilter): void {
    this.offset.set(0);
    this.status.set(value);
  }

  protected setSort(value: TaskSort): void {
    this.offset.set(0);
    this.sort.set(value);
  }

  protected newTask(): void {
    void this.router.navigate(['/tasks/new']);
  }

  protected prioritise(): void {
    this.ask.showWith(this.language.translate('tasks.ai.prompts.prioritise'));
  }

  private load(orgId: string | null, query: TaskListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, query).subscribe({
      next: (page) => {
        this.tasks.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

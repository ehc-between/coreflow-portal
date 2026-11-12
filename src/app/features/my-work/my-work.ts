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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DocumentsApi } from '../../core/documents/documents-api';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { taskErrorKey } from '../../core/tasks/task-errors';
import {
  EditableTaskStatus,
  KNOWN_WORK_SOURCES,
  TASK_PRIORITIES,
  WorkItem,
} from '../../core/tasks/task.models';
import { TasksApi } from '../../core/tasks/tasks-api';
import { AskPanelService } from '../ask/ask-panel.service';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { TaskGuideIntro } from '../../shared/tasks/guidance/task-guide-intro';
import { TaskLesson } from '../../shared/tasks/guidance/task-lesson';
import { TaskTeachingEmpty } from '../../shared/tasks/guidance/task-teaching-empty';
import { TaskWhyItMatters } from '../../shared/tasks/guidance/task-why-it-matters';
import {
  taskPriorityKey,
  taskPriorityTone,
  taskStatusKey,
  taskStatusTone,
  todayDay,
} from '../../shared/tasks/task-display';
import { TaskForm, TaskFormResult } from '../../shared/tasks/task-form';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import {
  BOARD_COLUMNS,
  BoardColumn,
  boardColumn,
  DUE_FILTERS,
  DueFilter,
  MY_WORK_VIEWS,
  MyWorkView,
  NO_FILTERS,
  WorkFilters,
  filterWorkItems,
  gridRange,
  groupByColumn,
  itemsByDay,
  monthGrid,
  parseView,
  shiftMonth,
  sourceIcon,
  sourceLabelKey,
  summarise,
} from './my-work-data';
import { provideTasksPageContext } from './tasks-page-context';

type LoadState = 'loading' | 'error' | 'ready';

/** Items shown per calendar cell before "+N more". */
const CELL_LIMIT = 3;

const WEEKDAY_KEYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/**
 * My Work: everything waiting on the signed-in user in the current org (tasks,
 * CAPA actions, owned deviations, documents to approve or acknowledge, and module
 * sources), from `GET /my-work`. Three views (list, board by status, month
 * calendar) with filters on source, due date and priority; overdue items are
 * highlighted. Tasks can be completed or moved between columns in place.
 */
@Component({
  selector: 'app-my-work',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Icon,
    SlideOver,
    TaskForm,
    TaskGuideIntro,
    TaskLesson,
    TaskTeachingEmpty,
    TaskWhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1120px] px-4 pt-7 pb-12 sm:px-8">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'tasks.myWork.title' | transloco }}
          </h1>
          <p class="mt-1.5 text-[14px] text-fg-muted">{{ 'tasks.myWork.subtitle' | transloco }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-button variant="ghost" size="sm" (click)="planWeek()">
            <app-icon name="spark" [size]="14" />
            {{ 'tasks.ai.planWeek' | transloco }}
          </app-button>
          @if (canRead()) {
            <a
              routerLink="/tasks"
              class="rounded-tile px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft"
            >
              {{ 'tasks.myWork.allTasks' | transloco }}
            </a>
            <a
              routerLink="/tasks/recurring"
              class="rounded-tile px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft"
            >
              {{ 'tasks.myWork.recurring' | transloco }}
            </a>
          }
          @if (canWrite()) {
            <app-button size="sm" data-tour="tasks-new" (click)="formOpen.set(true)">
              <app-icon name="plus" [size]="14" />
              {{ 'tasks.myWork.newTask' | transloco }}
            </app-button>
          }
        </div>
      </header>

      <div class="mb-4 flex flex-col gap-3">
        <app-task-guide-intro page="myWork" />
        <div class="flex flex-wrap items-center gap-2">
          <app-task-lesson lesson="working-with-tasks" />
        </div>
      </div>

      @if (pendingProposals() > 0) {
        <a
          routerLink="/review"
          class="mb-4 flex items-center gap-2 rounded-card border border-warn/40 bg-warn-soft px-4 py-2.5 text-[13.5px] font-semibold text-fg hover:underline"
        >
          <app-icon name="spark" [size]="15" class="text-warn" />
          {{ 'tasks.myWork.proposals' | transloco: { count: pendingProposals() } }}
        </a>
      }

      <!-- View switch + filters -->
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div
          class="inline-flex self-start rounded-tile border border-border bg-surface p-0.5"
          data-tour="tasks-view-switch"
          role="group"
          [attr.aria-label]="'tasks.myWork.viewLabel' | transloco"
        >
          @for (v of views; track v) {
            <button
              type="button"
              class="rounded-[8px] px-3 py-1.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-accent"
              [class.bg-accent-soft]="view() === v"
              [class.text-accent]="view() === v"
              [class.text-fg-muted]="view() !== v"
              [attr.aria-pressed]="view() === v"
              (click)="setView(v)"
            >
              {{ 'tasks.myWork.views.' + v | transloco }}
            </button>
          }
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3" data-tour="tasks-filters">
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'tasks.filters.source' | transloco }}
            <select
              class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
              (change)="setFilter('source', $any($event.target).value)"
            >
              <option value="all" [selected]="filters().source === 'all'">
                {{ 'tasks.filters.allSources' | transloco }}
              </option>
              @for (s of sources(); track s) {
                <option [value]="s" [selected]="filters().source === s">
                  {{ sourceLabelKey(s) | transloco }}
                </option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'tasks.filters.due' | transloco }}
            <select
              class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
              (change)="setFilter('due', $any($event.target).value)"
            >
              @for (d of dueFilters; track d) {
                <option [value]="d" [selected]="filters().due === d">
                  {{ 'tasks.filters.dueOptions.' + d | transloco }}
                </option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'tasks.filters.priority' | transloco }}
            <select
              class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
              (change)="setFilter('priority', $any($event.target).value)"
            >
              <option value="all" [selected]="filters().priority === 'all'">
                {{ 'tasks.filters.allPriorities' | transloco }}
              </option>
              @for (p of priorities; track p) {
                <option [value]="p" [selected]="filters().priority === p">
                  {{ 'tasks.priority.' + p | transloco }}
                </option>
              }
            </select>
          </label>
        </div>
      </div>

      @if (state() === 'ready' && view() !== 'calendar') {
        <p
          class="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted"
          aria-live="polite"
        >
          {{ 'tasks.myWork.summary' | transloco: { count: summary().total } }}
          @if (summary().overdue > 0) {
            <app-badge tone="fail">
              {{ 'tasks.myWork.overdueCount' | transloco: { count: summary().overdue } }}
            </app-badge>
          }
          @if (summary().dueToday > 0) {
            <app-badge tone="warn">
              {{ 'tasks.myWork.dueTodayCount' | transloco: { count: summary().dueToday } }}
            </app-badge>
          }
        </p>
      }

      @switch (state()) {
        @case ('loading') {
          <app-card>
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'tasks.common.loading' | transloco }}
            </p>
          </app-card>
        }
        @case ('error') {
          <app-card>
            <div class="flex flex-col items-center gap-3 py-10 text-center">
              <p class="text-[14px] text-fail">{{ 'tasks.common.loadFailed' | transloco }}</p>
              <app-button variant="secondary" size="sm" (click)="reload()">
                {{ 'tasks.common.retry' | transloco }}
              </app-button>
            </div>
          </app-card>
        }
        @case ('ready') {
          @switch (view()) {
            @case ('list') {
              <app-card [padded]="false">
                @if (visible().length === 0) {
                  @if (items().length === 0) {
                    <app-task-teaching-empty
                      page="myWork"
                      [showAction]="canWrite()"
                      (action)="formOpen.set(true)"
                    />
                  } @else {
                    <p class="py-10 text-center text-[14px] text-fg-muted">
                      {{ 'tasks.filters.noMatch' | transloco }}
                    </p>
                  }
                } @else {
                  <ul class="divide-y divide-border">
                    @for (item of visible(); track item.source + item.id) {
                      <li
                        class="flex items-center gap-3 px-4 py-3"
                        [class.bg-fail-soft]="item.overdue"
                      >
                        @if (item.source === 'task') {
                          <input
                            type="checkbox"
                            class="h-4 w-4 flex-none"
                            [checked]="busyId() === item.id"
                            [disabled]="busyId() === item.id"
                            [attr.aria-label]="
                              'tasks.entity.complete' | transloco: { title: item.title }
                            "
                            (change)="complete(item)"
                          />
                        } @else {
                          <span
                            class="flex h-7 w-7 flex-none items-center justify-center rounded-tile bg-accent-soft text-accent"
                            aria-hidden="true"
                          >
                            <app-icon [name]="sourceIcon(item.source)" [size]="14" />
                          </span>
                        }
                        <span class="min-w-0 flex-1">
                          @if (item.url) {
                            <a
                              [routerLink]="item.url"
                              class="block truncate text-[13.5px] font-semibold text-fg hover:underline"
                            >
                              {{ item.title }}
                            </a>
                          } @else {
                            <span class="block truncate text-[13.5px] font-semibold text-fg">
                              {{ item.title }}
                            </span>
                          }
                          <span class="flex items-center gap-2 text-[12px] text-fg-subtle">
                            <span>{{ sourceLabelKey(item.source) | transloco }}</span>
                            @if (item.code) {
                              <span class="font-mono">{{ item.code }}</span>
                            }
                          </span>
                        </span>
                        @if (item.priority === 'high' || item.priority === 'urgent') {
                          <span class="hidden sm:inline-flex">
                            <app-badge [tone]="priorityTone(item.priority)">
                              {{ priorityKey(item.priority) | transloco }}
                            </app-badge>
                          </span>
                        }
                        @if (item.source === 'task' && item.status && item.status !== 'open') {
                          <span class="hidden sm:inline-flex">
                            <app-badge [tone]="statusTone(item.status)">
                              {{ statusKey(item.status) | transloco }}
                            </app-badge>
                          </span>
                        }
                        <span
                          class="flex w-[104px] flex-none items-center justify-end gap-1 text-[12.5px]"
                          [class.font-semibold]="item.overdue"
                          [class.text-fail]="item.overdue"
                          [class.text-fg-muted]="!item.overdue"
                        >
                          @if (item.overdue) {
                            <app-icon name="alert" [size]="13" />
                            <span class="sr-only">{{ 'tasks.common.overdue' | transloco }}</span>
                          }
                          @if (item.due_at) {
                            {{ item.due_at | localDay }}
                          } @else {
                            {{ 'tasks.common.noDueDate' | transloco }}
                          }
                        </span>
                      </li>
                    }
                  </ul>
                }
              </app-card>
            }
            @case ('board') {
              <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                @for (col of boardColumns; track col) {
                  <section
                    class="flex min-h-[160px] flex-col rounded-card border border-border bg-surface-2 p-3"
                    [attr.aria-label]="'tasks.status.' + col | transloco"
                  >
                    <h2 class="mb-2 flex items-center gap-2 text-[13.5px] font-bold text-fg">
                      {{ 'tasks.board.columns.' + col | transloco }}
                      <app-badge tone="neutral">{{ board()[col].length }}</app-badge>
                    </h2>
                    <ul class="flex flex-col gap-2">
                      @for (item of board()[col]; track item.source + item.id) {
                        <li
                          class="rounded-tile border bg-surface p-3"
                          [class.border-fail]="item.overdue"
                          [class.border-border]="!item.overdue"
                        >
                          <div class="mb-1 flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
                            <app-icon [name]="sourceIcon(item.source)" [size]="12" />
                            {{ sourceLabelKey(item.source) | transloco }}
                            @if (item.code) {
                              <span class="font-mono">{{ item.code }}</span>
                            }
                          </div>
                          @if (item.url) {
                            <a
                              [routerLink]="item.url"
                              class="block text-[13.5px] font-semibold text-fg hover:underline"
                            >
                              {{ item.title }}
                            </a>
                          } @else {
                            <span class="block text-[13.5px] font-semibold text-fg">{{
                              item.title
                            }}</span>
                          }
                          <div class="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              class="text-[12px]"
                              [class.text-fail]="item.overdue"
                              [class.font-semibold]="item.overdue"
                              [class.text-fg-muted]="!item.overdue"
                            >
                              @if (item.due_at) {
                                {{ item.due_at | localDay }}
                              } @else {
                                {{ 'tasks.common.noDueDate' | transloco }}
                              }
                            </span>
                            @if (item.priority === 'high' || item.priority === 'urgent') {
                              <app-badge [tone]="priorityTone(item.priority)">
                                {{ priorityKey(item.priority) | transloco }}
                              </app-badge>
                            }
                            @if (item.source === 'task') {
                              <label class="ml-auto">
                                <span class="sr-only">
                                  {{ 'tasks.board.moveLabel' | transloco: { title: item.title } }}
                                </span>
                                <select
                                  class="h-7 rounded-[7px] border border-border bg-bg px-1.5 text-[12px]"
                                  [disabled]="busyId() === item.id"
                                  (change)="move(item, $any($event.target))"
                                >
                                  @for (target of boardColumns; track target) {
                                    <option [value]="target" [selected]="target === col">
                                      {{ 'tasks.board.columns.' + target | transloco }}
                                    </option>
                                  }
                                  <option value="done">
                                    {{ 'tasks.board.markDone' | transloco }}
                                  </option>
                                </select>
                              </label>
                            }
                          </div>
                        </li>
                      } @empty {
                        <li class="py-4 text-center text-[12.5px] text-fg-subtle">
                          {{ 'tasks.board.empty' | transloco }}
                        </li>
                      }
                    </ul>
                  </section>
                }
              </div>
            }
            @case ('calendar') {
              <app-card [padded]="false">
                <div
                  class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"
                >
                  <h2 class="font-display text-[16px] font-bold text-fg" aria-live="polite">
                    {{ monthTitle() }}
                  </h2>
                  <div class="flex items-center gap-1">
                    <app-button variant="ghost" size="sm" (click)="moveMonth(-1)">
                      <span aria-hidden="true">‹</span>
                      <span class="sr-only">{{ 'tasks.calendar.prev' | transloco }}</span>
                    </app-button>
                    <app-button variant="secondary" size="sm" (click)="goToday()">
                      {{ 'tasks.calendar.today' | transloco }}
                    </app-button>
                    <app-button variant="ghost" size="sm" (click)="moveMonth(1)">
                      <span aria-hidden="true">›</span>
                      <span class="sr-only">{{ 'tasks.calendar.next' | transloco }}</span>
                    </app-button>
                  </div>
                </div>

                <!-- Month grid (tablet and up) -->
                <div class="hidden sm:block" role="table" [attr.aria-label]="monthTitle()">
                  <div class="grid grid-cols-7 border-b border-border" role="row">
                    @for (d of weekdayKeys; track d) {
                      <div
                        class="px-2 py-1.5 text-center text-[11.5px] font-semibold text-fg-subtle uppercase"
                        role="columnheader"
                      >
                        {{ 'tasks.rrule.weekdaysShort.' + d | transloco }}
                      </div>
                    }
                  </div>
                  @for (week of grid(); track week[0].day) {
                    <div class="grid grid-cols-7 border-b border-border last:border-b-0" role="row">
                      @for (cell of week; track cell.day) {
                        <div
                          class="min-h-[96px] border-r border-border p-1.5 last:border-r-0"
                          [class.bg-surface-2]="!cell.inMonth"
                          role="cell"
                        >
                          <div
                            class="mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px]"
                            [class.bg-accent]="cell.isToday"
                            [class.text-white]="cell.isToday"
                            [class.font-bold]="cell.isToday"
                            [class.text-fg-subtle]="!cell.isToday && !cell.inMonth"
                            [class.text-fg]="!cell.isToday && cell.inMonth"
                          >
                            {{ cell.dayOfMonth }}
                          </div>
                          @for (
                            item of (dayItems().get(cell.day) ?? []).slice(0, cellLimit);
                            track item.source + item.id
                          ) {
                            @if (item.url) {
                              <a
                                [routerLink]="item.url"
                                class="mb-0.5 block truncate rounded-[6px] px-1.5 py-0.5 text-[11.5px] font-semibold hover:underline"
                                [class.bg-fail-soft]="item.overdue"
                                [class.text-fail]="item.overdue"
                                [class.bg-accent-soft]="!item.overdue"
                                [class.text-accent]="!item.overdue"
                                [title]="item.title"
                              >
                                {{ item.title }}
                              </a>
                            } @else {
                              <span
                                class="mb-0.5 block truncate rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[11.5px]"
                              >
                                {{ item.title }}
                              </span>
                            }
                          }
                          @if ((dayItems().get(cell.day)?.length ?? 0) > cellLimit) {
                            <button
                              type="button"
                              class="px-1.5 text-[11.5px] font-semibold text-fg-muted hover:underline"
                              (click)="selectedDay.set(cell.day)"
                            >
                              {{
                                'tasks.calendar.more'
                                  | transloco
                                    : { count: (dayItems().get(cell.day)?.length ?? 0) - cellLimit }
                              }}
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Agenda (phones) -->
                <ul class="divide-y divide-border sm:hidden">
                  @for (entry of agenda(); track entry.day) {
                    <li class="px-4 py-3">
                      <div class="mb-1 text-[12.5px] font-semibold text-fg-muted">
                        {{ entry.day | localDay: 'EEEE d MMM' }}
                      </div>
                      @for (item of entry.items; track item.source + item.id) {
                        @if (item.url) {
                          <a
                            [routerLink]="item.url"
                            class="block py-0.5 text-[13.5px] hover:underline"
                            [class.text-fail]="item.overdue"
                            [class.text-fg]="!item.overdue"
                          >
                            {{ item.title }}
                          </a>
                        } @else {
                          <span class="block py-0.5 text-[13.5px] text-fg">{{ item.title }}</span>
                        }
                      }
                    </li>
                  } @empty {
                    <li class="px-4 py-8 text-center text-[13.5px] text-fg-muted">
                      {{ 'tasks.calendar.empty' | transloco }}
                    </li>
                  }
                </ul>

                @if (selectedDay(); as day) {
                  <div class="border-t border-border px-4 py-3" aria-live="polite">
                    <div class="mb-1 flex items-center justify-between">
                      <h3 class="text-[13.5px] font-bold text-fg">
                        {{ day | localDay: 'fullDate' }}
                      </h3>
                      <button
                        type="button"
                        class="rounded-[8px] p-1 text-fg-subtle hover:bg-surface-2"
                        [attr.aria-label]="'tasks.common.close' | transloco"
                        (click)="selectedDay.set(null)"
                      >
                        <app-icon name="x" [size]="14" />
                      </button>
                    </div>
                    @for (item of dayItems().get(day) ?? []; track item.source + item.id) {
                      @if (item.url) {
                        <a
                          [routerLink]="item.url"
                          class="block py-0.5 text-[13px] text-fg hover:underline"
                        >
                          {{ item.title }}
                        </a>
                      } @else {
                        <span class="block py-0.5 text-[13px] text-fg">{{ item.title }}</span>
                      }
                    }
                  </div>
                }
              </app-card>
            }
          }
        }
      }

      <div class="mt-6">
        <app-task-why-it-matters page="myWork" />
      </div>
    </div>

    <app-slide-over
      [open]="formOpen()"
      [title]="'tasks.new.title' | transloco"
      [closeLabel]="'tasks.common.close' | transloco"
      [width]="560"
      (closed)="formOpen.set(false)"
    >
      @if (formOpen()) {
        <app-task-form
          [value]="{ assignee: myAssignee() }"
          (saved)="onCreated($event)"
          (cancelled)="formOpen.set(false)"
        />
      }
    </app-slide-over>
  `,
})
export class MyWork {
  private readonly api = inject(TasksApi);
  private readonly auth = inject(AuthService);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly views = MY_WORK_VIEWS;
  protected readonly dueFilters = DUE_FILTERS;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly boardColumns = BOARD_COLUMNS;
  protected readonly weekdayKeys = WEEKDAY_KEYS;
  protected readonly cellLimit = CELL_LIMIT;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly sourceIcon = sourceIcon;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly priorityTone = taskPriorityTone;
  protected readonly statusKey = taskStatusKey;
  protected readonly statusTone = taskStatusTone;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canRead = computed(() => this.permissions().includes('tasks:read'));
  protected readonly canWrite = computed(() => this.permissions().includes('tasks:write'));
  private readonly canApprove = computed(() => this.permissions().includes('documents:approve'));

  protected readonly view = toSignal(
    this.route.queryParamMap.pipe(map((params) => parseView(params.get('view')))),
    { initialValue: 'list' as MyWorkView },
  );

  protected readonly today = todayDay();
  private readonly month = signal(initialMonth(this.today));
  protected readonly grid = computed(() =>
    monthGrid(this.month().year, this.month().month, this.today),
  );
  protected readonly monthTitle = computed(() => {
    const { year, month } = this.month();
    return new Intl.DateTimeFormat(this.language.active(), {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month - 1, 1));
  });
  protected readonly selectedDay = signal<string | null>(null);

  protected readonly state = signal<LoadState>('loading');
  protected readonly items = signal<readonly WorkItem[]>([]);
  protected readonly filters = signal<WorkFilters>(NO_FILTERS);
  protected readonly busyId = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly pendingProposals = signal(0);

  protected readonly visible = computed(() =>
    filterWorkItems(this.items(), this.filters(), this.today),
  );
  protected readonly summary = computed(() => summarise(this.visible(), this.today));
  protected readonly board = computed(() => groupByColumn(this.visible()));
  protected readonly dayItems = computed(() => itemsByDay(this.visible()));
  protected readonly agenda = computed(() =>
    [...this.dayItems().entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, items]) => ({ day, items })),
  );
  /** Known sources plus any module source present in the feed. */
  protected readonly sources = computed(() => {
    const extra = this.items()
      .map((i) => i.source)
      .filter((s) => !(KNOWN_WORK_SOURCES as readonly string[]).includes(s));
    return [...KNOWN_WORK_SOURCES, ...new Set(extra)];
  });
  protected readonly myAssignee = computed(() => {
    // New tasks created from My Work are assigned to the creator by default.
    const id = this.auth.user()?.id;
    return id ? { type: 'user' as const, value: id } : null;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());

    provideTasksPageContext(() => ({
      module: 'tasks',
      view: this.view(),
      title: this.language.translate('tasks.myWork.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const calendar = this.view() === 'calendar';
      const range = calendar ? gridRange(this.grid()) : null;
      untracked(() => this.load(orgId, range));
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const canApprove = this.canApprove();
      untracked(() => this.loadProposals(orgId, canApprove));
    });
  }

  protected setView(view: MyWorkView): void {
    this.selectedDay.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'list' ? null : view },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setFilter(key: keyof WorkFilters, value: string): void {
    this.filters.update((f) => ({ ...f, [key]: key === 'due' ? (value as DueFilter) : value }));
  }

  protected moveMonth(delta: number): void {
    this.selectedDay.set(null);
    this.month.update((m) => shiftMonth(m, delta));
  }

  protected goToday(): void {
    this.selectedDay.set(null);
    this.month.set(initialMonth(this.today));
  }

  protected reload(): void {
    const range = this.view() === 'calendar' ? gridRange(this.grid()) : null;
    this.load(this.selectedOrg.currentOrgId(), range);
  }

  protected complete(item: WorkItem): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.busyId.set(item.id);
    this.api.complete(orgId, item.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notifications.success('tasks.notices.completed');
        this.reload();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notifications.error(taskErrorKey(error));
      },
    });
  }

  protected move(item: WorkItem, select: HTMLSelectElement): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = select.value as BoardColumn | 'done';
    // The select shows the current column until the server confirms the move.
    select.value = boardColumn(item);
    if (!orgId) {
      return;
    }
    if (target === 'done') {
      this.complete(item);
      return;
    }
    this.busyId.set(item.id);
    this.api.update(orgId, item.id, { status: target as EditableTaskStatus }).subscribe({
      next: (task) => {
        this.busyId.set(null);
        this.items.update((items) =>
          items.map((i) =>
            i.source === 'task' && i.id === task.id ? { ...i, status: task.status } : i,
          ),
        );
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notifications.error(taskErrorKey(error));
      },
    });
  }

  protected onCreated(result: TaskFormResult): void {
    this.formOpen.set(false);
    if (result.task) {
      this.notifications.success('tasks.notices.created');
      this.reload();
    }
  }

  protected planWeek(): void {
    this.ask.showWith(this.language.translate('tasks.ai.prompts.planWeek'));
  }

  private load(orgId: string | null, range: { from: string; to: string } | null): void {
    this.request.unsubscribe();
    if (!orgId) {
      this.items.set([]);
      this.state.set('ready');
      return;
    }
    this.state.set('loading');
    this.request = this.api.myWork(orgId, range ?? {}).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private loadProposals(orgId: string | null, canApprove: boolean): void {
    this.pendingProposals.set(0);
    if (!orgId || !canApprove) {
      return;
    }
    this.documentsApi.listProposals(orgId).subscribe({
      next: (proposals) => this.pendingProposals.set(proposals.length),
      error: () => this.pendingProposals.set(0),
    });
  }
}

function initialMonth(today: string): { year: number; month: number } {
  const [year, month] = today.split('-').map(Number);
  return { year, month };
}

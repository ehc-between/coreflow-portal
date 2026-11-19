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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { taskErrorKey } from '../../core/tasks/task-errors';
import { EditableTaskStatus, WorkItem, WorkScope } from '../../core/tasks/task.models';
import { ModuleService } from '../../core/modules/module.service';
import { TasksApi } from '../../core/tasks/tasks-api';
import { AskPanelService } from '../ask/ask-panel.service';
import { LocalizedTitlePipe } from '../../shared/i18n/localized-title.pipe';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { TaskTeachingEmpty } from '../../shared/tasks/guidance/task-teaching-empty';
import { TaskWhyItMatters } from '../../shared/tasks/guidance/task-why-it-matters';
import { taskPriorityKey, taskStatusKey, todayDay } from '../../shared/tasks/task-display';
import { TaskForm, TaskFormResult } from '../../shared/tasks/task-form';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  BOARD_COLUMNS,
  BoardColumn,
  MyWorkView,
  NO_FILTERS,
  RECURRING_FILTER,
  SWITCH_VIEWS,
  WORK_SCOPES,
  WORK_TABS,
  WorkFilters,
  WorkTab,
  boardColumn,
  countTabs,
  defaultTab,
  filterWorkItems,
  gridRange,
  groupByColumn,
  groupOf,
  inTab,
  itemsByDay,
  monthGrid,
  parseScope,
  parseTab,
  parseView,
  shiftMonth,
  sourceIcon,
  sourceLabelKey,
  whyOf,
} from './my-work-data';
import { provideTasksPageContext } from './tasks-page-context';

type LoadState = 'loading' | 'error' | 'ready';

/** Items shown per calendar cell before "+N more". */
const CELL_LIMIT = 3;

const WEEKDAY_KEYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/**
 * Mitt arbeid: everything waiting on the signed-in user in the current org, from
 * `GET /my-work`, the one inbox (U08). Tabs say *when* (Overdue, This week, Later),
 * *what* (Til gjennomgang: every approval, the old "Needs your review" page; Les og
 * bekreft; Min opplæring) or show the month (Kalender). Mine / Alle (`?scope=all`)
 * widens tasks, deviations and reviews to everything the caller may see. Every row
 * says what the item is, why it is on the list and which module it belongs to, and
 * has filters for module and type (recurring tasks are a type). List and board views
 * follow the tab. Tasks can be completed or moved between board columns in place.
 */
@Component({
  selector: 'app-my-work',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalizedTitlePipe,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PageHeader,
    SlideOver,
    StatusBadge,
    TaskForm,
    TaskTeachingEmpty,
    TaskWhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1120px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="nav.myWork"
        descriptionKey="tasks.myWork.subtitle"
        [breadcrumbs]="[{ labelKey: 'nav.myWork' }]"
      >
        <app-button secondary variant="secondary" (click)="planWeek()">
          <app-icon name="spark" [size]="14" />
          {{ 'tasks.ai.planWeek' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button primary data-tour="tasks-new" (click)="formOpen.set(true)">
            <app-icon name="plus" [size]="14" />
            {{ 'tasks.myWork.newTask' | transloco }}
          </app-button>
        }
        @if (canRead()) {
          <ng-container ngProjectAs="[overflow]">
            <a appMenuItem routerLink="/tasks">
              <app-icon name="checkcircle" [size]="15" />
              {{ 'tasks.myWork.allTasks' | transloco }}
            </a>
            <a appMenuItem routerLink="/tasks/recurring">
              <app-icon name="history" [size]="15" />
              {{ 'tasks.myWork.manageRecurring' | transloco }}
            </a>
          </ng-container>
        }
      </app-page-header>

      <app-help-strip
        class="mb-5"
        scope="tasks"
        page="myWork"
        tour="myWork"
        lesson="working-with-tasks"
      />

      <!-- Tabs: when (overdue, this week, later), what (review, read and confirm, training)
           and the calendar (U08: one inbox) -->
      <div class="relative mb-4" data-tour="tasks-tabs">
        <div
          role="tablist"
          [attr.aria-label]="'tasks.myWork.tabsLabel' | transloco"
          class="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          @for (t of tabs; track t) {
            <button
              type="button"
              role="tab"
              [id]="'work-tab-' + t"
              [attr.aria-selected]="tab() === t"
              [attr.aria-controls]="'work-panel'"
              [attr.tabindex]="tab() === t ? 0 : -1"
              [attr.data-testid]="'work-tab-' + t"
              class="-mb-px flex min-h-10 flex-none items-center gap-1.5 border-b-2 px-3 py-2 text-ui font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              [class.border-accent]="tab() === t"
              [class.text-fg]="tab() === t"
              [class.border-transparent]="tab() !== t"
              [class.text-fg-muted]="tab() !== t"
              (click)="setTab(t)"
              (keydown)="onTabKey($event)"
            >
              {{ 'tasks.myWork.tabs.' + t | transloco }}
              @if (t !== 'calendar') {
                <span
                  class="rounded-full px-1.5 py-px text-micro font-semibold"
                  [attr.data-testid]="'work-count-' + t"
                  [class]="
                    t === 'overdue' && counts().overdue > 0
                      ? 'bg-warn-soft text-warn-ink'
                      : 'bg-surface-2 text-fg-muted'
                  "
                  >{{ tabCount(t) }}</span
                >
              }
            </button>
          }
        </div>
      </div>

      <!-- View switch + filters -->
      <div
        class="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between"
      >
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2" data-tour="tasks-filters">
          <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
            {{ 'tasks.filters.module' | transloco }}
            <select
              data-testid="work-filter-module"
              class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
              (change)="setFilter('module', $any($event.target).value)"
            >
              <option value="all" [selected]="filters().module === 'all'">
                {{ 'tasks.filters.allModules' | transloco }}
              </option>
              @for (m of moduleOptions(); track m) {
                <option [value]="m" [selected]="filters().module === m">
                  {{ 'modules.names.' + m | transloco }}
                </option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
            {{ 'tasks.filters.type' | transloco }}
            <select
              data-testid="work-filter-type"
              class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
              (change)="setFilter('source', $any($event.target).value)"
            >
              <option value="all" [selected]="filters().source === 'all'">
                {{ 'tasks.filters.allTypes' | transloco }}
              </option>
              @for (s of sourceOptions(); track s) {
                <option [value]="s" [selected]="filters().source === s">
                  {{ sourceLabelKey(s) | transloco }}
                </option>
              }
              @if (hasRecurring() || filters().source === recurringFilter) {
                <option [value]="recurringFilter" [selected]="filters().source === recurringFilter">
                  {{ 'tasks.myWork.recurringFilter' | transloco }}
                </option>
              }
            </select>
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-2 self-start sm:self-end">
          <!-- Mine / All (U08) -->
          <div
            class="inline-flex rounded-tile border border-border bg-surface p-0.5"
            role="group"
            data-testid="work-scope"
            [attr.aria-label]="'tasks.myWork.scopeLabel' | transloco"
          >
            @for (s of scopes; track s) {
              <button
                type="button"
                class="rounded-tile px-3 py-1.5 text-ui font-semibold focus-visible:outline-2 focus-visible:outline-accent"
                [attr.data-testid]="'work-scope-' + s"
                [class.bg-accent-soft]="scope() === s"
                [class.text-accent]="scope() === s"
                [class.text-fg-muted]="scope() !== s"
                [attr.aria-pressed]="scope() === s"
                (click)="setScope(s)"
              >
                {{ 'tasks.myWork.scopes.' + s | transloco }}
              </button>
            }
          </div>
          @if (!calendar()) {
            <div
              class="inline-flex rounded-tile border border-border bg-surface p-0.5"
              data-tour="tasks-view-switch"
              role="group"
              [attr.aria-label]="'tasks.myWork.viewLabel' | transloco"
            >
              @for (v of views; track v) {
                <button
                  type="button"
                  class="rounded-tile px-3 py-1.5 text-ui font-semibold focus-visible:outline-2 focus-visible:outline-accent"
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
          }
        </div>
      </div>

      <div id="work-panel" role="tabpanel" [attr.aria-labelledby]="'work-tab-' + tab()">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @case ('ready') {
            @switch (shownView()) {
              @case ('list') {
                @if (items().length === 0) {
                  <app-card [padded]="false">
                    <app-task-teaching-empty
                      page="myWork"
                      [showAction]="canWrite()"
                      (action)="formOpen.set(true)"
                    />
                  </app-card>
                } @else if (filtered().length === 0) {
                  <app-empty-state
                    titleKey="ui.empty.noResults"
                    bodyKey="ui.empty.noResultsBody"
                    ctaKey="ui.empty.clearFilters"
                    ctaVariant="secondary"
                    (cta)="clearFilters()"
                  />
                } @else if (visible().length === 0) {
                  <app-empty-state
                    [icon]="tab() === 'overdue' ? 'checkcircle' : 'inbox'"
                    [titleKey]="'tasks.myWork.empty.' + tab() + '.title'"
                    [bodyKey]="'tasks.myWork.empty.' + tab() + '.body'"
                    [compact]="true"
                  />
                } @else {
                  <app-card [padded]="false">
                    <ul class="divide-y divide-border" data-testid="work-list">
                      @for (row of rows(); track row.item.source + row.item.id) {
                        <li class="flex items-start gap-3 px-4 py-3" data-testid="work-row">
                          @if (row.item.source === 'task') {
                            <input
                              type="checkbox"
                              class="mt-1 h-4 w-4 flex-none"
                              [checked]="busyId() === row.item.id"
                              [disabled]="busyId() === row.item.id"
                              [attr.aria-label]="
                                'tasks.entity.complete'
                                  | transloco: { title: (row.item | localizedTitle) }
                              "
                              (change)="complete(row.item)"
                            />
                          } @else {
                            <span
                              class="flex h-7 w-7 flex-none items-center justify-center rounded-tile bg-accent-soft text-accent"
                              aria-hidden="true"
                            >
                              <app-icon [name]="sourceIcon(row.item.source)" [size]="14" />
                            </span>
                          }
                          <span class="min-w-0 flex-1">
                            <span
                              class="flex flex-wrap items-center gap-x-2 text-meta text-fg-subtle"
                            >
                              <span class="font-semibold text-fg-muted">{{
                                row.kindKey | transloco
                              }}</span>
                              @if (row.item.code) {
                                <span class="font-mono">{{ row.item.code }}</span>
                              }
                              @if (row.item.module && row.item.module !== 'tasks') {
                                <span aria-hidden="true">·</span>
                                <span>{{ 'modules.names.' + row.item.module | transloco }}</span>
                              }
                              @if (row.item.mine === false) {
                                <span aria-hidden="true">·</span>
                                <span data-testid="work-not-mine">{{
                                  'tasks.myWork.notMine' | transloco
                                }}</span>
                              }
                            </span>
                            @if (row.item.url) {
                              <a
                                [routerLink]="row.item.url"
                                class="block text-body font-semibold text-fg [overflow-wrap:anywhere] hover:underline"
                              >
                                {{ row.item | localizedTitle }}
                              </a>
                            } @else {
                              <span class="block text-body font-semibold text-fg">{{
                                row.item | localizedTitle
                              }}</span>
                            }
                            <span
                              class="mt-0.5 block text-meta"
                              [class.text-warn-ink]="row.overdue"
                              [class.font-semibold]="row.overdue"
                              [class.text-fg-muted]="!row.overdue"
                              data-testid="work-why"
                            >
                              {{ row.why.key | transloco: row.why.params }}
                            </span>
                          </span>
                          <span class="flex flex-none flex-col items-end gap-1">
                            @if (row.item.overdue) {
                              <app-status-badge meaning="lifecycle" value="overdue" />
                            } @else if (
                              row.item.priority === 'high' || row.item.priority === 'urgent'
                            ) {
                              <app-status-badge
                                meaning="severity"
                                [value]="row.item.priority === 'urgent' ? 'critical' : 'high'"
                                [labelKey]="priorityKey(row.item.priority)"
                              />
                            }
                            @if (
                              row.item.source === 'task' &&
                              row.item.status &&
                              row.item.status !== 'open'
                            ) {
                              <app-status-badge
                                meaning="lifecycle"
                                [value]="row.item.status"
                                [labelKey]="statusKey(row.item.status)"
                              />
                            }
                            <span class="text-meta text-fg-muted">
                              @if (row.item.due_at) {
                                {{ row.item.due_at | localDay }}
                              } @else {
                                {{ 'tasks.common.noDueDate' | transloco }}
                              }
                            </span>
                          </span>
                        </li>
                      }
                    </ul>
                  </app-card>
                }
              }
              @case ('board') {
                <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                  @for (col of boardColumns; track col) {
                    <section
                      class="flex min-h-[160px] flex-col rounded-card border border-border bg-surface-2 p-3"
                      [attr.aria-label]="'tasks.status.' + col | transloco"
                    >
                      <h2 class="mb-2 flex items-center gap-2 text-ui font-bold text-fg">
                        {{ 'tasks.board.columns.' + col | transloco }}
                        <app-badge tone="neutral">{{ board()[col].length }}</app-badge>
                      </h2>
                      <ul class="flex flex-col gap-2">
                        @for (item of board()[col]; track item.source + item.id) {
                          <li
                            class="rounded-tile border bg-surface p-3"
                            [class.border-warn]="item.overdue"
                            [class.border-border]="!item.overdue"
                          >
                            <div class="mb-1 flex items-center gap-1.5 text-meta text-fg-subtle">
                              <app-icon [name]="sourceIcon(item.source)" [size]="12" />
                              {{ sourceLabelKey(item.source) | transloco }}
                              @if (item.code) {
                                <span class="font-mono">{{ item.code }}</span>
                              }
                            </div>
                            @if (item.url) {
                              <a
                                [routerLink]="item.url"
                                class="block text-ui font-semibold text-fg hover:underline"
                              >
                                {{ item | localizedTitle }}
                              </a>
                            } @else {
                              <span class="block text-ui font-semibold text-fg">{{
                                item | localizedTitle
                              }}</span>
                            }
                            <div class="mt-2 flex flex-wrap items-center gap-2">
                              <span
                                class="text-meta"
                                [class.text-warn-ink]="item.overdue"
                                [class.font-semibold]="item.overdue"
                                [class.text-fg-muted]="!item.overdue"
                              >
                                @if (item.overdue) {
                                  {{ 'tasks.common.overdue' | transloco }} ·
                                }
                                @if (item.due_at) {
                                  {{ item.due_at | localDay }}
                                } @else {
                                  {{ 'tasks.common.noDueDate' | transloco }}
                                }
                              </span>
                              @if (item.source === 'task') {
                                <label class="ml-auto">
                                  <span class="sr-only">
                                    {{
                                      'tasks.board.moveLabel'
                                        | transloco: { title: (item | localizedTitle) }
                                    }}
                                  </span>
                                  <select
                                    class="h-7 rounded-tile border border-border bg-bg px-1.5 text-meta"
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
                          <li class="py-4 text-center text-meta text-fg-subtle">
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
                    <h2 class="font-display text-card font-bold text-fg" aria-live="polite">
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
                          class="px-2 py-1.5 text-center text-micro font-semibold text-fg-subtle uppercase"
                          role="columnheader"
                        >
                          {{ 'tasks.rrule.weekdaysShort.' + d | transloco }}
                        </div>
                      }
                    </div>
                    @for (week of grid(); track week[0].day) {
                      <div
                        class="grid grid-cols-7 border-b border-border last:border-b-0"
                        role="row"
                      >
                        @for (cell of week; track cell.day) {
                          <div
                            class="min-h-[96px] border-r border-border p-1.5 last:border-r-0"
                            [class.bg-surface-2]="!cell.inMonth"
                            role="cell"
                          >
                            <div
                              class="mb-1 flex h-6 w-6 items-center justify-center rounded-full text-meta"
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
                                  class="mb-0.5 block truncate rounded-tile px-1.5 py-0.5 text-micro font-semibold hover:underline"
                                  [class.bg-warn-soft]="item.overdue"
                                  [class.text-warn-ink]="item.overdue"
                                  [class.bg-accent-soft]="!item.overdue"
                                  [class.text-accent]="!item.overdue"
                                  [title]="item | localizedTitle"
                                >
                                  {{ item | localizedTitle }}
                                </a>
                              } @else {
                                <span
                                  class="mb-0.5 block truncate rounded-tile bg-surface-2 px-1.5 py-0.5 text-micro"
                                >
                                  {{ item | localizedTitle }}
                                </span>
                              }
                            }
                            @if ((dayItems().get(cell.day)?.length ?? 0) > cellLimit) {
                              <button
                                type="button"
                                class="px-1.5 text-micro font-semibold text-fg-muted hover:underline"
                                (click)="selectedDay.set(cell.day)"
                              >
                                {{
                                  'tasks.calendar.more'
                                    | transloco
                                      : {
                                          count:
                                            (dayItems().get(cell.day)?.length ?? 0) - cellLimit,
                                        }
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
                        <div class="mb-1 text-meta font-semibold text-fg-muted">
                          {{ entry.day | localDay: 'EEEE d MMM' }}
                        </div>
                        @for (item of entry.items; track item.source + item.id) {
                          @if (item.url) {
                            <a
                              [routerLink]="item.url"
                              class="block py-0.5 text-ui hover:underline"
                              [class.text-warn-ink]="item.overdue"
                              [class.text-fg]="!item.overdue"
                            >
                              {{ item | localizedTitle }}
                            </a>
                          } @else {
                            <span class="block py-0.5 text-ui text-fg">{{
                              item | localizedTitle
                            }}</span>
                          }
                        }
                      </li>
                    } @empty {
                      <li class="px-4 py-8 text-center text-ui text-fg-muted">
                        {{ 'tasks.calendar.empty' | transloco }}
                      </li>
                    }
                  </ul>

                  @if (selectedDay(); as day) {
                    <div class="border-t border-border px-4 py-3" aria-live="polite">
                      <div class="mb-1 flex items-center justify-between">
                        <h3 class="text-ui font-bold text-fg">
                          {{ day | localDay: 'fullDate' }}
                        </h3>
                        <button
                          type="button"
                          class="rounded-tile p-1 text-fg-subtle hover:bg-surface-2"
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
                            class="block py-0.5 text-ui text-fg hover:underline"
                          >
                            {{ item | localizedTitle }}
                          </a>
                        } @else {
                          <span class="block py-0.5 text-ui text-fg">{{
                            item | localizedTitle
                          }}</span>
                        }
                      }
                    </div>
                  }
                </app-card>
              }
            }
          }
        }
      </div>

      @if (tab() === 'training' && trainingOn()) {
        <a
          routerLink="/training/mine"
          data-testid="work-all-training"
          class="mt-3 inline-block text-ui font-semibold text-accent hover:underline"
        >
          {{ 'tasks.myWork.allTraining' | transloco }}
        </a>
      }
      @if (calendar() && reportsOn()) {
        <a
          routerLink="/reports/calendar"
          [queryParams]="scope() === 'mine' ? { owner: 'me' } : {}"
          data-testid="work-org-calendar"
          class="mt-3 inline-block text-ui font-semibold text-accent hover:underline"
        >
          {{ 'tasks.myWork.orgCalendar' | transloco }}
        </a>
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
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modules = inject(ModuleService);

  protected readonly views = SWITCH_VIEWS;
  protected readonly tabs = WORK_TABS;
  protected readonly scopes = WORK_SCOPES;
  protected readonly recurringFilter = RECURRING_FILTER;
  protected readonly boardColumns = BOARD_COLUMNS;
  protected readonly weekdayKeys = WEEKDAY_KEYS;
  protected readonly cellLimit = CELL_LIMIT;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly sourceIcon = sourceIcon;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly statusKey = taskStatusKey;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canRead = computed(() => this.permissions().includes('tasks:read'));
  protected readonly canWrite = computed(() => this.permissions().includes('tasks:write'));
  protected readonly trainingOn = computed(
    () => this.modules.isEnabled('training') && this.permissions().includes('training:read'),
  );
  protected readonly reportsOn = computed(
    () => this.modules.isEnabled('reports') && this.permissions().includes('reports:read'),
  );

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot?.queryParamMap ?? null,
  });
  protected readonly view = computed<MyWorkView>(() => parseView(this.query()?.get('view')));
  private readonly requestedTab = computed(() => parseTab(this.query()?.get('tab')));
  /** The Kalender tab: `?tab=calendar` or the older `?view=calendar`. */
  protected readonly calendar = computed(
    () => this.view() === 'calendar' || this.requestedTab() === 'calendar',
  );
  /** What the panel shows: the calendar on the Kalender tab, else list or board. */
  protected readonly shownView = computed<MyWorkView>(() =>
    this.calendar() ? 'calendar' : this.view() === 'board' ? 'board' : 'list',
  );
  /** Mine / All (`?scope=all`, U08). */
  protected readonly scope = computed<WorkScope>(() => parseScope(this.query()?.get('scope')));

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
  /** `?source=` (e.g. `document_ack` from a Home counter, U07) preselects the type. */
  protected readonly filters = signal<WorkFilters>({
    ...NO_FILTERS,
    source: this.route.snapshot?.queryParamMap?.get('source') || NO_FILTERS.source,
  });
  protected readonly busyId = signal<string | null>(null);
  protected readonly formOpen = signal(false);

  /** Items after the module and type filters (every tab). */
  protected readonly filtered = computed(() => filterWorkItems(this.items(), this.filters()));
  protected readonly counts = computed(() => countTabs(this.filtered(), this.today));
  /** The open tab: the calendar, `?tab=`, else the first time tab with something in it. */
  protected readonly tab = computed<WorkTab>(() =>
    this.calendar() ? 'calendar' : (this.requestedTab() ?? defaultTab(this.counts())),
  );
  /** Items of the open tab (list and board); the calendar shows every filtered item. */
  protected readonly visible = computed(() => {
    const tab = this.tab();
    return tab === 'calendar'
      ? this.filtered()
      : this.filtered().filter((item) => inTab(item, tab, this.today));
  });
  protected readonly hasRecurring = computed(() => this.items().some((item) => !!item.recurring));
  protected readonly rows = computed(() =>
    this.visible().map((item) => ({
      item,
      kindKey: sourceLabelKey(item.source),
      why: whyOf(item),
      overdue: groupOf(item, this.today) === 'overdue',
    })),
  );
  protected readonly board = computed(() => groupByColumn(this.visible()));
  protected readonly dayItems = computed(() => itemsByDay(this.filtered()));
  protected readonly agenda = computed(() =>
    [...this.dayItems().entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, items]) => ({ day, items })),
  );
  /** Modules and types present in the feed (the filters only offer what is there). */
  protected readonly moduleOptions = computed(() =>
    [
      ...new Set(
        this.items()
          .map((i) => i.module)
          .filter((m): m is string => !!m),
      ),
    ].sort(),
  );
  protected readonly sourceOptions = computed(() => [
    ...new Set(this.items().map((i) => i.source)),
  ]);
  protected readonly myAssignee = computed(() => {
    // New tasks created from My Work are assigned to the creator by default.
    const id = this.auth.user()?.id;
    return id ? { type: 'user' as const, value: id } : null;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());

    const context = () => ({
      module: 'tasks',
      view: this.view(),
      title: this.language.translate('nav.myWork'),
    });
    providePageContext(context);
    provideTasksPageContext(context);

    // `?recurring=1` (old links to the recurring list) opens with the recurring filter.
    if (this.route.snapshot?.queryParamMap?.get('recurring') === '1') {
      this.filters.set({ ...NO_FILTERS, source: RECURRING_FILTER });
    }

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const range = this.calendar() ? gridRange(this.grid()) : null;
      const scope = this.scope();
      untracked(() => this.load(orgId, range, scope));
    });
  }

  /** The count badge of a tab (the calendar has none). */
  protected tabCount(tab: WorkTab): number {
    return tab === 'calendar' ? 0 : this.counts()[tab];
  }

  protected setScope(scope: WorkScope): void {
    this.navigate({ scope: scope === 'all' ? 'all' : null });
  }

  protected setView(view: MyWorkView): void {
    this.selectedDay.set(null);
    this.navigate({ view: view === 'list' ? null : view });
  }

  protected setTab(tab: WorkTab): void {
    this.selectedDay.set(null);
    if (tab === 'calendar') {
      this.navigate({ tab: 'calendar', view: null });
      return;
    }
    // Leaving the calendar returns to the list; the board stays the board.
    this.navigate({ tab, view: this.view() === 'board' ? 'board' : null });
  }

  /** Arrow keys move between tabs (WAI-ARIA tabs pattern). */
  protected onTabKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const index = WORK_TABS.indexOf(this.tab());
    const next = WORK_TABS[(index + step + WORK_TABS.length) % WORK_TABS.length];
    this.setTab(next);
    queueMicrotask(() => document.getElementById(`work-tab-${next}`)?.focus());
  }

  protected setFilter(key: keyof WorkFilters, value: string): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  protected clearFilters(): void {
    this.filters.set(NO_FILTERS);
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
    const range = this.calendar() ? gridRange(this.grid()) : null;
    this.load(this.selectedOrg.currentOrgId(), range, this.scope());
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

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private load(
    orgId: string | null,
    range: { from: string; to: string } | null,
    scope: WorkScope,
  ): void {
    this.request.unsubscribe();
    if (!orgId) {
      this.items.set([]);
      this.state.set('ready');
      return;
    }
    this.state.set('loading');
    const query = { ...(range ?? {}), ...(scope === 'all' ? { scope } : {}) };
    this.request = this.api.myWork(orgId, query).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

function initialMonth(today: string): { year: number; month: number } {
  const [year, month] = today.split('-').map(Number);
  return { year, month };
}

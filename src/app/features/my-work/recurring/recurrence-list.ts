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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { taskErrorKey } from '../../../core/tasks/task-errors';
import { Recurrence } from '../../../core/tasks/task.models';
import { TasksApi } from '../../../core/tasks/tasks-api';
import { AskPanelService } from '../../ask/ask-panel.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { AssigneeLabel } from '../../../shared/tasks/assignee-label';
import { TaskGuideIntro } from '../../../shared/tasks/guidance/task-guide-intro';
import { TaskLesson } from '../../../shared/tasks/guidance/task-lesson';
import { TaskTeachingEmpty } from '../../../shared/tasks/guidance/task-teaching-empty';
import { TaskWhyItMatters } from '../../../shared/tasks/guidance/task-why-it-matters';
import { RuleSummary } from '../../../shared/tasks/rule-summary';
import { taskPriorityKey, taskPriorityTone } from '../../../shared/tasks/task-display';
import { TaskForm, TaskFormResult } from '../../../shared/tasks/task-form';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { Switch } from '../../../shared/ui/switch/switch';
import { provideTasksPageContext } from '../tasks-page-context';

const PAGE_SIZE = 25;

/**
 * Recurring tasks (`/tasks/recurring`): the series the caller created or is
 * assigned to (all of them with `tasks:manage`), with their rule, next due date and
 * assignee. The creator or a manager can pause / resume, edit or delete a series;
 * each occurrence is created ahead of its due date by the daily scheduler.
 */
@Component({
  selector: 'app-recurrence-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    AssigneeLabel,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    Pager,
    RuleSummary,
    SlideOver,
    Switch,
    TaskForm,
    TaskGuideIntro,
    TaskLesson,
    TaskTeachingEmpty,
    TaskWhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/tasks"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'tasks.common.backToTasks' | transloco }}
      </a>
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'tasks.recurring.title' | transloco }}
          </h1>
          <p class="mt-1.5 text-[14px] text-fg-muted">
            {{ 'tasks.recurring.subtitle' | transloco }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-button variant="ghost" size="sm" (click)="suggest()">
            <app-icon name="spark" [size]="14" />
            {{ 'tasks.ai.suggestRecurring' | transloco }}
          </app-button>
          @if (canWrite()) {
            <a
              routerLink="/tasks/new"
              [queryParams]="{ recurring: 1 }"
              class="inline-flex h-8 items-center gap-1.5 rounded-tile bg-accent px-3 text-[13px] font-semibold text-white hover:opacity-90"
            >
              <app-icon name="plus" [size]="14" />
              {{ 'tasks.recurring.new' | transloco }}
            </a>
          }
        </div>
      </header>

      <div class="mb-4 flex flex-col gap-3">
        <app-task-guide-intro page="recurring" />
        <div><app-task-lesson lesson="recurring-controls" /></div>
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
            @if (items().length === 0) {
              <app-task-teaching-empty page="recurring" icon="history" [showAction]="false" />
            } @else {
              <ul class="divide-y divide-border">
                @for (rec of items(); track rec.id) {
                  <li class="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class="truncate text-[13.5px] font-semibold text-fg"
                          [class.text-fg-muted]="!rec.active"
                        >
                          {{ rec.title }}
                        </span>
                        @if (!rec.active) {
                          <app-badge tone="neutral">{{
                            'tasks.recurring.paused' | transloco
                          }}</app-badge>
                        }
                        @if (rec.priority === 'high' || rec.priority === 'urgent') {
                          <app-badge [tone]="priorityTone(rec.priority)">{{
                            priorityKey(rec.priority) | transloco
                          }}</app-badge>
                        }
                      </div>
                      <div
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-fg-muted"
                      >
                        <span class="inline-flex items-center gap-1">
                          <app-icon name="history" [size]="12" />
                          <app-rule-summary [rrule]="rec.rrule" />
                        </span>
                        <app-assignee-label [assignee]="rec.assignee" />
                        @if (rec.entity; as entity) {
                          @if (entity.url) {
                            <a
                              [routerLink]="entity.url"
                              class="inline-flex items-center gap-1 text-accent hover:underline"
                            >
                              <app-icon name="link" [size]="12" />
                              {{ entity.code || entity.title }}
                            </a>
                          }
                        }
                      </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-3 text-[12.5px] text-fg-muted">
                      <span>
                        @if (rec.active && rec.next_due_at) {
                          {{
                            'tasks.recurring.nextDue'
                              | transloco: { date: (rec.next_due_at | localDay) }
                          }}
                        } @else if (rec.active) {
                          {{ 'tasks.recurring.ended' | transloco }}
                        }
                      </span>
                      @if (canEdit(rec)) {
                        <div class="w-auto">
                          <app-switch
                            [checked]="rec.active"
                            (checkedChange)="setActive(rec, $event)"
                          >
                            {{ 'tasks.recurring.active' | transloco }}
                            <span class="sr-only">{{ rec.title }}</span>
                          </app-switch>
                        </div>
                        <app-button variant="ghost" size="sm" (click)="editing.set(rec)">
                          {{ 'tasks.actions.edit' | transloco }}
                        </app-button>
                        <app-button variant="ghost" size="sm" (click)="deleting.set(rec)">
                          <app-icon name="trash" [size]="14" />
                          <span class="sr-only">{{
                            'tasks.recurring.deleteLabel' | transloco: { title: rec.title }
                          }}</span>
                        </app-button>
                      }
                    </div>
                  </li>
                }
              </ul>
              <div class="border-t border-border px-4 py-2.5">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="items().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <div class="mt-6"><app-task-why-it-matters page="recurring" /></div>
    </div>

    <app-slide-over
      [open]="editing() !== null"
      [title]="'tasks.recurring.editTitle' | transloco"
      [closeLabel]="'tasks.common.close' | transloco"
      [width]="580"
      (closed)="editing.set(null)"
    >
      @if (editing(); as rec) {
        <app-task-form
          [value]="{ recurrence: rec }"
          (saved)="onSaved($event)"
          (cancelled)="editing.set(null)"
        />
      }
    </app-slide-over>

    <app-confirm-dialog
      [open]="deleting() !== null"
      [title]="'tasks.confirm.deleteSeriesTitle' | transloco"
      [message]="'tasks.confirm.deleteSeriesBody' | transloco: { title: deleting()?.title ?? '' }"
      [confirmLabel]="'tasks.actions.delete' | transloco"
      [cancelLabel]="'tasks.confirm.keep' | transloco"
      [busy]="busy()"
      (confirmed)="confirmDelete()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class RecurrenceListPage {
  private readonly api = inject(TasksApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly priorityTone = taskPriorityTone;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('tasks:write'));
  private readonly canManage = computed(() => this.permissions().includes('tasks:manage'));

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Recurrence[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly editing = signal<Recurrence | null>(null);
  protected readonly deleting = signal<Recurrence | null>(null);
  protected readonly busy = signal(false);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    provideTasksPageContext(() => ({
      module: 'tasks',
      entityType: 'task',
      view: 'list',
      title: this.language.translate('tasks.recurring.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const offset = this.offset();
      untracked(() => this.load(orgId, offset));
    });
  }

  /** Mirrors the backend rule: the creator or `tasks:manage` (plus `tasks:write`). */
  protected canEdit(rec: Recurrence): boolean {
    return (
      this.canWrite() && (this.canManage() || rec.created_by === (this.auth.user()?.id ?? null))
    );
  }

  protected setActive(rec: Recurrence, active: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.replace({ ...rec, active });
    this.api.updateRecurrence(orgId, rec.id, { active }).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.notifications.success(
          active ? 'tasks.notices.seriesResumed' : 'tasks.notices.seriesPaused',
        );
      },
      error: (error: unknown) => {
        this.replace(rec);
        this.notifications.error(taskErrorKey(error));
      },
    });
  }

  protected onSaved(result: TaskFormResult): void {
    this.editing.set(null);
    if (result.recurrence) {
      this.replace(result.recurrence);
      this.notifications.success('tasks.notices.saved');
    }
  }

  protected confirmDelete(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const rec = this.deleting();
    if (!orgId || !rec) {
      return;
    }
    this.busy.set(true);
    this.api.deleteRecurrence(orgId, rec.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.items.update((items) => items.filter((i) => i.id !== rec.id));
        this.total.update((t) => Math.max(0, t - 1));
        this.notifications.success('tasks.notices.seriesDeleted');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.deleting.set(null);
        this.notifications.error(taskErrorKey(error));
      },
    });
  }

  protected suggest(): void {
    this.ask.showWith(this.language.translate('tasks.ai.prompts.suggestRecurring'));
  }

  private replace(rec: Recurrence): void {
    this.items.update((items) => items.map((i) => (i.id === rec.id ? rec : i)));
  }

  private load(orgId: string | null, offset: number): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listRecurrences(orgId, { limit: PAGE_SIZE, offset }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

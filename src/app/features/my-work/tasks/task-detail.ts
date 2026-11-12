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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { taskErrorKey } from '../../../core/tasks/task-errors';
import {
  ChecklistItem,
  EDITABLE_TASK_STATUSES,
  EditableTaskStatus,
  TaskDetail,
} from '../../../core/tasks/task.models';
import { TasksApi } from '../../../core/tasks/tasks-api';
import { AskPanelService } from '../../ask/ask-panel.service';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { AssigneeLabel } from '../../../shared/tasks/assignee-label';
import { TaskGuideIntro } from '../../../shared/tasks/guidance/task-guide-intro';
import { TaskLesson } from '../../../shared/tasks/guidance/task-lesson';
import { TaskWhyItMatters } from '../../../shared/tasks/guidance/task-why-it-matters';
import {
  isClosedStatus,
  taskPriorityKey,
  taskPriorityTone,
  taskStatusKey,
  taskStatusTone,
} from '../../../shared/tasks/task-display';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { provideTasksPageContext } from '../tasks-page-context';
import { TaskHistoryEntry, taskHistory } from './task-history';

type PendingConfirm = 'cancel' | 'delete' | null;

/**
 * A task's detail page (`/tasks/:id`): status and priority, the record it belongs
 * to, assignee and dates, description, checklist (tick, add, remove), its history,
 * and the actions the caller may take (start / block, complete, reopen, cancel,
 * edit, delete). Done and cancelled tasks are read-only until reopened. Offers
 * assistant actions (summarise, suggest checklist steps, ask about the task).
 */
@Component({
  selector: 'app-task-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Alert,
    AssigneeLabel,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    ProgressBar,
    TaskGuideIntro,
    TaskLesson,
    TaskWhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/my-work"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'tasks.common.backToMyWork' | transloco }}
      </a>

      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'tasks.common.loading' | transloco }}</p>
        }
        @case ('error') {
          <app-alert tone="error">{{ 'tasks.detail.notFound' | transloco }}</app-alert>
        }
        @case ('ready') {
          @if (task(); as task) {
            <header class="mb-4 flex flex-col gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(task.status)">{{
                  statusKey(task.status) | transloco
                }}</app-badge>
                <app-badge [tone]="priorityTone(task.priority)">{{
                  priorityKey(task.priority) | transloco
                }}</app-badge>
                @if (task.overdue) {
                  <app-badge tone="fail">{{ 'tasks.common.overdue' | transloco }}</app-badge>
                }
                @if (task.escalation_level > 0) {
                  <app-badge tone="warn">
                    {{ 'tasks.detail.escalated' | transloco: { level: task.escalation_level } }}
                  </app-badge>
                }
                @if (task.recurrence_id) {
                  <a
                    routerLink="/tasks/recurring"
                    class="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"
                  >
                    <app-icon name="history" [size]="13" />
                    {{ 'tasks.detail.partOfSeries' | transloco }}
                  </a>
                }
              </div>
              <h1
                class="font-display text-[26px] font-bold tracking-[-0.025em] break-words text-fg"
              >
                {{ task.title }}
              </h1>

              <div class="flex flex-wrap items-center gap-2">
                @if (editable()) {
                  <label class="flex items-center gap-2 text-[13px] font-semibold text-fg-muted">
                    {{ 'tasks.detail.statusLabel' | transloco }}
                    <select
                      class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
                      [disabled]="busy()"
                      (change)="setStatus($any($event.target))"
                    >
                      @for (s of editableStatuses; track s) {
                        <option [value]="s" [selected]="s === task.status">
                          {{ statusKey(s) | transloco }}
                        </option>
                      }
                    </select>
                  </label>
                  <app-button size="sm" [loading]="busy()" (click)="complete()">
                    <app-icon name="check" [size]="14" />
                    {{ 'tasks.actions.complete' | transloco }}
                  </app-button>
                  <a
                    [routerLink]="['/tasks', task.id, 'edit']"
                    class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  >
                    {{ 'tasks.actions.edit' | transloco }}
                  </a>
                  <app-button
                    variant="ghost"
                    size="sm"
                    [disabled]="busy()"
                    (click)="pending.set('cancel')"
                  >
                    {{ 'tasks.actions.cancel' | transloco }}
                  </app-button>
                }
                @if (task.can_edit && closed()) {
                  <app-button variant="secondary" size="sm" [loading]="busy()" (click)="reopen()">
                    {{ 'tasks.actions.reopen' | transloco }}
                  </app-button>
                }
                @if (task.can_delete) {
                  <app-button
                    variant="ghost"
                    size="sm"
                    [disabled]="busy()"
                    (click)="pending.set('delete')"
                  >
                    <app-icon name="trash" [size]="14" />
                    {{ 'tasks.actions.delete' | transloco }}
                  </app-button>
                }
              </div>
              @if (closed()) {
                <p class="text-[13px] text-fg-muted">{{ 'tasks.detail.closedHint' | transloco }}</p>
              }
            </header>

            <div class="mb-4 flex flex-col gap-3">
              <app-task-guide-intro page="detail" />
              <div
                class="flex flex-wrap items-center gap-2"
                role="group"
                [attr.aria-label]="'tasks.ai.groupLabel' | transloco"
              >
                <app-button variant="ghost" size="sm" (click)="askAi('summarise')">
                  <app-icon name="spark" [size]="14" />
                  {{ 'tasks.ai.summarise' | transloco }}
                </app-button>
                @if (editable()) {
                  <app-button variant="ghost" size="sm" (click)="askAi('suggestChecklist')">
                    <app-icon name="spark" [size]="14" />
                    {{ 'tasks.ai.suggestChecklist' | transloco }}
                  </app-button>
                }
                <app-button variant="ghost" size="sm" (click)="askAi('askAbout')">
                  <app-icon name="comment" [size]="14" />
                  {{ 'tasks.ai.askAbout' | transloco }}
                </app-button>
                <app-task-lesson lesson="working-with-tasks" />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div class="flex min-w-0 flex-col gap-5">
                <app-card>
                  <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                    {{ 'tasks.detail.description' | transloco }}
                  </h2>
                  @if (task.description) {
                    <div
                      class="cf-prose text-[13.5px] leading-relaxed text-fg"
                      [innerHTML]="task.description | appMarkdown"
                    ></div>
                  } @else {
                    <p class="text-[13.5px] text-fg-subtle">
                      {{ 'tasks.detail.noDescription' | transloco }}
                    </p>
                  }
                </app-card>

                <app-card>
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <h2 class="font-display text-[15px] font-bold text-fg">
                      {{ 'tasks.checklist.title' | transloco }}
                    </h2>
                    @if (task.checklist.length) {
                      <span class="text-[12.5px] text-fg-muted">
                        {{
                          'tasks.checklist.progress'
                            | transloco: { done: doneCount(), total: task.checklist.length }
                        }}
                      </span>
                    }
                  </div>
                  @if (task.checklist.length) {
                    <div class="mb-3">
                      <app-progress-bar
                        [value]="checklistPercent()"
                        [label]="'tasks.checklist.title' | transloco"
                      />
                    </div>
                    <ul class="flex flex-col gap-1">
                      @for (item of task.checklist; track item.id) {
                        <li
                          class="group flex items-center gap-2 rounded-tile px-1 py-1 hover:bg-surface-2"
                        >
                          <input
                            type="checkbox"
                            class="h-4 w-4 flex-none"
                            [id]="'check-' + item.id"
                            [checked]="itemBusy() === item.id ? !item.done : item.done"
                            [disabled]="!editable() || itemBusy() === item.id"
                            (change)="toggleItem(item, $any($event.target).checked)"
                          />
                          <label
                            [for]="'check-' + item.id"
                            class="min-w-0 flex-1 text-[13.5px]"
                            [class.line-through]="item.done"
                            [class.text-fg-muted]="item.done"
                            [class.text-fg]="!item.done"
                          >
                            {{ item.text }}
                          </label>
                          @if (editable()) {
                            <button
                              type="button"
                              class="rounded-[8px] p-1 text-fg-subtle opacity-100 hover:text-fail focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              [attr.aria-label]="
                                'tasks.checklist.remove' | transloco: { text: item.text }
                              "
                              [disabled]="itemBusy() === item.id"
                              (click)="removeItem(item)"
                            >
                              <app-icon name="x" [size]="14" />
                            </button>
                          }
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-[13.5px] text-fg-subtle">
                      {{ 'tasks.checklist.empty' | transloco }}
                    </p>
                  }
                  @if (editable()) {
                    <form
                      class="mt-3 flex items-center gap-2"
                      (submit)="$event.preventDefault(); addItem()"
                    >
                      <input
                        type="text"
                        maxlength="500"
                        class="h-9 min-w-0 flex-1 rounded-tile border border-border bg-bg px-3 text-[13.5px]"
                        [attr.aria-label]="'tasks.checklist.addLabel' | transloco"
                        [placeholder]="'tasks.checklist.addPlaceholder' | transloco"
                        [value]="newItem()"
                        (input)="newItem.set($any($event.target).value)"
                      />
                      <app-button
                        size="sm"
                        type="submit"
                        [disabled]="!newItem().trim()"
                        [loading]="adding()"
                      >
                        {{ 'tasks.checklist.add' | transloco }}
                      </app-button>
                    </form>
                  }
                </app-card>

                <app-card>
                  <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                    {{ 'tasks.history.title' | transloco }}
                  </h2>
                  <ol class="flex flex-col gap-2 border-l border-border pl-4">
                    @for (entry of history(); track entry.key) {
                      <li class="relative text-[13px] text-fg-muted">
                        <span
                          class="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-accent"
                          aria-hidden="true"
                        ></span>
                        {{ entry.key | transloco: entry.params }}
                        <span class="block text-[12px] text-fg-subtle">{{
                          entry.at | localDate: 'medium'
                        }}</span>
                      </li>
                    }
                  </ol>
                </app-card>
              </div>

              <aside class="flex flex-col gap-5">
                <app-card>
                  <dl class="flex flex-col gap-3 text-[13px]">
                    <div>
                      <dt class="text-[12px] font-semibold text-fg-subtle">
                        {{ 'tasks.fields.assignee' | transloco }}
                      </dt>
                      <dd class="text-fg"><app-assignee-label [assignee]="task.assignee" /></dd>
                    </div>
                    <div>
                      <dt class="text-[12px] font-semibold text-fg-subtle">
                        {{ 'tasks.fields.due' | transloco }}
                      </dt>
                      <dd
                        [class.text-fail]="task.overdue"
                        [class.font-semibold]="task.overdue"
                        [class.text-fg]="!task.overdue"
                      >
                        @if (task.due_at) {
                          {{ task.due_at | localDay: 'fullDate' }}
                        } @else {
                          {{ 'tasks.common.noDueDate' | transloco }}
                        }
                      </dd>
                    </div>
                    @if (task.start_at) {
                      <div>
                        <dt class="text-[12px] font-semibold text-fg-subtle">
                          {{ 'tasks.fields.start' | transloco }}
                        </dt>
                        <dd class="text-fg">{{ task.start_at | localDay: 'fullDate' }}</dd>
                      </div>
                    }
                    @if (task.entity; as entity) {
                      <div>
                        <dt class="text-[12px] font-semibold text-fg-subtle">
                          {{ 'tasks.fields.record' | transloco }}
                        </dt>
                        <dd>
                          @if (entity.url) {
                            <a
                              [routerLink]="entity.url"
                              class="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                            >
                              <app-icon name="link" [size]="13" />
                              @if (entity.code) {
                                <span class="font-mono">{{ entity.code }}</span>
                              }
                              {{ entity.title }}
                            </a>
                          } @else {
                            <span class="text-fg">{{ entity.title }}</span>
                          }
                        </dd>
                      </div>
                    } @else if (task.entity_type) {
                      <div>
                        <dt class="text-[12px] font-semibold text-fg-subtle">
                          {{ 'tasks.fields.record' | transloco }}
                        </dt>
                        <dd class="text-fg-subtle">
                          {{ 'tasks.detail.recordUnavailable' | transloco }}
                        </dd>
                      </div>
                    }
                    <div>
                      <dt class="text-[12px] font-semibold text-fg-subtle">
                        {{ 'tasks.fields.createdBy' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{ task.created_by_name || ('tasks.history.system' | transloco) }}
                      </dd>
                    </div>
                  </dl>
                </app-card>
                <app-task-why-it-matters page="detail" />
              </aside>
            </div>

            <app-confirm-dialog
              [open]="pending() !== null"
              [title]="
                (pending() === 'delete' ? 'tasks.confirm.deleteTitle' : 'tasks.confirm.cancelTitle')
                  | transloco
              "
              [message]="
                (pending() === 'delete' ? 'tasks.confirm.deleteBody' : 'tasks.confirm.cancelBody')
                  | transloco: { title: task.title }
              "
              [confirmLabel]="
                (pending() === 'delete' ? 'tasks.actions.delete' : 'tasks.actions.cancel')
                  | transloco
              "
              [cancelLabel]="'tasks.confirm.keep' | transloco"
              [busy]="busy()"
              (confirmed)="confirmPending()"
              (cancelled)="pending.set(null)"
            />
          }
        }
      }
    </div>
  `,
})
export class TaskDetailPage {
  private readonly api = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  /** Route param (component input binding). */
  readonly id = input.required<string>();

  protected readonly editableStatuses = EDITABLE_TASK_STATUSES;
  protected readonly statusKey = taskStatusKey;
  protected readonly statusTone = taskStatusTone;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly priorityTone = taskPriorityTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly task = signal<TaskDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly itemBusy = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly newItem = signal('');
  protected readonly pending = signal<PendingConfirm>(null);

  protected readonly closed = computed(() => isClosedStatus(this.task()?.status));
  protected readonly editable = computed(() => !!this.task()?.can_edit && !this.closed());
  protected readonly doneCount = computed(
    () => this.task()?.checklist.filter((i) => i.done).length ?? 0,
  );
  protected readonly checklistPercent = computed(() => {
    const total = this.task()?.checklist.length ?? 0;
    return total ? Math.round((this.doneCount() / total) * 100) : 0;
  });
  protected readonly history = computed<readonly TaskHistoryEntry[]>(() => {
    const task = this.task();
    return task ? taskHistory(task) : [];
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    provideTasksPageContext(() => ({
      module: 'tasks',
      entityType: 'task',
      entityId: this.id(),
      view: 'detail',
      title: this.task()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected setStatus(select: HTMLSelectElement): void {
    const status = select.value as EditableTaskStatus;
    const current = this.task()?.status;
    if (!current || status === current) {
      return;
    }
    // Show the stored status until the server confirms the change.
    select.value = current;
    this.mutate((orgId, id) => this.api.update(orgId, id, { status }), 'tasks.notices.saved');
  }

  protected complete(): void {
    const recurring = !!this.task()?.recurrence_id;
    this.mutate(
      (orgId, id) => this.api.complete(orgId, id),
      recurring ? 'tasks.notices.completedRecurring' : 'tasks.notices.completed',
    );
  }

  protected reopen(): void {
    this.mutate((orgId, id) => this.api.reopen(orgId, id), 'tasks.notices.reopened');
  }

  protected confirmPending(): void {
    const action = this.pending();
    if (action === 'cancel') {
      this.mutate(
        (orgId, id) => this.api.cancel(orgId, id),
        'tasks.notices.cancelled',
        () => this.pending.set(null),
      );
    } else if (action === 'delete') {
      const orgId = this.selectedOrg.currentOrgId();
      if (!orgId) {
        return;
      }
      this.busy.set(true);
      this.api.delete(orgId, this.id()).subscribe({
        next: () => {
          this.busy.set(false);
          this.pending.set(null);
          this.notifications.success('tasks.notices.deleted');
          void this.router.navigate(['/my-work']);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.pending.set(null);
          this.notifications.error(taskErrorKey(error));
        },
      });
    }
  }

  protected toggleItem(item: ChecklistItem, done: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.itemBusy.set(item.id);
    this.api.updateChecklistItem(orgId, this.id(), item.id, { done }).subscribe({
      next: (updated) => {
        this.itemBusy.set(null);
        this.patchChecklist((items) => items.map((i) => (i.id === updated.id ? updated : i)));
      },
      error: (error: unknown) => {
        this.itemBusy.set(null);
        this.notifications.error(taskErrorKey(error));
      },
    });
  }

  protected addItem(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const text = this.newItem().trim();
    if (!orgId || !text || this.adding()) {
      return;
    }
    this.adding.set(true);
    this.api.addChecklistItem(orgId, this.id(), text).subscribe({
      next: (item) => {
        this.adding.set(false);
        this.newItem.set('');
        this.patchChecklist((items) => [...items, item]);
      },
      error: (error: unknown) => {
        this.adding.set(false);
        this.notifications.error(taskErrorKey(error));
      },
    });
  }

  protected removeItem(item: ChecklistItem): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.itemBusy.set(item.id);
    this.api.deleteChecklistItem(orgId, this.id(), item.id).subscribe({
      next: () => {
        this.itemBusy.set(null);
        this.patchChecklist((items) => items.filter((i) => i.id !== item.id));
      },
      error: (error: unknown) => {
        this.itemBusy.set(null);
        this.notifications.error(taskErrorKey(error));
      },
    });
  }

  protected askAi(kind: 'summarise' | 'suggestChecklist' | 'askAbout'): void {
    const task = this.task();
    if (!task) {
      return;
    }
    const record = task.entity
      ? [task.entity.code, task.entity.title].filter(Boolean).join(' ')
      : null;
    this.ask.showWith(
      this.language.translate(`tasks.ai.prompts.${kind}${record ? 'OnRecord' : ''}`, {
        title: task.title,
        record,
      }),
    );
  }

  private patchChecklist(update: (items: readonly ChecklistItem[]) => ChecklistItem[]): void {
    this.task.update((task) => {
      if (!task) {
        return task;
      }
      const checklist = update(task.checklist);
      return {
        ...task,
        checklist,
        checklist_total: checklist.length,
        checklist_done: checklist.filter((i) => i.done).length,
      };
    });
  }

  private mutate(
    call: (orgId: string, id: string) => Observable<TaskDetail>,
    successKey: string,
    after?: () => void,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    call(orgId, this.id()).subscribe({
      next: (task) => {
        this.busy.set(false);
        this.task.set(task);
        after?.();
        this.notifications.success(successKey);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        after?.();
        this.notifications.error(taskErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (task) => {
        this.task.set(task);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

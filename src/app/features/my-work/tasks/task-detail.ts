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
import { Observable, Subscription, catchError, map, of } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { taskErrorKey } from '../../../core/tasks/task-errors';
import {
  ChecklistItem,
  EDITABLE_TASK_STATUSES,
  EditableTaskStatus,
  Recurrence,
  TaskDetail,
} from '../../../core/tasks/task.models';
import { TasksApi } from '../../../core/tasks/tasks-api';
import { AskPanelService } from '../../ask/ask-panel.service';
import { LocalizedTitleResolver } from '../../../core/i18n/localized-title';
import { LocalizedTitlePipe } from '../../../shared/i18n/localized-title.pipe';
import { EntityChip, EntityChipRef } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordMissingItem } from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { AssigneeLabel } from '../../../shared/tasks/assignee-label';
import { RuleSummary } from '../../../shared/tasks/rule-summary';
import {
  isClosedStatus,
  taskPriorityKey,
  taskPriorityTone,
  taskStatusKey,
  taskStatusTone,
} from '../../../shared/tasks/task-display';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { Breadcrumb } from '../../../shared/ui/page-header/page-header';
import { provideTasksPageContext } from '../tasks-page-context';
import { taskMissing, taskStatusLine } from './task-anatomy';

type PendingConfirm = 'cancel' | 'delete' | null;

/**
 * A task's detail page (`/tasks/:id`), built on the detail-page anatomy
 * (docs/ux-guide.md §2.7): the header (task · status · overdue; "Merk som utført"
 * or "Gjenåpne", Rediger, the rest in "Mer ⋯", assistant actions in "Spør KI");
 * "Hovedinformasjon" with a status sentence, what to do, the deadline (and the
 * series it repeats in), who is responsible and the record it belongs to; the
 * checklist and the other fields (empty ones hidden) in Detaljer; one
 * "Oppfølging" card with what is missing, the connections and the metadata.
 * Done and cancelled tasks are read-only until reopened.
 */
@Component({
  selector: 'app-task-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalizedTitlePipe,
    MarkdownPipe,
    AssigneeLabel,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EntityChip,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ProgressBar,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    RuleSummary,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-error-state
            titleKey="tasks.detail.notFoundTitle"
            bodyKey="tasks.detail.notFound"
            (retry)="reload()"
          />
        </div>
      }
      @case ('ready') {
        @if (task(); as task) {
          @let line = statusLine();
          <app-record-detail-layout
            [anatomy]="true"
            entityType="task"
            [entityId]="task.id"
            [title]="task | localizedTitle"
            [breadcrumbs]="breadcrumbs()"
            [canEdit]="task.can_edit"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span>{{ 'tasks.detail.type' | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-badge [tone]="statusTone(task.status)" data-testid="task-status">{{
                statusKey(task.status) | transloco
              }}</app-badge>
              @if (task.overdue) {
                <app-badge tone="warn">{{ 'tasks.common.overdue' | transloco }}</app-badge>
              }
            </ng-container>

            @if (editable()) {
              <app-button
                primary
                [loading]="busy()"
                (click)="complete()"
                data-testid="task-complete"
              >
                <app-icon name="check" [size]="14" />
                {{ 'tasks.actions.complete' | transloco }}
              </app-button>
            }
            @if (editable()) {
              <app-button
                secondary
                variant="secondary"
                [disabled]="busy()"
                (click)="edit()"
                data-testid="task-edit"
              >
                {{ 'tasks.actions.edit' | transloco }}
              </app-button>
            }
            @if (editable()) {
              <ng-container ngProjectAs="[overflow]">
                @for (s of otherStatuses(); track s) {
                  <button
                    appMenuItem
                    type="button"
                    [disabled]="busy()"
                    (click)="setStatus(s)"
                    [attr.data-testid]="'task-status-' + s"
                  >
                    {{ 'tasks.detail.setStatus.' + s | transloco }}
                  </button>
                }
                <button
                  appMenuItem
                  type="button"
                  [disabled]="busy()"
                  (click)="pending.set('cancel')"
                  data-testid="task-cancel"
                >
                  {{ 'tasks.actions.cancel' | transloco }}
                </button>
              </ng-container>
            }
            @if (task.can_edit && closed()) {
              <app-button primary [loading]="busy()" (click)="reopen()" data-testid="task-reopen">
                {{ 'tasks.actions.reopen' | transloco }}
              </app-button>
            }
            @if (task.can_delete) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                [disabled]="busy()"
                (click)="pending.set('delete')"
                data-testid="task-delete"
              >
                {{ 'tasks.actions.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('summarise')">
              <app-icon name="spark" [size]="15" />
              {{ 'tasks.ai.summarise' | transloco }}
            </button>
            @if (editable()) {
              <button appMenuItem ask type="button" (click)="askAi('suggestChecklist')">
                <app-icon name="spark" [size]="15" />
                {{ 'tasks.ai.suggestChecklist' | transloco }}
              </button>
            }
            <button appMenuItem ask type="button" (click)="askAi('askAbout')">
              <app-icon name="spark" [size]="15" />
              {{ 'tasks.ai.askAbout' | transloco }}
            </button>

            <app-help-strip
              help
              scope="tasks"
              page="detail"
              lesson="working-with-tasks"
              [subject]="task | localizedTitle"
            />

            <app-record-lead record-lead [fillLink]="fillLink()">
              <app-record-status-line status [tone]="line.tone">
                {{
                  line.key
                    | transloco: { date: task.completed_at ? (task.completed_at | localDay) : '' }
                }}
              </app-record-status-line>
              <app-field-item size="lead" [wide]="true" labelKey="tasks.detail.lead.what">
                @if (task.description) {
                  <div
                    class="cf-prose text-body leading-relaxed text-fg"
                    [innerHTML]="task.description | appMarkdown"
                  ></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="tasks.detail.lead.due">
                @if (task.due_at) {
                  <span
                    data-testid="task-due"
                    [class.text-warn-ink]="task.overdue"
                    [class.font-semibold]="task.overdue"
                    >{{ task.due_at | localDay: 'fullDate' }}</span
                  >
                  @if (task.overdue && !closed()) {
                    <span class="block text-meta font-semibold text-warn-ink">{{
                      'tasks.detail.lead.duePassed' | transloco
                    }}</span>
                  }
                }
                @if (task.recurrence_id) {
                  <span
                    class="mt-1 flex items-center gap-1 text-meta text-fg-muted"
                    data-testid="task-repeats"
                  >
                    <app-icon name="history" [size]="13" />
                    @if (series(); as rec) {
                      <app-rule-summary [rrule]="rec.rrule" />
                    } @else {
                      {{ 'tasks.detail.partOfSeries' | transloco }}
                    }
                  </span>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="tasks.detail.lead.assignee">
                @if (task.assignee) {
                  <app-assignee-label [assignee]="task.assignee" />
                }
              </app-field-item>
              <!-- Set when the task is created from a record; not editable, so never "missing". -->
              @if (task.entity_type) {
                <app-field-item size="lead" [wide]="true" labelKey="tasks.detail.lead.record">
                  @if (recordRef(); as ref) {
                    <span class="block text-body" data-testid="task-record">
                      <app-entity-chip
                        class="sm:hidden"
                        [ref]="ref"
                        [statusText]="true"
                        [stacked]="true"
                      />
                      <app-entity-chip class="hidden sm:inline" [ref]="ref" [statusText]="true" />
                    </span>
                  } @else {
                    <span class="text-body text-fg-subtle">{{
                      'tasks.detail.recordUnavailable' | transloco
                    }}</span>
                  }
                </app-field-item>
              }
            </app-record-lead>

            @if (task.checklist.length || editable()) {
              <app-card class="mb-6 block" data-testid="task-checklist">
                <div class="mb-2 flex items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'tasks.checklist.title' | transloco }}
                  </h2>
                  @if (task.checklist.length) {
                    <span class="text-meta text-fg-muted">
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
                          class="min-w-0 flex-1 text-body"
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
                  <p class="text-ui text-fg-subtle">
                    {{ 'tasks.checklist.emptyHint' | transloco }}
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
                      class="h-9 min-w-0 flex-1 rounded-tile border border-border bg-bg px-3 text-body"
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
            }

            <app-record-details [columns]="2" [fillLink]="fillLink()">
              <app-field-item labelKey="tasks.detail.fields.priority">
                <app-badge [tone]="priorityTone(task.priority)">{{
                  priorityKey(task.priority) | transloco
                }}</app-badge>
              </app-field-item>
              <app-field-item labelKey="tasks.detail.fields.start">
                @if (task.start_at) {
                  {{ task.start_at | localDay: 'fullDate' }}
                }
              </app-field-item>
              @if (task.recurrence_id) {
                <app-field-item labelKey="tasks.detail.fields.series" [wide]="true">
                  <span class="flex flex-col gap-0.5" data-testid="task-series">
                    @if (series(); as rec) {
                      <span class="font-semibold"><app-rule-summary [rrule]="rec.rrule" /></span>
                      <span class="text-meta text-fg-muted">
                        @if (!rec.active) {
                          {{ 'tasks.detail.series.paused' | transloco }}
                        } @else if (rec.next_due_at) {
                          {{
                            'tasks.detail.series.next'
                              | transloco: { date: (rec.next_due_at | localDay) }
                          }}
                        } @else {
                          {{ 'tasks.recurring.ended' | transloco }}
                        }
                      </span>
                    } @else {
                      <span>{{ 'tasks.detail.partOfSeries' | transloco }}</span>
                    }
                    <a
                      routerLink="/tasks/recurring"
                      [queryParams]="{ series: task.recurrence_id }"
                      class="text-meta font-semibold text-accent hover:underline"
                      >{{ 'tasks.detail.series.open' | transloco }} →</a
                    >
                  </span>
                </app-field-item>
              }
              <!-- Facts the system records, not fields to fill in: shown only when they apply. -->
              @if (task.status === 'done' && task.completed_at) {
                <app-field-item
                  labelKey="tasks.detail.fields.completed"
                  [value]="task.completed_at | localDate: 'medium'"
                />
              }
              @if (task.escalation_level > 0) {
                <app-field-item
                  labelKey="tasks.detail.fields.escalation"
                  [value]="'tasks.detail.escalated' | transloco: { level: task.escalation_level }"
                />
              }
            </app-record-details>

            <app-record-meta follow-up-meta>
              <app-field-item layout="inline" labelKey="tasks.fields.createdBy">
                {{ task.created_by_name || ('tasks.history.system' | transloco) }}
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="tasks.detail.fields.created"
                [value]="task.created_at | localDate"
              />
              @if (task.updated_at.slice(0, 19) > task.created_at.slice(0, 19)) {
                <app-field-item
                  layout="inline"
                  labelKey="tasks.detail.fields.updated"
                  [value]="task.updated_at | localDate"
                />
              }
            </app-record-meta>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="pending() !== null"
            [title]="
              (pending() === 'delete' ? 'tasks.confirm.deleteTitle' : 'tasks.confirm.cancelTitle')
                | transloco
            "
            [message]="
              (pending() === 'delete' ? 'tasks.confirm.deleteBody' : 'tasks.confirm.cancelBody')
                | transloco: { title: (task | localizedTitle) }
            "
            [confirmLabel]="
              (pending() === 'delete' ? 'tasks.actions.delete' : 'tasks.actions.cancel') | transloco
            "
            [cancelLabel]="'tasks.confirm.keep' | transloco"
            [busy]="busy()"
            (confirmed)="confirmPending()"
            (cancelled)="pending.set(null)"
          />
        }
      }
    }
  `,
})
export class TaskDetailPage {
  private readonly api = inject(TasksApi);
  private readonly kit = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly titles = inject(LocalizedTitleResolver);
  private readonly ask = inject(AskPanelService);

  /** Route param (component input binding). */
  readonly id = input.required<string>();

  protected readonly statusKey = taskStatusKey;
  protected readonly statusTone = taskStatusTone;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly priorityTone = taskPriorityTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly task = signal<TaskDetail | null>(null);
  /** The linked record with its status (resolved through the kit; falls back to the task's ref). */
  private readonly record = signal<EntityChipRef | null>(null);
  /** The recurring series this task is an occurrence of, when the caller can see it. */
  protected readonly series = signal<Recurrence | null>(null);
  protected readonly busy = signal(false);
  protected readonly itemBusy = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly newItem = signal('');
  protected readonly pending = signal<PendingConfirm>(null);

  protected readonly closed = computed(() => isClosedStatus(this.task()?.status));
  protected readonly editable = computed(() => !!this.task()?.can_edit && !this.closed());
  protected readonly otherStatuses = computed<readonly EditableTaskStatus[]>(() =>
    EDITABLE_TASK_STATUSES.filter((s) => s !== this.task()?.status),
  );
  protected readonly statusLine = computed(() => {
    const task = this.task();
    return task ? taskStatusLine(task) : { key: '', tone: 'neutral' as const };
  });
  protected readonly missing = computed<RecordMissingItem[]>(() => {
    const task = this.task();
    return task ? taskMissing(task) : [];
  });
  protected readonly fillLink = computed(() =>
    this.editable() ? ['/tasks', this.id(), 'edit'] : null,
  );
  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => {
    const task = this.task();
    return [
      { labelKey: 'nav.myWork', link: '/my-work' },
      { labelKey: 'tasks.list.title', link: '/tasks' },
      { label: task ? this.titles.resolve(task) : '' },
    ];
  });
  protected readonly recordRef = computed<EntityChipRef | null>(() => {
    const entity = this.task()?.entity;
    if (!entity) {
      return null;
    }
    const resolved = this.record();
    return resolved && resolved.entity_id === entity.entity_id ? resolved : entity;
  });
  protected readonly doneCount = computed(
    () => this.task()?.checklist.filter((i) => i.done).length ?? 0,
  );
  protected readonly checklistPercent = computed(() => {
    const total = this.task()?.checklist.length ?? 0;
    return total ? Math.round((this.doneCount() / total) * 100) : 0;
  });

  private request = new Subscription();
  private extras = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.extras.unsubscribe();
    });
    provideTasksPageContext(() => ({
      module: 'tasks',
      entityType: 'task',
      entityId: this.id(),
      view: 'detail',
      title: this.task() ? this.titles.resolve(this.task()) : null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected edit(): void {
    void this.router.navigate(['/tasks', this.id(), 'edit']);
  }

  protected setStatus(status: EditableTaskStatus): void {
    const current = this.task()?.status;
    if (!current || status === current) {
      return;
    }
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
        title: this.titles.resolve(task),
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
        this.loadExtras(orgId, task);
      },
      error: () => this.state.set('error'),
    });
  }

  /** The linked record's status and the series' rule: nice to have, never blocking. */
  private loadExtras(orgId: string, task: TaskDetail): void {
    this.extras.unsubscribe();
    this.extras = new Subscription();
    this.record.set(null);
    this.series.set(null);
    if (task.entity) {
      this.extras.add(
        this.kit
          .entity(orgId, task.entity.entity_type, task.entity.entity_id)
          .pipe(catchError(() => of(null)))
          .subscribe((ref) => this.record.set(ref)),
      );
    }
    if (task.recurrence_id) {
      const seriesId = task.recurrence_id;
      const scope =
        task.entity_type && task.entity_id
          ? { entity_type: task.entity_type, entity_id: task.entity_id }
          : {};
      this.extras.add(
        this.api
          .listRecurrences(orgId, { ...scope, limit: 200 })
          .pipe(
            map((page) => page.items.find((r) => r.id === seriesId) ?? null),
            catchError(() => of(null)),
          )
          .subscribe((rec) => this.series.set(rec)),
      );
    }
  }
}

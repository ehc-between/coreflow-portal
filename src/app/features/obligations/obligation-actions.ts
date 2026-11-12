import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TASK_PRIORITIES, Task, TaskPriority } from '../../core/tasks/task.models';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AssigneeLabel } from '../../shared/tasks/assignee-label';
import { AssigneeSelect } from '../../shared/tasks/assignee-select';
import {
  decodeAssignee,
  dueAtFromDay,
  isClosedStatus,
  taskPriorityKey,
  taskStatusKey,
  taskStatusTone,
} from '../../shared/tasks/task-display';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { ObligationsApi } from './data/obligations-api';
import { FollowUpIn } from './data/obligation.models';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { obligationErrorKey } from './data/obligation-errors';

/** Task kinds of the module: the scheduled evaluation and follow-up actions. */
export const EVALUATION_TASK_KIND = 'obligation_evaluation';

/** Open tasks first (soonest due first), then closed ones. */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      Number(isClosedStatus(a.status)) - Number(isClosedStatus(b.status)) ||
      (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'),
  );
}

/**
 * The obligation's work (Tasks tab): the scheduled compliance evaluations
 * (kind `obligation_evaluation`, one open at a time) and follow-up actions
 * (`obligation_action`), all platform tasks that show in the assignee's My Work.
 */
@Component({
  selector: 'app-obligation-actions',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    LocalDayPipe,
    AssigneeLabel,
    AssigneeSelect,
    Badge,
    Button,
    FormField,
    Icon,
  ],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-ob-actions-h">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-ob-actions-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'obligations.actions.title' | transloco }}
        </h2>
        @if (canEdit() && !adding()) {
          <app-button
            variant="secondary"
            size="sm"
            (click)="adding.set(true)"
            data-testid="action-add"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'obligations.actions.add' | transloco }}
          </app-button>
        }
      </div>
      <app-field-help scope="obligations" page="detail" field="actions" />

      @if (adding()) {
        <form
          class="my-3 grid grid-cols-1 gap-3 rounded-tile border border-border p-3 sm:grid-cols-2"
          (submit)="$event.preventDefault(); add()"
          data-testid="action-form"
        >
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'obligations.actions.titleLabel' | transloco"
              inputId="cf-oa-title"
            >
              <input
                id="cf-oa-title"
                type="text"
                maxlength="255"
                required
                [value]="title()"
                (input)="title.set($any($event.target).value)"
              />
            </app-form-field>
          </div>
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'obligations.actions.description' | transloco"
              inputId="cf-oa-desc"
            >
              <textarea
                id="cf-oa-desc"
                rows="2"
                maxlength="20000"
                [value]="description()"
                (input)="description.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
          <app-form-field
            [label]="'obligations.actions.assignee' | transloco"
            inputId="cf-oa-assignee"
          >
            <app-assignee-select
              inputId="cf-oa-assignee"
              [value]="assignee()"
              (valueChange)="assignee.set($event)"
            />
          </app-form-field>
          <app-form-field
            [label]="'obligations.actions.priority' | transloco"
            inputId="cf-oa-priority"
          >
            <select id="cf-oa-priority" (change)="priority.set($any($event.target).value)">
              @for (p of priorities; track p) {
                <option [value]="p" [selected]="priority() === p">
                  {{ priorityKey(p) | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'obligations.actions.dueDate' | transloco" inputId="cf-oa-due">
            <input
              id="cf-oa-due"
              type="date"
              [value]="dueDay()"
              (change)="dueDay.set($any($event.target).value)"
            />
          </app-form-field>
          <div class="flex items-end justify-end gap-2">
            <app-button variant="ghost" size="sm" (click)="reset()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              size="sm"
              [disabled]="!title().trim() || busy()"
              [loading]="busy()"
            >
              {{ 'obligations.actions.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @switch (state()) {
        @case ('loading') {
          <p class="text-[13px] text-fg-muted" role="status">
            {{ 'obligations.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="text-[13px] text-fail" role="alert">
            {{ 'obligations.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (tasks().length === 0) {
            <p class="text-[13px] text-fg-muted">{{ 'obligations.actions.none' | transloco }}</p>
          } @else {
            <ul
              class="divide-y divide-border rounded-tile border border-border"
              data-testid="action-rows"
            >
              @for (t of sorted(); track t.id) {
                <li
                  class="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                  [class.opacity-60]="closed(t.status)"
                >
                  <span class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/tasks', t.id]"
                      class="block truncate text-[13.5px] font-semibold text-fg hover:underline"
                    >
                      {{ t.title }}
                    </a>
                    <span class="flex flex-wrap items-center gap-x-3 text-[12px] text-fg-subtle">
                      <span class="inline-flex items-center gap-1">
                        @if (t.kind === evaluationKind) {
                          <app-icon name="history" [size]="12" />
                          {{ 'obligations.actions.kinds.evaluation' | transloco }}
                        } @else {
                          {{ 'obligations.actions.kinds.action' | transloco }}
                        }
                      </span>
                      <app-assignee-label [assignee]="t.assignee" />
                    </span>
                  </span>
                  <span class="flex items-center gap-2 text-[12.5px]">
                    <app-badge [tone]="statusTone(t.status)">{{
                      statusKey(t.status) | transloco
                    }}</app-badge>
                    <span
                      class="w-[100px] text-right"
                      [class.text-fail]="t.overdue"
                      [class.font-semibold]="t.overdue"
                    >
                      @if (t.due_at) {
                        {{ t.due_at | localDay }}
                      } @else {
                        {{ 'obligations.actions.noDue' | transloco }}
                      }
                    </span>
                  </span>
                </li>
              }
            </ul>
          }
        }
      }
    </section>
  `,
})
export class ObligationActions {
  private readonly api = inject(ObligationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly obligationId = input.required<string>();
  readonly canEdit = input(false);
  /** Bump to reload (e.g. after an evaluation created a follow-up). */
  readonly refresh = input(0);
  readonly changed = output<void>();

  protected readonly evaluationKind = EVALUATION_TASK_KIND;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly statusKey = taskStatusKey;
  protected readonly statusTone = taskStatusTone;
  protected readonly closed = isClosedStatus;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly tasks = signal<readonly Task[]>([]);
  protected readonly sorted = computed(() => sortTasks(this.tasks()));

  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly assignee = signal('');
  protected readonly priority = signal<TaskPriority>('normal');
  protected readonly dueDay = signal('');

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.obligationId();
      this.refresh();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reset(): void {
    this.adding.set(false);
    this.title.set('');
    this.description.set('');
    this.assignee.set('');
    this.priority.set('normal');
    this.dueDay.set('');
  }

  protected add(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.title().trim() || this.busy()) {
      return;
    }
    const body: FollowUpIn = {
      title: this.title().trim(),
      description: this.description().trim() || null,
      assignee: decodeAssignee(this.assignee()),
      priority: this.priority(),
      due_at: dueAtFromDay(this.dueDay()),
    };
    this.busy.set(true);
    this.api.addAction(orgId, this.obligationId(), body).subscribe({
      next: () => {
        this.busy.set(false);
        this.reset();
        this.notifications.success('obligations.notices.actionAdded');
        this.load(orgId, this.obligationId());
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.actions(orgId, id).subscribe({
      next: (page) => {
        this.tasks.set(page.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

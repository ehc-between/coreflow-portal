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
import { GuidanceService } from '../../core/guidance/guidance.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AssigneeLabel } from '../../shared/tasks/assignee-label';
import { AssigneeSelect } from '../../shared/tasks/assignee-select';
import { RecurrencePicker } from '../../shared/tasks/recurrence-picker';
import {
  decodeAssignee,
  dueAtFromDay,
  isClosedStatus,
  taskPriorityKey,
  taskStatusKey,
  todayDay,
} from '../../shared/tasks/task-display';
import { Button } from '../../shared/ui/button/button';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ContractsApi } from './data/contracts-api';
import { ObligationCreate } from './data/contract.models';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { contractErrorKey } from './data/contract-errors';
import { DateInput } from '../../shared/ui/date-input/date-input';

/**
 * Contract obligations: platform tasks of kind `contract_obligation` on the
 * contract (deliverables, reports, audits, payments…), one-off or recurring.
 * They show in My Work for the assignee; open ones are cancelled when the
 * contract is deleted, terminated or expired.
 */
@Component({
  selector: 'app-contract-obligations',
  imports: [
    DateInput,
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    LocalDayPipe,
    AssigneeLabel,
    AssigneeSelect,
    RecurrencePicker,

    Button,
    FormField,
    Icon,
    StatusBadge,
  ],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-obligations-h">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="cf-obligations-h"
          class="flex items-center gap-1.5 font-display text-card font-bold text-fg"
        >
          {{ 'contracts.obligations.title' | transloco }}
          @if (!beginner()) {
            <app-field-help scope="contracts" page="detail" field="obligations" />
          }
        </h2>
        @if (canEdit() && !adding()) {
          <app-button
            variant="secondary"
            size="sm"
            (click)="adding.set(true)"
            data-testid="obligation-add"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'contracts.obligations.add' | transloco }}
          </app-button>
        }
      </div>
      @if (beginner()) {
        <app-field-help scope="contracts" page="detail" field="obligations" />
      }

      @if (adding()) {
        <form
          class="my-3 grid grid-cols-1 gap-3 rounded-tile border border-border p-3 sm:grid-cols-2"
          (submit)="$event.preventDefault(); add()"
          data-testid="obligation-form"
        >
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'contracts.obligations.titleLabel' | transloco"
              inputId="cf-ob-title"
            >
              <input
                id="cf-ob-title"
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
              [label]="'contracts.obligations.description' | transloco"
              inputId="cf-ob-desc"
            >
              <textarea
                id="cf-ob-desc"
                rows="2"
                [value]="description()"
                (input)="description.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
          <app-form-field
            [label]="'contracts.obligations.assignee' | transloco"
            inputId="cf-ob-assignee"
          >
            <app-assignee-select
              inputId="cf-ob-assignee"
              [value]="assignee()"
              (valueChange)="assignee.set($event)"
            />
          </app-form-field>
          <app-form-field
            [label]="'contracts.obligations.priority' | transloco"
            inputId="cf-ob-priority"
          >
            <select id="cf-ob-priority" (change)="priority.set($any($event.target).value)">
              @for (p of priorities; track p) {
                <option [value]="p" [selected]="priority() === p">
                  {{ priorityKey(p) | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field
            [label]="
              (recurring() ? 'contracts.obligations.firstDue' : 'contracts.obligations.dueDate')
                | transloco
            "
            inputId="cf-ob-due"
          >
            <app-date-input
              inputId="cf-ob-due"
              [value]="dueDay()"
              (valueChange)="dueDay.set($event ?? '')"
            />
          </app-form-field>
          <label class="flex items-center gap-2 self-end pb-2 text-ui text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="recurring()"
              (change)="recurring.set($any($event.target).checked)"
              data-testid="obligation-recurring"
            />
            {{ 'contracts.obligations.recurring' | transloco }}
          </label>
          @if (recurring()) {
            <div class="sm:col-span-2">
              <app-recurrence-picker [(rrule)]="rrule" idPrefix="cf-ob-rrule" />
            </div>
            <app-form-field
              [label]="'contracts.obligations.leadDays' | transloco"
              inputId="cf-ob-lead"
            >
              <input
                id="cf-ob-lead"
                type="number"
                min="0"
                max="366"
                [value]="leadDays()"
                (input)="leadDays.set(+$any($event.target).value || 0)"
              />
            </app-form-field>
          }
          <div class="flex justify-end gap-2 sm:col-span-2">
            <app-button variant="ghost" size="sm" (click)="reset()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              size="sm"
              [disabled]="!title().trim() || busy()"
              [loading]="busy()"
            >
              {{ 'contracts.obligations.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @switch (state()) {
        @case ('loading') {
          <p class="text-ui text-fg-muted" role="status">
            {{ 'contracts.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="text-ui text-fail" role="alert">
            {{ 'contracts.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (tasks().length === 0) {
            <p class="text-ui text-fg-muted">{{ 'contracts.obligations.none' | transloco }}</p>
          } @else {
            <ul class="divide-y divide-border rounded-tile border border-border">
              @for (t of sorted(); track t.id) {
                <li
                  class="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                  [class.opacity-60]="closed(t.status)"
                >
                  <span class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/tasks', t.id]"
                      class="block truncate text-ui font-semibold text-fg hover:underline"
                    >
                      {{ t.title }}
                    </a>
                    <span class="flex flex-wrap items-center gap-x-3 text-meta text-fg-subtle">
                      @if (t.recurrence_id) {
                        <span class="inline-flex items-center gap-1">
                          <app-icon name="history" [size]="12" />
                          {{ 'contracts.obligations.recurringBadge' | transloco }}
                        </span>
                      }
                      <app-assignee-label [assignee]="t.assignee" />
                    </span>
                  </span>
                  <span class="flex items-center gap-2 text-meta">
                    <app-status-badge
                      meaning="lifecycle"
                      [value]="t.overdue ? 'overdue' : t.status"
                      [labelKey]="statusKey(t.status)"
                    />
                    <span
                      class="w-[100px] text-right"
                      [class.text-fail]="t.overdue"
                      [class.font-semibold]="t.overdue"
                    >
                      @if (t.due_at) {
                        {{ t.due_at | localDay }}
                      } @else {
                        {{ 'contracts.obligations.noDue' | transloco }}
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
export class ContractObligations {
  protected readonly beginner = inject(GuidanceService).isBeginner;
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly contractId = input.required<string>();
  readonly canEdit = input(false);
  /** Bump to reload (e.g. after the AI panel added obligations). */
  readonly refresh = input(0);
  readonly changed = output<void>();

  protected readonly priorities = TASK_PRIORITIES;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly statusKey = taskStatusKey;
  protected readonly closed = isClosedStatus;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly tasks = signal<readonly Task[]>([]);
  protected readonly sorted = computed(() =>
    [...this.tasks()].sort(
      (a, b) =>
        Number(isClosedStatus(a.status)) - Number(isClosedStatus(b.status)) ||
        (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'),
    ),
  );

  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly assignee = signal('');
  protected readonly priority = signal<TaskPriority>('normal');
  protected readonly dueDay = signal('');
  protected readonly recurring = signal(false);
  protected readonly rrule = signal('FREQ=MONTHLY');
  protected readonly leadDays = signal(7);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.contractId();
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
    this.recurring.set(false);
    this.rrule.set('FREQ=MONTHLY');
    this.leadDays.set(7);
  }

  protected add(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.title().trim() || this.busy()) {
      return;
    }
    const day = this.dueDay();
    const body: ObligationCreate = {
      title: this.title().trim(),
      description: this.description().trim() || null,
      assignee: decodeAssignee(this.assignee()),
      priority: this.priority(),
      due_at: this.recurring() ? null : dueAtFromDay(day),
      recurrence: this.recurring()
        ? {
            rrule: this.rrule(),
            dtstart: dueAtFromDay(day || todayDay()) ?? `${todayDay()}T23:59:59`,
            lead_days: this.leadDays(),
          }
        : null,
    };
    this.busy.set(true);
    this.api.addObligation(orgId, this.contractId(), body).subscribe({
      next: () => {
        this.busy.set(false);
        this.reset();
        this.notifications.success('contracts.notices.obligationAdded');
        this.load(orgId, this.contractId());
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(contractErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.obligations(orgId, id).subscribe({
      next: (page) => {
        this.tasks.set(page.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

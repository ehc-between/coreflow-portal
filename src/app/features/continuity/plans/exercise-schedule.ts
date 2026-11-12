import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { RecurrencePicker } from '../../../shared/tasks/recurrence-picker';
import { decodeAssignee, startOfDay } from '../../../shared/tasks/task-display';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { ContinuityApi } from '../data/continuity-api';
import { todayIso } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { PlanDetail } from '../data/continuity.models';

/**
 * The recurring exercise schedule of a plan: shows whether one is active and when the
 * next exercise is due, and (with write access) sets one up as a recurring platform
 * task (`POST plans/{id}/exercise-schedule`), assigned to the plan owner by default.
 */
@Component({
  selector: 'app-plan-exercise-schedule',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    Alert,
    AssigneeSelect,
    Badge,
    Button,
    Card,
    FieldHelp,
    FormField,
    RecurrencePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = plan();
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-1">
          <h2 class="font-display text-[15px] font-bold text-fg">
            {{ 'continuity.schedule.title' | transloco }}
          </h2>
          <app-field-help scope="continuity" page="planDetail" field="exercise_schedule" />
        </div>
        @if (p.exercise_schedule_active) {
          <app-badge tone="pass">{{ 'continuity.schedule.active' | transloco }}</app-badge>
        } @else {
          <app-badge tone="warn">{{ 'continuity.schedule.none' | transloco }}</app-badge>
        }
      </div>
      <p class="text-[13px] text-fg-muted">
        @if (p.next_exercise_due_at) {
          {{
            'continuity.schedule.nextDue' | transloco: { date: (p.next_exercise_due_at | localDay) }
          }}
        } @else {
          {{ 'continuity.schedule.noneHint' | transloco }}
        }
      </p>
      @if (canEdit() && !formOpen()) {
        <div class="mt-3">
          <app-button size="sm" variant="secondary" (click)="formOpen.set(true)">
            {{
              (p.exercise_schedule_active
                ? 'continuity.schedule.addAnother'
                : 'continuity.schedule.setUp'
              ) | transloco
            }}
          </app-button>
        </div>
      }
      @if (formOpen()) {
        <form
          class="mt-3 flex flex-col gap-3 border-t border-border pt-3"
          (submit)="$event.preventDefault(); save()"
          novalidate
        >
          <app-recurrence-picker [(rrule)]="rrule" idPrefix="plan-sched" />
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-form-field
              [label]="'continuity.schedule.firstDue' | transloco"
              inputId="plan-sched-start"
            >
              <input
                id="plan-sched-start"
                type="date"
                required
                [min]="today"
                [value]="start()"
                (input)="start.set($any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              [label]="'continuity.schedule.leadDays' | transloco"
              inputId="plan-sched-lead"
            >
              <input
                id="plan-sched-lead"
                type="number"
                min="0"
                max="366"
                [value]="leadDays()"
                (input)="leadDays.set($any($event.target).value)"
              />
            </app-form-field>
            <div class="sm:col-span-2">
              <app-form-field
                [label]="'continuity.schedule.assignee' | transloco"
                inputId="plan-sched-assignee"
              >
                <app-assignee-select
                  inputId="plan-sched-assignee"
                  [value]="assignee()"
                  (valueChange)="assignee.set($event)"
                />
              </app-form-field>
              <p class="mt-1 text-[12px] text-fg-subtle">
                {{ 'continuity.schedule.assigneeHint' | transloco }}
              </p>
            </div>
          </div>
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div class="flex justify-end gap-2">
            <app-button variant="ghost" (click)="formOpen.set(false)">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button type="submit" [loading]="busy()" [disabled]="!start()">
              {{ 'continuity.schedule.save' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-card>
  `,
})
export class PlanExerciseSchedule {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly plan = input.required<PlanDetail>();
  readonly canEdit = input(false);
  readonly scheduled = output<void>();

  protected readonly today = todayIso();
  protected readonly formOpen = signal(false);
  protected readonly rrule = signal('FREQ=YEARLY');
  protected readonly start = signal('');
  protected readonly leadDays = signal('14');
  protected readonly assignee = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy() || !this.start()) {
      return;
    }
    const lead = Number.parseInt(this.leadDays(), 10);
    this.busy.set(true);
    this.error.set(null);
    this.api
      .scheduleExercises(orgId, this.plan().id, {
        rrule: this.rrule(),
        dtstart: startOfDay(this.start()),
        lead_days: Number.isFinite(lead) ? Math.min(Math.max(lead, 0), 366) : 14,
        assignee: decodeAssignee(this.assignee()),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.formOpen.set(false);
          this.notifications.success('continuity.schedule.saved');
          this.scheduled.emit();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(continuityErrorKey(err));
        },
      });
  }
}

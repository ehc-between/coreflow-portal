import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { RecurrencePicker } from '../../../shared/tasks/recurrence-picker';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { dayKey } from '../data/report-display';
import { reportErrorKey } from '../data/report-errors';
import { ReportDefinition, ScheduleRequest } from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';

/** `user:<id>` / `role:<key>` / `department:<id>` as the schedule body's assignee fields. */
export function assigneeFields(
  encoded: string,
): Pick<ScheduleRequest, 'assignee_type' | 'assignee_value'> {
  const match = /^(user|role|department):(.+)$/.exec(encoded);
  return match
    ? { assignee_type: match[1] as 'user' | 'role' | 'department', assignee_value: match[2] }
    : {};
}

/**
 * Schedules a saved report as a recurring platform task ("Run report: …"),
 * assigned to the caller by default, due on each occurrence and shown
 * `lead_days` before it.
 */
@Component({
  selector: 'app-schedule-dialog',
  imports: [
    TranslocoPipe,
    FieldHelp,
    AssigneeSelect,
    RecurrencePicker,
    Alert,
    Button,
    FormField,
    SlideOver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'reports.schedule.title' | transloco"
      [subtitle]="definition()?.name ?? ''"
      [closeLabel]="'reports.common.close' | transloco"
      [width]="520"
      (closed)="closed.emit()"
    >
      @if (open()) {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()" novalidate>
          <p class="text-[13px] text-fg-muted">{{ 'reports.schedule.intro' | transloco }}</p>
          <app-recurrence-picker [(rrule)]="rrule" idPrefix="report-schedule" />
          <div class="grid gap-3 sm:grid-cols-2">
            <app-form-field [label]="'reports.schedule.start' | transloco" inputId="sched-start">
              <input
                id="sched-start"
                type="date"
                required
                [value]="start()"
                (change)="start.set($any($event.target).value)"
              />
            </app-form-field>
            <div>
              <app-form-field
                [label]="'reports.schedule.leadDays' | transloco"
                inputId="sched-lead"
              >
                <input
                  id="sched-lead"
                  type="number"
                  min="0"
                  max="366"
                  [value]="leadDays()"
                  (change)="leadDays.set(+$any($event.target).value)"
                />
              </app-form-field>
              <app-field-help
                class="mt-1 block"
                scope="reports"
                page="definitionDetail"
                field="leadDays"
              />
            </div>
          </div>
          <app-form-field
            [label]="'reports.schedule.assignee' | transloco"
            inputId="sched-assignee"
          >
            <app-assignee-select
              inputId="sched-assignee"
              [value]="assignee()"
              (valueChange)="assignee.set($event)"
            />
          </app-form-field>
          <p class="-mt-2 text-[11.5px] text-fg-subtle">
            {{ 'reports.schedule.assigneeHint' | transloco }}
          </p>
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div class="flex justify-end gap-2">
            <app-button variant="ghost" (click)="closed.emit()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()" [disabled]="!start()">
              {{ 'reports.schedule.submit' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-slide-over>
  `,
})
export class ScheduleDialog {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly open = input(false);
  readonly definition = input<ReportDefinition | null>(null);
  readonly closed = output<void>();
  readonly scheduled = output<void>();

  protected readonly rrule = signal('FREQ=MONTHLY');
  protected readonly start = signal(dayKey(new Date()));
  protected readonly leadDays = signal(3);
  protected readonly assignee = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.definition();
    if (!orgId || !d || !this.start() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const lead = Number.isFinite(this.leadDays()) ? Math.max(0, Math.min(366, this.leadDays())) : 3;
    this.api
      .scheduleDefinition(orgId, d.id, {
        rrule: this.rrule(),
        dtstart: `${this.start()}T08:00:00`,
        lead_days: lead,
        ...assigneeFields(this.assignee()),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.scheduled.emit();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(reportErrorKey(error));
        },
      });
  }
}

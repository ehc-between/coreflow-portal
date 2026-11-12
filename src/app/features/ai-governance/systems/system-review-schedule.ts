import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { RecurrencePicker } from '../../../shared/tasks/recurrence-picker';
import { startOfDay, todayDay } from '../../../shared/tasks/task-display';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { ReviewScheduleResult } from '../data/ai-governance.models';
import { AI_GOVERNANCE_SCOPE } from '../data/ai-governance-display';
import { AiUserSelect } from '../ui/user-select';

/**
 * Schedules the recurring post-market review of an AI system (Art. 72,
 * ISO/IEC 42001 9.1) as a recurring platform task.
 */
@Component({
  selector: 'app-ai-system-review-schedule',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    LocalDayPipe,
    RecurrencePicker,
    Button,
    Card,
    AiUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-card>
      <h2 class="mb-1 flex items-center gap-2 font-display text-[15px] font-bold text-fg">
        {{ 'aiGovernance.review.title' | transloco }}
        <app-field-help [scope]="scope" page="systemDetail" field="review" />
      </h2>
      <p class="mb-3 text-[12.5px] text-fg-muted">{{ 'aiGovernance.review.body' | transloco }}</p>
      @if (created(); as c) {
        <p class="mb-3 rounded-tile bg-pass-soft px-3 py-2 text-[13px] text-fg" role="status">
          {{ 'aiGovernance.review.created' | transloco }}
          @if (c.due_at) {
            {{ 'aiGovernance.review.firstDue' | transloco: { date: (c.due_at | localDay) } }}
          }
          <a
            [routerLink]="['/tasks', c.task_id]"
            class="ml-1 font-semibold text-accent hover:underline"
          >
            {{ 'aiGovernance.review.openTask' | transloco }}
          </a>
        </p>
      }
      @if (canWrite()) {
        @if (open()) {
          <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); save()">
            <app-recurrence-picker [(rrule)]="rrule" idPrefix="ai-review-rrule" />
            <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
              {{ 'aiGovernance.review.startAt' | transloco }}
              <input
                type="date"
                required
                class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
                [value]="start()"
                (input)="start.set($any($event.target).value)"
              />
            </label>
            <label
              class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted"
              for="ai-review-assignee"
            >
              {{ 'aiGovernance.review.assignee' | transloco }}
            </label>
            <app-ai-user-select
              class="-mt-2"
              selectId="ai-review-assignee"
              noneKey="aiGovernance.review.defaultAssignee"
              [(value)]="assignee"
            />
            <div class="flex justify-end gap-2">
              <app-button size="sm" variant="ghost" (click)="open.set(false)">{{
                'aiGovernance.common.cancel' | transloco
              }}</app-button>
              <app-button size="sm" type="submit" [disabled]="!start()" [loading]="saving()">
                {{ 'aiGovernance.review.save' | transloco }}
              </app-button>
            </div>
          </form>
        } @else {
          <app-button size="sm" variant="secondary" (click)="open.set(true)">
            {{ 'aiGovernance.review.schedule' | transloco }}
          </app-button>
        }
      }
    </app-card>
  `,
})
export class AiSystemReviewSchedule {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly systemId = input.required<string>();
  readonly canWrite = input(false);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly open = signal(false);
  protected readonly rrule = signal('FREQ=MONTHLY;INTERVAL=3');
  protected readonly start = signal(todayDay());
  protected readonly assignee = signal('');
  protected readonly saving = signal(false);
  protected readonly created = signal<ReviewScheduleResult | null>(null);

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.start() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api
      .scheduleReview(orgId, this.systemId(), {
        rrule: this.rrule(),
        start_at: startOfDay(this.start()),
        assignee_user_id: this.assignee() || null,
      })
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.open.set(false);
          this.created.set(result);
          this.notifications.success('aiGovernance.review.created');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.notifications.error(aiGovernanceErrorKey(err));
        },
      });
  }
}

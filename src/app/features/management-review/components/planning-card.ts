import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { Planning } from '../data/management-review.models';
import { reviewStatusKey } from '../management-review-display';

/**
 * "Where do we stand?" for management reviews: the last signed review, the next
 * one and when it is due under the organisation's review interval. Overdue and
 * due-soon read as a to-do (amber), never as a failure; "Planlegg neste
 * gjennomgang" appears when nothing is planned yet.
 */
@Component({
  selector: 'app-mr-planning-card',
  imports: [RouterLink, TranslocoPipe, LocalDatePipe, LocalDayPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let p = planning();
    <section
      class="flex flex-col gap-3 rounded-card border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:gap-6"
      [class]="attention() ? 'border-warn/40' : 'border-border'"
      [attr.aria-label]="'managementReview.planning.label' | transloco"
      data-testid="mr-planning"
    >
      <span
        class="hidden h-10 w-10 flex-none items-center justify-center rounded-full sm:flex"
        [class]="attention() ? 'bg-warn-soft text-warn-ink' : 'bg-accent-soft text-accent'"
        aria-hidden="true"
      >
        <app-icon name="calendar" [size]="18" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-card font-bold text-fg" [class.text-warn-ink]="attention()">
          {{ headlineKey() | transloco: { date: (p.next_due_on | localDay), days: absDays() } }}
        </p>
        <p class="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-meta text-fg-muted">
          @if (p.last_signed; as last) {
            <span>
              {{ 'managementReview.planning.lastSigned' | transloco }}
              <a [routerLink]="last.url" class="font-semibold text-accent hover:underline">{{
                last.code
              }}</a>
              · {{ last.held_at || last.signed_at | localDate: 'mediumDate' }}
            </span>
          } @else {
            <span>{{ 'managementReview.planning.noneSigned' | transloco }}</span>
          }
          @if (p.upcoming; as next) {
            <span>
              {{ 'managementReview.planning.upcoming' | transloco }}
              <a [routerLink]="next.url" class="font-semibold text-accent hover:underline">{{
                next.code
              }}</a>
              · {{ statusKey(next.status) | transloco }}
              @if (next.scheduled_at) {
                · {{ next.scheduled_at | localDate }}
              }
            </span>
          }
          <span>{{
            'managementReview.planning.interval' | transloco: { months: p.interval_months }
          }}</span>
        </p>
      </div>
      @if (showPlan()) {
        <app-button
          size="sm"
          [variant]="attention() ? 'primary' : 'secondary'"
          (click)="plan.emit()"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'managementReview.planning.plan' | transloco }}
        </app-button>
      }
    </section>
  `,
})
export class PlanningCard {
  readonly planning = input.required<Planning>();
  readonly plan = output<void>();

  protected readonly statusKey = reviewStatusKey;

  /** Overdue / due soon without a planned review, or never held: needs action. */
  protected readonly attention = computed(() => {
    const p = this.planning();
    return (
      (p.status === 'overdue' || p.status === 'due_soon' || p.status === 'never') && !p.upcoming
    );
  });
  protected readonly showPlan = computed(
    () => this.planning().can_plan && !this.planning().upcoming,
  );

  protected readonly headlineKey = computed(() => {
    const p = this.planning();
    if (p.status === 'never' && !p.upcoming) {
      return 'managementReview.planning.headline.never';
    }
    if (!p.next_due_on) {
      return 'managementReview.planning.headline.planned';
    }
    return `managementReview.planning.headline.${p.status === 'overdue' ? 'overdue' : 'due'}`;
  });

  protected readonly absDays = computed(() => Math.abs(this.planning().days_until_due ?? 0));
}

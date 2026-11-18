import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import { checksProgress, screeningProgress } from '../data/recruitment-display';
import { ApplicationSummary, CLOSED_STAGES } from '../data/recruitment.models';

/**
 * Small progress markers for an application on the board and in lists: screening
 * against the criteria (x/y, or "overstyrt" when moved on with a logged reason),
 * required checks done (x/y), submitted scorecards, days in the stage and a
 * "står stille" warning. Text, not colour alone, carries each state.
 */
@Component({
  selector: 'app-application-indicators',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta' },
  template: `
    @let a = app();
    @if (screening(); as s) {
      <span
        class="inline-flex items-center gap-1"
        [class]="screeningClass()"
        [title]="'recruitment.indicators.screeningTitle' | transloco: s"
        data-testid="ind-screening"
      >
        <app-icon [name]="s.done === s.total ? 'checkcircle' : 'target'" [size]="12" />
        @if (a.screening_overridden) {
          {{ 'recruitment.indicators.screeningOverridden' | transloco }}
        } @else {
          {{ 'recruitment.indicators.screening' | transloco: s }}
        }
      </span>
    }
    @if (checks(); as c) {
      <span
        class="inline-flex items-center gap-1"
        [class]="c.done === c.total ? 'text-pass-ink' : 'text-fg-muted'"
        [title]="'recruitment.indicators.checksTitle' | transloco: c"
        data-testid="ind-checks"
      >
        <app-icon name="shield" [size]="12" />
        {{ 'recruitment.indicators.checks' | transloco: c }}
      </span>
    }
    @if ((a.scorecards_submitted ?? 0) > 0) {
      <span class="inline-flex items-center gap-1 text-fg-muted" data-testid="ind-scorecards">
        <app-icon name="comment" [size]="12" />
        {{ 'recruitment.indicators.scorecards' | transloco: { count: a.scorecards_submitted } }}
      </span>
    }
    @if (a.stalled && !closed()) {
      <span
        class="inline-flex items-center gap-1 font-semibold text-warn-ink"
        data-testid="ind-stalled"
      >
        <app-icon name="clock" [size]="12" />
        {{ 'recruitment.indicators.stalled' | transloco: { count: a.days_in_stage ?? 0 } }}
      </span>
    } @else if (a.days_in_stage !== undefined && !closed()) {
      <span class="text-fg-subtle">
        {{
          (a.days_in_stage === 1
            ? 'recruitment.indicators.dayInStage'
            : 'recruitment.indicators.daysInStage'
          ) | transloco: { count: a.days_in_stage }
        }}
      </span>
    }
  `,
})
export class ApplicationIndicators {
  readonly app = input.required<ApplicationSummary>();

  protected readonly screening = computed(() => screeningProgress(this.app()));
  protected readonly checks = computed(() => checksProgress(this.app()));
  protected readonly closed = computed(() => CLOSED_STAGES.includes(this.app().stage));
  /** Unfinished screening only matters once the candidate is past the screening stage. */
  protected readonly screeningClass = computed(() => {
    const a = this.app();
    const s = this.screening();
    if (!s) {
      return 'text-fg-muted';
    }
    if (s.done === s.total) {
      return 'text-pass-ink';
    }
    const past = !['applied', 'screening', 'rejected', 'withdrawn'].includes(a.stage);
    return past && !a.screening_overridden ? 'font-semibold text-warn-ink' : 'text-fg-muted';
  });
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { npsLevel, percentOf, questionTypeKey, round1, scoreLevel } from '../data/feedback-display';
import { QuestionResult, SurveyResults } from '../data/feedback.models';

export interface DistributionRow {
  readonly label: string;
  /** Translate `label` (yes / no) rather than show it as is. */
  readonly labelIsKey: boolean;
  readonly count: number;
  readonly percent: number;
}

/** Bars for one question's answer distribution, in the server's order. */
export function distributionRows(q: QuestionResult): DistributionRow[] {
  const entries = Object.entries(q.distribution);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return entries.map(([label, count]) => ({
    label: q.type === 'yes_no' ? `feedback.answer.${label}` : label,
    labelIsKey: q.type === 'yes_no',
    count,
    percent: percentOf(count, total),
  }));
}

/**
 * Survey results: response count, average score, NPS with the promoter / passive /
 * detractor split, and per question an answer distribution (bars with counts as
 * text, so nothing relies on colour alone) or the latest comments.
 */
@Component({
  selector: 'app-survey-results',
  imports: [TranslocoPipe, LocalDatePipe, LocalNumberPipe, KpiTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = results();
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <app-kpi-tile
        noLink="shownBelow"
        [label]="'feedback.results.responses' | transloco"
        [value]="r.response_count"
      />
      <app-kpi-tile
        noLink="average"
        [label]="'feedback.results.averageScore' | transloco"
        [value]="score() ?? '–'"
        [tone]="scoreLevel(r.average_score)"
        [delta]="'feedback.results.scoreHint' | transloco"
        deltaTone="neutral"
      />
      <app-kpi-tile
        noLink="average"
        [label]="'feedback.results.nps' | transloco"
        [value]="nps() ?? '–'"
        [delta]="
          'feedback.results.splitDelta'
            | transloco: { promoters: r.promoters, passives: r.passives, detractors: r.detractors }
        "
        [tone]="npsLevel(r.nps)"
      />
      <app-kpi-tile
        noLink="average"
        [label]="'feedback.results.promoters' | transloco"
        [value]="promoterShare()"
        tone="pass"
      />
    </div>
    <p class="mt-2 text-meta text-fg-muted">{{ 'feedback.results.scales' | transloco }}</p>
    @if (r.last_response_at) {
      <p class="mt-1 text-meta text-fg-subtle">
        {{
          'feedback.results.lastResponse' | transloco: { date: (r.last_response_at | localDate) }
        }}
      </p>
    }

    @if (r.response_count === 0) {
      <p class="mt-4 text-ui text-fg-muted" data-testid="results-empty">
        {{ 'feedback.results.none' | transloco }}
      </p>
    } @else {
      <ol class="mt-5 flex flex-col gap-5" data-testid="results-questions">
        @for (q of r.questions; track q.id; let i = $index) {
          <li>
            <h3 class="text-body font-semibold text-fg">
              <span class="text-fg-subtle">{{ i + 1 }}.</span> {{ q.label }}
            </h3>
            <p class="mb-2 text-meta text-fg-subtle">
              {{ typeKey(q.type) | transloco }} ·
              {{ 'feedback.results.answered' | transloco: { count: q.answered } }}
              @if (q.average !== null) {
                ·
                {{
                  'feedback.results.average'
                    | transloco: { value: (q.average | localNumber: '1.0-1') }
                }}
              }
              @if (q.nps !== null) {
                ·
                {{
                  'feedback.results.npsValue' | transloco: { value: (q.nps | localNumber: '1.0-0') }
                }}
              }
            </p>
            @if (q.type === 'text') {
              @if (q.comments.length) {
                <ul class="flex flex-col gap-1.5">
                  @for (c of q.comments; track $index) {
                    <li
                      class="rounded-tile bg-surface-2 px-3 py-2 text-ui whitespace-pre-line text-fg"
                    >
                      {{ c }}
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-meta text-fg-muted">
                  {{ 'feedback.results.noComments' | transloco }}
                </p>
              }
            } @else {
              <ul class="flex flex-col gap-1">
                @for (row of rows(q); track row.label) {
                  <li
                    class="grid grid-cols-[minmax(48px,auto)_1fr_72px] items-center gap-2 text-meta"
                  >
                    <span class="truncate text-fg">{{
                      row.labelIsKey ? (row.label | transloco) : row.label
                    }}</span>
                    <span
                      class="h-2.5 overflow-hidden rounded-full bg-surface-2"
                      aria-hidden="true"
                    >
                      <span
                        class="block h-full rounded-full bg-accent"
                        [style.width.%]="row.percent"
                      ></span>
                    </span>
                    <span class="text-right text-fg-muted"
                      >{{ row.count }} ({{ row.percent }}%)</span
                    >
                  </li>
                }
              </ul>
            }
          </li>
        }
      </ol>
    }
  `,
})
export class SurveyResultsView {
  readonly results = input.required<SurveyResults>();

  protected readonly typeKey = questionTypeKey;
  protected readonly npsLevel = npsLevel;
  protected readonly scoreLevel = scoreLevel;
  protected readonly rows = distributionRows;
  protected readonly score = computed(() => round1(this.results().average_score));
  protected readonly nps = computed(() => round1(this.results().nps));
  /** Promoters as a share of NPS answers, e.g. "40%". */
  protected readonly promoterShare = computed(() => {
    const r = this.results();
    const total = r.promoters + r.passives + r.detractors;
    return total ? `${percentOf(r.promoters, total)}%` : '–';
  });
}

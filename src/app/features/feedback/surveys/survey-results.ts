import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { npsLevel, percentOf, questionTypeKey, round1, scoreLevel } from '../data/feedback-display';
import { NPS_GROUPS, NpsGroup, QuestionResult, SurveyResults } from '../data/feedback.models';

export interface DistributionRow {
  /** The results distribution key (the answer filter's `value`). */
  readonly key: string;
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
  return entries.map(([key, count]) => ({
    key,
    label: q.type === 'yes_no' ? `feedback.answer.${key}` : key,
    labelIsKey: q.type === 'yes_no',
    count,
    percent: percentOf(count, total),
  }));
}

/** A count in the results the answers table can be opened on. */
export type ResultsDrill =
  | { readonly kind: 'all' }
  | { readonly kind: 'answer'; readonly question: QuestionResult; readonly row: DistributionRow }
  | { readonly kind: 'nps'; readonly group: NpsGroup };

/**
 * Survey results: response count, average score, NPS with the promoter / passive /
 * detractor split, and per question an answer distribution (bars with counts as
 * text, so nothing relies on colour alone) or the latest comments. Every count
 * opens the answers behind it (`drill`); the averages are not lists.
 */
@Component({
  selector: 'app-survey-results',
  imports: [TranslocoPipe, LocalDatePipe, LocalNumberPipe, KpiTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = results();
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button
        type="button"
        class="block w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        (click)="drill.emit({ kind: 'all' })"
        data-testid="results-responses"
      >
        <app-kpi-tile
          [label]="'feedback.results.responses' | transloco"
          [value]="r.response_count"
          [delta]="'feedback.results.openAnswers' | transloco"
          deltaTone="neutral"
        />
      </button>
      <app-kpi-tile
        [label]="'feedback.results.averageScore' | transloco"
        [value]="score() ?? '–'"
        [tone]="scoreLevel(r.average_score)"
        [delta]="'feedback.results.scoreHint' | transloco"
        deltaTone="neutral"
      />
      <app-kpi-tile
        [label]="'feedback.results.nps' | transloco"
        [value]="nps() ?? '–'"
        [delta]="'feedback.results.npsHint' | transloco"
        deltaTone="neutral"
        [tone]="npsLevel(r.nps)"
      />
      <button
        type="button"
        class="block w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-default"
        [disabled]="!r.promoters"
        (click)="drill.emit({ kind: 'nps', group: 'promoter' })"
        data-testid="results-promoters"
      >
        <app-kpi-tile
          [label]="'feedback.results.promoters' | transloco"
          [value]="promoterShare()"
          [delta]="'feedback.results.ofNpsAnswers' | transloco: { count: r.promoters }"
          deltaTone="neutral"
          tone="pass"
        />
      </button>
    </div>
    @if (npsTotal()) {
      <p
        class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta"
        data-testid="results-nps-split"
      >
        @for (g of npsGroups; track g) {
          <button
            type="button"
            class="font-semibold text-accent hover:underline disabled:font-normal disabled:text-fg-muted disabled:no-underline"
            [disabled]="!groupCount(g)"
            (click)="drill.emit({ kind: 'nps', group: g })"
            [attr.data-testid]="'results-nps-' + g"
          >
            {{ 'feedback.results.npsGroups.' + g | transloco: { count: groupCount(g) } }}
          </button>
        }
      </p>
    }
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
                @for (row of rows(q); track row.key) {
                  <li>
                    @if (row.count) {
                      <button
                        type="button"
                        class="grid w-full grid-cols-[minmax(48px,auto)_1fr_72px] items-center gap-2 rounded-tile px-1 py-0.5 text-left text-meta hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        (click)="drill.emit({ kind: 'answer', question: q, row })"
                        [attr.aria-label]="
                          'feedback.results.rowLabel'
                            | transloco
                              : {
                                  label: row.labelIsKey ? (row.label | transloco) : row.label,
                                  count: row.count,
                                }
                        "
                        [attr.data-testid]="'results-row-' + q.id + '-' + row.key"
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
                        <span class="text-right font-semibold text-accent"
                          >{{ row.count }} ({{ row.percent }}%)</span
                        >
                      </button>
                    } @else {
                      <div
                        class="grid grid-cols-[minmax(48px,auto)_1fr_72px] items-center gap-2 px-1 py-0.5 text-meta"
                      >
                        <span class="truncate text-fg">{{
                          row.labelIsKey ? (row.label | transloco) : row.label
                        }}</span>
                        <span
                          class="h-2.5 overflow-hidden rounded-full bg-surface-2"
                          aria-hidden="true"
                        ></span>
                        <span class="text-right text-fg-muted">0 (0%)</span>
                      </div>
                    }
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
  /** A count was chosen: show the answers behind it. */
  readonly drill = output<ResultsDrill>();

  protected readonly typeKey = questionTypeKey;
  protected readonly npsLevel = npsLevel;
  protected readonly scoreLevel = scoreLevel;
  protected readonly rows = distributionRows;
  protected readonly npsGroups = NPS_GROUPS;
  protected readonly score = computed(() => round1(this.results().average_score));
  protected readonly nps = computed(() => round1(this.results().nps));
  protected readonly npsTotal = computed(() => {
    const r = this.results();
    return r.promoters + r.passives + r.detractors;
  });
  /** Promoters as a share of NPS answers, e.g. "40%". */
  protected readonly promoterShare = computed(() => {
    const total = this.npsTotal();
    return total ? `${percentOf(this.results().promoters, total)}%` : '–';
  });

  protected groupCount(group: NpsGroup): number {
    const r = this.results();
    return group === 'promoter' ? r.promoters : group === 'passive' ? r.passives : r.detractors;
  }
}

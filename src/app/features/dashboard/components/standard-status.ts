import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import {
  frameworkShortKey,
  hasJourney,
  journeyUrl,
  splitUrl,
  trendParams,
} from '../data/home-format';
import { FrameworkStatus, JourneySummary } from '../data/home.models';

/**
 * One enabled standard on the home page: its requirement coverage (an accent bar,
 * never red: low coverage is a to-do), how many requirements are documented, the
 * 30-day trend, the three most important gaps and the way to the full list. When
 * a guided journey exists for the standard, the card links to it.
 */
@Component({
  selector: 'app-standard-status',
  imports: [RouterLink, TranslocoPipe, Icon, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let fw = status();
    <article
      class="flex h-full flex-col rounded-card border border-border bg-surface p-5 shadow-card"
      data-testid="standard-status"
      [attr.aria-labelledby]="'std-' + fw.framework"
    >
      <header class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 [id]="'std-' + fw.framework" class="font-display text-card font-bold text-fg">
            {{ shortKey() | transloco }}
          </h3>
          <p class="mt-0.5 text-meta text-fg-subtle">
            {{ 'home.standards.' + fw.framework + '.name' | transloco }}
          </p>
        </div>
        <p class="flex-none text-right">
          <span class="font-display text-section font-bold text-fg">{{ fw.score }} %</span>
          <span class="block text-micro text-fg-subtle">{{
            'home.status.coverage' | transloco
          }}</span>
        </p>
      </header>

      <div class="mt-3">
        <app-progress-bar
          [value]="fw.score"
          [label]="
            'home.status.coverageLabel'
              | transloco: { standard: (shortKey() | transloco), score: fw.score }
          "
        />
        <p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted">
          <span>{{
            'home.status.covered' | transloco: { covered: fw.covered, applicable: fw.applicable }
          }}</span>
          @if (trend(); as tr) {
            <span aria-hidden="true">·</span>
            <span [class.text-pass-ink]="fw.trend_30d > 0">{{
              tr.key | transloco: { points: tr.points }
            }}</span>
          }
        </p>
      </div>

      @if (fw.top_gaps.length) {
        <div class="mt-4">
          <p class="text-meta font-semibold text-fg-muted">
            {{ 'home.status.topGaps' | transloco }}
          </p>
          <ul class="mt-1.5 flex flex-col gap-1" data-testid="standard-gaps">
            @for (gap of gaps(); track gap.ref) {
              <li>
                <a
                  [routerLink]="gap.link.path"
                  [queryParams]="gap.link.query"
                  class="group flex items-baseline gap-2 rounded-tile px-1 py-1 text-ui hover:bg-surface-2"
                >
                  <span class="flex-none font-mono text-meta text-fg-subtle">{{ gap.number }}</span>
                  <span class="min-w-0 flex-1 text-fg group-hover:underline">{{ gap.title }}</span>
                  <span class="flex-none text-meta text-fg-subtle">
                    {{
                      'home.status.missing' | transloco: { missing: gap.missing, total: gap.total }
                    }}
                  </span>
                </a>
              </li>
            }
          </ul>
        </div>
      } @else if (fw.applicable > 0) {
        <p class="mt-4 flex items-center gap-2 text-ui text-pass-ink">
          <app-icon name="checkcircle" [size]="15" />
          {{ 'home.status.noGaps' | transloco }}
        </p>
      }

      <footer class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
        <a
          [routerLink]="allLink().path"
          [queryParams]="allLink().query"
          class="text-ui font-semibold text-accent hover:underline"
          data-testid="standard-all"
        >
          {{ 'home.status.seeAll' | transloco }} →
        </a>
        @if (journey(); as j) {
          <a [routerLink]="j.url" class="text-ui font-semibold text-accent hover:underline">
            {{ 'home.status.continueJourney' | transloco: { percent: j.percent } }}
          </a>
        } @else if (canStartJourney() && journeyAvailable()) {
          <a
            [routerLink]="journeyLink()"
            class="text-ui font-semibold text-fg-muted hover:text-fg hover:underline"
          >
            {{ 'home.status.startJourney' | transloco }}
          </a>
        }
      </footer>
    </article>
  `,
})
export class StandardStatus {
  readonly status = input.required<FrameworkStatus>();
  readonly journey = input<JourneySummary | null>(null);
  readonly canStartJourney = input(false);

  protected readonly shortKey = computed(() => frameworkShortKey(this.status().framework));
  protected readonly trend = computed(() => trendParams(this.status().trend_30d));
  protected readonly allLink = computed(() => splitUrl(this.status().url));
  protected readonly journeyAvailable = computed(() => hasJourney(this.status().framework));
  protected readonly journeyLink = computed(() => journeyUrl(this.status().framework));
  protected readonly gaps = computed(() =>
    this.status()
      .top_gaps.slice(0, 3)
      .map((gap) => ({ ...gap, link: splitUrl(gap.url) })),
  );
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { frameworkShortKey, hasJourney, journeyUrl, splitUrl } from '../data/home-format';
import { FrameworkStatus, JourneySummary } from '../data/home.models';

/**
 * One enabled standard on the home page (U07): the one readiness number (requirement
 * coverage, the same number as the bar and as on Standards), "N ting gjenstår →" to
 * the standard's gaps page, the certification target date and the journey as steps
 * ("Steg 12/20", never a second percentage). Every number is a link. No clause
 * numbers: the gaps page lists them.
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
          @if (targetText(); as target) {
            <p class="mt-1 text-meta font-semibold text-fg-muted" data-testid="standard-target">
              {{ target.key | transloco: { date: target.date } }}
            </p>
          }
        </div>
        <a
          [routerLink]="allLink().path"
          [queryParams]="allLink().query"
          class="flex-none rounded-tile text-right hover:underline"
          data-testid="standard-percent"
        >
          <span class="font-display text-section font-bold text-fg">{{ fw.percent }} %</span>
          <span class="block text-micro text-fg-subtle">{{
            'home.status.coverage' | transloco
          }}</span>
        </a>
      </header>

      <div class="mt-3">
        <app-progress-bar
          [value]="fw.percent"
          [label]="
            'home.status.coverageLabel'
              | transloco: { standard: (shortKey() | transloco), score: fw.percent }
          "
        />
        <p class="mt-2 text-meta text-fg-muted">
          <a
            [routerLink]="allLink().path"
            [queryParams]="allLink().query"
            class="hover:text-fg hover:underline"
            data-testid="standard-covered"
            >{{
              'home.status.covered' | transloco: { covered: fw.covered, applicable: fw.applicable }
            }}</a
          >
        </p>
      </div>

      <div class="mt-4">
        @if (fw.remaining > 0) {
          <a
            [routerLink]="remainingLink().path"
            [queryParams]="remainingLink().query"
            class="text-ui font-semibold text-accent hover:underline"
            data-testid="standard-remaining"
          >
            {{ 'home.status.remaining' | transloco: { count: fw.remaining } }} →
          </a>
        } @else if (fw.applicable > 0) {
          <p class="flex items-center gap-2 text-ui text-pass-ink">
            <app-icon name="checkcircle" [size]="15" />
            {{ 'home.status.noGaps' | transloco }}
          </p>
        }
      </div>

      <footer class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
        @if (journey(); as j) {
          <a
            [routerLink]="j.url"
            class="text-ui font-semibold text-accent hover:underline"
            data-testid="standard-journey"
          >
            {{ 'home.status.continueSteps' | transloco: { done: j.done, total: j.total } }}
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
  private readonly language = inject(LanguageService);

  readonly status = input.required<FrameworkStatus>();
  readonly journey = input<JourneySummary | null>(null);
  readonly canStartJourney = input(false);

  protected readonly shortKey = computed(() => frameworkShortKey(this.status().framework));
  protected readonly allLink = computed(() => splitUrl(this.status().url));
  protected readonly remainingLink = computed(() =>
    splitUrl(this.status().remaining_url || this.status().url),
  );
  protected readonly journeyAvailable = computed(() => hasJourney(this.status().framework));
  protected readonly journeyLink = computed(() => journeyUrl(this.status().framework));

  /** "Mål 11. jan. 2027" (a date, never "in N days"), or "Sertifisert". */
  protected readonly targetText = computed(() => {
    const fw = this.status();
    if (fw.target_status === 'certified') {
      return { key: 'home.status.targetCertified', date: '' };
    }
    if (!fw.target_date) {
      return null;
    }
    const date = new Date(`${fw.target_date}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const text = new Intl.DateTimeFormat(this.language.active(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
    return { key: 'home.status.target', date: text };
  });
}

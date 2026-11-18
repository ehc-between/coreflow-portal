import { formatNumber, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';

export type KpiTone = 'pass' | 'warn' | 'fail' | 'info' | 'accent' | 'neutral';

/**
 * Why a tile is allowed to be a plain number rather than a door (U24).
 * - `average`: an average, median, rate of change or score: no list of records adds up to it.
 * - `measurement`: a single measured value (the latest reading of an indicator), not a count.
 * - `shownBelow`: a record page's own summary; the rows it counts are listed directly below
 *   it on the same page (a review's accounts, a person's training, a survey's responses).
 */
export type KpiNoLinkReason = 'average' | 'measurement' | 'shownBelow';

/**
 * Compact metric tile ("stat tile"): a tone dot + label, a large Bricolage value, and an
 * optional delta line. Mirrors the module-view KPI grid in the design.
 *
 * U24 "Every number is a door": a tile that counts something opens the list it counts.
 * Pass `link` (+ `queryParams` for the filter) and the whole tile becomes an anchor. A
 * tile that is not a count opts out with an explicit `noLink` reason. Tiles that filter
 * the list on the same page sit inside the page's own filter button instead. The
 * `kpi-tile.spec.ts` source scan fails on any tile that does none of these.
 */
@Component({
  selector: 'app-kpi-tile, app-stat-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet],
  host: { class: 'block' },
  template: `
    <ng-template #body>
      <div class="mb-2.5 flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full" [style.background]="dotColor()"></span>
        <span class="text-meta font-semibold text-fg-muted">{{ label() }}</span>
      </div>
      <div class="font-display text-page leading-none font-bold tracking-[-0.02em]">
        {{ displayValue() }}
      </div>
      @if (delta()) {
        <div class="mt-2 text-meta font-semibold" [style.color]="deltaColor()">{{ delta() }}</div>
      }
    </ng-template>
    @if (link(); as target) {
      <a
        [routerLink]="target"
        [queryParams]="queryParams()"
        class="block h-full rounded-card border border-border bg-surface px-4 py-[15px] shadow-card transition-colors outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"
        data-stat-tile="link"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <div
        class="h-full rounded-card border border-border bg-surface px-4 py-[15px] shadow-card"
        [attr.data-stat-tile]="noLink() ?? 'host'"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </div>
    }
  `,
})
export class KpiTile {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly delta = input('');
  readonly tone = input<KpiTone>('neutral');
  /** Tone applied to the delta line (defaults to the tile tone). */
  readonly deltaTone = input<KpiTone | null>(null);
  /** The list this number counts. Makes the tile an anchor. */
  readonly link = input<string | readonly unknown[] | null>(null);
  /** The filter that makes the list show exactly the rows counted here. */
  readonly queryParams = input<Params | null>(null);
  /** Explicit opt-out for values that are not a count of records. */
  readonly noLink = input<KpiNoLinkReason | null>(null);

  private readonly toneVar: Record<KpiTone, string> = {
    pass: 'var(--pass)',
    warn: 'var(--warn)',
    fail: 'var(--fail)',
    info: 'var(--info)',
    accent: 'var(--accent)',
    neutral: 'var(--fg-subtle)',
  };

  private readonly language = inject(LanguageService);

  /** Numeric values are digit-grouped in the active UI language ("1 234" in nb). */
  protected readonly displayValue = computed(() => {
    const value = this.value();
    return typeof value === 'number' ? formatNumber(value, this.language.locale()) : value;
  });

  protected readonly dotColor = computed(() => this.toneVar[this.tone()]);
  protected readonly deltaColor = computed(() => this.toneVar[this.deltaTone() ?? this.tone()]);
}

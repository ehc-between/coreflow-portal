import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { contrastText, templateLabel } from '../data/risk-display';

/**
 * A risk level chip in the band's colour: "High · 12". `level` is the band key,
 * `label` the org's band label (template labels are translated). Renders a muted
 * "Not rated" chip without a score.
 */
@Component({
  selector: 'app-rating-badge',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (score() !== null && score() !== undefined) {
      <span
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap"
        [style.background]="color() || 'var(--surface-2)'"
        [style.color]="textColor()"
        data-testid="rating-badge"
      >
        {{ text() }}
        <span class="opacity-80">· {{ score() }}</span>
      </span>
    } @else {
      <span
        class="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap text-fg-muted"
      >
        {{ 'risk.rating.notRated' | transloco }}
      </span>
    }
  `,
})
export class RatingBadge {
  private readonly language = inject(LanguageService);

  readonly score = input<number | null | undefined>(null);
  readonly level = input<string | null | undefined>(null);
  readonly label = input<string | null | undefined>(null);
  readonly color = input<string | null | undefined>(null);

  protected readonly text = computed(() =>
    templateLabel('bands', this.level(), this.label(), (k, p) => this.language.translate(k, p)),
  );
  protected readonly textColor = computed(() => contrastText(this.color()));
}

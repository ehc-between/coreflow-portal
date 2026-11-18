import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Badge } from '../../../shared/ui/badge/badge';

/** Band of an opportunity score (benefit x feasibility, 1-25). */
export function opportunityBand(score: number, max = 25): 'high' | 'medium' | 'low' {
  const share = max > 0 ? score / max : 0;
  return share >= 0.6 ? 'high' : share >= 0.3 ? 'medium' : 'low';
}

/**
 * An opportunity's score with its scale and band: "16 av 25 · Høy". Never a bare
 * number. Unscored opportunities read "Ikke vurdert".
 */
@Component({
  selector: 'app-opportunity-score',
  imports: [TranslocoPipe, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (score() !== null && score() !== undefined) {
      <app-badge
        [tone]="band() === 'high' ? 'info' : 'neutral'"
        [attr.title]="'risk.opportunities.scoreHint' | transloco"
        data-testid="opportunity-score"
      >
        {{
          'risk.opportunities.scoreOf'
            | transloco
              : {
                  score: score(),
                  max: max(),
                  band: ('risk.opportunities.bands.' + band() | transloco),
                }
        }}
      </app-badge>
    } @else {
      <app-badge tone="neutral">{{ 'risk.rating.notRated' | transloco }}</app-badge>
    }
  `,
})
export class OpportunityScore {
  readonly score = input<number | null | undefined>(null);
  readonly max = input(25);

  protected readonly band = computed(() => opportunityBand(this.score() ?? 0, this.max()));
}

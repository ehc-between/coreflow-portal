import { ChangeDetectionStrategy, Component, computed, input, inject } from '@angular/core';
import { LocationOutcome } from '../../core/locations/locations.models';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';

/** Text colour per outcome. Not met is neutral, never red (polish D11). */
export const OUTCOME_TONE: Readonly<Record<LocationOutcome, string>> = {
  met: 'text-pass',
  partial: 'text-warn',
  not_met: 'text-fg-subtle',
  not_evaluable: 'text-fg-subtle',
};

/** The worst of several outcomes (`combine: all`); `not_evaluable` only if nothing else. */
export function worstOutcome(outcomes: readonly LocationOutcome[]): LocationOutcome {
  const order: readonly LocationOutcome[] = ['not_met', 'partial', 'met', 'not_evaluable'];
  for (const outcome of order) {
    if (outcomes.includes(outcome)) {
      return outcome;
    }
  }
  return 'not_evaluable';
}

/**
 * Outcome glyph of a location rule result: a solid check (met), a half-filled
 * circle (partial), an empty circle (not met) and a dashed circle (cannot be
 * evaluated, e.g. the module is off). Decorative: the text next to it says the
 * same, and `label` (when given) is exposed to assistive technology.
 */
@Component({
  selector: 'app-location-status-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "reqVis.show() ? null : 'none'",
    '[class]': 'tone()',
    '[attr.data-outcome]': 'outcome()',
    '[attr.role]': "label() ? 'img' : null",
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': "label() ? null : 'true'",
  },
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 16 16" fill="none">
      @switch (outcome()) {
        @case ('met') {
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M4.8 8.3l2.1 2.1 4.3-4.6"
            stroke="white"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        }
        @case ('partial') {
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5" />
          <path d="M8 1.75a6.25 6.25 0 0 0 0 12.5z" fill="currentColor" />
        }
        @case ('not_met') {
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5" />
        }
        @default {
          <circle
            cx="8"
            cy="8"
            r="6.25"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="2.2 2.2"
          />
        }
      }
    </svg>
  `,
})
export class LocationStatusIcon {
  /** "Vis krav" (IA v2 §4.3): hidden unless the switch is on or on an expert page. */
  protected readonly reqVis = inject(RequirementsVisibilityService);
  readonly outcome = input.required<LocationOutcome>();
  readonly size = input(14);
  /** Accessible name; leave empty when adjacent text already states the outcome. */
  readonly label = input('');

  protected readonly tone = computed(() => `inline-flex flex-none ${OUTCOME_TONE[this.outcome()]}`);
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { ReadinessBasisFields } from '../../core/locations/locations.models';

/**
 * Where a standard's covered requirements get their status from (design 6.2):
 * "41 krav dekket fra registre, 12 fra koblet dokumentasjon, 3 manuelt vurdert".
 * Renders nothing when the readiness row has no `by_basis` (older backend) or
 * nothing is covered yet.
 */
@Component({
  selector: 'app-basis-summary',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('locations')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
  template: `
    @if (total() > 0) {
      <p class="mt-1 text-meta text-fg-subtle" data-testid="readiness-basis">
        {{
          'locations.readiness.byBasis'
            | transloco
              : { location: counts().location, links: counts().links, manual: counts().manual }
        }}
      </p>
    }
  `,
})
export class BasisSummary {
  /** A readiness row (its optional `by_basis`). */
  readonly readiness = input<ReadinessBasisFields | null | undefined>(null);

  protected readonly counts = computed(() => {
    const b = this.readiness()?.by_basis ?? {};
    return { location: b.location ?? 0, links: b.links ?? 0, manual: b.manual ?? 0 };
  });
  protected readonly total = computed(() => {
    const c = this.counts();
    return c.location + c.links + c.manual;
  });
}

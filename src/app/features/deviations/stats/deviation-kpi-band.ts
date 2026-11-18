import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { DeviationFilters, DeviationStats } from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';

/** The status filter values the band's tiles apply to the register below. */
export type DeviationKpiScope = 'scope:active' | 'scope:overdue' | 'scope:closed';

/**
 * U24: the statistics as a band on the register (`/deviations?kpi=1`). Each tile
 * filters the list below it to exactly the rows it counts (same rules as the
 * stats endpoint: open, overdue, closed), and "Full statistics" opens the
 * breakdowns. The band honours the list's type/standard/severity/... filters.
 */
@Component({
  selector: 'app-deviation-kpi-band',
  imports: [RouterLink, TranslocoPipe, KpiTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (stats(); as s) {
      @for (t of tiles; track t.scope) {
        <button
          type="button"
          class="block w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [class.ring-2]="active() === t.scope"
          [class.ring-accent]="active() === t.scope"
          [attr.aria-pressed]="active() === t.scope"
          [attr.data-testid]="'kpi-band-' + t.key"
          (click)="pick.emit(active() === t.scope ? '' : t.scope)"
        >
          <app-kpi-tile
            [label]="'deviations.stats.cards.' + t.key | transloco"
            [value]="s[t.key]"
            [tone]="
              t.key === 'overdue' && s.overdue > 0
                ? 'warn'
                : t.key === 'open'
                  ? 'accent'
                  : 'neutral'
            "
          />
        </button>
      }
      <a
        routerLink="/deviations/stats"
        class="flex items-center justify-center rounded-card border border-dashed border-border px-4 py-3 text-ui font-semibold text-accent hover:bg-surface-2"
        data-testid="kpi-band-full"
      >
        {{ 'deviations.stats.fullStats' | transloco }} →
      </a>
    }
  `,
})
export class DeviationKpiBand {
  private readonly api = inject(DeviationsApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;

  /** The list's filters other than status (the band counts within them). */
  readonly filters = input<DeviationFilters>({});
  /** The status filter currently applied to the list. */
  readonly active = input('');
  readonly pick = output<string>();

  protected readonly tiles = [
    { key: 'open', scope: 'scope:active' },
    { key: 'overdue', scope: 'scope:overdue' },
    { key: 'closed', scope: 'scope:closed' },
  ] as const satisfies readonly { key: keyof DeviationStats; scope: DeviationKpiScope }[];

  protected readonly stats = signal<DeviationStats | null>(null);
  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      const f = this.filters();
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.sub = this.api
          .getStats(orgId, {
            type_id: f.type_id,
            standard: f.standard,
            severity: f.severity,
            source: f.source,
            department_id: f.department_id,
          })
          .subscribe({ next: (s) => this.stats.set(s), error: () => this.stats.set(null) });
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }
}

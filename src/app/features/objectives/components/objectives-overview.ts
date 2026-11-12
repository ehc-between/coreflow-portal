import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { ObjectivesOverview } from '../data/objectives.models';

/** Headline tiles of the module: objectives in play and how the KPIs are doing. */
@Component({
  selector: 'app-objectives-overview',
  imports: [TranslocoPipe, KpiTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (overview(); as o) {
      <section
        class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        [attr.aria-label]="'objectives.overview.label' | transloco"
        data-testid="objectives-overview"
      >
        <app-kpi-tile
          [label]="'objectives.overview.active' | transloco"
          [value]="o.objectives.by_status.active"
          tone="info"
        />
        <app-kpi-tile
          [label]="'objectives.overview.achieved' | transloco"
          [value]="o.objectives.by_status.achieved"
          tone="pass"
        />
        <app-kpi-tile
          [label]="'objectives.overview.overdue' | transloco"
          [value]="o.objectives.overdue"
          [tone]="o.objectives.overdue > 0 ? 'fail' : 'neutral'"
        />
        <app-kpi-tile
          [label]="'objectives.overview.onTrack' | transloco"
          [value]="o.kpis.on_track"
          tone="pass"
        />
        <app-kpi-tile
          [label]="'objectives.overview.offTarget' | transloco"
          [value]="o.kpis.at_risk + o.kpis.off_track"
          [tone]="o.kpis.off_track > 0 ? 'fail' : o.kpis.at_risk > 0 ? 'warn' : 'neutral'"
        />
        <app-kpi-tile
          [label]="'objectives.overview.measurementOverdue' | transloco"
          [value]="o.kpis.measurement_overdue"
          [tone]="o.kpis.measurement_overdue > 0 ? 'warn' : 'neutral'"
        />
      </section>
    }
  `,
})
export class ObjectivesOverviewTiles {
  readonly overview = input<ObjectivesOverview | null>(null);
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { KpiTile, KpiTone } from '../../../shared/ui/kpi-tile/kpi-tile';

/** One headline number of a register; clicking it applies the filter it counts. */
export interface SummaryTile {
  readonly key: string;
  readonly labelKey: string;
  readonly value: number;
  readonly tone: KpiTone;
  /** Whether the list is currently filtered on this tile. */
  readonly active?: boolean;
}

/**
 * The register's headline tiles (≤ 6) for the list frame's `[kpis]` slot. Each tile
 * is a toggle button: pressing it filters the list to what it counts, pressing it
 * again clears that filter. The host is `display: contents`, so the tiles are items
 * of the frame's grid.
 */
@Component({
  selector: 'app-objectives-tiles',
  imports: [TranslocoPipe, KpiTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @for (tile of tiles(); track tile.key) {
      <button
        type="button"
        class="rounded-card text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
        [class.ring-2]="tile.active"
        [class.ring-accent]="tile.active"
        [attr.aria-pressed]="!!tile.active"
        [attr.aria-label]="
          'objectives.tiles.filterBy'
            | transloco: { label: (tile.labelKey | transloco), count: tile.value }
        "
        [attr.data-testid]="'tile-' + tile.key"
        (click)="selected.emit(tile.key)"
      >
        <app-kpi-tile
          class="block h-full transition-transform hover:-translate-y-px"
          [label]="tile.labelKey | transloco"
          [value]="tile.value"
          [tone]="tile.value > 0 ? tile.tone : 'neutral'"
        />
      </button>
    }
  `,
})
export class ObjectivesTiles {
  readonly tiles = input.required<readonly SummaryTile[]>();
  readonly selected = output<string>();
}

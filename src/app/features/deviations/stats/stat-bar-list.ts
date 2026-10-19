import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatBar } from './stats-bars';

/**
 * Horizontal CSS bar breakdown: one row per {@link StatBar} with its label,
 * count, share % and a proportional bar. Rows emit `select` with the bar id
 * when `drillable`; otherwise they render as disabled buttons. Shared by the
 * deviation stats page and the dashboard.
 */
@Component({
  selector: 'app-stat-bar-list',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bars().length === 0) {
      <p class="py-2 text-[13px] text-fg-subtle">
        {{ 'deviations.stats.noData' | transloco }}
      </p>
    } @else {
      <ul class="flex flex-col gap-2.5">
        @for (bar of bars(); track bar.id) {
          <li>
            <button
              type="button"
              [disabled]="!drillable()"
              (click)="selectBar.emit(bar.id)"
              class="group block w-full text-left enabled:cursor-pointer"
            >
              <div class="mb-1 flex items-baseline justify-between gap-3">
                <span class="truncate text-[13px] text-fg group-enabled:group-hover:text-accent">{{
                  bar.label
                }}</span>
                <span class="flex-none text-[12.5px] font-semibold text-fg-muted">
                  {{ bar.count }}
                  <span class="text-fg-subtle">· {{ bar.percent }}%</span>
                </span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  class="h-full rounded-full bg-accent transition-[width]"
                  [style.width.%]="bar.percent"
                ></div>
              </div>
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class StatBarList {
  readonly bars = input.required<readonly StatBar[]>();
  readonly drillable = input(true);
  /** Emits the clicked bar's id (only when `drillable`). */
  readonly selectBar = output<string>();
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { Objective } from '../data/objectives.models';
import { countKey, progressSource, shownProgress } from '../objectives-display';

/**
 * An objective's progress: the bar with the percentage next to it and, unless
 * `compact`, where the figure comes from ("Beregnet fra 2 KPI-er" / "Satt
 * manuelt" / "Ingen KPI-er med målinger ennå"). Progress is never red (tone map:
 * low progress is a to-do, not a failure).
 */
@Component({
  selector: 'app-objective-progress',
  imports: [TranslocoPipe, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="flex items-center gap-2">
      <div class="min-w-0 flex-1">
        <app-progress-bar
          [value]="value() ?? 0"
          [label]="
            value() === null
              ? ('objectives.progress.none' | transloco)
              : ('objectives.progress.percent' | transloco: { value: value() })
          "
        />
      </div>
      <span
        class="w-10 flex-none text-right text-meta font-semibold tabular-nums"
        [class.text-fg]="value() !== null"
        [class.text-fg-subtle]="value() === null"
        data-testid="objective-progress-value"
        >{{ value() === null ? '—' : value() + ' %' }}</span
      >
    </div>
    @if (!compact()) {
      <p class="mt-1 text-meta text-fg-muted" data-testid="objective-progress-source">
        @switch (source()) {
          @case ('kpis') {
            {{ fromKpisKey() | transloco: { count: kpiCount() } }}
          }
          @case ('manual') {
            {{ 'objectives.progress.manual' | transloco }}
          }
          @default {
            {{ 'objectives.progress.noData' | transloco }}
          }
        }
      </p>
    }
  `,
})
export class ObjectiveProgress {
  readonly objective = input.required<Objective>();
  readonly compact = input(false);

  protected readonly value = computed(() => shownProgress(this.objective()));
  protected readonly source = computed(() => progressSource(this.objective()));
  protected readonly kpiCount = computed(
    () => this.objective().computed_progress_kpis ?? this.objective().kpis.total,
  );
  protected readonly fromKpisKey = computed(() =>
    countKey('objectives.progress.fromKpis', this.kpiCount()),
  );
}

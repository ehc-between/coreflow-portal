import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Skeleton rows while a list or panel loads (instead of a lone "Laster …").
 * Announces "Laster …" to screen readers once.
 *
 *   @if (loading()) { <app-loading-state [rows]="5" /> }
 */
@Component({
  selector: 'app-loading-state',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      role="status"
      aria-live="polite"
      data-testid="loading-state"
      class="overflow-hidden rounded-card border border-border bg-surface"
    >
      <span class="sr-only">{{ labelKey() | transloco }}</span>
      @for (row of rowList(); track row) {
        <div
          class="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
          aria-hidden="true"
        >
          <span
            class="h-3 w-16 flex-none animate-pulse rounded-full bg-surface-3 motion-reduce:animate-none"
          ></span>
          <span
            class="h-3 animate-pulse rounded-full bg-surface-3 motion-reduce:animate-none"
            [style.width.%]="widths[row % widths.length]"
          ></span>
          <span
            class="ml-auto hidden h-5 w-20 flex-none animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none sm:block"
          ></span>
        </div>
      }
    </div>
  `,
})
export class LoadingState {
  readonly rows = input(4);
  readonly labelKey = input('common.loading');

  protected readonly widths = [46, 62, 38, 54, 70, 42];
  protected readonly rowList = computed(() =>
    Array.from({ length: Math.max(1, this.rows()) }, (_, i) => i),
  );
}

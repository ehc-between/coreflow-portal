import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ReadinessParts, sharePct } from '../../../core/standards/frameworks-data';

/** Segment order and colour of the readiness bar (legend uses the same list). */
export const READINESS_SEGMENTS = [
  { key: 'fresh', color: 'var(--pass)' },
  { key: 'stale', color: 'color-mix(in oklab, var(--pass) 45%, var(--surface-2))' },
  { key: 'partial', color: 'var(--warn)' },
  { key: 'missing', color: 'var(--fail)' },
] as const satisfies readonly { key: keyof ReadinessParts; color: string }[];

/**
 * Stacked bar of a standard's readiness: covered with recent evidence, covered
 * with older evidence, partly covered and not started, with a legend listing
 * each count (so colour is never the only cue).
 */
@Component({
  selector: 'app-readiness-bar',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      role="img"
      [attr.aria-label]="label()"
    >
      @for (seg of segments(); track seg.key) {
        @if (seg.pct > 0) {
          <span class="h-full" [style.width.%]="seg.pct" [style.background]="seg.color"></span>
        }
      }
    </div>
    <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-muted">
      @for (seg of segments(); track seg.key) {
        <li class="inline-flex items-center gap-1.5">
          <span
            class="inline-block size-2.5 flex-none rounded-full"
            [style.background]="seg.color"
            aria-hidden="true"
          ></span>
          {{
            'standards.readiness.segment'
              | transloco
                : { label: ('standards.readiness.legend.' + seg.key | transloco), count: seg.count }
          }}
        </li>
      }
    </ul>
  `,
})
export class ReadinessBar {
  readonly parts = input.required<ReadinessParts>();
  /** Accessible name of the bar (e.g. "Readiness breakdown"). */
  readonly label = input('');

  protected readonly segments = computed(() => {
    const parts = this.parts();
    const total = parts.fresh + parts.stale + parts.partial + parts.missing;
    return READINESS_SEGMENTS.map((s) => ({
      ...s,
      count: parts[s.key],
      pct: sharePct(parts[s.key], total),
    }));
  });
}

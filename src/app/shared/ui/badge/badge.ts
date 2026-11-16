import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'pass' | 'warn' | 'fail' | 'info' | 'accent' | 'neutral';

/** Small status pill. Tone selects a soft-background / coloured-text pairing. */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-micro font-semibold whitespace-nowrap"
      [class]="classes()"
    >
      <ng-content />
    </span>
  `,
})
export class Badge {
  readonly tone = input<BadgeTone>('neutral');

  private readonly toneClasses: Record<BadgeTone, string> = {
    pass: 'border-transparent bg-pass-soft text-pass-ink',
    warn: 'border-transparent bg-warn-soft text-warn-ink',
    fail: 'border-transparent bg-fail-soft text-fail-ink',
    info: 'border-transparent bg-info-soft text-info-ink',
    accent: 'border-accent-border bg-accent-soft text-accent',
    neutral: 'border-border bg-surface-2 text-fg-muted',
  };

  protected readonly classes = computed(() => this.toneClasses[this.tone()]);
}

import { formatNumber } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';

export type KpiTone = 'pass' | 'warn' | 'fail' | 'info' | 'accent' | 'neutral';

/**
 * Compact metric tile: a tone dot + label, a large Bricolage value, and an
 * optional delta line. Mirrors the module-view KPI grid in the design.
 */
@Component({
  selector: 'app-kpi-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-card border border-border bg-surface px-4 py-[15px] shadow-card">
      <div class="mb-2.5 flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full" [style.background]="dotColor()"></span>
        <span class="text-[12.5px] font-semibold text-fg-muted">{{ label() }}</span>
      </div>
      <div class="font-display text-[27px] leading-none font-bold tracking-[-0.02em]">
        {{ displayValue() }}
      </div>
      @if (delta()) {
        <div class="mt-2 text-[12px] font-semibold" [style.color]="deltaColor()">{{ delta() }}</div>
      }
    </div>
  `,
})
export class KpiTile {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly delta = input('');
  readonly tone = input<KpiTone>('neutral');
  /** Tone applied to the delta line (defaults to the tile tone). */
  readonly deltaTone = input<KpiTone | null>(null);

  private readonly toneVar: Record<KpiTone, string> = {
    pass: 'var(--pass)',
    warn: 'var(--warn)',
    fail: 'var(--fail)',
    info: 'var(--info)',
    accent: 'var(--accent)',
    neutral: 'var(--fg-subtle)',
  };

  private readonly language = inject(LanguageService);

  /** Numeric values are digit-grouped in the active UI language ("1 234" in nb). */
  protected readonly displayValue = computed(() => {
    const value = this.value();
    return typeof value === 'number' ? formatNumber(value, this.language.locale()) : value;
  });

  protected readonly dotColor = computed(() => this.toneVar[this.tone()]);
  protected readonly deltaColor = computed(() => this.toneVar[this.deltaTone() ?? this.tone()]);
}

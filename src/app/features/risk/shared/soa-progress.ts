import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((Math.min(part, whole) / whole) * 100) : 0;
}

/**
 * Two honest bars for a Statement of Applicability: how many controls have a
 * decision with a written justification ("Tatt stilling til"), and how many of
 * the applicable ones are implemented. A generated statement is not a finished
 * one, so "93 of 93 in the statement" is never shown as a full bar.
 */
@Component({
  selector: 'app-soa-progress',
  imports: [TranslocoPipe, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2.5' },
  template: `
    @if (justified() !== null) {
      <div>
        <div class="mb-1 flex flex-wrap justify-between gap-x-2 text-meta">
          <span class="font-semibold text-fg-muted">{{
            'risk.soa.progress.decided' | transloco
          }}</span>
          <span class="text-fg-muted" data-testid="soa-decided">
            {{ 'risk.soa.progress.count' | transloco: { part: justified(), whole: total() } }}
          </span>
        </div>
        <app-progress-bar
          [value]="decidedPct()"
          [label]="'risk.soa.progress.decided' | transloco"
        />
      </div>
    }
    <div>
      <div class="mb-1 flex flex-wrap justify-between gap-x-2 text-meta">
        <span class="font-semibold text-fg-muted">{{
          'risk.soa.progress.implemented' | transloco
        }}</span>
        <span class="text-fg-muted" data-testid="soa-implemented">
          {{
            'risk.soa.progress.countApplicable'
              | transloco: { part: implemented(), whole: applicable() }
          }}
        </span>
      </div>
      <app-progress-bar
        [value]="implementedPct()"
        color="var(--pass)"
        [label]="'risk.soa.progress.implemented' | transloco"
      />
    </div>
  `,
})
export class SoaProgress {
  readonly total = input.required<number>();
  /** Entries with a written justification (null: unknown, the bar is hidden). */
  readonly justified = input.required<number | null>();
  readonly applicable = input.required<number>();
  readonly implemented = input.required<number>();

  protected readonly decidedPct = computed(() => pct(this.justified() ?? 0, this.total()));
  protected readonly implementedPct = computed(() => pct(this.implemented(), this.applicable()));
}

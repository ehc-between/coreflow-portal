import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Term } from '../../../shared/guidance/term';
import { ContinuityDuration } from './duration';

/** A recovery target the row can show. */
type TargetKey = 'rto' | 'rpo' | 'mtpd';

/**
 * The recovery targets as large figures with plain labels ("Oppe igjen innen",
 * "Maks datatap", "Tåler stans i"), the abbreviation explained on hover. Targets that
 * are not set are left out; put it inside an `@if` of the targets that are set so an
 * empty row hides in a lead section.
 */
@Component({
  selector: 'app-continuity-recovery-targets',
  imports: [TranslocoPipe, Term, ContinuityDuration],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="flex flex-wrap gap-x-8 gap-y-3" data-testid="recovery-targets">
      @for (t of shown(); track t.key) {
        <div class="min-w-0">
          <dt class="text-meta text-fg-muted">
            <app-term [key]="t.key" scope="continuity">{{
              'continuity.detail.targets.' + t.key | transloco
            }}</app-term>
          </dt>
          <dd class="font-display text-card font-bold text-fg">
            <app-continuity-duration [minutes]="t.minutes" />
          </dd>
        </div>
      }
    </dl>
  `,
})
export class ContinuityRecoveryTargets {
  readonly rto = input<number | null | undefined>(null);
  readonly rpo = input<number | null | undefined>(null);
  readonly mtpd = input<number | null | undefined>(null);

  protected readonly shown = computed(() =>
    (
      [
        { key: 'rto', minutes: this.rto() },
        { key: 'rpo', minutes: this.rpo() },
        { key: 'mtpd', minutes: this.mtpd() },
      ] as { key: TargetKey; minutes: number | null | undefined }[]
    ).filter((t): t is { key: TargetKey; minutes: number } => typeof t.minutes === 'number'),
  );
}

/** Whether any of the targets is set (so the row has something to show). */
export function hasTargets(...minutes: readonly (number | null | undefined)[]): boolean {
  return minutes.some((m) => typeof m === 'number');
}

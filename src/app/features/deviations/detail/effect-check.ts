import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Action } from '../../../core/deviations/deviation.models';
import { LocalDuePipe } from '../../../shared/locale/locale-pipes';

/** The plain answer to "Virket det?" for one action. */
export type EffectWord = 'notDone' | 'due' | 'unchecked' | 'worked' | 'failed';

/** Where an action stands on "did it work?" (cancelled actions are left out). */
export function effectWord(action: Action): EffectWord {
  if (action.effectiveness === 'effective') {
    return 'worked';
  }
  if (action.effectiveness === 'not_effective') {
    return 'failed';
  }
  if (action.status === 'open' || action.status === 'in_progress') {
    return 'notDone';
  }
  return action.effectiveness_review_due_at ? 'due' : 'unchecked';
}

/**
 * U33 "Virket det?": the third card of a deviation, after "Hvorfor skjedde det?" and
 * "Hva gjør vi?". Explains the effectiveness check in plain words and shows, per
 * action, whether it is done and whether it worked. The answer itself is recorded on
 * the action in "Hva gjør vi?" (one home per concept).
 */
@Component({
  selector: 'app-deviation-effect-check',
  imports: [TranslocoPipe, LocalDuePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="font-display text-section font-bold text-fg">
      {{ 'deviations.plain.effect.title' | transloco }}
    </h2>
    <p class="mt-0.5 mb-3 text-meta text-fg-muted">
      {{ 'deviations.plain.effect.hint' | transloco }}
    </p>
    @if (rows().length) {
      <p class="mb-2 text-ui font-semibold text-fg" data-testid="effect-summary">
        {{
          'deviations.plain.effect.summary' | transloco: { worked: worked(), total: rows().length }
        }}
      </p>
      <ul class="divide-y divide-border" data-testid="effect-rows">
        @for (row of rows(); track row.action.id) {
          <li class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-ui">
            <span class="min-w-0 flex-1 text-fg">{{ row.action.description }}</span>
            <span
              class="text-meta font-semibold"
              [class]="
                row.word === 'worked'
                  ? 'text-pass'
                  : row.word === 'failed'
                    ? 'text-fail-ink'
                    : 'text-fg-muted'
              "
              [attr.data-word]="row.word"
            >
              {{
                'deviations.plain.effect.words.' + row.word
                  | transloco: { date: (row.action.effectiveness_review_due_at | localDue) }
              }}
            </span>
          </li>
        }
      </ul>
    } @else {
      <p class="text-ui text-fg-muted" data-testid="effect-empty">
        {{ 'deviations.plain.effect.empty' | transloco }}
      </p>
    }
  `,
})
export class DeviationEffectCheck {
  readonly actions = input<readonly Action[]>([]);

  protected readonly rows = computed(() =>
    this.actions()
      .filter((action) => action.status !== 'cancelled')
      .map((action) => ({ action, word: effectWord(action) })),
  );
  protected readonly worked = computed(
    () => this.rows().filter((row) => row.word === 'worked').length,
  );
}

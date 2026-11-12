import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

let nextId = 0;

/** A 1-5 rating as a radio group (keyboard: arrow keys move between ratings). */
@Component({
  selector: 'app-training-rating',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">{{ label() }}</legend>
      <div class="flex flex-wrap gap-1.5">
        @for (n of options; track n) {
          <label
            class="flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-[8px] border px-2.5 text-[13px] font-semibold focus-within:ring-2 focus-within:ring-accent"
            [class]="
              value() === n
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-bg text-fg-muted hover:text-fg'
            "
          >
            <input
              type="radio"
              class="sr-only"
              [name]="name"
              [value]="n"
              [checked]="value() === n"
              (change)="valueChange.emit(n)"
            />
            <span aria-hidden="true">{{ n }}</span>
            <span class="sr-only">{{ 'training.rating.option' | transloco: { n } }}</span>
          </label>
        }
      </div>
      <p class="mt-1 text-[12px] text-fg-subtle">{{ 'training.rating.scale' | transloco }}</p>
    </fieldset>
  `,
})
export class RatingInput {
  readonly label = input.required<string>();
  readonly value = input<number | null>(null);
  readonly valueChange = output<number>();

  protected readonly options = [1, 2, 3, 4, 5];
  protected readonly name = `cf-training-rating-${++nextId}`;
}

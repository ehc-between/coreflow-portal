import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface FilterOption {
  readonly value: string;
  /** Already translated label. */
  readonly label: string;
}

let nextId = 0;

/**
 * A compact list filter: a `<select>` with its label always visible as a prefix
 * ("Status: Alle"), so two filters never look alike. `showLabel` puts the label
 * above the control instead (inside the "Flere filtre" panel).
 */
@Component({
  selector: 'app-training-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (showLabel()) {
      <div class="flex w-full flex-col gap-1">
        <label [attr.for]="id" class="text-meta font-semibold text-fg-muted">{{ label() }}</label>
        <select
          [id]="id"
          class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
          [value]="value()"
          (change)="valueChange.emit($any($event.target).value)"
          [attr.data-testid]="testId()"
        >
          @for (option of options(); track option.value) {
            <option [value]="option.value" [selected]="option.value === value()">
              {{ option.label }}
            </option>
          }
        </select>
      </div>
    } @else {
      <div
        class="flex h-10 max-w-[260px] items-center gap-1.5 rounded-tile border border-border bg-bg pl-3 focus-within:border-accent"
      >
        <label [attr.for]="id" class="text-meta font-semibold whitespace-nowrap text-fg-muted"
          >{{ label() }}:</label
        >
        <select
          [id]="id"
          class="h-full min-w-0 flex-1 cursor-pointer rounded-tile bg-transparent pr-2 text-ui text-fg outline-none"
          [value]="value()"
          (change)="valueChange.emit($any($event.target).value)"
          [attr.data-testid]="testId()"
        >
          @for (option of options(); track option.value) {
            <option [value]="option.value" [selected]="option.value === value()">
              {{ option.label }}
            </option>
          }
        </select>
      </div>
    }
  `,
})
export class FilterSelect {
  readonly label = input.required<string>();
  readonly value = input('');
  readonly options = input.required<readonly FilterOption[]>();
  readonly testId = input<string | null>(null);
  /** Label above the control (for the "Flere filtre" panel). */
  readonly showLabel = input(false);
  readonly valueChange = output<string>();

  protected readonly id = `cf-training-filter-${++nextId}`;
}

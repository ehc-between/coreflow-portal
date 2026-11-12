import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface FilterOption {
  readonly value: string;
  /** Already translated label. */
  readonly label: string;
}

let nextId = 0;

/** A compact labelled `<select>` for list filters (the label is visually hidden). */
@Component({
  selector: 'app-training-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <label [attr.for]="id" class="sr-only">{{ label() }}</label>
    <select
      [id]="id"
      class="h-10 max-w-[220px] rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
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
  `,
})
export class FilterSelect {
  readonly label = input.required<string>();
  readonly value = input('');
  readonly options = input.required<readonly FilterOption[]>();
  readonly testId = input<string | null>(null);
  readonly valueChange = output<string>();

  protected readonly id = `cf-training-filter-${++nextId}`;
}

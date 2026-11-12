import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export interface FilterOption {
  readonly value: string;
  /** i18n key, or a literal label when `literal` is set. */
  readonly label: string;
  readonly literal?: boolean;
}

let nextId = 0;

/** A compact, labelled list-filter `<select>` (the label is visually hidden). */
@Component({
  selector: 'app-context-filter',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [attr.for]="id" class="sr-only">{{ labelKey() | transloco }}</label>
    <select
      [id]="id"
      class="h-10 max-w-[220px] rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">{{ allKey() | transloco }}</option>
      @for (option of options(); track option.value) {
        <option [value]="option.value" [selected]="option.value === value()">
          @if (option.literal) {
            {{ option.label }}
          } @else {
            {{ option.label | transloco }}
          }
        </option>
      }
    </select>
  `,
})
export class ContextFilter {
  readonly labelKey = input.required<string>();
  /** Label of the "no filter" option. */
  readonly allKey = input.required<string>();
  readonly options = input.required<readonly FilterOption[]>();
  readonly value = input('');
  readonly valueChange = output<string>();

  protected readonly id = `cf-context-filter-${++nextId}`;
}

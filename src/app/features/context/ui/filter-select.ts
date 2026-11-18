import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export interface FilterOption {
  readonly value: string;
  /** i18n key, or a literal label when `literal` is set. */
  readonly label: string;
  readonly literal?: boolean;
}

let nextId = 0;

/**
 * A compact, labelled list-filter `<select>`. In the toolbar the label is
 * visually hidden (the "all …" option names the filter); inside "Flere filtre"
 * (`showLabel`) it sits above the control.
 */
@Component({
  selector: 'app-context-filter',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-1' },
  template: `
    <label
      [attr.for]="id"
      [class]="showLabel() ? 'text-meta font-semibold text-fg-muted' : 'sr-only'"
      >{{ labelKey() | transloco }}</label
    >
    <select
      [id]="id"
      class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
      [class]="showLabel() ? 'w-full' : 'w-auto max-w-[220px]'"
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
  /** Show the label above the control (inside the "Flere filtre" panel). */
  readonly showLabel = input(false);
  readonly valueChange = output<string>();

  protected readonly id = `cf-context-filter-${++nextId}`;
}

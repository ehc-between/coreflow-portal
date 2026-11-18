import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** One option of a list filter; `label` is an i18n key unless `literal`. */
export interface FilterOption {
  readonly value: string;
  readonly label: string;
  readonly literal?: boolean;
}

/** A labelled group of options (`<optgroup>`). */
export interface FilterGroup {
  readonly labelKey: string;
  readonly options: readonly FilterOption[];
}

let nextId = 0;

/**
 * A compact, labelled list filter `<select>` for the deviations pages. In the
 * toolbar the label is visually hidden (the "all …" option names the filter);
 * inside "Flere filtre" (`showLabel`) it sits above the control.
 */
@Component({
  selector: 'app-deviation-filter',
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
      [attr.data-testid]="testId()"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">{{ allKey() | transloco }}</option>
      @for (option of options(); track option.value) {
        <option [value]="option.value" [selected]="option.value === value()">
          {{ option.literal ? option.label : (option.label | transloco) }}
        </option>
      }
      @for (group of groups(); track group.labelKey) {
        @if (group.options.length) {
          <optgroup [label]="group.labelKey | transloco">
            @for (option of group.options; track option.value) {
              <option [value]="option.value" [selected]="option.value === value()">
                {{ option.literal ? option.label : (option.label | transloco) }}
              </option>
            }
          </optgroup>
        }
      }
    </select>
  `,
})
export class DeviationFilter {
  readonly labelKey = input.required<string>();
  /** Label of the "no filter" option. */
  readonly allKey = input.required<string>();
  readonly options = input<readonly FilterOption[]>([]);
  readonly groups = input<readonly FilterGroup[]>([]);
  readonly value = input('');
  /** Show the label above the control (inside the "Flere filtre" panel). */
  readonly showLabel = input(false);
  readonly testId = input<string | null>(null);
  readonly valueChange = output<string>();

  protected readonly id = `cf-deviation-filter-${++nextId}`;
}

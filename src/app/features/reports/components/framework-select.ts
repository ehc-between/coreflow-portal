import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FRAMEWORK_KEYS, FrameworkKey, isFrameworkKey } from '../data/reports.models';

let nextId = 0;

/** Labelled select of a standard ("All standards" = null), with short readable names. */
@Component({
  selector: 'app-framework-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex max-w-full' },
  template: `
    <label [attr.for]="id" class="sr-only">{{ 'reports.framework.label' | transloco }}</label>
    <select
      [id]="id"
      class="h-10 max-w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
      [value]="value() ?? ''"
      (change)="onChange($any($event.target).value)"
      data-testid="framework-select"
    >
      <option value="" [selected]="!value()">{{ allKey() | transloco }}</option>
      @for (key of options(); track key) {
        <option [value]="key" [selected]="key === value()">
          {{ 'reports.frameworks.' + key | transloco }}
        </option>
      }
    </select>
  `,
})
export class FrameworkSelect {
  readonly value = input<FrameworkKey | null>(null);
  /** Limit the options (e.g. to the org's enabled standards); all eight by default. */
  readonly options = input<readonly FrameworkKey[]>(FRAMEWORK_KEYS);
  /** Wording of the empty choice. */
  readonly allKey = input('reports.framework.all');
  readonly valueChange = output<FrameworkKey | null>();

  protected readonly id = `cf-framework-${++nextId}`;

  protected onChange(raw: string): void {
    this.valueChange.emit(isFrameworkKey(raw) ? raw : null);
  }
}

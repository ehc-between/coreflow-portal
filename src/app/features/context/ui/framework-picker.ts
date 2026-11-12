import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FRAMEWORK_KEYS } from '../data/context.models';

let nextId = 0;

/** Toggle chips for the management-system frameworks a record applies to. */
@Component({
  selector: 'app-context-framework-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
        {{ labelKey() | transloco }}
      </legend>
      <div class="flex flex-wrap gap-1.5">
        @for (key of frameworks; track key) {
          <label
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold focus-within:ring-2 focus-within:ring-accent"
            [class]="
              value().includes(key)
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border text-fg-muted hover:text-fg'
            "
          >
            <input
              type="checkbox"
              class="sr-only"
              [id]="id + '-' + key"
              [checked]="value().includes(key)"
              [disabled]="disabled()"
              (change)="toggle(key, $any($event.target).checked)"
            />
            {{ 'context.frameworks.' + key | transloco }}
          </label>
        }
      </div>
    </fieldset>
  `,
})
export class FrameworkPicker {
  readonly value = input<readonly string[]>([]);
  readonly labelKey = input('context.fields.frameworks');
  readonly disabled = input(false);
  readonly valueChange = output<readonly string[]>();

  protected readonly frameworks = FRAMEWORK_KEYS;
  protected readonly id = `cf-fw-${++nextId}`;

  protected toggle(key: string, on: boolean): void {
    const current = this.value().filter((k) => k !== key);
    this.valueChange.emit(
      on ? FRAMEWORK_KEYS.filter((k) => k === key || current.includes(k)) : current,
    );
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export interface Choice {
  readonly value: string;
  /** An i18n key (when `translate` is set) or a display name. */
  readonly label: string;
}

/** Toggle `value` in a list of selected values (keeps the original order). */
export function toggleChoice(selected: readonly string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

/**
 * A fieldset of checkboxes for a multi-value field (frameworks, departments). Keyboard
 * accessible: each option is a native checkbox with its own label.
 */
@Component({
  selector: 'app-audit-choice-checkboxes',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="flex flex-col gap-1.5" [attr.aria-describedby]="describedBy() || null">
      <legend class="mb-1 text-[13px] font-semibold text-fg-muted">{{ legend() }}</legend>
      <div class="flex flex-wrap gap-x-4 gap-y-1.5">
        @for (c of choices(); track c.value) {
          <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="selected().includes(c.value)"
              [disabled]="disabled()"
              (change)="selectedChange.emit(toggle(c.value))"
            />
            {{ translate() ? (c.label | transloco) : c.label }}
          </label>
        } @empty {
          <p class="text-[12.5px] text-fg-muted">{{ emptyText() }}</p>
        }
      </div>
    </fieldset>
  `,
})
export class AuditChoiceCheckboxes {
  readonly legend = input('');
  readonly choices = input<readonly Choice[]>([]);
  readonly selected = input<readonly string[]>([]);
  readonly translate = input(true);
  readonly disabled = input(false);
  readonly emptyText = input('');
  readonly describedBy = input('');
  readonly selectedChange = output<string[]>();

  protected toggle(value: string): string[] {
    return toggleChoice(this.selected(), value);
  }
}

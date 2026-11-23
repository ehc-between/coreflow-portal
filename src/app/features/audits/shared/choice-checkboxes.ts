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
 * A fieldset of checkboxes for a multi-value field (frameworks, departments), laid out
 * as the form anatomy's checkbox group (docs/ux-guide.md §2.4 rule 8): a legend styled
 * like a label and a grid of equal 40 px tiles. Spans both columns of a form section.
 */
@Component({
  selector: 'app-audit-choice-checkboxes',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 sm:col-span-2' },
  template: `
    <fieldset class="flex min-w-0 flex-col gap-1.5" [attr.aria-describedby]="describedBy() || null">
      <legend class="mb-1.5 flex min-h-6 items-center text-ui font-semibold text-fg-muted">
        {{ legend() }}
      </legend>
      @if (choices().length) {
        <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          @for (c of choices(); track c.value) {
            <label
              class="flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 accent-[var(--accent)]"
                [checked]="selected().includes(c.value)"
                [disabled]="disabled()"
                (change)="selectedChange.emit(toggle(c.value))"
              />
              <span class="truncate">{{ translate() ? (c.label | transloco) : c.label }}</span>
            </label>
          }
        </div>
      } @else {
        <p class="text-meta text-fg-muted">{{ emptyText() }}</p>
      }
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

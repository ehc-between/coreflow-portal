import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { localized } from '../data/report-display';
import { RegisterColumn } from '../data/reports.models';

/**
 * Checkboxes for the columns of a register. `selected` empty means "all
 * columns" (the API default), so unticking the last column restores all.
 */
@Component({
  selector: 'app-column-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <fieldset class="min-w-0">
      <legend class="mb-1.5 flex min-h-6 items-center text-ui font-semibold text-fg-muted">
        {{ 'reports.columns.legend' | transloco }}
      </legend>
      <div class="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
        @for (column of columns(); track column.key) {
          <label
            class="flex min-h-10 cursor-pointer items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg hover:border-border-strong"
          >
            <input
              type="checkbox"
              class="h-4 w-4 shrink-0 accent-[var(--accent)]"
              [checked]="isSelected(column.key)"
              (change)="toggle(column.key)"
            />
            <span class="min-w-0 truncate">{{ label(column) }}</span>
          </label>
        }
      </div>
      <p class="mt-1.5 text-meta leading-snug text-fg-subtle">
        {{ 'reports.columns.hint' | transloco }}
      </p>
    </fieldset>
  `,
})
export class ColumnPicker {
  private readonly language = inject(LanguageService);

  readonly columns = input<readonly RegisterColumn[]>([]);
  readonly selected = input<readonly string[]>([]);
  readonly selectedChange = output<string[]>();

  protected label(column: RegisterColumn): string {
    return localized(column.label, this.language.active(), column.key);
  }

  protected isSelected(key: string): boolean {
    const selected = this.selected();
    return selected.length === 0 || selected.includes(key);
  }

  protected toggle(key: string): void {
    const all = this.columns().map((c) => c.key);
    const current = this.selected().length ? [...this.selected()] : all;
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    // Keep the register's column order; "everything" is stored as [].
    const ordered = all.filter((k) => next.includes(k));
    this.selectedChange.emit(ordered.length === all.length || ordered.length === 0 ? [] : ordered);
  }
}

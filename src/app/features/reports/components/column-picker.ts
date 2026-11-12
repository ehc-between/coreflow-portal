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
    <fieldset>
      <legend class="mb-1 text-[12.5px] font-semibold text-fg-muted">
        {{ 'reports.columns.legend' | transloco }}
      </legend>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        @for (column of columns(); track column.key) {
          <label class="inline-flex items-center gap-1.5 text-[13px] text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="isSelected(column.key)"
              (change)="toggle(column.key)"
            />
            {{ label(column) }}
          </label>
        }
      </div>
      <p class="mt-1 text-[11.5px] text-fg-subtle">{{ 'reports.columns.hint' | transloco }}</p>
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

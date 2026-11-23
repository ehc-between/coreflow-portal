import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldDef } from '../../core/deviations/deviation.models';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { FormField } from '../../shared/ui/form-field/form-field';

/** A pickable subject (org user or department) for `user` / `department` fields. */
export interface DynamicFieldOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Renders a single dynamic schema field (`FieldDef`) as the matching control:
 * text / textarea / number / date / select / multiselect / checkbox / user /
 * department. Two-way binds the value via `value` + `valueChange`, shows the
 * label, a required marker, optional `help` / `placeholder`, and an error slot.
 *
 * Self-contained and presentational — the host owns the value model, supplies
 * the user/department option lists, and passes a server-side `error` string to
 * surface under the control. Reused by the create form and (later) the editor.
 */
@Component({
  selector: 'app-dynamic-field',
  imports: [FormsModule, TranslocoPipe, DateInput, FormField],
  host: { class: 'block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (field().type === 'checkbox') {
      <!-- A single on/off option: one 40 px bordered row, aligned with neighbouring controls. -->
      <div class="flex flex-col gap-1.5 sm:pt-[30px]">
        <label
          class="flex min-h-10 cursor-pointer items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
        >
          <input
            [id]="controlId()"
            type="checkbox"
            [ngModel]="booleanValue()"
            (ngModelChange)="valueChange.emit($event)"
            class="h-4 w-4 accent-[var(--accent)]"
          />
          {{ field().label }}
          @if (field().required) {
            <span class="text-fail-ink" aria-hidden="true">*</span>
          }
        </label>
        @if (field().help) {
          <p class="text-meta leading-snug text-fg-subtle">{{ field().help }}</p>
        }
        @if (error()) {
          <p class="text-meta leading-snug font-medium text-fail-ink">
            {{ error()! | transloco }}
          </p>
        }
      </div>
    } @else {
      <app-form-field
        [label]="field().label"
        [inputId]="field().type === 'multiselect' ? '' : controlId()"
        [required]="!!field().required"
        [hint]="field().help ?? ''"
        [error]="error() ? (error()! | transloco) : ''"
      >
        @switch (field().type) {
          @case ('textarea') {
            <textarea
              [id]="controlId()"
              [ngModel]="stringValue()"
              (ngModelChange)="valueChange.emit($event)"
              [placeholder]="field().placeholder ?? ''"
              rows="3"
            ></textarea>
          }
          @case ('number') {
            <input
              [id]="controlId()"
              type="number"
              [ngModel]="value()"
              (ngModelChange)="valueChange.emit($event)"
              [placeholder]="field().placeholder ?? ''"
            />
          }
          @case ('date') {
            <app-date-input
              [inputId]="controlId()"
              [value]="stringValue()"
              (valueChange)="valueChange.emit($event ?? '')"
            />
          }
          @case ('select') {
            <select
              [id]="controlId()"
              [ngModel]="stringValue()"
              (ngModelChange)="valueChange.emit($event)"
            >
              <option value="">{{ 'deviations.dynamicField.choose' | transloco }}</option>
              @for (option of field().options ?? []; track option) {
                <option [value]="option">{{ option }}</option>
              }
            </select>
          }
          @case ('multiselect') {
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group">
              @for (option of field().options ?? []; track option) {
                <label
                  class="flex min-h-10 cursor-pointer items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                >
                  <input
                    type="checkbox"
                    [checked]="isSelected(option)"
                    (change)="toggleOption(option)"
                    class="h-4 w-4 accent-[var(--accent)]"
                  />
                  {{ option }}
                </label>
              }
            </div>
          }
          @default {
            @if (field().type === 'user' || field().type === 'department') {
              <select
                [id]="controlId()"
                [ngModel]="stringValue()"
                (ngModelChange)="valueChange.emit($event)"
              >
                <option value="">{{ 'deviations.dynamicField.choose' | transloco }}</option>
                @for (option of options(); track option.id) {
                  <option [value]="option.id">{{ option.name }}</option>
                }
              </select>
            } @else {
              <input
                [id]="controlId()"
                type="text"
                [ngModel]="stringValue()"
                (ngModelChange)="valueChange.emit($event)"
                [placeholder]="field().placeholder ?? ''"
                autocomplete="off"
              />
            }
          }
        }
      </app-form-field>
    }
  `,
})
export class DynamicField {
  readonly field = input.required<FieldDef>();
  readonly value = input<unknown>();
  /** Option lists for `user` / `department` fields (org users / departments). */
  readonly options = input<readonly DynamicFieldOption[]>([]);
  /** i18n key of the validation message to show under the control. */
  readonly error = input<string | null>(null);

  readonly valueChange = output<unknown>();

  protected readonly controlId = computed(() => `dyn-${this.field().key}`);

  protected readonly stringValue = computed(() => {
    const v = this.value();
    return v === null || v === undefined ? '' : String(v);
  });

  protected readonly booleanValue = computed(() => this.value() === true);

  private readonly selectedValues = computed<readonly string[]>(() => {
    const v = this.value();
    return Array.isArray(v) ? v.map((item) => String(item)) : [];
  });

  protected isSelected(option: string): boolean {
    return this.selectedValues().includes(option);
  }

  protected toggleOption(option: string): void {
    const current = this.selectedValues();
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    this.valueChange.emit(next);
  }
}

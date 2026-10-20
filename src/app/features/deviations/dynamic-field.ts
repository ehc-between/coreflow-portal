import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldDef } from '../../core/deviations/deviation.models';

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
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1.5">
      @if (field().type !== 'checkbox') {
        <label [attr.for]="controlId()" class="text-[13px] font-semibold text-fg-muted">
          {{ field().label }}
          @if (field().required) {
            <span class="text-fail" aria-hidden="true">*</span>
          }
        </label>
      }

      @switch (field().type) {
        @case ('textarea') {
          <textarea
            [id]="controlId()"
            [ngModel]="stringValue()"
            (ngModelChange)="valueChange.emit($event)"
            [placeholder]="field().placeholder ?? ''"
            rows="3"
            class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          ></textarea>
        }
        @case ('number') {
          <input
            [id]="controlId()"
            type="number"
            [ngModel]="value()"
            (ngModelChange)="valueChange.emit($event)"
            [placeholder]="field().placeholder ?? ''"
            class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
        }
        @case ('date') {
          <input
            [id]="controlId()"
            type="date"
            [ngModel]="stringValue()"
            (ngModelChange)="valueChange.emit($event)"
            class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
        }
        @case ('select') {
          <div class="cf-select">
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
          </div>
        }
        @case ('multiselect') {
          <div class="flex flex-wrap gap-x-4 gap-y-2">
            @for (option of field().options ?? []; track option) {
              <label class="flex cursor-pointer items-center gap-2 text-[13.5px] text-fg">
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
        @case ('checkbox') {
          <label class="flex cursor-pointer items-center gap-2 text-[13.5px] text-fg">
            <input
              [id]="controlId()"
              type="checkbox"
              [ngModel]="booleanValue()"
              (ngModelChange)="valueChange.emit($event)"
              class="h-4 w-4 accent-[var(--accent)]"
            />
            {{ field().label }}
            @if (field().required) {
              <span class="text-fail" aria-hidden="true">*</span>
            }
          </label>
        }
        @default {
          @if (field().type === 'user' || field().type === 'department') {
            <div class="cf-select">
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
            </div>
          } @else {
            <input
              [id]="controlId()"
              type="text"
              [ngModel]="stringValue()"
              (ngModelChange)="valueChange.emit($event)"
              [placeholder]="field().placeholder ?? ''"
              autocomplete="off"
              class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
            />
          }
        }
      }

      @if (field().help) {
        <p class="text-[12px] text-fg-subtle">{{ field().help }}</p>
      }
      @if (error()) {
        <p class="text-[12px] font-medium text-fail">{{ error()! | transloco }}</p>
      }
    </div>
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
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

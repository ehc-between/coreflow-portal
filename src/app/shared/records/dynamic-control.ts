import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { localize } from '../../core/records/localized';
import { FieldSpec } from '../../core/records/record.models';
import { FormField } from '../ui/form-field/form-field';
import { DynamicValue } from './dynamic-value';
import { PickOption, dataErrorKey, optionList } from './form-model';

let nextId = 0;

/**
 * One record-type field (`FieldSpec`, contracts 7.1) as its matching control.
 * Presentational: the host owns the value. Labels, help and placeholders are
 * localized; validation codes render under the control and are linked with
 * `aria-describedby`. Calculated fields are read-only (computed live, the
 * server recomputes on save). Strings use the `records` scope, which the
 * hosting `<app-dynamic-form>` provides.
 */
@Component({
  selector: 'app-dynamic-control',
  imports: [FormsModule, TranslocoPipe, FormField, DynamicValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = field();
    <div class="flex flex-col gap-1.5" [attr.data-field]="f.key">
      @if (f.type !== 'checkbox') {
        <label [attr.for]="controlId" class="text-[13px] font-semibold text-fg-muted">
          {{ label() }}
          @if (f.required) {
            <span class="text-fail" aria-hidden="true">*</span>
            <span class="sr-only">{{ 'records.form.required' | transloco }}</span>
          }
        </label>
      }

      @if (readonly() || f.type === 'calculated') {
        <div
          [id]="controlId"
          class="min-h-10 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[13.5px] text-fg"
        >
          <app-dynamic-value
            [field]="f"
            [value]="value()"
            [lang]="lang()"
            [people]="people()"
            [departments]="departments()"
            [attachments]="attachments()"
          />
        </div>
        @if (f.type === 'calculated' && !readonly()) {
          <p class="text-[12px] text-fg-subtle">
            {{ 'records.form.calculatedHint' | transloco: { formula: f.formula ?? '' } }}
          </p>
        }
      } @else {
        <app-form-field>
          @switch (f.type) {
            @case ('textarea') {
              <textarea
                [id]="controlId"
                rows="3"
                [ngModel]="text()"
                (ngModelChange)="valueChange.emit($event)"
                [placeholder]="placeholder()"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
                [attr.aria-required]="f.required || null"
              ></textarea>
            }
            @case ('richtext') {
              <textarea
                [id]="controlId"
                rows="6"
                [ngModel]="text()"
                (ngModelChange)="valueChange.emit($event)"
                [placeholder]="placeholder()"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
                [attr.aria-required]="f.required || null"
              ></textarea>
            }
            @case ('number') {
              <input
                [id]="controlId"
                type="number"
                [attr.min]="f.min ?? null"
                [attr.max]="f.max ?? null"
                [ngModel]="value()"
                (ngModelChange)="emitNumber($event)"
                [placeholder]="placeholder()"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
                [attr.aria-required]="f.required || null"
              />
            }
            @case ('date') {
              <input
                [id]="controlId"
                type="date"
                [ngModel]="text()"
                (ngModelChange)="valueChange.emit($event || null)"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
                [attr.aria-required]="f.required || null"
              />
            }
            @case ('datetime') {
              <input
                [id]="controlId"
                type="datetime-local"
                [ngModel]="dateTimeLocal()"
                (ngModelChange)="emitDateTime($event)"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
                [attr.aria-required]="f.required || null"
              />
            }
            @case ('select') {
              <select
                [id]="controlId"
                [ngModel]="text()"
                (ngModelChange)="valueChange.emit($event || null)"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
                [attr.aria-required]="f.required || null"
              >
                <option value="">{{ 'records.form.choose' | transloco }}</option>
                @for (option of options(); track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            }
            @case ('multiselect') {
              <fieldset
                [id]="controlId"
                class="flex flex-wrap gap-x-4 gap-y-2"
                [attr.aria-describedby]="describedBy()"
              >
                <legend class="sr-only">{{ label() }}</legend>
                @for (option of options(); track option.value) {
                  <label class="flex cursor-pointer items-center gap-2 text-[13.5px] text-fg">
                    <input
                      type="checkbox"
                      class="!h-4 !w-4 accent-[var(--accent)]"
                      [checked]="selected().includes(option.value)"
                      (change)="toggle(option.value)"
                    />
                    {{ option.label }}
                  </label>
                }
              </fieldset>
            }
            @case ('checkbox') {
              <label class="flex cursor-pointer items-center gap-2 text-[13.5px] text-fg">
                <input
                  [id]="controlId"
                  type="checkbox"
                  class="!h-4 !w-4 accent-[var(--accent)]"
                  [ngModel]="value() === true"
                  (ngModelChange)="valueChange.emit($event)"
                  [attr.aria-describedby]="describedBy()"
                />
                {{ label() }}
                @if (f.required) {
                  <span class="text-fail" aria-hidden="true">*</span>
                }
              </label>
            }
            @case ('user') {
              <select
                [id]="controlId"
                [ngModel]="text()"
                (ngModelChange)="valueChange.emit($event || null)"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
              >
                <option value="">{{ 'records.form.choosePerson' | transloco }}</option>
                @for (option of people(); track option.id) {
                  <option [value]="option.id">{{ option.name }}</option>
                }
              </select>
            }
            @case ('department') {
              <select
                [id]="controlId"
                [ngModel]="text()"
                (ngModelChange)="valueChange.emit($event || null)"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
              >
                <option value="">{{ 'records.form.chooseDepartment' | transloco }}</option>
                @for (option of departments(); track option.id) {
                  <option [value]="option.id">{{ option.name }}</option>
                }
              </select>
            }
            @case ('file') {
              @if (attachments().length) {
                <select
                  [id]="controlId"
                  [ngModel]="text()"
                  (ngModelChange)="valueChange.emit($event || null)"
                  [attr.aria-describedby]="describedBy()"
                  [attr.aria-invalid]="!!error()"
                >
                  <option value="">{{ 'records.form.chooseFile' | transloco }}</option>
                  @for (option of attachments(); track option.id) {
                    <option [value]="option.id">{{ option.name }}</option>
                  }
                </select>
              } @else {
                <p [id]="controlId" class="text-[12.5px] text-fg-subtle">
                  {{ 'records.form.fileHint' | transloco }}
                </p>
              }
            }
            @case ('entity_ref') {
              <input
                [id]="controlId"
                type="text"
                autocomplete="off"
                [ngModel]="entityId()"
                (ngModelChange)="emitEntityRef($event)"
                [placeholder]="'records.form.entityIdPlaceholder' | transloco"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
              />
            }
            @default {
              <input
                [id]="controlId"
                type="text"
                autocomplete="off"
                [attr.maxlength]="f.max ?? null"
                [ngModel]="text()"
                (ngModelChange)="valueChange.emit($event)"
                [placeholder]="placeholder()"
                [attr.aria-describedby]="describedBy()"
                [attr.aria-invalid]="!!error()"
                [attr.aria-required]="f.required || null"
              />
            }
          }
        </app-form-field>
      }

      @if (help()) {
        <p [id]="helpId" class="text-[12px] text-fg-subtle">{{ help() }}</p>
      }
      @if (error()) {
        <p [id]="errorId" class="text-[12px] font-medium text-fail">
          {{ errorKey() | transloco }}
        </p>
      }
    </div>
  `,
})
export class DynamicControl {
  readonly field = input.required<FieldSpec>();
  readonly value = input<unknown>(null);
  readonly lang = input('en');
  readonly readonly = input(false);
  /** A validation code (`required`, `invalid_option`, …) to show under the control. */
  readonly error = input<string | null>(null);
  readonly people = input<readonly PickOption[]>([]);
  readonly departments = input<readonly PickOption[]>([]);
  readonly attachments = input<readonly PickOption[]>([]);

  readonly valueChange = output<unknown>();

  private readonly uid = nextId++;
  protected readonly controlId = `dyn-control-${this.uid}`;
  protected readonly helpId = `${this.controlId}-help`;
  protected readonly errorId = `${this.controlId}-error`;

  protected readonly label = computed(() => localize(this.field().label, this.lang()));
  protected readonly help = computed(() => localize(this.field().help, this.lang()));
  protected readonly placeholder = computed(() => localize(this.field().placeholder, this.lang()));
  protected readonly options = computed(() => optionList(this.field(), this.lang()));
  protected readonly errorKey = computed(() => dataErrorKey(this.error() ?? ''));

  protected readonly describedBy = computed(() => {
    const ids = [this.help() ? this.helpId : null, this.error() ? this.errorId : null];
    return ids.filter(Boolean).join(' ') || null;
  });

  protected readonly text = computed(() => {
    const v = this.value();
    return v === null || v === undefined ? '' : String(v);
  });

  protected readonly selected = computed<readonly string[]>(() => {
    const v = this.value();
    return Array.isArray(v) ? v.map(String) : [];
  });

  /** ISO naive-UTC `YYYY-MM-DDTHH:MM[:SS]` shown in the browser's local time. */
  protected readonly dateTimeLocal = computed(() => {
    const v = this.value();
    if (typeof v !== 'string' || !v) {
      return '';
    }
    const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}`;
  });

  protected readonly entityId = computed(() => {
    const v = this.value() as { entity_id?: unknown } | null;
    return v && typeof v === 'object' && typeof v.entity_id === 'string' ? v.entity_id : '';
  });

  protected emitNumber(raw: unknown): void {
    if (raw === '' || raw === null || raw === undefined) {
      this.valueChange.emit(null);
      return;
    }
    const n = typeof raw === 'number' ? raw : Number(raw);
    this.valueChange.emit(Number.isFinite(n) ? n : null);
  }

  protected emitDateTime(raw: string): void {
    if (!raw) {
      this.valueChange.emit(null);
      return;
    }
    const date = new Date(raw);
    this.valueChange.emit(
      Number.isNaN(date.getTime()) ? null : date.toISOString().replace(/\.\d{3}Z$/, ''),
    );
  }

  protected emitEntityRef(raw: string): void {
    const id = raw.trim();
    const entityType = this.field().entity_type ?? '';
    this.valueChange.emit(id ? { entity_type: entityType, entity_id: id } : null);
  }

  protected toggle(option: string): void {
    const current = this.selected();
    this.valueChange.emit(
      current.includes(option) ? current.filter((o) => o !== option) : [...current, option],
    );
  }
}

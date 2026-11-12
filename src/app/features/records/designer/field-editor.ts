import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { localize } from '../../../core/records/localized';
import {
  FIELD_TYPES,
  FieldOption,
  FieldSpec,
  FieldType,
  LocalizedText,
} from '../../../core/records/record.models';
import { Badge } from '../../../shared/ui/badge/badge';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { NUMERIC_TYPES, OPTION_TYPES, SectionDraft, uniqueKey } from '../designer-model';
import { RecordsFieldHelp } from '../guidance/records-guidance';
import { LocalizedInput } from './localized-input';

let nextId = 0;

const TEXT_TYPES: readonly FieldType[] = ['text', 'textarea', 'richtext'];

/**
 * One field in the field builder: a summary row (label, type, key, required)
 * with move / remove buttons, expanding into the full editor for every
 * property of contracts 7.1. Emits a whole new `FieldSpec` on each change.
 */
@Component({
  selector: 'app-field-editor',
  imports: [FormsModule, TranslocoPipe, Badge, FormField, Icon, LocalizedInput, RecordsFieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = field();
    <div
      class="rounded-tile border bg-surface"
      [class]="issues().length ? 'border-fail/50' : 'border-border'"
    >
      <div class="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 text-left"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="bodyId"
          (click)="toggled.emit()"
        >
          <span class="flex text-fg-subtle transition-transform" [class.rotate-90]="expanded()">
            <app-icon name="chevron" [size]="14" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13.5px] font-semibold text-fg">
              {{ displayLabel() || ('records.fields.untitled' | transloco) }}
              @if (f.required) {
                <span class="text-fail" aria-hidden="true">*</span>
              }
            </span>
            <span class="block truncate font-mono text-[11.5px] text-fg-subtle">{{ f.key }}</span>
          </span>
          <app-badge tone="neutral">{{ 'records.fieldTypes.' + f.type | transloco }}</app-badge>
        </button>
        @if (!readonly()) {
          <button
            type="button"
            class="flex rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-40"
            [disabled]="first()"
            [attr.aria-label]="'records.fields.moveUp' | transloco: { name: displayLabel() }"
            (click)="move.emit(-1)"
          >
            <span class="flex -rotate-90"><app-icon name="chevron" [size]="14" /></span>
          </button>
          <button
            type="button"
            class="flex rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-40"
            [disabled]="last()"
            [attr.aria-label]="'records.fields.moveDown' | transloco: { name: displayLabel() }"
            (click)="move.emit(1)"
          >
            <span class="flex rotate-90"><app-icon name="chevron" [size]="14" /></span>
          </button>
          <button
            type="button"
            class="flex rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail"
            [attr.aria-label]="'records.fields.remove' | transloco: { name: displayLabel() }"
            (click)="remove.emit()"
          >
            <app-icon name="trash" [size]="14" />
          </button>
        }
      </div>

      @if (issues().length) {
        <ul class="px-3 pb-2 text-[12px] font-medium text-fail">
          @for (code of issues(); track code) {
            <li>{{ 'records.issues.' + code | transloco }}</li>
          }
        </ul>
      }

      @if (expanded()) {
        <div
          [id]="bodyId"
          class="grid grid-cols-1 gap-4 border-t border-border px-3 py-4 sm:grid-cols-2"
        >
          <fieldset class="contents" [disabled]="readonly()">
            <div class="sm:col-span-2">
              <app-localized-input
                [label]="'records.fields.label' | transloco"
                [required]="true"
                [value]="f.label"
                (valueChange)="patch({ label: $event ?? '' })"
              />
            </div>

            <app-form-field [label]="'records.fields.key' | transloco" [inputId]="id + '-key'">
              <input
                [id]="id + '-key'"
                type="text"
                autocomplete="off"
                maxlength="64"
                class="font-mono"
                [ngModel]="f.key"
                (ngModelChange)="patch({ key: $event })"
                [attr.aria-describedby]="id + '-key-help'"
              />
              <p [id]="id + '-key-help'" class="text-[11.5px] text-fg-subtle">
                {{ 'records.fields.keyHelp' | transloco }}
              </p>
            </app-form-field>

            <app-form-field [label]="'records.fields.type' | transloco" [inputId]="id + '-type'">
              <select [id]="id + '-type'" [ngModel]="f.type" (ngModelChange)="changeType($event)">
                @for (type of types; track type) {
                  <option [value]="type">{{ 'records.fieldTypes.' + type | transloco }}</option>
                }
              </select>
              <app-records-field-help page="designer" [field]="'type_' + f.type" />
            </app-form-field>

            <app-form-field [label]="'records.fields.width' | transloco" [inputId]="id + '-width'">
              <select
                [id]="id + '-width'"
                [ngModel]="f.width ?? 'full'"
                (ngModelChange)="patch({ width: $event })"
              >
                <option value="full">{{ 'records.fields.widthFull' | transloco }}</option>
                <option value="half">{{ 'records.fields.widthHalf' | transloco }}</option>
              </select>
            </app-form-field>

            <app-form-field
              [label]="'records.fields.section' | transloco"
              [inputId]="id + '-section'"
            >
              <select
                [id]="id + '-section'"
                [ngModel]="f.section ?? sections()[0]?.key"
                (ngModelChange)="patch({ section: $event })"
              >
                @for (section of sections(); track section.key) {
                  <option [value]="section.key">{{ sectionName(section) }}</option>
                }
              </select>
            </app-form-field>

            @if (f.type !== 'calculated') {
              <label class="flex items-center gap-2 self-end pb-2.5 text-[13.5px] text-fg">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [ngModel]="!!f.required"
                  (ngModelChange)="patch({ required: $event })"
                />
                {{ 'records.fields.required' | transloco }}
              </label>
            }

            <div class="sm:col-span-2">
              <app-localized-input
                [label]="'records.fields.help' | transloco"
                [multiline]="true"
                [value]="f.help"
                (valueChange)="patch({ help: $event })"
              />
            </div>

            @if (isText() || f.type === 'number') {
              <div class="sm:col-span-2">
                <app-localized-input
                  [label]="'records.fields.placeholder' | transloco"
                  [value]="f.placeholder"
                  (valueChange)="patch({ placeholder: $event })"
                />
              </div>
            }

            @if (isText() || f.type === 'number') {
              <app-form-field
                [label]="
                  (f.type === 'number' ? 'records.fields.min' : 'records.fields.minLength')
                    | transloco
                "
                [inputId]="id + '-min'"
              >
                <input
                  [id]="id + '-min'"
                  type="number"
                  [ngModel]="f.min ?? null"
                  (ngModelChange)="patch({ min: toNumber($event) })"
                />
              </app-form-field>
              <app-form-field
                [label]="
                  (f.type === 'number' ? 'records.fields.max' : 'records.fields.maxLength')
                    | transloco
                "
                [inputId]="id + '-max'"
              >
                <input
                  [id]="id + '-max'"
                  type="number"
                  [ngModel]="f.max ?? null"
                  (ngModelChange)="patch({ max: toNumber($event) })"
                />
              </app-form-field>
            }

            @if (f.type === 'entity_ref') {
              <app-form-field
                [label]="'records.fields.entityType' | transloco"
                [inputId]="id + '-entity'"
              >
                <input
                  [id]="id + '-entity'"
                  type="text"
                  autocomplete="off"
                  maxlength="32"
                  class="font-mono"
                  [ngModel]="f.entity_type ?? ''"
                  (ngModelChange)="patch({ entity_type: $event })"
                  placeholder="risk"
                />
              </app-form-field>
            }

            @if (f.type === 'calculated') {
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'records.fields.formula' | transloco"
                  [inputId]="id + '-formula'"
                >
                  <input
                    [id]="id + '-formula'"
                    type="text"
                    autocomplete="off"
                    maxlength="500"
                    class="font-mono"
                    [ngModel]="f.formula ?? ''"
                    (ngModelChange)="patch({ formula: $event })"
                    [attr.aria-describedby]="id + '-formula-help'"
                    placeholder="likelihood * consequence"
                  />
                  <p [id]="id + '-formula-help'" class="text-[11.5px] text-fg-subtle">
                    {{
                      'records.fields.formulaHelp'
                        | transloco: { fields: numericKeys().join(', ') || '—' }
                    }}
                  </p>
                </app-form-field>
              </div>
            }

            @if (hasOptions()) {
              <div class="sm:col-span-2">
                <p class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                  {{ 'records.fields.options' | transloco }}
                </p>
                <ul class="flex flex-col gap-2">
                  @for (option of options(); track $index; let i = $index) {
                    <li
                      class="grid grid-cols-1 gap-2 rounded-tile border border-border p-2 sm:grid-cols-[160px_1fr_auto]"
                    >
                      <app-form-field
                        [label]="'records.fields.optionValue' | transloco"
                        [inputId]="id + '-opt-' + i"
                      >
                        <input
                          [id]="id + '-opt-' + i"
                          type="text"
                          autocomplete="off"
                          maxlength="200"
                          class="font-mono"
                          [ngModel]="option.value"
                          (ngModelChange)="setOption(i, { value: $event })"
                        />
                      </app-form-field>
                      <app-localized-input
                        [label]="'records.fields.optionLabel' | transloco"
                        [value]="option.label"
                        (valueChange)="setOption(i, { label: $event })"
                      />
                      @if (!readonly()) {
                        <button
                          type="button"
                          class="flex self-center rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail"
                          [attr.aria-label]="
                            'records.fields.removeOption' | transloco: { value: option.value }
                          "
                          (click)="removeOption(i)"
                        >
                          <app-icon name="x" [size]="14" />
                        </button>
                      }
                    </li>
                  }
                </ul>
                @if (!readonly()) {
                  <button
                    type="button"
                    class="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
                    (click)="addOption()"
                  >
                    <app-icon name="plus" [size]="14" />
                    {{ 'records.fields.addOption' | transloco }}
                  </button>
                }
              </div>
            }

            <div class="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
              <app-form-field
                [label]="'records.fields.visibleIf' | transloco"
                [inputId]="id + '-vis'"
              >
                <select
                  [id]="id + '-vis'"
                  [ngModel]="f.visible_if?.field ?? ''"
                  (ngModelChange)="setVisibleField($event)"
                >
                  <option value="">{{ 'records.fields.alwaysVisible' | transloco }}</option>
                  @for (other of otherFields(); track other.key) {
                    <option [value]="other.key">{{ fieldName(other) }}</option>
                  }
                </select>
              </app-form-field>
              @if (f.visible_if?.field) {
                <app-form-field
                  [label]="'records.fields.visibleEquals' | transloco"
                  [inputId]="id + '-vis-eq'"
                >
                  @if (conditionOptions().length) {
                    <select
                      [id]="id + '-vis-eq'"
                      [ngModel]="conditionValue()"
                      (ngModelChange)="setVisibleEquals($event)"
                    >
                      @for (opt of conditionOptions(); track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                      }
                    </select>
                  } @else {
                    <input
                      [id]="id + '-vis-eq'"
                      type="text"
                      autocomplete="off"
                      [ngModel]="conditionValue()"
                      (ngModelChange)="setVisibleEquals($event)"
                    />
                  }
                </app-form-field>
              }
            </div>
          </fieldset>
        </div>
      }
    </div>
  `,
})
export class FieldEditor {
  private readonly language = inject(LanguageService);

  readonly field = input.required<FieldSpec>();
  readonly allFields = input<readonly FieldSpec[]>([]);
  readonly sections = input<readonly SectionDraft[]>([]);
  readonly issues = input<readonly string[]>([]);
  readonly expanded = input(false);
  readonly readonly = input(false);
  readonly first = input(false);
  readonly last = input(false);

  readonly fieldChange = output<FieldSpec>();
  readonly remove = output<void>();
  readonly move = output<-1 | 1>();
  readonly toggled = output<void>();

  protected readonly id = `field-editor-${nextId++}`;
  protected readonly bodyId = `${this.id}-body`;
  protected readonly types = FIELD_TYPES;

  private readonly lang = this.language.active;
  protected readonly displayLabel = computed(() => localize(this.field().label, this.lang()));
  protected readonly isText = computed(() => TEXT_TYPES.includes(this.field().type));
  protected readonly hasOptions = computed(() => OPTION_TYPES.includes(this.field().type));
  protected readonly options = computed<FieldOption[]>(() =>
    (this.field().options ?? []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
  );
  protected readonly otherFields = computed(() =>
    this.allFields().filter((f) => f.key !== this.field().key),
  );
  /** Number fields defined before this one (the only ones a formula may use). */
  protected readonly numericKeys = computed(() => {
    const all = this.allFields();
    const index = all.findIndex((f) => f.key === this.field().key);
    return all
      .slice(0, index < 0 ? all.length : index)
      .filter((f) => NUMERIC_TYPES.includes(f.type))
      .map((f) => f.key);
  });
  private readonly conditionField = computed(() =>
    this.allFields().find((f) => f.key === this.field().visible_if?.field),
  );
  protected readonly conditionOptions = computed(() => {
    const target = this.conditionField();
    if (!target) {
      return [];
    }
    if (target.type === 'checkbox') {
      return [
        { value: 'true', label: '✓' },
        { value: 'false', label: '✗' },
      ];
    }
    if (OPTION_TYPES.includes(target.type)) {
      return (target.options ?? []).map((o) =>
        typeof o === 'string'
          ? { value: o, label: o }
          : { value: o.value, label: localize(o.label, this.lang()) || o.value },
      );
    }
    return [];
  });
  protected readonly conditionValue = computed(() => {
    const equals = this.field().visible_if?.equals;
    return equals === null || equals === undefined ? '' : String(equals);
  });

  protected fieldName(field: FieldSpec): string {
    return localize(field.label, this.lang()) || field.key;
  }

  protected sectionName(section: SectionDraft): string {
    return localize(section.label, this.lang()) || section.key;
  }

  protected patch(changes: Partial<FieldSpec>): void {
    this.fieldChange.emit({ ...this.field(), ...changes });
  }

  protected toNumber(raw: unknown): number | null {
    if (raw === '' || raw === null || raw === undefined) {
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  protected changeType(type: FieldType): void {
    const next: { -readonly [K in keyof FieldSpec]?: FieldSpec[K] } = { type };
    if (OPTION_TYPES.includes(type) && !this.field().options?.length) {
      next.options = [{ value: 'option_1', label: { en: 'Option 1', nb: 'Valg 1' } }];
    }
    if (type === 'calculated') {
      next.required = false;
    }
    this.patch(next);
  }

  protected setOption(
    index: number,
    changes: { value?: string; label?: LocalizedText | null },
  ): void {
    const options = this.options().map((o, i) => (i === index ? { ...o, ...changes } : o));
    this.patch({ options });
  }

  protected addOption(): void {
    const taken = this.options().map((o) => o.value);
    const value = uniqueKey(`option_${taken.length + 1}`, taken, 200);
    this.patch({ options: [...this.options(), { value, label: null }] });
  }

  protected removeOption(index: number): void {
    this.patch({ options: this.options().filter((_, i) => i !== index) });
  }

  protected setVisibleField(key: string): void {
    this.patch({ visible_if: key ? { field: key, equals: null } : null });
  }

  protected setVisibleEquals(raw: string): void {
    const target = this.conditionField();
    const equals = target?.type === 'checkbox' ? raw === 'true' : raw;
    this.patch({ visible_if: { field: this.field().visible_if!.field, equals } });
  }
}

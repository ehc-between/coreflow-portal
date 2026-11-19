import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { localize } from '../../core/records/localized';
import { FieldSpec, LayoutSection, RecordData } from '../../core/records/record.models';
import { DynamicControl } from './dynamic-control';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { MoreFields } from '../forms/more-fields';
import { isAdvanced } from '../forms/field-tier';
import {
  PickOption,
  ResolvedSection,
  isEmptyValue,
  isVisible,
  resolveSections,
  withCalculated,
} from './form-model';

/**
 * Renders a record type's fields in its layout sections (contracts 7.7):
 *
 *   <app-dynamic-form [fields]="version.fields" [layout]="version.layout"
 *     [value]="data()" [errors]="errors()" (valueChange)="data.set($event)" />
 *
 * Presentational and zoneless-safe: the host owns the data and receives a new
 * object on every change, with calculated fields recomputed. `visible_if`
 * hides fields (and their values stay untouched). Two-column sections collapse
 * to one column on small screens; `half` fields take one column, `full` both.
 * `readonly` turns it into the read view. Option lists for people,
 * departments and attachments are optional extras the host may pass.
 * U31: when editing, fields marked `advanced` are folded under "Flere felt (N)"
 * (`foldAdvanced`, on by default), so the first screen holds only required and
 * audit-relevant fields.
 */
@Component({
  selector: 'app-dynamic-form',
  imports: [TranslocoPipe, DynamicControl, MoreFields, NgTemplateOutlet],
  viewProviders: [provideSharedScope('records')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <ng-container *ngTemplateOutlet="sectionList; context: { $implicit: mainSections() }" />
      <app-more-fields [count]="advancedCount()" [open]="advancedOpen()">
        <div class="flex flex-col gap-6">
          <ng-container
            *ngTemplateOutlet="sectionList; context: { $implicit: advancedSections() }"
          />
        </div>
      </app-more-fields>
      @if (mainSections().length === 0 && advancedCount() === 0) {
        <p class="text-[13px] text-fg-muted">{{ 'records.form.noFields' | transloco }}</p>
      }
    </div>

    <ng-template #sectionList let-list>
      @for (section of asSections(list); track section.key) {
        <fieldset class="min-w-0">
          @if (section.label) {
            <legend class="mb-3 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
              {{ sectionLabel(section.label) }}
            </legend>
          }
          <div class="grid grid-cols-1 gap-4" [class.sm:grid-cols-2]="section.columns === 2">
            @for (field of section.fields; track field.key) {
              @if (visible(field)) {
                <div [class.sm:col-span-2]="section.columns === 2 && field.width !== 'half'">
                  <app-dynamic-control
                    [field]="field"
                    [value]="data()[field.key]"
                    [lang]="activeLang()"
                    [readonly]="readonly()"
                    [error]="errors()[field.key] ?? null"
                    [people]="people()"
                    [departments]="departments()"
                    [attachments]="attachments()"
                    (valueChange)="set(field.key, $event)"
                  />
                </div>
              }
            }
          </div>
        </fieldset>
      }
    </ng-template>
  `,
})
export class DynamicForm {
  private readonly language = inject(LanguageService);

  readonly fields = input.required<readonly FieldSpec[]>();
  readonly layout = input<readonly LayoutSection[] | null>(null);
  readonly value = input<RecordData>({});
  /** Per-field validation codes (`{key: code}`), e.g. from the validate endpoint. */
  readonly errors = input<Readonly<Record<string, string>>>({});
  readonly readonly = input(false);
  /** Label language; defaults to the active UI language. */
  readonly lang = input<string | null>(null);
  readonly people = input<readonly PickOption[]>([]);
  readonly departments = input<readonly PickOption[]>([]);
  readonly attachments = input<readonly PickOption[]>([]);
  /** U31: fold `advanced` fields under "Flere felt" while editing. */
  readonly foldAdvanced = input(true);

  readonly valueChange = output<Record<string, unknown>>();

  protected readonly activeLang = computed(() => this.lang() ?? this.language.active());
  private readonly folding = computed(() => this.foldAdvanced() && !this.readonly());
  private readonly folded = computed(() =>
    this.folding() ? this.fields().filter((field) => isAdvanced(field)) : [],
  );
  protected readonly mainSections = computed(() => {
    const folded = new Set(this.folded());
    return resolveSections(
      this.fields().filter((field) => !folded.has(field)),
      this.layout(),
    );
  });
  protected readonly advancedSections = computed(() =>
    resolveSections(this.folded(), this.layout()),
  );
  protected readonly advancedCount = computed(
    () => this.folded().filter((field) => isVisible(field, this.data())).length,
  );
  /** Open the fold when a folded field already has a value or an error. */
  protected readonly advancedOpen = computed(() =>
    this.folded().some(
      (field) => !isEmptyValue(this.data()[field.key]) || !!this.errors()[field.key],
    ),
  );
  protected readonly data = computed(() => withCalculated(this.fields(), this.value()));

  protected asSections(list: unknown): readonly ResolvedSection[] {
    return list as readonly ResolvedSection[];
  }

  protected visible(field: FieldSpec): boolean {
    return isVisible(field, this.data());
  }

  protected sectionLabel(label: Parameters<typeof localize>[0]): string {
    return localize(label, this.activeLang());
  }

  protected set(key: string, next: unknown): void {
    const data: Record<string, unknown> = { ...this.value(), [key]: next };
    if (next === null || next === undefined) {
      delete data[key];
    }
    this.valueChange.emit(withCalculated(this.fields(), data));
  }
}

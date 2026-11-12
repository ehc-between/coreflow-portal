import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { localize } from '../../core/records/localized';
import { FieldSpec, LayoutSection, RecordData } from '../../core/records/record.models';
import { DynamicControl } from './dynamic-control';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { PickOption, isVisible, resolveSections, withCalculated } from './form-model';

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
 */
@Component({
  selector: 'app-dynamic-form',
  imports: [TranslocoPipe, DynamicControl],
  viewProviders: [provideSharedScope('records')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      @for (section of sections(); track section.key) {
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
      } @empty {
        <p class="text-[13px] text-fg-muted">{{ 'records.form.noFields' | transloco }}</p>
      }
    </div>
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

  readonly valueChange = output<Record<string, unknown>>();

  protected readonly activeLang = computed(() => this.lang() ?? this.language.active());
  protected readonly sections = computed(() => resolveSections(this.fields(), this.layout()));
  protected readonly data = computed(() => withCalculated(this.fields(), this.value()));

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

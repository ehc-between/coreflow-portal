import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FIELD_TYPES, FieldIssue, FieldSpec, FieldType } from '../../../core/records/record.models';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionDraft, newField, uniqueKey } from '../designer-model';
import { RecordsFieldHelp } from '../guidance/records-guidance';
import { FieldEditor } from './field-editor';
import { LocalizedInput } from './localized-input';

let nextId = 0;

/**
 * Field builder + layout: the ordered field list (add by type, edit, move,
 * remove) and the layout sections (label, one or two columns). A field is
 * placed in a section through its `section`; the host builds the published
 * layout from both. Emits new arrays on every change.
 */
@Component({
  selector: 'app-field-builder',
  imports: [
    FormsModule,
    TranslocoPipe,
    Button,
    FormField,
    Icon,
    FieldEditor,
    LocalizedInput,
    RecordsFieldHelp,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <section [attr.aria-labelledby]="id + '-fields'">
        <div class="mb-2 flex flex-wrap items-end justify-between gap-3">
          <h3 [id]="id + '-fields'" class="font-display text-[15px] font-bold text-fg">
            {{ 'records.fields.title' | transloco }}
          </h3>
          @if (!readonly()) {
            <div class="flex items-end gap-2">
              <app-form-field
                [label]="'records.fields.addType' | transloco"
                [inputId]="id + '-add-type'"
              >
                <select
                  [id]="id + '-add-type'"
                  [ngModel]="addType()"
                  (ngModelChange)="addType.set($event)"
                >
                  @for (type of types; track type) {
                    <option [value]="type">{{ 'records.fieldTypes.' + type | transloco }}</option>
                  }
                </select>
              </app-form-field>
              <app-button variant="secondary" (click)="add()">
                <app-icon name="plus" [size]="14" />
                {{ 'records.fields.add' | transloco }}
              </app-button>
            </div>
          }
        </div>
        <app-records-field-help page="designer" field="fields" />
        <ul class="mt-2 flex flex-col gap-2">
          @for (field of fields(); track $index; let i = $index, first = $first, last = $last) {
            <li>
              <app-field-editor
                [field]="field"
                [allFields]="fields()"
                [sections]="sections()"
                [issues]="issuesFor(i)"
                [expanded]="expanded() === i"
                [readonly]="readonly()"
                [first]="first"
                [last]="last"
                (toggled)="expanded.set(expanded() === i ? null : i)"
                (fieldChange)="update(i, $event)"
                (move)="move(i, $event)"
                (remove)="removeAt(i)"
              />
            </li>
          } @empty {
            <li
              class="rounded-tile border border-dashed border-border px-4 py-6 text-center text-[13px] text-fg-muted"
            >
              {{ 'records.fields.empty' | transloco }}
            </li>
          }
        </ul>
      </section>

      <section [attr.aria-labelledby]="id + '-sections'">
        <div class="mb-2 flex items-center justify-between gap-3">
          <h3 [id]="id + '-sections'" class="font-display text-[15px] font-bold text-fg">
            {{ 'records.layout.title' | transloco }}
          </h3>
          @if (!readonly()) {
            <app-button variant="secondary" size="sm" (click)="addSection()">
              <app-icon name="plus" [size]="14" />
              {{ 'records.layout.add' | transloco }}
            </app-button>
          }
        </div>
        <app-records-field-help page="designer" field="layout" />
        <ul class="mt-2 flex flex-col gap-2">
          @for (section of sections(); track section.key; let i = $index) {
            <li class="rounded-tile border border-border bg-surface p-3">
              <fieldset
                class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_auto]"
                [disabled]="readonly()"
              >
                <app-localized-input
                  [label]="'records.layout.label' | transloco"
                  [value]="section.label"
                  (valueChange)="patchSection(i, { label: $event })"
                />
                <app-form-field
                  [label]="'records.layout.columns' | transloco"
                  [inputId]="id + '-cols-' + i"
                >
                  <select
                    [id]="id + '-cols-' + i"
                    [ngModel]="section.columns"
                    (ngModelChange)="patchSection(i, { columns: +$event === 2 ? 2 : 1 })"
                  >
                    <option [ngValue]="1">{{ 'records.layout.oneColumn' | transloco }}</option>
                    <option [ngValue]="2">{{ 'records.layout.twoColumns' | transloco }}</option>
                  </select>
                </app-form-field>
                @if (!readonly()) {
                  <button
                    type="button"
                    class="flex self-end rounded-[8px] p-2 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-40"
                    [disabled]="sections().length <= 1"
                    [attr.aria-label]="'records.layout.remove' | transloco"
                    (click)="removeSection(i)"
                  >
                    <app-icon name="trash" [size]="14" />
                  </button>
                }
              </fieldset>
              <p class="mt-1.5 text-[11.5px] text-fg-subtle">
                {{ 'records.layout.fieldCount' | transloco: { count: countIn(section.key, i) } }}
              </p>
            </li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class FieldBuilder {
  private readonly transloco = inject(TranslocoService);

  readonly fields = input.required<readonly FieldSpec[]>();
  readonly sections = input.required<readonly SectionDraft[]>();
  readonly issues = input<readonly FieldIssue[]>([]);
  readonly readonly = input(false);

  readonly fieldsChange = output<FieldSpec[]>();
  readonly sectionsChange = output<SectionDraft[]>();

  protected readonly id = `field-builder-${nextId++}`;
  protected readonly types = FIELD_TYPES;
  protected readonly addType = signal<FieldType>('text');
  protected readonly expanded = signal<number | null>(null);

  private readonly issuesByIndex = computed(() => {
    const map = new Map<number, string[]>();
    for (const issue of this.issues()) {
      if (issue.index === null || issue.index === undefined) {
        continue;
      }
      const list = map.get(issue.index) ?? [];
      if (!list.includes(issue.code)) {
        list.push(issue.code);
      }
      map.set(issue.index, list);
    }
    return map;
  });

  protected issuesFor(index: number): string[] {
    return this.issuesByIndex().get(index) ?? [];
  }

  protected countIn(sectionKey: string, index: number): number {
    const keys = new Set(this.sections().map((s) => s.key));
    return this.fields().filter((f) =>
      f.section && keys.has(f.section) ? f.section === sectionKey : index === 0,
    ).length;
  }

  protected add(): void {
    const type = this.addType();
    const label = this.transloco.translate(`records.fieldTypes.${type}`);
    const field = newField(
      type,
      this.fields().map((f) => f.key),
      { en: label, nb: label },
    );
    const section = this.sections()[this.sections().length - 1]?.key ?? null;
    this.fieldsChange.emit([...this.fields(), { ...field, section }]);
    this.expanded.set(this.fields().length);
  }

  protected update(index: number, field: FieldSpec): void {
    this.fieldsChange.emit(this.fields().map((f, i) => (i === index ? field : f)));
  }

  protected move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    const fields = [...this.fields()];
    if (target < 0 || target >= fields.length) {
      return;
    }
    [fields[index], fields[target]] = [fields[target], fields[index]];
    this.fieldsChange.emit(fields);
    if (this.expanded() === index) {
      this.expanded.set(target);
    }
  }

  protected removeAt(index: number): void {
    this.fieldsChange.emit(this.fields().filter((_, i) => i !== index));
    this.expanded.set(null);
  }

  protected addSection(): void {
    const key = uniqueKey(
      'section',
      this.sections().map((s) => s.key),
    );
    const label = this.transloco.translate('records.layout.newLabel');
    this.sectionsChange.emit([
      ...this.sections(),
      { key, label: { en: label, nb: label }, columns: 1 },
    ]);
  }

  protected patchSection(index: number, changes: Partial<SectionDraft>): void {
    this.sectionsChange.emit(
      this.sections().map((s, i) => (i === index ? { ...s, ...changes } : s)),
    );
  }

  protected removeSection(index: number): void {
    const removed = this.sections()[index];
    const rest = this.sections().filter((_, i) => i !== index);
    this.sectionsChange.emit(rest);
    if (removed && rest[0]) {
      this.fieldsChange.emit(
        this.fields().map((f) => (f.section === removed.key ? { ...f, section: rest[0].key } : f)),
      );
    }
  }
}

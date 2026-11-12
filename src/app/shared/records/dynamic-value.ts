import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldSpec } from '../../core/records/record.models';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../locale/locale-pipes';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { PickOption, isEmptyValue, optionList } from './form-model';

/**
 * Read view of one record-type field value (`<app-dynamic-value [field] [value]>`).
 * Resolves option labels, people / department / attachment names when the host
 * passes the lists, formats numbers and dates in the active locale and renders
 * rich text through Angular's HTML sanitiser (the server sanitises it too).
 */
@Component({
  selector: 'app-dynamic-value',
  imports: [TranslocoPipe, LocalDatePipe, LocalDayPipe, LocalNumberPipe],
  viewProviders: [provideSharedScope('records')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = value();
    @if (empty()) {
      <span class="text-fg-subtle">{{ 'records.form.emptyValue' | transloco }}</span>
    } @else {
      @switch (field().type) {
        @case ('checkbox') {
          {{ (v === true ? 'records.form.yes' : 'records.form.no') | transloco }}
        }
        @case ('number') {
          {{ $any(v) | localNumber }}
        }
        @case ('calculated') {
          {{ $any(v) | localNumber }}
        }
        @case ('date') {
          {{ $any(v) | localDay }}
        }
        @case ('datetime') {
          {{ $any(v) | localDate: 'medium' }}
        }
        @case ('richtext') {
          <div class="prose-sm max-w-none" [innerHTML]="v"></div>
        }
        @case ('textarea') {
          <span class="whitespace-pre-line">{{ v }}</span>
        }
        @case ('entity_ref') {
          <span class="font-mono text-[12.5px]">{{ entityText() }}</span>
        }
        @default {
          {{ display() }}
        }
      }
    }
  `,
})
export class DynamicValue {
  readonly field = input.required<FieldSpec>();
  readonly value = input<unknown>(null);
  readonly lang = input('en');
  readonly people = input<readonly PickOption[]>([]);
  readonly departments = input<readonly PickOption[]>([]);
  readonly attachments = input<readonly PickOption[]>([]);

  protected readonly empty = computed(() => isEmptyValue(this.value()));

  protected readonly entityText = computed(() => {
    const v = this.value() as { entity_type?: string; entity_id?: string } | null;
    return v ? `${v.entity_type ?? ''} ${v.entity_id ?? ''}`.trim() : '';
  });

  /** Text for option, reference and plain text values. */
  protected readonly display = computed(() => {
    const field = this.field();
    const v = this.value();
    const name = (list: readonly PickOption[]) =>
      list.find((option) => option.id === v)?.name ?? String(v);
    switch (field.type) {
      case 'select':
      case 'multiselect': {
        const labels = new Map(optionList(field, this.lang()).map((o) => [o.value, o.label]));
        const values = Array.isArray(v) ? v : [v];
        return values.map((item) => labels.get(String(item)) ?? String(item)).join(', ');
      }
      case 'user':
        return name(this.people());
      case 'department':
        return name(this.departments());
      case 'file':
        return name(this.attachments());
      default:
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
  });
}

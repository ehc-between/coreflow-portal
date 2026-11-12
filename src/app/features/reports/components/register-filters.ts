import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { labelOr, localized } from '../data/report-display';
import { Register, ReportFilters } from '../data/reports.models';
import { StandardOptions } from '../data/standard-options';

let nextId = 0;

/** `YYYY-MM-DD` of a stored naive datetime (or ''). */
export function dateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** A date input value as the API's naive datetime: start of day for `from`, end for `to`. */
export function dateFilterValue(day: string, edge: 'from' | 'to'): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null;
  }
  return edge === 'from' ? `${day}T00:00:00` : `${day}T23:59:59`;
}

/** Drop filters the register does not accept (the API rejects them with 422). */
export function supportedFilters(register: Register | null, filters: ReportFilters): ReportFilters {
  if (!register) {
    return {};
  }
  const accepts = (p: string) => register.params.includes(p);
  return {
    q: accepts('q') ? filters.q || null : null,
    status: accepts('status')
      ? (filters.status ?? []).filter((s) => register.statuses.includes(s))
      : [],
    from: accepts('from') ? filters.from || null : null,
    to: accepts('to') ? filters.to || null : null,
    standard_key: accepts('standard_key') ? filters.standard_key || null : null,
  };
}

/**
 * The filter fields a register accepts (`register.params`): search text, status
 * chips, a due/created date window and the standard. Emits the whole filter
 * object on every change. Used by the register explorer and the saved-report form.
 */
@Component({
  selector: 'app-register-filters',
  imports: [TranslocoPipe, FieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (register(); as reg) {
      <div class="grid gap-3 sm:grid-cols-2">
        @if (accepts('q')) {
          <div class="flex flex-col gap-1">
            <label [attr.for]="id + '-q'" class="text-[12.5px] font-semibold text-fg-muted">
              {{ 'reports.filters.q' | transloco }}
            </label>
            <input
              [id]="id + '-q'"
              type="search"
              class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
              [value]="value().q ?? ''"
              (change)="patch({ q: $any($event.target).value || null })"
              [placeholder]="'reports.filters.qPlaceholder' | transloco"
            />
          </div>
        }
        @if (accepts('standard_key')) {
          <div class="flex flex-col gap-1">
            <label [attr.for]="id + '-std'" class="text-[12.5px] font-semibold text-fg-muted">
              {{ 'reports.filters.standard' | transloco }}
              @if (reg.requires_standard) {
                <span class="text-fail" aria-hidden="true">*</span>
              }
            </label>
            <select
              [id]="id + '-std'"
              class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
              [attr.aria-required]="reg.requires_standard"
              (change)="patch({ standard_key: $any($event.target).value || null })"
            >
              <option value="" [selected]="!value().standard_key">
                {{
                  (reg.requires_standard
                    ? 'reports.filters.chooseStandard'
                    : 'reports.filters.anyStandard'
                  ) | transloco
                }}
              </option>
              @for (s of standards(); track s.standard_key) {
                <option
                  [value]="s.standard_key"
                  [selected]="s.standard_key === value().standard_key"
                >
                  {{ s.name }}
                </option>
              }
            </select>
            <app-field-help scope="reports" page="registers" field="standard" />
          </div>
        }
        @if (accepts('from')) {
          <div class="flex flex-col gap-1">
            <label [attr.for]="id + '-from'" class="text-[12.5px] font-semibold text-fg-muted">
              {{ 'reports.filters.from' | transloco }}
            </label>
            <input
              [id]="id + '-from'"
              type="date"
              class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
              [value]="day(value().from)"
              (change)="patch({ from: toFilter($any($event.target).value, 'from') })"
            />
          </div>
        }
        @if (accepts('to')) {
          <div class="flex flex-col gap-1">
            <label [attr.for]="id + '-to'" class="text-[12.5px] font-semibold text-fg-muted">
              {{ 'reports.filters.to' | transloco }}
            </label>
            <input
              [id]="id + '-to'"
              type="date"
              class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
              [value]="day(value().to)"
              (change)="patch({ to: toFilter($any($event.target).value, 'to') })"
            />
          </div>
        }
      </div>
      @if (accepts('status') && reg.statuses.length) {
        <fieldset class="mt-3">
          <legend class="mb-1 text-[12.5px] font-semibold text-fg-muted">
            {{ 'reports.filters.status' | transloco }}
          </legend>
          <div class="flex flex-wrap gap-1.5">
            @for (status of reg.statuses; track status) {
              <label
                class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium"
                [class]="
                  isChecked(status)
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border text-fg-muted hover:text-fg'
                "
              >
                <input
                  type="checkbox"
                  class="sr-only"
                  [checked]="isChecked(status)"
                  (change)="toggleStatus(status)"
                />
                {{ statusLabel(status) }}
              </label>
            }
          </div>
          <p class="mt-1 text-[11.5px] text-fg-subtle">
            {{ 'reports.filters.statusHint' | transloco }}
          </p>
        </fieldset>
      }
      @if (!reg.params.length) {
        <p class="text-[12.5px] text-fg-muted">
          {{ 'reports.filters.none' | transloco: { register: registerName() } }}
        </p>
      }
    }
  `,
})
export class RegisterFilters {
  private readonly language = inject(LanguageService);
  private readonly standardOptions = inject(StandardOptions);

  readonly register = input<Register | null>(null);
  readonly value = input<ReportFilters>({});
  readonly valueChange = output<ReportFilters>();

  protected readonly id = `cf-reg-filters-${++nextId}`;
  protected readonly standards = this.standardOptions.items;
  protected readonly registerName = computed(() =>
    localized(this.register()?.label, this.language.active(), this.register()?.key ?? ''),
  );

  constructor() {
    this.standardOptions.ensure();
  }

  protected accepts(param: string): boolean {
    return this.register()?.params.includes(param) ?? false;
  }

  protected day = dateInputValue;

  protected toFilter(day: string, edge: 'from' | 'to'): string | null {
    return dateFilterValue(day, edge);
  }

  protected isChecked(status: string): boolean {
    return (this.value().status ?? []).includes(status);
  }

  protected toggleStatus(status: string): void {
    const current = this.value().status ?? [];
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    this.patch({ status: next });
  }

  protected statusLabel(status: string): string {
    return labelOr((k) => this.language.translate(k), `reports.statuses.${status}`, status);
  }

  protected patch(change: Partial<ReportFilters>): void {
    this.valueChange.emit({ ...this.value(), ...change });
  }
}

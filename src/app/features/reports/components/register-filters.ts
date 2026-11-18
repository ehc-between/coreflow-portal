import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import { frameworkLabelKey, labelOr, localized } from '../data/report-display';
import { Register, ReportFilters } from '../data/reports.models';
import { StandardOptions } from '../data/standard-options';

let nextId = 0;

/** Date fields the backend names in `Register.date_field` (each has filter labels). */
export const DATE_FIELDS = [
  'due',
  'raised',
  'review',
  'completed',
  'linked',
  'evaluated',
  'evaluation',
  'measured',
  'planned',
  'period',
  'work',
  'aware',
  'end',
  'created',
] as const;

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

/** i18n key of a date filter label ("Frist fra" / "Meldt til"); unknown fields read "Fra" / "Til". */
export function dateFilterKey(dateField: string | null | undefined, edge: 'from' | 'to'): string {
  const known = (DATE_FIELDS as readonly string[]).includes(dateField ?? '');
  return known ? `reports.filters.dates.${dateField}.${edge}` : `reports.filters.${edge}`;
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

/** A register status in the UI language: the backend's words, else the portal's, else humanized. */
export function registerStatusLabel(
  register: Register | null,
  status: string,
  translate: (key: string) => string,
  lang: string,
): string {
  const own = localized(register?.status_labels?.[status], lang, '');
  return own || labelOr(translate, `reports.statuses.${status}`, status);
}

/**
 * The filter fields a register accepts (`register.params`): search text, the
 * standard, a date window named after the date it filters on ("Frist fra / til"),
 * and status chips in plain words. Emits the whole filter object on every change.
 * Used by the register explorer and the saved-report form.
 */
@Component({
  selector: 'app-register-filters',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (register(); as reg) {
      <div class="grid gap-3 sm:grid-cols-2">
        @if (accepts('q')) {
          <app-form-field [label]="'reports.filters.q' | transloco" [inputId]="id + '-q'">
            <input
              [id]="id + '-q'"
              type="search"
              [value]="value().q ?? ''"
              (change)="patch({ q: $any($event.target).value || null })"
              [placeholder]="'reports.filters.qPlaceholder' | transloco"
            />
          </app-form-field>
        }
        @if (accepts('standard_key')) {
          <div>
            <app-form-field
              [label]="
                (reg.requires_standard
                  ? 'reports.filters.standardRequired'
                  : 'reports.filters.standard'
                ) | transloco
              "
              [inputId]="id + '-std'"
            >
              <select
                [id]="id + '-std'"
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
                    {{ standardName(s.framework || s.standard_key) }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-field-help class="mt-1 block" scope="reports" page="registers" field="standard" />
          </div>
        }
        @if (accepts('from')) {
          <app-form-field [label]="fromLabel() | transloco" [inputId]="id + '-from'">
            <input
              [id]="id + '-from'"
              type="date"
              [attr.lang]="lang()"
              [value]="day(value().from)"
              (change)="patch({ from: toFilter($any($event.target).value, 'from') })"
            />
          </app-form-field>
        }
        @if (accepts('to')) {
          <app-form-field [label]="toLabel() | transloco" [inputId]="id + '-to'">
            <input
              [id]="id + '-to'"
              type="date"
              [attr.lang]="lang()"
              [value]="day(value().to)"
              (change)="patch({ to: toFilter($any($event.target).value, 'to') })"
            />
          </app-form-field>
        }
      </div>
      @if (accepts('status') && reg.statuses.length) {
        <fieldset class="mt-3">
          <legend class="mb-1 text-ui font-semibold text-fg-muted">
            {{ 'reports.filters.status' | transloco }}
          </legend>
          <div class="flex flex-wrap gap-1.5">
            @for (status of reg.statuses; track status) {
              <label
                class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-meta font-medium focus-within:ring-2 focus-within:ring-accent"
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
          <p class="mt-1 text-meta text-fg-subtle">
            {{ 'reports.filters.statusHint' | transloco }}
          </p>
        </fieldset>
      }
      @if (!reg.params.length) {
        <p class="text-ui text-fg-muted">
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
  protected readonly lang = computed(() => this.language.active());
  protected readonly registerName = computed(() =>
    localized(this.register()?.label, this.language.active(), this.register()?.key ?? ''),
  );
  protected readonly fromLabel = computed(() => dateFilterKey(this.register()?.date_field, 'from'));
  protected readonly toLabel = computed(() => dateFilterKey(this.register()?.date_field, 'to'));

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

  protected standardName(key: string): string {
    return labelOr((k) => this.language.translate(k), frameworkLabelKey(frameworkOf(key)), key);
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
    return registerStatusLabel(
      this.register(),
      status,
      (k) => this.language.translate(k),
      this.language.active(),
    );
  }

  protected patch(change: Partial<ReportFilters>): void {
    this.valueChange.emit({ ...this.value(), ...change });
  }
}

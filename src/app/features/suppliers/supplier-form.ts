import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import {
  DEFAULT_INTERVAL_MONTHS,
  blankToNull,
  dayToWire,
  splitList,
  wireToDay,
} from './data/supplier-display';
import {
  CRITICALITIES,
  Criticality,
  SUPPLIER_CATEGORIES,
  SUPPLIER_FLAGS,
  SupplierCategory,
  SupplierDetail,
  SupplierFields,
} from './data/supplier.models';
import { SupplierDepartmentSelect, SupplierUserSelect } from './shared/people-select';

/** What the form submits: the full field set plus, when editing, the change reason. */
export interface SupplierFormValue {
  readonly fields: SupplierFields;
  readonly changeReason: string | null;
}

interface Draft {
  name: string;
  category: SupplierCategory;
  criticality: Criticality;
  legal_name: string;
  registration_number: string;
  country: string;
  website: string;
  description: string;
  owner_user_id: string;
  department_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  processes_personal_data: boolean;
  has_system_access: boolean;
  provides_cloud_services: boolean;
  provides_ai: boolean;
  data_locations: string;
  certifications: string;
  evaluation_interval_months: string;
  next_evaluation_at: string;
}

export function draftFrom(s: SupplierDetail | null): Draft {
  return {
    name: s?.name ?? '',
    category: s?.category ?? 'other',
    criticality: s?.criticality ?? 'medium',
    legal_name: s?.legal_name ?? '',
    registration_number: s?.registration_number ?? '',
    country: s?.country ?? '',
    website: s?.website ?? '',
    description: s?.description ?? '',
    owner_user_id: s?.owner?.id ?? '',
    department_id: s?.department_id ?? '',
    contact_name: s?.contact_name ?? '',
    contact_email: s?.contact_email ?? '',
    contact_phone: s?.contact_phone ?? '',
    processes_personal_data: s?.processes_personal_data ?? false,
    has_system_access: s?.has_system_access ?? false,
    provides_cloud_services: s?.provides_cloud_services ?? false,
    provides_ai: s?.provides_ai ?? false,
    data_locations: (s?.data_locations ?? []).join(', '),
    certifications: (s?.certifications ?? []).join(', '),
    evaluation_interval_months: s?.evaluation_interval_months?.toString() ?? '',
    next_evaluation_at: wireToDay(s?.next_evaluation_at),
  };
}

/** The API field set of a draft (blank strings become null, lists are split). */
export function fieldsFrom(d: Draft): SupplierFields {
  const interval = Number.parseInt(d.evaluation_interval_months, 10);
  return {
    name: d.name.trim(),
    category: d.category,
    criticality: d.criticality,
    legal_name: blankToNull(d.legal_name),
    registration_number: blankToNull(d.registration_number),
    country: blankToNull(d.country)?.toUpperCase() ?? null,
    website: blankToNull(d.website),
    description: blankToNull(d.description),
    owner_user_id: d.owner_user_id || null,
    department_id: d.department_id || null,
    contact_name: blankToNull(d.contact_name),
    contact_email: blankToNull(d.contact_email),
    contact_phone: blankToNull(d.contact_phone),
    processes_personal_data: d.processes_personal_data,
    has_system_access: d.has_system_access,
    provides_cloud_services: d.provides_cloud_services,
    provides_ai: d.provides_ai,
    data_locations: splitList(d.data_locations),
    certifications: splitList(d.certifications),
    evaluation_interval_months: Number.isFinite(interval) ? interval : null,
    next_evaluation_at: dayToWire(d.next_evaluation_at),
  };
}

/**
 * Create / edit form of a supplier: identity, responsibility, contact, the risk
 * profile (personal data, system access, cloud, AI, data locations, certifications)
 * and the re-evaluation schedule. In edit mode it also asks for the reason for the
 * change (the supplier is a controlled record with revision history). Status is not
 * edited here: it changes through evaluations or the status action.
 */
@Component({
  selector: 'app-supplier-form',
  imports: [
    TranslocoPipe,
    AskAbout,
    Button,
    Card,
    FieldHelp,
    FormField,
    SupplierDepartmentSelect,
    SupplierUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
          {{ 'suppliers.form.sections.identity' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <app-form-field [label]="'suppliers.fields.name' | transloco" inputId="sup-name">
              <input
                id="sup-name"
                type="text"
                maxlength="255"
                required
                [attr.aria-invalid]="showErrors() && !d().name.trim()"
                aria-describedby="sup-name-err"
                [value]="d().name"
                (input)="set('name', $any($event.target).value)"
              />
            </app-form-field>
            @if (showErrors() && !d().name.trim()) {
              <p id="sup-name-err" class="mt-1 text-[12px] text-fail" role="alert">
                {{ 'suppliers.form.nameRequired' | transloco }}
              </p>
            }
          </div>
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="suppliers" page="form" field="category" />
            </div>
            <app-form-field [label]="'suppliers.fields.category' | transloco" inputId="sup-cat">
              <select id="sup-cat" (change)="set('category', $any($event.target).value)">
                @for (c of categories; track c) {
                  <option [value]="c" [selected]="d().category === c">
                    {{ 'suppliers.category.' + c | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="suppliers" page="form" field="criticality" />
              <app-ask-about
                [prompt]="'suppliers.ai.prompts.criticality' | transloco"
                field="criticality"
              />
            </div>
            <app-form-field [label]="'suppliers.fields.criticality' | transloco" inputId="sup-crit">
              <select id="sup-crit" (change)="set('criticality', $any($event.target).value)">
                @for (c of criticalities; track c) {
                  <option [value]="c" [selected]="d().criticality === c">
                    {{ 'suppliers.criticality.' + c | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <app-form-field [label]="'suppliers.fields.legalName' | transloco" inputId="sup-legal">
            <input
              id="sup-legal"
              type="text"
              maxlength="255"
              [value]="d().legal_name"
              (input)="set('legal_name', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field
            [label]="'suppliers.fields.registrationNumber' | transloco"
            inputId="sup-reg"
          >
            <input
              id="sup-reg"
              type="text"
              maxlength="64"
              [value]="d().registration_number"
              (input)="set('registration_number', $any($event.target).value)"
            />
          </app-form-field>
          <div>
            <app-form-field [label]="'suppliers.fields.country' | transloco" inputId="sup-country">
              <input
                id="sup-country"
                type="text"
                maxlength="2"
                autocomplete="country"
                class="uppercase"
                [attr.aria-invalid]="showErrors() && !countryValid()"
                aria-describedby="sup-country-hint"
                [value]="d().country"
                (input)="set('country', $any($event.target).value)"
              />
            </app-form-field>
            <p
              id="sup-country-hint"
              class="mt-1 text-[12px]"
              [class.text-fail]="showErrors() && !countryValid()"
              [class.text-fg-subtle]="!(showErrors() && !countryValid())"
            >
              {{ 'suppliers.form.countryHint' | transloco }}
            </p>
          </div>
          <app-form-field [label]="'suppliers.fields.website' | transloco" inputId="sup-web">
            <input
              id="sup-web"
              type="url"
              maxlength="500"
              [value]="d().website"
              (input)="set('website', $any($event.target).value)"
            />
          </app-form-field>
          <div class="sm:col-span-2">
            <app-form-field [label]="'suppliers.fields.description' | transloco" inputId="sup-desc">
              <textarea
                id="sup-desc"
                rows="4"
                maxlength="20000"
                [value]="d().description"
                (input)="set('description', $any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
          {{ 'suppliers.form.sections.responsibility' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="suppliers" page="form" field="owner" />
            </div>
            <app-form-field [label]="'suppliers.fields.owner' | transloco" inputId="sup-owner">
              <app-supplier-user-select
                inputId="sup-owner"
                [value]="d().owner_user_id"
                [currentName]="value()?.owner?.name ?? null"
                (valueChange)="set('owner_user_id', $event)"
              />
            </app-form-field>
          </div>
          <div>
            <app-form-field [label]="'suppliers.fields.department' | transloco" inputId="sup-dept">
              <app-supplier-department-select
                inputId="sup-dept"
                [value]="d().department_id"
                (valueChange)="set('department_id', $event)"
              />
            </app-form-field>
          </div>
          <app-form-field [label]="'suppliers.fields.contactName' | transloco" inputId="sup-cname">
            <input
              id="sup-cname"
              type="text"
              maxlength="255"
              autocomplete="off"
              [value]="d().contact_name"
              (input)="set('contact_name', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field
            [label]="'suppliers.fields.contactEmail' | transloco"
            inputId="sup-cemail"
          >
            <input
              id="sup-cemail"
              type="email"
              maxlength="320"
              autocomplete="off"
              [value]="d().contact_email"
              (input)="set('contact_email', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field
            [label]="'suppliers.fields.contactPhone' | transloco"
            inputId="sup-cphone"
          >
            <input
              id="sup-cphone"
              type="tel"
              maxlength="64"
              autocomplete="off"
              [value]="d().contact_phone"
              (input)="set('contact_phone', $any($event.target).value)"
            />
          </app-form-field>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-1 font-display text-[15px] font-bold text-fg">
          {{ 'suppliers.form.sections.profile' | transloco }}
        </h2>
        <p class="mb-3 text-[13px] text-fg-muted">
          {{ 'suppliers.form.profileHint' | transloco }}
        </p>
        <fieldset class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <legend class="sr-only">{{ 'suppliers.form.sections.profile' | transloco }}</legend>
          @for (flag of flags; track flag) {
            <div class="flex items-start gap-2">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 flex-none"
                [id]="'sup-flag-' + flag"
                [checked]="d()[flag]"
                (change)="set(flag, $any($event.target).checked)"
              />
              <label [for]="'sup-flag-' + flag" class="text-[13.5px] text-fg">
                {{ 'suppliers.flags.' + flag | transloco }}
              </label>
              <app-field-help scope="suppliers" page="form" [field]="flag" />
            </div>
          }
        </fieldset>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="suppliers" page="form" field="data_locations" />
            </div>
            <app-form-field
              [label]="'suppliers.fields.dataLocations' | transloco"
              inputId="sup-locs"
            >
              <input
                id="sup-locs"
                type="text"
                [placeholder]="'suppliers.form.listPlaceholder' | transloco"
                [value]="d().data_locations"
                (input)="set('data_locations', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="suppliers" page="form" field="certifications" />
            </div>
            <app-form-field
              [label]="'suppliers.fields.certifications' | transloco"
              inputId="sup-certs"
            >
              <input
                id="sup-certs"
                type="text"
                [placeholder]="'suppliers.form.certificationsPlaceholder' | transloco"
                [value]="d().certifications"
                (input)="set('certifications', $any($event.target).value)"
              />
            </app-form-field>
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
          {{ 'suppliers.form.sections.schedule' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="suppliers" page="form" field="evaluation_interval_months" />
            </div>
            <app-form-field
              [label]="'suppliers.fields.intervalMonths' | transloco"
              inputId="sup-interval"
            >
              <input
                id="sup-interval"
                type="number"
                min="1"
                max="60"
                aria-describedby="sup-interval-hint"
                [attr.aria-invalid]="showErrors() && !intervalValid()"
                [value]="d().evaluation_interval_months"
                (input)="set('evaluation_interval_months', $any($event.target).value)"
              />
            </app-form-field>
            <p
              id="sup-interval-hint"
              class="mt-1 text-[12px]"
              [class.text-fail]="showErrors() && !intervalValid()"
              [class.text-fg-subtle]="!(showErrors() && !intervalValid())"
            >
              {{ 'suppliers.form.intervalHint' | transloco: { months: defaultInterval() } }}
            </p>
          </div>
          <div>
            <app-form-field
              [label]="'suppliers.fields.nextEvaluation' | transloco"
              inputId="sup-next"
            >
              <input
                id="sup-next"
                type="date"
                aria-describedby="sup-next-hint"
                [value]="d().next_evaluation_at"
                (input)="set('next_evaluation_at', $any($event.target).value)"
              />
            </app-form-field>
            <p id="sup-next-hint" class="mt-1 text-[12px] text-fg-subtle">
              {{ 'suppliers.form.nextEvaluationHint' | transloco }}
            </p>
          </div>
        </div>
      </app-card>

      @if (editing()) {
        <app-card>
          <app-form-field [label]="'suppliers.form.changeReason' | transloco" inputId="sup-reason">
            <textarea
              id="sup-reason"
              rows="2"
              maxlength="2000"
              aria-describedby="sup-reason-hint"
              [value]="reason()"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <p id="sup-reason-hint" class="mt-1 text-[12px] text-fg-subtle">
            {{ 'suppliers.form.changeReasonHint' | transloco }}
          </p>
        </app-card>
      }

      <div class="flex flex-wrap items-center justify-end gap-2">
        <app-button variant="ghost" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()">
          {{ (editing() ? 'suppliers.form.save' : 'suppliers.form.create') | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class SupplierForm {
  /** The supplier being edited (null = a new supplier). */
  readonly value = input<SupplierDetail | null>(null);
  readonly busy = input(false);
  readonly submitted = output<SupplierFormValue>();
  readonly cancelled = output<void>();

  protected readonly categories = SUPPLIER_CATEGORIES;
  protected readonly criticalities = CRITICALITIES;
  protected readonly flags = SUPPLIER_FLAGS;

  protected readonly d = signal<Draft>(draftFrom(null));
  protected readonly reason = signal('');
  protected readonly showErrors = signal(false);
  protected readonly editing = computed(() => this.value() !== null);

  protected readonly defaultInterval = computed(
    () => DEFAULT_INTERVAL_MONTHS[this.d().criticality],
  );
  protected readonly countryValid = computed(() =>
    /^([A-Za-z]{2})?$/.test(this.d().country.trim()),
  );
  protected readonly intervalValid = computed(() => {
    const raw = this.d().evaluation_interval_months.trim();
    if (!raw) {
      return true;
    }
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 60;
  });

  constructor() {
    effect(() => {
      const value = this.value();
      untracked(() => this.d.set(draftFrom(value)));
    });
  }

  protected set<K extends keyof Draft>(key: K, value: Draft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected submit(): void {
    const d = this.d();
    if (!d.name.trim() || !this.countryValid() || !this.intervalValid()) {
      this.showErrors.set(true);
      return;
    }
    this.submitted.emit({ fields: fieldsFrom(d), changeReason: blankToNull(this.reason()) });
  }
}

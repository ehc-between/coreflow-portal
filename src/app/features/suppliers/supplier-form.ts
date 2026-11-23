import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { locationName } from '../../shared/locale/countries';
import { CountryPicker } from '../../shared/ui/country-picker/country-picker';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { Button } from '../../shared/ui/button/button';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { FormActions } from '../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../shared/ui/form-section/form-section';
import { FormField } from '../../shared/ui/form-field/form-field';
import {
  DEFAULT_INTERVAL_MONTHS,
  blankToNull,
  certificatesBody,
  dayToWire,
  wireToDay,
} from './data/supplier-display';
import {
  CRITICALITIES,
  CertificateIn,
  Criticality,
  SUPPLIER_CATEGORIES,
  SUPPLIER_FLAGS,
  SupplierCategory,
  SupplierDetail,
  SupplierFields,
  LocationOption,
} from './data/supplier.models';
import { SuppliersApi } from './data/suppliers-api';
import { SupplierCertificatesEditor, certificateRows } from './shared/certificates-editor';
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
  /** ISO 3166-1 alpha-2 codes (plus EU / EEA), picked from the location options. */
  data_locations: readonly string[];
  /** Structured certificate rows (the legacy free-text labels become rows by name). */
  certificates: readonly CertificateIn[];
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
    data_locations: [...(s?.data_locations ?? [])],
    certificates: certificateRows(s?.certificates, s?.certifications),
    evaluation_interval_months: s?.evaluation_interval_months?.toString() ?? '',
    next_evaluation_at: wireToDay(s?.next_evaluation_at),
  };
}

/** The API field set of a draft (blank strings become null, blank certificate rows drop). */
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
    data_locations: [
      ...new Set(d.data_locations.map((c) => c.trim().toUpperCase()).filter(Boolean)),
    ],
    certificates: certificatesBody(d.certificates),
    evaluation_interval_months: Number.isFinite(interval) ? interval : null,
    next_evaluation_at: dayToWire(d.next_evaluation_at),
  };
}

/**
 * Create / edit form of a supplier: identity, responsibility, contact, the risk
 * profile (personal data, system access, cloud, AI, data locations) with the
 * certificates the supplier holds (standard, number, issuer, expiry, file), and the
 * re-evaluation schedule. "Hvor kritisk er leverandøren?" explains each level and its
 * default re-evaluation interval. In edit mode it also asks for the reason for the
 * change (the supplier is a controlled record with revision history). Status is not
 * edited here: it changes through evaluations or the status action.
 */
@Component({
  selector: 'app-supplier-form',
  imports: [
    TranslocoPipe,
    AskAbout,
    Button,
    DateInput,
    FormActions,
    FormSection,
    CountryPicker,
    FieldHelp,
    FormField,
    SupplierCertificatesEditor,
    SupplierDepartmentSelect,
    SupplierUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-form-section
        [title]="'suppliers.form.sections.identity' | transloco"
        [description]="'suppliers.form.sections.identityHint' | transloco"
      >
        <app-form-field
          span="full"
          [label]="'suppliers.fields.name' | transloco"
          inputId="sup-name"
          [required]="true"
          [error]="
            showErrors() && !d().name.trim() ? ('suppliers.form.nameRequired' | transloco) : ''
          "
        >
          <input
            id="sup-name"
            type="text"
            maxlength="255"
            required
            [value]="d().name"
            (input)="set('name', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'suppliers.fields.category' | transloco" inputId="sup-cat">
          <app-field-help
            label-suffix
            scope="suppliers"
            page="form"
            field="category"
            [label]="'suppliers.fields.category' | transloco"
          />
          <select id="sup-cat" (change)="set('category', $any($event.target).value)">
            @for (c of categories; track c) {
              <option [value]="c" [selected]="d().category === c">
                {{ 'suppliers.category.' + c | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field
          [label]="'suppliers.form.criticalityQuestion' | transloco"
          inputId="sup-crit"
        >
          <app-field-help
            label-suffix
            scope="suppliers"
            page="form"
            field="criticality"
            [label]="'suppliers.fields.criticality' | transloco"
          />
          <app-ask-about
            label-suffix
            [prompt]="'suppliers.ai.prompts.criticality' | transloco"
            field="criticality"
            [fieldLabel]="'suppliers.fields.criticality' | transloco"
          />
          <select
            id="sup-crit"
            aria-describedby="sup-crit-hint"
            (change)="set('criticality', $any($event.target).value)"
          >
            @for (c of criticalities; track c) {
              <option [value]="c" [selected]="d().criticality === c">
                {{ 'suppliers.criticality.' + c | transloco }}
              </option>
            }
          </select>
          <p
            hint
            id="sup-crit-hint"
            class="text-meta leading-snug text-fg-subtle"
            data-testid="criticality-hint"
          >
            {{
              'suppliers.form.criticalityMeaning.' + d().criticality
                | transloco: { months: defaultInterval() }
            }}
          </p>
        </app-form-field>
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
        <app-form-field
          [label]="'suppliers.fields.country' | transloco"
          inputId="sup-country"
          [hint]="serverInvalid('country') ? '' : ('suppliers.form.countryHint' | transloco)"
          [error]="
            serverInvalid('country')
              ? ('suppliers.form.invalidCountry' | transloco: { values: rejected() })
              : ''
          "
        >
          <app-country-picker
            inputId="sup-country"
            [multiple]="false"
            [options]="countryCodes()"
            [value]="d().country ? [d().country] : []"
            [invalid]="countryInvalid()"
            (valueChange)="set('country', $event[0] ?? '')"
          />
        </app-form-field>
        <app-form-field [label]="'suppliers.fields.website' | transloco" inputId="sup-web">
          <input
            id="sup-web"
            type="url"
            maxlength="500"
            [value]="d().website"
            (input)="set('website', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'suppliers.fields.description' | transloco"
          inputId="sup-desc"
        >
          <textarea
            id="sup-desc"
            rows="4"
            maxlength="20000"
            [value]="d().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'suppliers.form.sections.responsibility' | transloco"
        [description]="'suppliers.form.sections.responsibilityHint' | transloco"
      >
        <app-form-field [label]="'suppliers.fields.owner' | transloco" inputId="sup-owner">
          <app-field-help
            label-suffix
            scope="suppliers"
            page="form"
            field="owner"
            [label]="'suppliers.fields.owner' | transloco"
          />
          <app-supplier-user-select
            inputId="sup-owner"
            [value]="d().owner_user_id"
            [currentName]="value()?.owner?.name ?? null"
            (valueChange)="set('owner_user_id', $event)"
          />
        </app-form-field>
        <app-form-field [label]="'suppliers.fields.department' | transloco" inputId="sup-dept">
          <app-supplier-department-select
            inputId="sup-dept"
            [value]="d().department_id"
            (valueChange)="set('department_id', $event)"
          />
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'suppliers.fields.contactName' | transloco"
          inputId="sup-cname"
        >
          <input
            id="sup-cname"
            type="text"
            maxlength="255"
            autocomplete="off"
            [value]="d().contact_name"
            (input)="set('contact_name', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'suppliers.fields.contactEmail' | transloco" inputId="sup-cemail">
          <input
            id="sup-cemail"
            type="email"
            maxlength="320"
            autocomplete="off"
            [value]="d().contact_email"
            (input)="set('contact_email', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'suppliers.fields.contactPhone' | transloco" inputId="sup-cphone">
          <input
            id="sup-cphone"
            type="tel"
            maxlength="64"
            autocomplete="off"
            [value]="d().contact_phone"
            (input)="set('contact_phone', $any($event.target).value)"
          />
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'suppliers.form.sections.profile' | transloco"
        [description]="'suppliers.form.profileHint' | transloco"
      >
        <fieldset class="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
          <legend class="sr-only">{{ 'suppliers.form.sections.profile' | transloco }}</legend>
          @for (flag of flags; track flag) {
            <div
              class="flex min-h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 py-2"
            >
              <input
                type="checkbox"
                class="h-4 w-4 flex-none accent-[var(--accent)]"
                [id]="'sup-flag-' + flag"
                [checked]="d()[flag]"
                (change)="set(flag, $any($event.target).checked)"
              />
              <label
                [for]="'sup-flag-' + flag"
                class="min-w-0 flex-1 cursor-pointer text-ui text-fg"
              >
                {{ 'suppliers.flags.' + flag | transloco }}
              </label>
              <app-field-help
                scope="suppliers"
                page="form"
                [field]="flag"
                [label]="'suppliers.flags.' + flag | transloco"
              />
            </div>
          }
        </fieldset>
        @if (profileNeeds().length) {
          <p
            class="rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted sm:col-span-2"
            data-testid="profile-needs"
          >
            {{ 'suppliers.form.profileNeeds' | transloco: { kinds: profileNeeds() } }}
          </p>
        }
        <app-form-field
          span="full"
          [label]="'suppliers.fields.dataLocations' | transloco"
          inputId="sup-locs"
        >
          <app-field-help
            label-suffix
            scope="suppliers"
            page="form"
            field="data_locations"
            [label]="'suppliers.fields.dataLocations' | transloco"
          />
          <app-ask-about
            label-suffix
            [prompt]="'suppliers.ai.prompts.dataLocations' | transloco"
            field="data_locations"
            [fieldLabel]="'suppliers.fields.dataLocations' | transloco"
          />
          <app-country-picker
            inputId="sup-locs"
            [label]="'suppliers.fields.dataLocations' | transloco"
            [options]="locationCodes()"
            [value]="d().data_locations"
            [flagged]="flaggedLocations()"
            [invalid]="serverInvalid('data_locations')"
            (valueChange)="set('data_locations', $event)"
          />
          <div hint class="flex flex-col gap-1 empty:hidden">
            @if (serverInvalid('data_locations')) {
              <p
                class="text-meta leading-snug font-medium text-fail-ink"
                role="alert"
                data-testid="locations-invalid"
              >
                {{ 'suppliers.form.invalidCountry' | transloco: { values: rejected() } }}
              </p>
            }
            @if (flaggedLocations().length) {
              <p class="text-meta leading-snug text-warn-ink" data-testid="locations-review">
                {{
                  'suppliers.form.locationsReview'
                    | transloco: { codes: flaggedLocations().join(', ') }
                }}
              </p>
            }
            @if (thirdCountries().length) {
              <p class="text-meta leading-snug text-warn-ink" data-testid="locations-transfer">
                {{
                  'suppliers.form.transferNeeded' | transloco: { countries: thirdCountryNames() }
                }}
              </p>
            }
          </div>
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'suppliers.fields.certifications' | transloco"
        [description]="'suppliers.certificates.hint' | transloco"
        [columns]="1"
      >
        <app-field-help
          title-suffix
          scope="suppliers"
          page="form"
          field="certifications"
          [label]="'suppliers.fields.certifications' | transloco"
        />
        <app-ask-about
          title-suffix
          [prompt]="'suppliers.ai.prompts.certificates' | transloco"
          field="certifications"
          [fieldLabel]="'suppliers.fields.certifications' | transloco"
        />
        <app-supplier-certificates-editor
          [rows]="d().certificates"
          [supplierId]="value()?.id ?? null"
          (rowsChange)="set('certificates', $event)"
        />
      </app-form-section>

      <app-form-section
        [title]="'suppliers.form.sections.schedule' | transloco"
        [description]="'suppliers.form.sections.scheduleHint' | transloco"
      >
        <app-form-field
          [label]="'suppliers.fields.intervalMonths' | transloco"
          inputId="sup-interval"
          [hint]="
            'suppliers.form.intervalHint'
              | transloco
                : {
                    months: defaultInterval(),
                    level: ('suppliers.criticality.' + d().criticality | transloco),
                  }
          "
          [error]="
            showErrors() && !intervalValid() ? ('suppliers.form.intervalInvalid' | transloco) : ''
          "
        >
          <app-field-help
            label-suffix
            scope="suppliers"
            page="form"
            field="evaluation_interval_months"
            [label]="'suppliers.fields.intervalMonths' | transloco"
          />
          <input
            id="sup-interval"
            type="number"
            min="1"
            max="60"
            [value]="d().evaluation_interval_months"
            (input)="set('evaluation_interval_months', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'suppliers.fields.nextEvaluation' | transloco"
          inputId="sup-next"
          [hint]="'suppliers.form.nextEvaluationHint' | transloco"
        >
          <app-date-input
            inputId="sup-next"
            [value]="d().next_evaluation_at"
            (valueChange)="set('next_evaluation_at', $event ?? '')"
          />
        </app-form-field>
      </app-form-section>

      @if (editing()) {
        <app-form-section [columns]="1">
          <app-form-field
            [label]="'suppliers.form.changeReason' | transloco"
            inputId="sup-reason"
            [hint]="'suppliers.form.changeReasonHint' | transloco"
          >
            <textarea
              id="sup-reason"
              rows="2"
              maxlength="2000"
              [value]="reason()"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
        </app-form-section>
      }

      <app-form-actions
        [message]="showErrors() && hasErrors() ? ('suppliers.form.fixErrors' | transloco) : ''"
      >
        <app-button variant="secondary" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()">
          {{ (editing() ? 'suppliers.form.save' : 'suppliers.form.create') | transloco }}
        </app-button>
      </app-form-actions>
    </form>
  `,
})
export class SupplierForm {
  /** The supplier being edited (null = a new supplier). */
  readonly value = input<SupplierDetail | null>(null);
  readonly busy = input(false);
  /** A 422 `invalid_country` from the last save: the field and the rejected entries. */
  readonly invalidCountry = input<{
    readonly field: string;
    readonly values: readonly string[];
  } | null>(null);
  readonly submitted = output<SupplierFormValue>();
  readonly cancelled = output<void>();

  protected readonly categories = SUPPLIER_CATEGORIES;
  protected readonly criticalities = CRITICALITIES;
  protected readonly flags = SUPPLIER_FLAGS;

  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly d = signal<Draft>(draftFrom(null));
  /** The picker's options (`GET /suppliers/location-options`). */
  protected readonly locationOptions = signal<readonly LocationOption[]>([]);
  protected readonly locationCodes = computed(() => this.locationOptions().map((o) => o.code));
  protected readonly countryCodes = computed(() =>
    this.locationOptions()
      .filter((o) => !o.region)
      .map((o) => o.code),
  );
  /** Stored locations the backend flagged for review that are still selected. */
  protected readonly flaggedLocations = computed(() => {
    const selected = this.d().data_locations;
    return (this.value()?.data_location_details ?? [])
      .filter((l) => l.needs_review && selected.includes(l.code))
      .map((l) => l.code);
  });
  /** Selected third-country locations of a supplier that processes personal data. */
  protected readonly thirdCountries = computed(() => {
    if (!this.d().processes_personal_data) {
      return [];
    }
    const zones = new Map(this.locationOptions().map((o) => [o.code, o.zone]));
    return this.d().data_locations.filter((c) => zones.get(c) === 'third_country');
  });
  protected readonly thirdCountryNames = computed(() =>
    this.thirdCountries()
      .map((c) => locationName(c, this.language))
      .join(', '),
  );
  protected readonly rejected = computed(() => (this.invalidCountry()?.values ?? []).join(', '));
  protected readonly countryInvalid = computed(
    () => (this.showErrors() && !this.countryValid()) || this.serverInvalid('country'),
  );
  protected readonly reason = signal('');
  protected readonly showErrors = signal(false);
  protected readonly editing = computed(() => this.value() !== null);

  protected readonly defaultInterval = computed(
    () => DEFAULT_INTERVAL_MONTHS[this.d().criticality],
  );
  protected readonly hasErrors = computed(
    () => !this.d().name.trim() || !this.countryValid() || !this.intervalValid(),
  );
  /** The assessments the ticked risk flags call for ("Personvernvurdering, Sikkerhetsvurdering"). */
  protected readonly profileNeeds = computed(() => {
    const d = this.d();
    const kinds = new Set<string>();
    if (d.processes_personal_data) {
      kinds.add('privacy');
    }
    if (d.has_system_access || d.provides_cloud_services) {
      kinds.add('security');
    }
    if (d.provides_ai) {
      kinds.add('ai');
    }
    return [...kinds]
      .map((k) => this.language.translate(`suppliers.evaluationKind.${k}`))
      .join(', ');
  });
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

  private optionsRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.optionsRequest.unsubscribe());
    effect(() => {
      const value = this.value();
      untracked(() => this.d.set(draftFrom(value)));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        this.optionsRequest.unsubscribe();
        if (!orgId) {
          return;
        }
        this.optionsRequest = this.api.locationOptions(orgId).subscribe({
          next: (items) => this.locationOptions.set(items),
          error: () => this.locationOptions.set([]),
        });
      });
    });
  }

  protected serverInvalid(field: string): boolean {
    return this.invalidCountry()?.field === field;
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

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { AskAbout } from '../../shared/ask/ask-about';
import { ContractField } from './contract-field';
import { ContractPartyName, PartyNameValue } from './contract-party-name';
import { ContractPersonPicker } from './contract-person-picker';
import {
  CONTRACT_TYPES,
  ContractType,
  PARTY_ROLES,
  PERSONAL_DATA_ROLES,
  PersonalDataRole,
  TRANSFER_BASES,
  TransferBasis,
  VALUE_PERIODS,
} from './data/contract.models';
import {
  ContractFormValue,
  MAX_PARTIES,
  PartyDraft,
  displayAmount,
  emptyParty,
  isValuePeriod,
  validateContractForm,
} from './data/contract-form-model';

export interface ContractFormSubmit {
  readonly value: ContractFormValue;
  readonly changeReason: string;
}

/** Contract types where the other side delivers something to us (supply-chain flags apply). */
const SUPPLY_TYPES: readonly ContractType[] = [
  'supplier',
  'sla',
  'licence',
  'partner',
  'dpa',
  'other',
];

/**
 * The contract form (create and edit). `value` seeds the form; every edit is
 * emitted on `changed` so the page can keep a draft (e.g. to merge an extraction
 * into it). Sections: the contract · personal data and security (the GDPR role,
 * transfers outside the EU/EEA, ICT-critical, AI system) · dates and renewal ·
 * value · parties (create only; edit manages them on the detail page). In edit
 * mode a change reason is asked for, which the revision history records.
 */
@Component({
  selector: 'app-contract-form',
  imports: [
    TranslocoPipe,
    Button,
    Card,
    Icon,
    AskAbout,
    ContractField,
    ContractPartyName,
    ContractPersonPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-4 font-display text-section font-bold text-fg">
          {{ 'contracts.form.sections.basics' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="md:col-span-2">
            <app-contract-field [label]="'contracts.fields.title' | transloco" inputId="cf-c-title">
              <input
                id="cf-c-title"
                type="text"
                maxlength="255"
                required
                [value]="form().title"
                (input)="set('title', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['title']"
                [attr.aria-describedby]="shownErrors()['title'] ? 'cf-c-title-err' : null"
                data-testid="contract-title"
              />
            </app-contract-field>
            @if (shownErrors()['title']; as key) {
              <p id="cf-c-title-err" class="mt-1 text-meta text-fail">{{ key | transloco }}</p>
            }
          </div>
          <app-contract-field
            [label]="'contracts.fields.contractType' | transloco"
            inputId="cf-c-type"
            helpField="contract_type"
          >
            <select id="cf-c-type" (change)="setType($any($event.target).value)">
              @for (t of types; track t) {
                <option [value]="t" [selected]="form().contract_type === t">
                  {{ 'contracts.types.' + t | transloco }}
                </option>
              }
            </select>
          </app-contract-field>
          <app-contract-field
            [label]="'contracts.fields.owner' | transloco"
            inputId="cf-c-owner"
            helpField="owner"
          >
            <app-contract-person-picker
              inputId="cf-c-owner"
              [value]="form().owner_user_id"
              [fallbackName]="ownerName()"
              [emptyLabel]="mode() === 'create' ? ('contracts.form.ownerMe' | transloco) : null"
              (valueChange)="set('owner_user_id', $event)"
            />
          </app-contract-field>
          <app-contract-field
            [label]="'contracts.fields.department' | transloco"
            inputId="cf-c-dept"
          >
            <select id="cf-c-dept" (change)="set('department_id', $any($event.target).value)">
              <option value="" [selected]="!form().department_id">
                {{ 'contracts.form.noDepartment' | transloco }}
              </option>
              @for (d of departments(); track d.id) {
                <option [value]="d.id" [selected]="form().department_id === d.id">
                  {{ d.label }}
                </option>
              }
            </select>
          </app-contract-field>
          <div class="flex flex-col justify-end gap-1">
            <label class="flex h-10 items-center gap-2 text-ui text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="form().confidential"
                (change)="set('confidential', $any($event.target).checked)"
              />
              {{ 'contracts.fields.confidential' | transloco }}
            </label>
          </div>
          <div class="md:col-span-2">
            <app-contract-field
              [label]="'contracts.fields.description' | transloco"
              inputId="cf-c-description"
            >
              <textarea
                id="cf-c-description"
                rows="3"
                maxlength="20000"
                [value]="form().description"
                (input)="set('description', $any($event.target).value)"
              ></textarea>
            </app-contract-field>
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-1 font-display text-section font-bold text-fg">
          {{ 'contracts.form.sections.privacy' | transloco }}
        </h2>
        <p class="mb-4 text-meta text-fg-muted">
          {{ 'contracts.form.privacyIntro' | transloco }}
        </p>
        <fieldset class="flex flex-col gap-2" data-testid="contract-personal-data-role">
          <legend
            class="mb-1.5 flex flex-wrap items-center gap-1.5 text-ui font-semibold text-fg-muted"
          >
            {{ 'contracts.fields.personalDataRole' | transloco }}
            <app-ask-about
              [prompt]="'contracts.ask.personalDataRole' | transloco"
              field="personal_data_role"
              [fieldLabel]="'contracts.fields.personalDataRole' | transloco"
              [requirements]="['gdpr:28', 'gdpr:26']"
            />
          </legend>
          <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
            @for (r of roles; track r) {
              <label
                class="flex cursor-pointer items-start gap-2 rounded-tile border px-3 py-2.5 text-ui"
                [class]="
                  form().personal_data_role === r
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-bg hover:bg-surface-2'
                "
              >
                <input
                  type="radio"
                  name="cf-c-role"
                  class="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
                  [checked]="form().personal_data_role === r"
                  (change)="setRole(r)"
                  [attr.data-testid]="'role-' + r"
                />
                <span>
                  <span class="block font-semibold text-fg">
                    {{ 'contracts.personalDataRoles.' + r + '.label' | transloco }}
                  </span>
                  <span class="block text-meta text-fg-muted">
                    {{ 'contracts.personalDataRoles.' + r + '.hint' | transloco }}
                  </span>
                </span>
              </label>
            }
          </div>
        </fieldset>

        @if (showTransfer()) {
          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <app-contract-field
              [label]="'contracts.fields.transferBasis' | transloco"
              inputId="cf-c-transfer"
              helpField="transfer_basis"
              [ask]="'contracts.ask.transferBasis' | transloco"
              [requirements]="['gdpr:44', 'gdpr:46']"
            >
              <select
                id="cf-c-transfer"
                (change)="setBasis($any($event.target).value)"
                data-testid="contract-transfer-basis"
              >
                <option value="" [selected]="!form().transfer_basis">
                  {{ 'contracts.form.transferUnknown' | transloco }}
                </option>
                @for (b of bases; track b) {
                  <option [value]="b" [selected]="form().transfer_basis === b">
                    {{ 'contracts.transferBases.' + b | transloco }}
                  </option>
                }
              </select>
            </app-contract-field>
            @if (form().transfer_basis && form().transfer_basis !== 'none') {
              <app-contract-field
                [label]="'contracts.fields.transferCountries' | transloco"
                inputId="cf-c-countries"
              >
                <input
                  id="cf-c-countries"
                  type="text"
                  maxlength="255"
                  [placeholder]="'contracts.form.countriesPlaceholder' | transloco"
                  [value]="form().transfer_countries"
                  (input)="set('transfer_countries', $any($event.target).value)"
                />
              </app-contract-field>
            }
          </div>
        }

        @if (supplyType()) {
          <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label class="flex items-start gap-2 text-ui text-fg">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
                [checked]="form().ict_critical"
                (change)="set('ict_critical', $any($event.target).checked)"
                data-testid="contract-ict-critical"
              />
              <span>
                <span class="block font-semibold">{{
                  'contracts.fields.ictCritical' | transloco
                }}</span>
                <span class="block text-meta text-fg-muted">
                  {{ 'contracts.form.ictCriticalHint' | transloco }}
                </span>
              </span>
            </label>
            <label class="flex items-start gap-2 text-ui text-fg">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
                [checked]="form().involves_ai_system"
                (change)="set('involves_ai_system', $any($event.target).checked)"
                data-testid="contract-ai-system"
              />
              <span>
                <span class="block font-semibold">{{
                  'contracts.fields.involvesAiSystem' | transloco
                }}</span>
                <span class="block text-meta text-fg-muted">
                  {{ 'contracts.form.aiSystemHint' | transloco }}
                </span>
              </span>
            </label>
          </div>
        }
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-section font-bold text-fg">
          {{ 'contracts.form.sections.terms' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-contract-field
            [label]="'contracts.fields.startDate' | transloco"
            inputId="cf-c-start"
          >
            <input
              id="cf-c-start"
              type="date"
              [value]="form().start_date"
              (change)="set('start_date', $any($event.target).value)"
            />
          </app-contract-field>
          <div>
            <app-contract-field [label]="'contracts.fields.endDate' | transloco" inputId="cf-c-end">
              <input
                id="cf-c-end"
                type="date"
                [value]="form().end_date"
                (change)="set('end_date', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['end_date']"
              />
            </app-contract-field>
            @if (shownErrors()['end_date']; as key) {
              <p class="mt-1 text-meta text-fail">{{ key | transloco }}</p>
            }
          </div>
          <app-contract-field
            [label]="'contracts.fields.signedDate' | transloco"
            inputId="cf-c-signed"
          >
            <input
              id="cf-c-signed"
              type="date"
              [value]="form().signed_date"
              (change)="set('signed_date', $any($event.target).value)"
            />
          </app-contract-field>
          <app-contract-field
            [label]="'contracts.fields.reviewDate' | transloco"
            inputId="cf-c-review"
            helpField="review_date"
          >
            <input
              id="cf-c-review"
              type="date"
              [value]="form().review_date"
              (change)="set('review_date', $any($event.target).value)"
            />
          </app-contract-field>
          <div>
            <app-contract-field
              [label]="'contracts.fields.noticePeriodDays' | transloco"
              inputId="cf-c-notice"
              helpField="notice_period_days"
              [ask]="'contracts.ask.noticePeriod' | transloco"
            >
              <input
                id="cf-c-notice"
                type="number"
                min="0"
                max="3650"
                inputmode="numeric"
                [value]="form().notice_period_days"
                (input)="set('notice_period_days', $any($event.target).value)"
              />
            </app-contract-field>
            @if (shownErrors()['notice_period_days']; as key) {
              <p class="mt-1 text-meta text-fail">{{ key | transloco }}</p>
            }
          </div>
          <app-contract-field
            [label]="'contracts.fields.governingLaw' | transloco"
            inputId="cf-c-law"
          >
            <input
              id="cf-c-law"
              type="text"
              maxlength="100"
              [value]="form().governing_law"
              (input)="set('governing_law', $any($event.target).value)"
            />
          </app-contract-field>

          <fieldset
            class="flex flex-col gap-3 rounded-tile border border-border p-3 sm:col-span-2"
            data-testid="renewal-group"
          >
            <legend class="px-1 text-ui font-semibold text-fg-muted">
              {{ 'contracts.fields.renewal' | transloco }}
            </legend>
            <label class="flex items-center gap-2 text-ui text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="form().auto_renew"
                (change)="set('auto_renew', $any($event.target).checked)"
                data-testid="contract-auto-renew"
              />
              {{ 'contracts.fields.autoRenew' | transloco }}
            </label>
            @if (form().auto_renew) {
              <div class="max-w-[240px]">
                <app-contract-field
                  [label]="'contracts.fields.renewalTermMonths' | transloco"
                  inputId="cf-c-term"
                  helpField="auto_renew"
                >
                  <input
                    id="cf-c-term"
                    type="number"
                    min="1"
                    max="240"
                    inputmode="numeric"
                    [value]="form().renewal_term_months"
                    (input)="set('renewal_term_months', $any($event.target).value)"
                    data-testid="contract-renewal-term"
                  />
                </app-contract-field>
                @if (shownErrors()['renewal_term_months']; as key) {
                  <p class="mt-1 text-meta text-fail">{{ key | transloco }}</p>
                }
              </div>
            }
            <app-contract-field
              [label]="'contracts.fields.renewalNotes' | transloco"
              inputId="cf-c-renewal-notes"
            >
              <textarea
                id="cf-c-renewal-notes"
                rows="2"
                maxlength="5000"
                [value]="form().renewal_notes"
                (input)="set('renewal_notes', $any($event.target).value)"
              ></textarea>
            </app-contract-field>
          </fieldset>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-section font-bold text-fg">
          {{ 'contracts.form.sections.value' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <app-contract-field
              [label]="'contracts.fields.valueAmount' | transloco"
              inputId="cf-c-amount"
            >
              <input
                id="cf-c-amount"
                type="text"
                inputmode="decimal"
                [value]="form().value_amount"
                (input)="set('value_amount', $any($event.target).value)"
                (blur)="formatAmountField()"
                [attr.aria-invalid]="!!shownErrors()['value_amount']"
                data-testid="contract-amount"
              />
            </app-contract-field>
            @if (shownErrors()['value_amount']; as key) {
              <p class="mt-1 text-meta text-fail">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <app-contract-field
              [label]="'contracts.fields.currency' | transloco"
              inputId="cf-c-currency"
            >
              <input
                id="cf-c-currency"
                type="text"
                maxlength="3"
                autocomplete="off"
                [placeholder]="'contracts.form.currencyPlaceholder' | transloco"
                [value]="form().currency"
                (input)="set('currency', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['currency']"
              />
            </app-contract-field>
            @if (shownErrors()['currency']; as key) {
              <p class="mt-1 text-meta text-fail">{{ key | transloco }}</p>
            }
          </div>
          <app-contract-field
            [label]="'contracts.fields.valuePeriod' | transloco"
            inputId="cf-c-period"
          >
            <select id="cf-c-period" (change)="setPeriod($any($event.target).value)">
              <option value="" [selected]="!form().value_period">
                {{ 'contracts.form.noPeriod' | transloco }}
              </option>
              @for (p of periods; track p) {
                <option [value]="p" [selected]="form().value_period === p">
                  {{ 'contracts.valuePeriods.' + p | transloco }}
                </option>
              }
            </select>
          </app-contract-field>
        </div>
      </app-card>

      @if (mode() === 'create') {
        <app-card>
          <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-display text-section font-bold text-fg">
              {{ 'contracts.form.sections.parties' | transloco }}
            </h2>
            <app-button
              variant="secondary"
              size="sm"
              [disabled]="form().parties.length >= maxParties"
              (click)="addParty()"
              data-testid="add-party"
            >
              <app-icon name="plus" [size]="14" />
              {{ 'contracts.parties.add' | transloco }}
            </app-button>
          </div>
          <p class="mb-2 text-meta text-fg-muted">{{ 'contracts.parties.intro' | transloco }}</p>
          @if (form().parties.length === 0) {
            <p class="mt-2 text-ui text-fg-muted">{{ 'contracts.parties.none' | transloco }}</p>
          }
          <ul class="mt-2 flex flex-col gap-3">
            @for (p of form().parties; track $index; let i = $index) {
              <li class="rounded-tile border border-border p-3">
                <fieldset class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <legend class="sr-only">
                    {{ 'contracts.parties.legend' | transloco: { n: i + 1 } }}
                  </legend>
                  <app-contract-field
                    [label]="'contracts.parties.name' | transloco"
                    [inputId]="'cf-p-name-' + i"
                  >
                    <app-contract-party-name
                      [inputId]="'cf-p-name-' + i"
                      [name]="p.name"
                      [supplierId]="p.supplier_id"
                      [supplierLabel]="p.supplier_label"
                      [isInternal]="p.is_internal"
                      (changed)="setPartyName(i, $event)"
                    />
                  </app-contract-field>
                  <app-contract-field
                    [label]="'contracts.parties.role' | transloco"
                    [inputId]="'cf-p-role-' + i"
                  >
                    <select
                      [id]="'cf-p-role-' + i"
                      (change)="setParty(i, { role: $any($event.target).value })"
                    >
                      <option value="" [selected]="!p.role">
                        {{ 'contracts.parties.roleFromType' | transloco }}
                      </option>
                      @for (r of partyRoles; track r) {
                        <option [value]="r" [selected]="p.role === r">
                          {{ 'contracts.partyRoles.' + r | transloco }}
                        </option>
                      }
                    </select>
                  </app-contract-field>
                  <app-contract-field
                    [label]="'contracts.parties.orgNumber' | transloco"
                    [inputId]="'cf-p-org-' + i"
                  >
                    <input
                      [id]="'cf-p-org-' + i"
                      type="text"
                      maxlength="64"
                      [value]="p.org_number"
                      (input)="setParty(i, { org_number: $any($event.target).value })"
                    />
                  </app-contract-field>
                  <app-contract-field
                    [label]="'contracts.parties.contactEmail' | transloco"
                    [inputId]="'cf-p-email-' + i"
                  >
                    <input
                      [id]="'cf-p-email-' + i"
                      type="email"
                      maxlength="320"
                      [value]="p.contact_email"
                      (input)="setParty(i, { contact_email: $any($event.target).value })"
                    />
                  </app-contract-field>
                  <div class="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                    <label class="flex items-center gap-2 text-ui text-fg">
                      <input
                        type="checkbox"
                        class="h-4 w-4 accent-[var(--accent)]"
                        [checked]="p.is_internal"
                        (change)="setParty(i, { is_internal: $any($event.target).checked })"
                      />
                      {{ 'contracts.parties.isInternal' | transloco }}
                    </label>
                    <app-button variant="ghost" size="sm" (click)="removeParty(i)">
                      <app-icon name="trash" [size]="14" />
                      {{ 'contracts.parties.remove' | transloco }}
                    </app-button>
                  </div>
                </fieldset>
              </li>
            }
          </ul>
        </app-card>
      }

      @if (mode() === 'edit') {
        <app-card>
          <app-contract-field
            [label]="'contracts.form.changeReason' | transloco"
            inputId="cf-c-reason"
          >
            <input
              id="cf-c-reason"
              type="text"
              maxlength="1000"
              [placeholder]="'contracts.form.changeReasonPlaceholder' | transloco"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            />
          </app-contract-field>
          <p class="mt-2 text-meta text-fg-muted">
            {{ 'contracts.form.backToDraftNotice' | transloco }}
          </p>
        </app-card>
      }

      @if (attempted() && errorCount() > 0) {
        <p class="text-ui font-semibold text-fail" role="alert" data-testid="form-errors">
          {{ 'contracts.form.fixErrors' | transloco: { count: errorCount() } }}
        </p>
      }
      <div
        class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0"
      >
        <app-button variant="ghost" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button
          type="submit"
          [loading]="busy()"
          [disabled]="busy()"
          data-testid="contract-save"
        >
          {{ (mode() === 'create' ? 'contracts.form.create' : 'common.save') | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class ContractForm {
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly language = inject(LanguageService);

  readonly value = input.required<ContractFormValue>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly busy = input(false);
  /** Display name of the current owner (shown when they are not in the people list). */
  readonly ownerName = input<string | null>(null);

  readonly changed = output<ContractFormValue>();
  readonly submitted = output<ContractFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly types = CONTRACT_TYPES;
  protected readonly partyRoles = PARTY_ROLES;
  protected readonly roles = PERSONAL_DATA_ROLES;
  protected readonly bases = TRANSFER_BASES;
  protected readonly periods = VALUE_PERIODS;
  protected readonly maxParties = MAX_PARTIES;

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = signal('');
  protected readonly attempted = signal(false);
  /** Whether the user picked the confidential flag (create: employment defaults it on). */
  private confidentialTouched = false;

  protected readonly errors = computed(() => validateContractForm(this.form()));
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);
  protected readonly shownErrors = computed(() => {
    const errors = this.errors();
    // Format problems show as soon as they exist; a missing title only after submitting.
    return this.attempted() ? errors : withoutKey(errors, 'title');
  });

  protected readonly departments = computed(() =>
    this.assignees.options().departments.map((o) => ({ id: o.value.slice(11), label: o.label })),
  );
  protected readonly showTransfer = computed(
    () => this.form().personal_data_role !== 'none' || this.form().contract_type === 'dpa',
  );
  protected readonly supplyType = computed(() => SUPPLY_TYPES.includes(this.form().contract_type));

  constructor() {
    this.assignees.ensureLoaded();
  }

  protected set<K extends keyof ContractFormValue>(key: K, value: ContractFormValue[K]): void {
    if (key === 'confidential') {
      this.confidentialTouched = true;
    }
    this.update({ [key]: value } as Partial<ContractFormValue>);
  }

  protected setType(value: string): void {
    const type = value as ContractType;
    const patch: Partial<ContractFormValue> = { contract_type: type };
    if (this.mode() === 'create' && !this.confidentialTouched) {
      // Employment contracts hold employee personal data: confidential by default.
      Object.assign(patch, { confidential: type === 'employment' });
    }
    if (type === 'dpa' && this.form().personal_data_role === 'none') {
      // A data processing agreement is about personal data by definition.
      Object.assign(patch, { personal_data_role: 'they_process' });
    }
    this.update(patch);
  }

  protected setRole(role: PersonalDataRole): void {
    this.update({ personal_data_role: role });
  }

  protected setBasis(value: string): void {
    this.update({
      transfer_basis: (TRANSFER_BASES as readonly string[]).includes(value)
        ? (value as TransferBasis)
        : '',
    });
  }

  protected setPeriod(value: string): void {
    this.update({ value_period: isValuePeriod(value) ? value : '' });
  }

  /** Show the amount the way people read it ("850 000,50") once they leave the field. */
  protected formatAmountField(): void {
    const raw = this.form().value_amount;
    if (raw.trim()) {
      this.update({ value_amount: displayAmount(raw, this.language.locale()) });
    }
  }

  protected addParty(): void {
    const parties = this.form().parties;
    if (parties.length < MAX_PARTIES) {
      // The first party is usually the organisation itself.
      this.update({ parties: [...parties, emptyParty({ is_internal: parties.length === 0 })] });
    }
  }

  protected setParty(index: number, patch: Partial<PartyDraft>): void {
    this.update({
      parties: this.form().parties.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });
  }

  protected setPartyName(index: number, value: PartyNameValue): void {
    this.setParty(index, {
      name: value.name,
      supplier_id: value.supplier_id,
      supplier_label: value.supplier_label,
    });
  }

  protected removeParty(index: number): void {
    this.update({ parties: this.form().parties.filter((_, i) => i !== index) });
  }

  protected submit(): void {
    this.attempted.set(true);
    if (Object.keys(this.errors()).length > 0 || this.busy()) {
      return;
    }
    this.submitted.emit({ value: this.form(), changeReason: this.changeReason() });
  }

  private update(patch: Partial<ContractFormValue>): void {
    const next = { ...this.form(), ...patch };
    this.form.set(next);
    this.changed.emit(next);
  }
}

function withoutKey(errors: Readonly<Record<string, string>>, key: string) {
  return Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key));
}

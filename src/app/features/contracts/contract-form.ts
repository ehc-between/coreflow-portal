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
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { CONTRACT_TYPES, ContractType, PARTY_ROLES, VALUE_PERIODS } from './data/contract.models';
import {
  ContractFormValue,
  MAX_PARTIES,
  PartyDraft,
  emptyParty,
  isValuePeriod,
  validateContractForm,
} from './data/contract-form-model';

export interface ContractFormSubmit {
  readonly value: ContractFormValue;
  readonly changeReason: string;
}

/**
 * The contract form (create and edit). `value` seeds the form; every edit is
 * emitted on `changed` so the page can keep a draft (e.g. to merge an extraction
 * into it). In edit mode the parties are managed on the detail page and a change
 * reason is asked for, which the revision history records.
 */
@Component({
  selector: 'app-contract-form',
  imports: [TranslocoPipe, AskAbout, FieldHelp, Button, Card, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
          {{ 'contracts.form.sections.basics' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <app-form-field [label]="'contracts.fields.title' | transloco" inputId="cf-c-title">
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
            </app-form-field>
            @if (shownErrors()['title']; as key) {
              <p id="cf-c-title-err" class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <app-form-field
              [label]="'contracts.fields.contractType' | transloco"
              inputId="cf-c-type"
            >
              <select id="cf-c-type" (change)="setType($any($event.target).value)">
                @for (t of types; track t) {
                  <option [value]="t" [selected]="form().contract_type === t">
                    {{ 'contracts.types.' + t | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-field-help scope="contracts" page="form" field="contract_type" />
          </div>
          <div>
            <app-form-field [label]="'contracts.fields.owner' | transloco" inputId="cf-c-owner">
              <select id="cf-c-owner" (change)="set('owner_user_id', $any($event.target).value)">
                @if (mode() === 'create') {
                  <option value="" [selected]="!form().owner_user_id">
                    {{ 'contracts.form.ownerMe' | transloco }}
                  </option>
                }
                @if (ownerOrphan()) {
                  <option [value]="form().owner_user_id" selected>
                    {{ ownerName() || ('contracts.form.currentOwner' | transloco) }}
                  </option>
                }
                @for (u of users(); track u.id) {
                  <option [value]="u.id" [selected]="form().owner_user_id === u.id">
                    {{ u.label }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <div>
            <app-form-field [label]="'contracts.fields.department' | transloco" inputId="cf-c-dept">
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
            </app-form-field>
          </div>
          <div class="sm:col-span-2">
            <app-form-field
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
            </app-form-field>
          </div>
          <div class="flex flex-col gap-1">
            <label class="flex items-center gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="form().processes_personal_data"
                (change)="set('processes_personal_data', $any($event.target).checked)"
                data-testid="contract-personal-data"
              />
              {{ 'contracts.fields.processesPersonalData' | transloco }}
            </label>
            <app-field-help scope="contracts" page="form" field="processes_personal_data" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="flex items-center gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="form().confidential"
                (change)="set('confidential', $any($event.target).checked)"
              />
              {{ 'contracts.fields.confidential' | transloco }}
            </label>
            <app-field-help scope="contracts" page="form" field="confidential" />
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
          {{ 'contracts.form.sections.terms' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <app-form-field [label]="'contracts.fields.startDate' | transloco" inputId="cf-c-start">
              <input
                id="cf-c-start"
                type="date"
                [value]="form().start_date"
                (change)="set('start_date', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          <div>
            <app-form-field [label]="'contracts.fields.endDate' | transloco" inputId="cf-c-end">
              <input
                id="cf-c-end"
                type="date"
                [value]="form().end_date"
                (change)="set('end_date', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['end_date']"
              />
            </app-form-field>
            @if (shownErrors()['end_date']; as key) {
              <p class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <app-form-field
              [label]="'contracts.fields.signedDate' | transloco"
              inputId="cf-c-signed"
            >
              <input
                id="cf-c-signed"
                type="date"
                [value]="form().signed_date"
                (change)="set('signed_date', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          <div>
            <app-form-field
              [label]="'contracts.fields.reviewDate' | transloco"
              inputId="cf-c-review"
            >
              <input
                id="cf-c-review"
                type="date"
                [value]="form().review_date"
                (change)="set('review_date', $any($event.target).value)"
              />
            </app-form-field>
            <app-field-help scope="contracts" page="form" field="review_date" />
          </div>
          <div>
            <div class="flex items-end gap-1">
              <div class="flex-1">
                <app-form-field
                  [label]="'contracts.fields.noticePeriodDays' | transloco"
                  inputId="cf-c-notice"
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
                </app-form-field>
              </div>
              <app-ask-about
                [prompt]="'contracts.ask.noticePeriod' | transloco"
                field="notice_period_days"
              />
            </div>
            @if (shownErrors()['notice_period_days']; as key) {
              <p class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
            }
            <app-field-help scope="contracts" page="form" field="notice_period_days" />
          </div>
          <div class="flex flex-col justify-end gap-1">
            <label class="flex h-10 items-center gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="form().auto_renew"
                (change)="set('auto_renew', $any($event.target).checked)"
              />
              {{ 'contracts.fields.autoRenew' | transloco }}
            </label>
            <app-field-help scope="contracts" page="form" field="auto_renew" />
          </div>
          <div>
            <app-form-field
              [label]="'contracts.fields.renewalTermMonths' | transloco"
              inputId="cf-c-term"
            >
              <input
                id="cf-c-term"
                type="number"
                min="1"
                max="240"
                inputmode="numeric"
                [value]="form().renewal_term_months"
                (input)="set('renewal_term_months', $any($event.target).value)"
              />
            </app-form-field>
            @if (shownErrors()['renewal_term_months']; as key) {
              <p class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <app-form-field
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
            </app-form-field>
          </div>
          <div class="sm:col-span-2 lg:col-span-4">
            <app-form-field
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
            </app-form-field>
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
          {{ 'contracts.form.sections.value' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <app-form-field
              [label]="'contracts.fields.valueAmount' | transloco"
              inputId="cf-c-amount"
            >
              <input
                id="cf-c-amount"
                type="text"
                inputmode="decimal"
                [value]="form().value_amount"
                (input)="set('value_amount', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['value_amount']"
              />
            </app-form-field>
            @if (shownErrors()['value_amount']; as key) {
              <p class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <app-form-field
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
            </app-form-field>
            @if (shownErrors()['currency']; as key) {
              <p class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <app-form-field
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
            </app-form-field>
          </div>
        </div>
      </app-card>

      @if (mode() === 'create') {
        <app-card>
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-display text-[16px] font-bold text-fg">
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
          <app-field-help scope="contracts" page="form" field="parties" />
          @if (form().parties.length === 0) {
            <p class="mt-2 text-[13px] text-fg-muted">{{ 'contracts.parties.none' | transloco }}</p>
          }
          <ul class="mt-2 flex flex-col gap-3">
            @for (p of form().parties; track $index; let i = $index) {
              <li class="rounded-tile border border-border p-3">
                <fieldset class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <legend class="sr-only">
                    {{ 'contracts.parties.legend' | transloco: { n: i + 1 } }}
                  </legend>
                  <app-form-field
                    [label]="'contracts.parties.name' | transloco"
                    [inputId]="'cf-p-name-' + i"
                  >
                    <input
                      [id]="'cf-p-name-' + i"
                      type="text"
                      maxlength="255"
                      [value]="p.name"
                      (input)="setParty(i, { name: $any($event.target).value })"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'contracts.parties.role' | transloco"
                    [inputId]="'cf-p-role-' + i"
                  >
                    <select
                      [id]="'cf-p-role-' + i"
                      (change)="setParty(i, { role: $any($event.target).value })"
                    >
                      @for (r of roles; track r) {
                        <option [value]="r" [selected]="p.role === r">
                          {{ 'contracts.partyRoles.' + r | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  <app-form-field
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
                  </app-form-field>
                  <app-form-field
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
                  </app-form-field>
                  <div class="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
                    <label class="flex items-center gap-2 text-[13px] text-fg">
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
          <app-form-field [label]="'contracts.form.changeReason' | transloco" inputId="cf-c-reason">
            <input
              id="cf-c-reason"
              type="text"
              maxlength="1000"
              [placeholder]="'contracts.form.changeReasonPlaceholder' | transloco"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            />
          </app-form-field>
          <p class="mt-2 text-[12.5px] text-fg-muted">
            {{ 'contracts.form.backToDraftNotice' | transloco }}
          </p>
        </app-card>
      }

      <div class="flex flex-wrap justify-end gap-2">
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

  readonly value = input.required<ContractFormValue>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly busy = input(false);
  /** Display name of the current owner (shown when they are not in the people list). */
  readonly ownerName = input<string | null>(null);

  readonly changed = output<ContractFormValue>();
  readonly submitted = output<ContractFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly types = CONTRACT_TYPES;
  protected readonly roles = PARTY_ROLES;
  protected readonly periods = VALUE_PERIODS;
  protected readonly maxParties = MAX_PARTIES;

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = signal('');
  private readonly attempted = signal(false);
  /** Whether the user picked the confidential flag (create: employment defaults it on). */
  private confidentialTouched = false;

  protected readonly errors = computed(() => validateContractForm(this.form()));
  protected readonly shownErrors = computed(() => {
    const errors = this.errors();
    // Format problems show as soon as they exist; a missing title only after submitting.
    return this.attempted() ? errors : withoutKey(errors, 'title');
  });

  protected readonly users = computed(() =>
    this.assignees.options().users.map((o) => ({ id: o.value.slice(5), label: o.label })),
  );
  protected readonly ownerOrphan = computed(() => {
    const id = this.form().owner_user_id;
    return !!id && !this.users().some((u) => u.id === id);
  });
  protected readonly departments = computed(() =>
    this.assignees.options().departments.map((o) => ({ id: o.value.slice(11), label: o.label })),
  );

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
    this.update(patch);
  }

  protected setPeriod(value: string): void {
    this.update({ value_period: isValuePeriod(value) ? value : '' });
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

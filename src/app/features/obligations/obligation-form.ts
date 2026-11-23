import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { ClausePicker } from '../../shared/requirement-links/clause-picker';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { CustomerPicker, CustomersAvailability } from '../../shared/customers';
import { RecurrencePicker } from '../../shared/tasks/recurrence-picker';
import { Button } from '../../shared/ui/button/button';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { FormActions } from '../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../shared/ui/form-section/form-section';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { ObligationsApi } from './data/obligations-api';
import {
  DEFAULT_RENEWAL_LEAD_DAYS,
  FRAMEWORKS,
  FrameworkKey,
  JURISDICTIONS,
  MAX_RENEWAL_LEAD_DAYS,
  MAX_REQUIREMENTS,
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
  ObligationStatus,
} from './data/obligation.models';
import { frameworkKey, isRenewable } from './data/obligation-display';
import {
  DutyDraft,
  ObligationFormValue,
  isObligationType,
  mergeRefs,
  newDuty,
  validateObligationForm,
} from './data/obligation-form-model';

export interface ObligationFormSubmit {
  readonly value: ObligationFormValue;
  readonly changeReason: string;
}

/** The "Gjelder i" choice: a known code or free text (`other`). */
export function jurisdictionChoice(value: string): string {
  if (!value) {
    return '';
  }
  return (JURISDICTIONS as readonly string[]).includes(value) ? value : 'other';
}

/**
 * The obligation form (create and edit). `value` seeds the form and is re-applied
 * when the page replaces it (an AI proposal, a library entry, a create-from-here
 * flow); every edit is emitted on `changed`.
 *
 * Sections: the obligation; source and validity (where it applies, the authority,
 * the law or permit number, the link to the legal text, validity and when to apply
 * for renewal); duties ("plikter", each with an optional owner and the clauses it
 * documents); the standards' requirements it documents (ticking a standard proposes
 * its usual clauses; the picked clauses become confirmed requirement links); and the
 * periodic evaluation (on by default). In edit mode a change reason is asked for.
 */
@Component({
  selector: 'app-obligation-form',
  imports: [
    FormsModule,
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    ClausePicker,
    RecurrencePicker,
    Button,
    DateInput,
    FormActions,
    FormField,
    FormSection,
    Icon,
    CustomerPicker,
  ],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <ng-content select="[before]" />

      <app-form-section
        [title]="'obligations.form.sections.basics' | transloco"
        [description]="'obligations.form.sections.basicsHint' | transloco"
      >
        <app-form-field
          span="full"
          [label]="'obligations.fields.title' | transloco"
          inputId="cf-o-title"
          [required]="true"
          [error]="shownErrors()['title'] ?? '' | transloco"
        >
          <input
            id="cf-o-title"
            type="text"
            maxlength="255"
            required
            [placeholder]="'obligations.form.titlePlaceholder' | transloco"
            [value]="form().title"
            (input)="set('title', $any($event.target).value)"
            data-testid="obligation-title"
          />
        </app-form-field>
        <app-form-field
          [label]="'obligations.fields.obligationType' | transloco"
          inputId="cf-o-type"
        >
          <app-field-help
            label-suffix
            scope="obligations"
            page="form"
            field="obligation_type"
            [label]="'obligations.fields.obligationType' | transloco"
          />
          <select
            id="cf-o-type"
            (change)="setType($any($event.target).value)"
            data-testid="obligation-type"
          >
            @for (t of types; track t) {
              <option [value]="t" [selected]="form().obligation_type === t">
                {{ 'obligations.types.' + t | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'obligations.fields.status' | transloco" inputId="cf-o-status">
          <app-field-help
            label-suffix
            scope="obligations"
            page="form"
            field="status"
            [label]="'obligations.fields.status' | transloco"
          />
          <select id="cf-o-status" (change)="setStatus($any($event.target).value)">
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="form().status === s">
                {{ 'obligations.status.' + s | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'obligations.fields.owner' | transloco" inputId="cf-o-owner">
          <app-field-help
            label-suffix
            scope="obligations"
            page="form"
            field="owner"
            [label]="'obligations.fields.owner' | transloco"
          />
          <select id="cf-o-owner" (change)="set('owner_user_id', $any($event.target).value)">
            @if (mode() === 'create') {
              <option value="" [selected]="!form().owner_user_id">
                {{ 'obligations.form.ownerMe' | transloco }}
              </option>
            }
            @if (ownerOrphan()) {
              <option [value]="form().owner_user_id" selected>
                {{ ownerName() || ('obligations.form.currentOwner' | transloco) }}
              </option>
            }
            @for (u of users(); track u.id) {
              <option [value]="u.id" [selected]="form().owner_user_id === u.id">
                {{ u.label }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'obligations.fields.department' | transloco" inputId="cf-o-dept">
          <select id="cf-o-dept" (change)="set('department_id', $any($event.target).value)">
            <option value="" [selected]="!form().department_id">
              {{ 'obligations.form.noDepartment' | transloco }}
            </option>
            @for (d of departments(); track d.id) {
              <option [value]="d.id" [selected]="form().department_id === d.id">
                {{ d.label }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'obligations.fields.description' | transloco"
          inputId="cf-o-description"
        >
          <app-field-help
            label-suffix
            scope="obligations"
            page="form"
            field="description"
            [label]="'obligations.fields.description' | transloco"
          />
          <textarea
            id="cf-o-description"
            rows="3"
            maxlength="20000"
            [value]="form().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'obligations.form.sections.source' | transloco"
        [description]="'obligations.form.sections.sourceHint' | transloco"
      >
        <app-form-field
          [label]="'obligations.fields.jurisdiction' | transloco"
          inputId="cf-o-jurisdiction"
        >
          <select
            id="cf-o-jurisdiction"
            (change)="setJurisdiction($any($event.target).value)"
            data-testid="obligation-jurisdiction"
          >
            <option value="" [selected]="jurisdiction() === ''">
              {{ 'obligations.form.jurisdictionNone' | transloco }}
            </option>
            @for (j of jurisdictions; track j) {
              <option [value]="j" [selected]="jurisdiction() === j">
                {{ 'obligations.jurisdictions.' + j | transloco }}
              </option>
            }
            <option value="other" [selected]="jurisdiction() === 'other'">
              {{ 'obligations.jurisdictions.other' | transloco }}
            </option>
          </select>
          @if (jurisdiction() === 'other') {
            <label for="cf-o-jurisdiction-text" class="sr-only">{{
              'obligations.form.jurisdictionOther' | transloco
            }}</label>
            <input
              id="cf-o-jurisdiction-text"
              type="text"
              maxlength="64"
              class="mt-1"
              [placeholder]="'obligations.form.jurisdictionPlaceholder' | transloco"
              [value]="otherJurisdiction()"
              (input)="set('jurisdiction', $any($event.target).value)"
            />
          }
        </app-form-field>
        <app-form-field [label]="'obligations.fields.issuer' | transloco" inputId="cf-o-issuer">
          <app-field-help
            label-suffix
            scope="obligations"
            page="form"
            field="issuer"
            [label]="'obligations.fields.issuer' | transloco"
          />
          <input
            id="cf-o-issuer"
            type="text"
            maxlength="255"
            [placeholder]="'obligations.form.issuerPlaceholder' | transloco"
            [value]="form().issuer"
            (input)="set('issuer', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'obligations.fields.reference' | transloco"
          inputId="cf-o-reference"
        >
          <app-field-help
            label-suffix
            scope="obligations"
            page="form"
            field="reference"
            [label]="'obligations.fields.reference' | transloco"
          />
          <input
            id="cf-o-reference"
            type="text"
            maxlength="255"
            [placeholder]="'obligations.form.referencePlaceholder' | transloco"
            [value]="form().reference"
            (input)="set('reference', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'obligations.fields.sourceUrl' | transloco" inputId="cf-o-source">
          <input
            id="cf-o-source"
            type="url"
            maxlength="1000"
            inputmode="url"
            placeholder="https://lovdata.no/…"
            [value]="form().source_url"
            (input)="set('source_url', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'obligations.fields.validFrom' | transloco" inputId="cf-o-from">
          <app-date-input
            inputId="cf-o-from"
            [value]="form().valid_from"
            (valueChange)="set('valid_from', $event ?? '')"
          />
        </app-form-field>
        <app-form-field
          [label]="'obligations.fields.validUntil' | transloco"
          inputId="cf-o-until"
          [error]="shownErrors()['valid_until'] ?? '' | transloco"
        >
          <app-field-help
            label-suffix
            scope="obligations"
            page="form"
            field="valid_until"
            [label]="'obligations.fields.validUntil' | transloco"
          />
          <app-date-input
            inputId="cf-o-until"
            [invalid]="!!shownErrors()['valid_until']"
            [value]="form().valid_until"
            (valueChange)="set('valid_until', $event ?? '')"
          />
        </app-form-field>
        @if (renewable()) {
          <app-form-field
            [label]="'obligations.fields.renewalLeadDays' | transloco"
            inputId="cf-o-renewal"
            [hint]="'obligations.form.renewalHint' | transloco: { days: defaultRenewal }"
            [error]="shownErrors()['renewal_lead_days'] ?? '' | transloco: { max: maxRenewal }"
          >
            <app-field-help
              label-suffix
              scope="obligations"
              page="form"
              field="renewal_lead_days"
              [label]="'obligations.fields.renewalLeadDays' | transloco"
            />
            <input
              id="cf-o-renewal"
              type="number"
              min="0"
              [max]="maxRenewal"
              inputmode="numeric"
              [placeholder]="defaultRenewal"
              [value]="form().renewal_lead_days"
              (input)="set('renewal_lead_days', $any($event.target).value)"
              data-testid="obligation-renewal"
            />
          </app-form-field>
        }
        @if (customers.enabled()) {
          <app-form-field
            [label]="'obligations.fields.customer' | transloco"
            inputId="cf-o-customer"
          >
            <app-customer-picker
              inputId="cf-o-customer"
              [value]="form().customer_id || null"
              [current]="form().customer"
              (valueChange)="set('customer_id', $event ?? '')"
              (refChange)="set('customer', $event)"
              data-testid="obligation-customer"
            />
          </app-form-field>
        }
      </app-form-section>

      <app-form-section
        id="duties"
        [title]="'obligations.form.sections.requirements' | transloco"
        [description]="'obligations.form.sections.requirementsHint' | transloco"
      >
        <app-field-help
          title-suffix
          scope="obligations"
          page="form"
          field="requirements"
          [label]="'obligations.form.sections.requirements' | transloco"
        />
        <div class="empty:hidden sm:col-span-2"><ng-content select="[proposal]" /></div>
        <app-form-field
          span="full"
          [label]="'obligations.fields.applicability' | transloco"
          inputId="cf-o-applicability"
        >
          <app-field-help
            label-suffix
            scope="obligations"
            page="form"
            field="applicability"
            [label]="'obligations.fields.applicability' | transloco"
          />
          <app-ask-about
            label-suffix
            [prompt]="'obligations.ask.applicability' | transloco"
            field="applicability"
            [fieldLabel]="'obligations.fields.applicability' | transloco"
            labelKey="obligations.ask.applicabilityLabel"
          />
          <textarea
            id="cf-o-applicability"
            rows="3"
            maxlength="20000"
            [placeholder]="'obligations.form.applicabilityPlaceholder' | transloco"
            [value]="form().applicability"
            (input)="set('applicability', $any($event.target).value)"
          ></textarea>
        </app-form-field>

        <fieldset class="min-w-0 sm:col-span-2">
          <legend class="flex min-h-6 items-center text-ui font-semibold text-fg-muted">
            {{ 'obligations.fields.requirements' | transloco }}
          </legend>
          @if (form().duties.length === 0) {
            <p
              class="mt-1.5 rounded-tile border border-dashed border-border px-3 py-3 text-meta text-fg-muted"
            >
              {{ 'obligations.form.noRequirements' | transloco }}
            </p>
          }
          <ol class="mt-1.5 flex flex-col gap-3 empty:hidden" data-testid="requirement-rows">
            @for (d of form().duties; track d.key; let i = $index) {
              <li class="rounded-tile border border-border p-3 sm:p-4">
                <div class="flex items-start gap-2">
                  <span
                    class="mt-2 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-2 text-micro font-bold text-fg-muted"
                    aria-hidden="true"
                    >{{ i + 1 }}</span
                  >
                  <div class="min-w-0 flex-1">
                    <app-form-field [inputId]="'cf-o-req-' + d.key">
                      <label class="sr-only" [for]="'cf-o-req-' + d.key">
                        {{ 'obligations.form.requirementLabel' | transloco: { n: i + 1 } }}
                      </label>
                      <textarea
                        [id]="'cf-o-req-' + d.key"
                        rows="2"
                        maxlength="1000"
                        class="min-h-0"
                        [placeholder]="'obligations.form.requirementPlaceholder' | transloco"
                        [value]="d.title"
                        (input)="setDuty(i, { title: $any($event.target).value })"
                      ></textarea>
                    </app-form-field>
                  </div>
                  <span class="mt-1">
                    <app-button
                      variant="ghost"
                      size="sm"
                      [attr.aria-label]="
                        'obligations.form.removeRequirement' | transloco: { n: i + 1 }
                      "
                      [attr.title]="'obligations.form.removeRequirement' | transloco: { n: i + 1 }"
                      (click)="removeDuty(i)"
                    >
                      <app-icon name="trash" [size]="14" />
                    </app-button>
                  </span>
                </div>
                <div
                  class="mt-3 grid grid-cols-1 items-start gap-x-4 gap-y-4 pl-8 sm:grid-cols-2 sm:pr-10"
                >
                  <app-form-field
                    [label]="'obligations.form.dutyOwner' | transloco"
                    [inputId]="'cf-o-req-owner-' + d.key"
                  >
                    <select
                      [id]="'cf-o-req-owner-' + d.key"
                      (change)="setDuty(i, { owner_user_id: $any($event.target).value })"
                    >
                      <option value="" [selected]="!d.owner_user_id">
                        {{ 'obligations.form.dutyOwnerDefault' | transloco }}
                      </option>
                      @for (u of users(); track u.id) {
                        <option [value]="u.id" [selected]="d.owner_user_id === u.id">
                          {{ u.label }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  <app-form-field
                    [label]="'obligations.form.dutyClauses' | transloco"
                    [inputId]="'cf-o-req-clauses-' + d.key"
                  >
                    <app-clause-picker
                      [inputId]="'cf-o-req-clauses-' + d.key"
                      [frameworks]="pickerFrameworks()"
                      [ngModel]="d.clause_refs"
                      [ngModelOptions]="{ standalone: true }"
                      (ngModelChange)="setDuty(i, { clause_refs: $event })"
                    />
                  </app-form-field>
                </div>
              </li>
            }
          </ol>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <app-button
              variant="secondary"
              size="sm"
              [disabled]="form().duties.length >= maxRequirements"
              (click)="addDuty()"
              data-testid="add-requirement"
            >
              <app-icon name="plus" [size]="14" />
              {{ 'obligations.form.addRequirement' | transloco }}
            </app-button>
            @if (shownErrors()['duties']; as key) {
              <p class="text-meta font-medium text-fail-ink">
                {{ key | transloco: { max: maxRequirements } }}
              </p>
            }
          </div>
        </fieldset>
      </app-form-section>

      <app-form-section
        [title]="'obligations.form.sections.standards' | transloco"
        [description]="'obligations.form.standardsHelp' | transloco"
      >
        <app-field-help
          title-suffix
          scope="obligations"
          page="form"
          field="clause_refs"
          [label]="'obligations.form.sections.standards' | transloco"
        />
        <fieldset class="min-w-0 sm:col-span-2">
          <legend class="flex min-h-6 items-center text-ui font-semibold text-fg-muted">
            {{ 'obligations.fields.frameworks' | transloco }}
          </legend>
          <div class="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            @for (f of frameworkOptions; track f) {
              <label
                class="flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-tile border px-3 text-ui text-fg hover:border-border-strong"
                [class]="
                  form().frameworks.includes(f)
                    ? 'border-accent bg-accent-soft font-semibold'
                    : 'border-border bg-bg'
                "
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 flex-none accent-[var(--accent)]"
                  [checked]="form().frameworks.includes(f)"
                  (change)="toggleFramework(f, $any($event.target).checked)"
                  [attr.data-testid]="'framework-' + f"
                />
                <span class="min-w-0 truncate">{{ frameworkKey(f) | transloco }}</span>
              </label>
            }
          </div>
        </fieldset>
        <app-form-field
          span="full"
          [label]="'obligations.fields.clauseRefs' | transloco"
          inputId="cf-o-clauses"
          [hint]="
            proposed().length
              ? ('obligations.form.clausesProposed' | transloco: { count: proposed().length })
              : ''
          "
          [error]="shownErrors()['clause_refs'] ?? '' | transloco"
        >
          <app-clause-picker
            inputId="cf-o-clauses"
            [frameworks]="pickerFrameworks()"
            [ngModel]="form().clause_refs"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="set('clause_refs', $event)"
            data-testid="obligation-clauses"
          />
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'obligations.form.sections.evaluation' | transloco"
        [description]="'obligations.form.sections.evaluationHint' | transloco"
      >
        <app-field-help
          title-suffix
          scope="obligations"
          page="form"
          field="evaluation"
          [label]="'obligations.form.sections.evaluation' | transloco"
        />
        <div class="sm:col-span-2">
          <label
            class="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-tile border border-border bg-bg px-3 py-2 text-ui font-medium text-fg hover:border-border-strong"
          >
            <input
              type="checkbox"
              class="h-4 w-4 flex-none accent-[var(--accent)]"
              [checked]="form().evaluate"
              (change)="set('evaluate', $any($event.target).checked)"
              data-testid="obligation-evaluate"
            />
            {{ 'obligations.form.scheduleEvaluation' | transloco }}
          </label>
          @if (!form().evaluate) {
            <p class="mt-1.5 text-meta text-warn-ink" role="status">
              {{
                (mode() === 'edit' && value().evaluate
                  ? 'obligations.form.scheduleStops'
                  : 'obligations.form.noScheduleWarning'
                ) | transloco
              }}
            </p>
          }
        </div>
        @if (form().evaluate) {
          <div class="sm:col-span-2">
            <app-recurrence-picker
              [plain]="true"
              [rrule]="form().evaluation_rrule"
              (rruleChange)="set('evaluation_rrule', $event)"
              idPrefix="cf-o-rrule"
            />
            @if (shownErrors()['evaluation_rrule']; as key) {
              <p class="mt-1.5 text-meta font-medium text-fail-ink">{{ key | transloco }}</p>
            }
          </div>
          <app-form-field
            [label]="'obligations.fields.evaluationStart' | transloco"
            inputId="cf-o-eval-start"
            [hint]="'obligations.form.evaluationStartHint' | transloco"
          >
            <app-date-input
              inputId="cf-o-eval-start"
              [value]="form().evaluation_start"
              (valueChange)="set('evaluation_start', $event ?? '')"
            />
          </app-form-field>
          <app-form-field
            [label]="'obligations.fields.evaluationLeadDays' | transloco"
            inputId="cf-o-lead"
            [error]="shownErrors()['evaluation_lead_days'] ?? '' | transloco"
          >
            <app-field-help
              label-suffix
              scope="obligations"
              page="form"
              field="evaluation_lead_days"
              [label]="'obligations.fields.evaluationLeadDays' | transloco"
            />
            <input
              id="cf-o-lead"
              type="number"
              min="0"
              max="366"
              inputmode="numeric"
              [value]="form().evaluation_lead_days"
              (input)="set('evaluation_lead_days', $any($event.target).value)"
            />
          </app-form-field>
        }
      </app-form-section>

      @if (mode() === 'edit') {
        <app-form-section [columns]="1">
          <app-form-field
            [label]="'obligations.form.changeReason' | transloco"
            inputId="cf-o-reason"
            [hint]="
              form().status === 'retired' && value().status !== 'retired'
                ? ('obligations.form.retireNotice' | transloco)
                : ''
            "
          >
            <input
              id="cf-o-reason"
              type="text"
              maxlength="1000"
              [placeholder]="'obligations.form.changeReasonPlaceholder' | transloco"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
              data-testid="obligation-reason"
            />
          </app-form-field>
        </app-form-section>
      }

      <app-form-actions
        [message]="attempted() && hasErrors() ? ('obligations.form.errors.fix' | transloco) : ''"
      >
        <app-button variant="secondary" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button
          type="submit"
          [loading]="busy()"
          [disabled]="busy()"
          data-testid="obligation-save"
        >
          {{ (mode() === 'create' ? 'obligations.form.create' : 'common.save') | transloco }}
        </app-button>
      </app-form-actions>
    </form>
  `,
})
export class ObligationForm {
  private readonly assignees = inject(AssigneeOptionsService);
  protected readonly customers = inject(CustomersAvailability);
  private readonly api = inject(ObligationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly value = input.required<ObligationFormValue>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly busy = input(false);
  /** Display name of the current owner (shown when they are not in the people list). */
  readonly ownerName = input<string | null>(null);
  /** A change reason to start from (edit, e.g. from a change note). */
  readonly reason = input('');

  readonly changed = output<ObligationFormValue>();
  readonly submitted = output<ObligationFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly types = OBLIGATION_TYPES;
  protected readonly statuses = OBLIGATION_STATUSES;
  protected readonly jurisdictions = JURISDICTIONS;
  protected readonly frameworkOptions = FRAMEWORKS;
  protected readonly frameworkKey = frameworkKey;
  protected readonly maxRequirements = MAX_REQUIREMENTS;
  protected readonly maxRenewal = MAX_RENEWAL_LEAD_DAYS;
  protected readonly defaultRenewal = String(DEFAULT_RENEWAL_LEAD_DAYS);

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = linkedSignal(() => this.reason());
  protected readonly attempted = signal(false);
  /** The clauses each framework proposes (`GET clause-defaults`). */
  private readonly clauseDefaults = signal<Readonly<Record<string, readonly string[]>>>({});
  /** Clauses added by ticking a framework (for the "proposed" note). */
  protected readonly proposed = signal<readonly string[]>([]);
  /**
   * The "Gjelder i" choice, kept apart from the value so "Other" stays chosen while its
   * text is still empty.
   */
  protected readonly jurisdiction = linkedSignal(() =>
    jurisdictionChoice(this.form().jurisdiction),
  );
  protected readonly otherJurisdiction = computed(() =>
    jurisdictionChoice(this.form().jurisdiction) === 'other' ? this.form().jurisdiction : '',
  );

  protected readonly errors = computed(() => validateObligationForm(this.form()));
  protected readonly hasErrors = computed(() => Object.keys(this.errors()).length > 0);
  protected readonly shownErrors = computed(() => {
    const errors = this.errors();
    // Format problems show as soon as they exist; a missing title only after submitting.
    return this.attempted()
      ? errors
      : Object.fromEntries(Object.entries(errors).filter(([k]) => k !== 'title'));
  });
  protected readonly renewable = computed(() => isRenewable(this.form().obligation_type));
  /** The clause picker searches the ticked standards first (all when none is ticked). */
  protected readonly pickerFrameworks = computed(() =>
    this.form().frameworks.length ? this.form().frameworks : null,
  );

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

  private request = new Subscription();

  constructor() {
    this.assignees.ensureLoaded();
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId) {
          return;
        }
        this.request = this.api.clauseDefaults(orgId).subscribe({
          next: (res) => this.clauseDefaults.set(res.items ?? {}),
          error: () => this.clauseDefaults.set({}),
        });
      });
    });
  }

  protected set<K extends keyof ObligationFormValue>(key: K, value: ObligationFormValue[K]): void {
    this.update({ [key]: value } as Partial<ObligationFormValue>);
  }

  protected setType(value: string): void {
    if (isObligationType(value)) {
      this.update({ obligation_type: value });
    }
  }

  protected setStatus(value: string): void {
    if ((OBLIGATION_STATUSES as readonly string[]).includes(value)) {
      this.update({ status: value as ObligationStatus });
    }
  }

  protected setJurisdiction(value: string): void {
    this.jurisdiction.set(value);
    this.update({ jurisdiction: value === 'other' ? '' : value });
  }

  /** Ticking a standard tags it and proposes its usual clauses (removable). */
  protected toggleFramework(framework: FrameworkKey, on: boolean): void {
    const current = this.form().frameworks.filter((f) => f !== framework);
    const defaults = this.clauseDefaults()[framework] ?? [];
    if (on) {
      const before = this.form().clause_refs;
      const clauses = mergeRefs(before, defaults);
      this.proposed.set(clauses.filter((r) => !before.includes(r)));
      this.update({ frameworks: [...current, framework], clause_refs: clauses });
    } else {
      // Drop only the proposals this tick added that the user has not kept on purpose.
      const added = new Set(this.proposed());
      this.update({
        frameworks: current,
        clause_refs: this.form().clause_refs.filter((r) => !(added.has(r) && defaults.includes(r))),
      });
      this.proposed.set([]);
    }
  }

  protected addDuty(): void {
    const list = this.form().duties;
    if (list.length < MAX_REQUIREMENTS) {
      this.update({ duties: [...list, newDuty()] });
    }
  }

  protected setDuty(index: number, patch: Partial<DutyDraft>): void {
    this.update({
      duties: this.form().duties.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    });
  }

  protected removeDuty(index: number): void {
    this.update({ duties: this.form().duties.filter((_, i) => i !== index) });
  }

  protected submit(): void {
    this.attempted.set(true);
    if (this.hasErrors() || this.busy()) {
      return;
    }
    this.submitted.emit({ value: this.form(), changeReason: this.changeReason() });
  }

  private update(patch: Partial<ObligationFormValue>): void {
    const next = { ...this.form(), ...patch };
    this.form.set(next);
    this.changed.emit(next);
  }
}

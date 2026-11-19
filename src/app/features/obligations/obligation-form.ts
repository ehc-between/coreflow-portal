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
import { Card } from '../../shared/ui/card/card';
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
    Card,
    FormField,
    Icon,
    CustomerPicker,
  ],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <ng-content select="[before]" />

      <app-card>
        <h2 class="mb-4 font-display text-section font-bold text-fg">
          {{ 'obligations.form.sections.basics' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <app-form-field [label]="'obligations.fields.title' | transloco" inputId="cf-o-title">
              <input
                id="cf-o-title"
                type="text"
                maxlength="255"
                required
                [placeholder]="'obligations.form.titlePlaceholder' | transloco"
                [value]="form().title"
                (input)="set('title', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['title']"
                [attr.aria-describedby]="shownErrors()['title'] ? 'cf-o-title-err' : null"
                data-testid="obligation-title"
              />
            </app-form-field>
            @if (shownErrors()['title']; as key) {
              <p id="cf-o-title-err" class="mt-1 text-meta text-fail-ink">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <div class="mb-1.5 flex items-center gap-1.5">
              <label for="cf-o-type" class="text-ui font-semibold text-fg-muted">{{
                'obligations.fields.obligationType' | transloco
              }}</label>
              <app-field-help scope="obligations" page="form" field="obligation_type" />
            </div>
            <app-form-field inputId="cf-o-type">
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
          </div>
          <div>
            <div class="mb-1.5 flex items-center gap-1.5">
              <label for="cf-o-status" class="text-ui font-semibold text-fg-muted">{{
                'obligations.fields.status' | transloco
              }}</label>
              <app-field-help scope="obligations" page="form" field="status" />
            </div>
            <app-form-field inputId="cf-o-status">
              <select id="cf-o-status" (change)="setStatus($any($event.target).value)">
                @for (s of statuses; track s) {
                  <option [value]="s" [selected]="form().status === s">
                    {{ 'obligations.status.' + s | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <div>
            <div class="mb-1.5 flex items-center gap-1.5">
              <label for="cf-o-owner" class="text-ui font-semibold text-fg-muted">{{
                'obligations.fields.owner' | transloco
              }}</label>
              <app-field-help scope="obligations" page="form" field="owner" />
            </div>
            <app-form-field inputId="cf-o-owner">
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
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.department' | transloco"
              inputId="cf-o-dept"
            >
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
          </div>
          <div class="sm:col-span-2">
            <div class="mb-1.5 flex items-center gap-1.5">
              <label for="cf-o-description" class="text-ui font-semibold text-fg-muted">{{
                'obligations.fields.description' | transloco
              }}</label>
              <app-field-help scope="obligations" page="form" field="description" />
            </div>
            <app-form-field inputId="cf-o-description">
              <textarea
                id="cf-o-description"
                rows="3"
                maxlength="20000"
                [value]="form().description"
                (input)="set('description', $any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-section font-bold text-fg">
          {{ 'obligations.form.sections.source' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
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
            </app-form-field>
            @if (jurisdiction() === 'other') {
              <label for="cf-o-jurisdiction-text" class="sr-only">{{
                'obligations.form.jurisdictionOther' | transloco
              }}</label>
              <input
                id="cf-o-jurisdiction-text"
                type="text"
                maxlength="64"
                class="mt-2 h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                [placeholder]="'obligations.form.jurisdictionPlaceholder' | transloco"
                [value]="otherJurisdiction()"
                (input)="set('jurisdiction', $any($event.target).value)"
              />
            }
          </div>
          <div>
            <div class="mb-1.5 flex items-center gap-1.5">
              <label for="cf-o-issuer" class="text-ui font-semibold text-fg-muted">{{
                'obligations.fields.issuer' | transloco
              }}</label>
              <app-field-help scope="obligations" page="form" field="issuer" />
            </div>
            <app-form-field inputId="cf-o-issuer">
              <input
                id="cf-o-issuer"
                type="text"
                maxlength="255"
                [placeholder]="'obligations.form.issuerPlaceholder' | transloco"
                [value]="form().issuer"
                (input)="set('issuer', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          @if (customers.enabled()) {
            <div>
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
            </div>
          }
          <div>
            <div class="mb-1.5 flex items-center gap-1.5">
              <label for="cf-o-reference" class="text-ui font-semibold text-fg-muted">{{
                'obligations.fields.reference' | transloco
              }}</label>
              <app-field-help scope="obligations" page="form" field="reference" />
            </div>
            <app-form-field inputId="cf-o-reference">
              <input
                id="cf-o-reference"
                type="text"
                maxlength="255"
                [placeholder]="'obligations.form.referencePlaceholder' | transloco"
                [value]="form().reference"
                (input)="set('reference', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.sourceUrl' | transloco"
              inputId="cf-o-source"
            >
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
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.validFrom' | transloco"
              inputId="cf-o-from"
            >
              <input
                id="cf-o-from"
                type="date"
                [value]="form().valid_from"
                (change)="set('valid_from', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          <div>
            <div class="mb-1.5 flex items-center gap-1.5">
              <label for="cf-o-until" class="text-ui font-semibold text-fg-muted">{{
                'obligations.fields.validUntil' | transloco
              }}</label>
              <app-field-help scope="obligations" page="form" field="valid_until" />
            </div>
            <app-form-field inputId="cf-o-until">
              <input
                id="cf-o-until"
                type="date"
                [value]="form().valid_until"
                (change)="set('valid_until', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['valid_until']"
                [attr.aria-describedby]="shownErrors()['valid_until'] ? 'cf-o-until-err' : null"
              />
            </app-form-field>
            @if (shownErrors()['valid_until']; as key) {
              <p id="cf-o-until-err" class="mt-1 text-meta text-fail-ink">{{ key | transloco }}</p>
            }
          </div>
          @if (renewable()) {
            <div class="sm:col-span-2">
              <div class="mb-1.5 flex items-center gap-1.5">
                <label for="cf-o-renewal" class="text-ui font-semibold text-fg-muted">{{
                  'obligations.fields.renewalLeadDays' | transloco
                }}</label>
                <app-field-help scope="obligations" page="form" field="renewal_lead_days" />
              </div>
              <app-form-field inputId="cf-o-renewal">
                <input
                  id="cf-o-renewal"
                  type="number"
                  min="0"
                  [max]="maxRenewal"
                  inputmode="numeric"
                  class="sm:max-w-[200px]"
                  [placeholder]="defaultRenewal"
                  [value]="form().renewal_lead_days"
                  (input)="set('renewal_lead_days', $any($event.target).value)"
                  [attr.aria-invalid]="!!shownErrors()['renewal_lead_days']"
                  data-testid="obligation-renewal"
                />
              </app-form-field>
              <p class="mt-1 text-meta text-fg-subtle">
                {{ 'obligations.form.renewalHint' | transloco: { days: defaultRenewal } }}
              </p>
              @if (shownErrors()['renewal_lead_days']; as key) {
                <p class="mt-1 text-meta text-fail-ink">
                  {{ key | transloco: { max: maxRenewal } }}
                </p>
              }
            </div>
          }
        </div>
      </app-card>

      <app-card>
        <div id="duties" class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 class="flex items-center gap-1.5 font-display text-section font-bold text-fg">
            {{ 'obligations.form.sections.requirements' | transloco }}
            <app-field-help scope="obligations" page="form" field="requirements" />
          </h2>
          <ng-content select="[proposal]" />
        </div>
        <div class="flex flex-col gap-4">
          <div>
            <div class="mb-1.5 flex items-center gap-1.5">
              <label for="cf-o-applicability" class="text-ui font-semibold text-fg-muted">{{
                'obligations.fields.applicability' | transloco
              }}</label>
              <app-field-help scope="obligations" page="form" field="applicability" />
              <app-ask-about
                [prompt]="'obligations.ask.applicability' | transloco"
                field="applicability"
                [fieldLabel]="'obligations.fields.applicability' | transloco"
                labelKey="obligations.ask.applicabilityLabel"
              />
            </div>
            <app-form-field inputId="cf-o-applicability">
              <textarea
                id="cf-o-applicability"
                rows="3"
                maxlength="20000"
                [placeholder]="'obligations.form.applicabilityPlaceholder' | transloco"
                [value]="form().applicability"
                (input)="set('applicability', $any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>

          <fieldset>
            <legend class="mb-1 text-ui font-semibold text-fg-muted">
              {{ 'obligations.fields.requirements' | transloco }}
            </legend>
            @if (form().duties.length === 0) {
              <p class="mt-1 text-ui text-fg-muted">
                {{ 'obligations.form.noRequirements' | transloco }}
              </p>
            }
            <ol class="mt-2 flex flex-col gap-3" data-testid="requirement-rows">
              @for (d of form().duties; track d.key; let i = $index) {
                <li class="rounded-tile border border-border p-3">
                  <div class="flex items-start gap-2">
                    <span class="mt-2 w-6 flex-none text-right text-meta text-fg-subtle"
                      >{{ i + 1 }}.</span
                    >
                    <label class="sr-only" [for]="'cf-o-req-' + d.key">
                      {{ 'obligations.form.requirementLabel' | transloco: { n: i + 1 } }}
                    </label>
                    <textarea
                      [id]="'cf-o-req-' + d.key"
                      rows="2"
                      maxlength="1000"
                      class="min-w-0 flex-1 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                      [placeholder]="'obligations.form.requirementPlaceholder' | transloco"
                      [value]="d.title"
                      (input)="setDuty(i, { title: $any($event.target).value })"
                    ></textarea>
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
                  </div>
                  <div class="mt-2 grid grid-cols-1 gap-2 pl-8 sm:grid-cols-2">
                    <div>
                      <label
                        [for]="'cf-o-req-owner-' + d.key"
                        class="mb-1 block text-meta font-semibold text-fg-muted"
                        >{{ 'obligations.form.dutyOwner' | transloco }}</label
                      >
                      <select
                        [id]="'cf-o-req-owner-' + d.key"
                        class="h-9 w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg"
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
                    </div>
                    <div>
                      <label
                        [for]="'cf-o-req-clauses-' + d.key"
                        class="mb-1 block text-meta font-semibold text-fg-muted"
                        >{{ 'obligations.form.dutyClauses' | transloco }}</label
                      >
                      <app-clause-picker
                        [inputId]="'cf-o-req-clauses-' + d.key"
                        [frameworks]="pickerFrameworks()"
                        [ngModel]="d.clause_refs"
                        [ngModelOptions]="{ standalone: true }"
                        (ngModelChange)="setDuty(i, { clause_refs: $event })"
                      />
                    </div>
                  </div>
                </li>
              }
            </ol>
            <div class="mt-3">
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
            </div>
            @if (shownErrors()['duties']; as key) {
              <p class="mt-1 text-meta text-fail-ink">
                {{ key | transloco: { max: maxRequirements } }}
              </p>
            }
          </fieldset>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-1 flex items-center gap-1.5 font-display text-section font-bold text-fg">
          {{ 'obligations.form.sections.standards' | transloco }}
          <app-field-help scope="obligations" page="form" field="clause_refs" />
        </h2>
        <p class="mb-4 text-meta text-fg-muted">
          {{ 'obligations.form.standardsHelp' | transloco }}
        </p>
        <fieldset>
          <legend class="mb-2 text-ui font-semibold text-fg-muted">
            {{ 'obligations.fields.frameworks' | transloco }}
          </legend>
          <div class="flex flex-wrap gap-x-4 gap-y-2">
            @for (f of frameworkOptions; track f) {
              <label class="inline-flex items-center gap-2 text-ui text-fg">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="form().frameworks.includes(f)"
                  (change)="toggleFramework(f, $any($event.target).checked)"
                  [attr.data-testid]="'framework-' + f"
                />
                {{ frameworkKey(f) | transloco }}
              </label>
            }
          </div>
        </fieldset>
        <div class="mt-4">
          <app-form-field
            [label]="'obligations.fields.clauseRefs' | transloco"
            inputId="cf-o-clauses"
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
          @if (proposed().length) {
            <p class="mt-1 text-meta text-fg-subtle" role="status">
              {{ 'obligations.form.clausesProposed' | transloco: { count: proposed().length } }}
            </p>
          }
          @if (shownErrors()['clause_refs']; as key) {
            <p class="mt-1 text-meta text-fail-ink">{{ key | transloco }}</p>
          }
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-1 flex items-center gap-1.5 font-display text-section font-bold text-fg">
          {{ 'obligations.form.sections.evaluation' | transloco }}
          <app-field-help scope="obligations" page="form" field="evaluation" />
        </h2>
        <label class="mt-3 flex items-center gap-2 text-body text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="form().evaluate"
            (change)="set('evaluate', $any($event.target).checked)"
            data-testid="obligation-evaluate"
          />
          {{ 'obligations.form.scheduleEvaluation' | transloco }}
        </label>
        @if (form().evaluate) {
          <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <app-recurrence-picker
                [rrule]="form().evaluation_rrule"
                (rruleChange)="set('evaluation_rrule', $event)"
                idPrefix="cf-o-rrule"
              />
              @if (shownErrors()['evaluation_rrule']; as key) {
                <p class="mt-1 text-meta text-fail-ink">{{ key | transloco }}</p>
              }
            </div>
            <div>
              <app-form-field
                [label]="'obligations.fields.evaluationStart' | transloco"
                inputId="cf-o-eval-start"
              >
                <input
                  id="cf-o-eval-start"
                  type="date"
                  [value]="form().evaluation_start"
                  (change)="set('evaluation_start', $any($event.target).value)"
                />
              </app-form-field>
              <p class="mt-1 text-meta text-fg-subtle">
                {{ 'obligations.form.evaluationStartHint' | transloco }}
              </p>
            </div>
            <div>
              <div class="mb-1.5 flex items-center gap-1.5">
                <label for="cf-o-lead" class="text-ui font-semibold text-fg-muted">{{
                  'obligations.fields.evaluationLeadDays' | transloco
                }}</label>
                <app-field-help scope="obligations" page="form" field="evaluation_lead_days" />
              </div>
              <app-form-field inputId="cf-o-lead">
                <input
                  id="cf-o-lead"
                  type="number"
                  min="0"
                  max="366"
                  inputmode="numeric"
                  [value]="form().evaluation_lead_days"
                  (input)="set('evaluation_lead_days', $any($event.target).value)"
                  [attr.aria-invalid]="!!shownErrors()['evaluation_lead_days']"
                />
              </app-form-field>
              @if (shownErrors()['evaluation_lead_days']; as key) {
                <p class="mt-1 text-meta text-fail-ink">{{ key | transloco }}</p>
              }
            </div>
          </div>
        } @else {
          <p class="mt-2 text-meta text-warn-ink" role="status">
            {{
              (mode() === 'edit' && value().evaluate
                ? 'obligations.form.scheduleStops'
                : 'obligations.form.noScheduleWarning'
              ) | transloco
            }}
          </p>
        }
      </app-card>

      @if (mode() === 'edit') {
        <app-card>
          <app-form-field
            [label]="'obligations.form.changeReason' | transloco"
            inputId="cf-o-reason"
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
          @if (form().status === 'retired' && value().status !== 'retired') {
            <p class="mt-2 text-meta text-fg-muted">
              {{ 'obligations.form.retireNotice' | transloco }}
            </p>
          }
        </app-card>
      }

      @if (attempted() && hasErrors()) {
        <p class="text-meta text-fail-ink" role="alert">
          {{ 'obligations.form.errors.fix' | transloco }}
        </p>
      }
      <div
        class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0"
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
      </div>
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

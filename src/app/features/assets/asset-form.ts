import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { blankToNull, dayOrNull } from './data/asset-display';
import {
  ASSET_TYPES,
  AssetDetail,
  AssetFields,
  AssetType,
  CLASSIFICATIONS,
  CRITICALITIES,
  Classification,
  ClassificationSuggestion,
  ControlSuggestion,
  Criticality,
  LEVELS,
  LIFECYCLE_STATUSES,
  Level,
  LifecycleStatus,
} from './data/asset.models';
import { AssetDepartmentSelect, AssetUserSelect } from './shared/people-select';
import { AssetSupplierSelect, SupplierOptionsService } from './shared/supplier-select';

/** What the form submits: the full field set, plus the first calibration (new) or the reason (edit). */
export interface AssetFormValue {
  readonly fields: AssetFields;
  readonly lastCalibratedOn: string | null;
  readonly changeReason: string | null;
}

/** Register review intervals offered (months). */
export const REVIEW_INTERVALS = [3, 6, 12, 24, 36] as const;

export interface AssetDraft {
  name: string;
  asset_type: AssetType;
  category: string;
  description: string;
  classification: Classification;
  confidentiality: Level | '';
  integrity: Level | '';
  availability: Level | '';
  criticality: Criticality | '';
  contains_personal_data: boolean;
  handling_rules: string;
  owner_user_id: string;
  custodian_user_id: string;
  department_id: string;
  location: string;
  vendor: string;
  supplier_id: string;
  model: string;
  serial_number: string;
  version: string;
  lifecycle_status: LifecycleStatus;
  acquired_on: string;
  warranty_until: string;
  end_of_life_on: string;
  review_date: string;
  review_interval_months: string;
  retired_on: string;
  disposed_on: string;
  disposal_method: string;
  requires_calibration: boolean;
  calibration_interval_months: string;
  measurement_range: string;
  accuracy: string;
  next_calibration_due: string;
  last_calibrated_on: string;
  notes: string;
}

export function assetDraftFrom(a: AssetDetail | null): AssetDraft {
  return {
    name: a?.name ?? '',
    asset_type: a?.asset_type ?? 'other',
    category: a?.category ?? '',
    description: a?.description ?? '',
    classification: a?.classification ?? 'internal',
    confidentiality: a?.confidentiality ?? '',
    integrity: a?.integrity ?? '',
    availability: a?.availability ?? '',
    criticality: a?.criticality ?? '',
    contains_personal_data: a?.contains_personal_data ?? false,
    handling_rules: a?.handling_rules ?? '',
    owner_user_id: a?.owner_user_id ?? '',
    custodian_user_id: a?.custodian_user_id ?? '',
    department_id: a?.department_id ?? '',
    location: a?.location ?? '',
    vendor: a?.vendor ?? '',
    supplier_id: a?.supplier_id ?? '',
    model: a?.model ?? '',
    serial_number: a?.serial_number ?? '',
    version: a?.version ?? '',
    lifecycle_status: a?.lifecycle_status ?? 'in_use',
    acquired_on: a?.acquired_on ?? '',
    warranty_until: a?.warranty_until ?? '',
    end_of_life_on: a?.end_of_life_on ?? '',
    review_date: a?.review_date ?? '',
    review_interval_months: a?.review_interval_months?.toString() ?? '',
    retired_on: a?.retired_on ?? '',
    disposed_on: a?.disposed_on ?? '',
    disposal_method: a?.disposal_method ?? '',
    requires_calibration: a?.requires_calibration ?? false,
    calibration_interval_months: a?.calibration_interval_months?.toString() ?? '',
    measurement_range: a?.measurement_range ?? '',
    accuracy: a?.accuracy ?? '',
    next_calibration_due: a?.next_calibration_due ?? '',
    last_calibrated_on: a?.last_calibrated_on ?? '',
    notes: a?.notes ?? '',
  };
}

/** The API field set of a draft (blank strings become null). */
export function assetFieldsFrom(d: AssetDraft): AssetFields {
  const interval = Number.parseInt(d.calibration_interval_months, 10);
  const reviewInterval = Number.parseInt(d.review_interval_months, 10);
  return {
    name: d.name.trim(),
    asset_type: d.asset_type,
    category: blankToNull(d.category),
    description: blankToNull(d.description),
    classification: d.classification,
    confidentiality: d.confidentiality || null,
    integrity: d.integrity || null,
    availability: d.availability || null,
    criticality: d.criticality || null,
    contains_personal_data: d.contains_personal_data,
    handling_rules: blankToNull(d.handling_rules),
    owner_user_id: d.owner_user_id || null,
    custodian_user_id: d.custodian_user_id || null,
    department_id: d.department_id || null,
    location: blankToNull(d.location),
    vendor: blankToNull(d.vendor),
    supplier_id: d.supplier_id || null,
    model: blankToNull(d.model),
    serial_number: blankToNull(d.serial_number),
    version: blankToNull(d.version),
    lifecycle_status: d.lifecycle_status,
    acquired_on: dayOrNull(d.acquired_on),
    warranty_until: dayOrNull(d.warranty_until),
    end_of_life_on: dayOrNull(d.end_of_life_on),
    review_date: dayOrNull(d.review_date),
    review_interval_months: Number.isFinite(reviewInterval) ? reviewInterval : null,
    retired_on: dayOrNull(d.retired_on),
    disposed_on: dayOrNull(d.disposed_on),
    disposal_method: blankToNull(d.disposal_method),
    requires_calibration: d.requires_calibration,
    calibration_interval_months:
      d.requires_calibration && Number.isFinite(interval) ? interval : null,
    measurement_range: blankToNull(d.measurement_range),
    accuracy: blankToNull(d.accuracy),
    next_calibration_due: d.requires_calibration ? dayOrNull(d.next_calibration_due) : null,
    notes: blankToNull(d.notes),
  };
}

/** Apply a classification suggestion to a draft (only the values the suggestion gives). */
export function applySuggestion(d: AssetDraft, s: ClassificationSuggestion): AssetDraft {
  const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : null;
  return {
    ...d,
    asset_type: pick(s.asset_type, ASSET_TYPES) ?? d.asset_type,
    classification: pick(s.classification, CLASSIFICATIONS) ?? d.classification,
    confidentiality: pick(s.confidentiality, LEVELS) ?? d.confidentiality,
    integrity: pick(s.integrity, LEVELS) ?? d.integrity,
    availability: pick(s.availability, LEVELS) ?? d.availability,
    criticality: pick(s.criticality, CRITICALITIES) ?? d.criticality,
    contains_personal_data:
      typeof s.contains_personal_data === 'boolean'
        ? s.contains_personal_data
        : d.contains_personal_data,
    handling_rules: s.handling_rules?.trim() ? s.handling_rules : d.handling_rules,
  };
}

/**
 * Create / edit form of an asset: what it is, how it is classified (criticality and
 * the confidentiality / integrity / availability ratings, with an assistant
 * suggestion), who owns and who holds it, the supplier (from the Suppliers register,
 * with free text as a fallback), its lifecycle and register review, and, for measuring
 * equipment, the calibration schedule. In edit mode the next calibration date is
 * calculated from the history (an explicit override is possible) and the form asks
 * for the reason for the change (assets keep a revision history).
 */
@Component({
  selector: 'app-asset-form',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    AiAssistButton,
    AskAbout,
    AssetDepartmentSelect,
    AssetSupplierSelect,
    AssetUserSelect,
    Button,
    Card,
    FieldHelp,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-3 font-display text-card font-bold text-fg">
          {{ 'assets.form.sections.identity' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'assets.fields.name' | transloco"
              inputId="ast-name"
              [required]="true"
            >
              <input
                id="ast-name"
                type="text"
                maxlength="255"
                required
                aria-required="true"
                [attr.aria-invalid]="showErrors() && !d().name.trim()"
                aria-describedby="ast-name-err"
                [value]="d().name"
                (input)="set('name', $any($event.target).value)"
              />
            </app-form-field>
            @if (showErrors() && !d().name.trim()) {
              <p id="ast-name-err" class="mt-1 text-meta text-fail-ink" role="alert">
                {{ 'assets.form.nameRequired' | transloco }}
              </p>
            }
          </div>
          <app-form-field
            [label]="'assets.fields.assetType' | transloco"
            inputId="ast-type"
            [required]="true"
          >
            <app-field-help label-suffix scope="assets" page="form" field="asset_type" />
            <select id="ast-type" (change)="set('asset_type', $any($event.target).value)">
              @for (t of types; track t) {
                <option [value]="t" [selected]="d().asset_type === t">
                  {{ 'assets.assetType.' + t | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'assets.fields.category' | transloco" inputId="ast-cat">
            <input
              id="ast-cat"
              type="text"
              maxlength="64"
              [placeholder]="'assets.form.categoryPlaceholder' | transloco"
              [value]="d().category"
              (input)="set('category', $any($event.target).value)"
            />
          </app-form-field>
          <div class="sm:col-span-2">
            <app-form-field [label]="'assets.fields.description' | transloco" inputId="ast-desc">
              <textarea
                id="ast-desc"
                rows="3"
                maxlength="10000"
                [value]="d().description"
                (input)="set('description', $any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
        </div>
      </app-card>

      <app-card>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-display text-card font-bold text-fg">
            {{ 'assets.form.sections.classification' | transloco }}
          </h2>
          <app-ai-assist-button
            assist="assets.suggest_classification"
            labelKey="assets.ai.suggestClassification"
            [input]="assistInput()"
            [disabled]="!d().name.trim()"
            (result)="onSuggestion($event)"
          />
        </div>
        @if (suggestion(); as s) {
          <div
            class="mb-4 rounded-tile border border-accent/30 bg-accent-soft px-3 py-2.5 text-ui text-fg"
            role="status"
          >
            <p class="font-semibold">{{ 'assets.form.suggestionApplied' | transloco }}</p>
            @if (s.rationale) {
              <p class="mt-1 text-fg-muted">{{ s.rationale }}</p>
            }
            @if (controls().length) {
              <p class="mt-2 text-meta font-semibold text-fg-muted">
                {{ 'assets.form.suggestedControls' | transloco }}
              </p>
              <ul class="mt-1 flex flex-col gap-1">
                @for (c of controls(); track c.ref) {
                  <li class="text-meta">
                    <span class="font-mono text-fg-muted">{{ c.ref }}</span>
                    @if (c.title) {
                      {{ c.title }}
                    }
                    @if (c.reason) {
                      <span class="text-fg-subtle"> · {{ c.reason }}</span>
                    }
                  </li>
                }
              </ul>
            }
          </div>
        }
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-form-field
            [label]="'assets.fields.classification' | transloco"
            inputId="ast-class"
            [required]="true"
          >
            <app-field-help label-suffix scope="assets" page="form" field="classification" />
            <app-ask-about
              label-suffix
              [prompt]="'assets.ai.prompts.classification' | transloco"
              field="classification"
              [fieldLabel]="'assets.fields.classification' | transloco"
              labelKey="assets.ai.askClassification"
            />
            <select id="ast-class" (change)="set('classification', $any($event.target).value)">
              @for (c of classifications; track c) {
                <option [value]="c" [selected]="d().classification === c">
                  {{ 'assets.classificationOption.' + c | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'assets.fields.criticality' | transloco" inputId="ast-crit">
            <app-field-help label-suffix scope="assets" page="form" field="criticality" />
            <select id="ast-crit" (change)="set('criticality', $any($event.target).value)">
              <option value="" [selected]="!d().criticality">
                {{ 'assets.common.notSet' | transloco }}
              </option>
              @for (c of criticalities; track c) {
                <option [value]="c" [selected]="d().criticality === c">
                  {{ 'assets.criticality.' + c | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <label class="flex items-start gap-2 text-body text-fg sm:col-span-2">
            <input
              type="checkbox"
              class="mt-1"
              [checked]="d().contains_personal_data"
              (change)="set('contains_personal_data', $any($event.target).checked)"
            />
            <span>
              {{ 'assets.fields.containsPersonalData' | transloco }}
              <span class="block text-meta text-fg-subtle">
                {{ 'assets.form.personalDataHint' | transloco }}
              </span>
            </span>
          </label>
          <details
            class="rounded-tile border border-border px-3 py-2 sm:col-span-2"
            [open]="securityOpen()"
          >
            <summary class="cursor-pointer text-ui font-semibold text-fg">
              {{ 'assets.form.securitySection' | transloco }}
              <span class="ml-1 font-normal text-fg-muted">{{
                'assets.form.securitySectionHint' | transloco
              }}</span>
            </summary>
            <div class="mt-3 grid grid-cols-1 gap-4">
              <fieldset>
                <legend class="mb-2 flex items-center gap-1.5 text-ui font-semibold text-fg-muted">
                  {{ 'assets.form.cia' | transloco }}
                  <app-field-help scope="assets" page="form" field="cia" />
                  <app-ask-about
                    [prompt]="'assets.ai.prompts.cia' | transloco"
                    field="cia"
                    [fieldLabel]="'assets.form.cia' | transloco"
                    labelKey="assets.ai.askCia"
                  />
                </legend>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  @for (key of ciaKeys; track key) {
                    <app-form-field
                      [label]="'assets.fields.' + key | transloco"
                      [inputId]="'ast-' + key"
                    >
                      <select [id]="'ast-' + key" (change)="set(key, $any($event.target).value)">
                        <option value="" [selected]="!d()[key]">
                          {{ 'assets.common.notSet' | transloco }}
                        </option>
                        @for (l of levels; track l) {
                          <option [value]="l" [selected]="d()[key] === l">
                            {{ 'assets.level.' + l | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                  }
                </div>
              </fieldset>
              <app-form-field
                [label]="'assets.fields.handlingRules' | transloco"
                inputId="ast-handling"
              >
                <app-field-help label-suffix scope="assets" page="form" field="handling_rules" />
                <textarea
                  id="ast-handling"
                  rows="2"
                  maxlength="10000"
                  [placeholder]="'assets.form.handlingPlaceholder' | transloco"
                  [value]="d().handling_rules"
                  (input)="set('handling_rules', $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          </details>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-3 font-display text-card font-bold text-fg">
          {{ 'assets.form.sections.responsibility' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <app-form-field [label]="'assets.fields.owner' | transloco" inputId="ast-owner">
              <app-field-help label-suffix scope="assets" page="form" field="owner" />
              <app-asset-user-select
                inputId="ast-owner"
                [value]="d().owner_user_id"
                [currentName]="value()?.owner?.name ?? null"
                (valueChange)="set('owner_user_id', $event)"
              />
            </app-form-field>
            @if (!editing()) {
              <p class="mt-1 text-meta text-fg-subtle">
                {{ 'assets.form.ownerHint' | transloco }}
              </p>
            }
          </div>
          <app-form-field [label]="'assets.fields.custodian' | transloco" inputId="ast-custodian">
            <app-field-help label-suffix scope="assets" page="form" field="custodian" />
            <app-asset-user-select
              inputId="ast-custodian"
              [value]="d().custodian_user_id"
              [currentName]="value()?.custodian?.name ?? null"
              (valueChange)="set('custodian_user_id', $event)"
            />
          </app-form-field>
          <app-form-field [label]="'assets.fields.department' | transloco" inputId="ast-dept">
            <app-asset-department-select
              inputId="ast-dept"
              [value]="d().department_id"
              (valueChange)="set('department_id', $event)"
            />
          </app-form-field>
          <app-form-field [label]="'assets.fields.location' | transloco" inputId="ast-location">
            <input
              id="ast-location"
              type="text"
              maxlength="255"
              [value]="d().location"
              (input)="set('location', $any($event.target).value)"
            />
          </app-form-field>
          @if (suppliers.available()) {
            <app-form-field [label]="'assets.fields.supplier' | transloco" inputId="ast-supplier">
              <app-field-help label-suffix scope="assets" page="form" field="supplier" />
              <app-asset-supplier-select
                inputId="ast-supplier"
                [value]="d().supplier_id"
                [currentLabel]="value()?.supplier?.name ?? null"
                (valueChange)="set('supplier_id', $event)"
              />
            </app-form-field>
          }
          @if (!suppliers.available() || !d().supplier_id) {
            <app-form-field
              [label]="
                (suppliers.available() ? 'assets.fields.vendorOther' : 'assets.fields.vendor')
                  | transloco
              "
              inputId="ast-vendor"
            >
              <input
                id="ast-vendor"
                type="text"
                maxlength="255"
                [value]="d().vendor"
                (input)="set('vendor', $any($event.target).value)"
              />
            </app-form-field>
          }
          @for (key of detailKeys; track key.field) {
            <app-form-field
              [label]="'assets.fields.' + key.label | transloco"
              [inputId]="'ast-' + key.field"
            >
              <input
                [id]="'ast-' + key.field"
                type="text"
                [attr.maxlength]="key.max"
                [value]="d()[key.field]"
                (input)="set(key.field, $any($event.target).value)"
              />
            </app-form-field>
          }
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-3 font-display text-card font-bold text-fg">
          {{ 'assets.form.sections.lifecycle' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-form-field
            [label]="'assets.fields.lifecycle' | transloco"
            inputId="ast-life"
            [required]="true"
          >
            <app-field-help label-suffix scope="assets" page="form" field="lifecycle_status" />
            <select id="ast-life" (change)="set('lifecycle_status', $any($event.target).value)">
              @for (l of lifecycles; track l) {
                <option [value]="l" [selected]="d().lifecycle_status === l">
                  {{ 'assets.lifecycle.' + l | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'assets.fields.reviewDate' | transloco" inputId="ast-review">
            <app-field-help label-suffix scope="assets" page="form" field="review_date" />
            <input
              id="ast-review"
              type="date"
              [attr.lang]="lang()"
              [value]="d().review_date"
              (input)="set('review_date', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field
            [label]="'assets.fields.reviewInterval' | transloco"
            inputId="ast-review-interval"
          >
            <select
              id="ast-review-interval"
              (change)="set('review_interval_months', $any($event.target).value)"
            >
              <option value="" [selected]="!d().review_interval_months">
                {{ 'assets.form.reviewIntervalDefault' | transloco }}
              </option>
              @for (m of reviewIntervals; track m) {
                <option [value]="m" [selected]="d().review_interval_months === '' + m">
                  {{ 'assets.review.everyMonths' | transloco: { months: m } }}
                </option>
              }
            </select>
          </app-form-field>
          @for (key of dateKeys; track key.field) {
            <app-form-field
              [label]="'assets.fields.' + key.label | transloco"
              [inputId]="'ast-' + key.field"
            >
              <input
                [id]="'ast-' + key.field"
                type="date"
                [attr.lang]="lang()"
                [value]="d()[key.field]"
                (input)="set(key.field, $any($event.target).value)"
              />
            </app-form-field>
          }
          @if (d().lifecycle_status === 'retired' || d().lifecycle_status === 'disposed') {
            <app-form-field [label]="'assets.fields.retiredOn' | transloco" inputId="ast-retired">
              <input
                id="ast-retired"
                type="date"
                aria-describedby="ast-retired-hint"
                [attr.lang]="lang()"
                [value]="d().retired_on"
                (input)="set('retired_on', $any($event.target).value)"
              />
            </app-form-field>
          }
          @if (d().lifecycle_status === 'disposed') {
            <app-form-field [label]="'assets.fields.disposedOn' | transloco" inputId="ast-disposed">
              <input
                id="ast-disposed"
                type="date"
                [attr.lang]="lang()"
                [value]="d().disposed_on"
                (input)="set('disposed_on', $any($event.target).value)"
              />
            </app-form-field>
            <div class="sm:col-span-2">
              <app-form-field
                [label]="'assets.fields.disposalMethod' | transloco"
                inputId="ast-disposal"
              >
                <app-field-help label-suffix scope="assets" page="form" field="disposal_method" />
                <input
                  id="ast-disposal"
                  type="text"
                  maxlength="255"
                  [placeholder]="'assets.form.disposalPlaceholder' | transloco"
                  [value]="d().disposal_method"
                  (input)="set('disposal_method', $any($event.target).value)"
                />
              </app-form-field>
            </div>
          }
          @if (d().lifecycle_status === 'retired' || d().lifecycle_status === 'disposed') {
            <p id="ast-retired-hint" class="text-meta text-fg-subtle sm:col-span-2">
              {{ 'assets.form.retiredHint' | transloco }}
            </p>
          }
          @if (d().lifecycle_status === 'quarantined') {
            <p class="text-meta text-fg-subtle sm:col-span-2">
              {{ 'assets.form.quarantinedHint' | transloco }}
            </p>
          }
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-3 font-display text-card font-bold text-fg">
          {{ 'assets.form.sections.calibration' | transloco }}
        </h2>
        <div class="flex items-start gap-2">
          <label class="flex items-start gap-2 text-body text-fg">
            <input
              id="ast-requires-cal"
              type="checkbox"
              class="mt-1"
              [checked]="d().requires_calibration"
              (change)="set('requires_calibration', $any($event.target).checked)"
            />
            <span>
              {{ 'assets.fields.requiresCalibration' | transloco }}
              <span class="block text-meta text-fg-subtle">
                {{ 'assets.form.calibrationHint' | transloco }}
              </span>
            </span>
          </label>
          <app-field-help scope="assets" page="form" field="requires_calibration" />
        </div>
        @if (d().requires_calibration) {
          <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <app-form-field
                [label]="'assets.fields.calibrationInterval' | transloco"
                inputId="ast-interval"
              >
                <app-field-help
                  label-suffix
                  scope="assets"
                  page="form"
                  field="calibration_interval"
                />
                <input
                  id="ast-interval"
                  type="number"
                  min="1"
                  max="120"
                  aria-describedby="ast-interval-hint"
                  [attr.aria-invalid]="showErrors() && !intervalValid()"
                  [value]="d().calibration_interval_months"
                  (input)="set('calibration_interval_months', $any($event.target).value)"
                />
              </app-form-field>
              <p
                id="ast-interval-hint"
                class="mt-1 text-meta"
                [class.text-fail-ink]="showErrors() && !intervalValid()"
                [class.text-fg-subtle]="!(showErrors() && !intervalValid())"
              >
                {{ 'assets.form.intervalHint' | transloco }}
              </p>
            </div>
            @if (editing() && !overrideNext()) {
              <div data-testid="next-calibration-computed">
                <p class="text-ui font-semibold text-fg-muted">
                  {{ 'assets.fields.nextCalibrationDue' | transloco }}
                </p>
                <p class="mt-2 text-body text-fg">
                  {{
                    d().next_calibration_due
                      ? (d().next_calibration_due | localDay)
                      : ('assets.common.notSet' | transloco)
                  }}
                </p>
                <p class="mt-1 text-meta text-fg-subtle">
                  {{ 'assets.form.nextCalibrationComputed' | transloco }}
                  <button
                    type="button"
                    class="ml-1 font-semibold text-accent hover:underline"
                    (click)="overrideNext.set(true)"
                  >
                    {{ 'assets.form.nextCalibrationOverride' | transloco }}
                  </button>
                </p>
              </div>
            } @else {
              <app-form-field
                [label]="'assets.fields.nextCalibrationDue' | transloco"
                inputId="ast-next-cal"
              >
                <input
                  id="ast-next-cal"
                  type="date"
                  [attr.lang]="lang()"
                  [value]="d().next_calibration_due"
                  (input)="set('next_calibration_due', $any($event.target).value)"
                />
              </app-form-field>
            }
            <app-form-field
              [label]="'assets.fields.measurementRange' | transloco"
              inputId="ast-range"
            >
              <input
                id="ast-range"
                type="text"
                maxlength="120"
                [placeholder]="'assets.form.rangePlaceholder' | transloco"
                [value]="d().measurement_range"
                (input)="set('measurement_range', $any($event.target).value)"
              />
            </app-form-field>
            <app-form-field [label]="'assets.fields.accuracy' | transloco" inputId="ast-accuracy">
              <app-field-help label-suffix scope="assets" page="form" field="accuracy" />
              <input
                id="ast-accuracy"
                type="text"
                maxlength="120"
                [placeholder]="'assets.form.accuracyPlaceholder' | transloco"
                [value]="d().accuracy"
                (input)="set('accuracy', $any($event.target).value)"
              />
            </app-form-field>
            @if (!editing()) {
              <div>
                <app-form-field
                  [label]="'assets.fields.lastCalibratedOn' | transloco"
                  inputId="ast-last-cal"
                >
                  <input
                    id="ast-last-cal"
                    type="date"
                    aria-describedby="ast-last-cal-hint"
                    [attr.lang]="lang()"
                    [value]="d().last_calibrated_on"
                    (input)="set('last_calibrated_on', $any($event.target).value)"
                  />
                </app-form-field>
                <p id="ast-last-cal-hint" class="mt-1 text-meta text-fg-subtle">
                  {{ 'assets.form.lastCalibratedHint' | transloco }}
                </p>
              </div>
            }
          </div>
        }
      </app-card>

      <app-card>
        <app-form-field [label]="'assets.fields.notes' | transloco" inputId="ast-notes">
          <textarea
            id="ast-notes"
            rows="3"
            maxlength="10000"
            [value]="d().notes"
            (input)="set('notes', $any($event.target).value)"
          ></textarea>
        </app-form-field>
      </app-card>

      @if (editing()) {
        <app-card>
          <app-form-field [label]="'assets.form.changeReason' | transloco" inputId="ast-reason">
            <textarea
              id="ast-reason"
              rows="2"
              maxlength="1000"
              aria-describedby="ast-reason-hint"
              [value]="reason()"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <p id="ast-reason-hint" class="mt-1 text-meta text-fg-subtle">
            {{ 'assets.form.changeReasonHint' | transloco }}
          </p>
        </app-card>
      }

      <div
        class="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
      >
        <app-button variant="ghost" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()">
          {{ (editing() ? 'assets.form.save' : 'assets.form.create') | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class AssetForm {
  private readonly language = inject(LanguageService);
  protected readonly suppliers = inject(SupplierOptionsService);

  /** The asset being edited (null = a new asset). */
  readonly value = input<AssetDetail | null>(null);
  readonly busy = input(false);
  readonly submitted = output<AssetFormValue>();
  readonly cancelled = output<void>();

  protected readonly types = ASSET_TYPES;
  protected readonly classifications = CLASSIFICATIONS;
  protected readonly criticalities = CRITICALITIES;
  protected readonly levels = LEVELS;
  protected readonly lifecycles = LIFECYCLE_STATUSES;
  protected readonly reviewIntervals = REVIEW_INTERVALS;
  protected readonly ciaKeys = ['confidentiality', 'integrity', 'availability'] as const;
  protected readonly detailKeys = [
    { field: 'model', label: 'model', max: 120 },
    { field: 'serial_number', label: 'serialNumber', max: 120 },
    { field: 'version', label: 'version', max: 64 },
  ] as const;
  protected readonly dateKeys = [
    { field: 'acquired_on', label: 'acquiredOn' },
    { field: 'warranty_until', label: 'warrantyUntil' },
    { field: 'end_of_life_on', label: 'endOfLifeOn' },
  ] as const;

  protected readonly d = signal<AssetDraft>(assetDraftFrom(null));
  protected readonly reason = signal('');
  protected readonly showErrors = signal(false);
  protected readonly overrideNext = signal(false);
  protected readonly suggestion = signal<ClassificationSuggestion | null>(null);
  protected readonly editing = computed(() => this.value() !== null);
  protected readonly lang = computed(() => this.language.active());

  /**
   * The information-security block is open unless the asset is measuring equipment or
   * hardware with nothing rated yet (a thermometer rarely needs a CIA rating).
   */
  protected readonly securityOpen = computed(() => {
    const d = this.d();
    const rated = !!(d.confidentiality || d.integrity || d.availability || d.handling_rules);
    const physical =
      d.requires_calibration || d.asset_type === 'hardware' || d.asset_type === 'facility';
    return rated || !physical;
  });

  protected readonly controls = computed<readonly ControlSuggestion[]>(
    () => this.suggestion()?.controls ?? [],
  );
  protected readonly assistInput = computed(() => {
    const d = this.d();
    return {
      name: d.name.trim(),
      description: d.description.trim(),
      asset_type: d.asset_type,
      category: d.category.trim(),
    };
  });
  protected readonly intervalValid = computed(() => {
    const d = this.d();
    const raw = d.calibration_interval_months.trim();
    if (!d.requires_calibration || !raw) {
      return true;
    }
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 120;
  });

  constructor() {
    this.suppliers.ensureLoaded();
    effect(() => {
      const value = this.value();
      untracked(() => {
        this.d.set(assetDraftFrom(value));
        this.overrideNext.set(false);
      });
    });
  }

  protected set<K extends keyof AssetDraft>(key: K, value: AssetDraft[K]): void {
    this.d.update((d) => {
      const next = { ...d, [key]: value };
      // A supplier from the register replaces the free-text vendor.
      return key === 'supplier_id' && value ? { ...next, vendor: '' } : next;
    });
  }

  protected onSuggestion(data: unknown): void {
    if (!data || typeof data !== 'object') {
      return;
    }
    const s = data as ClassificationSuggestion;
    this.d.update((d) => applySuggestion(d, s));
    this.suggestion.set(s);
  }

  protected submit(): void {
    const d = this.d();
    if (!d.name.trim() || !this.intervalValid()) {
      this.showErrors.set(true);
      return;
    }
    this.submitted.emit({
      fields: assetFieldsFrom(d),
      lastCalibratedOn: d.requires_calibration ? dayOrNull(d.last_calibrated_on) : null,
      changeReason: blankToNull(this.reason()),
    });
  }
}

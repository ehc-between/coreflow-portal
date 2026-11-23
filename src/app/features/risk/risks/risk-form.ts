import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService, FlowContext } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AcceptedSuggestion, FormSuggest } from '../../../shared/ask/form-suggest';
import { suggestDefs, suggestPatch, suggestValues } from '../../../shared/ask/form-suggest-map';
import { RISK_SUGGEST_FIELDS, RISK_SUGGEST_KEY } from './risk-suggest';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RiskApi } from '../data/risk-api';
import {
  canonicalControlRef,
  frameworksForCategory,
  fromDateInput,
  subjectTypesFor,
  toDateInput,
  usesCia,
} from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  CIA_PROPERTIES,
  CiaProperty,
  EntityRef,
  Matrix,
  Register,
  Risk,
  RiskCreate,
  RiskUpdate,
  SOURCE_TYPES,
  STRATEGIES,
  SUBJECT_TYPES,
  SourceType,
  Strategy,
  SubjectType,
} from '../data/risk.models';
import { PersonSelect } from '../shared/person-select';
import { RatingPicker, RatingValue } from '../shared/rating-picker';
import { RiskField } from '../shared/risk-field';
import { RiskPermissions } from '../shared/risk-permissions';
import { SubjectPicker } from '../shared/subject-picker';

/** The three steps of a risk assessment: describe it, rate it, decide what to do. */
export const RISK_FORM_STEPS = ['describe', 'assess', 'treat'] as const;
export type RiskFormStep = (typeof RISK_FORM_STEPS)[number];

/** The editable fields of a risk, as the form holds them. */
export interface RiskFormValue {
  readonly register_id: string;
  readonly title: string;
  readonly description: string;
  readonly source_type: SourceType | '';
  readonly source_ref: string;
  /** The real record that is exposed (supplier, asset …), when there is one. */
  readonly subject: EntityRef | null;
  readonly threat: string;
  readonly vulnerability: string;
  readonly consequence_text: string;
  readonly affected_properties: readonly CiaProperty[];
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly inherent: RatingValue;
  readonly treatment_strategy: Strategy | '';
  readonly treatment_notes: string;
  readonly residual: RatingValue;
  /** Canonical clause refs (`iso27001:A.8.13`). */
  readonly control_refs: readonly string[];
  readonly review_interval_months: string;
  readonly next_review_at: string;
}

const EMPTY_RATING: RatingValue = { likelihood: null, consequence: null };

export function emptyRiskForm(registerId = '', ownerId = ''): RiskFormValue {
  return {
    register_id: registerId,
    title: '',
    description: '',
    source_type: '',
    source_ref: '',
    subject: null,
    threat: '',
    vulnerability: '',
    consequence_text: '',
    affected_properties: [],
    owner_user_id: ownerId,
    department_id: '',
    inherent: EMPTY_RATING,
    treatment_strategy: '',
    treatment_notes: '',
    residual: EMPTY_RATING,
    control_refs: [],
    review_interval_months: '',
    next_review_at: '',
  };
}

export function riskToForm(risk: Risk): RiskFormValue {
  return {
    register_id: risk.register.id,
    title: risk.title,
    description: risk.description ?? '',
    source_type: risk.source_type ?? '',
    source_ref: risk.source_ref ?? '',
    subject: risk.source_entity ?? null,
    threat: risk.threat ?? '',
    vulnerability: risk.vulnerability ?? '',
    consequence_text: risk.consequence_text ?? '',
    affected_properties: risk.affected_properties,
    owner_user_id: risk.owner?.id ?? '',
    department_id: risk.department?.id ?? '',
    inherent: risk.inherent
      ? { likelihood: risk.inherent.likelihood, consequence: risk.inherent.consequence }
      : EMPTY_RATING,
    treatment_strategy: risk.treatment_strategy ?? '',
    treatment_notes: risk.treatment_notes ?? '',
    residual: risk.residual
      ? { likelihood: risk.residual.likelihood, consequence: risk.residual.consequence }
      : EMPTY_RATING,
    control_refs: risk.control_refs.map(canonicalControlRef),
    review_interval_months:
      risk.review_interval_months !== null ? String(risk.review_interval_months) : '',
    next_review_at: toDateInput(risk.next_review_at),
  };
}

const text = (value: string): string | null => value.trim() || null;

function isSubjectType(type: string): type is SubjectType {
  return (SUBJECT_TYPES as readonly string[]).includes(type);
}

/** The create body for a form value. */
export function toRiskCreate(v: RiskFormValue): RiskCreate {
  const subject = v.subject && isSubjectType(v.subject.entity_type) ? v.subject : null;
  return {
    register_id: v.register_id || null,
    title: v.title.trim(),
    description: text(v.description),
    source_type: v.source_type || null,
    source_ref: text(v.source_ref),
    source_entity_type: subject ? (subject.entity_type as SubjectType) : null,
    source_entity_id: subject ? subject.entity_id : null,
    threat: text(v.threat),
    vulnerability: text(v.vulnerability),
    consequence_text: text(v.consequence_text),
    affected_properties: v.affected_properties,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    inherent_likelihood: v.inherent.likelihood,
    inherent_consequence: v.inherent.consequence,
    treatment_strategy: v.treatment_strategy || null,
    treatment_notes: text(v.treatment_notes),
    residual_likelihood: v.residual.likelihood,
    residual_consequence: v.residual.consequence,
    control_refs: [...new Set(v.control_refs.map(canonicalControlRef))],
    review_interval_months: v.review_interval_months ? Number(v.review_interval_months) : null,
    next_review_at: fromDateInput(v.next_review_at),
  };
}

/**
 * The PATCH body for an edit: only the fields that differ from the original, so an
 * unchanged rating never revokes an acceptance and the audit trail shows real changes.
 */
export function toRiskUpdate(
  original: RiskFormValue,
  next: RiskFormValue,
  changeReason: string,
): RiskUpdate {
  const before: Record<string, unknown> = { ...toRiskCreate(original) };
  const after: Record<string, unknown> = { ...toRiskCreate(next) };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      out[key] = after[key];
    }
  }
  // A rating is sent as a pair so the backend never sees half a rating; the same
  // for the exposed record (type + id).
  for (const [a, b] of [
    ['inherent_likelihood', 'inherent_consequence'],
    ['residual_likelihood', 'residual_consequence'],
    ['source_entity_type', 'source_entity_id'],
  ]) {
    if (a in out || b in out) {
      out[a] = after[a];
      out[b] = after[b];
    }
  }
  if (Object.keys(out).length && changeReason.trim()) {
    out['change_reason'] = changeReason.trim();
  }
  return out as RiskUpdate;
}

/** Fields a create-from-here prefill may set (in the create-DTO's names). */
export function applyRiskPrefill(
  value: RiskFormValue,
  prefill: Readonly<Record<string, unknown>>,
  source: EntityRef | null,
): RiskFormValue {
  const str = (key: string): string | null =>
    typeof prefill[key] === 'string' ? (prefill[key] as string) : null;
  const sourceType = str('source_type');
  const refs = Array.isArray(prefill['control_refs'])
    ? (prefill['control_refs'] as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];
  return {
    ...value,
    title: str('title') ?? value.title,
    description: str('description') ?? value.description,
    threat: str('threat') ?? value.threat,
    vulnerability: str('vulnerability') ?? value.vulnerability,
    consequence_text: str('consequence_text') ?? value.consequence_text,
    register_id: str('register_id') ?? value.register_id,
    source_type:
      sourceType && (SOURCE_TYPES as readonly string[]).includes(sourceType)
        ? (sourceType as SourceType)
        : value.source_type,
    source_ref: str('source_ref') ?? value.source_ref,
    // A risk created from a supplier, asset … is about that record.
    subject: source && isSubjectType(source.entity_type) ? source : value.subject,
    control_refs: refs.length ? refs.map(canonicalControlRef) : value.control_refs,
  };
}

/**
 * Create or edit a risk in three steps:
 *  1. Beskriv — what is at risk (a real record where there is one), what could
 *     happen, the owner;
 *  2. Vurder — the inherent rating on the register's matrix;
 *  3. Behandle — the treatment decision, the controls (picked from the
 *     catalogue, so they become requirement links), the residual rating (shown
 *     once a strategy is chosen) and the review cycle.
 * Opened from another record ("Risk from this deviation") it is prefilled and
 * linked back on save. "Foreslå risiko" at the top proposes the whole form from the
 * title (reviewed field by field; nothing is saved until the user saves).
 */
@Component({
  selector: 'app-risk-form',
  imports: [
    FormsModule,
    TranslocoPipe,
    FormSuggest,
    AskAbout,
    FieldHelp,
    FlowBanner,
    ClausePicker,
    Alert,
    Button,
    DateInput,
    ErrorState,
    FormActions,
    FormSection,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    PersonSelect,
    RatingPicker,
    RiskField,
    SubjectPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mx-auto flex max-w-[808px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-8 sm:pt-7 [&>app-help-strip]:mb-0 [&>app-page-header>header]:mb-0"
    >
      <app-page-header
        [titleKey]="id() ? 'risk.form.editTitle' : 'risk.form.newTitle'"
        [breadcrumbs]="breadcrumbs()"
      />
      <app-help-strip scope="risk" page="form" lesson="first-risk-assessment" />
      <app-flow-banner class="empty:hidden" [flow]="flow()" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="6" />
      } @else if (state() === 'error') {
        <app-error-state (retry)="reload()" />
      } @else {
        <ol class="grid grid-cols-3 gap-2" [attr.aria-label]="'risk.form.stepsLabel' | transloco">
          @for (s of steps; track s; let i = $index) {
            <li>
              <button
                type="button"
                class="flex w-full min-w-0 items-center gap-2 rounded-tile border px-3 py-2 text-left text-ui font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [class]="
                  s === currentStep()
                    ? 'border-accent bg-accent-soft text-fg'
                    : 'border-border bg-surface text-fg-muted hover:text-fg'
                "
                [attr.aria-current]="s === currentStep() ? 'step' : null"
                (click)="goTo(s)"
                [attr.data-testid]="'risk-step-' + s"
              >
                <span
                  class="flex h-6 w-6 flex-none items-center justify-center rounded-full text-micro"
                  [class]="
                    s === currentStep() ? 'bg-accent text-white' : 'bg-surface-2 text-fg-muted'
                  "
                  aria-hidden="true"
                  >{{ i + 1 }}</span
                >
                <span class="min-w-0 truncate">{{ 'risk.form.steps.' + s | transloco }}</span>
              </button>
            </li>
          }
        </ol>

        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-form-suggest
            [suggestKey]="suggestKey"
            labelKey="ask.formSuggest.labels.risk"
            [fields]="suggestFields()"
            [values]="suggestValues()"
            [context]="{ from: 'risk', category: register()?.category ?? null }"
            [editing]="!!id()"
            [titleOnly]="
              !!form().title.trim() && !form().description.trim() && !form().threat.trim()
            "
            (applied)="applySuggestion($event)"
          />
          @switch (currentStep()) {
            @case ('describe') {
              <app-form-section
                [title]="'risk.form.sections.basics' | transloco"
                [description]="'risk.form.stepHints.describe' | transloco"
              >
                <app-risk-field
                  span="full"
                  inputId="risk-title"
                  labelKey="risk.fields.title"
                  [required]="true"
                  helpField="title"
                  [error]="titleError()"
                >
                  <input
                    id="risk-title"
                    required
                    maxlength="255"
                    [value]="form().title"
                    (input)="set('title', $any($event.target).value)"
                  />
                </app-risk-field>
                @if (registers().length > 0) {
                  <app-risk-field
                    inputId="risk-register"
                    labelKey="risk.fields.register"
                    helpField="register"
                  >
                    <select id="risk-register" (change)="setRegister($any($event.target).value)">
                      @for (r of activeRegisters(); track r.id) {
                        <option [value]="r.id" [selected]="r.id === form().register_id">
                          {{ r.name }} ({{ 'risk.categories.' + r.category | transloco }})
                        </option>
                      }
                    </select>
                  </app-risk-field>
                }
                <app-risk-field
                  inputId="risk-owner"
                  labelKey="risk.fields.riskOwner"
                  [required]="true"
                  helpField="owner"
                  [error]="ownerError()"
                >
                  <app-person-select
                    inputId="risk-owner"
                    [value]="form().owner_user_id"
                    [currentName]="original()?.owner?.name ?? null"
                    (valueChange)="set('owner_user_id', $event)"
                  />
                </app-risk-field>
                <app-risk-field
                  span="full"
                  inputId="risk-description"
                  labelKey="risk.fields.description"
                >
                  <textarea
                    id="risk-description"
                    rows="3"
                    [value]="form().description"
                    (input)="set('description', $any($event.target).value)"
                  ></textarea>
                </app-risk-field>
              </app-form-section>

              <app-form-section
                [title]="'risk.form.sections.context' | transloco"
                [description]="'risk.form.sections.contextHint' | transloco"
              >
                <app-risk-field
                  inputId="risk-source-type"
                  labelKey="risk.fields.sourceType"
                  helpField="source"
                >
                  <select id="risk-source-type" (change)="setSourceType($any($event.target).value)">
                    <option value="" [selected]="!form().source_type">
                      {{ 'risk.common.notSet' | transloco }}
                    </option>
                    @for (s of sourceTypes; track s) {
                      <option [value]="s" [selected]="s === form().source_type">
                        {{ 'risk.sourceTypes.' + s | transloco }}
                      </option>
                    }
                  </select>
                </app-risk-field>
                @if (!form().subject) {
                  <app-risk-field
                    inputId="risk-source-ref"
                    [labelKey]="
                      subjectTypes().length ? 'risk.fields.sourceRefOther' : 'risk.fields.sourceRef'
                    "
                  >
                    <input
                      id="risk-source-ref"
                      maxlength="255"
                      [value]="form().source_ref"
                      (input)="set('source_ref', $any($event.target).value)"
                    />
                  </app-risk-field>
                }
                @if (subjectTypes().length) {
                  <app-risk-field
                    span="full"
                    inputId="risk-subject"
                    labelKey="risk.fields.sourceEntity"
                    [plain]="true"
                    helpField="subject"
                  >
                    <app-risk-subject-picker
                      inputId="risk-subject"
                      [types]="subjectTypes()"
                      [value]="form().subject"
                      (picked)="set('subject', $event)"
                      (cleared)="set('subject', null)"
                    />
                    <span hint>{{ 'risk.form.subjectHint' | transloco }}</span>
                  </app-risk-field>
                }
                <app-risk-field
                  span="full"
                  inputId="risk-threat"
                  labelKey="risk.fields.threat"
                  helpField="threat"
                >
                  <app-ask-about ask [prompt]="'risk.ask.threat' | transloco" field="threat" />
                  <textarea
                    id="risk-threat"
                    rows="2"
                    [value]="form().threat"
                    (input)="set('threat', $any($event.target).value)"
                  ></textarea>
                </app-risk-field>
                <app-risk-field
                  span="full"
                  inputId="risk-vulnerability"
                  labelKey="risk.fields.vulnerability"
                  helpField="vulnerability"
                >
                  <textarea
                    id="risk-vulnerability"
                    rows="2"
                    [value]="form().vulnerability"
                    (input)="set('vulnerability', $any($event.target).value)"
                  ></textarea>
                </app-risk-field>
                <app-risk-field
                  span="full"
                  inputId="risk-consequence"
                  labelKey="risk.fields.consequence"
                  helpField="consequence"
                >
                  <textarea
                    id="risk-consequence"
                    rows="2"
                    [value]="form().consequence_text"
                    (input)="set('consequence_text', $any($event.target).value)"
                  ></textarea>
                </app-risk-field>
                @if (showCia()) {
                  <fieldset class="sm:col-span-2">
                    <legend
                      class="mb-1.5 flex min-h-6 items-center gap-1.5 text-ui font-semibold text-fg-muted"
                    >
                      {{ 'risk.fields.affectedProperties' | transloco }}
                      <app-field-help
                        scope="risk"
                        page="form"
                        field="cia"
                        [label]="'risk.fields.affectedProperties' | transloco"
                      />
                    </legend>
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      @for (p of properties; track p) {
                        <label
                          class="flex h-10 cursor-pointer items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                        >
                          <input
                            type="checkbox"
                            [checked]="form().affected_properties.includes(p)"
                            (change)="toggleProperty(p, $any($event.target).checked)"
                          />
                          {{ 'risk.properties.' + p | transloco }}
                        </label>
                      }
                    </div>
                  </fieldset>
                }
              </app-form-section>
            }

            @case ('assess') {
              <app-form-section
                [title]="'risk.form.sections.inherent' | transloco"
                [description]="'risk.form.stepHints.assess' | transloco"
                [columns]="1"
              >
                <app-field-help
                  title-suffix
                  class="font-normal"
                  scope="risk"
                  page="form"
                  field="inherent"
                  [label]="'risk.fields.inherent' | transloco"
                />
                <app-ask-about
                  section-actions
                  [prompt]="'risk.ask.inherent' | transloco"
                  field="inherent"
                />
                @if (matrix(); as m) {
                  <div>
                    <app-rating-picker
                      [matrix]="m"
                      [legend]="'risk.form.inherentLegend' | transloco"
                      [value]="form().inherent"
                      (changed)="set('inherent', $event)"
                    />
                    @if (m.acceptable_max_score !== null) {
                      <p class="mt-2 text-meta text-fg-subtle">
                        {{
                          'risk.form.appetiteNote' | transloco: { score: m.acceptable_max_score }
                        }}
                      </p>
                    }
                  </div>
                } @else {
                  <p class="text-ui text-fg-muted">{{ 'risk.form.noMatrix' | transloco }}</p>
                }
              </app-form-section>
            }

            @case ('treat') {
              <app-form-section
                [title]="'risk.form.sections.treatment' | transloco"
                [description]="'risk.form.stepHints.treat' | transloco"
              >
                <app-risk-field
                  inputId="risk-strategy"
                  labelKey="risk.fields.strategy"
                  helpField="strategy"
                >
                  <select
                    id="risk-strategy"
                    (change)="set('treatment_strategy', $any($event.target).value)"
                  >
                    <option value="" [selected]="!form().treatment_strategy">
                      {{ 'risk.common.notDecided' | transloco }}
                    </option>
                    @for (s of strategies; track s) {
                      <option [value]="s" [selected]="s === form().treatment_strategy">
                        {{ 'risk.strategies.' + s | transloco }}
                      </option>
                    }
                  </select>
                </app-risk-field>
                <app-risk-field
                  span="full"
                  inputId="risk-controls"
                  labelKey="risk.fields.controlRefs"
                  [plain]="true"
                  helpField="controls"
                >
                  <app-ask-about ask [prompt]="'risk.ask.controls' | transloco" field="controls" />
                  <app-clause-picker
                    inputId="risk-controls"
                    placeholderKey="risk.form.controlPickerPlaceholder"
                    [frameworks]="frameworks()"
                    [ngModel]="form().control_refs"
                    (ngModelChange)="set('control_refs', $event)"
                    [ngModelOptions]="{ standalone: true }"
                  />
                  <span hint>{{ 'risk.form.controlsHint' | transloco }}</span>
                </app-risk-field>
                <app-risk-field
                  span="full"
                  inputId="risk-treatment-notes"
                  labelKey="risk.fields.treatmentNotes"
                >
                  <textarea
                    id="risk-treatment-notes"
                    rows="2"
                    [value]="form().treatment_notes"
                    (input)="set('treatment_notes', $any($event.target).value)"
                  ></textarea>
                </app-risk-field>
              </app-form-section>

              @if (showResidual()) {
                <app-form-section
                  [title]="'risk.form.sections.residual' | transloco"
                  [description]="'risk.form.sections.residualHint' | transloco"
                  [columns]="1"
                >
                  <app-field-help
                    title-suffix
                    class="font-normal"
                    scope="risk"
                    page="form"
                    field="residual"
                    [label]="'risk.fields.residual' | transloco"
                  />
                  @if (matrix(); as m) {
                    <div>
                      <app-rating-picker
                        [matrix]="m"
                        [legend]="'risk.form.residualLegend' | transloco"
                        [value]="form().residual"
                        [secondary]="inherentCell()"
                        (changed)="set('residual', $event)"
                      />
                      @if (inherentCell()) {
                        <p class="mt-2 text-meta text-fg-subtle">
                          {{ 'risk.form.inherentMarker' | transloco }}
                        </p>
                      }
                    </div>
                  } @else {
                    <p class="text-ui text-fg-muted">{{ 'risk.form.noMatrix' | transloco }}</p>
                  }
                </app-form-section>
              } @else {
                <p class="rounded-tile bg-surface-2 px-4 py-3 text-ui text-fg-muted">
                  {{ 'risk.form.residualAfterStrategy' | transloco }}
                </p>
              }

              <app-form-section
                [title]="'risk.form.sections.ownership' | transloco"
                [description]="'risk.form.sections.ownershipHint' | transloco"
              >
                <app-risk-field inputId="risk-department" labelKey="risk.fields.department">
                  <app-person-select
                    kind="department"
                    inputId="risk-department"
                    [value]="form().department_id"
                    [currentName]="original()?.department?.name ?? null"
                    (valueChange)="set('department_id', $event)"
                  />
                </app-risk-field>
                <app-risk-field
                  inputId="risk-interval"
                  labelKey="risk.fields.reviewInterval"
                  helpField="review"
                >
                  <input
                    id="risk-interval"
                    type="number"
                    min="1"
                    max="60"
                    [value]="form().review_interval_months"
                    [placeholder]="'risk.form.intervalPlaceholder' | transloco"
                    (input)="set('review_interval_months', $any($event.target).value)"
                  />
                </app-risk-field>
                <app-risk-field inputId="risk-next-review" labelKey="risk.fields.nextReview">
                  <app-date-input
                    inputId="risk-next-review"
                    [value]="form().next_review_at"
                    (valueChange)="set('next_review_at', $event ?? '')"
                  />
                </app-risk-field>
              </app-form-section>
            }
          }

          @if (id()) {
            <app-form-section [columns]="1">
              <app-risk-field inputId="risk-change-reason" labelKey="risk.fields.changeReason">
                <input
                  id="risk-change-reason"
                  maxlength="2000"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
                @if (original()?.acceptance) {
                  <span hint class="text-warn-ink">{{
                    'risk.form.acceptanceWarning' | transloco
                  }}</span>
                }
              </app-risk-field>
            </app-form-section>
          }

          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }

          <app-form-actions
            [message]="
              submitted() && (titleError() || ownerError())
                ? ('risk.form.fixFields' | transloco)
                : ''
            "
          >
            @if (stepIndex() > 0) {
              <app-button start variant="ghost" (click)="back()" data-testid="risk-step-back">
                <app-icon name="back" [size]="14" />
                {{ 'risk.form.back' | transloco }}
              </app-button>
            }
            <app-button variant="secondary" (click)="cancel()">{{
              'risk.common.cancel' | transloco
            }}</app-button>
            @if (lastStep()) {
              <app-button type="submit" [loading]="saving()" [disabled]="saving()">
                {{ (id() ? 'risk.common.save' : 'risk.form.create') | transloco }}
              </app-button>
            } @else {
              @if (id()) {
                <app-button
                  type="submit"
                  variant="secondary"
                  [loading]="saving()"
                  [disabled]="saving()"
                >
                  {{ 'risk.common.save' | transloco }}
                </app-button>
              }
              <app-button (click)="next()" data-testid="risk-step-next">
                {{ 'risk.form.next' | transloco }}
              </app-button>
            }
          </app-form-actions>
        </form>
      }
    </div>
  `,
})
export class RiskFormPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly auth = inject(AuthService);
  private readonly flows = inject(CreateFlowService);
  private readonly perms = inject(RiskPermissions);

  /** Route param (edit mode); absent on `risks/new`. */
  readonly id = input<string | undefined>(undefined);
  /** `?step=assess|treat` opens that step (e.g. "re-rate" after an effectiveness check). */
  readonly step = input<string | undefined>(undefined);

  protected readonly steps = RISK_FORM_STEPS;
  protected readonly sourceTypes = SOURCE_TYPES;
  protected readonly strategies = STRATEGIES;
  protected readonly properties = CIA_PROPERTIES;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly registers = signal<readonly Register[]>([]);
  protected readonly matrices = signal<readonly Matrix[]>([]);
  protected readonly original = signal<Risk | null>(null);
  private originalForm: RiskFormValue = emptyRiskForm();
  protected readonly form = signal<RiskFormValue>(emptyRiskForm());
  protected readonly currentStep = signal<RiskFormStep>('describe');
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly submitted = signal(false);
  /** A create-from-here flow (or `?fromRequirement=`) the form was opened with. */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), { targetType: 'risk' });
  private flowApplied: FlowContext | null = null;
  private sub: Subscription | null = null;

  protected readonly breadcrumbs = computed(() => {
    const crumbs: { labelKey?: string; label?: string; link?: string | unknown[] }[] = [
      { labelKey: 'modules.names.risk', link: '/risk' },
      { labelKey: 'risk.risks.title', link: '/risk/risks' },
    ];
    const risk = this.original();
    if (risk) {
      crumbs.push({ label: risk.code, link: ['/risk/risks', risk.id] });
    }
    crumbs.push({ labelKey: this.id() ? 'risk.form.editTitle' : 'risk.form.newTitle' });
    return crumbs;
  });

  protected readonly stepIndex = computed(() => RISK_FORM_STEPS.indexOf(this.currentStep()));
  protected readonly lastStep = computed(() => this.stepIndex() === RISK_FORM_STEPS.length - 1);

  protected readonly activeRegisters = computed(() =>
    this.registers().filter((r) => r.status === 'active' || r.id === this.form().register_id),
  );
  protected readonly register = computed(
    () => this.registers().find((r) => r.id === this.form().register_id) ?? null,
  );

  /** The matrix of the chosen register (else the org default). */
  protected readonly matrix = computed<Matrix | null>(() => {
    const register = this.register();
    const matrices = this.matrices();
    const id = register?.matrix_id ?? this.original()?.matrix_id;
    return (
      matrices.find((m) => m.id === id) ??
      (register ? null : (matrices.find((m) => m.is_default) ?? null))
    );
  });

  protected readonly frameworks = computed(() => {
    const list = frameworksForCategory(this.register()?.category ?? this.original()?.category);
    return list.length ? list : null;
  });
  protected readonly subjectTypes = computed(() => subjectTypesFor(this.form().source_type));
  /** Confidentiality / integrity / availability only matter for information risks. */
  protected readonly showCia = computed(
    () =>
      usesCia(this.register()?.category ?? this.original()?.category) ||
      this.form().affected_properties.length > 0,
  );
  /** The residual rating only makes sense once a treatment decision is made. */
  protected readonly showResidual = computed(
    () => !!this.form().treatment_strategy || this.form().residual.likelihood !== null,
  );

  protected readonly inherentCell = computed(() => {
    const { likelihood, consequence } = this.form().inherent;
    return likelihood !== null && consequence !== null ? { likelihood, consequence } : null;
  });

  protected readonly titleError = computed(() =>
    this.submitted() && !this.form().title.trim() ? 'risk.errors.title_required' : null,
  );
  protected readonly ownerError = computed(() =>
    this.submitted() && !this.form().owner_user_id ? 'risk.errors.owner_required' : null,
  );

  protected readonly suggestKey = RISK_SUGGEST_KEY;
  protected readonly suggestFields = computed(() =>
    suggestDefs(RISK_SUGGEST_FIELDS, (key, params) => this.language.translate(key, params)),
  );
  protected readonly suggestValues = computed(() =>
    suggestValues(RISK_SUGGEST_FIELDS, this.form()),
  );

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.title ?? this.language.translate('risk.form.newTitle'),
      requirements: this.form().control_refs,
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    effect(() => {
      const requested = this.step();
      if (requested && (RISK_FORM_STEPS as readonly string[]).includes(requested)) {
        untracked(() => this.currentStep.set(requested as RiskFormStep));
      }
    });
    // Prefill from the record the risk is created from (once both have arrived).
    effect(() => {
      const flow = this.flow();
      const ready = this.state() === 'ready';
      untracked(() => {
        if (flow && ready && !this.id() && flow !== this.flowApplied) {
          this.flowApplied = flow;
          this.form.update((f) => applyRiskPrefill(f, flow.prefill, flow.source));
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.perms.orgId(), this.id());
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = forkJoin({
      registers: this.api.listRegisters(orgId),
      matrices: this.api.listMatrices(orgId),
      risk: id ? this.api.getRisk(orgId, id) : of(null),
    }).subscribe({
      next: ({ registers, matrices, risk }) => {
        this.registers.set(registers.items);
        this.matrices.set(matrices.items);
        this.original.set(risk);
        const defaultRegister =
          registers.items.find((r) => r.is_default && r.status === 'active') ??
          registers.items.find((r) => r.status === 'active');
        // A new risk is owned by the register owner, else by whoever records it.
        const owner = defaultRegister?.owner?.id ?? this.auth.user()?.id ?? '';
        this.originalForm = risk
          ? riskToForm(risk)
          : emptyRiskForm(defaultRegister?.id ?? '', owner);
        this.form.set(this.originalForm);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected set<K extends keyof RiskFormValue>(key: K, value: RiskFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setRegister(id: string): void {
    const before = this.matrix();
    const previous = this.register();
    this.set('register_id', id);
    const next = this.register();
    // Follow the register owner while the owner is still the previous default.
    if (!this.id() && next?.owner && this.form().owner_user_id === (previous?.owner?.id ?? '')) {
      this.set('owner_user_id', next.owner.id);
    }
    if (before?.id !== this.matrix()?.id) {
      // Ratings belong to a matrix; a different scale means re-rating.
      this.form.update((f) => ({ ...f, inherent: EMPTY_RATING, residual: EMPTY_RATING }));
    }
  }

  protected setSourceType(value: string): void {
    const source = (value || '') as SourceType | '';
    const allowed = subjectTypesFor(source);
    this.form.update((f) => ({
      ...f,
      source_type: source,
      subject:
        f.subject && (allowed as readonly string[]).includes(f.subject.entity_type)
          ? f.subject
          : null,
    }));
  }

  protected toggleProperty(property: CiaProperty, checked: boolean): void {
    this.form.update((f) => ({
      ...f,
      affected_properties: checked
        ? [...new Set([...f.affected_properties, property])]
        : f.affected_properties.filter((p) => p !== property),
    }));
  }

  protected applySuggestion(accepted: AcceptedSuggestion): void {
    const change = suggestPatch(RISK_SUGGEST_FIELDS, accepted) as Partial<RiskFormValue>;
    this.form.update((f) => ({ ...f, ...change }));
  }

  protected goTo(step: RiskFormStep): void {
    this.currentStep.set(step);
    globalThis.scrollTo?.({ top: 0 });
  }

  protected next(): void {
    if (this.currentStep() === 'describe' && !this.describeValid()) {
      this.submitted.set(true);
      return;
    }
    const i = this.stepIndex();
    if (i < RISK_FORM_STEPS.length - 1) {
      this.goTo(RISK_FORM_STEPS[i + 1]);
    }
  }

  protected back(): void {
    const i = this.stepIndex();
    if (i > 0) {
      this.goTo(RISK_FORM_STEPS[i - 1]);
    }
  }

  private describeValid(): boolean {
    const f = this.form();
    return !!f.title.trim() && !!f.owner_user_id;
  }

  protected cancel(): void {
    const id = this.id();
    this.flows.cancel();
    void this.router.navigate(id ? ['/risk/risks', id] : ['/risk/risks']);
  }

  protected save(): void {
    this.submitted.set(true);
    const orgId = this.perms.orgId();
    const value = this.form();
    if (!orgId) {
      return;
    }
    if (!this.describeValid()) {
      this.errorKey.set(
        value.title.trim() ? 'risk.errors.owner_required' : 'risk.errors.title_required',
      );
      this.goTo('describe');
      return;
    }
    const id = this.id();
    this.saving.set(true);
    this.errorKey.set(null);
    const request = id
      ? this.api.updateRisk(orgId, id, toRiskUpdate(this.originalForm, value, this.changeReason()))
      : this.api.createRisk(orgId, toRiskCreate(value));
    request.subscribe({
      next: (risk) => {
        this.saving.set(false);
        this.toasts.success(id ? 'risk.notices.saved' : 'risk.notices.created', {
          code: risk.code,
        });
        if (!id) {
          this.flows.complete(risk.id, 'risk').subscribe();
        }
        void this.router.navigate(['/risk/risks', risk.id]);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }
}

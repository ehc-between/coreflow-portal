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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription, catchError, forkJoin, of, switchMap } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Switch } from '../../shared/ui/switch/switch';
import { ObjField } from './components/obj-field';
import { OriginPicker } from './components/origin-picker';
import { OwnerSelect } from './components/owner-select';
import { SystemPicker } from './components/system-picker';
import { ObjectivesApi } from './data/objectives-api';
import { objectivesErrorKey } from './data/objectives-errors';
import {
  ASSIST_SUGGEST_SMART,
  CreateKpiRequest,
  ManagementSystem,
  OBJECTIVE_STATUSES,
  ORIGIN_TYPES,
  ObjectiveDetail,
  ObjectiveStatus,
  OriginIn,
  OriginRef,
  OriginType,
  SmartSuggestions,
  SuggestedObjective,
  UpdateObjectiveRequest,
} from './data/objectives.models';
import {
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  addMonthsIso,
  countKey,
  isClosedObjective,
  objectiveStatusKey,
  objectiveSystems,
  planYears,
  textOrNull,
  todayIso,
} from './objectives-display';
import { OBJECTIVES_ROOT_CRUMB } from './objectives-nav';

/** Editable values of the objective form (text inputs as strings). */
export interface ObjectiveFormValue {
  readonly title: string;
  readonly description: string;
  readonly management_systems: readonly ManagementSystem[];
  readonly status: ObjectiveStatus;
  readonly owner_user_id: string | null;
  readonly department_id: string | null;
  readonly target: string;
  readonly plan: string;
  readonly resources: string;
  readonly evaluation_method: string;
  readonly start_date: string;
  readonly due_date: string;
  readonly period_year: string;
  readonly approved_by: string | null;
  readonly communicated_to: string;
  readonly last_communicated_on: string;
  /** Manual progress override ('' = use the computed value). */
  readonly progress: string;
  readonly progress_note: string;
  readonly origins: readonly OriginRef[];
  readonly closing_note: string;
}

export const EMPTY_OBJECTIVE_FORM: ObjectiveFormValue = {
  title: '',
  description: '',
  management_systems: [],
  status: 'draft',
  owner_user_id: null,
  department_id: null,
  target: '',
  plan: '',
  resources: '',
  evaluation_method: '',
  start_date: '',
  due_date: '',
  period_year: '',
  approved_by: null,
  communicated_to: '',
  last_communicated_on: '',
  progress: '',
  progress_note: '',
  origins: [],
  closing_note: '',
};

export function objectiveToForm(o: ObjectiveDetail): ObjectiveFormValue {
  return {
    title: o.title,
    description: o.description ?? '',
    management_systems: objectiveSystems(o),
    status: o.status,
    owner_user_id: o.owner?.id ?? null,
    department_id: o.department_id,
    target: o.target ?? '',
    plan: o.plan ?? '',
    resources: o.resources ?? '',
    evaluation_method: o.evaluation_method ?? '',
    start_date: o.start_date ?? '',
    due_date: o.due_date ?? '',
    period_year: o.period_year ? String(o.period_year) : '',
    approved_by: o.approved_by?.id ?? null,
    communicated_to: o.communicated_to ?? '',
    last_communicated_on: o.last_communicated_on ?? '',
    progress: o.progress === null ? '' : String(o.progress),
    progress_note: o.progress_note ?? '',
    origins: o.origins ?? [],
    closing_note: o.closing_note ?? '',
  };
}

const isOriginType = (t: string): t is OriginType =>
  (ORIGIN_TYPES as readonly string[]).includes(t);

/** The API payload for a form value (empty text is null). */
export function objectivePayload(
  f: ObjectiveFormValue,
): Required<Omit<UpdateObjectiveRequest, 'change_reason'>> {
  const progress = f.progress.trim() === '' ? null : Math.round(Number(f.progress));
  const year = Number(f.period_year);
  return {
    title: f.title.trim(),
    description: textOrNull(f.description),
    management_system: f.management_systems[0] ?? null,
    management_systems: f.management_systems,
    status: f.status,
    owner_user_id: f.owner_user_id,
    department_id: f.department_id,
    target: textOrNull(f.target),
    plan: textOrNull(f.plan),
    resources: textOrNull(f.resources),
    evaluation_method: textOrNull(f.evaluation_method),
    start_date: f.start_date || null,
    due_date: f.due_date || null,
    period_year: f.period_year && Number.isInteger(year) ? year : null,
    approved_by: f.approved_by,
    communicated_to: textOrNull(f.communicated_to),
    last_communicated_on: f.last_communicated_on || null,
    progress,
    progress_note: progress === null ? null : textOrNull(f.progress_note),
    origins: f.origins
      .filter((o) => isOriginType(o.entity_type))
      .map((o): OriginIn => ({ entity_type: o.entity_type as OriginType, entity_id: o.entity_id })),
    closing_note: textOrNull(f.closing_note),
  };
}

/** Only the fields that differ from `before` (arrays and objects compared by value). */
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const a = before[key];
    const b = after[key];
    const same =
      a !== null && b !== null && typeof a === 'object' && typeof b === 'object'
        ? JSON.stringify(a) === JSON.stringify(b)
        : a === b;
    if (!same) {
      out[key] = b;
    }
  }
  return out;
}

/** A suggested KPI as a create request for the new objective. */
export function suggestedKpiRequest(
  k: NonNullable<SuggestedObjective['kpis']>[number],
  objectiveId: string,
  ownerId: string | null,
): CreateKpiRequest {
  return {
    name: k.name.slice(0, 255),
    objective_id: objectiveId,
    owner_user_id: ownerId,
    unit: k.unit ? k.unit.slice(0, 32) : null,
    direction: k.direction ?? 'higher',
    baseline_value: k.baseline_value ?? null,
    target_value: k.target_value ?? null,
    warning_value: k.warning_value ?? null,
    frequency: k.frequency ?? 'monthly',
    measurement_reminders: true,
  };
}

let nextId = 0;

/**
 * `/objectives/new` and `/objectives/:id/edit` (max 760 px, sticky save bar). Three
 * groups: 1. what to achieve (title, systems, measurable result, where it comes
 * from, with SMART suggestions on create), 2. who and when (owner, department,
 * plan year, dates, approval), 3. plan and follow-up (actions, resources,
 * evaluation, communication, a progress override on edit). Opened from a risk,
 * opportunity or policy ("create from here"), the source is linked after saving.
 * `?focus=origins|systems|communication` scrolls to that part.
 */
@Component({
  selector: 'app-objective-editor',
  imports: [
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    WhyItMatters,
    FlowBanner,
    Alert,
    Button,
    Card,
    HelpStrip,
    LoadingState,
    PageHeader,
    Switch,
    ObjField,
    OriginPicker,
    OwnerSelect,
    SystemPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'objectives.form.editTitle' : 'objectives.form.newTitle'"
        [breadcrumbs]="breadcrumbs()"
        [backLink]="backLink()"
        [backLabelKey]="id() ? 'objectives.common.backToObjective' : 'objectives.common.backToList'"
      />
      <app-help-strip class="mb-4 block" [scope]="scope" page="form" lesson="smart-objectives" />
      <app-flow-banner [flow]="flow()" (cancelled)="onFlowCancelled()" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="6" />
      } @else if (state() === 'error') {
        <app-alert tone="error">{{ 'objectives.common.loadFailed' | transloco }}</app-alert>
      } @else {
        <form class="flex flex-col gap-5" novalidate (submit)="$event.preventDefault(); save()">
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }

          <!-- 1. What do you want to achieve -->
          <app-card>
            <fieldset class="flex flex-col gap-4">
              <legend class="mb-1 font-display text-card font-bold text-fg">
                {{ 'objectives.form.group1' | transloco }}
              </legend>

              @if (!id()) {
                <div
                  class="rounded-tile border border-accent/30 bg-accent-soft p-4"
                  data-testid="smart-card"
                >
                  <h3 class="text-ui font-bold text-fg">
                    {{ 'objectives.ai.smartTitle' | transloco }}
                  </h3>
                  <p class="mt-0.5 text-meta text-fg-muted">
                    {{ 'objectives.ai.smartHint' | transloco }}
                  </p>
                  <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <app-obj-field
                      class="flex-1"
                      [label]="'objectives.ai.focusLabel' | transloco"
                      [inputId]="fid('focus')"
                    >
                      <input
                        [id]="fid('focus')"
                        type="text"
                        maxlength="300"
                        autocomplete="off"
                        [placeholder]="'objectives.ai.focusPlaceholder' | transloco"
                        [value]="smartFocus()"
                        (input)="smartFocus.set($any($event.target).value)"
                      />
                    </app-obj-field>
                    <app-ai-assist-button
                      [assist]="suggestAssist"
                      labelKey="objectives.ai.suggestSmart"
                      [input]="suggestInput()"
                      (result)="onSuggestions($event)"
                    />
                  </div>
                  @if (suggestions().length) {
                    <ul class="mt-3 flex flex-col gap-2" data-testid="smart-suggestions">
                      @for (s of suggestions(); track $index) {
                        <li class="rounded-tile border border-border bg-surface p-3">
                          <p class="text-body font-semibold text-fg">{{ s.title }}</p>
                          @if (s.target) {
                            <p class="mt-0.5 text-ui text-fg-muted">{{ s.target }}</p>
                          }
                          @if (s.kpis?.length) {
                            <p class="mt-1 text-meta text-fg-subtle">
                              {{
                                'objectives.ai.suggestedKpis' | transloco: { names: kpiNames(s) }
                              }}
                            </p>
                          }
                          <app-button
                            class="mt-2 inline-block"
                            size="sm"
                            variant="secondary"
                            (click)="applySuggestion(s)"
                          >
                            {{ 'objectives.ai.useSuggestion' | transloco }}
                          </app-button>
                        </li>
                      }
                    </ul>
                    <p class="mt-2 text-meta text-fg-subtle">
                      {{ 'objectives.ai.suggestionNote' | transloco }}
                    </p>
                  }
                </div>
              }

              <app-obj-field
                [label]="'objectives.fields.title' | transloco"
                [inputId]="fid('title')"
                help="title"
                [required]="true"
                [errorKey]="titleMissing() ? 'objectives.errors.title_required' : null"
              >
                <input
                  [id]="fid('title')"
                  type="text"
                  maxlength="255"
                  required
                  autocomplete="off"
                  [attr.aria-invalid]="titleMissing() || null"
                  [value]="form().title"
                  (input)="set('title', $any($event.target).value)"
                />
              </app-obj-field>

              <div id="obj-section-systems">
                <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span [id]="fid('systems-label')" class="text-ui font-semibold text-fg-muted">
                    {{ 'objectives.fields.managementSystems' | transloco }}
                  </span>
                  <app-field-help [scope]="scope" page="form" field="managementSystems" />
                </div>
                <app-objectives-system-picker
                  [value]="form().management_systems"
                  [labelledBy]="fid('systems-label')"
                  (valueChange)="set('management_systems', $event)"
                />
              </div>

              <app-obj-field
                [label]="'objectives.fields.target' | transloco"
                [inputId]="fid('target')"
                help="target"
              >
                <div class="flex items-start gap-1">
                  <textarea
                    [id]="fid('target')"
                    class="min-w-0 flex-1"
                    rows="2"
                    maxlength="5000"
                    [value]="form().target"
                    (input)="set('target', $any($event.target).value)"
                  ></textarea>
                  <app-ask-about
                    field="target"
                    [fieldLabel]="'objectives.fields.target' | transloco"
                    labelKey="objectives.ai.askTarget"
                    [prompt]="askTargetPrompt()"
                  />
                </div>
              </app-obj-field>

              <app-obj-field
                [label]="'objectives.fields.description' | transloco"
                [inputId]="fid('description')"
                help="description"
              >
                <textarea
                  [id]="fid('description')"
                  rows="3"
                  maxlength="20000"
                  [value]="form().description"
                  (input)="set('description', $any($event.target).value)"
                ></textarea>
              </app-obj-field>

              <div id="obj-section-origins">
                <app-obj-field
                  [label]="'objectives.origins.heading' | transloco"
                  [inputId]="fid('origins')"
                  help="origins"
                >
                  @if (flowSourceName(); as name) {
                    <p class="text-meta text-fg-muted">
                      {{ 'objectives.origins.fromFlow' | transloco: { name } }}
                    </p>
                  }
                  <app-objectives-origin-picker
                    [inputId]="fid('origins')"
                    [value]="form().origins"
                    [exclude]="flowSourceIds()"
                    (valueChange)="set('origins', $event)"
                  />
                </app-obj-field>
              </div>
            </fieldset>
          </app-card>

          <!-- 2. Who and when -->
          <app-card>
            <fieldset class="flex flex-col gap-4">
              <legend class="mb-1 font-display text-card font-bold text-fg">
                {{ 'objectives.form.group2' | transloco }}
              </legend>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <app-obj-field
                  [label]="'objectives.fields.owner' | transloco"
                  [inputId]="fid('owner')"
                  help="owner"
                >
                  <app-objectives-owner-select
                    kind="user"
                    [inputId]="fid('owner')"
                    [value]="form().owner_user_id"
                    [currentName]="original()?.owner?.name ?? null"
                    (valueChange)="set('owner_user_id', $event)"
                  />
                </app-obj-field>
                <app-obj-field
                  [label]="'objectives.fields.department' | transloco"
                  [inputId]="fid('department')"
                >
                  <app-objectives-owner-select
                    kind="department"
                    [inputId]="fid('department')"
                    [value]="form().department_id"
                    (valueChange)="set('department_id', $event)"
                  />
                </app-obj-field>
                <app-obj-field
                  [label]="'objectives.fields.periodYear' | transloco"
                  [inputId]="fid('year')"
                  help="periodYear"
                >
                  <select
                    [id]="fid('year')"
                    (change)="set('period_year', $any($event.target).value)"
                  >
                    <option value="" [selected]="!form().period_year">
                      {{ 'objectives.form.noYear' | transloco }}
                    </option>
                    @for (y of years(); track y) {
                      <option [value]="y" [selected]="form().period_year === '' + y">
                        {{ y }}
                      </option>
                    }
                  </select>
                </app-obj-field>
                <div class="hidden sm:block"></div>
                <app-obj-field
                  [label]="'objectives.fields.startDate' | transloco"
                  [inputId]="fid('start')"
                >
                  <input
                    [id]="fid('start')"
                    type="date"
                    [lang]="lang()"
                    [value]="form().start_date"
                    (change)="set('start_date', $any($event.target).value)"
                  />
                </app-obj-field>
                <app-obj-field
                  [label]="'objectives.fields.dueDate' | transloco"
                  [inputId]="fid('due')"
                  help="dueDate"
                  [errorKey]="datesInvalid() ? 'objectives.errors.invalid_dates' : null"
                >
                  <input
                    [id]="fid('due')"
                    type="date"
                    [lang]="lang()"
                    [attr.aria-invalid]="datesInvalid() || null"
                    [value]="form().due_date"
                    (change)="set('due_date', $any($event.target).value)"
                  />
                </app-obj-field>
              </div>

              @if (id()) {
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <app-obj-field
                    [label]="'objectives.fields.status' | transloco"
                    [inputId]="fid('status')"
                    help="status"
                  >
                    <select
                      [id]="fid('status')"
                      (change)="set('status', $any($event.target).value)"
                    >
                      @for (s of statuses; track s) {
                        <option [value]="s" [selected]="form().status === s">
                          {{ statusKey(s) | transloco }}
                        </option>
                      }
                    </select>
                  </app-obj-field>
                  @if (form().status !== 'draft') {
                    <app-obj-field
                      [label]="'objectives.fields.approvedBy' | transloco"
                      [inputId]="fid('approver')"
                      help="approvedBy"
                    >
                      <app-objectives-owner-select
                        kind="user"
                        [inputId]="fid('approver')"
                        [value]="form().approved_by"
                        [currentName]="original()?.approved_by?.name ?? null"
                        (valueChange)="set('approved_by', $event)"
                      />
                    </app-obj-field>
                  }
                </div>
                @if (closed()) {
                  <app-obj-field
                    [label]="'objectives.fields.closingNote' | transloco"
                    [inputId]="fid('closing')"
                    help="closingNote"
                  >
                    <textarea
                      [id]="fid('closing')"
                      rows="3"
                      maxlength="5000"
                      [value]="form().closing_note"
                      (input)="set('closing_note', $any($event.target).value)"
                    ></textarea>
                  </app-obj-field>
                }
              } @else {
                <div>
                  <app-switch
                    [checked]="form().status === 'active'"
                    (checkedChange)="set('status', $event ? 'active' : 'draft')"
                  >
                    {{ 'objectives.form.alreadyApproved' | transloco }}
                  </app-switch>
                  <p class="mt-1 text-meta text-fg-muted">
                    {{ 'objectives.form.alreadyApprovedHint' | transloco }}
                  </p>
                </div>
              }
            </fieldset>
          </app-card>

          <!-- 3. Plan and follow-up -->
          <app-card>
            <fieldset class="flex flex-col gap-4">
              <legend class="mb-1 font-display text-card font-bold text-fg">
                {{ 'objectives.form.group3' | transloco }}
              </legend>
              <app-obj-field
                [label]="'objectives.fields.plan' | transloco"
                [inputId]="fid('plan')"
                help="plan"
              >
                <div class="flex items-start gap-1">
                  <textarea
                    [id]="fid('plan')"
                    class="min-w-0 flex-1"
                    rows="4"
                    maxlength="20000"
                    [value]="form().plan"
                    (input)="set('plan', $any($event.target).value)"
                  ></textarea>
                  <app-ask-about
                    field="plan"
                    [fieldLabel]="'objectives.fields.plan' | transloco"
                    [prompt]="askPlanPrompt()"
                  />
                </div>
              </app-obj-field>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <app-obj-field
                  [label]="'objectives.fields.resources' | transloco"
                  [inputId]="fid('resources')"
                  help="resources"
                >
                  <textarea
                    [id]="fid('resources')"
                    rows="3"
                    maxlength="5000"
                    [value]="form().resources"
                    (input)="set('resources', $any($event.target).value)"
                  ></textarea>
                </app-obj-field>
                <app-obj-field
                  [label]="'objectives.fields.evaluationMethod' | transloco"
                  [inputId]="fid('evaluation')"
                  help="evaluationMethod"
                >
                  <div class="flex items-start gap-1">
                    <textarea
                      [id]="fid('evaluation')"
                      class="min-w-0 flex-1"
                      rows="3"
                      maxlength="5000"
                      [value]="form().evaluation_method"
                      (input)="set('evaluation_method', $any($event.target).value)"
                    ></textarea>
                    <app-ask-about
                      field="evaluation_method"
                      [fieldLabel]="'objectives.fields.evaluationMethod' | transloco"
                      [prompt]="askEvaluationPrompt()"
                    />
                  </div>
                </app-obj-field>
              </div>
              <div
                id="obj-section-communication"
                class="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]"
              >
                <app-obj-field
                  [label]="'objectives.fields.communicatedTo' | transloco"
                  [inputId]="fid('communicated')"
                  help="communicatedTo"
                >
                  <textarea
                    [id]="fid('communicated')"
                    rows="2"
                    maxlength="5000"
                    [value]="form().communicated_to"
                    (input)="set('communicated_to', $any($event.target).value)"
                  ></textarea>
                </app-obj-field>
                <app-obj-field
                  [label]="'objectives.fields.lastCommunicatedOn' | transloco"
                  [inputId]="fid('communicated-on')"
                  help="lastCommunicatedOn"
                >
                  <input
                    [id]="fid('communicated-on')"
                    type="date"
                    [lang]="lang()"
                    [max]="today"
                    [value]="form().last_communicated_on"
                    (change)="set('last_communicated_on', $any($event.target).value)"
                  />
                </app-obj-field>
              </div>

              @if (original(); as o) {
                <div class="rounded-tile border border-border p-3" data-testid="progress-override">
                  <p class="text-ui font-semibold text-fg">
                    {{ 'objectives.fields.progress' | transloco }}
                  </p>
                  <p class="mt-0.5 text-meta text-fg-muted">
                    @if (o.computed_progress !== null && o.computed_progress !== undefined) {
                      {{
                        countKey(
                          'objectives.form.computedProgress',
                          o.computed_progress_kpis ?? o.kpis.total
                        )
                          | transloco
                            : {
                                value: o.computed_progress,
                                count: o.computed_progress_kpis ?? o.kpis.total,
                              }
                      }}
                    } @else {
                      {{ 'objectives.form.noComputedProgress' | transloco }}
                    }
                  </p>
                  <app-switch
                    class="mt-2 block"
                    [checked]="override()"
                    (checkedChange)="setOverride($event)"
                  >
                    {{ 'objectives.form.overrideProgress' | transloco }}
                  </app-switch>
                  @if (override()) {
                    <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
                      <app-obj-field
                        [label]="'objectives.fields.progressOverride' | transloco"
                        [inputId]="fid('progress')"
                        [errorKey]="progressInvalid() ? 'objectives.form.progressRange' : null"
                      >
                        <input
                          [id]="fid('progress')"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          inputmode="numeric"
                          [attr.aria-invalid]="progressInvalid() || null"
                          [value]="form().progress"
                          (input)="set('progress', $any($event.target).value)"
                        />
                      </app-obj-field>
                      <app-obj-field
                        [label]="'objectives.fields.progressNote' | transloco"
                        [inputId]="fid('progress-note')"
                        help="progressNote"
                        [required]="noteRequired()"
                        [errorKey]="
                          noteMissing() ? 'objectives.errors.progress_note_required' : null
                        "
                      >
                        <input
                          [id]="fid('progress-note')"
                          type="text"
                          maxlength="2000"
                          [value]="form().progress_note"
                          (input)="set('progress_note', $any($event.target).value)"
                        />
                      </app-obj-field>
                    </div>
                  }
                </div>
              }

              @if (pendingKpis().length && !id()) {
                <div class="rounded-tile border border-border p-3" data-testid="suggested-kpis">
                  <app-switch [checked]="createKpis()" (checkedChange)="createKpis.set($event)">
                    {{
                      countKey('objectives.form.createSuggestedKpis', pendingKpis().length)
                        | transloco: { count: pendingKpis().length }
                    }}
                  </app-switch>
                  <p class="mt-1 text-meta text-fg-muted">{{ pendingKpiNames() }}</p>
                </div>
              }

              @if (id()) {
                <app-obj-field
                  [label]="'objectives.fields.changeReason' | transloco"
                  [inputId]="fid('reason')"
                  help="changeReason"
                >
                  <input
                    [id]="fid('reason')"
                    type="text"
                    maxlength="1000"
                    [value]="changeReason()"
                    (input)="changeReason.set($any($event.target).value)"
                  />
                </app-obj-field>
              }
            </fieldset>
          </app-card>

          <div
            class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
          >
            <app-button variant="secondary" (click)="cancel()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="saving()"
              data-testid="objective-save"
            >
              {{ (id() ? 'objectives.form.save' : 'objectives.form.create') | transloco }}
            </app-button>
          </div>
        </form>

        <div class="mt-6"><app-why-it-matters [scope]="scope" page="form" /></div>
      }
    </div>
  `,
})
export class ObjectiveEditor {
  private readonly api = inject(ObjectivesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly flows = inject(CreateFlowService);

  /** Route param `:id` when editing (absent on `/objectives/new`). */
  readonly id = input<string | undefined>(undefined);
  /** `?focus=origins|systems|communication`: scroll to that part of the form. */
  readonly focus = input<string | undefined>(undefined);

  protected readonly scope = OBJECTIVES_SCOPE;
  protected readonly statuses = OBJECTIVE_STATUSES;
  protected readonly statusKey = objectiveStatusKey;
  protected readonly suggestAssist = ASSIST_SUGGEST_SMART;
  protected readonly today = todayIso();
  protected readonly countKey = countKey;
  private readonly uid = ++nextId;

  /** "Create from here" (risk / opportunity / policy → objective), when opened from one. */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), { targetType: 'objective' });

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly original = signal<ObjectiveDetail | null>(null);
  protected readonly form = signal<ObjectiveFormValue>(EMPTY_OBJECTIVE_FORM);
  protected readonly changeReason = signal('');
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly suggestions = signal<readonly SuggestedObjective[]>([]);
  protected readonly smartFocus = signal('');
  protected readonly override = signal(false);
  protected readonly pendingKpis = signal<NonNullable<SuggestedObjective['kpis']>>([]);
  protected readonly createKpis = signal(true);

  protected readonly lang = computed(() => this.language.active());
  protected readonly years = computed(() => {
    const years = planYears(this.today);
    const current = Number(this.form().period_year);
    return current && !years.includes(current) ? [current, ...years] : years;
  });
  protected readonly breadcrumbs = computed(() => {
    const o = this.original();
    return o
      ? [
          OBJECTIVES_ROOT_CRUMB,
          { label: o.code, link: ['/objectives', o.id] },
          { labelKey: 'objectives.form.editTitle' },
        ]
      : [OBJECTIVES_ROOT_CRUMB, { labelKey: 'objectives.form.newTitle' }];
  });
  protected readonly backLink = computed(() => {
    const id = this.id();
    return id ? ['/objectives', id] : ['/objectives'];
  });
  protected readonly closed = computed(() => isClosedObjective(this.form().status));
  protected readonly titleMissing = computed(() => this.submitted() && !this.form().title.trim());
  protected readonly datesInvalid = computed(() => {
    const { start_date, due_date } = this.form();
    return !!start_date && !!due_date && due_date < start_date;
  });
  protected readonly progressInvalid = computed(() => {
    const text = this.form().progress.trim();
    if (!this.override() || !text) {
      return false;
    }
    const n = Number(text);
    return !Number.isFinite(n) || n < 0 || n > 100;
  });
  /** A manual value next to KPIs with data needs a reason (backend: progress_note_required). */
  protected readonly noteRequired = computed(() => {
    const o = this.original();
    return this.override() && !!o && (o.computed_progress_kpis ?? 0) > 0;
  });
  protected readonly noteMissing = computed(
    () =>
      this.submitted() &&
      this.noteRequired() &&
      !!this.form().progress.trim() &&
      !this.form().progress_note.trim(),
  );
  protected readonly flowSourceIds = computed(() => {
    const id = this.flow()?.source?.entity_id;
    return id ? [id] : [];
  });
  protected readonly flowSourceName = computed(() => {
    const s = this.flow()?.source;
    return s ? [s.code, s.title].filter(Boolean).join(' ') : null;
  });
  protected readonly pendingKpiNames = computed(() =>
    this.pendingKpis()
      .map((k) => k.name)
      .join(', '),
  );
  protected readonly suggestInput = computed(() => {
    const f = this.form();
    const focus = [this.smartFocus(), f.title, f.description]
      .map((t) => t.trim())
      .filter(Boolean)
      .join('. ');
    return {
      management_system: f.management_systems[0] || undefined,
      focus: focus || undefined,
      count: 3,
    };
  });
  protected readonly askTargetPrompt = computed(() =>
    this.language.translate('objectives.ai.prompts.askTarget', {
      title: this.form().title || '-',
      target: this.form().target || '-',
    }),
  );
  protected readonly askPlanPrompt = computed(() =>
    this.language.translate('objectives.ai.prompts.askPlan', {
      title: this.form().title || '-',
      target: this.form().target || '-',
    }),
  );
  protected readonly askEvaluationPrompt = computed(() =>
    this.language.translate('objectives.ai.prompts.askEvaluation', {
      title: this.form().title || '-',
    }),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'objective',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title:
        this.original()?.title ??
        this.language.translate(
          this.id() ? 'objectives.form.editTitle' : 'objectives.form.newTitle',
        ),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    // Prefill from "create from here": the title (and status) of the new objective.
    effect(() => {
      const flow = this.flow();
      if (!flow || this.id()) {
        return;
      }
      untracked(() => {
        const title = typeof flow.prefill.title === 'string' ? flow.prefill.title : '';
        this.form.update((f) => ({ ...f, title: f.title || title }));
      });
    });
    effect(() => {
      const section = this.focus();
      const ready = this.state() === 'ready';
      if (section && ready) {
        untracked(() => setTimeout(() => this.scrollTo(section)));
      }
    });
  }

  protected fid(name: string): string {
    return `obj-${this.uid}-${name}`;
  }

  protected set<K extends keyof ObjectiveFormValue>(key: K, value: ObjectiveFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setOverride(on: boolean): void {
    this.override.set(on);
    if (!on) {
      this.form.update((f) => ({ ...f, progress: '', progress_note: '' }));
    }
  }

  protected kpiNames(s: SuggestedObjective): string {
    return (s.kpis ?? []).map((k) => k.name).join(', ');
  }

  protected onSuggestions(result: unknown): void {
    const list = (result as SmartSuggestions | null)?.objectives;
    this.suggestions.set(Array.isArray(list) ? list.filter((s) => !!s?.title) : []);
  }

  protected applySuggestion(s: SuggestedObjective): void {
    const start = this.form().start_date || this.today;
    const months = Number(s.due_in_months);
    const due = Number.isFinite(months) && months > 0 ? addMonthsIso(start, months) : '';
    this.form.update((f) => ({
      ...f,
      title: s.title,
      description: s.description ?? f.description,
      target: s.target ?? f.target,
      plan: s.plan ?? f.plan,
      resources: s.resources ?? f.resources,
      evaluation_method: s.evaluation_method ?? f.evaluation_method,
      start_date: start,
      due_date: due || f.due_date,
      period_year: f.period_year || (due ? due.slice(0, 4) : start.slice(0, 4)),
    }));
    this.pendingKpis.set((s.kpis ?? []).filter((k) => !!k?.name));
    this.createKpis.set(true);
    this.notifications.success('objectives.notices.suggestionApplied');
  }

  protected onFlowCancelled(): void {
    this.flows.cancel();
  }

  protected cancel(): void {
    if (!this.id()) {
      this.flows.cancel();
    }
    void this.router.navigate(this.backLink());
  }

  protected save(): void {
    this.submitted.set(true);
    this.errorKey.set(null);
    const orgId = this.selectedOrg.currentOrgId();
    if (
      !orgId ||
      this.saving() ||
      this.titleMissing() ||
      this.datesInvalid() ||
      this.progressInvalid() ||
      this.noteMissing()
    ) {
      return;
    }
    const payload = objectivePayload(this.form());
    const original = this.original();
    const id = this.id();
    this.saving.set(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { closing_note, status, progress, progress_note, approved_by, ...createFields } = payload;
    const call =
      id && original
        ? this.api.update(orgId, id, {
            ...changedFields(objectivePayload(objectiveToForm(original)), payload),
            change_reason: textOrNull(this.changeReason()),
          })
        : this.api.create(orgId, {
            ...createFields,
            title: payload.title ?? '',
            status: status === 'active' ? 'active' : 'draft',
          });
    call
      .pipe(
        switchMap((saved) =>
          id
            ? of(saved)
            : this.afterCreate(orgId, saved.id, payload.owner_user_id ?? null).pipe(
                switchMap(() => of(saved)),
              ),
        ),
      )
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.notifications.success(
            id ? 'objectives.notices.saved' : 'objectives.notices.created',
          );
          void this.router.navigate(['/objectives', saved.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorKey.set(objectivesErrorKey(error));
        },
      });
  }

  /** After creating: link the flow's source and create the suggested KPIs (best effort). */
  private afterCreate(
    orgId: string,
    objectiveId: string,
    ownerId: string | null,
  ): Observable<unknown> {
    const link = this.flows.complete(objectiveId, 'objective').pipe(catchError(() => of(null)));
    const kpis =
      this.createKpis() && this.pendingKpis().length
        ? this.pendingKpis().map((k) =>
            this.api
              .createKpi(orgId, suggestedKpiRequest(k, objectiveId, ownerId))
              .pipe(catchError(() => of(null))),
          )
        : [];
    return forkJoin([link, ...kpis]);
  }

  private scrollTo(section: string): void {
    const el = document.getElementById(`obj-section-${section}`);
    if (!el) {
      return;
    }
    el.scrollIntoView?.({ block: 'center' });
    el.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true });
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.request.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (o) => {
        if (!o.can_edit) {
          void this.router.navigate(['/objectives', id]);
          return;
        }
        this.original.set(o);
        this.form.set(objectiveToForm(o));
        this.override.set(o.progress !== null);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

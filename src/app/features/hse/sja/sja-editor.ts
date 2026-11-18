import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService, FlowContext } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { Term } from '../../../shared/guidance/term';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import {
  CONTROL_TYPES,
  ControlType,
  HazardSuggestion,
  PPE_CATEGORIES,
  PpeCategory,
  RISK_LEVELS,
  RelatedIn,
  RiskLevel,
  Sja,
  SjaFields,
  SjaStep,
  UserRef,
} from '../data/hse.models';
import {
  linesToList,
  listToLines,
  localInputToWire,
  ppeOnly,
  residualNotLower,
  textOrNull,
  wireToLocalInput,
} from '../hse-format';
import { HsePeoplePicker, NO_PEOPLE, PeopleValue } from '../shared/people-picker';
import {
  HSE_CRUMBS,
  HSE_MODULE,
  HSE_ROOT_CRUMB,
  HseAskButton,
  HseDirectorySelect,
  HseField,
} from '../shared/hse-shared';

/** One editable control of a step: what is done, and where it sits in the hierarchy. */
export interface ControlDraft {
  readonly key: number;
  text: string;
  type: ControlType | '';
}

/** One editable step row (hazards as one per line, controls as rows). */
export interface StepDraft {
  readonly key: number;
  description: string;
  hazards: string;
  controls: ControlDraft[];
  /** A member (user id) or, when blank, the free-text name of an external person. */
  responsibleUserId: string;
  responsible: string;
  risk_level: RiskLevel | '';
}

let nextKey = 0;

export function controlDraft(text = '', type: ControlType | '' | null = ''): ControlDraft {
  return { key: ++nextKey, text, type: type ?? '' };
}

export function stepDraft(step?: Partial<SjaStep>): StepDraft {
  const controls = (step?.controls ?? []).map((text, i) =>
    controlDraft(text, step?.control_types?.[i] ?? ''),
  );
  return {
    key: ++nextKey,
    description: step?.description ?? '',
    hazards: listToLines(step?.hazards),
    controls: controls.length ? controls : [controlDraft()],
    responsibleUserId: step?.responsible_user_id ?? step?.responsible_user?.id ?? '',
    responsible:
      step?.responsible_user_id || step?.responsible_user ? '' : (step?.responsible ?? ''),
    risk_level: step?.risk_level ?? '',
  };
}

/** Editable rows -> wire steps (rows without a description and blank controls are dropped). */
export function stepsFromDrafts(drafts: readonly StepDraft[]): SjaStep[] {
  return drafts
    .filter((d) => d.description.trim())
    .map((d) => {
      const controls = d.controls.filter((c) => c.text.trim());
      return {
        description: d.description.trim(),
        hazards: linesToList(d.hazards),
        controls: controls.map((c) => c.text.trim()),
        control_types: controls.map((c) => c.type || null),
        responsible_user_id: d.responsibleUserId || null,
        responsible: d.responsibleUserId ? null : textOrNull(d.responsible),
        risk_level: d.risk_level || null,
      };
    });
}

/**
 * Merge the assistant's hazard suggestions into the form: suggested steps are
 * appended (replacing a single blank row), suggested PPE is added to the selection.
 */
export function mergeSuggestions(
  drafts: readonly StepDraft[],
  ppe: readonly PpeCategory[],
  suggestion: HazardSuggestion,
): { steps: StepDraft[]; ppe: PpeCategory[] } {
  const kept = drafts.filter(
    (d) => d.description.trim() || d.hazards.trim() || d.controls.some((c) => c.text.trim()),
  );
  const added = (suggestion.steps ?? []).map((s) =>
    stepDraft({ ...s, risk_level: s.risk_level ?? null }),
  );
  const known = new Set<string>(PPE_CATEGORIES);
  const merged = [...ppe];
  for (const category of suggestion.required_ppe ?? []) {
    if (known.has(category) && !merged.includes(category)) {
      merged.push(category);
    }
  }
  return { steps: [...kept, ...added], ppe: merged };
}

/**
 * `/hse/sja/new` and `/hse/sja/:id/edit`: the safe job analysis form. The job,
 * period and owner; who takes part (members by name, plus external people); the
 * job steps with hazards, controls tagged with the hierarchy of controls and the
 * person responsible; risk before and after controls (with a warning when the
 * residual risk is not lower), required PPE and emergency measures. "Suggest
 * hazards" asks the assistant for a first draft of the steps. Create-from-here
 * and `?entity_type=&entity_id=` link the new SJA to where it came from.
 */
@Component({
  selector: 'app-sja-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    Button,
    Card,
    ErrorState,
    FlowBanner,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    Term,
    HseAskButton,
    HseDirectorySelect,
    HseField,
    HsePeoplePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-28 sm:px-8 sm:pt-7 sm:pb-12">
      <app-page-header
        [titleKey]="id() ? 'hse.sja.edit.title' : 'hse.sja.edit.newTitle'"
        [breadcrumbs]="breadcrumbs()"
      >
        @if (code()) {
          <span meta class="font-mono">{{ code() }}</span>
        }
      </app-page-header>
      <app-help-strip scope="hse" page="sja-edit" lesson="sja-basics" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="6" />
      } @else if (state() === 'error') {
        <app-error-state
          titleKey="hse.common.notFoundTitle"
          bodyKey="hse.common.notFound"
          (retry)="reload()"
        />
      } @else {
        <app-flow-banner [flow]="flow()" />
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          @if (related().length && !flow()) {
            <p
              class="rounded-tile border border-info/30 bg-info-soft px-3 py-2 text-ui text-info-ink"
            >
              {{ 'hse.common.willLink' | transloco }}
            </p>
          }
          <app-card>
            <h2 class="mb-1 font-display text-card font-bold text-fg">
              {{ 'hse.sja.edit.jobSection' | transloco }}
            </h2>
            <p class="mb-4 text-meta text-fg-muted">
              <app-term key="sja" scope="hse">{{ 'hse.sja.one' | transloco }}</app-term>
              {{ 'hse.sja.edit.jobIntro' | transloco }}
            </p>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-hse-field
                class="sm:col-span-2"
                labelKey="hse.sja.fields.title"
                inputId="sja-title"
                help="title"
                [required]="true"
                [errorKey]="submitted() && !title().trim() ? 'hse.errors.title_required' : null"
              >
                <input
                  id="sja-title"
                  type="text"
                  required
                  maxlength="255"
                  autocomplete="off"
                  [value]="title()"
                  (input)="title.set($any($event.target).value)"
                  [attr.aria-invalid]="submitted() && !title().trim()"
                  aria-describedby="sja-title-error"
                />
              </app-hse-field>
              <app-hse-field
                class="sm:col-span-2"
                labelKey="hse.sja.fields.job_description"
                inputId="sja-description"
                help="job_description"
              >
                <textarea
                  id="sja-description"
                  rows="4"
                  [value]="jobDescription()"
                  (input)="jobDescription.set($any($event.target).value)"
                ></textarea>
              </app-hse-field>
              <app-hse-field labelKey="hse.sja.fields.location" inputId="sja-location">
                <input
                  id="sja-location"
                  type="text"
                  maxlength="200"
                  [value]="location()"
                  (input)="location.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field labelKey="hse.sja.fields.owner" inputId="sja-owner">
                <app-hse-directory-select
                  inputId="sja-owner"
                  kind="user"
                  noneKey="hse.common.me"
                  [value]="ownerId()"
                  [currentName]="ownerName()"
                  (valueChange)="ownerId.set($event)"
                />
              </app-hse-field>
              <app-hse-field labelKey="hse.sja.fields.work_start_at" inputId="sja-start">
                <input
                  id="sja-start"
                  type="datetime-local"
                  [value]="workStart()"
                  (input)="workStart.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field
                labelKey="hse.sja.fields.work_end_at"
                inputId="sja-end"
                [errorKey]="periodInvalid() ? 'hse.errors.invalid_period' : null"
              >
                <input
                  id="sja-end"
                  type="datetime-local"
                  [value]="workEnd()"
                  (input)="workEnd.set($any($event.target).value)"
                  [attr.aria-invalid]="periodInvalid()"
                />
              </app-hse-field>
              <app-hse-field labelKey="hse.common.department" inputId="sja-department">
                <app-hse-directory-select
                  inputId="sja-department"
                  kind="department"
                  [value]="departmentId()"
                  (valueChange)="departmentId.set($event)"
                />
              </app-hse-field>
            </div>
          </app-card>

          <app-card>
            <app-hse-field
              labelKey="hse.sja.fields.participants"
              inputId="sja-participants"
              help="participants"
              hintKey="hse.people.hint"
            >
              <app-hse-people-picker
                inputId="sja-participants"
                labelKey="hse.sja.fields.participants"
                describedBy="sja-participants-hint"
                [value]="participants()"
                [known]="knownParticipants()"
                (valueChange)="participants.set($event)"
                testId="sja-participants-picker"
              />
            </app-hse-field>
          </app-card>

          <app-card>
            <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-card font-bold text-fg">
                {{ 'hse.sja.edit.stepsSection' | transloco }}
              </h2>
              <app-ai-assist-button
                assist="hse.suggest_hazards"
                labelKey="hse.sja.ai.suggest"
                [input]="assistInput()"
                [entityType]="id() ? 'sja' : null"
                [entityId]="id() ?? null"
                [disabled]="!title().trim() && !jobDescription().trim() && !id()"
                (result)="applySuggestions($event)"
              />
            </div>
            <p class="mb-4 text-meta text-fg-muted">{{ 'hse.sja.edit.stepsIntro' | transloco }}</p>
            @if (aiNotes()) {
              <p
                class="mb-3 rounded-tile border border-border bg-surface-2 px-3 py-2 text-ui text-fg-muted"
                role="status"
              >
                {{ aiNotes() }}
              </p>
            }
            <ol class="flex flex-col gap-4">
              @for (step of steps(); track step.key; let i = $index; let last = $last) {
                <li
                  class="rounded-tile border border-border p-3 sm:p-4"
                  [attr.aria-label]="'hse.sja.edit.stepLabel' | transloco: { n: i + 1 }"
                  [attr.data-testid]="'sja-step-editor-' + i"
                >
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <span class="text-meta font-bold tracking-wide text-fg-subtle uppercase">
                      {{ 'hse.sja.edit.stepLabel' | transloco: { n: i + 1 } }}
                    </span>
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                        [disabled]="i === 0"
                        [attr.aria-label]="'hse.sja.edit.moveUp' | transloco: { n: i + 1 }"
                        (click)="move(i, -1)"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                        [disabled]="last"
                        [attr.aria-label]="'hse.sja.edit.moveDown' | transloco: { n: i + 1 }"
                        (click)="move(i, 1)"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fail"
                        [attr.aria-label]="'hse.sja.edit.removeStep' | transloco: { n: i + 1 }"
                        (click)="removeStep(i)"
                      >
                        <app-icon name="trash" [size]="15" />
                      </button>
                    </div>
                  </div>
                  <div class="flex flex-col gap-4">
                    <app-hse-field
                      labelKey="hse.sja.fields.step_description"
                      [inputId]="'step-desc-' + step.key"
                      [help]="i === 0 ? 'steps' : null"
                    >
                      <input
                        [id]="'step-desc-' + step.key"
                        type="text"
                        maxlength="1000"
                        [value]="step.description"
                        (input)="patchStep(i, { description: $any($event.target).value })"
                      />
                    </app-hse-field>
                    <app-hse-field
                      labelKey="hse.sja.fields.hazards"
                      [inputId]="'step-haz-' + step.key"
                      [help]="i === 0 ? 'hazards' : null"
                      hintKey="hse.common.onePerLine"
                    >
                      @if (i === 0) {
                        <app-ask-about
                          label-extra
                          [prompt]="'hse.sja.ai.hazardsPrompt' | transloco"
                          [fieldLabel]="'hse.sja.fields.hazards' | transloco"
                          labelKey="hse.sja.ai.askHazards"
                        />
                      }
                      <textarea
                        [id]="'step-haz-' + step.key"
                        rows="3"
                        [attr.aria-describedby]="'step-haz-' + step.key + '-hint'"
                        [value]="step.hazards"
                        (input)="patchStep(i, { hazards: $any($event.target).value })"
                      ></textarea>
                    </app-hse-field>
                    <fieldset>
                      <legend
                        class="mb-1.5 flex min-h-6 items-center gap-1.5 text-ui font-semibold text-fg-muted"
                      >
                        {{ 'hse.sja.fields.controls' | transloco }}
                        @if (i === 0) {
                          <app-ask-about
                            [prompt]="'hse.sja.ai.controlsPrompt' | transloco"
                            [fieldLabel]="'hse.sja.fields.controls' | transloco"
                            labelKey="hse.sja.ai.askControls"
                          />
                        }
                      </legend>
                      <p class="mb-2 text-meta text-fg-muted">
                        <app-term key="hierarchy-of-controls" scope="hse">{{
                          'hse.sja.edit.hierarchy' | transloco
                        }}</app-term>
                        {{ 'hse.sja.edit.controlsHint' | transloco }}
                      </p>
                      <ul class="flex flex-col gap-2">
                        @for (control of step.controls; track control.key; let ci = $index) {
                          <li class="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_190px_auto]">
                            <label class="sr-only" [attr.for]="'ctl-' + control.key">{{
                              'hse.sja.edit.controlN' | transloco: { n: ci + 1, step: i + 1 }
                            }}</label>
                            <input
                              class="cf-input col-span-2 sm:col-span-1"
                              [id]="'ctl-' + control.key"
                              type="text"
                              maxlength="1000"
                              [placeholder]="'hse.sja.edit.controlPlaceholder' | transloco"
                              [value]="control.text"
                              (input)="patchControl(i, ci, { text: $any($event.target).value })"
                            />
                            <label class="sr-only" [attr.for]="'ctl-type-' + control.key">{{
                              'hse.sja.edit.controlTypeN' | transloco: { n: ci + 1, step: i + 1 }
                            }}</label>
                            <select
                              class="cf-input"
                              [id]="'ctl-type-' + control.key"
                              (change)="patchControl(i, ci, { type: $any($event.target).value })"
                            >
                              <option value="" [selected]="!control.type">
                                {{ 'hse.controlType.none' | transloco }}
                              </option>
                              @for (type of controlTypes; track type) {
                                <option [value]="type" [selected]="type === control.type">
                                  {{ 'hse.controlType.' + type | transloco }}
                                </option>
                              }
                            </select>
                            <button
                              type="button"
                              class="inline-flex h-10 w-10 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fail"
                              [attr.aria-label]="
                                'hse.sja.edit.removeControl' | transloco: { n: ci + 1, step: i + 1 }
                              "
                              (click)="removeControl(i, ci)"
                            >
                              <app-icon name="x" [size]="14" />
                            </button>
                          </li>
                        }
                      </ul>
                      <div class="mt-2">
                        <app-button variant="ghost" size="sm" (click)="addControl(i)">
                          <app-icon name="plus" [size]="13" />
                          {{ 'hse.sja.edit.addControl' | transloco }}
                        </app-button>
                      </div>
                      @if (stepPpeOnly(step)) {
                        <p class="mt-1 text-meta font-semibold text-warn-ink" role="status">
                          {{ 'hse.sja.edit.ppeOnlyWarning' | transloco }}
                        </p>
                      }
                    </fieldset>
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <app-hse-field
                        labelKey="hse.sja.fields.responsible"
                        [inputId]="'step-resp-' + step.key"
                        hintKey="hse.sja.edit.responsibleHint"
                      >
                        <app-hse-directory-select
                          [inputId]="'step-resp-' + step.key"
                          kind="user"
                          noneKey="hse.sja.edit.responsibleExternal"
                          [value]="step.responsibleUserId"
                          (valueChange)="patchStep(i, { responsibleUserId: $event })"
                        />
                        @if (!step.responsibleUserId) {
                          <label class="sr-only" [attr.for]="'step-resp-name-' + step.key">{{
                            'hse.sja.edit.responsibleName' | transloco
                          }}</label>
                          <input
                            class="mt-2"
                            [id]="'step-resp-name-' + step.key"
                            type="text"
                            maxlength="200"
                            [placeholder]="'hse.sja.edit.responsibleName' | transloco"
                            [value]="step.responsible"
                            (input)="patchStep(i, { responsible: $any($event.target).value })"
                          />
                        }
                      </app-hse-field>
                      <app-hse-field
                        labelKey="hse.sja.fields.step_risk"
                        [inputId]="'step-risk-' + step.key"
                      >
                        <select
                          [id]="'step-risk-' + step.key"
                          (change)="patchStep(i, { risk_level: $any($event.target).value })"
                        >
                          <option value="" [selected]="!step.risk_level">
                            {{ 'hse.risk.none' | transloco }}
                          </option>
                          @for (level of riskLevels; track level) {
                            <option [value]="level" [selected]="level === step.risk_level">
                              {{ 'hse.risk.' + level | transloco }}
                            </option>
                          }
                        </select>
                      </app-hse-field>
                    </div>
                  </div>
                </li>
              }
            </ol>
            <div class="mt-3">
              <app-button variant="secondary" size="sm" (click)="addStep()">
                <app-icon name="plus" [size]="14" />
                {{ 'hse.sja.edit.addStep' | transloco }}
              </app-button>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-1 font-display text-card font-bold text-fg">
              {{ 'hse.sja.edit.riskSection' | transloco }}
            </h2>
            <p class="mb-4 text-meta text-fg-muted">{{ 'hse.sja.edit.riskIntro' | transloco }}</p>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-hse-field
                labelKey="hse.sja.fields.risk_level"
                inputId="sja-risk"
                help="risk_level"
              >
                <select id="sja-risk" (change)="riskLevel.set($any($event.target).value)">
                  <option value="" [selected]="!riskLevel()">
                    {{ 'hse.risk.none' | transloco }}
                  </option>
                  @for (level of riskLevels; track level) {
                    <option [value]="level" [selected]="level === riskLevel()">
                      {{ 'hse.risk.' + level | transloco }}
                    </option>
                  }
                </select>
              </app-hse-field>
              <app-hse-field
                labelKey="hse.sja.fields.residual_risk_level"
                inputId="sja-residual"
                help="residual_risk_level"
              >
                <app-ask-about
                  label-extra
                  [prompt]="'hse.sja.ai.residualPrompt' | transloco"
                  [fieldLabel]="'hse.sja.fields.residual_risk_level' | transloco"
                  labelKey="hse.sja.ai.askResidual"
                />
                <select
                  id="sja-residual"
                  (change)="residualRiskLevel.set($any($event.target).value)"
                >
                  <option value="" [selected]="!residualRiskLevel()">
                    {{ 'hse.risk.none' | transloco }}
                  </option>
                  @for (level of riskLevels; track level) {
                    <option [value]="level" [selected]="level === residualRiskLevel()">
                      {{ 'hse.risk.' + level | transloco }}
                    </option>
                  }
                </select>
              </app-hse-field>
              @if (residualWarning()) {
                <p
                  class="rounded-tile border border-warn/40 bg-warn-soft px-3 py-2 text-meta text-warn-ink sm:col-span-2"
                  role="status"
                  data-testid="sja-residual-warning"
                >
                  {{ 'hse.sja.warnings.residual_not_lower' | transloco }}
                </p>
              }
              <fieldset class="sm:col-span-2">
                <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
                  {{ 'hse.sja.fields.required_ppe' | transloco }}
                </legend>
                <p class="mb-2 text-meta text-fg-muted">{{ 'hse.sja.edit.ppeHint' | transloco }}</p>
                <div class="flex flex-wrap gap-2">
                  @for (category of ppeCategories; track category) {
                    <label
                      class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-meta font-semibold"
                      [class]="
                        ppe().includes(category)
                          ? 'border-accent-border bg-accent-soft text-accent'
                          : 'border-border text-fg-muted'
                      "
                    >
                      <input
                        type="checkbox"
                        class="h-4 w-4 accent-[var(--accent)]"
                        [checked]="ppe().includes(category)"
                        (change)="togglePpe(category)"
                      />
                      {{ 'hse.ppeCategory.' + category | transloco }}
                    </label>
                  }
                </div>
              </fieldset>
              <app-hse-field
                class="sm:col-span-2"
                labelKey="hse.sja.fields.emergency_measures"
                inputId="sja-emergency"
                help="emergency_measures"
              >
                <textarea
                  id="sja-emergency"
                  rows="3"
                  [value]="emergency()"
                  (input)="emergency.set($any($event.target).value)"
                ></textarea>
              </app-hse-field>
            </div>
          </app-card>

          @if (id()) {
            <app-card>
              <app-hse-field
                labelKey="hse.common.changeReason"
                inputId="sja-reason"
                help="change_reason"
              >
                <input
                  id="sja-reason"
                  type="text"
                  maxlength="2000"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
              </app-hse-field>
            </app-card>
          }

          <div
            class="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:p-0"
          >
            <app-hse-ask-button
              class="mr-auto"
              labelKey="hse.sja.ai.review"
              promptKey="hse.sja.ai.reviewPrompt"
            />
            <a [routerLink]="backLink()" tabindex="-1" (click)="cancelFlow()">
              <app-button variant="secondary">{{ 'hse.common.cancel' | transloco }}</app-button>
            </a>
            <app-button type="submit" [loading]="saving()" [disabled]="saving()">
              {{ (id() ? 'hse.common.save' : 'hse.sja.edit.create') | transloco }}
            </app-button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [
    `
      .cf-input {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
      }
      .cf-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class SjaEditor {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly flows = inject(CreateFlowService);
  private readonly route = inject(ActivatedRoute);

  /** Route param on edit (component input binding); unset on "new". */
  readonly id = input<string | undefined>(undefined);

  protected readonly riskLevels = RISK_LEVELS;
  protected readonly ppeCategories = PPE_CATEGORIES;
  protected readonly controlTypes = CONTROL_TYPES;

  protected readonly state = signal<'loading' | 'ready' | 'error'>(
    inject(ActivatedRoute).snapshot.paramMap.has('id') ? 'loading' : 'ready',
  );
  protected readonly code = signal('');

  protected readonly title = signal('');
  protected readonly jobDescription = signal('');
  protected readonly location = signal('');
  protected readonly workStart = signal('');
  protected readonly workEnd = signal('');
  protected readonly ownerId = signal('');
  protected readonly ownerName = signal<string | null>(null);
  protected readonly departmentId = signal('');
  protected readonly participants = signal<PeopleValue>(NO_PEOPLE);
  protected readonly knownParticipants = signal<readonly UserRef[]>([]);
  protected readonly steps = signal<StepDraft[]>([stepDraft()]);
  protected readonly ppe = signal<PpeCategory[]>([]);
  protected readonly riskLevel = signal<RiskLevel | ''>('');
  protected readonly residualRiskLevel = signal<RiskLevel | ''>('');
  protected readonly emergency = signal('');
  protected readonly changeReason = signal('');
  protected readonly related = signal<RelatedIn[]>([]);

  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly aiNotes = signal<string | null>(null);

  /** The "create from here" flow (or `?fromRequirement=`) this new form was opened with. */
  private readonly flowSource = signal<Signal<FlowContext | null> | null>(null);
  protected readonly flow = computed(() => this.flowSource()?.() ?? null);

  protected readonly breadcrumbs = computed(() => {
    const id = this.id();
    return id
      ? [
          HSE_ROOT_CRUMB,
          HSE_CRUMBS.sja,
          { label: this.code() || '…', link: ['/hse/sja', id] },
          { labelKey: 'hse.common.edit' },
        ]
      : [HSE_ROOT_CRUMB, HSE_CRUMBS.sja, { labelKey: 'hse.sja.edit.newTitle' }];
  });
  protected readonly backLink = computed(() => {
    const id = this.id();
    return id ? ['/hse/sja', id] : ['/hse/sja'];
  });

  protected readonly periodInvalid = computed(() => {
    const start = this.workStart();
    const end = this.workEnd();
    return !!start && !!end && end < start;
  });
  protected readonly residualWarning = computed(() =>
    residualNotLower(this.riskLevel(), this.residualRiskLevel()),
  );

  protected readonly assistInput = computed(() => ({
    task: [this.title().trim(), this.jobDescription().trim()].filter(Boolean).join('\n\n'),
    location: this.location().trim() || undefined,
  }));

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'sja',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.title() || this.language.translate('hse.sja.edit.newTitle'),
    }));

    const params = this.route.snapshot.queryParamMap;
    const linkType = params.get('entity_type');
    const linkId = params.get('entity_id');
    if (linkType && linkId) {
      this.related.set([{ entity_type: linkType, entity_id: linkId, link_type: 'relates_to' }]);
    }

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        if (id) {
          this.load(orgId, id);
        } else if (!this.flowSource()) {
          this.flowSource.set(this.flows.consume(this.route, { targetType: 'sja' }));
        }
      });
    });

    // Prefill from a create-from-here flow (may arrive after the form opened).
    effect(() => {
      const flow = this.flow();
      if (flow && !this.id()) {
        untracked(() => this.applyPrefill(flow.prefill));
      }
    });
  }

  private load(orgId: string | null, id: string): void {
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.api.getSja(orgId, id).subscribe({
      next: (sja) => this.fill(sja),
      error: () => this.state.set('error'),
    });
  }

  protected reload(): void {
    const id = this.id();
    if (id) {
      this.load(this.selectedOrg.currentOrgId(), id);
    }
  }

  private applyPrefill(prefill: Readonly<Record<string, unknown>>): void {
    const text = (key: string) =>
      typeof prefill[key] === 'string' ? (prefill[key] as string) : '';
    if (text('title') && !this.title()) {
      this.title.set(text('title'));
    }
    if (text('job_description') && !this.jobDescription()) {
      this.jobDescription.set(text('job_description'));
    }
    if (text('description') && !this.jobDescription()) {
      this.jobDescription.set(text('description'));
    }
    if (text('location') && !this.location()) {
      this.location.set(text('location'));
    }
  }

  private fill(sja: Sja): void {
    this.code.set(sja.code);
    this.title.set(sja.title);
    this.jobDescription.set(sja.job_description ?? '');
    this.location.set(sja.location ?? '');
    this.workStart.set(wireToLocalInput(sja.work_start_at));
    this.workEnd.set(wireToLocalInput(sja.work_end_at));
    this.ownerId.set(sja.owner?.id ?? '');
    this.ownerName.set(sja.owner?.name ?? null);
    this.departmentId.set(sja.department_id ?? '');
    this.participants.set({
      userIds: (sja.participant_users ?? []).map((u) => u.id),
      names: [...(sja.participants ?? [])],
    });
    this.knownParticipants.set(sja.participant_users ?? []);
    this.steps.set(sja.steps.length ? sja.steps.map((s) => stepDraft(s)) : [stepDraft()]);
    this.ppe.set([...sja.required_ppe]);
    this.riskLevel.set(sja.risk_level ?? '');
    this.residualRiskLevel.set(sja.residual_risk_level ?? '');
    this.emergency.set(sja.emergency_measures ?? '');
    this.state.set('ready');
    if (!sja.can_edit || !['draft', 'in_review'].includes(sja.status)) {
      // Approved / closed SJAs are locked (409 `sja_locked`): back to the record.
      this.notifications.info('hse.errors.sja_locked');
      void this.router.navigate(['/hse/sja', sja.id], { replaceUrl: true });
    }
  }

  protected stepPpeOnly(step: StepDraft): boolean {
    return ppeOnly(step.controls.filter((c) => c.text.trim()).map((c) => c.type));
  }

  protected addStep(): void {
    this.steps.update((steps) => [...steps, stepDraft()]);
  }

  protected removeStep(index: number): void {
    this.steps.update((steps) => {
      const next = steps.filter((_, i) => i !== index);
      return next.length ? next : [stepDraft()];
    });
  }

  protected move(index: number, delta: number): void {
    this.steps.update((steps) => {
      const target = index + delta;
      if (target < 0 || target >= steps.length) {
        return steps;
      }
      const next = [...steps];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  protected patchStep(index: number, patch: Partial<Omit<StepDraft, 'key'>>): void {
    this.steps.update((steps) =>
      steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
  }

  protected addControl(step: number): void {
    this.steps.update((steps) =>
      steps.map((s, i) => (i === step ? { ...s, controls: [...s.controls, controlDraft()] } : s)),
    );
  }

  protected removeControl(step: number, control: number): void {
    this.steps.update((steps) =>
      steps.map((s, i) => {
        if (i !== step) {
          return s;
        }
        const controls = s.controls.filter((_, ci) => ci !== control);
        return { ...s, controls: controls.length ? controls : [controlDraft()] };
      }),
    );
  }

  protected patchControl(
    step: number,
    control: number,
    patch: Partial<Omit<ControlDraft, 'key'>>,
  ): void {
    this.steps.update((steps) =>
      steps.map((s, i) =>
        i === step
          ? {
              ...s,
              controls: s.controls.map((c, ci) => (ci === control ? { ...c, ...patch } : c)),
            }
          : s,
      ),
    );
  }

  protected togglePpe(category: PpeCategory): void {
    this.ppe.update((list) =>
      list.includes(category) ? list.filter((c) => c !== category) : [...list, category],
    );
  }

  protected applySuggestions(data: unknown): void {
    const suggestion = data as HazardSuggestion | null;
    if (!suggestion || !Array.isArray(suggestion.steps)) {
      return;
    }
    const merged = mergeSuggestions(this.steps(), this.ppe(), suggestion);
    this.steps.set(merged.steps.length ? merged.steps : [stepDraft()]);
    this.ppe.set(merged.ppe);
    this.aiNotes.set(suggestion.notes || null);
    this.notifications.success('hse.sja.ai.applied', { count: suggestion.steps.length });
  }

  protected cancelFlow(): void {
    if (!this.id() && this.flow()) {
      this.flows.cancel();
    }
  }

  private fields(): SjaFields {
    const people = this.participants();
    return {
      title: this.title().trim(),
      job_description: textOrNull(this.jobDescription()),
      location: textOrNull(this.location()),
      work_start_at: localInputToWire(this.workStart()),
      work_end_at: localInputToWire(this.workEnd()),
      owner_user_id: this.ownerId() || null,
      department_id: this.departmentId() || null,
      participants: [...people.names],
      participant_user_ids: [...people.userIds],
      steps: stepsFromDrafts(this.steps()),
      required_ppe: this.ppe(),
      risk_level: this.riskLevel() || null,
      residual_risk_level: this.residualRiskLevel() || null,
      emergency_measures: textOrNull(this.emergency()),
    };
  }

  protected save(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.title().trim() || this.periodInvalid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const id = this.id();
    const fields = this.fields();
    const request = id
      ? this.api.updateSja(orgId, id, {
          ...fields,
          // The caller stays the owner unless one is chosen.
          owner_user_id: fields.owner_user_id ?? undefined,
          change_reason: textOrNull(this.changeReason()),
        })
      : this.api.createSja(orgId, {
          ...fields,
          title: fields.title ?? '',
          owner_user_id: fields.owner_user_id ?? undefined,
          related: this.related().length && !this.flow() ? this.related() : undefined,
        });
    request.subscribe({
      next: (sja) => {
        this.saving.set(false);
        this.notifications.success(id ? 'hse.common.saved' : 'hse.sja.created', {
          code: sja.code,
        });
        if (!id && this.flow()) {
          this.flows.complete(sja.id, 'sja').subscribe();
        }
        void this.router.navigate(['/hse/sja', sja.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}

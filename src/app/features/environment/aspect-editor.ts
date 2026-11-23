import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService, FlowContext } from '../../core/kit/create-flow.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FormActions } from '../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../shared/ui/form-section/form-section';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { EnvironmentApi } from './data/environment-api';
import {
  ASSIST_SUGGEST_ASPECTS,
  Aspect,
  CONDITIONS,
  CONTROL_LEVELS,
  ENTITY_ASPECT,
  ENTITY_OBLIGATION,
  ENTITY_PROCESS,
  IMPACT_TYPES,
  LIFECYCLE_STAGES,
  LifecycleStage,
  RECORD_STATUSES,
  ScoringMethod,
  SuggestedAspect,
} from './data/environment.models';
import {
  criterionLabel,
  levelText,
  localText,
  previewScore,
  scaleValues,
} from './data/environment-display';
import { environmentErrorKey, fieldErrors } from './data/environment-errors';
import {
  AspectFormValue,
  OverrideChoice,
  PickedRecord,
  aspectFormFrom,
  aspectFormFromSuggestion,
  emptyAspectForm,
  toAspectCreate,
  toAspectUpdate,
  validateAspectForm,
} from './data/form-models';
import {
  ENV_CRUMBS,
  ENV_MODULE,
  ENV_ROOT_CRUMB,
  EnvDirectorySelect,
  EnvField,
  injectEnvPermissions,
} from './environment-shared';
import { EnvRecordPicker } from './record-picker';

/** Normalise the `environment.suggest_aspects` result (drops malformed rows). */
export function suggestionsFrom(result: unknown): SuggestedAspect[] {
  const list = (result as { aspects?: unknown } | null)?.aspects;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((s): s is SuggestedAspect => !!s && typeof (s as SuggestedAspect).aspect === 'string')
    .map((s) => ({
      aspect: s.aspect,
      impact: typeof s.impact === 'string' ? s.impact : '',
      impact_type: (IMPACT_TYPES as readonly string[]).includes(s.impact_type)
        ? s.impact_type
        : 'other',
      condition: (CONDITIONS as readonly string[]).includes(s.condition) ? s.condition : 'normal',
      lifecycle_stages: Array.isArray(s.lifecycle_stages)
        ? s.lifecycle_stages.filter((x) => (LIFECYCLE_STAGES as readonly string[]).includes(x))
        : [],
      suggested_controls: typeof s.suggested_controls === 'string' ? s.suggested_controls : '',
      rationale: typeof s.rationale === 'string' ? s.rationale : '',
    }));
}

/** Form values a create-from-here prefill may set (strings and ids only). */
export function aspectPrefill(
  form: AspectFormValue,
  prefill: Readonly<Record<string, unknown>>,
): AspectFormValue {
  const str = (key: string) => (typeof prefill[key] === 'string' ? (prefill[key] as string) : null);
  return {
    ...form,
    activity: str('activity') ?? form.activity,
    aspect: str('aspect') ?? str('title') ?? form.aspect,
    impact: str('impact') ?? str('description') ?? form.impact,
    site: str('site') ?? form.site,
  };
}

/**
 * Create (`/environment/aspects/new`) or edit (`/environment/aspects/:id/edit`) an
 * environmental aspect. The activity can be tied to a process; the assistant can
 * suggest aspects for it. Required fields are marked; the type of impact has no
 * default. Each criterion's score options say what the score means, and the live
 * preview reads "Poeng 9 av 20 · vesentlig fra 12". Obligations from "Lover og
 * forskrifter" replace the old yes/no "legal requirement" box. Save sits
 * bottom-right (sticky on phones).
 */
@Component({
  selector: 'app-env-aspect-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalNumberPipe,
    AiAssistButton,
    AskAbout,
    FlowBanner,
    Button,
    DateInput,
    ErrorState,
    FormActions,
    FormSection,
    HelpStrip,
    LoadingState,
    PageHeader,
    StatusBadge,
    EnvDirectorySelect,
    EnvField,
    EnvRecordPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div>
        <app-page-header
          [titleKey]="id() ? 'environment.aspect.editTitle' : 'environment.aspect.newTitle'"
          [titleParams]="{ code: original()?.code ?? '' }"
          [breadcrumbs]="breadcrumbs()"
          titleTestId="aspect-form-title"
        />
        <app-help-strip scope="environment" page="aspectForm" lesson="aspects-and-impacts" />

        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="6" />
          }
          @case ('error') {
            <app-error-state [bodyKey]="errorKey()" (retry)="reload()" />
          }
          @default {
            <app-flow-banner [flow]="flow()" (cancelled)="cancelFlow()" />
            <form
              class="flex flex-col gap-5"
              (submit)="$event.preventDefault(); submit()"
              novalidate
            >
              <app-form-section
                [title]="'environment.aspect.sections.identify' | transloco"
                [description]="'environment.aspect.sections.identifyHint' | transloco"
              >
                <app-env-field
                  class="sm:col-span-2"
                  labelKey="environment.fields.activity"
                  inputId="cf-env-activity"
                  help="activity"
                  [required]="true"
                  [errorKey]="shown()['activity']"
                >
                  <input
                    id="cf-env-activity"
                    type="text"
                    maxlength="255"
                    required
                    [value]="form().activity"
                    (input)="set('activity', $any($event.target).value)"
                    [attr.aria-invalid]="!!shown()['activity']"
                    data-testid="aspect-activity"
                  />
                </app-env-field>

                @if (perms.has('processes:read')()) {
                  <app-env-field
                    class="sm:col-span-2"
                    labelKey="environment.fields.process"
                    inputId="cf-env-process"
                    help="process"
                    hintKey="environment.aspect.processHint"
                    [legend]="true"
                  >
                    <app-env-record-picker
                      [entityType]="processType"
                      [multiple]="false"
                      [value]="processValue()"
                      inputId="cf-env-process"
                      placeholderKey="environment.picker.processPlaceholder"
                      describedBy="cf-env-process-hint"
                      testId="aspect-process"
                      (valueChange)="setProcess($event)"
                    />
                  </app-env-field>
                }

                @if (!id()) {
                  <div
                    class="flex flex-col gap-2 rounded-card border border-accent-border bg-accent-soft p-3 sm:col-span-2"
                  >
                    <p class="text-ui text-fg-muted">
                      {{ 'environment.aspect.suggestHint' | transloco }}
                    </p>
                    <div>
                      <app-ai-assist-button
                        [assist]="suggestAssist"
                        labelKey="environment.aspect.suggest"
                        [input]="suggestInput()"
                        [disabled]="!form().activity.trim()"
                        (result)="onSuggestions($event)"
                        data-testid="suggest-aspects"
                      />
                    </div>
                    @if (suggestions().length) {
                      <ul class="flex flex-col gap-2" data-testid="aspect-suggestions">
                        @for (s of suggestions(); track $index) {
                          <li class="rounded-tile border border-border bg-surface p-3">
                            <div class="flex flex-wrap items-start justify-between gap-2">
                              <div class="min-w-0 flex-1">
                                <p class="text-body font-semibold text-fg">{{ s.aspect }}</p>
                                <p class="text-ui text-fg-muted">{{ s.impact }}</p>
                                <p class="mt-1 text-meta text-fg-subtle">
                                  {{ 'environment.impactTypes.' + s.impact_type | transloco }}
                                  ·
                                  {{ 'environment.conditions.' + s.condition | transloco }}
                                </p>
                                @if (s.rationale) {
                                  <p class="mt-1 text-meta text-fg-subtle italic">
                                    {{ s.rationale }}
                                  </p>
                                }
                              </div>
                              <app-button size="sm" variant="secondary" (click)="useSuggestion(s)">
                                {{ 'environment.aspect.useSuggestion' | transloco }}
                              </app-button>
                            </div>
                          </li>
                        }
                      </ul>
                    } @else if (suggestionsEmpty()) {
                      <p class="text-ui text-fg-muted">
                        {{ 'environment.aspect.noSuggestions' | transloco }}
                      </p>
                    }
                  </div>
                }

                <app-env-field
                  class="sm:col-span-2"
                  labelKey="environment.fields.aspect"
                  inputId="cf-env-aspect"
                  help="aspect"
                  [required]="true"
                  [errorKey]="shown()['aspect']"
                >
                  <app-ask-about
                    label-extra
                    [prompt]="'environment.ask.aspectField' | transloco"
                    field="aspect"
                    [fieldLabel]="'environment.fields.aspect' | transloco"
                    [requirements]="['iso14001:6.1.2']"
                  />
                  <input
                    id="cf-env-aspect"
                    type="text"
                    maxlength="255"
                    required
                    [value]="form().aspect"
                    (input)="set('aspect', $any($event.target).value)"
                    [attr.aria-invalid]="!!shown()['aspect']"
                    data-testid="aspect-aspect"
                  />
                </app-env-field>
                <app-env-field
                  class="sm:col-span-2"
                  labelKey="environment.fields.impact"
                  inputId="cf-env-impact"
                  help="impact"
                >
                  <textarea
                    id="cf-env-impact"
                    rows="3"
                    maxlength="20000"
                    [value]="form().impact"
                    (input)="set('impact', $any($event.target).value)"
                  ></textarea>
                </app-env-field>
                <app-env-field
                  labelKey="environment.fields.impactType"
                  inputId="cf-env-itype"
                  [required]="true"
                  [errorKey]="shown()['impact_type']"
                >
                  <select
                    id="cf-env-itype"
                    (change)="set('impact_type', $any($event.target).value)"
                    [attr.aria-invalid]="!!shown()['impact_type']"
                    data-testid="aspect-impact-type"
                  >
                    <option value="" disabled [selected]="!form().impact_type">
                      {{ 'environment.form.choose' | transloco }}
                    </option>
                    @for (t of impactTypes; track t) {
                      <option [value]="t" [selected]="form().impact_type === t">
                        {{ 'environment.impactTypes.' + t | transloco }}
                      </option>
                    }
                  </select>
                </app-env-field>
                <app-env-field
                  labelKey="environment.fields.condition"
                  inputId="cf-env-cond"
                  help="condition"
                >
                  <select id="cf-env-cond" (change)="set('condition', $any($event.target).value)">
                    @for (c of conditions; track c) {
                      <option [value]="c" [selected]="form().condition === c">
                        {{ 'environment.conditions.' + c | transloco }}
                      </option>
                    }
                  </select>
                </app-env-field>
                <app-env-field
                  labelKey="environment.fields.controlLevel"
                  inputId="cf-env-ctrl"
                  help="control_level"
                >
                  <select
                    id="cf-env-ctrl"
                    (change)="set('control_level', $any($event.target).value)"
                  >
                    @for (c of controlLevels; track c) {
                      <option [value]="c" [selected]="form().control_level === c">
                        {{ 'environment.controlLevels.' + c | transloco }}
                      </option>
                    }
                  </select>
                </app-env-field>
                <app-env-field labelKey="environment.fields.site" inputId="cf-env-site">
                  <input
                    id="cf-env-site"
                    type="text"
                    maxlength="128"
                    [value]="form().site"
                    (input)="set('site', $any($event.target).value)"
                  />
                </app-env-field>
                <app-env-field
                  class="sm:col-span-2"
                  labelKey="environment.fields.lifecycleStages"
                  inputId="cf-env-stages"
                  help="lifecycle_stages"
                  hintKey="environment.aspect.stagesHint"
                  [legend]="true"
                >
                  <div
                    class="grid grid-cols-2 gap-2 sm:grid-cols-3"
                    role="group"
                    aria-labelledby="cf-env-stages-label"
                    aria-describedby="cf-env-stages-hint"
                  >
                    @for (s of stages; track s) {
                      <label
                        class="flex min-h-10 cursor-pointer items-center gap-2 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg"
                      >
                        <input
                          type="checkbox"
                          class="h-4 w-4 accent-[var(--accent)]"
                          [checked]="form().lifecycle_stages.includes(s)"
                          (change)="toggleStage(s, $any($event.target).checked)"
                        />
                        {{ 'environment.stages.' + s | transloco }}
                      </label>
                    }
                  </div>
                </app-env-field>
              </app-form-section>

              <app-form-section
                [title]="'environment.aspect.sections.evaluate' | transloco"
                [description]="'environment.aspect.sections.evaluateHint' | transloco"
              >
                <app-ask-about
                  section-actions
                  [prompt]="'environment.ask.scoring' | transloco"
                  field="scores"
                  [fieldLabel]="'environment.fields.scores' | transloco"
                  [requirements]="['iso14001:6.1.2']"
                />
                @if (method(); as m) {
                  <p class="text-ui text-fg-muted sm:col-span-2">
                    {{
                      'environment.aspect.methodSummary.' + m.method
                        | transloco
                          : {
                              min: m.scale_min,
                              max: m.scale_max,
                              threshold: (m.threshold | localNumber: '1.0-2'),
                            }
                    }}
                  </p>
                  @for (c of m.criteria; track c.key) {
                    <app-env-field
                      [labelKey]="'environment.aspect.criterionLabel'"
                      [labelParams]="{ label: label(c) }"
                      [inputId]="'cf-env-score-' + c.key"
                      [errorKey]="
                        serverErrors()[c.key] ? 'environment.errors.invalid_scores' : null
                      "
                    >
                      <select
                        [id]="'cf-env-score-' + c.key"
                        (change)="setScore(c.key, $any($event.target).value)"
                        [attr.aria-invalid]="!!serverErrors()[c.key]"
                        [attr.aria-describedby]="
                          description(c) ? 'cf-env-score-' + c.key + '-desc' : null
                        "
                        [attr.data-testid]="'score-' + c.key"
                      >
                        <option
                          value=""
                          [selected]="
                            form().scores[c.key] === null || form().scores[c.key] === undefined
                          "
                        >
                          {{ 'environment.aspect.notScored' | transloco }}
                        </option>
                        @for (v of scale(); track v) {
                          <option [value]="v" [selected]="form().scores[c.key] === v">
                            {{ optionText(c, v) }}
                          </option>
                        }
                      </select>
                      @if (description(c); as d) {
                        <p
                          class="text-meta leading-snug text-fg-subtle"
                          [id]="'cf-env-score-' + c.key + '-desc'"
                        >
                          {{ d }}
                        </p>
                      }
                      @if (m.method === 'sum' && c.weight !== 1) {
                        <p class="text-meta leading-snug text-fg-subtle">
                          {{ 'environment.aspect.weight' | transloco: { weight: c.weight } }}
                        </p>
                      }
                    </app-env-field>
                  }
                  <div
                    class="flex flex-wrap items-center gap-2 rounded-tile bg-surface-2 px-3 py-2.5 text-ui sm:col-span-2"
                    aria-live="polite"
                    data-testid="score-preview"
                  >
                    @if (preview() !== null) {
                      <span class="font-semibold text-fg">
                        {{
                          'environment.aspect.scoreLine'
                            | transloco
                              : {
                                  score: (preview() | localNumber: '1.0-2'),
                                  max: (m.max_score | localNumber: '1.0-2'),
                                  threshold: (m.threshold | localNumber: '1.0-2'),
                                }
                        }}
                      </span>
                    } @else {
                      <span class="text-fg-muted">{{
                        'environment.aspect.scoreIncomplete' | transloco
                      }}</span>
                    }
                    @if (previewSignificant()) {
                      <app-status-badge
                        meaning="severity"
                        value="medium"
                        labelKey="environment.aspect.significant"
                      />
                    } @else if (preview() !== null) {
                      <app-status-badge
                        meaning="severity"
                        value="low"
                        labelKey="environment.aspect.notSignificant"
                      />
                    }
                  </div>
                }

                <app-env-field
                  labelKey="environment.fields.override"
                  inputId="cf-env-override"
                  help="override"
                >
                  <select
                    id="cf-env-override"
                    (change)="setOverride($any($event.target).value)"
                    data-testid="aspect-override"
                  >
                    @for (o of overrides; track o) {
                      <option [value]="o" [selected]="form().override === o">
                        {{ 'environment.overrides.' + (o || 'none') | transloco }}
                      </option>
                    }
                  </select>
                </app-env-field>
                @if (form().override) {
                  <app-env-field
                    labelKey="environment.fields.overrideReason"
                    inputId="cf-env-override-reason"
                    [required]="true"
                    [errorKey]="shown()['override_reason']"
                  >
                    <input
                      id="cf-env-override-reason"
                      type="text"
                      maxlength="2000"
                      [value]="form().override_reason"
                      (input)="set('override_reason', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['override_reason']"
                      data-testid="aspect-override-reason"
                    />
                  </app-env-field>
                }
              </app-form-section>

              <app-form-section
                id="obligations"
                [title]="'environment.aspect.sections.obligations' | transloco"
                [description]="'environment.aspect.obligationsFormHint' | transloco"
                [columns]="1"
              >
                @if (perms.has('obligations:read')()) {
                  <app-env-field
                    labelKey="environment.fields.obligations"
                    inputId="cf-env-obligations"
                    help="obligations"
                    [legend]="true"
                  >
                    <app-env-record-picker
                      [entityType]="obligationType"
                      [value]="form().obligations"
                      inputId="cf-env-obligations"
                      labelledBy="cf-env-obligations-label"
                      placeholderKey="environment.picker.obligationPlaceholder"
                      testId="aspect-obligations"
                      (valueChange)="set('obligations', $event)"
                    />
                  </app-env-field>
                  @if (!form().obligations.length) {
                    <p class="-mt-3 text-meta text-fg-subtle">
                      {{ 'environment.aspect.noObligationsYet' | transloco }}
                      <a
                        routerLink="/obligations"
                        class="font-semibold text-accent hover:underline"
                        >{{ 'environment.aspect.openObligations' | transloco }}</a
                      >
                    </p>
                  }
                } @else {
                  <p class="text-ui text-fg-muted">
                    {{ 'environment.aspect.obligationsNoAccess' | transloco }}
                  </p>
                }
              </app-form-section>

              <app-form-section
                [title]="'environment.aspect.sections.control' | transloco"
                [description]="'environment.aspect.sections.controlHint' | transloco"
              >
                <app-env-field
                  class="sm:col-span-2"
                  labelKey="environment.fields.operationalControls"
                  inputId="cf-env-controls"
                  help="operational_controls"
                  hintKey="environment.aspect.controlsFormHint"
                >
                  <app-ask-about
                    label-extra
                    [prompt]="'environment.ask.controlsField' | transloco"
                    field="operational_controls"
                    [fieldLabel]="'environment.fields.operationalControls' | transloco"
                    [requirements]="['iso14001:8.1']"
                  />
                  <textarea
                    id="cf-env-controls"
                    rows="4"
                    maxlength="20000"
                    aria-describedby="cf-env-controls-hint"
                    [value]="form().operational_controls"
                    (input)="set('operational_controls', $any($event.target).value)"
                  ></textarea>
                </app-env-field>
                <app-env-field labelKey="environment.fields.owner" inputId="cf-env-a-owner">
                  <app-env-directory-select
                    inputId="cf-env-a-owner"
                    [value]="form().owner_user_id"
                    [currentName]="original()?.owner_name ?? null"
                    (valueChange)="set('owner_user_id', $event)"
                  />
                </app-env-field>
                <app-env-field labelKey="environment.fields.department" inputId="cf-env-a-dept">
                  <app-env-directory-select
                    kind="department"
                    inputId="cf-env-a-dept"
                    noneKey="environment.form.noDepartment"
                    [value]="form().department_id"
                    (valueChange)="set('department_id', $event)"
                  />
                </app-env-field>
                <app-env-field
                  labelKey="environment.fields.status"
                  inputId="cf-env-a-status"
                  help="status"
                >
                  <select id="cf-env-a-status" (change)="set('status', $any($event.target).value)">
                    @for (s of statuses; track s) {
                      <option [value]="s" [selected]="form().status === s">
                        {{ 'environment.status.' + s | transloco }}
                      </option>
                    }
                  </select>
                </app-env-field>
                <app-env-field
                  labelKey="environment.fields.reviewDue"
                  inputId="cf-env-a-review"
                  help="review_due_at"
                >
                  <app-date-input
                    inputId="cf-env-a-review"
                    [value]="form().review_due"
                    (valueChange)="set('review_due', $event ?? '')"
                  />
                </app-env-field>
              </app-form-section>

              @if (id()) {
                <app-form-section [columns]="1">
                  <app-env-field
                    labelKey="environment.fields.changeReason"
                    inputId="cf-env-a-reason"
                    hintKey="environment.form.changeReasonHint"
                  >
                    <input
                      id="cf-env-a-reason"
                      type="text"
                      maxlength="2000"
                      aria-describedby="cf-env-a-reason-hint"
                      [value]="changeReason()"
                      (input)="changeReason.set($any($event.target).value)"
                    />
                  </app-env-field>
                </app-form-section>
              }

              <app-form-actions
                [message]="
                  attempted() && errorCount()
                    ? ('environment.form.fixErrors' | transloco: { count: errorCount() })
                    : ''
                "
              >
                <app-button variant="secondary" (click)="back()">
                  {{ 'common.cancel' | transloco }}
                </app-button>
                <app-button
                  type="submit"
                  [loading]="saving()"
                  [disabled]="saving()"
                  data-testid="aspect-save"
                >
                  {{ (id() ? 'common.save' : 'environment.aspect.create') | transloco }}
                </app-button>
              </app-form-actions>
            </form>
          }
        }
      </div>
    </div>
  `,
})
export class AspectEditor {
  private readonly api = inject(EnvironmentApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flows = inject(CreateFlowService);

  /** Route parameter; absent on `new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly perms = injectEnvPermissions();
  protected readonly suggestAssist = ASSIST_SUGGEST_ASPECTS;
  protected readonly impactTypes = IMPACT_TYPES;
  protected readonly conditions = CONDITIONS;
  protected readonly controlLevels = CONTROL_LEVELS;
  protected readonly stages = LIFECYCLE_STAGES;
  protected readonly statuses = RECORD_STATUSES;
  protected readonly obligationType = ENTITY_OBLIGATION;
  protected readonly processType = ENTITY_PROCESS;
  protected readonly overrides: readonly OverrideChoice[] = ['', 'significant', 'not_significant'];

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('ui.error.body');
  protected readonly method = signal<ScoringMethod | null>(null);
  protected readonly original = signal<Aspect | null>(null);
  private readonly seed = signal<AspectFormValue | null>(null);
  protected readonly form = signal<AspectFormValue>(emptyAspectForm());
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly serverErrors = signal<Readonly<Record<string, string>>>({});
  protected readonly suggestions = signal<readonly SuggestedAspect[]>([]);
  protected readonly suggestionsEmpty = signal(false);

  /** The "create from here" flow (or `?fromRequirement=`) this new form was opened with. */
  private readonly flowSource = signal<Signal<FlowContext | null> | null>(null);
  protected readonly flow = computed(() => this.flowSource()?.() ?? null);

  protected readonly errors = computed(() => validateAspectForm(this.form()));
  protected readonly shown = computed(() => (this.attempted() ? this.errors() : {}));
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);
  protected readonly processValue = computed(() => {
    const p = this.form().process;
    return p ? [p] : [];
  });

  protected readonly breadcrumbs = computed(() => {
    const a = this.original();
    return a
      ? [
          ENV_ROOT_CRUMB,
          ENV_CRUMBS.aspects,
          { label: a.code, link: ['/environment/aspects', a.id] },
          { labelKey: 'environment.common.edit' },
        ]
      : [ENV_ROOT_CRUMB, ENV_CRUMBS.aspects, { labelKey: 'environment.aspect.newTitle' }];
  });

  protected readonly scale = computed(() => {
    const m = this.method();
    return m ? scaleValues(m) : [];
  });

  protected readonly preview = computed(() => {
    const m = this.method();
    return m ? previewScore(m, this.form().scores) : null;
  });

  protected readonly previewSignificant = computed(() => {
    const m = this.method();
    const f = this.form();
    if (!m) {
      return false;
    }
    if (f.override) {
      return f.override === 'significant';
    }
    const score = this.preview();
    return (
      (score !== null && score >= m.threshold) ||
      (f.obligations.length > 0 && m.legal_requirement_significant) ||
      (f.condition === 'emergency' && m.emergency_significant)
    );
  });

  protected readonly suggestInput = computed(() => ({
    activity: this.form().activity.trim(),
    site: this.form().site.trim() || undefined,
    lifecycle_stages: this.form().lifecycle_stages,
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: ENV_MODULE,
      entityType: ENTITY_ASPECT,
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.aspect ?? this.language.translate('environment.aspect.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    // Prefill from a create-from-here flow (may arrive after the form opened).
    effect(() => {
      const flow = this.flow();
      if (flow && !this.id()) {
        untracked(() => this.form.update((f) => aspectPrefill(f, flow.prefill)));
      }
    });
  }

  protected label(c: ScoringMethod['criteria'][number]): string {
    return criterionLabel(c, this.language.active());
  }

  protected description(c: ScoringMethod['criteria'][number]): string {
    return localText(c.description, this.language.active());
  }

  /** "3 – Merkbar påvirkning som går over av seg selv" (or just "3"). */
  protected optionText(c: ScoringMethod['criteria'][number], value: number): string {
    const text = levelText(c, value, this.language.active());
    return text ? `${value} – ${text}` : String(value);
  }

  protected set<K extends keyof AspectFormValue>(key: K, value: AspectFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setProcess(value: readonly PickedRecord[]): void {
    this.set('process', value[0] ?? null);
  }

  protected setScore(key: string, raw: string): void {
    const value = raw === '' ? null : Number(raw);
    this.form.update((f) => ({ ...f, scores: { ...f.scores, [key]: value } }));
    this.serverErrors.update((e) =>
      Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)),
    );
  }

  protected setOverride(value: string): void {
    const choice = this.overrides.includes(value as OverrideChoice)
      ? (value as OverrideChoice)
      : '';
    this.set('override', choice);
  }

  protected toggleStage(stage: LifecycleStage, on: boolean): void {
    this.form.update((f) => ({
      ...f,
      lifecycle_stages: on
        ? LIFECYCLE_STAGES.filter((s) => s === stage || f.lifecycle_stages.includes(s))
        : f.lifecycle_stages.filter((s) => s !== stage),
    }));
  }

  protected onSuggestions(result: unknown): void {
    const list = suggestionsFrom(result);
    this.suggestions.set(list);
    this.suggestionsEmpty.set(list.length === 0);
  }

  protected useSuggestion(s: SuggestedAspect): void {
    this.form.set(aspectFormFromSuggestion(this.form(), s));
    this.notifications.info('environment.aspect.suggestionApplied');
  }

  protected cancelFlow(): void {
    this.flows.cancel();
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected submit(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || this.errorCount()) {
      return;
    }
    const id = this.id();
    const seed = this.seed();
    if (id && seed) {
      const body = toAspectUpdate(seed, this.form(), this.changeReason());
      if (Object.keys(body).filter((k) => k !== 'change_reason').length === 0) {
        this.notifications.info('environment.notices.noChanges');
        this.back();
        return;
      }
      this.saving.set(true);
      this.api.updateAspect(orgId, id, body).subscribe({
        next: () => this.saved(id, 'environment.notices.saved'),
        error: (error: unknown) => this.failed(error),
      });
      return;
    }
    this.saving.set(true);
    this.api.createAspect(orgId, toAspectCreate(this.form())).subscribe({
      next: (a) => {
        if (this.flow()) {
          this.flows.complete(a.id, ENTITY_ASPECT).subscribe();
        }
        this.saved(a.id, 'environment.notices.created', a.code);
      },
      error: (error: unknown) => this.failed(error),
    });
  }

  protected back(): void {
    const id = this.id();
    if (!id && this.flow()) {
      this.flows.cancel();
    }
    void this.router.navigate(id ? ['/environment/aspects', id] : ['/environment/aspects']);
  }

  private saved(id: string, key: string, code?: string): void {
    this.saving.set(false);
    this.notifications.success(key, code ? { code } : undefined);
    void this.router.navigate(['/environment/aspects', id]);
  }

  private failed(error: unknown): void {
    this.saving.set(false);
    this.serverErrors.set(fieldErrors(error));
    this.notifications.error(environmentErrorKey(error));
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.scoring(orgId).subscribe({
      next: (method) => {
        this.method.set(method);
        if (!id) {
          const me = this.auth.user()?.id ?? '';
          this.form.set(emptyAspectForm({ owner_user_id: me }));
          if (!this.flowSource()) {
            this.flowSource.set(this.flows.consume(this.route, { targetType: ENTITY_ASPECT }));
          }
          this.state.set('ready');
          return;
        }
        this.request = this.api.getAspect(orgId, id).subscribe({
          next: (aspect) => {
            const value = aspectFormFrom(aspect);
            this.original.set(aspect);
            this.seed.set(value);
            this.form.set(value);
            this.state.set('ready');
          },
          error: (error: unknown) => this.loadFailed(error),
        });
      },
      error: (error: unknown) => this.loadFailed(error),
    });
  }

  private loadFailed(error: unknown): void {
    this.errorKey.set(environmentErrorKey(error));
    this.state.set('error');
  }
}

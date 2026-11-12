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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { EnvironmentApi } from './data/environment-api';
import {
  ASSIST_SUGGEST_ASPECTS,
  Aspect,
  CONDITIONS,
  CONTROL_LEVELS,
  IMPACT_TYPES,
  LIFECYCLE_STAGES,
  LifecycleStage,
  RECORD_STATUSES,
  ScoringMethod,
  SuggestedAspect,
} from './data/environment.models';
import { criterionLabel, previewScore } from './data/environment-display';
import { environmentErrorKey, fieldErrors } from './data/environment-errors';
import {
  AspectFormValue,
  OverrideChoice,
  aspectFormFrom,
  aspectFormFromSuggestion,
  emptyAspectForm,
  toAspectCreate,
  toAspectUpdate,
  validateAspectForm,
} from './data/form-models';
import { EnvOwnerFields } from './owner-fields';

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

/**
 * Create (`/environment/aspects/new`) or edit (`/environment/aspects/:id/edit`)
 * an environmental aspect: the activity and its aspect and impact, condition and
 * lifecycle stages, the significance scores under the org's method (with a live
 * score preview), an optional manual override with a reason, and the operational
 * controls. On create, the assistant can suggest aspects for an activity.
 */
@Component({
  selector: 'app-env-aspect-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalNumberPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Badge,
    Button,
    Card,
    FormField,
    Icon,
    EnvOwnerFields,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/environment/aspects', id()] : '/environment/aspects'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'environment.common.backToRecord' : 'environment.aspects.back') | transloco }}
      </a>
      <h1
        class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
        data-testid="aspect-form-title"
      >
        @if (original(); as a) {
          {{ 'environment.aspect.editTitle' | transloco: { code: a.code } }}
        } @else {
          {{ 'environment.aspect.newTitle' | transloco }}
        }
      </h1>
      <div class="mb-5"><app-guide-intro scope="environment" page="aspectForm" /></div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'environment.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
        }
        @default {
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
            <app-card>
              <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
                {{ 'environment.aspect.sections.identify' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'environment.fields.activity' | transloco"
                    inputId="cf-env-activity"
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
                  </app-form-field>
                  @if (shown()['activity']; as key) {
                    <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                  }
                  <app-field-help scope="environment" page="aspectForm" field="activity" />
                </div>

                @if (!id()) {
                  <div class="sm:col-span-2">
                    <div
                      class="flex flex-col gap-2 rounded-card border border-accent-border bg-accent-soft p-3"
                    >
                      <p class="text-[13px] text-fg-muted">
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
                                  <p class="text-[13.5px] font-semibold text-fg">{{ s.aspect }}</p>
                                  <p class="text-[12.5px] text-fg-muted">{{ s.impact }}</p>
                                  <p
                                    class="mt-1 flex flex-wrap gap-1.5 text-[11.5px] text-fg-subtle"
                                  >
                                    <span>{{
                                      'environment.impactTypes.' + s.impact_type | transloco
                                    }}</span>
                                    <span>·</span>
                                    <span>{{
                                      'environment.conditions.' + s.condition | transloco
                                    }}</span>
                                  </p>
                                  @if (s.rationale) {
                                    <p class="mt-1 text-[12px] text-fg-subtle italic">
                                      {{ s.rationale }}
                                    </p>
                                  }
                                </div>
                                <app-button
                                  size="sm"
                                  variant="secondary"
                                  (click)="useSuggestion(s)"
                                >
                                  {{ 'environment.aspect.useSuggestion' | transloco }}
                                </app-button>
                              </div>
                            </li>
                          }
                        </ul>
                      } @else if (suggestionsEmpty()) {
                        <p class="text-[12.5px] text-fg-muted">
                          {{ 'environment.aspect.noSuggestions' | transloco }}
                        </p>
                      }
                    </div>
                  </div>
                }

                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'environment.fields.aspect' | transloco"
                    inputId="cf-env-aspect"
                  >
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
                  </app-form-field>
                  @if (shown()['aspect']; as key) {
                    <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                  }
                  <app-field-help scope="environment" page="aspectForm" field="aspect" />
                </div>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'environment.fields.impact' | transloco"
                    inputId="cf-env-impact"
                  >
                    <textarea
                      id="cf-env-impact"
                      rows="3"
                      maxlength="20000"
                      [value]="form().impact"
                      (input)="set('impact', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                  <app-field-help scope="environment" page="aspectForm" field="impact" />
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.impactType' | transloco"
                    inputId="cf-env-itype"
                  >
                    <select
                      id="cf-env-itype"
                      (change)="set('impact_type', $any($event.target).value)"
                    >
                      @for (t of impactTypes; track t) {
                        <option [value]="t" [selected]="form().impact_type === t">
                          {{ 'environment.impactTypes.' + t | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.condition' | transloco"
                    inputId="cf-env-cond"
                  >
                    <select id="cf-env-cond" (change)="set('condition', $any($event.target).value)">
                      @for (c of conditions; track c) {
                        <option [value]="c" [selected]="form().condition === c">
                          {{ 'environment.conditions.' + c | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  <app-field-help scope="environment" page="aspectForm" field="condition" />
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.controlLevel' | transloco"
                    inputId="cf-env-ctrl"
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
                  </app-form-field>
                  <app-field-help scope="environment" page="aspectForm" field="control_level" />
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.site' | transloco"
                    inputId="cf-env-site"
                  >
                    <input
                      id="cf-env-site"
                      type="text"
                      maxlength="128"
                      [value]="form().site"
                      (input)="set('site', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
                <fieldset class="sm:col-span-2">
                  <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                    {{ 'environment.fields.lifecycleStages' | transloco }}
                  </legend>
                  <div class="flex flex-wrap gap-x-4 gap-y-2">
                    @for (s of stages; track s) {
                      <label class="inline-flex items-center gap-2 text-[13px] text-fg">
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
                  <app-field-help scope="environment" page="aspectForm" field="lifecycle_stages" />
                </fieldset>
              </div>
            </app-card>

            <app-card>
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 class="font-display text-[16px] font-bold text-fg">
                  {{ 'environment.aspect.sections.evaluate' | transloco }}
                </h2>
                <app-ask-about [prompt]="'environment.ask.scoring' | transloco" field="scores" />
              </div>
              @if (method(); as m) {
                <p class="mb-3 text-[12.5px] text-fg-muted">
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
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  @for (c of m.criteria; track c.key) {
                    <div>
                      <app-form-field [label]="label(c)" [inputId]="'cf-env-score-' + c.key">
                        <select
                          [id]="'cf-env-score-' + c.key"
                          (change)="setScore(c.key, $any($event.target).value)"
                          [attr.aria-invalid]="!!serverErrors()[c.key]"
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
                              {{ v }}
                            </option>
                          }
                        </select>
                      </app-form-field>
                      @if (m.method === 'sum' && c.weight !== 1) {
                        <p class="mt-1 text-[11.5px] text-fg-subtle">
                          {{ 'environment.aspect.weight' | transloco: { weight: c.weight } }}
                        </p>
                      }
                    </div>
                  }
                </div>
                <app-field-help scope="environment" page="aspectForm" field="scores" />
                <div
                  class="mt-3 flex flex-wrap items-center gap-2 text-[13px]"
                  aria-live="polite"
                  data-testid="score-preview"
                >
                  @if (preview() !== null) {
                    <span class="font-semibold text-fg">
                      {{
                        'environment.aspect.scoreOf'
                          | transloco
                            : {
                                score: (preview() | localNumber: '1.0-2'),
                                max: (m.max_score | localNumber: '1.0-2'),
                              }
                      }}
                    </span>
                    @if (previewSignificant()) {
                      <app-badge tone="warn">{{
                        'environment.aspect.significant' | transloco
                      }}</app-badge>
                    } @else {
                      <app-badge tone="neutral">{{
                        'environment.aspect.notSignificant' | transloco
                      }}</app-badge>
                    }
                  } @else {
                    <span class="text-fg-muted">{{
                      'environment.aspect.scoreIncomplete' | transloco
                    }}</span>
                  }
                </div>
              }

              <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-1 sm:col-span-2">
                  <label class="flex items-center gap-2 text-[13.5px] text-fg">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="form().legal_requirement"
                      (change)="set('legal_requirement', $any($event.target).checked)"
                      data-testid="aspect-legal"
                    />
                    {{ 'environment.fields.legalRequirement' | transloco }}
                  </label>
                  <app-field-help scope="environment" page="aspectForm" field="legal_requirement" />
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.override' | transloco"
                    inputId="cf-env-override"
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
                  </app-form-field>
                  <app-field-help scope="environment" page="aspectForm" field="override" />
                </div>
                @if (form().override) {
                  <div>
                    <app-form-field
                      [label]="'environment.fields.overrideReason' | transloco"
                      inputId="cf-env-override-reason"
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
                    </app-form-field>
                    @if (shown()['override_reason']; as key) {
                      <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                    }
                  </div>
                }
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
                {{ 'environment.aspect.sections.control' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'environment.fields.operationalControls' | transloco"
                    inputId="cf-env-controls"
                  >
                    <textarea
                      id="cf-env-controls"
                      rows="4"
                      maxlength="20000"
                      [value]="form().operational_controls"
                      (input)="set('operational_controls', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                  <app-field-help
                    scope="environment"
                    page="aspectForm"
                    field="operational_controls"
                  />
                </div>
                <app-env-owner-fields
                  idPrefix="cf-env-a"
                  [ownerId]="form().owner_user_id"
                  [departmentId]="form().department_id"
                  [ownerName]="original()?.owner_name ?? null"
                  (ownerChange)="set('owner_user_id', $event)"
                  (departmentChange)="set('department_id', $event)"
                />
                <div>
                  <app-form-field
                    [label]="'environment.fields.status' | transloco"
                    inputId="cf-env-a-status"
                  >
                    <select
                      id="cf-env-a-status"
                      (change)="set('status', $any($event.target).value)"
                    >
                      @for (s of statuses; track s) {
                        <option [value]="s" [selected]="form().status === s">
                          {{ 'environment.status.' + s | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.reviewDue' | transloco"
                    inputId="cf-env-a-review"
                  >
                    <input
                      id="cf-env-a-review"
                      type="date"
                      [value]="form().review_due"
                      (change)="set('review_due', $any($event.target).value)"
                    />
                  </app-form-field>
                  <app-field-help scope="environment" page="aspectForm" field="review_due_at" />
                </div>
              </div>
            </app-card>

            @if (id()) {
              <app-card>
                <app-form-field
                  [label]="'environment.fields.changeReason' | transloco"
                  inputId="cf-env-a-reason"
                >
                  <input
                    id="cf-env-a-reason"
                    type="text"
                    maxlength="2000"
                    [value]="changeReason()"
                    (input)="changeReason.set($any($event.target).value)"
                  />
                </app-form-field>
                <p class="mt-1 text-[12px] text-fg-subtle">
                  {{ 'environment.form.changeReasonHint' | transloco }}
                </p>
              </app-card>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="ghost" (click)="back()">
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
            </div>
          </form>
          <div class="mt-6"><app-why-it-matters scope="environment" page="aspectForm" /></div>
        }
      }
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

  /** Route parameter; absent on `new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly suggestAssist = ASSIST_SUGGEST_ASPECTS;
  protected readonly impactTypes = IMPACT_TYPES;
  protected readonly conditions = CONDITIONS;
  protected readonly controlLevels = CONTROL_LEVELS;
  protected readonly stages = LIFECYCLE_STAGES;
  protected readonly statuses = RECORD_STATUSES;
  protected readonly overrides: readonly OverrideChoice[] = ['', 'significant', 'not_significant'];

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.common.loadFailed');
  protected readonly method = signal<ScoringMethod | null>(null);
  protected readonly original = signal<Aspect | null>(null);
  private readonly seed = signal<AspectFormValue | null>(null);
  protected readonly form = signal<AspectFormValue>(emptyAspectForm());
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  private readonly attempted = signal(false);
  protected readonly serverErrors = signal<Readonly<Record<string, string>>>({});
  protected readonly suggestions = signal<readonly SuggestedAspect[]>([]);
  protected readonly suggestionsEmpty = signal(false);

  protected readonly errors = computed(() => validateAspectForm(this.form()));
  protected readonly shown = computed(() => (this.attempted() ? this.errors() : {}));

  protected readonly scale = computed(() => {
    const m = this.method();
    if (!m) {
      return [];
    }
    return Array.from({ length: m.scale_max - m.scale_min + 1 }, (_, i) => m.scale_min + i);
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
      (f.legal_requirement && m.legal_requirement_significant) ||
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
      module: 'environment',
      entityType: 'env_aspect',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.aspect ?? this.language.translate('environment.aspect.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected label(c: ScoringMethod['criteria'][number]): string {
    return criterionLabel(c, this.language.active());
  }

  protected set<K extends keyof AspectFormValue>(key: K, value: AspectFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
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
    const f = this.form();
    this.form.set({
      ...aspectFormFromSuggestion(f.activity.trim(), f.site, s),
      owner_user_id: f.owner_user_id,
      department_id: f.department_id,
      scores: f.scores,
      review_due: f.review_due,
    });
    this.notifications.info('environment.aspect.suggestionApplied');
  }

  protected submit(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || Object.keys(this.errors()).length) {
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
      next: (a) => this.saved(a.id, 'environment.notices.created', a.code),
      error: (error: unknown) => this.failed(error),
    });
  }

  protected back(): void {
    const id = this.id();
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

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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService, FlowContext } from '../../core/kit/create-flow.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { RecurrencePicker } from '../../shared/tasks/recurrence-picker';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { EnvironmentApi } from './data/environment-api';
import {
  ENTITY_METRIC,
  GHG_SCOPES,
  METRIC_CATEGORIES,
  METRIC_DIRECTIONS,
  METRIC_STATUSES,
  Metric,
} from './data/environment.models';
import { environmentErrorKey } from './data/environment-errors';
import {
  MetricFormValue,
  emptyMetricForm,
  metricFormFrom,
  toMetricCreate,
  toMetricUpdate,
  validateMetricForm,
} from './data/form-models';
import {
  ENV_CRUMBS,
  ENV_MODULE,
  ENV_ROOT_CRUMB,
  EnvDirectorySelect,
  EnvField,
  injectEnvPermissions,
} from './environment-shared';

/** Form values a create-from-here prefill may set (name, unit, description). */
export function metricPrefill(
  form: MetricFormValue,
  prefill: Readonly<Record<string, unknown>>,
): MetricFormValue {
  const str = (key: string) => (typeof prefill[key] === 'string' ? (prefill[key] as string) : null);
  return {
    ...form,
    name: str('name') ?? str('title') ?? form.name,
    unit: str('unit') ?? form.unit,
    description: str('description') ?? form.description,
  };
}

/**
 * Create (`/environment/metrics/new`) or edit (`/environment/metrics/:id/edit`) an
 * environmental indicator: what is measured and how, the target and baseline (so
 * the data can be judged against criteria, 9.1.1), the emission category (scope,
 * explained where you choose it) and emission factor with its source and year, the
 * owner and a reminder to record values.
 */
@Component({
  selector: 'app-env-metric-editor',
  imports: [
    TranslocoPipe,
    AskAbout,
    FlowBanner,
    RecurrencePicker,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    LoadingState,
    PageHeader,
    EnvDirectorySelect,
    EnvField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="max-w-[760px]">
        <app-page-header
          [titleKey]="id() ? 'environment.metric.editTitle' : 'environment.metric.newTitle'"
          [titleParams]="{ code: original()?.code ?? '' }"
          [breadcrumbs]="breadcrumbs()"
          titleTestId="metric-form-title"
        />
        <app-help-strip scope="environment" page="metricForm" lesson="monitoring-and-emissions" />

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
              <p class="text-meta text-fg-muted">
                <span class="text-fail" aria-hidden="true">*</span>
                {{ 'environment.form.requiredHint' | transloco }}
              </p>

              <app-card>
                <h2 class="mb-4 font-display text-card font-bold text-fg">
                  {{ 'environment.metric.sections.what' | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <app-env-field
                    class="sm:col-span-2"
                    labelKey="environment.fields.name"
                    inputId="cf-env-m-name"
                    page="metricForm"
                    help="name"
                    [required]="true"
                    [errorKey]="shown()['name']"
                  >
                    <input
                      id="cf-env-m-name"
                      type="text"
                      maxlength="255"
                      required
                      [value]="form().name"
                      (input)="set('name', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['name']"
                      data-testid="metric-name"
                    />
                  </app-env-field>
                  <app-env-field
                    labelKey="environment.fields.category"
                    inputId="cf-env-m-cat"
                    [required]="true"
                  >
                    <select id="cf-env-m-cat" (change)="set('category', $any($event.target).value)">
                      @for (c of categories; track c) {
                        <option [value]="c" [selected]="form().category === c">
                          {{ 'environment.categories.' + c | transloco }}
                        </option>
                      }
                    </select>
                  </app-env-field>
                  <app-env-field
                    labelKey="environment.fields.unit"
                    inputId="cf-env-m-unit"
                    hintKey="environment.metric.unitHint"
                    [required]="true"
                    [errorKey]="shown()['unit']"
                  >
                    <input
                      id="cf-env-m-unit"
                      type="text"
                      maxlength="32"
                      required
                      aria-describedby="cf-env-m-unit-hint"
                      [value]="form().unit"
                      (input)="set('unit', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['unit']"
                      data-testid="metric-unit"
                    />
                  </app-env-field>
                  <app-env-field
                    class="sm:col-span-2"
                    labelKey="environment.fields.measurementMethod"
                    inputId="cf-env-m-method"
                    page="metricForm"
                    help="measurement_method"
                  >
                    <app-ask-about
                      label-extra
                      [prompt]="'environment.ask.methodField' | transloco"
                      field="measurement_method"
                      [fieldLabel]="'environment.fields.measurementMethod' | transloco"
                      [requirements]="['iso14001:9.1.1']"
                    />
                    <textarea
                      id="cf-env-m-method"
                      rows="2"
                      maxlength="2000"
                      [value]="form().measurement_method"
                      (input)="set('measurement_method', $any($event.target).value)"
                    ></textarea>
                  </app-env-field>
                  <app-env-field
                    class="sm:col-span-2"
                    labelKey="environment.fields.description"
                    inputId="cf-env-m-desc"
                  >
                    <textarea
                      id="cf-env-m-desc"
                      rows="2"
                      maxlength="20000"
                      [value]="form().description"
                      (input)="set('description', $any($event.target).value)"
                    ></textarea>
                  </app-env-field>
                  <app-env-field labelKey="environment.fields.site" inputId="cf-env-m-site">
                    <input
                      id="cf-env-m-site"
                      type="text"
                      maxlength="128"
                      [value]="form().site"
                      (input)="set('site', $any($event.target).value)"
                    />
                  </app-env-field>
                </div>
              </app-card>

              <app-card id="target">
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'environment.metric.targetTitle' | transloco }}
                </h2>
                <p class="mb-4 text-ui text-fg-muted">
                  {{ 'environment.metric.targetFormHint' | transloco }}
                </p>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <app-env-field
                    class="sm:col-span-2"
                    labelKey="environment.fields.direction"
                    inputId="cf-env-m-dir"
                    page="metricForm"
                    help="direction"
                    [legend]="true"
                  >
                    <div
                      class="flex flex-wrap gap-4"
                      role="radiogroup"
                      aria-labelledby="cf-env-m-dir-label"
                    >
                      @for (d of directions; track d) {
                        <label class="inline-flex items-center gap-2 text-body text-fg">
                          <input
                            type="radio"
                            name="cf-env-m-dir"
                            class="h-4 w-4 accent-[var(--accent)]"
                            [checked]="form().direction === d"
                            (change)="set('direction', d)"
                          />
                          {{ 'environment.directions.' + d | transloco }}
                        </label>
                      }
                    </div>
                  </app-env-field>
                  <app-env-field
                    labelKey="environment.fields.targetValueIn"
                    [labelParams]="{ unit: form().unit || '…' }"
                    inputId="cf-env-m-target"
                    page="metricForm"
                    help="target_value"
                    [errorKey]="shown()['target_value']"
                  >
                    <app-ask-about
                      label-extra
                      [prompt]="'environment.ask.targetField' | transloco"
                      field="target_value"
                      [fieldLabel]="'environment.fields.targetValue' | transloco"
                      [requirements]="['iso14001:6.2.1', 'iso14001:9.1.1']"
                    />
                    <input
                      id="cf-env-m-target"
                      type="text"
                      inputmode="decimal"
                      [value]="form().target_value"
                      (input)="set('target_value', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['target_value']"
                      data-testid="metric-target"
                    />
                  </app-env-field>
                  <app-env-field
                    labelKey="environment.fields.targetYear"
                    inputId="cf-env-m-target-year"
                    [errorKey]="shown()['target_year']"
                  >
                    <input
                      id="cf-env-m-target-year"
                      type="text"
                      inputmode="numeric"
                      maxlength="4"
                      [value]="form().target_year"
                      (input)="set('target_year', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['target_year']"
                    />
                  </app-env-field>
                  <app-env-field
                    labelKey="environment.fields.baselineValueIn"
                    [labelParams]="{ unit: form().unit || '…' }"
                    inputId="cf-env-m-baseline"
                    page="metricForm"
                    help="baseline_value"
                    [errorKey]="shown()['baseline_value']"
                  >
                    <input
                      id="cf-env-m-baseline"
                      type="text"
                      inputmode="decimal"
                      [value]="form().baseline_value"
                      (input)="set('baseline_value', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['baseline_value']"
                    />
                  </app-env-field>
                  <app-env-field
                    labelKey="environment.fields.baselineYear"
                    inputId="cf-env-m-baseline-year"
                    [errorKey]="shown()['baseline_year']"
                  >
                    <input
                      id="cf-env-m-baseline-year"
                      type="text"
                      inputmode="numeric"
                      maxlength="4"
                      [value]="form().baseline_year"
                      (input)="set('baseline_year', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['baseline_year']"
                    />
                  </app-env-field>
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'environment.metric.sections.emissions' | transloco }}
                </h2>
                <p class="mb-4 text-ui text-fg-muted">
                  {{ 'environment.metric.emissionsHint' | transloco }}
                </p>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <app-env-field
                    class="sm:col-span-2"
                    labelKey="environment.fields.ghgScope"
                    inputId="cf-env-m-scope"
                    page="metricForm"
                    help="ghg_scope"
                  >
                    <select
                      id="cf-env-m-scope"
                      aria-describedby="cf-env-m-scope-explain"
                      (change)="set('ghg_scope', $any($event.target).value)"
                      data-testid="metric-scope"
                    >
                      <option value="" [selected]="!form().ghg_scope">
                        {{ 'environment.scopes.none' | transloco }}
                      </option>
                      @for (s of scopes; track s) {
                        <option [value]="s" [selected]="form().ghg_scope === s">
                          {{ 'environment.scopes.' + s | transloco }}
                        </option>
                      }
                    </select>
                    <div id="cf-env-m-scope-explain" class="mt-1.5 text-meta text-fg-muted">
                      @if (form().ghg_scope; as s) {
                        {{ 'environment.scopeHelp.' + s | transloco }}
                      } @else {
                        <ul class="flex flex-col gap-0.5">
                          @for (s of scopes; track s) {
                            <li>
                              <span class="font-semibold"
                                >{{ 'environment.scopes.' + s | transloco }}:</span
                              >
                              {{ 'environment.scopeHelp.' + s | transloco }}
                            </li>
                          }
                        </ul>
                      }
                    </div>
                  </app-env-field>
                  <app-env-field
                    labelKey="environment.fields.emissionFactor"
                    inputId="cf-env-m-factor"
                    page="metricForm"
                    help="emission_factor"
                    [errorKey]="shown()['emission_factor']"
                  >
                    <app-ask-about
                      label-extra
                      [prompt]="'environment.ask.emissionFactor' | transloco: { unit: form().unit }"
                      field="emission_factor"
                      [fieldLabel]="'environment.fields.emissionFactor' | transloco"
                      [requirements]="['iso14001:9.1.1']"
                    />
                    <input
                      id="cf-env-m-factor"
                      type="text"
                      inputmode="decimal"
                      [value]="form().emission_factor"
                      (input)="set('emission_factor', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['emission_factor']"
                      data-testid="metric-factor"
                    />
                  </app-env-field>
                  <div class="hidden sm:block"></div>
                  <app-env-field
                    labelKey="environment.fields.factorSource"
                    inputId="cf-env-m-fsource"
                    page="metricForm"
                    help="factor_source"
                  >
                    <input
                      id="cf-env-m-fsource"
                      type="text"
                      maxlength="255"
                      [value]="form().factor_source"
                      (input)="set('factor_source', $any($event.target).value)"
                    />
                  </app-env-field>
                  <app-env-field
                    labelKey="environment.fields.factorYear"
                    inputId="cf-env-m-fyear"
                    [errorKey]="shown()['factor_year']"
                  >
                    <input
                      id="cf-env-m-fyear"
                      type="text"
                      inputmode="numeric"
                      maxlength="4"
                      [value]="form().factor_year"
                      (input)="set('factor_year', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['factor_year']"
                    />
                  </app-env-field>
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-4 font-display text-card font-bold text-fg">
                  {{ 'environment.metric.sections.ownership' | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <app-env-field labelKey="environment.fields.owner" inputId="cf-env-m-owner">
                    <app-env-directory-select
                      inputId="cf-env-m-owner"
                      [value]="form().owner_user_id"
                      [currentName]="original()?.owner_name ?? null"
                      (valueChange)="set('owner_user_id', $event)"
                    />
                  </app-env-field>
                  <app-env-field labelKey="environment.fields.department" inputId="cf-env-m-dept">
                    <app-env-directory-select
                      kind="department"
                      inputId="cf-env-m-dept"
                      noneKey="environment.form.noDepartment"
                      [value]="form().department_id"
                      (valueChange)="set('department_id', $event)"
                    />
                  </app-env-field>
                  <app-env-field labelKey="environment.fields.status" inputId="cf-env-m-status">
                    <select
                      id="cf-env-m-status"
                      (change)="set('status', $any($event.target).value)"
                    >
                      @for (s of statuses; track s) {
                        <option [value]="s" [selected]="form().status === s">
                          {{ 'environment.status.' + s | transloco }}
                        </option>
                      }
                    </select>
                  </app-env-field>
                </div>
                <label class="mt-4 flex items-center gap-2 text-body text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="form().collection_enabled"
                    (change)="set('collection_enabled', $any($event.target).checked)"
                  />
                  {{ 'environment.metric.scheduleCollection' | transloco }}
                </label>
                @if (form().collection_enabled) {
                  <div class="mt-3 flex flex-col gap-3">
                    <app-recurrence-picker
                      idPrefix="cf-env-collect"
                      [rrule]="form().collection_rrule"
                      (rruleChange)="set('collection_rrule', $event)"
                    />
                    <app-env-field
                      labelKey="environment.fields.firstReminder"
                      inputId="cf-env-m-start"
                    >
                      <input
                        id="cf-env-m-start"
                        type="date"
                        [value]="form().collection_start"
                        (change)="set('collection_start', $any($event.target).value)"
                      />
                    </app-env-field>
                  </div>
                }
              </app-card>

              <div
                class="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0"
              >
                @if (attempted() && errorCount()) {
                  <p class="mr-auto text-meta font-semibold text-fail" role="alert">
                    {{ 'environment.form.fixErrors' | transloco: { count: errorCount() } }}
                  </p>
                }
                <app-button variant="secondary" (click)="back()">
                  {{ 'common.cancel' | transloco }}
                </app-button>
                <app-button
                  type="submit"
                  [loading]="saving()"
                  [disabled]="saving()"
                  data-testid="metric-save"
                >
                  {{ (id() ? 'common.save' : 'environment.metric.create') | transloco }}
                </app-button>
              </div>
            </form>
          }
        }
      </div>
    </div>
  `,
})
export class MetricEditor {
  private readonly api = inject(EnvironmentApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flows = inject(CreateFlowService);

  readonly id = input<string | undefined>(undefined);

  protected readonly perms = injectEnvPermissions();
  protected readonly categories = METRIC_CATEGORIES;
  protected readonly scopes = GHG_SCOPES;
  protected readonly statuses = METRIC_STATUSES;
  protected readonly directions = METRIC_DIRECTIONS;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('ui.error.body');
  protected readonly original = signal<Metric | null>(null);
  private readonly seed = signal<MetricFormValue | null>(null);
  protected readonly form = signal<MetricFormValue>(emptyMetricForm());
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);

  private readonly flowSource = signal<Signal<FlowContext | null> | null>(null);
  protected readonly flow = computed(() => this.flowSource()?.() ?? null);

  protected readonly errors = computed(() => validateMetricForm(this.form()));
  protected readonly shown = computed(() => (this.attempted() ? this.errors() : {}));
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);

  protected readonly breadcrumbs = computed(() => {
    const m = this.original();
    return m
      ? [
          ENV_ROOT_CRUMB,
          ENV_CRUMBS.metrics,
          { label: m.code, link: ['/environment/metrics', m.id] },
          { labelKey: 'environment.common.edit' },
        ]
      : [ENV_ROOT_CRUMB, ENV_CRUMBS.metrics, { labelKey: 'environment.metric.newTitle' }];
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: ENV_MODULE,
      entityType: ENTITY_METRIC,
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.name ?? this.language.translate('environment.metric.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    effect(() => {
      const flow = this.flow();
      if (flow && !this.id()) {
        untracked(() => this.form.update((f) => metricPrefill(f, flow.prefill)));
      }
    });
  }

  protected set<K extends keyof MetricFormValue>(key: K, value: MetricFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
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
      const body = toMetricUpdate(seed, this.form());
      if (Object.keys(body).length === 0) {
        this.notifications.info('environment.notices.noChanges');
        this.back();
        return;
      }
      this.saving.set(true);
      this.api.updateMetric(orgId, id, body).subscribe({
        next: () => this.saved(id, 'environment.notices.saved'),
        error: (error: unknown) => this.failed(error),
      });
      return;
    }
    this.saving.set(true);
    this.api.createMetric(orgId, toMetricCreate(this.form())).subscribe({
      next: (m) => {
        if (this.flow()) {
          this.flows.complete(m.id, ENTITY_METRIC).subscribe();
        }
        this.saved(m.id, 'environment.notices.created', m.code);
      },
      error: (error: unknown) => this.failed(error),
    });
  }

  protected back(): void {
    const id = this.id();
    if (!id && this.flow()) {
      this.flows.cancel();
    }
    void this.router.navigate(id ? ['/environment/metrics', id] : ['/environment/metrics']);
  }

  private saved(id: string, key: string, code?: string): void {
    this.saving.set(false);
    this.notifications.success(key, code ? { code } : undefined);
    void this.router.navigate(['/environment/metrics', id]);
  }

  private failed(error: unknown): void {
    this.saving.set(false);
    this.notifications.error(environmentErrorKey(error));
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!id) {
      this.form.set(emptyMetricForm({ owner_user_id: this.auth.user()?.id ?? '' }));
      if (!this.flowSource()) {
        this.flowSource.set(this.flows.consume(this.route, { targetType: ENTITY_METRIC }));
      }
      this.state.set('ready');
      return;
    }
    this.state.set('loading');
    this.request = this.api.getMetric(orgId, id).subscribe({
      next: (m) => {
        const value = metricFormFrom(m);
        this.original.set(m);
        this.seed.set(value);
        this.form.set(value);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(environmentErrorKey(error));
        this.state.set('error');
      },
    });
  }
}

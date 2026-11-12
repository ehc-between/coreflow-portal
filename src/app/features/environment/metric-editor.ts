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
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecurrencePicker } from '../../shared/tasks/recurrence-picker';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { EnvironmentApi } from './data/environment-api';
import { GHG_SCOPES, METRIC_CATEGORIES, METRIC_STATUSES, Metric } from './data/environment.models';
import { environmentErrorKey } from './data/environment-errors';
import {
  MetricFormValue,
  emptyMetricForm,
  metricFormFrom,
  toMetricCreate,
  toMetricUpdate,
  validateMetricForm,
} from './data/form-models';
import { EnvOwnerFields } from './owner-fields';

/** Common units per category, offered as suggestions in the unit field. */
export const UNIT_SUGGESTIONS = ['kWh', 'MWh', 'l', 'm³', 'kg', 't', 'km', 'Nm³', 't CO₂e'];

/**
 * Create (`/environment/metrics/new`) or edit (`/environment/metrics/:id/edit`)
 * a monitoring metric: what is measured, its unit, GHG scope and emission factor
 * (kg CO2e per unit), and an optional collection schedule that reminds the owner.
 */
@Component({
  selector: 'app-env-metric-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    RecurrencePicker,
    Alert,
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
        [routerLink]="id() ? ['/environment/metrics', id()] : '/environment/metrics'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'environment.common.backToRecord' : 'environment.metrics.back') | transloco }}
      </a>
      <h1
        class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
        data-testid="metric-form-title"
      >
        @if (original(); as m) {
          {{ 'environment.metric.editTitle' | transloco: { code: m.code } }}
        } @else {
          {{ 'environment.metric.newTitle' | transloco }}
        }
      </h1>
      <div class="mb-5"><app-guide-intro scope="environment" page="metricForm" /></div>

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
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'environment.fields.name' | transloco"
                    inputId="cf-env-m-name"
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
                  </app-form-field>
                  @if (shown()['name']; as key) {
                    <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                  }
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.category' | transloco"
                    inputId="cf-env-m-category"
                  >
                    <select
                      id="cf-env-m-category"
                      (change)="set('category', $any($event.target).value)"
                    >
                      @for (c of categories; track c) {
                        <option [value]="c" [selected]="form().category === c">
                          {{ 'environment.categories.' + c | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.unit' | transloco"
                    inputId="cf-env-m-unit"
                  >
                    <input
                      id="cf-env-m-unit"
                      type="text"
                      maxlength="32"
                      list="cf-env-m-units"
                      required
                      [value]="form().unit"
                      (input)="set('unit', $any($event.target).value)"
                      [attr.aria-invalid]="!!shown()['unit']"
                      data-testid="metric-unit"
                    />
                  </app-form-field>
                  <datalist id="cf-env-m-units">
                    @for (u of units; track u) {
                      <option [value]="u"></option>
                    }
                  </datalist>
                  @if (shown()['unit']; as key) {
                    <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                  }
                  <app-field-help scope="environment" page="metricForm" field="unit" />
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.ghgScope' | transloco"
                    inputId="cf-env-m-scope"
                  >
                    <select
                      id="cf-env-m-scope"
                      (change)="set('ghg_scope', $any($event.target).value)"
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
                  </app-form-field>
                  <app-field-help scope="environment" page="metricForm" field="ghg_scope" />
                </div>
                <div>
                  <div class="flex items-end gap-1">
                    <div class="flex-1">
                      <app-form-field
                        [label]="'environment.fields.emissionFactor' | transloco"
                        inputId="cf-env-m-factor"
                      >
                        <input
                          id="cf-env-m-factor"
                          type="text"
                          inputmode="decimal"
                          [value]="form().emission_factor"
                          (input)="set('emission_factor', $any($event.target).value)"
                          [attr.aria-invalid]="!!shown()['emission_factor']"
                          data-testid="metric-factor"
                        />
                      </app-form-field>
                    </div>
                    <app-ask-about
                      [prompt]="'environment.ask.emissionFactor' | transloco: { unit: form().unit }"
                      field="emission_factor"
                    />
                  </div>
                  @if (shown()['emission_factor']; as key) {
                    <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                  }
                  <app-field-help scope="environment" page="metricForm" field="emission_factor" />
                </div>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'environment.fields.description' | transloco"
                    inputId="cf-env-m-desc"
                  >
                    <textarea
                      id="cf-env-m-desc"
                      rows="3"
                      maxlength="20000"
                      [value]="form().description"
                      (input)="set('description', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.site' | transloco"
                    inputId="cf-env-m-site"
                  >
                    <input
                      id="cf-env-m-site"
                      type="text"
                      maxlength="128"
                      [value]="form().site"
                      (input)="set('site', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'environment.fields.status' | transloco"
                    inputId="cf-env-m-status"
                  >
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
                  </app-form-field>
                </div>
                <app-env-owner-fields
                  idPrefix="cf-env-m"
                  [ownerId]="form().owner_user_id"
                  [departmentId]="form().department_id"
                  [ownerName]="original()?.owner_name ?? null"
                  (ownerChange)="set('owner_user_id', $event)"
                  (departmentChange)="set('department_id', $event)"
                />
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                {{ 'environment.metric.collection' | transloco }}
              </h2>
              <label class="flex items-center gap-2 text-[13.5px] text-fg">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="form().collection_enabled"
                  (change)="set('collection_enabled', $any($event.target).checked)"
                />
                {{ 'environment.metric.scheduleCollection' | transloco }}
              </label>
              <app-field-help scope="environment" page="metricForm" field="collection_rrule" />
              @if (form().collection_enabled) {
                <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr] sm:items-start">
                  <app-recurrence-picker
                    idPrefix="cf-env-collect"
                    [rrule]="form().collection_rrule"
                    (rruleChange)="set('collection_rrule', $event)"
                  />
                  <app-form-field
                    [label]="'environment.fields.firstReminder' | transloco"
                    inputId="cf-env-m-start"
                  >
                    <input
                      id="cf-env-m-start"
                      type="date"
                      [value]="form().collection_start"
                      (change)="set('collection_start', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
              }
            </app-card>

            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="ghost" (click)="back()">
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
          <div class="mt-6"><app-why-it-matters scope="environment" page="metricForm" /></div>
        }
      }
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

  readonly id = input<string | undefined>(undefined);

  protected readonly categories = METRIC_CATEGORIES;
  protected readonly scopes = GHG_SCOPES;
  protected readonly statuses = METRIC_STATUSES;
  protected readonly units = UNIT_SUGGESTIONS;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.common.loadFailed');
  protected readonly original = signal<Metric | null>(null);
  private readonly seed = signal<MetricFormValue | null>(null);
  protected readonly form = signal<MetricFormValue>(emptyMetricForm());
  protected readonly saving = signal(false);
  private readonly attempted = signal(false);

  protected readonly errors = computed(() => validateMetricForm(this.form()));
  protected readonly shown = computed(() => {
    const errors = this.errors();
    // Format problems show at once; missing required values only after submitting.
    return this.attempted()
      ? errors
      : Object.fromEntries(Object.entries(errors).filter(([k]) => k === 'emission_factor'));
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'environment',
      entityType: 'env_metric',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.name ?? this.language.translate('environment.metric.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected set<K extends keyof MetricFormValue>(key: K, value: MetricFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
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
      next: (m) => this.saved(m.id, 'environment.notices.created', m.code),
      error: (error: unknown) => this.failed(error),
    });
  }

  protected back(): void {
    const id = this.id();
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
      this.state.set('ready');
      return;
    }
    this.state.set('loading');
    this.request = this.api.getMetric(orgId, id).subscribe({
      next: (metric) => {
        const value = metricFormFrom(metric);
        this.original.set(metric);
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

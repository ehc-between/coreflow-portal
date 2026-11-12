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
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { Switch } from '../../shared/ui/switch/switch';
import { OwnerSelect } from './components/owner-select';
import { ObjectivesApi } from './data/objectives-api';
import { objectivesErrorKey } from './data/objectives-errors';
import {
  KPI_DIRECTIONS,
  KPI_FREQUENCIES,
  KPI_STATUSES,
  KpiDetail,
  KpiDirection,
  KpiFrequency,
  KpiStatus,
  MANAGEMENT_SYSTEMS,
  ManagementSystem,
  Objective,
  UpdateKpiRequest,
} from './data/objectives.models';
import {
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  kpiStatusKey,
  managementSystemKey,
  parseNumber,
  textOrNull,
  thresholdError,
} from './objectives-display';
import { changedFields } from './objective-editor';

export interface KpiFormValue {
  readonly name: string;
  readonly description: string;
  readonly objective_id: string | null;
  readonly management_system: ManagementSystem | '';
  readonly owner_user_id: string | null;
  readonly department_id: string | null;
  readonly unit: string;
  readonly direction: KpiDirection;
  readonly baseline_value: string;
  readonly target_value: string;
  readonly warning_value: string;
  readonly frequency: KpiFrequency;
  readonly data_source: string;
  readonly start_date: string;
  readonly measurement_reminders: boolean;
  readonly status: KpiStatus;
}

export const EMPTY_KPI_FORM: KpiFormValue = {
  name: '',
  description: '',
  objective_id: null,
  management_system: '',
  owner_user_id: null,
  department_id: null,
  unit: '',
  direction: 'higher',
  baseline_value: '',
  target_value: '',
  warning_value: '',
  frequency: 'monthly',
  data_source: '',
  start_date: '',
  measurement_reminders: true,
  status: 'active',
};

const numText = (v: number | null) => (v === null ? '' : String(v));

export function kpiToForm(k: KpiDetail): KpiFormValue {
  return {
    name: k.name,
    description: k.description ?? '',
    objective_id: k.objective?.id ?? null,
    management_system: k.management_system ?? '',
    owner_user_id: k.owner?.id ?? null,
    department_id: k.department_id,
    unit: k.unit ?? '',
    direction: k.direction,
    baseline_value: numText(k.baseline_value),
    target_value: numText(k.target_value),
    warning_value: numText(k.warning_value),
    frequency: k.frequency,
    data_source: k.data_source ?? '',
    start_date: k.start_date ?? '',
    measurement_reminders: k.measurement_reminders,
    status: k.status,
  };
}

/** API payload of a form value; numbers that do not parse come out as NaN (caught before saving). */
export function kpiPayload(f: KpiFormValue): Required<Omit<UpdateKpiRequest, 'change_reason'>> {
  return {
    name: f.name.trim(),
    description: textOrNull(f.description),
    objective_id: f.objective_id,
    management_system: f.management_system || null,
    owner_user_id: f.owner_user_id,
    department_id: f.department_id,
    unit: textOrNull(f.unit),
    direction: f.direction,
    baseline_value: parseNumber(f.baseline_value),
    target_value: parseNumber(f.target_value),
    warning_value: parseNumber(f.warning_value),
    frequency: f.frequency,
    data_source: textOrNull(f.data_source),
    start_date: f.start_date || null,
    measurement_reminders: f.measurement_reminders,
    status: f.status,
  };
}

let nextId = 0;

/**
 * `/objectives/kpis/new` (optionally `?objective=<id>`) and
 * `/objectives/kpis/:id/edit`: define what is measured, the unit and direction,
 * baseline / target / warning thresholds, how often it is measured, and whether
 * the owner gets a recurring measurement task.
 */
@Component({
  selector: 'app-kpi-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    Switch,
    OwnerSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="backLink()"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'objectives.common.back' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'objectives.kpiForm.editTitle' : 'objectives.kpiForm.newTitle') | transloco }}
      </h1>

      <div class="mb-4"><app-guide-intro [scope]="scope" page="kpiForm" /></div>

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted">
          {{ 'objectives.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <app-alert tone="error">{{ 'objectives.common.loadFailed' | transloco }}</app-alert>
      } @else {
        <app-card>
          <form class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
            @if (errorKey(); as key) {
              <app-alert tone="error">{{ key | transloco }}</app-alert>
            }

            <div>
              <app-form-field
                [label]="'objectives.kpiFields.name' | transloco"
                [inputId]="fid('name')"
              >
                <input
                  [id]="fid('name')"
                  type="text"
                  maxlength="255"
                  required
                  autocomplete="off"
                  [attr.aria-invalid]="nameMissing() || null"
                  [value]="form().name"
                  (input)="set('name', $any($event.target).value)"
                />
              </app-form-field>
              <app-field-help [scope]="scope" page="kpiForm" field="name" />
              @if (nameMissing()) {
                <p class="mt-1 text-[12.5px] text-fail">
                  {{ 'objectives.errors.name_required' | transloco }}
                </p>
              }
            </div>

            <div>
              <app-form-field
                [label]="'objectives.kpiFields.description' | transloco"
                [inputId]="fid('description')"
              >
                <textarea
                  [id]="fid('description')"
                  rows="3"
                  maxlength="20000"
                  [value]="form().description"
                  (input)="set('description', $any($event.target).value)"
                ></textarea>
              </app-form-field>
              <app-field-help [scope]="scope" page="kpiForm" field="description" />
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <app-form-field
                  [label]="'objectives.kpiFields.objective' | transloco"
                  [inputId]="fid('objective')"
                >
                  <select
                    [id]="fid('objective')"
                    (change)="setObjective($any($event.target).value)"
                  >
                    <option value="" [selected]="!form().objective_id">
                      {{ 'objectives.kpiForm.noObjective' | transloco }}
                    </option>
                    @if (orphanObjective(); as o) {
                      <option [value]="o.id" selected>{{ o.code }} {{ o.title }}</option>
                    }
                    @for (o of objectives(); track o.id) {
                      <option [value]="o.id" [selected]="form().objective_id === o.id">
                        {{ o.code }} {{ o.title }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help [scope]="scope" page="kpiForm" field="objective" />
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.fields.managementSystem' | transloco"
                  [inputId]="fid('ms')"
                >
                  <select
                    [id]="fid('ms')"
                    (change)="set('management_system', $any($event.target).value)"
                  >
                    <option value="" [selected]="!form().management_system">
                      {{ 'objectives.kpiForm.inheritSystem' | transloco }}
                    </option>
                    @for (m of systems; track m) {
                      <option [value]="m" [selected]="form().management_system === m">
                        {{ systemKey(m) | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.fields.owner' | transloco"
                  [inputId]="fid('owner')"
                >
                  <app-objectives-owner-select
                    kind="user"
                    [inputId]="fid('owner')"
                    [value]="form().owner_user_id"
                    [currentName]="original()?.owner?.name ?? null"
                    (valueChange)="set('owner_user_id', $event)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="kpiForm" field="owner" />
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.fields.department' | transloco"
                  [inputId]="fid('department')"
                >
                  <app-objectives-owner-select
                    kind="department"
                    [inputId]="fid('department')"
                    [value]="form().department_id"
                    (valueChange)="set('department_id', $event)"
                  />
                </app-form-field>
              </div>
            </div>

            <fieldset class="rounded-[10px] border border-border p-4">
              <legend class="px-1 text-[13px] font-semibold text-fg">
                {{ 'objectives.kpiForm.thresholds' | transloco }}
              </legend>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <app-form-field
                    [label]="'objectives.kpiFields.unit' | transloco"
                    [inputId]="fid('unit')"
                  >
                    <input
                      [id]="fid('unit')"
                      type="text"
                      maxlength="32"
                      [value]="form().unit"
                      (input)="set('unit', $any($event.target).value)"
                    />
                  </app-form-field>
                  <app-field-help [scope]="scope" page="kpiForm" field="unit" />
                </div>
                <div>
                  <app-form-field
                    [label]="'objectives.kpiFields.direction' | transloco"
                    [inputId]="fid('direction')"
                  >
                    <select
                      [id]="fid('direction')"
                      (change)="set('direction', $any($event.target).value)"
                    >
                      @for (d of directions; track d) {
                        <option [value]="d" [selected]="form().direction === d">
                          {{ 'objectives.direction.' + d | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  <app-field-help [scope]="scope" page="kpiForm" field="direction" />
                </div>
              </div>
              <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                @for (n of numberFields; track n.key) {
                  <div>
                    <app-form-field [label]="n.label | transloco" [inputId]="fid(n.key)">
                      <input
                        [id]="fid(n.key)"
                        type="text"
                        inputmode="decimal"
                        autocomplete="off"
                        [attr.aria-invalid]="isNaNField(n.key) || null"
                        [value]="form()[n.key]"
                        (input)="set(n.key, $any($event.target).value)"
                      />
                    </app-form-field>
                    <app-field-help [scope]="scope" page="kpiForm" [field]="n.help" />
                    @if (isNaNField(n.key)) {
                      <p class="mt-1 text-[12.5px] text-fail">
                        {{ 'objectives.errors.invalid_number' | transloco }}
                      </p>
                    }
                  </div>
                }
              </div>
              @if (thresholdProblem(); as code) {
                <p class="mt-2 text-[12.5px] text-fail" role="alert">
                  {{ 'objectives.errors.' + code | transloco }}
                </p>
              }
            </fieldset>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <app-form-field
                  [label]="'objectives.kpiFields.frequency' | transloco"
                  [inputId]="fid('frequency')"
                >
                  <select
                    [id]="fid('frequency')"
                    (change)="set('frequency', $any($event.target).value)"
                  >
                    @for (fr of frequencies; track fr) {
                      <option [value]="fr" [selected]="form().frequency === fr">
                        {{ 'objectives.frequency.' + fr | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help [scope]="scope" page="kpiForm" field="frequency" />
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.kpiFields.startDate' | transloco"
                  [inputId]="fid('start')"
                >
                  <input
                    [id]="fid('start')"
                    type="date"
                    [value]="form().start_date"
                    (change)="set('start_date', $any($event.target).value)"
                  />
                </app-form-field>
              </div>
              @if (id()) {
                <div>
                  <app-form-field
                    [label]="'objectives.fields.status' | transloco"
                    [inputId]="fid('status')"
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
                  </app-form-field>
                  <app-field-help [scope]="scope" page="kpiForm" field="status" />
                </div>
              }
            </div>

            <div>
              <app-form-field
                [label]="'objectives.kpiFields.dataSource' | transloco"
                [inputId]="fid('source')"
              >
                <input
                  [id]="fid('source')"
                  type="text"
                  maxlength="255"
                  [value]="form().data_source"
                  (input)="set('data_source', $any($event.target).value)"
                />
              </app-form-field>
              <app-field-help [scope]="scope" page="kpiForm" field="dataSource" />
            </div>

            <div>
              <app-switch
                [checked]="form().measurement_reminders"
                (checkedChange)="set('measurement_reminders', $event)"
              >
                {{ 'objectives.kpiFields.reminders' | transloco }}
              </app-switch>
              <app-field-help [scope]="scope" page="kpiForm" field="reminders" />
            </div>

            @if (id()) {
              <div>
                <app-form-field
                  [label]="'objectives.fields.changeReason' | transloco"
                  [inputId]="fid('reason')"
                >
                  <input
                    [id]="fid('reason')"
                    type="text"
                    maxlength="1000"
                    [value]="changeReason()"
                    (input)="changeReason.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="kpiForm" field="changeReason" />
              </div>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="ghost" (click)="cancel()">
                {{ 'common.cancel' | transloco }}
              </app-button>
              <app-button type="submit" [loading]="saving()" [disabled]="saving()">
                {{ (id() ? 'objectives.form.save' : 'objectives.kpiForm.create') | transloco }}
              </app-button>
            </div>
          </form>
        </app-card>

        <div class="mt-6"><app-why-it-matters [scope]="scope" page="kpiForm" /></div>
      }
    </div>
  `,
})
export class KpiEditor {
  private readonly api = inject(ObjectivesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Route param `:id` when editing. */
  readonly id = input<string | undefined>(undefined);
  /** Query param `?objective=` to link a new KPI to an objective. */
  readonly objective = input<string | undefined>(undefined);

  protected readonly scope = OBJECTIVES_SCOPE;
  protected readonly systems = MANAGEMENT_SYSTEMS;
  protected readonly directions = KPI_DIRECTIONS;
  protected readonly frequencies = KPI_FREQUENCIES;
  protected readonly statuses = KPI_STATUSES;
  protected readonly systemKey = managementSystemKey;
  protected readonly statusKey = kpiStatusKey;
  protected readonly numberFields = [
    { key: 'baseline_value', label: 'objectives.kpiFields.baseline', help: 'baseline' },
    { key: 'target_value', label: 'objectives.kpiFields.target', help: 'target' },
    { key: 'warning_value', label: 'objectives.kpiFields.warning', help: 'warning' },
  ] as const;
  private readonly uid = ++nextId;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly original = signal<KpiDetail | null>(null);
  protected readonly form = signal<KpiFormValue>(EMPTY_KPI_FORM);
  protected readonly objectives = signal<readonly Objective[]>([]);
  protected readonly changeReason = signal('');
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly nameMissing = computed(() => this.submitted() && !this.form().name.trim());
  protected readonly payload = computed(() => kpiPayload(this.form()));
  protected readonly thresholdProblem = computed(() => {
    const p = this.payload();
    const nums = [p.target_value, p.warning_value];
    if (nums.some((n) => Number.isNaN(n))) {
      return null;
    }
    return thresholdError(p.direction, p.target_value, p.warning_value);
  });
  protected readonly orphanObjective = computed(() => {
    const ref = this.original()?.objective;
    const id = this.form().objective_id;
    return ref && ref.id === id && !this.objectives().some((o) => o.id === id) ? ref : null;
  });
  protected readonly backLink = computed(() => {
    const id = this.id();
    if (id) {
      return ['/objectives/kpis', id];
    }
    const objective = this.objective();
    return objective ? ['/objectives', objective] : ['/objectives/kpis'];
  });

  private request = new Subscription();
  private objectivesRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.objectivesRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'kpi',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.name ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const objective = this.objective();
      untracked(() => this.load(orgId, id, objective));
    });
  }

  protected fid(name: string): string {
    return `kpi-${this.uid}-${name}`;
  }

  protected set<K extends keyof KpiFormValue>(key: K, value: KpiFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setObjective(value: string): void {
    this.set('objective_id', value || null);
  }

  protected isNaNField(key: 'baseline_value' | 'target_value' | 'warning_value'): boolean {
    return Number.isNaN(this.payload()[key]);
  }

  protected cancel(): void {
    void this.router.navigate(this.backLink());
  }

  protected save(): void {
    this.submitted.set(true);
    this.errorKey.set(null);
    const orgId = this.selectedOrg.currentOrgId();
    const payload = this.payload();
    const badNumber = [payload.baseline_value, payload.target_value, payload.warning_value].some(
      (n) => Number.isNaN(n),
    );
    if (!orgId || this.saving() || this.nameMissing() || badNumber || this.thresholdProblem()) {
      return;
    }
    const original = this.original();
    const id = this.id();
    this.saving.set(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...createFields } = payload;
    const call =
      id && original
        ? this.api.updateKpi(orgId, id, {
            ...changedFields(kpiPayload(kpiToForm(original)), payload),
            change_reason: textOrNull(this.changeReason()),
          })
        : this.api.createKpi(orgId, { ...createFields, name: payload.name ?? '' });
    call.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.notifications.success(
          id ? 'objectives.notices.kpiSaved' : 'objectives.notices.kpiCreated',
        );
        void this.router.navigate(['/objectives/kpis', saved.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorKey.set(objectivesErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string | undefined, objective: string | undefined): void {
    this.request.unsubscribe();
    this.objectivesRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.objectivesRequest = this.api
      .list(orgId, { status: ['draft', 'active'], sort: 'code', limit: 200 })
      .subscribe({ next: (page) => this.objectives.set(page.items), error: () => undefined });
    if (!id) {
      this.form.set({ ...EMPTY_KPI_FORM, objective_id: objective ?? null });
      return;
    }
    this.state.set('loading');
    this.request = this.api.getKpi(orgId, id).subscribe({
      next: (k) => {
        if (!k.can_edit) {
          void this.router.navigate(['/objectives/kpis', id]);
          return;
        }
        this.original.set(k);
        this.form.set(kpiToForm(k));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

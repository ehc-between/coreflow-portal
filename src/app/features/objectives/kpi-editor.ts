import { formatNumber } from '@angular/common';
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
import { Subscription, catchError, of } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { FormActions } from '../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../shared/ui/form-section/form-section';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Switch } from '../../shared/ui/switch/switch';
import { ObjField } from './components/obj-field';
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
import { KPIS_CRUMB, OBJECTIVES_ROOT_CRUMB } from './objectives-nav';

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
  readonly evaluated_by_user_id: string | null;
  readonly review_forum: string;
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
  evaluated_by_user_id: null,
  review_forum: '',
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
    evaluated_by_user_id: k.evaluated_by?.id ?? null,
    review_forum: k.review_forum ?? '',
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
    evaluated_by_user_id: f.evaluated_by_user_id,
    review_forum: textOrNull(f.review_forum),
    start_date: f.start_date || null,
    measurement_reminders: f.measurement_reminders,
    status: f.status,
  };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

let nextId = 0;

/**
 * `/objectives/kpis/new` (optionally `?objective=<id>`, or opened from an objective's
 * "create from here") and `/objectives/kpis/:id/edit` (`?focus=target` from "Juster
 * målverdi"). Three groups: what is measured and which objective it belongs to; the
 * target value and thresholds, with a plain-words reading of them; and how often it
 * is measured, by whom, who evaluates the results and where they are reviewed.
 */
@Component({
  selector: 'app-kpi-editor',
  imports: [
    TranslocoPipe,
    AskAbout,
    WhyItMatters,
    FlowBanner,
    Alert,
    Button,
    DateInput,
    FormActions,
    FormSection,
    HelpStrip,
    LoadingState,
    PageHeader,
    Switch,
    ObjField,
    OwnerSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'objectives.kpiForm.editTitle' : 'objectives.kpiForm.newTitle'"
        [breadcrumbs]="breadcrumbs()"
        [backLink]="backLink()"
        [backLabelKey]="backLabelKey()"
      />
      <app-help-strip class="mb-5 block" [scope]="scope" page="kpiForm" lesson="good-kpis" />
      <app-flow-banner [flow]="flow()" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="6" />
      } @else if (state() === 'error') {
        <app-alert tone="error">{{ 'objectives.common.loadFailed' | transloco }}</app-alert>
      } @else {
        <form class="flex flex-col gap-5" novalidate (submit)="$event.preventDefault(); save()">
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }

          <app-form-section
            [title]="'objectives.kpiForm.group1' | transloco"
            [description]="'objectives.kpiForm.group1Hint' | transloco"
          >
            <app-obj-field
              span="full"
              [label]="'objectives.kpiFields.name' | transloco"
              [inputId]="fid('name')"
              page="kpiForm"
              help="name"
              [required]="true"
              [errorKey]="nameMissing() ? 'objectives.errors.name_required' : null"
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
            </app-obj-field>
            <app-obj-field
              span="full"
              [label]="'objectives.kpiFields.description' | transloco"
              [inputId]="fid('description')"
              page="kpiForm"
              help="description"
            >
              <app-ask-about
                ask
                field="description"
                [fieldLabel]="'objectives.kpiFields.description' | transloco"
                [prompt]="askDefinitionPrompt()"
              />
              <textarea
                [id]="fid('description')"
                rows="3"
                maxlength="20000"
                [value]="form().description"
                (input)="set('description', $any($event.target).value)"
              ></textarea>
            </app-obj-field>
            <app-obj-field
              [label]="'objectives.kpiFields.objective' | transloco"
              [inputId]="fid('objective')"
              page="kpiForm"
              help="objective"
            >
              <select [id]="fid('objective')" (change)="setObjective($any($event.target).value)">
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
            </app-obj-field>
            <app-obj-field
              [label]="'objectives.fields.managementSystem' | transloco"
              [inputId]="fid('ms')"
              page="kpiForm"
              help="managementSystem"
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
            </app-obj-field>
          </app-form-section>

          <app-form-section
            id="kpi-section-target"
            [title]="'objectives.kpiForm.group2' | transloco"
            [description]="'objectives.kpiForm.group2Hint' | transloco"
          >
            @if (focus() === 'target' && id()) {
              <p
                class="rounded-tile border border-info/30 bg-info-soft px-3 py-2 text-ui text-info-ink sm:col-span-2"
                data-testid="adjust-target-hint"
              >
                {{ 'objectives.kpiForm.adjustHint' | transloco }}
              </p>
            }
            <app-obj-field
              [label]="'objectives.kpiFields.unit' | transloco"
              [inputId]="fid('unit')"
              page="kpiForm"
              help="unit"
            >
              <input
                [id]="fid('unit')"
                type="text"
                maxlength="32"
                [value]="form().unit"
                (input)="set('unit', $any($event.target).value)"
              />
            </app-obj-field>
            <app-obj-field
              [label]="'objectives.kpiFields.direction' | transloco"
              [inputId]="fid('direction')"
              page="kpiForm"
              help="direction"
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
            </app-obj-field>
            <div class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:col-span-2 sm:grid-cols-3">
              @for (n of numberFields; track n.key) {
                <app-obj-field
                  [label]="n.label | transloco"
                  [inputId]="fid(n.key)"
                  page="kpiForm"
                  [help]="n.help"
                  [errorKey]="isNaNField(n.key) ? 'objectives.errors.invalid_number' : null"
                >
                  <input
                    [id]="fid(n.key)"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    [attr.aria-invalid]="isNaNField(n.key) || null"
                    [value]="form()[n.key]"
                    (input)="set(n.key, $any($event.target).value)"
                  />
                </app-obj-field>
              }
            </div>
            @if (thresholdProblem(); as code) {
              <p class="text-meta text-fail-ink sm:col-span-2" role="alert">
                {{ 'objectives.errors.' + code | transloco }}
              </p>
            } @else if (readingText(); as reading) {
              <p
                class="rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg sm:col-span-2"
                data-testid="threshold-reading"
                aria-live="polite"
              >
                {{ reading }}
              </p>
            }
          </app-form-section>

          <app-form-section
            [title]="'objectives.kpiForm.group3' | transloco"
            [description]="'objectives.kpiForm.group3Hint' | transloco"
          >
            <app-obj-field
              [label]="'objectives.kpiFields.frequency' | transloco"
              [inputId]="fid('frequency')"
              page="kpiForm"
              help="frequency"
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
            </app-obj-field>
            <app-obj-field
              [label]="'objectives.kpiFields.startDate' | transloco"
              [inputId]="fid('start')"
              page="kpiForm"
              help="startDate"
            >
              <app-date-input
                [inputId]="fid('start')"
                [value]="form().start_date"
                (changed)="set('start_date', $event)"
              />
            </app-obj-field>
            <app-obj-field
              [label]="'objectives.kpiFields.owner' | transloco"
              [inputId]="fid('owner')"
              page="kpiForm"
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
              [label]="'objectives.kpiFields.evaluatedBy' | transloco"
              [inputId]="fid('evaluator')"
              page="kpiForm"
              help="evaluatedBy"
            >
              <app-objectives-owner-select
                kind="user"
                [inputId]="fid('evaluator')"
                [value]="form().evaluated_by_user_id"
                [currentName]="original()?.evaluated_by?.name ?? null"
                (valueChange)="set('evaluated_by_user_id', $event)"
              />
            </app-obj-field>
            <app-obj-field
              [label]="'objectives.kpiFields.reviewForum' | transloco"
              [inputId]="fid('forum')"
              page="kpiForm"
              help="reviewForum"
            >
              <input
                [id]="fid('forum')"
                type="text"
                maxlength="255"
                [value]="form().review_forum"
                (input)="set('review_forum', $any($event.target).value)"
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
              [span]="id() ? 'half' : 'full'"
              [label]="'objectives.kpiFields.dataSource' | transloco"
              [inputId]="fid('source')"
              page="kpiForm"
              help="dataSource"
            >
              <input
                [id]="fid('source')"
                type="text"
                maxlength="255"
                [value]="form().data_source"
                (input)="set('data_source', $any($event.target).value)"
              />
            </app-obj-field>
            @if (id()) {
              <app-obj-field
                [label]="'objectives.fields.status' | transloco"
                [inputId]="fid('status')"
                page="kpiForm"
                help="status"
              >
                <select [id]="fid('status')" (change)="set('status', $any($event.target).value)">
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="form().status === s">
                      {{ statusKey(s) | transloco }}
                    </option>
                  }
                </select>
              </app-obj-field>
            }
            <app-obj-field
              span="full"
              [label]="'objectives.kpiFields.remindersLabel' | transloco"
              [hint]="'objectives.kpiForm.remindersHint' | transloco"
            >
              <div
                class="flex min-h-10 items-center rounded-tile border border-border bg-bg px-3 py-2"
              >
                <app-switch
                  [checked]="form().measurement_reminders"
                  (checkedChange)="set('measurement_reminders', $event)"
                >
                  {{ 'objectives.kpiFields.reminders' | transloco }}
                </app-switch>
              </div>
            </app-obj-field>
          </app-form-section>

          @if (id()) {
            <app-form-section [columns]="1">
              <app-obj-field
                [label]="'objectives.fields.changeReason' | transloco"
                [inputId]="fid('reason')"
                page="kpiForm"
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
            </app-form-section>
          }

          <app-form-actions>
            <app-button variant="secondary" (click)="cancel()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="saving()"
              data-testid="kpi-save"
            >
              {{ (id() ? 'objectives.form.save' : 'objectives.kpiForm.create') | transloco }}
            </app-button>
          </app-form-actions>
        </form>

        <div class="mt-6"><app-why-it-matters [scope]="scope" page="kpiForm" /></div>
      }
    </div>
  `,
})
export class KpiEditor {
  private readonly api = inject(ObjectivesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly flows = inject(CreateFlowService);

  /** Route param `:id` when editing. */
  readonly id = input<string | undefined>(undefined);
  /** Query param `?objective=` to link a new KPI to an objective. */
  readonly objective = input<string | undefined>(undefined);
  /** `?focus=target` ("Juster målverdi" on an off-track KPI). */
  readonly focus = input<string | undefined>(undefined);

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

  /** "Create from here" (objective → KPI): objective, system, owner and department. */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), { targetType: 'kpi' });

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
  /** The thresholds in plain words ("4 or less is on track; 5-8 at risk; above 8 off track"). */
  protected readonly readingText = computed(() => {
    const p = this.payload();
    if (p.target_value === null || Number.isNaN(p.target_value)) {
      return null;
    }
    const unit = this.form().unit.trim();
    const v = (n: number) =>
      `${formatNumber(n, this.language.locale(), '1.0-2')}${unit ? ' ' + unit : ''}`;
    const dir = p.direction;
    if (p.warning_value === null || Number.isNaN(p.warning_value)) {
      return this.language.translate(`objectives.kpiForm.reading.${dir}NoWarning`, {
        target: v(p.target_value),
      });
    }
    return this.language.translate(`objectives.kpiForm.reading.${dir}`, {
      target: v(p.target_value),
      warning: v(p.warning_value),
    });
  });
  protected readonly orphanObjective = computed(() => {
    const ref = this.original()?.objective;
    const id = this.form().objective_id;
    return ref && ref.id === id && !this.objectives().some((o) => o.id === id) ? ref : null;
  });
  private readonly fromObjective = computed(
    () => this.objective() ?? str(this.flow()?.prefill['objective_id']) ?? undefined,
  );
  protected readonly backLink = computed(() => {
    const id = this.id();
    if (id) {
      return ['/objectives/kpis', id];
    }
    const objective = this.fromObjective();
    return objective ? ['/objectives', objective] : ['/objectives/kpis'];
  });
  protected readonly backLabelKey = computed(() =>
    this.id()
      ? 'objectives.common.backToKpi'
      : this.fromObjective()
        ? 'objectives.common.backToObjective'
        : 'objectives.common.backToKpis',
  );
  protected readonly breadcrumbs = computed(() => {
    const k = this.original();
    return k
      ? [
          OBJECTIVES_ROOT_CRUMB,
          KPIS_CRUMB,
          { label: k.code, link: ['/objectives/kpis', k.id] },
          { labelKey: 'objectives.kpiForm.editTitle' },
        ]
      : [OBJECTIVES_ROOT_CRUMB, KPIS_CRUMB, { labelKey: 'objectives.kpiForm.newTitle' }];
  });
  protected readonly askDefinitionPrompt = computed(() =>
    this.language.translate('objectives.ai.prompts.askKpiDefinition', {
      name: this.form().name || '-',
    }),
  );

  private request = new Subscription();
  private objectivesRequest = new Subscription();
  private prefillRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.objectivesRequest.unsubscribe();
      this.prefillRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'kpi',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title:
        this.original()?.name ??
        this.language.translate(
          this.id() ? 'objectives.kpiForm.editTitle' : 'objectives.kpiForm.newTitle',
        ),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const objective = this.fromObjective();
      untracked(() => this.load(orgId, id, objective));
    });
    // Flow prefill (objective → KPI): only fills what is still empty.
    effect(() => {
      const prefill = this.flow()?.prefill;
      if (!prefill || this.id()) {
        return;
      }
      untracked(() =>
        this.form.update((f) => ({
          ...f,
          objective_id: f.objective_id ?? str(prefill['objective_id']),
          management_system:
            f.management_system ||
            ((str(prefill['management_system']) as ManagementSystem | null) ?? ''),
          owner_user_id: f.owner_user_id ?? str(prefill['owner_user_id']),
          department_id: f.department_id ?? str(prefill['department_id']),
        })),
      );
    });
    effect(() => {
      if (this.focus() === 'target' && this.state() === 'ready' && this.id()) {
        untracked(() =>
          setTimeout(() => {
            const el = document.getElementById(this.fid('target_value'));
            el?.scrollIntoView?.({ block: 'center' });
            el?.focus({ preventScroll: true });
          }),
        );
      }
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
    if (!this.id()) {
      this.flows.cancel();
    }
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
        if (!id) {
          // objective → KPI writes no link (the objective field relates them); this ends the flow.
          this.flows
            .complete(saved.id, 'kpi')
            .pipe(catchError(() => of(null)))
            .subscribe();
        }
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
    this.prefillRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.objectivesRequest = this.api
      .list(orgId, { status: ['draft', 'active'], sort: 'code', limit: 200 })
      .subscribe({ next: (page) => this.objectives.set(page.items), error: () => undefined });
    if (!id) {
      this.form.update((f) => ({
        ...EMPTY_KPI_FORM,
        ...this.keepPrefill(f),
        objective_id: objective ?? f.objective_id,
      }));
      if (objective) {
        // Take the objective's system, owner and department as sensible defaults.
        this.prefillRequest = this.api.get(orgId, objective).subscribe({
          next: (o) =>
            this.form.update((f) => ({
              ...f,
              management_system: f.management_system || (o.management_system ?? ''),
              owner_user_id: f.owner_user_id ?? o.owner?.id ?? null,
              department_id: f.department_id ?? o.department_id,
            })),
          error: () => undefined,
        });
      }
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

  /** Values a flow may already have filled in before the form (re)loads. */
  private keepPrefill(f: KpiFormValue): Partial<KpiFormValue> {
    return {
      objective_id: f.objective_id,
      management_system: f.management_system,
      owner_user_id: f.owner_user_id,
      department_id: f.department_id,
    };
  }
}

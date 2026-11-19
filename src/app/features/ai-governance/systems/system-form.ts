import { AcceptedSuggestion, FormSuggest } from '../../../shared/ask/form-suggest';
import { suggestDefs, suggestPatch, suggestValues } from '../../../shared/ask/form-suggest-map';
import { SYSTEM_SUGGEST_FIELDS, SYSTEM_SUGGEST_KEY } from './system-suggest';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { Term } from '../../../shared/guidance/term';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { dayOf, dueAtFromDay } from '../../../shared/tasks/task-display';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import {
  AI_ACT_ROLES,
  AiActRole,
  AiSystem,
  AiSystemWrite,
  EntityRef,
  MONITORING_KINDS,
  MonitoringKind,
  MonitoringMetric,
  SYSTEM_STATUSES,
  SystemStatus,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_SYSTEM_ENTITY,
  monitoringKindKey,
  parseTags,
  roleKey,
  statusKey,
} from '../data/ai-governance-display';
import { AiField } from '../ui/ai-field';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiRecordPicker } from '../ui/record-picker';
import { AiUserSelect } from '../ui/user-select';

/** One editable metric definition (threshold as text). */
export interface MetricDraft {
  key: string | null;
  metric: string;
  kind: MonitoringKind;
  threshold: string;
  direction: 'min' | 'max';
  unit: string;
}

/** The editable fields of the form (tags as text, linked records as refs). */
export interface SystemFormValue {
  name: string;
  description: string;
  intended_purpose: string;
  ai_act_role: AiActRole;
  status: SystemStatus;
  supplier: EntityRef | null;
  provider_name: string;
  models: string;
  data_categories: string;
  uses_personal_data: boolean;
  processing_activity: EntityRef | null;
  owner_user_id: string;
  overseer_user_ids: string[];
  department_id: string;
  next_review: string;
  metrics: MetricDraft[];
}

export function emptySystemForm(): SystemFormValue {
  return {
    name: '',
    description: '',
    intended_purpose: '',
    ai_act_role: 'deployer',
    status: 'planned',
    supplier: null,
    provider_name: '',
    models: '',
    data_categories: '',
    uses_personal_data: false,
    processing_activity: null,
    owner_user_id: '',
    overseer_user_ids: [],
    department_id: '',
    next_review: '',
    metrics: [],
  };
}

function metricToDraft(m: MonitoringMetric): MetricDraft {
  return {
    key: m.key ?? null,
    metric: m.metric,
    kind: m.kind,
    threshold: m.threshold === null || m.threshold === undefined ? '' : String(m.threshold),
    direction: m.direction === 'max' ? 'max' : 'min',
    unit: m.unit ?? '',
  };
}

export function systemToForm(s: AiSystem): SystemFormValue {
  return {
    name: s.name,
    description: s.description ?? '',
    intended_purpose: s.intended_purpose ?? '',
    ai_act_role: s.ai_act_role,
    status: s.status,
    supplier: s.supplier_id ? (s.supplier ?? null) : null,
    provider_name: s.provider_name ?? '',
    models: s.models.join(', '),
    data_categories: s.data_categories.join(', '),
    uses_personal_data: s.uses_personal_data,
    processing_activity: s.processing_activity_id ? (s.processing_activity ?? null) : null,
    owner_user_id: s.owner?.id ?? '',
    overseer_user_ids: (s.overseers ?? []).map((o) => o.id),
    department_id: s.department_id ?? '',
    next_review: dayOf(s.next_review_at),
    metrics: (s.monitoring_metrics ?? []).map(metricToDraft),
  };
}

function parseThreshold(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(value) ? value : null;
}

/** The request body of a form value (blank text becomes null). */
export function formToRequest(v: SystemFormValue): AiSystemWrite {
  const text = (value: string): string | null => value.trim() || null;
  return {
    name: v.name.trim(),
    description: text(v.description),
    intended_purpose: text(v.intended_purpose),
    ai_act_role: v.ai_act_role,
    status: v.status,
    provider_name: text(v.provider_name),
    models: parseTags(v.models),
    data_categories: parseTags(v.data_categories),
    uses_personal_data: v.uses_personal_data,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    next_review_at: dueAtFromDay(v.next_review),
    supplier_id: v.supplier?.entity_id ?? null,
    processing_activity_id: v.uses_personal_data
      ? (v.processing_activity?.entity_id ?? null)
      : null,
    overseer_user_ids: [...new Set(v.overseer_user_ids)],
    monitoring_metrics: v.metrics
      .filter((m) => m.metric.trim())
      .map((m) => ({
        key: m.key,
        metric: m.metric.trim(),
        kind: m.kind,
        threshold: parseThreshold(m.threshold),
        direction: m.direction,
        unit: m.unit.trim() || null,
      })),
  };
}

/**
 * `/ai-governance/systems/new` and `/ai-governance/systems/:id/edit`: register
 * or edit an AI system. Four parts: what the system is (purpose, AI Act role,
 * status), where it comes from and which data it uses (a Suppliers record, a
 * Privacy processing activity when it uses personal data), who is accountable
 * (owner, human oversight, department, next review) and what is measured
 * (metric definitions with thresholds, so monitoring results are judged
 * automatically). Editing asks for a change reason, stored with the revision.
 */
@Component({
  selector: 'app-ai-system-form',
  imports: [
    TranslocoPipe,
    FormSuggest,
    AskAbout,
    Term,
    Alert,
    Button,
    Card,
    ErrorState,
    Icon,
    LoadingState,
    AiField,
    AiGovPage,
    AiRecordPicker,
    AiUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      [titleKey]="id() ? 'aiGovernance.systemForm.editTitle' : 'aiGovernance.systemForm.newTitle'"
      [breadcrumbs]="crumbs()"
      page="systemForm"
      [nav]="false"
      [why]="false"
      [backLink]="id() ? ['/ai-governance/systems', id()] : '/ai-governance/systems'"
    >
      @if (loadError()) {
        <app-error-state (retry)="load()" />
      } @else if (ready()) {
        <form
          class="flex max-w-[760px] flex-col gap-5"
          (submit)="$event.preventDefault(); submit()"
          novalidate
        >
          <app-form-suggest
            [suggestKey]="suggestKey"
            labelKey="ask.formSuggest.labels.aiSystem"
            [fields]="suggestFields()"
            [values]="suggestValues()"
            [context]="{ from: 'ai_governance' }"
            [editing]="!!id()"
            [titleOnly]="!!form().name.trim() && !form().intended_purpose.trim()"
            (applied)="applySuggestion($event)"
          />
          <app-card>
            <h2 class="mb-4 font-display text-section font-bold text-fg">
              {{ 'aiGovernance.systemForm.sections.what' | transloco }}
            </h2>
            <div class="flex flex-col gap-4">
              <app-ai-field
                inputId="ais-name"
                labelKey="aiGovernance.fields.name"
                [required]="true"
                helpField="name"
                [error]="
                  submitted() && !form().name.trim() ? 'aiGovernance.errors.name_required' : null
                "
              >
                <input
                  id="ais-name"
                  type="text"
                  maxlength="200"
                  required
                  [value]="form().name"
                  (input)="patch({ name: $any($event.target).value })"
                  [attr.aria-invalid]="submitted() && !form().name.trim()"
                />
              </app-ai-field>
              <app-ai-field
                inputId="ais-purpose"
                labelKey="aiGovernance.fields.intendedPurpose"
                helpField="intended_purpose"
              >
                <app-ask-about
                  ask
                  [prompt]="'aiGovernance.systemForm.askPurpose' | transloco"
                  field="intended_purpose"
                  labelKey="aiGovernance.wizard.askAbout"
                />
                <textarea
                  id="ais-purpose"
                  rows="3"
                  maxlength="10000"
                  [value]="form().intended_purpose"
                  (input)="patch({ intended_purpose: $any($event.target).value })"
                ></textarea>
              </app-ai-field>
              <app-ai-field
                inputId="ais-desc"
                labelKey="aiGovernance.fields.description"
                helpField="description"
              >
                <textarea
                  id="ais-desc"
                  rows="3"
                  maxlength="10000"
                  [value]="form().description"
                  (input)="patch({ description: $any($event.target).value })"
                ></textarea>
              </app-ai-field>
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <app-ai-field
                  inputId="ais-role"
                  labelKey="aiGovernance.fields.role"
                  helpField="ai_act_role"
                >
                  <app-ask-about
                    ask
                    [prompt]="'aiGovernance.systemForm.askRole' | transloco"
                    field="ai_act_role"
                    labelKey="aiGovernance.wizard.askAbout"
                  />
                  <select
                    id="ais-role"
                    (change)="patch({ ai_act_role: $any($event.target).value })"
                  >
                    @for (r of roles; track r) {
                      <option [value]="r" [selected]="form().ai_act_role === r">
                        {{ roleKey(r) | transloco }}
                      </option>
                    }
                  </select>
                  <span hint>{{ 'aiGovernance.roleHelp.' + form().ai_act_role | transloco }}</span>
                </app-ai-field>
                <app-ai-field inputId="ais-status" labelKey="aiGovernance.fields.status">
                  <select id="ais-status" (change)="patch({ status: $any($event.target).value })">
                    @for (s of statuses; track s) {
                      <option [value]="s" [selected]="form().status === s">
                        {{ statusKey(s) | transloco }}
                      </option>
                    }
                  </select>
                </app-ai-field>
              </div>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-4 font-display text-section font-bold text-fg">
              {{ 'aiGovernance.systemForm.sections.source' | transloco }}
            </h2>
            <div class="flex flex-col gap-4">
              <app-ai-field
                inputId="ais-supplier"
                labelKey="aiGovernance.fields.supplier"
                helpField="supplier"
                [plain]="true"
              >
                <app-ai-record-picker
                  inputId="ais-supplier"
                  [types]="['supplier']"
                  [value]="form().supplier"
                  placeholderKey="aiGovernance.systemForm.supplierPlaceholder"
                  (picked)="patch({ supplier: $event })"
                  (cleared)="patch({ supplier: null })"
                  data-testid="system-supplier"
                />
                <span hint>{{ 'aiGovernance.systemForm.supplierHint' | transloco }}</span>
              </app-ai-field>
              <app-ai-field
                inputId="ais-provider"
                labelKey="aiGovernance.fields.provider"
                helpField="provider_name"
              >
                <input
                  id="ais-provider"
                  type="text"
                  maxlength="200"
                  [value]="form().provider_name"
                  (input)="patch({ provider_name: $any($event.target).value })"
                />
              </app-ai-field>
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <app-ai-field
                  inputId="ais-models"
                  labelKey="aiGovernance.fields.models"
                  helpField="models"
                >
                  <input
                    id="ais-models"
                    type="text"
                    [placeholder]="'aiGovernance.systemForm.tagsPlaceholder' | transloco"
                    [value]="form().models"
                    (input)="patch({ models: $any($event.target).value })"
                  />
                </app-ai-field>
                <app-ai-field
                  inputId="ais-data"
                  labelKey="aiGovernance.fields.dataCategories"
                  helpField="data_categories"
                >
                  <input
                    id="ais-data"
                    type="text"
                    [placeholder]="'aiGovernance.systemForm.tagsPlaceholder' | transloco"
                    [value]="form().data_categories"
                    (input)="patch({ data_categories: $any($event.target).value })"
                  />
                </app-ai-field>
              </div>
              <label class="inline-flex min-h-8 items-center gap-2 text-body text-fg">
                <input
                  type="checkbox"
                  [checked]="form().uses_personal_data"
                  (change)="patch({ uses_personal_data: $any($event.target).checked })"
                  data-testid="system-personal-data"
                />
                {{ 'aiGovernance.fields.usesPersonalData' | transloco }}
              </label>
              @if (form().uses_personal_data) {
                <app-ai-field
                  inputId="ais-ropa"
                  labelKey="aiGovernance.fields.processingActivity"
                  helpField="processing_activity"
                  [plain]="true"
                >
                  <app-ai-record-picker
                    inputId="ais-ropa"
                    [types]="['ropa_entry']"
                    [value]="form().processing_activity"
                    placeholderKey="aiGovernance.systemForm.ropaPlaceholder"
                    (picked)="patch({ processing_activity: $event })"
                    (cleared)="patch({ processing_activity: null })"
                    data-testid="system-ropa"
                  />
                  <span hint>{{ 'aiGovernance.systemForm.ropaHint' | transloco }}</span>
                </app-ai-field>
              }
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-4 font-display text-section font-bold text-fg">
              {{ 'aiGovernance.systemForm.sections.people' | transloco }}
            </h2>
            <div class="flex flex-col gap-4">
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <app-ai-field
                  inputId="ais-owner"
                  labelKey="aiGovernance.fields.owner"
                  helpField="owner"
                  [plain]="true"
                >
                  <app-ai-user-select
                    selectId="ais-owner"
                    [value]="form().owner_user_id"
                    [currentName]="ownerName()"
                    (valueChange)="patch({ owner_user_id: $event })"
                  />
                </app-ai-field>
                <app-ai-field
                  inputId="ais-dept"
                  labelKey="aiGovernance.fields.department"
                  helpField="department"
                >
                  <select
                    id="ais-dept"
                    (change)="patch({ department_id: $any($event.target).value })"
                  >
                    <option value="" [selected]="!form().department_id">
                      {{ 'aiGovernance.common.notSet' | transloco }}
                    </option>
                    @for (d of departments(); track d.id) {
                      <option [value]="d.id" [selected]="form().department_id === d.id">
                        {{ d.name }}
                      </option>
                    }
                  </select>
                </app-ai-field>
              </div>
              <app-ai-field
                inputId="ais-overseer"
                labelKey="aiGovernance.fields.overseers"
                helpField="overseers"
                [plain]="true"
              >
                <app-ask-about
                  ask
                  [prompt]="'aiGovernance.systemForm.askOversight' | transloco"
                  field="overseers"
                  labelKey="aiGovernance.wizard.askAbout"
                />
                @if (overseerList().length) {
                  <ul class="mb-2 flex flex-wrap gap-1.5" data-testid="system-overseers">
                    @for (o of overseerList(); track o.id) {
                      <li
                        class="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-surface py-0.5 pr-1 pl-2.5 text-ui text-fg"
                      >
                        {{ o.name }}
                        <button
                          type="button"
                          class="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                          [attr.aria-label]="
                            'aiGovernance.systemForm.removeOverseer' | transloco: { name: o.name }
                          "
                          (click)="removeOverseer(o.id)"
                        >
                          <app-icon name="x" [size]="12" />
                        </button>
                      </li>
                    }
                  </ul>
                }
                @if (form().overseer_user_ids.length < maxOverseers) {
                  @for (k of [pickKey()]; track k) {
                    <app-ai-user-select
                      selectId="ais-overseer"
                      noneKey="aiGovernance.systemForm.addOverseer"
                      [value]="''"
                      (valueChange)="addOverseer($event)"
                    />
                  }
                }
                <span hint>
                  <app-term scope="ai-governance" key="human-oversight">{{
                    'aiGovernance.systemForm.oversightTerm' | transloco
                  }}</app-term>
                  {{ 'aiGovernance.systemForm.oversightHint' | transloco }}
                </span>
              </app-ai-field>
              <app-ai-field
                inputId="ais-review"
                labelKey="aiGovernance.fields.nextReview"
                helpField="next_review"
              >
                <input
                  id="ais-review"
                  type="date"
                  [value]="form().next_review"
                  (input)="patch({ next_review: $any($event.target).value })"
                />
              </app-ai-field>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-1 font-display text-section font-bold text-fg">
              {{ 'aiGovernance.systemForm.sections.metrics' | transloco }}
            </h2>
            <p class="mb-4 text-ui text-fg-muted">
              {{ 'aiGovernance.systemForm.metricsHint' | transloco }}
            </p>
            @if (form().metrics.length) {
              <ul class="mb-3 flex flex-col gap-3" data-testid="system-metrics">
                @for (m of form().metrics; track $index; let i = $index) {
                  <li class="rounded-tile border border-border bg-surface-2 p-3">
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                      <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
                        {{ 'aiGovernance.monitoring.metric' | transloco }}
                        <input
                          type="text"
                          maxlength="120"
                          class="h-9 rounded-tile border border-border bg-bg px-3 text-ui font-normal text-fg"
                          [placeholder]="'aiGovernance.monitoring.metricPlaceholder' | transloco"
                          [value]="m.metric"
                          (input)="patchMetric(i, { metric: $any($event.target).value })"
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
                        {{ 'aiGovernance.monitoring.kind' | transloco }}
                        <select
                          class="h-9 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
                          (change)="patchMetric(i, { kind: $any($event.target).value })"
                        >
                          @for (k of kinds; track k) {
                            <option [value]="k" [selected]="m.kind === k">
                              {{ kindKey(k) | transloco }}
                            </option>
                          }
                        </select>
                      </label>
                    </div>
                    <div
                      class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end"
                    >
                      <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
                        {{ 'aiGovernance.monitoring.threshold' | transloco }}
                        <input
                          type="text"
                          inputmode="decimal"
                          class="h-9 rounded-tile border border-border bg-bg px-3 text-ui font-normal text-fg"
                          [value]="m.threshold"
                          (input)="patchMetric(i, { threshold: $any($event.target).value })"
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
                        {{ 'aiGovernance.systemForm.direction' | transloco }}
                        <select
                          class="h-9 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
                          (change)="patchMetric(i, { direction: $any($event.target).value })"
                        >
                          <option value="min" [selected]="m.direction === 'min'">
                            {{ 'aiGovernance.systemForm.directionMin' | transloco }}
                          </option>
                          <option value="max" [selected]="m.direction === 'max'">
                            {{ 'aiGovernance.systemForm.directionMax' | transloco }}
                          </option>
                        </select>
                      </label>
                      <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
                        {{ 'aiGovernance.systemForm.unit' | transloco }}
                        <input
                          type="text"
                          maxlength="20"
                          class="h-9 rounded-tile border border-border bg-bg px-3 text-ui font-normal text-fg"
                          [value]="m.unit"
                          (input)="patchMetric(i, { unit: $any($event.target).value })"
                        />
                      </label>
                      <app-button
                        size="sm"
                        variant="ghost"
                        [attr.aria-label]="
                          'aiGovernance.systemForm.removeMetric'
                            | transloco: { metric: m.metric || i + 1 }
                        "
                        (click)="removeMetric(i)"
                      >
                        <app-icon name="trash" [size]="14" />
                      </app-button>
                    </div>
                  </li>
                }
              </ul>
            }
            @if (form().metrics.length < maxMetrics) {
              <app-button
                size="sm"
                variant="secondary"
                (click)="addMetric()"
                data-testid="metric-add"
              >
                <app-icon name="plus" [size]="14" />
                {{ 'aiGovernance.systemForm.addMetric' | transloco }}
              </app-button>
            }
          </app-card>

          @if (id()) {
            <app-card>
              <app-ai-field inputId="ais-reason" labelKey="aiGovernance.fields.changeReason">
                <input
                  id="ais-reason"
                  type="text"
                  maxlength="1000"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
                <span hint>{{ 'aiGovernance.systemForm.changeReasonHint' | transloco }}</span>
              </app-ai-field>
            </app-card>
          }
          @if (error()) {
            <app-alert tone="error">{{ error()! | transloco }}</app-alert>
          }
          <div
            class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
          >
            <app-button variant="secondary" (click)="cancel()">{{
              'aiGovernance.common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()" data-testid="system-save">
              {{
                (id() ? 'aiGovernance.common.save' : 'aiGovernance.systemForm.create') | transloco
              }}
            </app-button>
          </div>
        </form>
      } @else {
        <app-loading-state [rows]="6" />
      }
    </app-ai-gov-page>
  `,
})
export class AiSystemForm {
  private readonly api = inject(AiGovernanceApi);
  private readonly assigneeOptions = inject(AssigneeOptionsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Route param on the edit page; absent on "new". */
  readonly id = input<string | undefined>(undefined);

  protected readonly roles = AI_ACT_ROLES;
  protected readonly statuses = SYSTEM_STATUSES;
  protected readonly kinds = MONITORING_KINDS;
  protected readonly roleKey = roleKey;
  protected readonly statusKey = statusKey;
  protected readonly kindKey = monitoringKindKey;
  protected readonly maxOverseers = 20;
  protected readonly maxMetrics = 30;

  protected readonly form = signal<SystemFormValue>(emptySystemForm());
  protected readonly suggestKey = SYSTEM_SUGGEST_KEY;
  protected readonly suggestFields = computed(() =>
    suggestDefs(SYSTEM_SUGGEST_FIELDS, (key, params) => this.language.translate(key, params)),
  );
  protected readonly suggestValues = computed(() =>
    suggestValues(SYSTEM_SUGGEST_FIELDS, this.form()),
  );

  /** Accepted whole-form suggestions fill the form; nothing is saved until "Save". */
  protected applySuggestion(accepted: AcceptedSuggestion): void {
    const change = suggestPatch(SYSTEM_SUGGEST_FIELDS, accepted) as Partial<SystemFormValue>;
    this.form.update((f) => ({ ...f, ...change }));
  }
  protected readonly ownerName = signal<string | null>(null);
  private readonly knownNames = signal<Readonly<Record<string, string>>>({});
  protected readonly changeReason = signal('');
  protected readonly systemName = signal<string | null>(null);
  /** Departments of the org (from the shared people / department options). */
  protected readonly departments = computed(() =>
    this.assigneeOptions
      .options()
      .departments.filter((d) => d.value.startsWith('department:'))
      .map((d) => ({ id: d.value.slice('department:'.length), name: d.label })),
  );
  private readonly userNames = computed(() => {
    const names: Record<string, string> = { ...this.knownNames() };
    for (const u of this.assigneeOptions.options().users) {
      if (u.value.startsWith('user:')) {
        names[u.value.slice(5)] = u.label;
      }
    }
    return names;
  });
  protected readonly overseerList = computed(() =>
    this.form().overseer_user_ids.map((id) => ({ id, name: this.userNames()[id] ?? id })),
  );
  protected readonly crumbs = computed(() => {
    const id = this.id();
    const list = { labelKey: 'aiGovernance.systems.title', link: '/ai-governance/systems' };
    return id
      ? [
          list,
          { label: this.systemName() ?? '…', link: ['/ai-governance/systems', id] },
          { labelKey: 'aiGovernance.common.edit' },
        ]
      : [list, { labelKey: 'aiGovernance.systemForm.newTitle' }];
  });
  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly ready = computed(() => !this.id() || this.loaded());
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.form().name || this.language.translate('aiGovernance.systemForm.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.id();
      untracked(() => {
        if (orgId) {
          this.load();
        }
      });
    });
  }

  protected load(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const id = this.id();
    if (!orgId) {
      return;
    }
    this.assigneeOptions.ensureLoaded();
    if (!id) {
      return;
    }
    this.loadError.set(null);
    this.api.getSystem(orgId, id).subscribe({
      next: (system) => {
        this.form.set(systemToForm(system));
        this.ownerName.set(system.owner?.name ?? null);
        this.systemName.set(system.name);
        this.knownNames.set(
          Object.fromEntries((system.overseers ?? []).map((o) => [o.id, o.name] as const)),
        );
        this.loaded.set(true);
      },
      error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
    });
  }

  protected patch(change: Partial<SystemFormValue>): void {
    this.form.update((v) => ({ ...v, ...change }));
  }

  /** Re-creates the "add a person" select so it is empty again after each pick. */
  protected readonly pickKey = signal(0);

  protected addOverseer(id: string): void {
    this.pickKey.update((n) => n + 1);
    if (!id || this.form().overseer_user_ids.includes(id)) {
      return;
    }
    this.form.update((v) => ({ ...v, overseer_user_ids: [...v.overseer_user_ids, id] }));
  }

  protected removeOverseer(id: string): void {
    this.form.update((v) => ({
      ...v,
      overseer_user_ids: v.overseer_user_ids.filter((x) => x !== id),
    }));
  }

  protected addMetric(): void {
    this.form.update((v) => ({
      ...v,
      metrics: [
        ...v.metrics,
        { key: null, metric: '', kind: 'accuracy', threshold: '', direction: 'min', unit: '' },
      ],
    }));
  }

  protected patchMetric(index: number, change: Partial<MetricDraft>): void {
    this.form.update((v) => ({
      ...v,
      metrics: v.metrics.map((m, i) => (i === index ? { ...m, ...change } : m)),
    }));
  }

  protected removeMetric(index: number): void {
    this.form.update((v) => ({ ...v, metrics: v.metrics.filter((_, i) => i !== index) }));
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/ai-governance/systems', id] : ['/ai-governance/systems']);
  }

  protected submit(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || !this.form().name.trim()) {
      return;
    }
    const body = formToRequest(this.form());
    const id = this.id();
    this.saving.set(true);
    this.error.set(null);
    const request$ = id
      ? this.api.updateSystem(orgId, id, {
          ...body,
          change_reason: this.changeReason().trim() || null,
        })
      : this.api.createSystem(orgId, body);
    request$.subscribe({
      next: (system) => {
        this.saving.set(false);
        this.notifications.success(
          id ? 'aiGovernance.systemForm.updated' : 'aiGovernance.systemForm.created',
          { code: system.code },
        );
        void this.router.navigate(['/ai-governance/systems', system.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(aiGovernanceErrorKey(err));
      },
    });
  }
}

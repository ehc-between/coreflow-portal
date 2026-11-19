import { AcceptedSuggestion, FormSuggest } from '../../../shared/ask/form-suggest';
import {
  SuggestFieldSpec,
  suggestDefs,
  suggestPatch,
  suggestValues,
} from '../../../shared/ask/form-suggest-map';
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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { CustomerPicker, CustomerRef, CustomersAvailability } from '../../../shared/customers';
import { AuditAccess } from '../data/audit-access';
import {
  fromDateInput,
  frameworksOfClauses,
  listParam,
  textOrNull,
  toDateInput,
} from '../data/audit-display';
import { AuditFrameworks } from '../data/audit-frameworks';
import {
  Certification,
  EXTERNAL_PARTY_TYPES,
  EntityRef,
  ExternalPartyType,
  ListResponse,
  PLAN_KINDS,
  PlanDetail,
  PlanInput,
  PlanKind,
  Programme,
  RISK_LEVELS,
  RiskLevel,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { certificationTitle } from '../certifications/certification-list';
import { AuditField } from '../shared/audit-field';
import { AuditChoiceCheckboxes, Choice } from '../shared/choice-checkboxes';
import { AuditFormPage } from '../shared/form-page';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditRecordSelect } from '../shared/record-picker';
import { AuditUserSelect } from '../shared/user-select';

/** The form state of an audit plan. */
export interface PlanFormValue {
  title: string;
  kind: PlanKind;
  programmeId: string;
  certificationId: string;
  partyType: ExternalPartyType | '';
  partyName: string;
  /** The customer (customer register) when the party is a customer; '' = none. */
  customerId: string;
  customer: CustomerRef | null;
  scope: string;
  criteria: string;
  criteriaDocuments: EntityRef[];
  objectives: string;
  frameworks: string[];
  clauseRefs: string[];
  processes: EntityRef[];
  departments: string[];
  auditees: string[];
  distribution: string[];
  location: string;
  risk: RiskLevel;
  start: string;
  end: string;
  ownerId: string;
  changeReason: string;
}

export function emptyPlanForm(): PlanFormValue {
  return {
    title: '',
    kind: 'internal',
    programmeId: '',
    certificationId: '',
    partyType: '',
    partyName: '',
    customerId: '',
    customer: null,
    scope: '',
    criteria: '',
    criteriaDocuments: [],
    objectives: '',
    frameworks: [],
    clauseRefs: [],
    processes: [],
    departments: [],
    auditees: [],
    distribution: [],
    location: '',
    risk: 'medium',
    start: '',
    end: '',
    ownerId: '',
    changeReason: '',
  };
}

/** The plan form's whole-form suggestion (server key `audits.plan`). */
const PLAN_SUGGEST_FIELDS: readonly SuggestFieldSpec[] = [
  { name: 'title', labelKey: 'audits.fields.title', type: 'text' },
  {
    name: 'kind',
    labelKey: 'audits.fields.kind',
    type: 'enum',
    options: PLAN_KINDS,
    enumPrefix: 'audits.kind.',
  },
  { name: 'scope', labelKey: 'audits.fields.scope', type: 'long' },
  { name: 'criteria', labelKey: 'audits.fields.criteria', type: 'long' },
  { name: 'objectives', labelKey: 'audits.fields.objectives', type: 'long' },
  {
    name: 'frameworks',
    labelKey: 'audits.fields.frameworks',
    type: 'multi',
    enumPrefix: 'audits.frameworks.',
  },
  { name: 'processes', labelKey: 'audits.fields.processes', type: 'refs' },
  { name: 'departments', labelKey: 'audits.fields.departments', type: 'refs' },
  { name: 'auditees', labelKey: 'audits.fields.auditees', type: 'refs' },
  { name: 'location', labelKey: 'audits.fields.location', type: 'text' },
  {
    name: 'risk',
    labelKey: 'audits.fields.risk',
    type: 'enum',
    options: RISK_LEVELS,
    enumPrefix: 'audits.risk.',
  },
  { name: 'owner_user_id', labelKey: 'audits.fields.owner', type: 'ref', draftKey: 'ownerId' },
];

/** A placeholder ref for a record known only by id (shown until the plan is saved). */
function idRef(entityType: string, id: string, title: string): EntityRef {
  return {
    entity_type: entityType,
    entity_id: id,
    title,
    code: null,
    url: null,
    status: null,
    module: null,
    label_key: `modules.entities.${entityType}`,
  };
}

export function planToForm(p: PlanDetail): PlanFormValue {
  const processes =
    p.processes ?? (p.process_ids ?? []).map((id) => idRef('process', id, id.slice(0, 8)));
  const documents =
    p.criteria_documents ??
    (p.criteria_document_ids ?? []).map((id) => idRef('document', id, id.slice(0, 8)));
  return {
    title: p.title,
    kind: p.kind,
    programmeId: p.programme?.id ?? '',
    certificationId: p.certification_id ?? '',
    partyType: p.external_party_type ?? '',
    partyName: p.external_party_name ?? '',
    customerId: p.customer_id ?? '',
    customer: p.customer ?? null,
    scope: p.scope ?? '',
    criteria: p.criteria ?? '',
    criteriaDocuments: [...documents],
    objectives: p.objectives ?? '',
    frameworks: [...p.frameworks],
    clauseRefs: [...p.clause_refs],
    processes: [...processes],
    departments: [...p.auditee_department_ids],
    auditees: [...(p.auditee_user_ids ?? p.auditees?.map((u) => u.id) ?? [])],
    distribution: [...(p.distribution_user_ids ?? p.distribution?.map((u) => u.id) ?? [])],
    location: p.location ?? '',
    risk: p.risk_level,
    start: toDateInput(p.planned_start),
    end: toDateInput(p.planned_end),
    ownerId: p.owner?.id ?? '',
    changeReason: '',
  };
}

/** The request body of a plan form (external-only fields are cleared for internal audits). */
export function planFormToInput(v: PlanFormValue, editing: boolean): PlanInput {
  const external = v.kind === 'external';
  return {
    title: v.title.trim(),
    kind: v.kind,
    programme_id: v.programmeId || null,
    certification_id: external ? v.certificationId || null : null,
    external_party_type: external ? v.partyType || null : null,
    external_party_name: external ? textOrNull(v.partyName) : null,
    customer_id: external && v.partyType === 'customer' ? v.customerId || null : null,
    scope: textOrNull(v.scope),
    criteria: textOrNull(v.criteria),
    objectives: textOrNull(v.objectives),
    frameworks: v.frameworks,
    clause_refs: [...new Set(v.clauseRefs)],
    auditee_department_ids: v.departments,
    process_ids: v.processes.map((p) => p.entity_id),
    criteria_document_ids: v.criteriaDocuments.map((d) => d.entity_id),
    auditee_user_ids: v.auditees,
    distribution_user_ids: v.distribution,
    location: textOrNull(v.location),
    risk_level: v.risk,
    planned_start: fromDateInput(v.start),
    planned_end: fromDateInput(v.end),
    owner_user_id: v.ownerId || null,
    ...(editing ? { change_reason: textOrNull(v.changeReason) } : {}),
  };
}

/**
 * The canonical clause ref of a requirement ref (`iso9001-2026:8.4.1.r2` →
 * `iso9001:8.4.1`), so "Plan an audit" from a requirement page pre-fills the clause.
 */
export function clauseOfRequirement(ref: string | null | undefined): string | null {
  if (!ref || !ref.includes(':')) {
    return null;
  }
  const at = ref.indexOf(':');
  const framework = frameworkOf(ref.slice(0, at));
  const number = ref.slice(at + 1).replace(/\.r\d+$/, '');
  return framework && number ? `${framework}:${number}` : null;
}

/** Pre-filled values from the query (`?programme=`, `?clauses=`, a coverage gap, a requirement). */
export function planPrefill(
  q: { get(name: string): string | null },
  fromRequirement: string | null,
): Partial<PlanFormValue> {
  const clauses = listParam(q.get('clauses'));
  const fromReq = clauseOfRequirement(fromRequirement);
  if (fromReq && !clauses.includes(fromReq)) {
    clauses.push(fromReq);
  }
  const frameworks = listParam(q.get('frameworks'));
  for (const f of frameworksOfClauses(clauses)) {
    if (!frameworks.includes(f)) {
      frameworks.push(f);
    }
  }
  const processTitle = q.get('processTitle');
  // `?customer_id=` (the customer card's "+ Ny"): an external audit by that customer.
  const customerId = q.get('customer_id')?.trim() ?? '';
  return {
    programmeId: q.get('programme') ?? '',
    certificationId: q.get('certification') ?? '',
    kind:
      q.get('kind') === 'external' || q.get('certification') || customerId
        ? 'external'
        : 'internal',
    ...(customerId ? { customerId, partyType: 'customer' as const } : {}),
    clauseRefs: clauses,
    frameworks,
    processes: listParam(q.get('processes')).map((id) =>
      idRef('process', id, processTitle || id.slice(0, 8)),
    ),
    departments: listParam(q.get('departments')),
  };
}

/** `/audits/plans/new` and `/audits/plans/:id/edit`: plan an audit (scope, criteria, schedule). */
@Component({
  selector: 'app-audit-plan-form',
  imports: [
    FormSuggest,
    FormsModule,
    TranslocoPipe,
    AskAbout,
    ClausePicker,
    FlowBanner,
    AuditField,
    AuditFormPage,
    AuditChoiceCheckboxes,
    AuditRecordSelect,
    AuditUserSelect,
    CustomerPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-audit-form-page
      [titleKey]="id() ? 'audits.planForm.editTitle' : 'audits.planForm.newTitle'"
      guidePage="planForm"
      lesson="internal-audits"
      [breadcrumbs]="breadcrumbs()"
      [busy]="saving.busy()"
      [canSave]="valid()"
      [invalidKey]="invalidKey()"
      [ready]="!id() || existing.state() === 'ready'"
      (save)="save()"
      (cancelled)="back()"
    >
      <app-flow-banner before [flow]="flow()" />

      <app-form-suggest
        suggestKey="audits.plan"
        labelKey="ask.formSuggest.labels.auditPlan"
        [fields]="suggestFields()"
        [values]="suggestValues()"
        [context]="{ from: 'audits' }"
        [editing]="!!id()"
        [titleOnly]="!!f().title.trim() && !f().scope.trim()"
        (applied)="applySuggestion($event)"
      />

      <app-audit-field
        inputId="plan-title"
        labelKey="audits.fields.title"
        [required]="true"
        helpField="title"
        [error]="titleError()"
      >
        <input
          id="plan-title"
          required
          aria-required="true"
          maxlength="255"
          [value]="f().title"
          (input)="patch({ title: $any($event.target).value })"
        />
      </app-audit-field>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <app-audit-field inputId="plan-kind" labelKey="audits.fields.kind" helpField="kind">
          <select id="plan-kind" (change)="patch({ kind: $any($event.target).value })">
            @for (k of kinds; track k) {
              <option [value]="k" [selected]="f().kind === k">
                {{ 'audits.kind.' + k | transloco }}
              </option>
            }
          </select>
        </app-audit-field>
        <app-audit-field inputId="plan-risk" labelKey="audits.fields.risk" helpField="risk">
          <select id="plan-risk" (change)="patch({ risk: $any($event.target).value })">
            @for (r of risks; track r) {
              <option [value]="r" [selected]="f().risk === r">
                {{ 'audits.risk.' + r | transloco }}
              </option>
            }
          </select>
        </app-audit-field>
      </div>

      @if (f().kind === 'external') {
        <div
          class="grid grid-cols-1 gap-4 rounded-tile border border-border bg-surface-2 p-3 sm:grid-cols-2"
        >
          <app-audit-field inputId="plan-party-type" labelKey="audits.fields.partyType">
            <select id="plan-party-type" (change)="patch({ partyType: $any($event.target).value })">
              <option value="">{{ 'audits.common.choose' | transloco }}</option>
              @for (t of partyTypes; track t) {
                <option [value]="t" [selected]="f().partyType === t">
                  {{ 'audits.partyType.' + t | transloco }}
                </option>
              }
            </select>
          </app-audit-field>
          @if (f().partyType === 'customer' && customers.enabled()) {
            <app-audit-field
              class="sm:col-span-2"
              inputId="plan-customer"
              labelKey="audits.fields.customer"
            >
              <app-customer-picker
                inputId="plan-customer"
                [value]="f().customerId || null"
                [current]="f().customer"
                (valueChange)="patch({ customerId: $event ?? '' })"
                (refChange)="setCustomer($event)"
                data-testid="plan-customer"
              />
            </app-audit-field>
          }
          <app-audit-field inputId="plan-party-name" labelKey="audits.fields.partyName">
            <input
              id="plan-party-name"
              maxlength="200"
              [value]="f().partyName"
              (input)="patch({ partyName: $any($event.target).value })"
            />
          </app-audit-field>
          <app-audit-field
            class="sm:col-span-2"
            inputId="plan-cert"
            labelKey="audits.fields.certification"
            helpField="certification"
          >
            <select id="plan-cert" (change)="patch({ certificationId: $any($event.target).value })">
              <option value="">{{ 'common.empty.none' | transloco }}</option>
              @for (c of certifications(); track c.id) {
                <option [value]="c.id" [selected]="f().certificationId === c.id">
                  {{ certTitle(c) }}
                </option>
              }
            </select>
          </app-audit-field>
        </div>
      }

      <app-audit-field
        inputId="plan-programme"
        labelKey="audits.fields.programme"
        helpField="programme"
      >
        <select id="plan-programme" (change)="patch({ programmeId: $any($event.target).value })">
          <option value="">{{ 'common.empty.none' | transloco }}</option>
          @for (p of programmes(); track p.id) {
            <option [value]="p.id" [selected]="f().programmeId === p.id">
              {{ p.code }} · {{ p.title }}
            </option>
          }
        </select>
      </app-audit-field>

      <app-audit-field inputId="plan-scope" labelKey="audits.fields.scope" helpField="scope">
        <textarea
          id="plan-scope"
          rows="3"
          [value]="f().scope"
          (input)="patch({ scope: $any($event.target).value })"
        ></textarea>
      </app-audit-field>

      <app-audit-field
        inputId="plan-processes"
        labelKey="audits.fields.processes"
        helpField="processes"
        [plain]="true"
      >
        <app-audit-record-select
          inputId="plan-processes"
          [types]="['process']"
          labelKey="audits.fields.processes"
          placeholderKey="audits.planForm.searchProcesses"
          [value]="f().processes"
          (valueChange)="patch({ processes: $event })"
        />
      </app-audit-field>

      <app-audit-choice-checkboxes
        [legend]="'audits.fields.departments' | transloco"
        [choices]="departmentChoices()"
        [translate]="false"
        [selected]="f().departments"
        [emptyText]="'audits.planForm.noDepartments' | transloco"
        (selectedChange)="patch({ departments: $event })"
      />

      <app-audit-choice-checkboxes
        [legend]="'audits.fields.frameworks' | transloco"
        [choices]="frameworkChoices()"
        [selected]="f().frameworks"
        (selectedChange)="patch({ frameworks: $event })"
      />

      <app-audit-field
        inputId="plan-clauses"
        labelKey="audits.fields.clauseRefs"
        helpField="clauseRefs"
        [plain]="true"
      >
        <app-ask-about
          ask
          field="clause_refs"
          [fieldLabel]="'audits.fields.clauseRefs' | transloco"
          [prompt]="'audits.planForm.askClauses' | transloco"
        />
        <app-clause-picker
          inputId="plan-clauses"
          [frameworks]="f().frameworks.length ? f().frameworks : null"
          [ngModel]="f().clauseRefs"
          (ngModelChange)="patch({ clauseRefs: $event ?? [] })"
          [ngModelOptions]="{ standalone: true }"
        />
        <span hint>{{ 'audits.planForm.clausesHint' | transloco }}</span>
      </app-audit-field>

      <app-audit-field
        inputId="plan-criteria"
        labelKey="audits.fields.criteria"
        helpField="criteria"
      >
        <app-ask-about
          ask
          field="criteria"
          [fieldLabel]="'audits.fields.criteria' | transloco"
          [prompt]="'audits.planForm.askCriteria' | transloco"
        />
        <textarea
          id="plan-criteria"
          rows="3"
          [value]="f().criteria"
          (input)="patch({ criteria: $any($event.target).value })"
        ></textarea>
      </app-audit-field>

      <app-audit-field
        inputId="plan-criteria-docs"
        labelKey="audits.fields.criteriaDocuments"
        helpField="criteriaDocuments"
        [plain]="true"
      >
        <app-audit-record-select
          inputId="plan-criteria-docs"
          [types]="['document']"
          labelKey="audits.fields.criteriaDocuments"
          placeholderKey="audits.planForm.searchDocuments"
          [value]="f().criteriaDocuments"
          (valueChange)="patch({ criteriaDocuments: $event })"
        />
      </app-audit-field>

      <app-audit-field
        inputId="plan-objectives"
        labelKey="audits.fields.objectives"
        helpField="objectives"
      >
        <textarea
          id="plan-objectives"
          rows="2"
          [value]="f().objectives"
          (input)="patch({ objectives: $any($event.target).value })"
        ></textarea>
      </app-audit-field>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <app-audit-field inputId="plan-start" labelKey="audits.fields.plannedStart">
          <input
            id="plan-start"
            type="date"
            [attr.lang]="lang()"
            [value]="f().start"
            (input)="patch({ start: $any($event.target).value })"
          />
        </app-audit-field>
        <app-audit-field
          inputId="plan-end"
          labelKey="audits.fields.plannedEnd"
          [error]="datesInvalid() ? 'audits.errors.invalid_dates' : null"
        >
          <input
            id="plan-end"
            type="date"
            [attr.lang]="lang()"
            [value]="f().end"
            (input)="patch({ end: $any($event.target).value })"
          />
        </app-audit-field>
        <app-audit-field
          inputId="plan-location"
          labelKey="audits.fields.location"
          helpField="location"
        >
          <input
            id="plan-location"
            maxlength="200"
            [value]="f().location"
            (input)="patch({ location: $any($event.target).value })"
          />
        </app-audit-field>
        <app-audit-field inputId="plan-owner" labelKey="audits.fields.owner" helpField="owner">
          <app-audit-user-select
            inputId="plan-owner"
            [value]="f().ownerId"
            [currentName]="existing.value()?.owner?.name ?? null"
            (valueChange)="patch({ ownerId: $event })"
          />
        </app-audit-field>
      </div>

      <app-audit-choice-checkboxes
        [legend]="'audits.fields.auditees' | transloco"
        [choices]="userChoices()"
        [translate]="false"
        [selected]="f().auditees"
        [emptyText]="'audits.planForm.noPeople' | transloco"
        (selectedChange)="patch({ auditees: $event })"
      />
      <app-audit-choice-checkboxes
        [legend]="'audits.fields.distribution' | transloco"
        [choices]="userChoices()"
        [translate]="false"
        [selected]="f().distribution"
        [emptyText]="'audits.planForm.noPeople' | transloco"
        (selectedChange)="patch({ distribution: $event })"
      />

      @if (id()) {
        <app-audit-field inputId="plan-reason" labelKey="audits.fields.changeReason">
          <input
            id="plan-reason"
            maxlength="2000"
            [value]="f().changeReason"
            (input)="patch({ changeReason: $any($event.target).value })"
          />
        </app-audit-field>
      }
    </app-audit-form-page>
  `,
})
export class PlanForm {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly options = inject(AssigneeOptionsService);
  private readonly language = inject(LanguageService);
  private readonly frameworks = inject(AuditFrameworks);
  private readonly flows = inject(CreateFlowService);
  protected readonly access = inject(AuditAccess);
  protected readonly customers = inject(CustomersAvailability);

  /** Route param on `/plans/:id/edit` (absent when creating). */
  readonly id = input<string | undefined>(undefined);

  protected readonly kinds = PLAN_KINDS;
  protected readonly risks = RISK_LEVELS;
  protected readonly partyTypes = EXTERNAL_PARTY_TYPES;
  protected readonly lang = this.language.active;
  protected readonly flow = this.flows.consume(this.route, { targetType: 'audit_plan' });

  protected readonly existing = loadable<PlanDetail>();
  private readonly programmeList = loadable<ListResponse<Programme>>();
  private readonly certificationList = loadable<ListResponse<Certification>>();
  protected readonly saving = mutator();
  protected readonly f = signal<PlanFormValue>(emptyPlanForm());
  private readonly touched = signal(false);

  protected readonly breadcrumbs = computed(() => {
    const id = this.id();
    const plan = this.existing.value();
    return [
      { labelKey: 'modules.names.audits', link: '/audits' },
      { labelKey: 'audits.plans.title', link: '/audits/plans' },
      ...(id && plan ? [{ label: plan.code, link: ['/audits/plans', id] }] : []),
      { labelKey: id ? 'audits.planForm.editTitle' : 'audits.planForm.newTitle' },
    ];
  });
  protected readonly frameworkChoices = computed<readonly Choice[]>(() =>
    this.frameworks
      .options(this.f().frameworks)
      .map((k) => ({ value: k, label: `audits.frameworks.${k}` })),
  );
  protected readonly programmes = computed(() =>
    (this.programmeList.value()?.items ?? []).filter(
      (p) => p.status !== 'closed' || p.id === this.f().programmeId,
    ),
  );
  protected readonly certifications = computed(() => this.certificationList.value()?.items ?? []);
  protected readonly departmentChoices = computed<readonly Choice[]>(() =>
    this.options.options().departments.map((d) => ({
      value: d.value.replace(/^department:/, ''),
      label: d.label,
    })),
  );
  protected readonly userChoices = computed<readonly Choice[]>(() =>
    this.options
      .options()
      .users.filter((o) => o.value.startsWith('user:'))
      .map((o) => ({ value: o.value.slice('user:'.length), label: o.label })),
  );
  protected readonly datesInvalid = computed(() => {
    const { start, end } = this.f();
    return !!start && !!end && end < start;
  });
  protected readonly titleError = computed(() =>
    this.touched() && !this.f().title.trim() ? 'audits.errors.title_required' : null,
  );
  protected readonly valid = computed(() => !!this.f().title.trim() && !this.datesInvalid());
  protected readonly invalidKey = computed(() =>
    !this.f().title.trim()
      ? 'audits.planForm.fixTitle'
      : this.datesInvalid()
        ? 'audits.planForm.fixDates'
        : null,
  );

  constructor() {
    this.options.ensureLoaded();
    const prefill = planPrefill(
      this.route.snapshot.queryParamMap,
      this.route.snapshot.queryParamMap.get('fromRequirement'),
    );
    this.f.update((v) => ({ ...v, ...prefill }));
    // The customer card's create flow ("Ny kunderevisjon"): an external audit by the customer.
    let flowApplied = false;
    effect(() => {
      const flow = this.flow();
      if (!flow || flowApplied) {
        return;
      }
      flowApplied = true;
      const p = flow.prefill;
      const str = (key: string) => (typeof p[key] === 'string' ? (p[key] as string) : '');
      if (str('customer_id')) {
        untracked(() =>
          this.f.update((v) => ({
            ...v,
            kind: 'external',
            partyType: 'customer',
            customerId: v.customerId || str('customer_id'),
            partyName: v.partyName || str('external_party_name'),
          })),
        );
      }
    });
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_plan',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.f().title || null,
      requirements: this.f().clauseRefs,
    }));
    effect(() => {
      const orgId = this.access.orgId();
      const id = this.id();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.programmeList.load(this.api.listProgrammes(orgId, { limit: 200 }));
        this.certificationList.load(this.api.listCertifications(orgId, { limit: 200 }));
        if (id) {
          this.existing.load(this.api.getPlan(orgId, id));
        }
      });
    });
    effect(() => {
      const plan = this.existing.value();
      if (plan) {
        untracked(() => this.f.set(planToForm(plan)));
      }
    });
  }

  protected certTitle(c: Certification): string {
    return certificationTitle(c, (k, p) => this.language.translate(k, p));
  }

  protected readonly suggestFields = computed(() =>
    suggestDefs(PLAN_SUGGEST_FIELDS, (key, params) => this.language.translate(key, params)),
  );
  protected readonly suggestValues = computed(() =>
    suggestValues(PLAN_SUGGEST_FIELDS, this.f(), {
      processes: this.f().processes.map((p) => p.entity_id),
    }),
  );

  /** Accepted suggestions fill the plan; nothing is saved until "Save". */
  protected applySuggestion(accepted: AcceptedSuggestion): void {
    const change = suggestPatch(PLAN_SUGGEST_FIELDS, accepted, [
      'processes',
    ]) as Partial<PlanFormValue>;
    const processes = accepted['processes'];
    if (processes && Array.isArray(processes.value)) {
      const labels = Array.isArray(processes.display) ? processes.display : [];
      change.processes = processes.value
        .filter((id): id is string => typeof id === 'string')
        .map((id, i) => idRef('process', id, String(labels[i] ?? id.slice(0, 8))));
    }
    this.patch(change);
  }

  /** A chosen customer also names the party (unless the user typed a name). */
  protected setCustomer(ref: CustomerRef | null): void {
    this.f.update((v) => ({
      ...v,
      customer: ref,
      partyName: ref && !v.partyName.trim() ? ref.name : v.partyName,
    }));
  }

  protected patch(change: Partial<PlanFormValue>): void {
    if ('title' in change) {
      this.touched.set(true);
    }
    this.f.update((v) => ({ ...v, ...change }));
  }

  protected save(): void {
    this.touched.set(true);
    const orgId = this.access.orgId();
    if (!orgId || !this.valid()) {
      return;
    }
    const id = this.id();
    const body = planFormToInput(this.f(), !!id);
    this.saving.run(id ? this.api.updatePlan(orgId, id, body) : this.api.createPlan(orgId, body), {
      success: id ? 'audits.notices.saved' : 'audits.notices.planCreated',
      next: (plan) => {
        if (!id) {
          this.flows.complete(plan.id, 'audit_plan').subscribe();
        }
        void this.router.navigate(['/audits/plans', plan.id]);
      },
    });
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/audits/plans', id] : ['/audits/plans']);
  }
}

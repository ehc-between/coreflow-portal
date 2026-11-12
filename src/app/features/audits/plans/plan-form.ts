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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AuditAccess } from '../data/audit-access';
import { fromDateInput, parseClauseRefs, textOrNull, toDateInput } from '../data/audit-display';
import {
  Certification,
  EXTERNAL_PARTY_TYPES,
  ExternalPartyType,
  FRAMEWORKS,
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
import { AuditChoiceCheckboxes, Choice } from '../shared/choice-checkboxes';
import { AuditFormPage } from '../shared/form-page';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditUserSelect } from '../shared/user-select';

/** The form state of an audit plan. */
export interface PlanFormValue {
  title: string;
  kind: PlanKind;
  programmeId: string;
  certificationId: string;
  partyType: ExternalPartyType | '';
  partyName: string;
  scope: string;
  criteria: string;
  objectives: string;
  frameworks: string[];
  clauseRefs: string;
  departments: string[];
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
    scope: '',
    criteria: '',
    objectives: '',
    frameworks: [],
    clauseRefs: '',
    departments: [],
    risk: 'medium',
    start: '',
    end: '',
    ownerId: '',
    changeReason: '',
  };
}

export function planToForm(p: PlanDetail): PlanFormValue {
  return {
    title: p.title,
    kind: p.kind,
    programmeId: p.programme?.id ?? '',
    certificationId: p.certification_id ?? '',
    partyType: p.external_party_type ?? '',
    partyName: p.external_party_name ?? '',
    scope: p.scope ?? '',
    criteria: p.criteria ?? '',
    objectives: p.objectives ?? '',
    frameworks: [...p.frameworks],
    clauseRefs: p.clause_refs.join(', '),
    departments: [...p.auditee_department_ids],
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
    scope: textOrNull(v.scope),
    criteria: textOrNull(v.criteria),
    objectives: textOrNull(v.objectives),
    frameworks: v.frameworks,
    clause_refs: parseClauseRefs(v.clauseRefs),
    auditee_department_ids: v.departments,
    risk_level: v.risk,
    planned_start: fromDateInput(v.start),
    planned_end: fromDateInput(v.end),
    owner_user_id: v.ownerId || null,
    ...(editing ? { change_reason: textOrNull(v.changeReason) } : {}),
  };
}

/** `/audits/plans/new` and `/audits/plans/:id/edit`: plan an audit (scope, criteria, schedule). */
@Component({
  selector: 'app-audit-plan-form',
  imports: [
    TranslocoPipe,
    FormField,
    FieldHelp,
    AskAbout,
    AuditFormPage,
    AuditChoiceCheckboxes,
    AuditUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-audit-form-page
      [titleKey]="id() ? 'audits.planForm.editTitle' : 'audits.planForm.newTitle'"
      guidePage="planForm"
      [backLink]="id() ? ['/audits/plans', id()] : '/audits/plans'"
      [busy]="saving.busy()"
      [canSave]="valid()"
      [ready]="!id() || existing.state() === 'ready'"
      (save)="save()"
      (cancelled)="back()"
    >
      <app-form-field [label]="'audits.fields.title' | transloco" inputId="plan-title">
        <input
          id="plan-title"
          required
          aria-required="true"
          maxlength="255"
          [value]="f().title"
          (input)="patch({ title: $any($event.target).value })"
        />
        <app-field-help scope="audits" page="planForm" field="title" />
      </app-form-field>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <app-form-field [label]="'audits.fields.kind' | transloco" inputId="plan-kind">
          <select id="plan-kind" (change)="patch({ kind: $any($event.target).value })">
            @for (k of kinds; track k) {
              <option [value]="k" [selected]="f().kind === k">
                {{ 'audits.kind.' + k | transloco }}
              </option>
            }
          </select>
          <app-field-help scope="audits" page="planForm" field="kind" />
        </app-form-field>
        <app-form-field [label]="'audits.fields.risk' | transloco" inputId="plan-risk">
          <select id="plan-risk" (change)="patch({ risk: $any($event.target).value })">
            @for (r of risks; track r) {
              <option [value]="r" [selected]="f().risk === r">
                {{ 'audits.risk.' + r | transloco }}
              </option>
            }
          </select>
          <app-field-help scope="audits" page="planForm" field="risk" />
        </app-form-field>
      </div>

      @if (f().kind === 'external') {
        <div
          class="grid grid-cols-1 gap-4 rounded-[10px] border border-border bg-surface-2 p-3 sm:grid-cols-2"
        >
          <app-form-field [label]="'audits.fields.partyType' | transloco" inputId="plan-party-type">
            <select id="plan-party-type" (change)="patch({ partyType: $any($event.target).value })">
              <option value="">{{ 'audits.common.choose' | transloco }}</option>
              @for (t of partyTypes; track t) {
                <option [value]="t" [selected]="f().partyType === t">
                  {{ 'audits.partyType.' + t | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'audits.fields.partyName' | transloco" inputId="plan-party-name">
            <input
              id="plan-party-name"
              maxlength="200"
              [value]="f().partyName"
              (input)="patch({ partyName: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field
            class="sm:col-span-2"
            [label]="'audits.fields.certification' | transloco"
            inputId="plan-cert"
          >
            <select id="plan-cert" (change)="patch({ certificationId: $any($event.target).value })">
              <option value="">{{ 'audits.common.none' | transloco }}</option>
              @for (c of certifications(); track c.id) {
                <option [value]="c.id" [selected]="f().certificationId === c.id">
                  {{ 'audits.frameworks.' + c.framework | transloco }} · {{ c.certification_body }}
                </option>
              }
            </select>
            <app-field-help scope="audits" page="planForm" field="certification" />
          </app-form-field>
        </div>
      }

      <app-form-field [label]="'audits.fields.programme' | transloco" inputId="plan-programme">
        <select id="plan-programme" (change)="patch({ programmeId: $any($event.target).value })">
          <option value="">{{ 'audits.common.none' | transloco }}</option>
          @for (p of programmes(); track p.id) {
            <option [value]="p.id" [selected]="f().programmeId === p.id">
              {{ p.code }} · {{ p.title }}
            </option>
          }
        </select>
        <app-field-help scope="audits" page="planForm" field="programme" />
      </app-form-field>

      <app-form-field [label]="'audits.fields.scope' | transloco" inputId="plan-scope">
        <textarea
          id="plan-scope"
          rows="3"
          [value]="f().scope"
          (input)="patch({ scope: $any($event.target).value })"
        ></textarea>
        <app-field-help scope="audits" page="planForm" field="scope" />
      </app-form-field>
      <app-form-field [label]="'audits.fields.criteria' | transloco" inputId="plan-criteria">
        <div class="flex items-start gap-2">
          <textarea
            id="plan-criteria"
            rows="3"
            [value]="f().criteria"
            (input)="patch({ criteria: $any($event.target).value })"
          ></textarea>
          <app-ask-about
            class="mt-1.5 flex-none"
            field="criteria"
            [prompt]="'audits.planForm.askCriteria' | transloco"
          />
        </div>
        <app-field-help scope="audits" page="planForm" field="criteria" />
      </app-form-field>
      <app-form-field [label]="'audits.fields.objectives' | transloco" inputId="plan-objectives">
        <textarea
          id="plan-objectives"
          rows="2"
          [value]="f().objectives"
          (input)="patch({ objectives: $any($event.target).value })"
        ></textarea>
      </app-form-field>

      <app-audit-choice-checkboxes
        [legend]="'audits.fields.frameworks' | transloco"
        [choices]="frameworkChoices"
        [selected]="f().frameworks"
        (selectedChange)="patch({ frameworks: $event })"
      />
      <app-form-field [label]="'audits.fields.clauseRefs' | transloco" inputId="plan-clauses">
        <input
          id="plan-clauses"
          [value]="f().clauseRefs"
          [placeholder]="'audits.planForm.clausePlaceholder' | transloco"
          (input)="patch({ clauseRefs: $any($event.target).value })"
        />
        <app-field-help scope="audits" page="planForm" field="clauseRefs" />
      </app-form-field>
      <app-audit-choice-checkboxes
        [legend]="'audits.fields.departments' | transloco"
        [choices]="departmentChoices()"
        [translate]="false"
        [selected]="f().departments"
        [emptyText]="'audits.planForm.noDepartments' | transloco"
        (selectedChange)="patch({ departments: $event })"
      />

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <app-form-field [label]="'audits.fields.plannedStart' | transloco" inputId="plan-start">
          <input
            id="plan-start"
            type="date"
            [value]="f().start"
            (input)="patch({ start: $any($event.target).value })"
          />
        </app-form-field>
        <app-form-field [label]="'audits.fields.plannedEnd' | transloco" inputId="plan-end">
          <input
            id="plan-end"
            type="date"
            [value]="f().end"
            (input)="patch({ end: $any($event.target).value })"
          />
        </app-form-field>
        <app-form-field [label]="'audits.fields.owner' | transloco" inputId="plan-owner">
          <app-audit-user-select
            inputId="plan-owner"
            [value]="f().ownerId"
            [currentName]="existing.value()?.owner?.name ?? null"
            (valueChange)="patch({ ownerId: $event })"
          />
        </app-form-field>
      </div>
      @if (datesInvalid()) {
        <p class="text-[12.5px] text-fail" role="alert">
          {{ 'audits.errors.invalid_dates' | transloco }}
        </p>
      }

      @if (id()) {
        <app-form-field [label]="'audits.fields.changeReason' | transloco" inputId="plan-reason">
          <input
            id="plan-reason"
            maxlength="2000"
            [value]="f().changeReason"
            (input)="patch({ changeReason: $any($event.target).value })"
          />
        </app-form-field>
      }
    </app-audit-form-page>
  `,
})
export class PlanForm {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly options = inject(AssigneeOptionsService);
  protected readonly access = inject(AuditAccess);

  /** Route param on `/plans/:id/edit` (absent when creating). */
  readonly id = input<string | undefined>(undefined);

  protected readonly kinds = PLAN_KINDS;
  protected readonly risks = RISK_LEVELS;
  protected readonly partyTypes = EXTERNAL_PARTY_TYPES;
  protected readonly frameworkChoices: readonly Choice[] = FRAMEWORKS.map((k) => ({
    value: k,
    label: `audits.frameworks.${k}`,
  }));

  protected readonly existing = loadable<PlanDetail>();
  private readonly programmeList = loadable<ListResponse<Programme>>();
  private readonly certificationList = loadable<ListResponse<Certification>>();
  protected readonly saving = mutator();
  protected readonly f = signal<PlanFormValue>(emptyPlanForm());

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
  protected readonly datesInvalid = computed(() => {
    const { start, end } = this.f();
    return !!start && !!end && end < start;
  });
  protected readonly valid = computed(() => !!this.f().title.trim() && !this.datesInvalid());

  constructor() {
    this.options.ensureLoaded();
    const query = this.route.snapshot.queryParamMap;
    this.f.update((v) => ({
      ...v,
      programmeId: query.get('programme') ?? '',
      certificationId: query.get('certification') ?? '',
      kind:
        query.get('kind') === 'external' || query.get('certification') ? 'external' : 'internal',
    }));
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_plan',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.f().title || null,
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

  protected patch(change: Partial<PlanFormValue>): void {
    this.f.update((v) => ({ ...v, ...change }));
  }

  protected save(): void {
    const orgId = this.access.orgId();
    if (!orgId || !this.valid()) {
      return;
    }
    const id = this.id();
    const body = planFormToInput(this.f(), !!id);
    this.saving.run(id ? this.api.updatePlan(orgId, id, body) : this.api.createPlan(orgId, body), {
      success: id ? 'audits.notices.saved' : 'audits.notices.planCreated',
      next: (plan) => void this.router.navigate(['/audits/plans', plan.id]),
    });
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/audits/plans', id] : ['/audits/plans']);
  }
}

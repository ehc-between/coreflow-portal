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
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { AuditAccess } from '../data/audit-access';
import { fromDateInput, textOrNull, toDateInput } from '../data/audit-display';
import {
  FINDING_TYPES,
  FindingDetail,
  FindingInput,
  FindingType,
  PlanDetail,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditField } from '../shared/audit-field';
import { AuditFormPage } from '../shared/form-page';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditUserSelect } from '../shared/user-select';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormSection } from '../../../shared/ui/form-section/form-section';

export interface FindingFormValue {
  title: string;
  type: FindingType;
  description: string;
  evidence: string;
  clauseRef: string;
  checklistItemId: string;
  ownerId: string;
  departmentId: string;
  due: string;
  changeReason: string;
}

export function findingFormToInput(v: FindingFormValue, editing: boolean): FindingInput {
  return {
    title: v.title.trim(),
    finding_type: v.type,
    description: textOrNull(v.description),
    evidence: textOrNull(v.evidence),
    clause_ref: textOrNull(v.clauseRef),
    owner_user_id: v.ownerId || null,
    department_id: v.departmentId || null,
    response_due_at: fromDateInput(v.due),
    ...(editing
      ? { change_reason: textOrNull(v.changeReason) }
      : { checklist_item_id: v.checklistItemId || null }),
  };
}

/** Normalise the `audits.draft_finding` assist result to form values (unknown parts dropped). */
export function parseDraftFinding(data: unknown): Partial<FindingFormValue> {
  const d = (data ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const out: Partial<FindingFormValue> = {};
  const title = text(d['title']);
  const description = text(d['description']) ?? text(d['statement']);
  const evidence = text(d['evidence']);
  const clause = text(d['clause_ref']);
  const type = text(d['finding_type']);
  if (title) out.title = title;
  if (description) out.description = description;
  if (evidence) out.evidence = evidence;
  if (clause) out.clauseRef = clause;
  if (type && (FINDING_TYPES as readonly string[]).includes(type)) {
    out.type = type as FindingType;
  }
  return out;
}

/**
 * `/audits/plans/:planId/findings/new` and `/audits/findings/:id/edit`: record a
 * finding (nonconformity, observation or opportunity for improvement) with its
 * objective evidence, the clause it is against (picked from the catalogue), the
 * auditee who responds and by when.
 */
@Component({
  selector: 'app-audit-finding-form',
  imports: [
    FormSection,
    DateInput,
    FormsModule,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    ClausePicker,
    AuditField,
    AuditFormPage,
    AuditUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-audit-form-page
      [titleKey]="id() ? 'audits.findingForm.editTitle' : 'audits.findingForm.newTitle'"
      guidePage="findingForm"
      lesson="findings-and-capa"
      [breadcrumbs]="breadcrumbs()"
      [busy]="saving.busy()"
      [canSave]="valid()"
      invalidKey="audits.findingForm.fixTitle"
      [ready]="!id() || existing.state() === 'ready'"
      (save)="save()"
      (cancelled)="back()"
    >
      <app-form-section
        [title]="'audits.findingForm.sections.finding' | transloco"
        [description]="'audits.findingForm.sections.findingHint' | transloco"
      >
        @if (planLabel(); as label) {
          <p class="text-meta text-fg-muted sm:col-span-2">
            {{ 'audits.findingForm.inAudit' | transloco: { audit: label } }}
          </p>
        }

        <fieldset class="min-w-0 sm:col-span-2">
          <legend class="mb-1.5 flex min-h-6 items-center text-ui font-semibold text-fg-muted">
            {{ 'audits.fields.findingType' | transloco }}
          </legend>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            @for (t of types; track t) {
              <label
                class="flex cursor-pointer items-start gap-2 rounded-tile border p-2.5 text-ui"
                [class]="f().type === t ? 'border-accent bg-accent-soft' : 'border-border'"
              >
                <input
                  type="radio"
                  name="fd-type"
                  class="mt-0.5"
                  [checked]="f().type === t"
                  (change)="patch({ type: t })"
                />
                <span>
                  <span class="block font-semibold text-fg">{{
                    'audits.findingType.' + t | transloco
                  }}</span>
                  <span class="text-meta text-fg-muted">{{
                    'audits.findingTypeHelp.' + t | transloco
                  }}</span>
                </span>
              </label>
            }
          </div>
        </fieldset>

        <app-audit-field
          span="full"
          inputId="fd-title"
          labelKey="audits.fields.title"
          [required]="true"
          helpPage="findingForm"
          helpField="title"
        >
          @if (planId()) {
            <app-ai-assist-button
              ask
              assist="audits.draft_finding"
              labelKey="audits.ai.draftFinding"
              variant="ghost"
              entityType="audit_plan"
              [entityId]="planId() ?? null"
              [input]="{
                plan_id: planId(),
                checklist_item_id: f().checklistItemId || null,
                notes: f().description || f().evidence || null,
                clause_ref: f().clauseRef || null,
                finding_type: f().type,
              }"
              (result)="applyDraft($event)"
            />
          }
          <input
            id="fd-title"
            required
            aria-required="true"
            maxlength="255"
            [value]="f().title"
            (input)="patch({ title: $any($event.target).value })"
          />
        </app-audit-field>
        <app-audit-field
          span="full"
          inputId="fd-description"
          labelKey="audits.fields.description"
          helpPage="findingForm"
          helpField="description"
        >
          <textarea
            id="fd-description"
            rows="4"
            [value]="f().description"
            (input)="patch({ description: $any($event.target).value })"
          ></textarea>
        </app-audit-field>
        <app-audit-field
          span="full"
          inputId="fd-evidence"
          labelKey="audits.fields.evidence"
          helpPage="findingForm"
          helpField="evidence"
        >
          <app-ask-about
            ask
            field="evidence"
            [fieldLabel]="'audits.fields.evidence' | transloco"
            [prompt]="'audits.findingForm.askEvidence' | transloco"
          />
          <textarea
            id="fd-evidence"
            rows="3"
            [value]="f().evidence"
            (input)="patch({ evidence: $any($event.target).value })"
          ></textarea>
        </app-audit-field>
        <app-audit-field
          span="full"
          inputId="fd-clause"
          labelKey="audits.fields.clauseRef"
          helpPage="findingForm"
          helpField="clauseRef"
          [plain]="true"
        >
          <app-clause-picker
            inputId="fd-clause"
            [multiple]="false"
            [frameworks]="planFrameworks()"
            [ngModel]="f().clauseRef || null"
            (ngModelChange)="patch({ clauseRef: $event ?? '' })"
            [ngModelOptions]="{ standalone: true }"
          />
          <span hint>{{ 'audits.findingForm.clauseHint' | transloco }}</span>
        </app-audit-field>
      </app-form-section>

      <app-form-section
        [title]="'audits.findingForm.sections.followUp' | transloco"
        [description]="'audits.findingForm.sections.followUpHint' | transloco"
      >
        <app-audit-field
          inputId="fd-owner"
          labelKey="audits.fields.findingOwner"
          helpPage="findingForm"
          helpField="owner"
        >
          <app-audit-user-select
            inputId="fd-owner"
            [value]="f().ownerId"
            [currentName]="existing.value()?.owner?.name ?? null"
            (valueChange)="patch({ ownerId: $event })"
          />
        </app-audit-field>
        <app-audit-field
          inputId="fd-due"
          labelKey="audits.fields.responseDue"
          helpPage="findingForm"
          helpField="responseDue"
        >
          <app-date-input
            inputId="fd-due"
            [value]="f().due"
            (valueChange)="patch({ due: $event ?? '' })"
          />
        </app-audit-field>
        <app-audit-field inputId="fd-department" labelKey="audits.fields.department">
          <select id="fd-department" (change)="patch({ departmentId: $any($event.target).value })">
            <option value="">{{ 'common.empty.none' | transloco }}</option>
            @for (d of departments(); track d.id) {
              <option [value]="d.id" [selected]="f().departmentId === d.id">{{ d.label }}</option>
            }
          </select>
        </app-audit-field>
      </app-form-section>
      @if (id()) {
        <app-form-section [columns]="1">
          <app-audit-field inputId="fd-reason" labelKey="audits.fields.changeReason">
            <input
              id="fd-reason"
              maxlength="2000"
              [value]="f().changeReason"
              (input)="patch({ changeReason: $any($event.target).value })"
            />
          </app-audit-field>
        </app-form-section>
      }
    </app-audit-form-page>
  `,
})
export class FindingForm {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly options = inject(AssigneeOptionsService);
  private readonly access = inject(AuditAccess);
  private readonly language = inject(LanguageService);

  /** `/findings/:id/edit`. */
  readonly id = input<string | undefined>(undefined);
  /** `/plans/:planId/findings/new`. */
  readonly planId = input<string | undefined>(undefined);

  protected readonly types = FINDING_TYPES;
  protected readonly lang = this.language.active;
  protected readonly existing = loadable<FindingDetail>();
  protected readonly plan = loadable<PlanDetail>();
  protected readonly saving = mutator();
  protected readonly f = signal<FindingFormValue>(this.initial());
  protected readonly valid = computed(() => !!this.f().title.trim());
  protected readonly departments = computed(() =>
    this.options
      .options()
      .departments.map((d) => ({ id: d.value.replace(/^department:/, ''), label: d.label })),
  );
  protected readonly planFrameworks = computed(() => {
    const frameworks = this.plan.value()?.frameworks ?? [];
    return frameworks.length ? frameworks : null;
  });
  protected readonly planLabel = computed(() => {
    const p = this.plan.value() ?? this.existing.value()?.plan;
    return p ? [p.code, p.title].filter(Boolean).join(' · ') : null;
  });
  protected readonly backLink = computed(() => {
    const id = this.id();
    if (id) {
      return ['/audits/findings', id];
    }
    const planId = this.planId();
    return planId ? ['/audits/plans', planId] : ['/audits/findings'];
  });
  protected readonly breadcrumbs = computed(() => {
    const id = this.id();
    const existing = this.existing.value();
    const plan = this.plan.value();
    const crumbs: { labelKey?: string; label?: string; link?: readonly unknown[] | string }[] = [
      { labelKey: 'modules.names.audits', link: '/audits' },
    ];
    if (id) {
      crumbs.push({ labelKey: 'audits.findings.title', link: '/audits/findings' });
      if (existing) {
        crumbs.push({ label: existing.code, link: ['/audits/findings', id] });
      }
    } else {
      crumbs.push({ labelKey: 'audits.plans.title', link: '/audits/plans' });
      if (plan) {
        crumbs.push({ label: plan.code, link: ['/audits/plans', plan.id] });
      }
    }
    crumbs.push({ labelKey: id ? 'audits.findingForm.editTitle' : 'audits.findingForm.newTitle' });
    return crumbs;
  });

  constructor() {
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_finding',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.f().title || null,
      requirements: this.f().clauseRef ? [this.f().clauseRef] : [],
    }));
    effect(() => {
      const orgId = this.access.orgId();
      const id = this.id();
      const planId = this.planId();
      untracked(() => {
        if (!orgId) {
          return;
        }
        if (id) {
          this.existing.load(this.api.getFinding(orgId, id));
        }
        if (planId) {
          this.plan.load(this.api.getPlan(orgId, planId));
        }
      });
    });
    effect(() => {
      const x = this.existing.value();
      if (x) {
        untracked(() =>
          this.f.set({
            title: x.title,
            type: x.finding_type,
            description: x.description ?? '',
            evidence: x.evidence ?? '',
            clauseRef: x.clause_ref ?? '',
            checklistItemId: x.checklist_item_id ?? '',
            ownerId: x.owner?.id ?? '',
            departmentId: x.department_id ?? '',
            due: toDateInput(x.response_due_at),
            changeReason: '',
          }),
        );
      }
    });
  }

  private initial(): FindingFormValue {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    const type = q.get('type');
    return {
      title: '',
      type: (FINDING_TYPES as readonly string[]).includes(type ?? '')
        ? (type as FindingType)
        : 'minor_nc',
      description: '',
      evidence: '',
      clauseRef: q.get('clause') ?? '',
      checklistItemId: q.get('item') ?? '',
      ownerId: '',
      departmentId: '',
      due: '',
      changeReason: '',
    };
  }

  protected patch(change: Partial<FindingFormValue>): void {
    this.f.update((v) => ({ ...v, ...change }));
  }

  /** Fill empty fields from the assistant's draft; never overwrite what the user typed. */
  protected applyDraft(data: unknown): void {
    const draft = parseDraftFinding(data);
    this.f.update((v) => {
      const next = { ...v };
      for (const [key, value] of Object.entries(draft) as [keyof FindingFormValue, string][]) {
        if (key === 'type' || !String(v[key] ?? '').trim()) {
          (next as Record<string, string>)[key] = value;
        }
      }
      return next;
    });
  }

  protected save(): void {
    const orgId = this.access.orgId();
    if (!orgId || !this.valid()) {
      return;
    }
    const id = this.id();
    const planId = this.planId();
    const body = findingFormToInput(this.f(), !!id);
    const request = id
      ? this.api.updateFinding(orgId, id, body)
      : planId
        ? this.api.createFinding(orgId, planId, body)
        : null;
    if (!request) {
      return;
    }
    this.saving.run(request, {
      success: id ? 'audits.notices.saved' : 'audits.notices.findingRaised',
      next: (finding) => void this.router.navigate(['/audits/findings', finding.id]),
    });
  }

  protected back(): void {
    void this.router.navigate(this.backLink());
  }
}

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
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AuditAccess } from '../data/audit-access';
import { fromDateInput, textOrNull, toDateInput } from '../data/audit-display';
import { FINDING_TYPES, FindingDetail, FindingInput, FindingType } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditFormPage } from '../shared/form-page';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditUserSelect } from '../shared/user-select';

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

/**
 * `/audits/plans/:planId/findings/new` and `/audits/findings/:id/edit`: record a
 * finding (nonconformity, observation or opportunity for improvement) with its
 * objective evidence, the clause it is against, the auditee who responds and when.
 */
@Component({
  selector: 'app-audit-finding-form',
  imports: [TranslocoPipe, FormField, FieldHelp, AuditFormPage, AuditUserSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-audit-form-page
      [titleKey]="id() ? 'audits.findingForm.editTitle' : 'audits.findingForm.newTitle'"
      guidePage="findingForm"
      [backLink]="backLink()"
      [busy]="saving.busy()"
      [canSave]="valid()"
      [ready]="!id() || existing.state() === 'ready'"
      (save)="save()"
      (cancelled)="back()"
    >
      <app-form-field [label]="'audits.fields.title' | transloco" inputId="fd-title">
        <input
          id="fd-title"
          required
          aria-required="true"
          maxlength="255"
          [value]="f().title"
          (input)="patch({ title: $any($event.target).value })"
        />
        <app-field-help scope="audits" page="findingForm" field="title" />
      </app-form-field>
      <fieldset>
        <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
          {{ 'audits.fields.findingType' | transloco }}
        </legend>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          @for (t of types; track t) {
            <label
              class="flex cursor-pointer items-start gap-2 rounded-[10px] border p-2.5 text-[13px]"
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
                <span class="text-[12px] text-fg-muted">{{
                  'audits.findingTypeHelp.' + t | transloco
                }}</span>
              </span>
            </label>
          }
        </div>
      </fieldset>
      <app-form-field [label]="'audits.fields.description' | transloco" inputId="fd-description">
        <textarea
          id="fd-description"
          rows="4"
          [value]="f().description"
          (input)="patch({ description: $any($event.target).value })"
        ></textarea>
        <app-field-help scope="audits" page="findingForm" field="description" />
      </app-form-field>
      <app-form-field [label]="'audits.fields.evidence' | transloco" inputId="fd-evidence">
        <textarea
          id="fd-evidence"
          rows="3"
          [value]="f().evidence"
          (input)="patch({ evidence: $any($event.target).value })"
        ></textarea>
        <app-field-help scope="audits" page="findingForm" field="evidence" />
      </app-form-field>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <app-form-field [label]="'audits.fields.clauseRef' | transloco" inputId="fd-clause">
          <input
            id="fd-clause"
            maxlength="64"
            [placeholder]="'audits.findingForm.clausePlaceholder' | transloco"
            [value]="f().clauseRef"
            (input)="patch({ clauseRef: $any($event.target).value })"
          />
        </app-form-field>
        <app-form-field [label]="'audits.fields.responseDue' | transloco" inputId="fd-due">
          <input
            id="fd-due"
            type="date"
            [value]="f().due"
            (input)="patch({ due: $any($event.target).value })"
          />
          <app-field-help scope="audits" page="findingForm" field="responseDue" />
        </app-form-field>
        <app-form-field [label]="'audits.fields.findingOwner' | transloco" inputId="fd-owner">
          <app-audit-user-select
            inputId="fd-owner"
            [value]="f().ownerId"
            [currentName]="existing.value()?.owner?.name ?? null"
            (valueChange)="patch({ ownerId: $event })"
          />
          <app-field-help scope="audits" page="findingForm" field="owner" />
        </app-form-field>
        <app-form-field [label]="'audits.fields.department' | transloco" inputId="fd-department">
          <select id="fd-department" (change)="patch({ departmentId: $any($event.target).value })">
            <option value="">{{ 'audits.common.none' | transloco }}</option>
            @for (d of departments(); track d.id) {
              <option [value]="d.id" [selected]="f().departmentId === d.id">{{ d.label }}</option>
            }
          </select>
        </app-form-field>
      </div>
      @if (id()) {
        <app-form-field [label]="'audits.fields.changeReason' | transloco" inputId="fd-reason">
          <input
            id="fd-reason"
            maxlength="2000"
            [value]="f().changeReason"
            (input)="patch({ changeReason: $any($event.target).value })"
          />
        </app-form-field>
      }
    </app-audit-form-page>
  `,
})
export class FindingForm {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly options = inject(AssigneeOptionsService);
  private readonly access = inject(AuditAccess);

  /** `/findings/:id/edit`. */
  readonly id = input<string | undefined>(undefined);
  /** `/plans/:planId/findings/new`. */
  readonly planId = input<string | undefined>(undefined);

  protected readonly types = FINDING_TYPES;
  protected readonly existing = loadable<FindingDetail>();
  protected readonly saving = mutator();
  protected readonly f = signal<FindingFormValue>(this.initial());
  protected readonly valid = computed(() => !!this.f().title.trim());
  protected readonly departments = computed(() =>
    this.options
      .options()
      .departments.map((d) => ({ id: d.value.replace(/^department:/, ''), label: d.label })),
  );
  protected readonly backLink = computed(() => {
    const id = this.id();
    if (id) {
      return ['/audits/findings', id];
    }
    const planId = this.planId();
    return planId ? ['/audits/plans', planId] : ['/audits/findings'];
  });

  constructor() {
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_finding',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.f().title || null,
    }));
    effect(() => {
      const orgId = this.access.orgId();
      const id = this.id();
      untracked(() => orgId && id && this.existing.load(this.api.getFinding(orgId, id)));
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

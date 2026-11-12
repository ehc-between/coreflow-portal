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
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AuditAccess } from '../data/audit-access';
import { textOrNull } from '../data/audit-display';
import { FRAMEWORKS, ProgrammeDetail, ProgrammeInput } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditChoiceCheckboxes, Choice } from '../shared/choice-checkboxes';
import { AuditFormPage } from '../shared/form-page';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditUserSelect } from '../shared/user-select';

export interface ProgrammeFormValue {
  title: string;
  year: string;
  description: string;
  objectives: string;
  riskBasis: string;
  frameworks: string[];
  ownerId: string;
  changeReason: string;
}

export function programmeFormToInput(v: ProgrammeFormValue, editing: boolean): ProgrammeInput {
  return {
    title: v.title.trim(),
    year: Number(v.year),
    description: textOrNull(v.description),
    objectives: textOrNull(v.objectives),
    risk_basis: textOrNull(v.riskBasis),
    frameworks: v.frameworks,
    owner_user_id: v.ownerId || null,
    ...(editing ? { change_reason: textOrNull(v.changeReason) } : {}),
  };
}

/** `/audits/programmes/new` and `/:id/edit`: a yearly, risk-based audit programme. */
@Component({
  selector: 'app-audit-programme-form',
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
      [titleKey]="id() ? 'audits.programmeForm.editTitle' : 'audits.programmeForm.newTitle'"
      guidePage="programmeForm"
      [backLink]="id() ? ['/audits/programmes', id()] : '/audits/programmes'"
      [busy]="saving.busy()"
      [canSave]="valid()"
      [ready]="!id() || existing.state() === 'ready'"
      (save)="save()"
      (cancelled)="back()"
    >
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
        <app-form-field [label]="'audits.fields.title' | transloco" inputId="prog-title">
          <input
            id="prog-title"
            required
            aria-required="true"
            maxlength="255"
            [value]="f().title"
            (input)="patch({ title: $any($event.target).value })"
          />
          <app-field-help scope="audits" page="programmeForm" field="title" />
        </app-form-field>
        <app-form-field [label]="'audits.fields.year' | transloco" inputId="prog-year">
          <input
            id="prog-year"
            type="number"
            min="2000"
            max="2100"
            required
            [value]="f().year"
            (input)="patch({ year: $any($event.target).value })"
          />
        </app-form-field>
      </div>
      <app-form-field [label]="'audits.fields.description' | transloco" inputId="prog-description">
        <textarea
          id="prog-description"
          rows="3"
          [value]="f().description"
          (input)="patch({ description: $any($event.target).value })"
        ></textarea>
      </app-form-field>
      <app-form-field [label]="'audits.fields.objectives' | transloco" inputId="prog-objectives">
        <textarea
          id="prog-objectives"
          rows="3"
          [value]="f().objectives"
          (input)="patch({ objectives: $any($event.target).value })"
        ></textarea>
        <app-field-help scope="audits" page="programmeForm" field="objectives" />
      </app-form-field>
      <app-form-field [label]="'audits.fields.riskBasis' | transloco" inputId="prog-risk">
        <div class="flex items-start gap-2">
          <textarea
            id="prog-risk"
            rows="4"
            [value]="f().riskBasis"
            (input)="patch({ riskBasis: $any($event.target).value })"
          ></textarea>
          <app-ask-about
            class="mt-1.5 flex-none"
            field="risk_basis"
            [prompt]="'audits.programmeForm.askRiskBasis' | transloco"
          />
        </div>
        <app-field-help scope="audits" page="programmeForm" field="riskBasis" />
      </app-form-field>
      <app-audit-choice-checkboxes
        [legend]="'audits.fields.frameworks' | transloco"
        [choices]="frameworkChoices"
        [selected]="f().frameworks"
        (selectedChange)="patch({ frameworks: $event })"
      />
      <app-form-field [label]="'audits.fields.owner' | transloco" inputId="prog-owner">
        <app-audit-user-select
          inputId="prog-owner"
          [value]="f().ownerId"
          [currentName]="existing.value()?.owner?.name ?? null"
          (valueChange)="patch({ ownerId: $event })"
        />
      </app-form-field>
      @if (id()) {
        <app-form-field [label]="'audits.fields.changeReason' | transloco" inputId="prog-reason">
          <input
            id="prog-reason"
            maxlength="2000"
            [value]="f().changeReason"
            (input)="patch({ changeReason: $any($event.target).value })"
          />
        </app-form-field>
      }
    </app-audit-form-page>
  `,
})
export class ProgrammeForm {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly access = inject(AuditAccess);

  readonly id = input<string | undefined>(undefined);

  protected readonly frameworkChoices: readonly Choice[] = FRAMEWORKS.map((k) => ({
    value: k,
    label: `audits.frameworks.${k}`,
  }));
  protected readonly existing = loadable<ProgrammeDetail>();
  protected readonly saving = mutator();
  protected readonly f = signal<ProgrammeFormValue>({
    title: '',
    year: String(new Date().getFullYear()),
    description: '',
    objectives: '',
    riskBasis: '',
    frameworks: [],
    ownerId: '',
    changeReason: '',
  });
  protected readonly valid = computed(() => {
    const year = Number(this.f().year);
    return !!this.f().title.trim() && Number.isInteger(year) && year >= 2000 && year <= 2100;
  });

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_programme',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.f().title || null,
    }));
    effect(() => {
      const orgId = this.access.orgId();
      const id = this.id();
      untracked(() => orgId && id && this.existing.load(this.api.getProgramme(orgId, id)));
    });
    effect(() => {
      const p = this.existing.value();
      if (p) {
        untracked(() =>
          this.f.set({
            title: p.title,
            year: String(p.year),
            description: p.description ?? '',
            objectives: p.objectives ?? '',
            riskBasis: p.risk_basis ?? '',
            frameworks: [...p.frameworks],
            ownerId: p.owner?.id ?? '',
            changeReason: '',
          }),
        );
      }
    });
  }

  protected patch(change: Partial<ProgrammeFormValue>): void {
    this.f.update((v) => ({ ...v, ...change }));
  }

  protected save(): void {
    const orgId = this.access.orgId();
    if (!orgId || !this.valid()) {
      return;
    }
    const id = this.id();
    const body = programmeFormToInput(this.f(), !!id);
    this.saving.run(
      id ? this.api.updateProgramme(orgId, id, body) : this.api.createProgramme(orgId, body),
      {
        success: id ? 'audits.notices.saved' : 'audits.notices.programmeCreated',
        next: (p) => void this.router.navigate(['/audits/programmes', p.id]),
      },
    );
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/audits/programmes', id] : ['/audits/programmes']);
  }
}

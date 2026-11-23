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
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { AuditAccess } from '../data/audit-access';
import { textOrNull } from '../data/audit-display';
import { AuditFrameworks } from '../data/audit-frameworks';
import { ProgrammeDetail, ProgrammeInput } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditField } from '../shared/audit-field';
import { AuditChoiceCheckboxes, Choice } from '../shared/choice-checkboxes';
import { AuditFormPage } from '../shared/form-page';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditUserSelect } from '../shared/user-select';
import { FormSection } from '../../../shared/ui/form-section/form-section';

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

/** The risk basis text of the `audits.suggest_programme` assist result, with the proposed audits. */
export function suggestedRiskBasis(
  data: unknown,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  const d = (data ?? {}) as { risk_basis?: unknown; audits?: unknown };
  const basis = typeof d.risk_basis === 'string' ? d.risk_basis.trim() : '';
  const audits = Array.isArray(d.audits) ? d.audits : [];
  const lines = audits
    .map((a) => a as { title?: unknown; quarter?: unknown; why?: unknown })
    .filter((a) => typeof a.title === 'string' && a.title.trim())
    .map((a) => {
      const quarter =
        typeof a.quarter === 'number'
          ? ` (${t('audits.programmeForm.quarter', { q: a.quarter })})`
          : '';
      const why = typeof a.why === 'string' && a.why.trim() ? ` – ${a.why.trim()}` : '';
      return `- ${String(a.title).trim()}${quarter}${why}`;
    });
  const text = [
    basis,
    lines.length ? `${t('audits.programmeForm.proposedAudits')}\n${lines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return text || null;
}

/** `/audits/programmes/new` and `/:id/edit`: a yearly, risk-based audit programme. */
@Component({
  selector: 'app-audit-programme-form',
  imports: [
    FormSection,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    AuditField,
    AuditFormPage,
    AuditChoiceCheckboxes,
    AuditUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-audit-form-page
      [titleKey]="id() ? 'audits.programmeForm.editTitle' : 'audits.programmeForm.newTitle'"
      guidePage="programmeForm"
      lesson="internal-audits"
      [breadcrumbs]="breadcrumbs()"
      [busy]="saving.busy()"
      [canSave]="valid()"
      invalidKey="audits.programmeForm.fix"
      [ready]="!id() || existing.state() === 'ready'"
      (save)="save()"
      (cancelled)="back()"
    >
      <app-form-section
        [title]="'audits.programmeForm.sections.basics' | transloco"
        [description]="'audits.programmeForm.sections.basicsHint' | transloco"
      >
        <app-audit-field
          span="full"
          inputId="prog-title"
          labelKey="audits.fields.title"
          [required]="true"
          helpPage="programmeForm"
          helpField="title"
        >
          <input
            id="prog-title"
            required
            aria-required="true"
            maxlength="255"
            [value]="f().title"
            (input)="patch({ title: $any($event.target).value })"
          />
        </app-audit-field>
        <app-audit-field inputId="prog-year" labelKey="audits.fields.year" [required]="true">
          <input
            id="prog-year"
            type="number"
            inputmode="numeric"
            min="2000"
            max="2100"
            required
            [value]="f().year"
            (input)="patch({ year: $any($event.target).value })"
          />
        </app-audit-field>
        <app-audit-field inputId="prog-owner" labelKey="audits.fields.owner">
          <app-audit-user-select
            inputId="prog-owner"
            [value]="f().ownerId"
            [currentName]="existing.value()?.owner?.name ?? null"
            (valueChange)="patch({ ownerId: $event })"
          />
        </app-audit-field>
        <app-audit-field
          span="full"
          inputId="prog-description"
          labelKey="audits.fields.description"
        >
          <textarea
            id="prog-description"
            rows="3"
            [value]="f().description"
            (input)="patch({ description: $any($event.target).value })"
          ></textarea>
        </app-audit-field>
      </app-form-section>

      <app-form-section
        [title]="'audits.programmeForm.sections.basis' | transloco"
        [description]="'audits.programmeForm.sections.basisHint' | transloco"
      >
        <app-audit-choice-checkboxes
          [legend]="'audits.fields.frameworks' | transloco"
          [choices]="frameworkChoices()"
          [selected]="f().frameworks"
          (selectedChange)="patch({ frameworks: $event })"
        />
        <app-audit-field
          span="full"
          inputId="prog-objectives"
          labelKey="audits.fields.objectives"
          helpPage="programmeForm"
          helpField="objectives"
        >
          <textarea
            id="prog-objectives"
            rows="3"
            [value]="f().objectives"
            (input)="patch({ objectives: $any($event.target).value })"
          ></textarea>
        </app-audit-field>
        <app-audit-field
          span="full"
          inputId="prog-risk"
          labelKey="audits.fields.riskBasis"
          helpPage="programmeForm"
          helpField="riskBasis"
        >
          <app-ask-about
            ask
            field="risk_basis"
            [fieldLabel]="'audits.fields.riskBasis' | transloco"
            [prompt]="'audits.programmeForm.askRiskBasis' | transloco"
          />
          <app-ai-assist-button
            ask
            assist="audits.suggest_programme"
            labelKey="audits.ai.suggestProgramme"
            variant="ghost"
            [entityType]="id() ? 'audit_programme' : null"
            [entityId]="id() ?? null"
            [input]="{ programme_id: id() ?? null, year: yearNumber(), frameworks: f().frameworks }"
            (result)="applySuggestion($event)"
          />
          <textarea
            id="prog-risk"
            rows="5"
            [value]="f().riskBasis"
            (input)="patch({ riskBasis: $any($event.target).value })"
          ></textarea>
          <span hint>{{ 'audits.programmeForm.riskHint' | transloco }}</span>
        </app-audit-field>
      </app-form-section>
      @if (id()) {
        <app-form-section [columns]="1">
          <app-audit-field inputId="prog-reason" labelKey="audits.fields.changeReason">
            <input
              id="prog-reason"
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
export class ProgrammeForm {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly access = inject(AuditAccess);
  private readonly frameworks = inject(AuditFrameworks);
  private readonly language = inject(LanguageService);

  readonly id = input<string | undefined>(undefined);

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
  protected readonly frameworkChoices = computed<readonly Choice[]>(() =>
    this.frameworks
      .options(this.f().frameworks)
      .map((k) => ({ value: k, label: `audits.frameworks.${k}` })),
  );
  protected readonly yearNumber = computed(() => Number(this.f().year) || null);
  protected readonly valid = computed(() => {
    const year = Number(this.f().year);
    return !!this.f().title.trim() && Number.isInteger(year) && year >= 2000 && year <= 2100;
  });
  protected readonly breadcrumbs = computed(() => {
    const id = this.id();
    const p = this.existing.value();
    return [
      { labelKey: 'modules.names.audits', link: '/audits' },
      { labelKey: 'audits.programmes.title', link: '/audits/programmes' },
      ...(id && p ? [{ label: p.code, link: ['/audits/programmes', id] }] : []),
      { labelKey: id ? 'audits.programmeForm.editTitle' : 'audits.programmeForm.newTitle' },
    ];
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

  /** Put the suggested risk basis into an empty field, or below what is there. */
  protected applySuggestion(data: unknown): void {
    const text = suggestedRiskBasis(data, (k, p) => this.language.translate(k, p));
    if (!text) {
      return;
    }
    const current = this.f().riskBasis.trim();
    this.patch({ riskBasis: current ? `${current}\n\n${text}` : text });
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

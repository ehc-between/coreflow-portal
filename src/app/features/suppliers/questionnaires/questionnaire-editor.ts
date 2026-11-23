import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import {
  AcceptedSuggestion,
  FormSuggest,
  FormSuggestFieldDef,
} from '../../../shared/ask/form-suggest';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { FormField } from '../../../shared/ui/form-field/form-field';

import { blankToNull } from '../data/supplier-display';
import { supplierErrorKey } from '../data/supplier-errors';
import {
  EVALUATION_KINDS,
  EvaluationKind,
  QuestionIn,
  Questionnaire,
} from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { questionnaireLang } from '../detail/start-evaluation-dialog';
import {
  EditableQuestion,
  QuestionEditor,
  blankQuestion,
  toEditable,
  toQuestionIn,
} from '../shared/question-editor';

/**
 * Create or edit an org questionnaire template (`/settings/modules/suppliers/questionnaires/new`,
 * `…/:qid/edit`; `suppliers:manage`). `?from=<template id>` starts from a copy (e.g.
 * of a built-in template). "Foreslå spørreskjema" proposes the whole questionnaire.
 */
@Component({
  selector: 'app-questionnaire-editor',
  imports: [
    TranslocoPipe,
    FormSuggest,
    Alert,
    Button,
    FormActions,
    FormSection,
    FieldHelp,
    FormField,
    HelpStrip,
    LoadingState,
    PageHeader,
    QuestionEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[808px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="
          qid() ? 'suppliers.questionnaires.editTitle' : 'suppliers.questionnaires.newTitle'
        "
        [breadcrumbs]="[
          { labelKey: 'nav.settings', link: '/settings' },
          { labelKey: 'modules.names.suppliers' },
          {
            labelKey: 'suppliers.questionnaires.title',
            link: '/settings/modules/suppliers/questionnaires',
          },
          {
            labelKey: qid()
              ? 'suppliers.questionnaires.editTitle'
              : 'suppliers.questionnaires.newTitle',
          },
        ]"
        backLink="/settings/modules/suppliers/questionnaires"
        backLabelKey="suppliers.questionnaires.back"
      />
      <app-help-strip scope="suppliers" page="questionnaire" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="5" />
      } @else if (state() === 'error') {
        <app-alert>{{ 'suppliers.questionnaires.notFound' | transloco }}</app-alert>
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-form-suggest
            suggestKey="suppliers.questionnaire"
            labelKey="ask.formSuggest.labels.questionnaire"
            [fields]="suggestFields()"
            [values]="suggestValues()"
            [context]="{ from: 'suppliers' }"
            [editing]="!!qid()"
            [titleOnly]="!!name().trim() && !hasQuestions()"
            (applied)="applySuggestion($event)"
          />
          <app-form-section
            [title]="'suppliers.questionnaires.sections.basics' | transloco"
            [description]="'suppliers.questionnaires.sections.basicsHint' | transloco"
          >
            <app-form-field
              span="full"
              [label]="'suppliers.questionnaires.name' | transloco"
              inputId="qn-name"
              [required]="true"
            >
              <input
                id="qn-name"
                type="text"
                maxlength="255"
                required
                [value]="name()"
                (input)="name.set($any($event.target).value)"
              />
            </app-form-field>
            <app-form-field [label]="'suppliers.evaluations.kind' | transloco" inputId="qn-kind">
              <select id="qn-kind" (change)="kind.set($any($event.target).value)">
                @for (k of kinds; track k) {
                  <option [value]="k" [selected]="kind() === k">
                    {{ 'suppliers.evaluationKind.' + k | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field
              [label]="'suppliers.evaluation.passScore' | transloco"
              inputId="qn-pass"
            >
              <app-field-help
                label-suffix
                scope="suppliers"
                page="questionnaire"
                field="pass_score"
                [label]="'suppliers.evaluation.passScore' | transloco"
              />
              <input
                id="qn-pass"
                type="number"
                min="0"
                max="100"
                [value]="passScore()"
                (change)="passScore.set(+$any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              span="full"
              [label]="'suppliers.questionnaires.description' | transloco"
              inputId="qn-desc"
            >
              <textarea
                id="qn-desc"
                rows="2"
                maxlength="5000"
                [value]="description()"
                (input)="description.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
          </app-form-section>

          <app-form-section
            [title]="'suppliers.evaluation.questions' | transloco"
            [description]="'suppliers.questionnaires.sections.questionsHint' | transloco"
            [columns]="1"
          >
            <app-question-editor
              [questions]="questions()"
              [disabled]="busy()"
              (questionsChange)="questions.set($event)"
            />
          </app-form-section>

          <app-form-actions [message]="error() ? (error()! | transloco) : ''">
            <app-button variant="secondary" (click)="back()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="busy()">{{
              'common.save' | transloco
            }}</app-button>
          </app-form-actions>
        </form>
      }
    </div>
  `,
})
export class QuestionnaireEditor {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Template id when editing (route `:qid`). */
  readonly qid = input<string | undefined>(undefined);
  /** Template to copy from (query `?from=`). */
  readonly from = input<string | undefined>(undefined);

  protected readonly kinds = EVALUATION_KINDS;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly name = signal('');
  protected readonly kind = signal<EvaluationKind>('initial');
  protected readonly description = signal('');
  protected readonly passScore = signal(70);
  protected readonly questions = signal<readonly EditableQuestion[]>([blankQuestion()]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'suppliers',
      view: this.qid() ? 'edit' : 'new',
      title: this.language.translate('suppliers.questionnaires.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const source = this.qid() ?? this.from();
      const copying = !this.qid();
      untracked(() => {
        if (orgId && source) {
          this.loadSource(orgId, source, copying);
        }
      });
    });
  }

  protected readonly suggestFields = computed((): readonly FormSuggestFieldDef[] => {
    const t = (key: string): string => this.language.translate(key);
    return [
      { name: 'name', labelKey: 'suppliers.questionnaires.name' },
      {
        name: 'kind',
        labelKey: 'suppliers.evaluations.kind',
        format: (value) => t(`suppliers.evaluationKind.${String(value)}`),
      },
      { name: 'description', labelKey: 'suppliers.questionnaires.description', long: true },
      { name: 'pass_score', labelKey: 'suppliers.evaluation.passScore' },
      {
        name: 'questions',
        labelKey: 'suppliers.evaluation.questions',
        format: (value) =>
          (Array.isArray(value) ? value : [])
            .map((q) => String((q as { text?: unknown }).text ?? ''))
            .join(' · '),
      },
    ];
  });
  protected readonly hasQuestions = computed(() => this.questions().some((q) => q.text.trim()));
  protected readonly suggestValues = computed(() => ({
    name: this.name(),
    kind: this.kind(),
    description: this.description(),
    pass_score: this.passScore(),
    questions: toQuestionIn(this.questions()).map((q) => ({
      text: q.text,
      help: q.help ?? '',
      category: q.category ?? 'general',
      type: q.type,
      weight: q.weight ?? 1,
      critical: !!q.critical,
    })),
  }));

  /** Accepted suggestions fill the form (questions replace the blank / current ones). */
  protected applySuggestion(accepted: AcceptedSuggestion): void {
    const value = (name: string): unknown => accepted[name]?.value;
    if (typeof value('name') === 'string') {
      this.name.set(value('name') as string);
    }
    const kind = value('kind');
    if (typeof kind === 'string' && (this.kinds as readonly string[]).includes(kind)) {
      this.kind.set(kind as EvaluationKind);
    }
    if (typeof value('description') === 'string') {
      this.description.set(value('description') as string);
    }
    const pass = value('pass_score');
    if (typeof pass === 'number' && pass >= 0 && pass <= 100) {
      this.passScore.set(pass);
    }
    const drafted = value('questions');
    if (Array.isArray(drafted)) {
      const rows = (drafted as QuestionIn[])
        .filter((q) => typeof q?.text === 'string' && q.text.trim())
        .map((q) => toEditable({ ...q, id: null }));
      if (rows.length) {
        this.questions.set(rows);
      }
    }
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const questions = toQuestionIn(this.questions());
    if (!this.name().trim()) {
      this.error.set('suppliers.errors.name_required');
      return;
    }
    if (questions.length === 0) {
      this.error.set('suppliers.errors.questions_required');
      return;
    }
    const body = {
      name: this.name().trim(),
      kind: this.kind(),
      description: blankToNull(this.description()),
      questions,
      pass_score: Math.min(100, Math.max(0, Math.round(this.passScore() || 0))),
    };
    const id = this.qid();
    const call = id
      ? this.api.updateQuestionnaire(orgId, id, body)
      : this.api.createQuestionnaire(orgId, body);
    this.busy.set(true);
    this.error.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('suppliers.questionnaires.saved');
        this.back();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(supplierErrorKey(err));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/settings/modules/suppliers/questionnaires']);
  }

  private loadSource(orgId: string, id: string, copying: boolean): void {
    this.request.unsubscribe();
    this.state.set('loading');
    const lang = questionnaireLang(this.language.active());
    this.request = this.api.getQuestionnaire(orgId, id, lang).subscribe({
      next: (t) => {
        this.fill(t, copying);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private fill(t: Questionnaire, copying: boolean): void {
    this.name.set(
      copying
        ? this.language.translate('suppliers.questionnaires.copyName', { name: t.name })
        : t.name,
    );
    this.kind.set(t.kind);
    this.description.set(t.description ?? '');
    this.passScore.set(t.pass_score);
    this.questions.set(t.questions.map((q) => toEditable(copying ? { ...q, id: null } : q)));
  }
}

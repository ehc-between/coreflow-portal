import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { blankToNull } from '../data/supplier-display';
import { supplierErrorKey } from '../data/supplier-errors';
import {
  DraftQuestionnaireResult,
  EVALUATION_KINDS,
  EvaluationKind,
  QuestionIn,
  Questionnaire,
} from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { questionnaireLang } from '../detail/supplier-evaluations-panel';
import {
  EditableQuestion,
  QuestionEditor,
  blankQuestion,
  toEditable,
  toQuestionIn,
} from '../shared/question-editor';

/**
 * Create or edit an org questionnaire template (`/suppliers/questionnaires/new`,
 * `…/:qid/edit`; `suppliers:manage`). `?from=<template id>` starts from a copy (e.g.
 * of a built-in template). The assistant can draft questions for the kind and focus.
 */
@Component({
  selector: 'app-questionnaire-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    Alert,
    Button,
    Card,
    FieldHelp,
    FormField,
    GuideIntro,
    Icon,
    QuestionEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/suppliers/questionnaires"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'suppliers.questionnaires.back' | transloco }}
      </a>
      <h1 class="mb-3 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
        {{
          (qid() ? 'suppliers.questionnaires.editTitle' : 'suppliers.questionnaires.newTitle')
            | transloco
        }}
      </h1>
      <div class="mb-4"><app-guide-intro scope="suppliers" page="questionnaire" /></div>

      @if (state() === 'loading') {
        <p class="text-[14px] text-fg-muted">{{ 'suppliers.common.loading' | transloco }}</p>
      } @else if (state() === 'error') {
        <app-alert>{{ 'suppliers.questionnaires.notFound' | transloco }}</app-alert>
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-card>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'suppliers.questionnaires.name' | transloco"
                  inputId="qn-name"
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
              </div>
              <app-form-field [label]="'suppliers.evaluations.kind' | transloco" inputId="qn-kind">
                <select id="qn-kind" (change)="kind.set($any($event.target).value)">
                  @for (k of kinds; track k) {
                    <option [value]="k" [selected]="kind() === k">
                      {{ 'suppliers.evaluationKind.' + k | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
              <div>
                <div class="flex items-center gap-1">
                  <app-field-help scope="suppliers" page="questionnaire" field="pass_score" />
                </div>
                <app-form-field
                  [label]="'suppliers.evaluation.passScore' | transloco"
                  inputId="qn-pass"
                >
                  <input
                    id="qn-pass"
                    type="number"
                    min="0"
                    max="100"
                    [value]="passScore()"
                    (change)="passScore.set(+$any($event.target).value)"
                  />
                </app-form-field>
              </div>
              <div class="sm:col-span-2">
                <app-form-field
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
              </div>
            </div>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
              <h2 class="font-display text-[15px] font-bold text-fg">
                {{ 'suppliers.evaluation.questions' | transloco }}
              </h2>
              <div class="flex flex-wrap items-end gap-2">
                <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
                  {{ 'suppliers.questionnaires.focus' | transloco }}
                  <input
                    type="text"
                    maxlength="200"
                    class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
                    [placeholder]="'suppliers.questionnaires.focusPlaceholder' | transloco"
                    [value]="focus()"
                    (input)="focus.set($any($event.target).value)"
                  />
                </label>
                <app-ai-assist-button
                  assist="suppliers.draft_questionnaire"
                  labelKey="suppliers.ai.draftQuestions"
                  [input]="{ kind: kind(), count: 8, focus: focus() || null }"
                  (result)="addDrafted($event)"
                />
              </div>
            </div>
            <app-question-editor
              [questions]="questions()"
              [disabled]="busy()"
              (questionsChange)="questions.set($event)"
            />
          </app-card>

          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div class="flex justify-end gap-2">
            <app-button variant="ghost" (click)="back()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="busy()">{{
              'common.save' | transloco
            }}</app-button>
          </div>
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
  protected readonly focus = signal('');
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

  protected addDrafted(result: unknown): void {
    const drafted = (result as DraftQuestionnaireResult | null)?.questions;
    if (!Array.isArray(drafted)) {
      return;
    }
    const rows = (drafted as QuestionIn[])
      .filter((q) => typeof q?.text === 'string' && q.text.trim())
      .map((q) => toEditable({ ...q, id: null }));
    this.questions.update((current) => [...current.filter((q) => q.text.trim()), ...rows]);
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
    void this.router.navigate(['/suppliers/questionnaires']);
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

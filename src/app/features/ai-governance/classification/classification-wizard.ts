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
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, catchError, debounceTime, of, switchMap } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import {
  AiSystem,
  Assessment,
  ClassificationAnswers,
  ClassificationResult,
  SuggestedClassification,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  AI_SYSTEM_ENTITY,
  emptyAnswers,
  normalizeAnswers,
} from '../data/ai-governance-display';
import { AiClassificationResult } from '../ui/classification-result';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiLessonCard } from '../ui/ai-lesson-card';
import { AiClassificationQuestions } from './classification-questions';

const PREVIEW_DEBOUNCE_MS = 300;

/** Answer fields with a translated label (rationale keys of the assistant's suggestion). */
const ANSWER_KEYS: ReadonlySet<string> = new Set(Object.keys(emptyAnswers()));

/**
 * `/ai-governance/systems/:id/classify[?assessment=<id>]`: the EU AI Act
 * classification wizard for one AI system. The outcome is previewed live by
 * the server's rules (nothing stored); "Save draft" keeps a classification
 * assessment, "Complete" applies the risk class to the system and creates one
 * task per obligation. The assistant can suggest answers from the system's
 * description; a person always reviews them.
 */
@Component({
  selector: 'app-ai-classification-wizard',
  imports: [
    TranslocoPipe,
    AiAssistButton,
    AiLessonCard,
    TourButton,
    TourStepDirective,
    Alert,
    Button,
    Card,
    AiClassificationResult,
    AiGovPage,
    AiClassificationQuestions,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.wizard.title"
      [titleParams]="{ name: system()?.name ?? '' }"
      page="classify"
      [backLink]="['/ai-governance/systems', id()]"
      backLabelKey="aiGovernance.wizard.backToSystem"
    >
      <div actions class="flex flex-wrap items-center gap-2">
        <app-tour-button [scope]="scope" tour="classify" />
        @if (system(); as s) {
          <span appTourStep="ai-classify-suggest">
            <app-ai-assist-button
              assist="ai_governance.suggest_classification"
              labelKey="aiGovernance.ai.suggestClassification"
              [input]="{ ai_system_id: s.id }"
              entityType="ai_system"
              [entityId]="s.id"
              [disabled]="locked()"
              (result)="applySuggestion($event)"
            />
          </span>
        }
      </div>

      @if (loadError()) {
        <app-alert tone="error">{{ loadError()! | transloco }}</app-alert>
      } @else if (system(); as s) {
        @if (locked()) {
          <app-alert tone="info">{{ 'aiGovernance.wizard.locked' | transloco }}</app-alert>
        }
        @if (rationale().length) {
          <app-card class="mb-4">
            <h2 class="mb-1.5 text-[14px] font-bold text-fg">
              {{ 'aiGovernance.wizard.suggestionTitle' | transloco }}
            </h2>
            <p class="mb-2 text-[12.5px] text-fg-muted">
              {{ 'aiGovernance.wizard.suggestionHint' | transloco }}
            </p>
            <ul class="list-disc pl-5 text-[13px] text-fg">
              @for (r of rationale(); track r.key) {
                <li>
                  <span class="font-semibold">{{ r.label }}:</span> {{ r.text }}
                </li>
              }
            </ul>
          </app-card>
        }
        <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <app-card appTourStep="ai-classify-questions">
            <app-ai-classification-questions
              [(answers)]="answers"
              [catalog]="store.catalog()"
              [defaultRole]="s.ai_act_role"
              [disabled]="locked() || !!busy()"
            />
          </app-card>
          <div class="flex flex-col gap-4">
            <app-card appTourStep="ai-classify-result">
              <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                {{ 'aiGovernance.wizard.preview' | transloco }}
              </h2>
              @if (preview(); as r) {
                <app-ai-classification-result [result]="r" />
              } @else if (previewFailed()) {
                <p class="text-[13px] text-fail">
                  {{ 'aiGovernance.wizard.previewFailed' | transloco }}
                </p>
              } @else {
                <p class="text-[13px] text-fg-muted">
                  {{ 'aiGovernance.common.loading' | transloco }}
                </p>
              }
            </app-card>
            @if (store.canWrite() && !locked()) {
              <app-card>
                <label class="mb-3 flex items-start gap-2 text-[13px] text-fg">
                  <input
                    type="checkbox"
                    class="mt-0.5"
                    [checked]="createTasks()"
                    (change)="createTasks.set($any($event.target).checked)"
                  />
                  {{ 'aiGovernance.wizard.createTasks' | transloco }}
                </label>
                @if (error()) {
                  <app-alert tone="error" class="mb-3">{{ error()! | transloco }}</app-alert>
                }
                <div class="flex flex-wrap gap-2" appTourStep="ai-classify-complete">
                  <app-button
                    variant="secondary"
                    size="sm"
                    [loading]="busy() === 'save'"
                    [disabled]="!!busy()"
                    (click)="save(false)"
                  >
                    {{ 'aiGovernance.wizard.saveDraft' | transloco }}
                  </app-button>
                  <app-button
                    size="sm"
                    [loading]="busy() === 'complete'"
                    [disabled]="!!busy()"
                    (click)="save(true)"
                    data-testid="wizard-complete"
                  >
                    {{ 'aiGovernance.wizard.complete' | transloco }}
                  </app-button>
                </div>
                <p class="mt-2 text-[12px] text-fg-subtle">
                  {{ 'aiGovernance.wizard.completeHint' | transloco }}
                </p>
              </app-card>
            }
            <app-ai-lesson-card lesson="eu-ai-act-risk-classes" />
          </div>
        </div>
      } @else {
        <p class="text-[14px] text-fg-muted">{{ 'aiGovernance.common.loading' | transloco }}</p>
      }
    </app-ai-gov-page>
  `,
})
export class ClassificationWizard {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly store = inject(AiGovernanceStore);

  /** AI system id (route param). */
  readonly id = input.required<string>();
  /** Existing classification assessment to continue (query param). */
  readonly assessment = input<string | undefined>(undefined);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly system = signal<AiSystem | null>(null);
  protected readonly draft = signal<Assessment | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly answers = signal<ClassificationAnswers>(emptyAnswers());
  protected readonly preview = signal<ClassificationResult | null>(null);
  protected readonly previewFailed = signal(false);
  protected readonly rationale = signal<readonly { key: string; label: string; text: string }[]>(
    [],
  );
  protected readonly createTasks = signal(true);
  protected readonly busy = signal<'save' | 'complete' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly locked = computed(() => {
    const d = this.draft();
    return !!d && d.status !== 'draft';
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      entityId: this.id(),
      view: 'edit',
      title: this.system()?.name ?? null,
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const assessmentId = this.assessment();
      untracked(() => this.load(orgId, id, assessmentId));
    });

    const sub = toObservable(this.answers)
      .pipe(
        debounceTime(PREVIEW_DEBOUNCE_MS),
        switchMap((answers) => this.previewOf(answers)),
      )
      .subscribe((result) => {
        this.preview.set(result);
        this.previewFailed.set(result === null);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  private previewOf(answers: ClassificationAnswers): Observable<ClassificationResult | null> {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return of(null);
    }
    return this.api
      .previewClassification(orgId, {
        answers,
        ai_system_id: this.id(),
        lang: this.lang(),
      })
      .pipe(catchError(() => of(null)));
  }

  private lang(): 'en' | 'nb' {
    return this.language.active() === 'nb' ? 'nb' : 'en';
  }

  private load(orgId: string | null, id: string, assessmentId: string | undefined): void {
    if (!orgId) {
      return;
    }
    this.store.ensureCatalog();
    this.api.getSystem(orgId, id).subscribe({
      next: (system) => this.system.set(system),
      error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
    });
    if (assessmentId) {
      this.api.getAssessment(orgId, assessmentId).subscribe({
        next: (assessment) => {
          if (assessment.kind !== 'classification') {
            this.loadError.set('aiGovernance.errors.invalid_kind');
            return;
          }
          this.draft.set(assessment);
          this.answers.set(normalizeAnswers(assessment.answers));
        },
        error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
      });
    }
  }

  protected applySuggestion(data: unknown): void {
    const suggestion = (data ?? {}) as SuggestedClassification;
    const catalog = this.store.catalog();
    const allowed = catalog
      ? {
          prohibited_practices: catalog.prohibited_practices.map((p) => p.key),
          annex_iii_areas: catalog.annex_iii_areas.map((p) => p.key),
          transparency: catalog.transparency_triggers.map((p) => p.key),
        }
      : undefined;
    const next = normalizeAnswers({ ...this.answers(), ...suggestion.answers }, allowed);
    if (next.role && !(catalog?.roles ?? []).includes(next.role)) {
      this.answers.set({ ...next, role: this.answers().role ?? null });
    } else {
      this.answers.set(next);
    }
    const rationale = suggestion.rationale ?? {};
    this.rationale.set(
      Object.entries(rationale)
        .filter(([, text]) => typeof text === 'string' && text.trim())
        .map(([key, text]) => ({
          key,
          label: ANSWER_KEYS.has(key)
            ? this.language.translate('aiGovernance.wizard.answerLabels.' + key)
            : key,
          text,
        })),
    );
    this.notifications.info('aiGovernance.wizard.suggestionApplied');
  }

  protected save(complete: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    const system = this.system();
    if (!orgId || !system || this.busy()) {
      return;
    }
    this.busy.set(complete ? 'complete' : 'save');
    this.error.set(null);
    const draft = this.draft();
    const saved$ = draft
      ? this.api.updateAssessment(orgId, draft.id, { answers: { ...this.answers() } })
      : this.api.createAssessment(orgId, {
          ai_system_id: system.id,
          kind: 'classification',
          answers: { ...this.answers() },
        });
    saved$
      .pipe(
        switchMap((assessment) => {
          this.draft.set(assessment);
          return complete
            ? this.api.completeAssessment(orgId, assessment.id, {
                create_tasks: this.createTasks(),
                due_in_days: 30,
                lang: this.lang(),
              })
            : of(assessment);
        }),
      )
      .subscribe({
        next: (assessment) => {
          this.busy.set(null);
          this.draft.set(assessment);
          if (complete) {
            this.notifications.success('aiGovernance.wizard.completed', {
              count: assessment.created_tasks.length,
            });
            void this.router.navigate(['/ai-governance/assessments', assessment.id]);
          } else {
            this.notifications.success('aiGovernance.wizard.saved');
            void this.router.navigate([], {
              queryParams: { assessment: assessment.id },
              replaceUrl: true,
            });
          }
        },
        error: (err: unknown) => {
          this.busy.set(null);
          this.error.set(aiGovernanceErrorKey(err));
        },
      });
  }
}

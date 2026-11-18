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
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey, isDowngradeRefusal } from '../data/ai-governance-errors';
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
  AI_SYSTEM_ENTITY,
  emptyAnswers,
  normalizeAnswers,
  riskKey,
} from '../data/ai-governance-display';
import { AiClassificationResult } from '../ui/classification-result';
import { AiGovPage } from '../ui/ai-gov-page';
import {
  AiClassificationQuestions,
  DECISIVE_STEPS,
  WIZARD_STEPS,
  WizardStep,
} from './classification-questions';

const PREVIEW_DEBOUNCE_MS = 300;

/** Answer fields with a translated label (rationale keys of the assistant's suggestion). */
const ANSWER_KEYS: ReadonlySet<string> = new Set(Object.keys(emptyAnswers()));

/** Whether a stored draft already carries answers (a reclassification or a saved draft). */
export function hasAnswers(answers: unknown): boolean {
  return !!answers && typeof answers === 'object' && Object.keys(answers).length > 0;
}

/**
 * `/ai-governance/systems/:id/classify?assessment=<id>`: the EU AI Act
 * classification wizard for one AI system. "Klassifiser" / "Klassifiser på nytt"
 * open it on a draft prefilled with the current answers, so a reclassification
 * never starts from scratch. The outcome is previewed live by the server's rules
 * and compared with the system's current class; it says "not decided yet" until
 * the decisive steps have been visited, and "Fullfør" waits until every step has
 * been seen. Completing a classification that lowers the class asks for
 * confirmation first (409 `classification_downgrade` otherwise). The assistant
 * can suggest answers; a person always reviews them.
 */
@Component({
  selector: 'app-ai-classification-wizard',
  imports: [
    TranslocoPipe,
    AiAssistButton,
    TourStepDirective,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    LoadingState,
    AiClassificationResult,
    AiGovPage,
    AiClassificationQuestions,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.wizard.title"
      [titleParams]="{ name: system()?.name ?? '' }"
      [breadcrumbs]="crumbs()"
      page="classify"
      tour="classify"
      lesson="eu-ai-act-risk-classes"
      [nav]="false"
      [why]="false"
      [backLink]="['/ai-governance/systems', id()]"
      backLabelKey="aiGovernance.wizard.backToSystem"
    >
      @if (system(); as s) {
        <span secondary appTourStep="ai-classify-suggest">
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

      @if (loadError()) {
        <app-error-state (retry)="retry()" />
      } @else if (system(); as s) {
        @if (locked()) {
          <app-alert tone="info" class="mb-4">{{
            'aiGovernance.wizard.locked' | transloco
          }}</app-alert>
        } @else if (prefilled()) {
          <app-alert tone="info" class="mb-4" data-testid="wizard-prefilled">{{
            'aiGovernance.wizard.prefilled' | transloco
          }}</app-alert>
        }
        @if (rationale().length) {
          <app-card class="mb-4">
            <h2 class="mb-1.5 text-card font-bold text-fg">
              {{ 'aiGovernance.wizard.suggestionTitle' | transloco }}
            </h2>
            <p class="mb-2 text-meta text-fg-muted">
              {{ 'aiGovernance.wizard.suggestionHint' | transloco }}
            </p>
            <ul class="list-disc pl-5 text-ui text-fg">
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
              [(visited)]="visited"
              [catalog]="store.catalog()"
              [defaultRole]="s.ai_act_role"
              [disabled]="locked() || !!busy()"
            />
          </app-card>
          <div class="flex flex-col gap-4">
            <app-card appTourStep="ai-classify-result">
              <h2 class="mb-3 font-display text-section font-bold text-fg">
                {{ 'aiGovernance.wizard.preview' | transloco }}
              </h2>
              @if (preview(); as r) {
                <app-ai-classification-result
                  [result]="r"
                  [decided]="decided()"
                  [showChange]="true"
                  [builtin]="s.is_builtin"
                />
              } @else if (previewFailed()) {
                <p class="text-ui text-fail-ink">
                  {{ 'aiGovernance.wizard.previewFailed' | transloco }}
                </p>
              } @else {
                <app-loading-state [rows]="2" />
              }
            </app-card>
            @if (store.canWrite() && !locked()) {
              <app-card>
                <label class="mb-3 flex items-start gap-2 text-ui text-fg">
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
                    [disabled]="!!busy() || !allVisited()"
                    (click)="requestComplete()"
                    data-testid="wizard-complete"
                  >
                    {{ 'aiGovernance.wizard.complete' | transloco }}
                  </app-button>
                </div>
                <p class="mt-2 text-meta text-fg-subtle" data-testid="wizard-complete-hint">
                  @if (allVisited()) {
                    {{ 'aiGovernance.wizard.completeHint' | transloco }}
                  } @else {
                    {{
                      'aiGovernance.wizard.visitAll'
                        | transloco: { left: stepsLeft(), total: steps.length }
                    }}
                  }
                </p>
              </app-card>
            }
          </div>
        </div>
      } @else {
        <app-loading-state [rows]="6" />
      }
    </app-ai-gov-page>

    <app-confirm-dialog
      [open]="confirmDown()"
      [title]="'aiGovernance.wizard.downgradeTitle' | transloco"
      [message]="
        'aiGovernance.wizard.downgradeMessage'
          | transloco
            : {
                from: (riskKey(preview()?.current_risk_class ?? 'unclassified') | transloco),
                to: (riskKey(preview()?.risk_class ?? 'unclassified') | transloco),
              }
      "
      [confirmLabel]="'aiGovernance.wizard.downgradeConfirm' | transloco"
      [cancelLabel]="'aiGovernance.common.cancel' | transloco"
      [busy]="busy() === 'complete'"
      (confirmed)="save(true, true)"
      (cancelled)="confirmDown.set(false)"
    />
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

  protected readonly steps = WIZARD_STEPS;
  protected readonly riskKey = riskKey;
  protected readonly system = signal<AiSystem | null>(null);
  protected readonly draft = signal<Assessment | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly answers = signal<ClassificationAnswers>(emptyAnswers());
  protected readonly visited = signal<readonly WizardStep[]>(['role']);
  /** The draft came with answers (reclassification / saved draft). */
  protected readonly prefilled = signal(false);
  protected readonly preview = signal<ClassificationResult | null>(null);
  protected readonly previewFailed = signal(false);
  protected readonly rationale = signal<readonly { key: string; label: string; text: string }[]>(
    [],
  );
  protected readonly createTasks = signal(true);
  protected readonly busy = signal<'save' | 'complete' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmDown = signal(false);
  protected readonly locked = computed(() => {
    const d = this.draft();
    return !!d && d.status !== 'draft';
  });
  protected readonly allVisited = computed(
    () => this.prefilled() || WIZARD_STEPS.every((s) => this.visited().includes(s)),
  );
  protected readonly stepsLeft = computed(
    () => WIZARD_STEPS.filter((s) => !this.visited().includes(s)).length,
  );
  /** The decisive steps have been seen, so the preview may name a class. */
  protected readonly decided = computed(
    () =>
      this.prefilled() || this.locked() || DECISIVE_STEPS.every((s) => this.visited().includes(s)),
  );
  protected readonly crumbs = computed(() => {
    const s = this.system();
    return [
      { labelKey: 'aiGovernance.systems.title', link: '/ai-governance/systems' },
      { label: s?.code ?? '…', link: ['/ai-governance/systems', this.id()] },
      { labelKey: 'aiGovernance.wizard.crumb' },
    ];
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      entityId: this.id(),
      view: 'edit',
      title: this.system()?.name ?? null,
      requirements: ['eu_ai_act:5', 'eu_ai_act:6', 'eu_ai_act:50'],
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

  protected retry(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), this.assessment());
  }

  private load(orgId: string | null, id: string, assessmentId: string | undefined): void {
    if (!orgId) {
      return;
    }
    this.loadError.set(null);
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
          if (hasAnswers(assessment.answers)) {
            this.prefilled.set(true);
            this.visited.set(WIZARD_STEPS);
          }
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

  /** "Fullfør": ask first when the outcome would lower the system's risk class. */
  protected requestComplete(): void {
    if (this.preview()?.change === 'down') {
      this.confirmDown.set(true);
      return;
    }
    this.save(true);
  }

  protected save(complete: boolean, confirmDowngrade = false): void {
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
          lang: this.lang(),
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
                ...(confirmDowngrade ? { confirm_downgrade: true } : {}),
              })
            : of(assessment);
        }),
      )
      .subscribe({
        next: (assessment) => {
          this.busy.set(null);
          this.confirmDown.set(false);
          this.draft.set(assessment);
          if (complete) {
            const count = assessment.created_tasks.length;
            this.notifications.success(
              count === 1 ? 'aiGovernance.wizard.completedOne' : 'aiGovernance.wizard.completed',
              { count },
            );
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
          if (complete && isDowngradeRefusal(err)) {
            this.confirmDown.set(true);
            return;
          }
          this.confirmDown.set(false);
          this.error.set(aiGovernanceErrorKey(err));
        },
      });
  }
}

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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey, missingSections } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { Assessment, ClassificationResult } from '../data/ai-governance.models';
import {
  AI_ASSESSMENT_ENTITY,
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  annexIiiKey,
  assessmentSectionKey,
  assessmentStatusKey,
  assessmentStatusTone,
  kindKey,
  normalizeAnswers,
  prohibitedKey,
  roleKey,
  sectionAnswers,
  transparencyKey,
} from '../data/ai-governance-display';
import { AiLessonCard } from '../ui/ai-lesson-card';
import { AiClassificationResult } from '../ui/classification-result';

type Pending = 'complete' | 'approve' | 'reopen' | 'delete' | null;

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

const FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'aiGovernance.fields.title',
  status: 'aiGovernance.fields.status',
  owner_user_id: 'aiGovernance.fields.owner',
  due_at: 'aiGovernance.fields.dueAt',
  answers: 'aiGovernance.fields.answers',
  result: 'aiGovernance.fields.result',
};

/** A stored classification result, if it has the expected shape. */
export function asClassificationResult(result: unknown): ClassificationResult | null {
  if (!result || typeof result !== 'object') {
    return null;
  }
  const r = result as Partial<ClassificationResult>;
  if (typeof r.risk_class !== 'string' || !Array.isArray(r.obligations)) {
    return null;
  }
  return {
    risk_class: r.risk_class,
    role: typeof r.role === 'string' ? r.role : 'not_applicable',
    gpai: !!r.gpai,
    gpai_systemic_risk: !!r.gpai_systemic_risk,
    transparency: Array.isArray(r.transparency) ? r.transparency : [],
    fria_required: !!r.fria_required,
    art6_3_exception_applied: !!r.art6_3_exception_applied,
    reasons: Array.isArray(r.reasons) ? r.reasons : [],
    obligations: r.obligations.filter(
      (o): o is ClassificationResult['obligations'][number] =>
        !!o && typeof o === 'object' && typeof (o as { key?: unknown }).key === 'string',
    ),
  };
}

/**
 * `/ai-governance/assessments/:id`: a classification, impact assessment or
 * FRIA. Draft -> completed -> approved; the person who completed it cannot
 * approve it; completed/approved assessments can be reopened. Shows the
 * answers (or the classification outcome and its obligations) and the shared
 * record tabs.
 */
@Component({
  selector: 'app-ai-assessment-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    AiLessonCard,
    AiClassificationResult,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loadError()) {
      <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
        <app-alert tone="error">{{ loadError()! | transloco }}</app-alert>
        <a
          routerLink="/ai-governance/assessments"
          class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline"
        >
          {{ 'aiGovernance.assessments.backToList' | transloco }}
        </a>
      </div>
    } @else if (assessment(); as a) {
      <app-record-detail-layout
        entityType="ai_assessment"
        [entityId]="a.id"
        [tabs]="tabs"
        [canEdit]="store.canWrite()"
        [includeAudit]="store.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/ai-governance/assessments"
        backLabelKey="aiGovernance.assessments.backToList"
      >
        <div header>
          <div class="mb-1.5 flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-fg-subtle">{{ a.code }}</span>
            <app-badge tone="neutral">{{ kindKey(a.kind) | transloco }}</app-badge>
            <app-badge [tone]="statusTone(a.status)" data-testid="assessment-status">{{
              statusKey(a.status) | transloco
            }}</app-badge>
          </div>
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
          >
            {{ a.title }}
          </h1>
          <a
            [routerLink]="['/ai-governance/systems', a.ai_system.id]"
            class="mt-1 inline-block text-[13px] font-semibold text-accent hover:underline"
          >
            {{ a.ai_system.code }} {{ a.ai_system.name }}
          </a>
        </div>
        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button entityType="ai_assessment" [entityId]="a.id" />
          @if (store.canWrite() && a.status === 'draft') {
            <a
              [routerLink]="editLink(a)"
              [queryParams]="a.kind === 'classification' ? { assessment: a.id } : null"
              class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
              data-testid="assessment-edit"
            >
              {{ 'aiGovernance.common.edit' | transloco }}
            </a>
            <app-button
              size="sm"
              [disabled]="busy()"
              (click)="pending.set('complete')"
              data-testid="assessment-complete"
            >
              <app-icon name="check" [size]="14" />
              {{ 'aiGovernance.assessmentDetail.complete' | transloco }}
            </app-button>
          }
          @if (store.canApprove() && a.status === 'completed') {
            <app-button
              size="sm"
              [disabled]="busy() || selfCompleted()"
              (click)="pending.set('approve')"
              data-testid="assessment-approve"
            >
              <app-icon name="checkcircle" [size]="14" />
              {{ 'aiGovernance.assessmentDetail.approve' | transloco }}
            </app-button>
          }
          @if (store.canWrite() && a.status !== 'draft') {
            <app-button
              size="sm"
              variant="secondary"
              [disabled]="busy()"
              (click)="pending.set('reopen')"
            >
              {{ 'aiGovernance.assessmentDetail.reopen' | transloco }}
            </app-button>
          }
          @if (store.canWrite() && a.status !== 'approved') {
            <app-button
              size="sm"
              variant="ghost"
              [disabled]="busy()"
              (click)="pending.set('delete')"
            >
              <app-icon name="trash" [size]="14" />
              {{ 'aiGovernance.common.delete' | transloco }}
            </app-button>
          }
        </div>

        <div class="flex flex-col gap-5">
          <app-guide-intro [scope]="scope" page="assessmentDetail" />
          @if (selfCompleted() && a.status === 'completed' && store.canApprove()) {
            <app-alert tone="info">{{
              'aiGovernance.assessmentDetail.selfApprovalHint' | transloco
            }}</app-alert>
          }
          @if (missing().length) {
            <app-alert tone="error">
              {{
                'aiGovernance.assessmentDetail.missing' | transloco: { sections: missingLabels() }
              }}
            </app-alert>
          }
          <div
            class="flex flex-wrap items-center gap-2"
            role="group"
            [attr.aria-label]="'aiGovernance.ai.groupLabel' | transloco"
          >
            <app-button variant="ghost" size="sm" (click)="askAi('summarise', a)">
              <app-icon name="spark" [size]="14" />
              {{ 'aiGovernance.ai.summariseAssessment' | transloco }}
            </app-button>
            <app-button variant="ghost" size="sm" (click)="askAi('review', a)">
              <app-icon name="comment" [size]="14" />
              {{ 'aiGovernance.ai.reviewAssessment' | transloco }}
            </app-button>
          </div>

          <app-card>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ a.owner?.name ?? ('aiGovernance.common.nobody' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.dueAt' | transloco }}
                </dt>
                <dd class="text-fg">
                  @if (a.due_at) {
                    {{ a.due_at | localDay }}
                  } @else {
                    {{ 'aiGovernance.common.noDueDate' | transloco }}
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.assessmentDetail.completed' | transloco }}
                </dt>
                <dd class="text-fg">
                  @if (a.completed_at) {
                    {{ a.completed_at | localDate }}
                    @if (a.completed_by) {
                      · {{ a.completed_by.name }}
                    }
                  } @else {
                    {{ 'aiGovernance.common.notYet' | transloco }}
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.assessmentDetail.approved' | transloco }}
                </dt>
                <dd class="text-fg">
                  @if (a.approved_at) {
                    {{ a.approved_at | localDate }}
                    @if (a.approved_by) {
                      · {{ a.approved_by.name }}
                    }
                  } @else {
                    {{ 'aiGovernance.common.notYet' | transloco }}
                  }
                </dd>
              </div>
            </dl>
          </app-card>

          @if (a.kind === 'classification') {
            <app-card>
              <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                {{ 'aiGovernance.assessmentDetail.answers' | transloco }}
              </h2>
              @if (answerLines().length) {
                <ul class="list-disc pl-5 text-[13.5px] text-fg">
                  @for (line of answerLines(); track $index) {
                    <li>{{ line }}</li>
                  }
                </ul>
              } @else {
                <p class="text-[13px] text-fg-muted">
                  {{ 'aiGovernance.assessmentDetail.noneAnswered' | transloco }}
                </p>
              }
            </app-card>
            @if (result(); as r) {
              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'aiGovernance.assessmentDetail.outcome' | transloco }}
                </h2>
                <app-ai-classification-result [result]="r" />
              </app-card>
            } @else {
              <app-alert tone="info">{{
                'aiGovernance.assessmentDetail.notCompletedHint' | transloco
              }}</app-alert>
            }
          } @else {
            @for (key of sectionKeys(); track key) {
              <app-card>
                <h2 class="mb-1.5 text-[14px] font-bold text-fg">
                  {{ sectionKey(a.kind, key) | transloco }}
                  @if (requiredSet().has(key)) {
                    <span class="ml-1 text-[12px] font-semibold text-warn">{{
                      'aiGovernance.assessmentEdit.required' | transloco
                    }}</span>
                  }
                </h2>
                @if (sections()[key]; as text) {
                  <div
                    class="cf-prose text-[13.5px] leading-relaxed text-fg"
                    [innerHTML]="text | appMarkdown"
                  ></div>
                } @else {
                  <p class="text-[13px] text-fg-subtle">
                    {{ 'aiGovernance.assessmentDetail.empty' | transloco }}
                  </p>
                }
              </app-card>
            }
          }
          <app-supports-requirements entityType="ai_assessment" [entityId]="a.id" />
        </div>

        <div tasks>
          <app-entity-tasks
            entityType="ai_assessment"
            [entityId]="a.id"
            [canCreate]="store.canWrite()"
            [entityLabel]="a.code + ' ' + a.title"
          />
        </div>

        <div aside class="flex flex-col gap-4">
          <app-ai-lesson-card lesson="impact-assessment-and-fria" />
          <app-why-it-matters [scope]="scope" page="assessmentDetail" />
        </div>
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="!!pending()"
        [title]="
          'aiGovernance.assessmentDetail.confirm.' + (pending() ?? 'complete') + '.title'
            | transloco
        "
        [message]="
          'aiGovernance.assessmentDetail.confirm.' + (pending() ?? 'complete') + '.message'
            | transloco: { code: a.code }
        "
        [confirmLabel]="
          'aiGovernance.assessmentDetail.confirm.' + (pending() ?? 'complete') + '.action'
            | transloco
        "
        [cancelLabel]="'aiGovernance.common.cancel' | transloco"
        [confirmVariant]="pending() === 'delete' ? 'danger' : 'primary'"
        [busy]="busy()"
        (confirmed)="run(a)"
        (cancelled)="pending.set(null)"
      >
        @if (pending() === 'complete') {
          <label class="mt-3 flex items-start gap-2 text-[13px] text-fg">
            <input
              type="checkbox"
              class="mt-0.5"
              [checked]="createTasks()"
              (change)="createTasks.set($any($event.target).checked)"
            />
            {{
              (a.kind === 'classification'
                ? 'aiGovernance.wizard.createTasks'
                : 'aiGovernance.assessmentDetail.createTasks'
              ) | transloco
            }}
          </label>
        }
      </app-confirm-dialog>
    } @else {
      <p class="mx-auto max-w-[1180px] px-4 pt-7 text-[14px] text-fg-muted sm:px-8">
        {{ 'aiGovernance.common.loading' | transloco }}
      </p>
    }
  `,
})
export class AiAssessmentDetail {
  private readonly api = inject(AiGovernanceApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  protected readonly store = inject(AiGovernanceStore);

  readonly id = input.required<string>();

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly kindKey = kindKey;
  protected readonly statusKey = assessmentStatusKey;
  protected readonly statusTone = assessmentStatusTone;
  protected readonly sectionKey = assessmentSectionKey;

  protected readonly assessment = signal<Assessment | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pending = signal<Pending>(null);
  protected readonly busy = signal(false);
  protected readonly createTasks = signal(true);
  protected readonly missing = signal<readonly string[]>([]);

  protected readonly result = computed(() => asClassificationResult(this.assessment()?.result));
  protected readonly sections = computed(() => sectionAnswers(this.assessment()?.answers));
  protected readonly requiredSet = computed(
    () => new Set(this.assessment()?.required_sections ?? []),
  );
  protected readonly sectionKeys = computed<readonly string[]>(() => {
    const a = this.assessment();
    const catalog = this.store.catalog();
    if (!a) {
      return [];
    }
    const all = catalog
      ? a.kind === 'fria'
        ? catalog.fria_sections
        : catalog.impact_sections
      : [];
    return all.length ? all : Object.keys(this.sections());
  });
  protected readonly selfCompleted = computed(() => {
    const by = this.assessment()?.completed_by?.id;
    return !!by && by === this.auth.user()?.id;
  });
  protected readonly missingLabels = computed(() => {
    const a = this.assessment();
    return this.missing()
      .map((key) => this.language.translate(assessmentSectionKey(a?.kind ?? 'impact', key)))
      .join(', ');
  });
  /** Human-readable summary of the classification answers ("yes" answers only). */
  protected readonly answerLines = computed(() => {
    const a = this.assessment();
    if (!a || a.kind !== 'classification') {
      return [];
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const ans = normalizeAnswers(a.answers);
    const lines: string[] = [];
    if (ans.role) {
      lines.push(t('aiGovernance.answers.role', { role: t(roleKey(ans.role)) }));
    }
    for (const key of ans.prohibited_practices) {
      lines.push(t('aiGovernance.answers.prohibited', { item: t(prohibitedKey(key)) }));
    }
    if (ans.annex_i_safety_component) {
      lines.push(t('aiGovernance.answers.annexI'));
    }
    for (const key of ans.annex_iii_areas) {
      lines.push(t('aiGovernance.answers.annexIii', { item: t(annexIiiKey(key)) }));
    }
    if (ans.art6_3_exception) {
      lines.push(t('aiGovernance.answers.exception'));
    }
    if (ans.profiling) {
      lines.push(t('aiGovernance.answers.profiling'));
    }
    for (const key of ans.transparency) {
      lines.push(t('aiGovernance.answers.transparency', { item: t(transparencyKey(key)) }));
    }
    if (ans.gpai) {
      lines.push(
        t(
          ans.gpai_systemic_risk
            ? 'aiGovernance.answers.gpaiSystemic'
            : 'aiGovernance.answers.gpai',
        ),
      );
    }
    if (ans.deployer_public_service) {
      lines.push(t('aiGovernance.answers.publicService'));
    }
    if (ans.deployer_credit_or_insurance) {
      lines.push(t('aiGovernance.answers.creditInsurance'));
    }
    if (ans.notes) {
      lines.push(t('aiGovernance.answers.notes', { notes: ans.notes }));
    }
    return lines;
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_ASSESSMENT_ENTITY,
      entityId: this.id(),
      view: 'detail',
      title: this.assessment()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.store.ensureCatalog();
        this.loadError.set(null);
        this.api.getAssessment(orgId, id).subscribe({
          next: (a) => this.assessment.set(a),
          error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
        });
      });
    });
  }

  protected editLink(a: Assessment): readonly string[] {
    return a.kind === 'classification'
      ? ['/ai-governance/systems', a.ai_system.id, 'classify']
      : ['/ai-governance/assessments', a.id, 'edit'];
  }

  protected askAi(kind: 'summarise' | 'review', a: Assessment): void {
    this.ask.askAbout(
      this.language.translate(`aiGovernance.ai.prompts.${kind}Assessment`, {
        code: a.code,
        title: a.title,
      }),
    );
  }

  protected run(a: Assessment): void {
    const orgId = this.selectedOrg.currentOrgId();
    const action = this.pending();
    if (!orgId || !action || this.busy()) {
      return;
    }
    const lang = this.language.active() === 'nb' ? 'nb' : 'en';
    let request$: Observable<Assessment | void>;
    switch (action) {
      case 'complete':
        request$ = this.api.completeAssessment(orgId, a.id, {
          create_tasks: this.createTasks(),
          due_in_days: 30,
          lang,
        });
        break;
      case 'approve':
        request$ = this.api.approveAssessment(orgId, a.id);
        break;
      case 'reopen':
        request$ = this.api.reopenAssessment(orgId, a.id);
        break;
      default:
        request$ = this.api.deleteAssessment(orgId, a.id);
    }
    this.busy.set(true);
    this.missing.set([]);
    request$.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.pending.set(null);
        if (action === 'delete') {
          this.notifications.success('aiGovernance.assessmentDetail.deleted', { code: a.code });
          void this.router.navigate(['/ai-governance/assessments']);
          return;
        }
        if (updated) {
          this.assessment.set(updated);
        }
        this.notifications.success(`aiGovernance.assessmentDetail.done.${action}`, {
          code: a.code,
          count: updated ? updated.created_tasks.length : 0,
        });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.missing.set(missingSections(err));
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}

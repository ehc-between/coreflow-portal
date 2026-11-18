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
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { dayOf, dueAtFromDay } from '../../../shared/tasks/task-display';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { Badge } from '../../../shared/ui/badge/badge';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey, missingSections } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { Assessment, ClassificationResult } from '../data/ai-governance.models';
import {
  AI_ASSESSMENT_ENTITY,
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  annexIiiKey,
  assessmentSectionHintKey,
  assessmentSectionKey,
  assessmentStatusKey,
  assessmentStatusValue,
  normalizeAnswers,
  prohibitedKey,
  roleKey,
  sectionAnswers,
  transparencyKey,
} from '../data/ai-governance-display';
import { AI_GOV_ROOT } from '../ui/ai-gov-page';
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
  next_review_at: 'aiGovernance.fields.nextReview',
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
  const isObligation = (o: unknown): o is ClassificationResult['obligations'][number] =>
    !!o && typeof o === 'object' && typeof (o as { key?: unknown }).key === 'string';
  return {
    risk_class: r.risk_class,
    role: typeof r.role === 'string' ? r.role : 'not_applicable',
    gpai: !!r.gpai,
    gpai_systemic_risk: !!r.gpai_systemic_risk,
    transparency: Array.isArray(r.transparency) ? r.transparency : [],
    fria_required: !!r.fria_required,
    art6_3_exception_applied: !!r.art6_3_exception_applied,
    reasons: Array.isArray(r.reasons) ? r.reasons : [],
    obligations: r.obligations.filter(isObligation),
    provider_obligations: Array.isArray(r.provider_obligations)
      ? r.provider_obligations.filter(isObligation)
      : [],
  };
}

/**
 * `/ai-governance/assessments/:id`: a classification, impact assessment or
 * FRIA. Draft -> completed -> approved; the person who completed it cannot
 * approve it; completed / approved assessments can be reopened. A draft shows
 * how far it is ("1 av 4 påkrevde deler skrevet") and which parts are missing
 * before it can be completed; every part shows what to write. An assessment is
 * flagged when its system was reclassified or changed, and has a next review
 * date that can be moved in any status. Classifications are edited in the
 * wizard. "Lag ny fra denne" creates a risk from an impact assessment.
 */
@Component({
  selector: 'app-ai-assessment-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    RecordDetailLayout,
    LocalDayPipe,
    MarkdownPipe,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ProgressBar,
    StatusBadge,
    AiClassificationResult,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loadError()) {
      <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
        <app-error-state (retry)="reload.update((n) => n + 1)" />
        <a
          routerLink="/ai-governance/assessments"
          class="mt-3 inline-block text-ui font-semibold text-accent hover:underline"
        >
          {{ 'aiGovernance.assessments.backToList' | transloco }}
        </a>
      </div>
    } @else if (assessment(); as a) {
      <app-record-detail-layout
        entityType="ai_assessment"
        [entityId]="a.id"
        [title]="a.title"
        [breadcrumbs]="[
          root,
          { labelKey: 'aiGovernance.assessments.title', link: '/ai-governance/assessments' },
          { label: a.code },
        ]"
        settingsLink="/ai-governance/settings"
        [tabs]="tabs"
        [canEdit]="store.canWrite()"
        [includeAudit]="store.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/ai-governance/assessments"
        backLabelKey="aiGovernance.assessments.backToList"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="assessment-code">{{ a.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'aiGovernance.kindShort.' + a.kind | transloco }}</span>
          <span aria-hidden="true">·</span>
          <a
            [routerLink]="['/ai-governance/systems', a.ai_system.id]"
            class="font-semibold hover:text-fg hover:underline"
            >{{ a.ai_system.code }} {{ a.ai_system.name }}</a
          >
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(a.status)"
            [labelKey]="statusKey(a.status)"
            data-testid="assessment-status"
          />
          @if (a.review_flag) {
            <app-badge tone="warn">{{
              'aiGovernance.assessments.needsReview' | transloco
            }}</app-badge>
          }
          <app-watch-button entityType="ai_assessment" [entityId]="a.id" />
        </ng-container>

        @if (draftMode() === 'wizard') {
          <a
            primary
            [routerLink]="['/ai-governance/systems', a.ai_system.id, 'classify']"
            [queryParams]="{ assessment: a.id }"
            class="inline-flex h-8 items-center rounded-tile bg-accent px-3 text-ui font-semibold text-white hover:opacity-90"
            data-testid="assessment-edit"
          >
            {{ 'aiGovernance.assessmentDetail.openWizard' | transloco }}
          </a>
        }
        @if (draftMode() === 'missing') {
          <a
            primary
            [routerLink]="['/ai-governance/assessments', a.id, 'edit']"
            class="inline-flex h-8 items-center rounded-tile bg-accent px-3 text-ui font-semibold text-white hover:opacity-90"
            data-testid="assessment-edit"
          >
            {{ 'aiGovernance.assessmentDetail.continue' | transloco }}
          </a>
        }
        @if (draftMode() === 'missing') {
          <app-button
            secondary
            size="sm"
            variant="secondary"
            [disabled]="true"
            [attr.title]="'aiGovernance.assessmentDetail.completeBlocked' | transloco"
            data-testid="assessment-complete"
          >
            {{ 'aiGovernance.assessmentDetail.complete' | transloco }}
          </app-button>
        }
        @if (draftMode() === 'ready') {
          <app-button
            primary
            size="sm"
            [disabled]="busy()"
            (click)="pending.set('complete')"
            data-testid="assessment-complete"
          >
            <app-icon name="check" [size]="14" />
            {{ 'aiGovernance.assessmentDetail.complete' | transloco }}
          </app-button>
        }
        @if (draftMode() === 'ready') {
          <a
            secondary
            [routerLink]="['/ai-governance/assessments', a.id, 'edit']"
            class="inline-flex h-8 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2"
            data-testid="assessment-edit"
          >
            {{ 'aiGovernance.common.edit' | transloco }}
          </a>
        }
        @if (store.canApprove() && a.status === 'completed') {
          <app-button
            primary
            size="sm"
            [disabled]="busy() || selfCompleted()"
            (click)="pending.set('approve')"
            data-testid="assessment-approve"
          >
            <app-icon name="checkcircle" [size]="14" />
            {{ 'aiGovernance.assessmentDetail.approve' | transloco }}
          </app-button>
        }
        <button appMenuItem overflow (click)="askAi('summarise', a)">
          {{ 'aiGovernance.ai.summariseAssessment' | transloco }}
        </button>
        <button appMenuItem overflow (click)="askAi('review', a)">
          {{ 'aiGovernance.ai.reviewAssessment' | transloco }}
        </button>
        @if (store.canWrite() && a.status !== 'draft') {
          <button
            appMenuItem
            overflow
            (click)="pending.set('reopen')"
            data-testid="assessment-reopen"
          >
            {{ 'aiGovernance.assessmentDetail.reopen' | transloco }}
          </button>
        }
        @if (store.canWrite() && a.status !== 'approved') {
          <button appMenuItem overflow [danger]="true" (click)="pending.set('delete')">
            {{ 'aiGovernance.common.delete' | transloco }}
          </button>
        }

        <div class="flex flex-col gap-5">
          @if (selfCompleted() && a.status === 'completed' && store.canApprove()) {
            <app-alert tone="info">{{
              'aiGovernance.assessmentDetail.selfApprovalHint' | transloco
            }}</app-alert>
          }
          @if (a.review_flag) {
            <app-alert tone="info" data-testid="assessment-review-flag">
              {{ 'aiGovernance.assessmentDetail.reviewFlag.' + a.review_flag | transloco }}
              @if (a.review_flagged_at) {
                ({{ a.review_flagged_at | localDay }})
              }
            </app-alert>
          }

          @if (a.kind !== 'classification' && a.status === 'draft' && requiredTotal() > 0) {
            <app-card data-testid="assessment-progress">
              <div class="mb-2 flex items-center gap-3">
                <span class="min-w-0 flex-1">
                  <app-progress-bar
                    [value]="(requiredDone() / requiredTotal()) * 100"
                    [label]="progressText()"
                  />
                </span>
                <span class="text-ui font-semibold text-fg">{{ progressText() }}</span>
              </div>
              @if (missingList().length) {
                <p class="text-ui text-fg-muted">
                  {{
                    'aiGovernance.assessmentDetail.missing'
                      | transloco: { sections: missingLabels() }
                  }}
                </p>
              } @else {
                <p class="text-ui text-fg-muted">
                  {{ 'aiGovernance.assessmentDetail.readyToComplete' | transloco }}
                </p>
              }
            </app-card>
          }

          <app-card>
            <app-field-list [columns]="3">
              <app-field-item
                labelKey="aiGovernance.fields.owner"
                [value]="a.owner?.name"
                empty="none"
              />
              <app-field-item
                labelKey="aiGovernance.fields.dueAt"
                [value]="a.due_at ? (a.due_at | localDay) : null"
                empty="none"
              />
              <app-field-item labelKey="aiGovernance.fields.nextReview">
                @if (editingReview()) {
                  <form
                    class="flex flex-wrap items-center gap-2"
                    (submit)="$event.preventDefault(); saveReview(a)"
                    (keydown.escape)="editingReview.set(false)"
                  >
                    <label class="sr-only" for="aia-next-review">{{
                      'aiGovernance.fields.nextReview' | transloco
                    }}</label>
                    <input
                      id="aia-next-review"
                      type="date"
                      class="h-8 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                      [value]="reviewDay()"
                      (input)="reviewDay.set($any($event.target).value)"
                    />
                    <app-button size="sm" type="submit" [loading]="savingReview()">{{
                      'aiGovernance.common.save' | transloco
                    }}</app-button>
                  </form>
                } @else {
                  <span class="inline-flex flex-wrap items-center gap-2">
                    <span>{{
                      a.next_review_at
                        ? (a.next_review_at | localDay)
                        : ('aiGovernance.common.notSet' | transloco)
                    }}</span>
                    @if (store.canWrite()) {
                      <button
                        type="button"
                        class="min-h-6 text-meta font-semibold text-accent hover:underline"
                        (click)="startReviewEdit(a)"
                        data-testid="assessment-review-edit"
                      >
                        {{ 'aiGovernance.common.change' | transloco }}
                      </button>
                    }
                  </span>
                }
              </app-field-item>
              <app-field-item
                labelKey="aiGovernance.assessmentDetail.completed"
                [value]="
                  a.completed_at ? completedLine(a) : ('aiGovernance.common.notYet' | transloco)
                "
              />
              <app-field-item
                labelKey="aiGovernance.assessmentDetail.approved"
                [value]="
                  a.approved_at ? approvedLine(a) : ('aiGovernance.common.notYet' | transloco)
                "
              />
            </app-field-list>
          </app-card>

          @if (a.kind === 'classification') {
            <app-card>
              <h2 class="mb-3 font-display text-section font-bold text-fg">
                {{ 'aiGovernance.assessmentDetail.answers' | transloco }}
              </h2>
              @if (answerLines().length) {
                <ul class="list-disc pl-5 text-body text-fg">
                  @for (line of answerLines(); track $index) {
                    <li>{{ line }}</li>
                  }
                </ul>
              } @else {
                <p class="text-ui text-fg-muted">
                  {{ 'aiGovernance.assessmentDetail.noneAnswered' | transloco }}
                </p>
              }
            </app-card>
            @if (result(); as r) {
              <app-card>
                <h2 class="mb-3 font-display text-section font-bold text-fg">
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
              <app-card [attr.data-testid]="'assessment-section-' + key">
                <h2 class="mb-0.5 flex flex-wrap items-center gap-2 text-card font-bold text-fg">
                  {{ sectionKey(a.kind, key) | transloco }}
                  @if (requiredSet().has(key)) {
                    <span
                      class="text-meta font-semibold"
                      [class]="sections()[key] ? 'text-fg-subtle' : 'text-warn-ink'"
                      >{{ 'aiGovernance.assessmentEdit.required' | transloco }}</span
                    >
                  }
                </h2>
                <p class="mb-2 text-meta text-fg-muted">
                  {{ sectionHintKey(a.kind, key) | transloco }}
                </p>
                @if (sections()[key]; as text) {
                  <div
                    class="cf-prose text-body leading-relaxed text-fg"
                    [innerHTML]="text | appMarkdown"
                  ></div>
                } @else {
                  <p class="text-ui text-fg-subtle">
                    {{ 'aiGovernance.assessmentDetail.empty' | transloco }}
                  </p>
                }
              </app-card>
            }
          }
        </div>

        <div tasks>
          <app-entity-tasks
            entityType="ai_assessment"
            [entityId]="a.id"
            [canCreate]="store.canWrite()"
            [entityLabel]="a.code + ' ' + a.title"
          />
        </div>

        <app-supports-requirements
          aside-requirements
          entityType="ai_assessment"
          [entityId]="a.id"
          [canEdit]="store.canWrite()"
          [frameworks]="frameworks"
        />

        <app-help-strip
          aside-learn
          [scope]="scope"
          page="assessmentDetail"
          lesson="impact-assessment-and-fria"
        />
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
          <label class="mt-3 flex items-start gap-2 text-ui text-fg">
            <input
              type="checkbox"
              class="mt-0.5"
              [checked]="createTasks()"
              (change)="createTasks.set($any($event.target).checked)"
            />
            {{
              (a.kind === 'fria'
                ? 'aiGovernance.assessmentDetail.createTasksFria'
                : 'aiGovernance.assessmentDetail.createTasks'
              ) | transloco
            }}
          </label>
        }
      </app-confirm-dialog>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
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
  protected readonly root = AI_GOV_ROOT;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly frameworks = ['iso42001', 'eu_ai_act'] as const;
  protected readonly statusKey = assessmentStatusKey;
  protected readonly statusValue = assessmentStatusValue;
  protected readonly sectionKey = assessmentSectionKey;
  protected readonly sectionHintKey = assessmentSectionHintKey;

  protected readonly assessment = signal<Assessment | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pending = signal<Pending>(null);
  protected readonly busy = signal(false);
  protected readonly createTasks = signal(true);
  /** Missing parts reported by a refused completion (422). */
  protected readonly refusedMissing = signal<readonly string[]>([]);
  protected readonly editingReview = signal(false);
  protected readonly reviewDay = signal('');
  protected readonly savingReview = signal(false);
  protected readonly reload = signal(0);

  protected readonly result = computed(() => asClassificationResult(this.assessment()?.result));
  protected readonly sections = computed(() => sectionAnswers(this.assessment()?.answers));
  protected readonly requiredSet = computed(
    () => new Set(this.assessment()?.required_sections ?? []),
  );
  /** Required parts still empty (server summary, else from the answers). */
  protected readonly missingList = computed<readonly string[]>(() => {
    const a = this.assessment();
    if (!a || a.kind === 'classification' || a.status !== 'draft') {
      return [];
    }
    if (this.refusedMissing().length) {
      return this.refusedMissing();
    }
    if (a.missing_sections) {
      return a.missing_sections;
    }
    const written = this.sections();
    return a.required_sections.filter((key) => !written[key]?.trim());
  });
  /** Which actions a draft offers: the wizard, "continue writing", or "complete". */
  protected readonly draftMode = computed<'wizard' | 'missing' | 'ready' | null>(() => {
    const a = this.assessment();
    if (!a || a.status !== 'draft' || !this.store.canWrite()) {
      return null;
    }
    if (this.isWizard(a)) {
      return 'wizard';
    }
    return this.missingList().length ? 'missing' : 'ready';
  });
  protected readonly requiredTotal = computed(
    () => this.assessment()?.required_total ?? this.assessment()?.required_sections.length ?? 0,
  );
  protected readonly requiredDone = computed(() =>
    Math.max(0, this.requiredTotal() - this.missingList().length),
  );
  protected readonly progressText = computed(() =>
    this.language.translate(
      this.requiredDone() === 1
        ? 'aiGovernance.assessmentDetail.progressOne'
        : 'aiGovernance.assessmentDetail.progress',
      { done: this.requiredDone(), total: this.requiredTotal() },
    ),
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
    return this.missingList()
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
  private readonly refs = computed(() => {
    const a = this.assessment();
    if (!a) {
      return [];
    }
    return a.kind === 'fria'
      ? ['eu_ai_act:27']
      : a.kind === 'impact'
        ? ['iso42001:6.1.4', 'iso42001:8.4']
        : ['eu_ai_act:6'];
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_ASSESSMENT_ENTITY,
      entityId: this.id(),
      view: 'detail',
      title: this.assessment() ? `${this.assessment()!.code} ${this.assessment()!.title}` : null,
      requirements: this.refs(),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      this.reload();
      this.language.active();
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

  protected isWizard(a: Assessment): boolean {
    return a.edit_in_wizard ?? a.kind === 'classification';
  }

  protected completedLine(a: Assessment): string {
    const date = new Intl.DateTimeFormat(this.language.active(), { dateStyle: 'medium' }).format(
      new Date(`${a.completed_at}Z`),
    );
    return a.completed_by ? `${date} · ${a.completed_by.name}` : date;
  }

  protected approvedLine(a: Assessment): string {
    const date = new Intl.DateTimeFormat(this.language.active(), { dateStyle: 'medium' }).format(
      new Date(`${a.approved_at}Z`),
    );
    return a.approved_by ? `${date} · ${a.approved_by.name}` : date;
  }

  protected startReviewEdit(a: Assessment): void {
    this.reviewDay.set(dayOf(a.next_review_at ?? null));
    this.editingReview.set(true);
  }

  protected saveReview(a: Assessment): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.savingReview()) {
      return;
    }
    this.savingReview.set(true);
    this.api
      .updateAssessment(orgId, a.id, { next_review_at: dueAtFromDay(this.reviewDay()) })
      .subscribe({
        next: (updated) => {
          this.savingReview.set(false);
          this.editingReview.set(false);
          this.assessment.set(updated);
          this.notifications.success('aiGovernance.assessmentDetail.reviewSaved');
        },
        error: (err: unknown) => {
          this.savingReview.set(false);
          this.notifications.error(aiGovernanceErrorKey(err));
        },
      });
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
    this.refusedMissing.set([]);
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
        const count = updated ? updated.created_tasks.length : 0;
        this.notifications.success(
          action === 'complete' && count === 1
            ? 'aiGovernance.assessmentDetail.done.completeOne'
            : `aiGovernance.assessmentDetail.done.${action}`,
          { code: a.code, count },
        );
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.refusedMissing.set(missingSections(err));
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}

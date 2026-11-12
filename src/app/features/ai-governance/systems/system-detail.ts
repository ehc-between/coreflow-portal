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
import { providePageContext } from '../../../core/ai/page-context';
import { AssigneeIn } from '../../../core/tasks/task.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { AiSystem, AssessmentSummary } from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  AI_SYSTEM_ENTITY,
  assessmentStatusKey,
  assessmentStatusTone,
  kindKey,
  riskKey,
  riskTone,
  roleKey,
  statusKey,
  systemStatusTone,
  transparencyKey,
} from '../data/ai-governance-display';
import { AiLessonCard } from '../ui/ai-lesson-card';
import { AiObligationList } from '../ui/obligation-list';
import { AiSystemIncidents } from './system-incidents';
import { AiSystemMonitoring } from './system-monitoring';
import { AiSystemReviewSchedule } from './system-review-schedule';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot fields -> labels (for the revisions tab). */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'aiGovernance.fields.name',
  description: 'aiGovernance.fields.description',
  intended_purpose: 'aiGovernance.fields.intendedPurpose',
  ai_act_role: 'aiGovernance.fields.role',
  status: 'aiGovernance.fields.status',
  provider_name: 'aiGovernance.fields.provider',
  models: 'aiGovernance.fields.models',
  data_categories: 'aiGovernance.fields.dataCategories',
  uses_personal_data: 'aiGovernance.fields.usesPersonalData',
  owner_user_id: 'aiGovernance.fields.owner',
  department_id: 'aiGovernance.fields.department',
  next_review_at: 'aiGovernance.fields.nextReview',
  risk_class: 'aiGovernance.fields.riskClass',
  documentation: 'aiGovernance.fields.documentation',
  obligations: 'aiGovernance.fields.obligations',
};

/**
 * `/ai-governance/systems/:id`: one AI system — what it is for, its AI Act
 * classification and obligations (with their tasks), its assessments,
 * monitoring, incidents and post-market review schedule, plus the shared
 * record tabs (tasks, related items, activity, comments, attachments,
 * revisions). The assistant can explain the obligations.
 */
@Component({
  selector: 'app-ai-system-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AiAssistButton,
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
    AiObligationList,
    AiSystemIncidents,
    AiSystemMonitoring,
    AiSystemReviewSchedule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loadError()) {
      <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
        <app-alert tone="error">{{ loadError()! | transloco }}</app-alert>
        <a
          routerLink="/ai-governance/systems"
          class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline"
        >
          {{ 'aiGovernance.systems.backToList' | transloco }}
        </a>
      </div>
    } @else if (system(); as s) {
      <app-record-detail-layout
        entityType="ai_system"
        [entityId]="s.id"
        [tabs]="tabs"
        [canEdit]="store.canWrite()"
        [includeAudit]="store.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/ai-governance/systems"
        backLabelKey="aiGovernance.systems.backToList"
      >
        <div header>
          <div class="mb-1.5 flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-fg-subtle">{{ s.code }}</span>
            <app-badge [tone]="riskTone(s.risk_class)" data-testid="system-risk">{{
              riskKey(s.risk_class) | transloco
            }}</app-badge>
            <app-badge [tone]="statusTone(s.status)">{{
              statusKey(s.status) | transloco
            }}</app-badge>
            <app-badge tone="neutral">{{ roleKey(s.ai_act_role) | transloco }}</app-badge>
            @if (s.gpai) {
              <app-badge tone="accent">{{ 'aiGovernance.result.gpai' | transloco }}</app-badge>
            }
            @if (s.is_builtin) {
              <app-badge tone="accent">{{ 'aiGovernance.systems.builtin' | transloco }}</app-badge>
            }
          </div>
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
          >
            {{ s.name }}
          </h1>
        </div>
        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button entityType="ai_system" [entityId]="s.id" />
          @if (store.canWrite()) {
            <a
              [routerLink]="['/ai-governance/systems', s.id, 'classify']"
              class="inline-flex h-8 items-center gap-1.5 rounded-tile bg-accent px-3 text-[13px] font-semibold text-white hover:opacity-90"
              data-testid="system-classify"
            >
              {{
                (s.risk_class === 'unclassified'
                  ? 'aiGovernance.systemDetail.classify'
                  : 'aiGovernance.systemDetail.reclassify'
                ) | transloco
              }}
            </a>
            <a
              [routerLink]="['/ai-governance/systems', s.id, 'edit']"
              class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
            >
              {{ 'aiGovernance.common.edit' | transloco }}
            </a>
          }
          @if (store.canManage()) {
            <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
              <app-icon name="trash" [size]="14" />
              {{ 'aiGovernance.common.delete' | transloco }}
            </app-button>
          }
        </div>

        <div class="flex flex-col gap-5">
          <app-guide-intro [scope]="scope" page="systemDetail" />
          <div
            class="flex flex-wrap items-center gap-2"
            role="group"
            [attr.aria-label]="'aiGovernance.ai.groupLabel' | transloco"
          >
            <app-ai-assist-button
              assist="ai_governance.explain_obligations"
              labelKey="aiGovernance.ai.explainObligations"
              [input]="{ ai_system_id: s.id }"
              entityType="ai_system"
              [entityId]="s.id"
              (text)="explanation.set($event)"
            />
            <app-button variant="ghost" size="sm" (click)="askAbout(s)">
              <app-icon name="comment" [size]="14" />
              {{ 'aiGovernance.ai.askAboutSystem' | transloco }}
            </app-button>
          </div>
          @if (explanation()) {
            <app-card>
              <div class="mb-2 flex items-center justify-between gap-2">
                <h2 class="font-display text-[15px] font-bold text-fg">
                  {{ 'aiGovernance.ai.explanationTitle' | transloco }}
                </h2>
                <button
                  type="button"
                  class="rounded-[8px] p-1 text-fg-subtle hover:text-fg"
                  [attr.aria-label]="'aiGovernance.common.close' | transloco"
                  (click)="explanation.set('')"
                >
                  <app-icon name="x" [size]="14" />
                </button>
              </div>
              <div
                class="cf-prose text-[13.5px] leading-relaxed text-fg"
                [innerHTML]="explanation() | appMarkdown"
              ></div>
              <p class="mt-2 text-[12px] text-fg-subtle">
                {{ 'aiGovernance.ai.reviewNotice' | transloco }}
              </p>
            </app-card>
          }

          <app-card>
            <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
              {{ 'aiGovernance.systemDetail.about' | transloco }}
            </h2>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.intendedPurpose' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">
                  {{ s.intended_purpose || ('aiGovernance.common.notSet' | transloco) }}
                </dd>
              </div>
              @if (s.description) {
                <div class="sm:col-span-2">
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'aiGovernance.fields.description' | transloco }}
                  </dt>
                  <dd class="whitespace-pre-line text-fg">{{ s.description }}</dd>
                </div>
              }
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.provider' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ s.provider_name || ('aiGovernance.common.notSet' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.models' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{
                    s.models.length
                      ? s.models.join(', ')
                      : ('aiGovernance.common.notSet' | transloco)
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.dataCategories' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{
                    s.data_categories.length
                      ? s.data_categories.join(', ')
                      : ('aiGovernance.common.notSet' | transloco)
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.usesPersonalData' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{
                    (s.uses_personal_data ? 'aiGovernance.common.yes' : 'aiGovernance.common.no')
                      | transloco
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ s.owner?.name ?? ('aiGovernance.common.nobody' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.department' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ departmentName() ?? ('aiGovernance.common.notSet' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.nextReview' | transloco }}
                </dt>
                <dd class="text-fg">
                  @if (s.next_review_at) {
                    {{ s.next_review_at | localDay }}
                  } @else {
                    {{ 'aiGovernance.common.notSet' | transloco }}
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'aiGovernance.fields.classifiedAt' | transloco }}
                </dt>
                <dd class="text-fg">
                  @if (s.classified_at) {
                    {{ s.classified_at | localDate }}
                  } @else {
                    {{ 'aiGovernance.systemDetail.notClassified' | transloco }}
                  }
                </dd>
              </div>
            </dl>
          </app-card>

          <app-card>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[15px] font-bold text-fg">
                {{ 'aiGovernance.systemDetail.classification' | transloco }}
              </h2>
              @if (s.classification_id) {
                <a
                  [routerLink]="['/ai-governance/assessments', s.classification_id]"
                  class="text-[13px] font-semibold text-accent hover:underline"
                >
                  {{ 'aiGovernance.systemDetail.openClassification' | transloco }}
                </a>
              }
            </div>
            @if (s.risk_class === 'unclassified') {
              <p class="text-[13.5px] text-fg-muted">
                {{ 'aiGovernance.systemDetail.unclassifiedHint' | transloco }}
              </p>
            } @else {
              <p class="mb-2 text-[13.5px] text-fg">
                {{ 'aiGovernance.riskExplain.' + s.risk_class | transloco }}
              </p>
              @if (s.transparency.length) {
                <p class="mb-2 text-[12.5px] text-fg-muted">
                  {{ 'aiGovernance.systemDetail.transparency' | transloco }}:
                  @for (t of s.transparency; track t; let last = $last) {
                    {{ transparencyKey(t) | transloco }}{{ last ? '' : ', ' }}
                  }
                </p>
              }
              <h3 class="mt-3 mb-1 text-[13px] font-bold text-fg">
                {{ 'aiGovernance.result.obligations' | transloco: { count: s.obligations.length } }}
              </h3>
              <app-ai-obligation-list [obligations]="s.obligations" />
            }
          </app-card>

          <app-card>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[15px] font-bold text-fg">
                {{ 'aiGovernance.systemDetail.assessments' | transloco }}
              </h2>
              @if (store.canWrite()) {
                <div class="flex flex-wrap gap-2">
                  <a
                    routerLink="/ai-governance/assessments/new"
                    [queryParams]="{ system: s.id, kind: 'impact' }"
                    class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  >
                    {{ 'aiGovernance.systemDetail.newImpact' | transloco }}
                  </a>
                  <a
                    routerLink="/ai-governance/assessments/new"
                    [queryParams]="{ system: s.id, kind: 'fria' }"
                    class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  >
                    {{ 'aiGovernance.systemDetail.newFria' | transloco }}
                  </a>
                </div>
              }
            </div>
            @if (assessments().length === 0) {
              <p class="text-[13px] text-fg-muted">
                {{ 'aiGovernance.systemDetail.noAssessments' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border">
                @for (a of assessments(); track a.id) {
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                    <a
                      [routerLink]="['/ai-governance/assessments', a.id]"
                      class="min-w-0 truncate text-[13.5px] font-semibold text-fg hover:underline"
                    >
                      <span class="mr-1 font-mono text-[12px] text-fg-subtle">{{ a.code }}</span>
                      {{ a.title }}
                    </a>
                    <span class="flex items-center gap-2">
                      <app-badge tone="neutral">{{ kindKey(a.kind) | transloco }}</app-badge>
                      <app-badge [tone]="assessmentTone(a.status)">{{
                        assessmentStatusKey(a.status) | transloco
                      }}</app-badge>
                    </span>
                  </li>
                }
              </ul>
            }
          </app-card>

          <app-card>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="font-display text-[15px] font-bold text-fg">
                  {{ 'aiGovernance.systemDetail.documentation' | transloco }}
                </h2>
                <p class="mt-0.5 text-[12.5px] text-fg-muted">
                  {{
                    'aiGovernance.systemDetail.documentationHint'
                      | transloco: { count: documentedCount() }
                  }}
                </p>
              </div>
              <a
                [routerLink]="['/ai-governance/systems', s.id, 'documentation']"
                class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                data-testid="system-documentation"
              >
                <app-icon name="documents" [size]="14" />
                {{ 'aiGovernance.systemDetail.openDocumentation' | transloco }}
              </a>
            </div>
          </app-card>

          <app-ai-system-monitoring [systemId]="s.id" [canWrite]="store.canWrite()" />
          <app-ai-system-incidents [systemId]="s.id" [canWrite]="store.canWrite()" />
          <app-supports-requirements entityType="ai_system" [entityId]="s.id" />
        </div>

        <div tasks>
          <app-entity-tasks
            entityType="ai_system"
            [entityId]="s.id"
            [canCreate]="store.canWrite()"
            [defaultAssignee]="defaultAssignee()"
            [entityLabel]="s.code + ' ' + s.name"
          />
        </div>

        <div aside class="flex flex-col gap-4">
          <app-ai-system-review-schedule [systemId]="s.id" [canWrite]="store.canWrite()" />
          <app-ai-lesson-card lesson="ai-act-obligations" />
          <app-why-it-matters [scope]="scope" page="systemDetail" />
        </div>
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="confirmDelete()"
        [title]="'aiGovernance.systemDetail.deleteTitle' | transloco"
        [message]="'aiGovernance.systemDetail.deleteMessage' | transloco: { name: s.name }"
        [confirmLabel]="'aiGovernance.common.delete' | transloco"
        [cancelLabel]="'aiGovernance.common.cancel' | transloco"
        [busy]="deleting()"
        (confirmed)="remove(s)"
        (cancelled)="confirmDelete.set(false)"
      />
    } @else {
      <p class="mx-auto max-w-[1180px] px-4 pt-7 text-[14px] text-fg-muted sm:px-8">
        {{ 'aiGovernance.common.loading' | transloco }}
      </p>
    }
  `,
})
export class AiSystemDetail {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly assigneeOptions = inject(AssigneeOptionsService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  protected readonly store = inject(AiGovernanceStore);

  readonly id = input.required<string>();

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly riskKey = riskKey;
  protected readonly riskTone = riskTone;
  protected readonly statusKey = statusKey;
  protected readonly statusTone = systemStatusTone;
  protected readonly roleKey = roleKey;
  protected readonly kindKey = kindKey;
  protected readonly assessmentStatusKey = assessmentStatusKey;
  protected readonly assessmentTone = assessmentStatusTone;
  protected readonly transparencyKey = transparencyKey;

  protected readonly system = signal<AiSystem | null>(null);
  protected readonly assessments = signal<readonly AssessmentSummary[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly explanation = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly deleting = signal(false);

  protected readonly documentedCount = computed(
    () => Object.values(this.system()?.documentation ?? {}).filter((v) => !!v).length,
  );
  protected readonly departmentName = computed(() => {
    const id = this.system()?.department_id;
    if (!id) {
      return null;
    }
    return (
      this.assigneeOptions.options().departments.find((d) => d.value === `department:${id}`)
        ?.label ?? null
    );
  });
  protected readonly defaultAssignee = computed<AssigneeIn | null>(() => {
    const owner = this.system()?.owner;
    return owner ? { type: 'user', value: owner.id } : null;
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      entityId: this.id(),
      view: 'detail',
      title: this.system()?.name ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.assigneeOptions.ensureLoaded();
        this.loadError.set(null);
        this.api.getSystem(orgId, id).subscribe({
          next: (system) => this.system.set(system),
          error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
        });
        this.api.listAssessments(orgId, { ai_system_id: id, limit: 50 }).subscribe({
          next: (page) => this.assessments.set(page.items),
          error: () => this.assessments.set([]),
        });
      });
    });
  }

  protected askAbout(system: AiSystem): void {
    this.ask.askAbout(
      this.language.translate('aiGovernance.ai.prompts.askAboutSystem', {
        code: system.code,
        name: system.name,
      }),
    );
  }

  protected remove(system: AiSystem): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteSystem(orgId, system.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('aiGovernance.systemDetail.deleted', { code: system.code });
        void this.router.navigate(['/ai-governance/systems']);
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}

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
import { EntityChip, EntityChipRef } from '../../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { dayOf, dueAtFromDay } from '../../../shared/tasks/task-display';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { OutputsPanel } from '../../../shared/outputs';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
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
  assessmentStatusValue,
  normalizeAnswers,
  prohibitedKey,
  riskExplainKey,
  riskKey,
  riskValue,
  roleKey,
  sectionAnswers,
  transparencyKey,
} from '../data/ai-governance-display';
import { AI_GOV_ROOT } from '../ui/ai-gov-page';
import { AiClassificationResult } from '../ui/classification-result';
import { isReviewOverdue } from './assessments-list';

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

/**
 * The parts of an impact assessment / FRIA a reader needs first ("Hovedinformasjon"),
 * with their plain lead label. The other parts sit under "Flere detaljer".
 */
export const LEAD_SECTIONS: Readonly<
  Record<'impact' | 'fria', readonly (readonly [string, string])[]>
> = {
  impact: [
    ['conclusion', 'aiGovernance.assessmentDetail.lead.conclusion'],
    ['affected_parties', 'aiGovernance.assessmentDetail.lead.affected'],
    ['mitigations', 'aiGovernance.assessmentDetail.lead.mitigations'],
  ],
  fria: [
    ['affected_categories', 'aiGovernance.assessmentDetail.lead.affected'],
    ['specific_risks', 'aiGovernance.assessmentDetail.lead.risks'],
    ['human_oversight_measures', 'aiGovernance.assessmentDetail.lead.oversight'],
  ],
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

/** The "how far is it" sentence of an assessment (docs/ux-guide.md §2.7 rule 4). */
export function assessmentStatusSentence(
  a: Pick<Assessment, 'status' | 'kind'>,
  draft: { wizard: boolean; missing: number },
): { key: string; tone: StatusLineTone } {
  const base = 'aiGovernance.assessmentDetail.statusLine.';
  if (a.status === 'approved') {
    return { key: `${base}approved`, tone: 'pass' };
  }
  if (a.status === 'completed') {
    return { key: `${base}completed`, tone: 'warn' };
  }
  if (draft.wizard) {
    return { key: `${base}draftWizard`, tone: 'warn' };
  }
  return { key: draft.missing > 0 ? `${base}draftMissing` : `${base}draftReady`, tone: 'warn' };
}

/** What an assessment still needs ("Oppfølging", docs/ux-guide.md §2.7). */
export function assessmentMissing(
  a: Assessment,
  ctx: {
    readonly canWrite: boolean;
    readonly editLink: readonly unknown[];
    readonly missingSections: readonly { key: string; label: string }[];
    readonly reopen: () => void;
    readonly now?: Date;
  },
): RecordMissingItem[] {
  if (!ctx.canWrite) {
    return [];
  }
  const items: RecordMissingItem[] = [];
  const isDraft = a.status === 'draft';
  if (a.review_flag) {
    items.push({
      key: 'flag',
      labelKey: `aiGovernance.assessmentDetail.todo.flag.${a.review_flag}`,
      ...(isDraft ? { link: ctx.editLink } : { action: ctx.reopen }),
    });
  } else if (isReviewOverdue(a, ctx.now)) {
    items.push({
      key: 'review',
      labelKey: 'aiGovernance.assessmentDetail.todo.review',
      action: ctx.reopen,
    });
  }
  if (isDraft) {
    for (const section of ctx.missingSections) {
      items.push({
        key: `section-${section.key}`,
        labelKey: 'aiGovernance.assessmentDetail.todo.section',
        params: { section: section.label },
        link: ctx.editLink,
      });
    }
    if (!a.owner) {
      items.push({
        key: 'owner',
        labelKey: 'aiGovernance.assessmentDetail.todo.owner',
        link: ctx.editLink,
      });
    }
  }
  return items;
}

/**
 * `/ai-governance/assessments/:id`: a classification, impact assessment or FRIA on
 * the detail-page anatomy (docs/ux-guide.md §2.7). "Hovedinformasjon" says how far
 * it is, which AI system it is about and what it concluded (the conclusion, who is
 * affected and how the impact is reduced; for a classification the risk class).
 * The other parts sit under "Flere detaljer" with unwritten ones hidden. The
 * "Oppfølging" card lists the missing parts, the requirements, the connections and
 * owner, due date, completion, approval and the next review (editable in any
 * status). Draft -> completed -> approved; the person who completed it cannot
 * approve it; completed / approved assessments can be reopened.
 */
@Component({
  selector: 'app-ai-assessment-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Button,
    DateInput,
    OutputsPanel,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
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
      @let line = statusLine();
      <app-record-detail-layout
        [anatomy]="true"
        entityType="ai_assessment"
        [entityId]="a.id"
        [title]="a.title"
        [breadcrumbs]="[
          root,
          { labelKey: 'aiGovernance.assessments.title', link: '/ai-governance/assessments' },
          { label: a.code },
        ]"
        settingsLink="/settings/modules/ai-governance"
        [tabs]="tabs"
        [canEdit]="store.canWrite()"
        [includeAudit]="store.canReadAudit()"
        [fieldLabels]="fieldLabels"
        [missing]="missing()"
        backLink="/ai-governance/assessments"
        backLabelKey="aiGovernance.assessments.backToList"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="assessment-code">{{ a.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'aiGovernance.kindShort.' + a.kind | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(a.status)"
            [labelKey]="statusKey(a.status)"
            data-testid="assessment-status"
          />
          @if (a.review_flag) {
            <app-status-badge
              meaning="lifecycle"
              value="overdue"
              labelKey="aiGovernance.assessments.needsReview"
            />
          } @else if (reviewOverdue()) {
            <app-status-badge
              meaning="lifecycle"
              value="overdue"
              labelKey="aiGovernance.assessmentDetail.reviewOverdue"
            />
          }
        </ng-container>

        @if (draftMode() === 'wizard') {
          <app-button primary (click)="openWizard(a)" data-testid="assessment-edit">
            {{ 'aiGovernance.assessmentDetail.openWizard' | transloco }}
          </app-button>
        }
        @if (draftMode() === 'missing') {
          <app-button primary (click)="edit(a)" data-testid="assessment-edit">
            {{ 'aiGovernance.assessmentDetail.continue' | transloco }}
          </app-button>
        }
        @if (draftMode() === 'missing') {
          <app-button
            secondary
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
            [disabled]="busy()"
            (click)="pending.set('complete')"
            data-testid="assessment-complete"
          >
            <app-icon name="check" [size]="14" />
            {{ 'aiGovernance.assessmentDetail.complete' | transloco }}
          </app-button>
        }
        @if (draftMode() === 'ready') {
          <app-button secondary variant="secondary" (click)="edit(a)" data-testid="assessment-edit">
            {{ 'aiGovernance.common.edit' | transloco }}
          </app-button>
        }
        @if (store.canApprove() && a.status === 'completed') {
          <app-button
            primary
            [disabled]="busy() || selfCompleted()"
            (click)="pending.set('approve')"
            data-testid="assessment-approve"
          >
            <app-icon name="checkcircle" [size]="14" />
            {{ 'aiGovernance.assessmentDetail.approve' | transloco }}
          </app-button>
        }
        @if (store.canWrite() && a.status !== 'draft') {
          <button
            appMenuItem
            overflow
            type="button"
            (click)="pending.set('reopen')"
            data-testid="assessment-reopen"
          >
            {{ 'aiGovernance.assessmentDetail.reopen' | transloco }}
          </button>
        }
        @if (store.canWrite() && a.status !== 'approved') {
          <button
            appMenuItem
            overflow
            type="button"
            [danger]="true"
            (click)="pending.set('delete')"
          >
            {{ 'aiGovernance.common.delete' | transloco }}
          </button>
        }

        <button appMenuItem ask type="button" (click)="askAi('summarise', a)">
          <app-icon name="spark" [size]="15" />
          {{ 'aiGovernance.ai.summariseAssessment' | transloco }}
        </button>
        <button appMenuItem ask type="button" (click)="askAi('review', a)">
          <app-icon name="spark" [size]="15" />
          {{ 'aiGovernance.ai.reviewAssessment' | transloco }}
        </button>

        <app-help-strip
          help
          [scope]="scope"
          page="assessmentDetail"
          lesson="impact-assessment-and-fria"
          [subject]="a.title"
        />

        <app-record-lead
          record-lead
          [fillLink]="draftMode() === 'missing' || draftMode() === 'ready' ? editLink() : null"
          data-testid="assessment-lead"
        >
          <app-record-status-line status [tone]="line.tone" data-testid="assessment-status-line">
            {{ line.key | transloco: { done: requiredDone(), total: requiredTotal() } }}
          </app-record-status-line>
          <app-field-item size="lead" labelKey="aiGovernance.assessmentDetail.lead.system">
            <app-entity-chip
              [ref]="systemRef()!"
              [statusText]="true"
              data-testid="assessment-system"
            />
          </app-field-item>
          @if (a.kind === 'classification') {
            <app-field-item size="lead" labelKey="aiGovernance.assessmentDetail.lead.outcome">
              @if (result(); as r) {
                <span class="flex flex-col gap-1.5">
                  <span>
                    <app-status-badge
                      meaning="severity"
                      [value]="riskValue(r.risk_class)"
                      [labelKey]="riskKey(r.risk_class)"
                    />
                  </span>
                  <span>{{ riskExplainKey(r.risk_class, r.role) | transloco }}</span>
                </span>
              }
            </app-field-item>
          } @else {
            @for (lead of leadSections(); track lead.key) {
              <app-field-item
                size="lead"
                [labelKey]="lead.label"
                [wide]="lead.key === 'conclusion'"
                [attr.data-testid]="'assessment-lead-' + lead.key"
              >
                @if (sections()[lead.key]; as text) {
                  <div class="cf-prose leading-relaxed" [innerHTML]="text | appMarkdown"></div>
                }
              </app-field-item>
            }
          }
        </app-record-lead>

        <div class="flex flex-col gap-8">
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

          @if (a.kind === 'classification') {
            <app-record-details [columns]="1">
              <app-field-item labelKey="aiGovernance.assessmentDetail.answers">
                @if (answerLines().length) {
                  <ul class="list-disc pl-5 text-body text-fg">
                    @for (line of answerLines(); track $index) {
                      <li>{{ line }}</li>
                    }
                  </ul>
                } @else {
                  <span class="text-ui text-fg-muted">{{
                    'aiGovernance.assessmentDetail.noneAnswered' | transloco
                  }}</span>
                }
              </app-field-item>
              <div after class="mt-6">
                @if (result(); as r) {
                  <section aria-labelledby="aia-outcome-title">
                    <h2
                      id="aia-outcome-title"
                      class="mb-3 font-display text-card font-bold text-fg"
                    >
                      {{ 'aiGovernance.assessmentDetail.outcomeDetail' | transloco }}
                    </h2>
                    <app-ai-classification-result [result]="r" [summary]="false" />
                  </section>
                } @else {
                  <app-alert tone="info">{{
                    'aiGovernance.assessmentDetail.notCompletedHint' | transloco
                  }}</app-alert>
                }
              </div>
            </app-record-details>
          } @else {
            <app-record-details
              [columns]="1"
              [fillLink]="draftMode() === 'missing' || draftMode() === 'ready' ? editLink() : null"
              titleKey="aiGovernance.assessmentDetail.restTitle"
            >
              @for (key of otherSectionKeys(); track key) {
                <app-field-item
                  [labelText]="sectionKey(a.kind, key) | transloco"
                  [attr.data-testid]="'assessment-section-' + key"
                >
                  @if (sections()[key]; as text) {
                    <div
                      class="cf-prose leading-relaxed text-fg"
                      [innerHTML]="text | appMarkdown"
                    ></div>
                  }
                </app-field-item>
              }
            </app-record-details>
            <app-outputs-panel
              entityType="ai_assessment"
              [entityId]="a.id"
              data-testid="assessment-outputs"
            />
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

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="aiGovernance.fields.owner"
            [value]="a.owner?.name"
          />
          @if (a.status === 'draft') {
            <app-field-item
              layout="inline"
              labelKey="aiGovernance.fields.dueAt"
              [value]="a.due_at ? (a.due_at | localDay) : null"
            />
          }
          <app-field-item
            layout="inline"
            labelKey="aiGovernance.assessmentDetail.completed"
            [value]="a.completed_at ? completedLine(a) : null"
          />
          <app-field-item
            layout="inline"
            labelKey="aiGovernance.assessmentDetail.approved"
            [value]="a.approved_at ? approvedLine(a) : null"
          />
          <app-field-item
            [layout]="editingReview() ? 'stacked' : 'inline'"
            labelKey="aiGovernance.fields.nextReview"
            [keepEmpty]="true"
          >
            @if (editingReview()) {
              <form
                class="mt-1 flex flex-wrap items-center gap-2"
                (submit)="$event.preventDefault(); saveReview(a)"
                (keydown.escape)="editingReview.set(false)"
              >
                <label class="sr-only" for="aia-next-review">{{
                  'aiGovernance.fields.nextReview' | transloco
                }}</label>
                <app-date-input
                  class="w-40"
                  inputId="aia-next-review"
                  [value]="reviewDay()"
                  (valueChange)="reviewDay.set($event ?? '')"
                />
                <app-button size="sm" type="submit" [loading]="savingReview()">{{
                  'aiGovernance.common.save' | transloco
                }}</app-button>
              </form>
            } @else {
              <span class="inline-flex flex-wrap items-center justify-end gap-x-1.5">
                @if (a.next_review_at) {
                  <span [class.text-warn-ink]="reviewOverdue()">{{
                    a.next_review_at | localDay
                  }}</span>
                } @else {
                  <span class="font-normal text-fg-subtle">{{
                    'aiGovernance.assessmentDetail.notPlanned' | transloco
                  }}</span>
                }
                @if (store.canWrite()) {
                  <span aria-hidden="true" class="text-fg-subtle">·</span>
                  <button
                    type="button"
                    class="min-h-6 font-semibold text-accent hover:underline"
                    (click)="startReviewEdit(a)"
                    data-testid="assessment-review-edit"
                  >
                    {{
                      (a.next_review_at
                        ? 'aiGovernance.common.change'
                        : 'aiGovernance.assessmentDetail.plan'
                      ) | transloco
                    }}
                  </button>
                }
              </span>
            }
          </app-field-item>
          <app-field-item
            layout="inline"
            labelKey="aiGovernance.systemDetail.updated"
            [value]="a.updated_at | localDate"
          />
        </app-record-meta>
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
  protected readonly riskKey = riskKey;
  protected readonly riskValue = riskValue;
  protected readonly riskExplainKey = riskExplainKey;

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

  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/ai-governance/assessments',
    this.id(),
    'edit',
  ]);
  protected readonly result = computed(() => asClassificationResult(this.assessment()?.result));
  protected readonly sections = computed(() => sectionAnswers(this.assessment()?.answers));
  /** The AI system as a connection chip (type, code, name, link). */
  protected readonly systemRef = computed<EntityChipRef | null>(() => {
    const s = this.assessment()?.ai_system;
    return s
      ? {
          entity_type: 'ai_system',
          entity_id: s.id,
          code: s.code,
          title: s.name,
          url: `/ai-governance/systems/${s.id}`,
          module: 'ai_governance',
        }
      : null;
  });
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
  protected readonly statusLine = computed(() => {
    const a = this.assessment();
    return a
      ? assessmentStatusSentence(a, {
          wizard: this.isWizard(a),
          missing: this.missingList().length,
        })
      : { key: '', tone: 'neutral' as StatusLineTone };
  });
  protected readonly reviewOverdue = computed(() => {
    const a = this.assessment();
    return !!a && isReviewOverdue(a);
  });
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
  /** The lead parts of this kind that exist in the catalog. */
  protected readonly leadSections = computed(() => {
    const a = this.assessment();
    if (!a || a.kind === 'classification') {
      return [];
    }
    const keys = new Set(this.sectionKeys());
    return LEAD_SECTIONS[a.kind === 'fria' ? 'fria' : 'impact']
      .filter(([key]) => keys.has(key))
      .map(([key, label]) => ({ key, label }));
  });
  protected readonly otherSectionKeys = computed(() => {
    const lead = new Set(this.leadSections().map((l) => l.key));
    return this.sectionKeys().filter((key) => !lead.has(key));
  });
  protected readonly selfCompleted = computed(() => {
    const by = this.assessment()?.completed_by?.id;
    return !!by && by === this.auth.user()?.id;
  });
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const a = this.assessment();
    if (!a) {
      return [];
    }
    return assessmentMissing(a, {
      canWrite: this.store.canWrite(),
      editLink: this.editLink(),
      missingSections: this.missingList().map((key) => ({
        key,
        label: this.language.translate(assessmentSectionKey(a.kind, key)),
      })),
      reopen: () => this.pending.set('reopen'),
    });
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

  protected edit(a: Assessment): void {
    void this.router.navigate(['/ai-governance/assessments', a.id, 'edit']);
  }

  protected openWizard(a: Assessment): void {
    void this.router.navigate(['/ai-governance/systems', a.ai_system.id, 'classify'], {
      queryParams: { assessment: a.id },
    });
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

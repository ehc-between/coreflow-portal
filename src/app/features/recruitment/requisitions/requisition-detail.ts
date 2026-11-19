import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
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
import { LocalDatePipe, LocalDayPipe, formatLocalDate } from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { Breadcrumb } from '../../../shared/ui/page-header/page-header';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RecruitmentApi } from '../data/recruitment-api';
import {
  RequisitionAction,
  activeApplicationCount,
  groupRequisitionActions,
  isRequisitionClosed,
  requisitionActions,
  requisitionToneValue,
  visibleStageTiles,
} from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import { RecruitmentPeople } from '../data/recruitment-people';
import {
  ENTITY_REQUISITION,
  MODULE_KEY,
  RequisitionDetail,
  RequisitionStatus,
  STAGES,
  SuggestedQuestion,
} from '../data/recruitment.models';
import { RecruitmentAiOutput } from '../shared/ai-output';
import { injectConfirmedRefs } from '../shared/confirmed-refs';
import { RECRUITMENT_CRUMB, settingsLinkFor } from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';
import { TeamEditor } from '../shared/team-editor';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'tasks',
  'comments',
  'attachments',
  'revisions',
];

/** Tone of the status sentence: done is green, open work is a to-do (never red). */
const STATUS_TONE: Readonly<Record<RequisitionStatus, StatusLineTone>> = {
  draft: 'warn',
  pending_approval: 'warn',
  approved: 'warn',
  rejected: 'warn',
  open: 'neutral',
  on_hold: 'neutral',
  filled: 'pass',
  cancelled: 'neutral',
};

/** What a requisition still needs ("Oppfølging", docs/ux-guide.md §2.7). */
export function requisitionMissing(
  r: RequisitionDetail,
  editLink: readonly unknown[],
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (isRequisitionClosed(r.status)) {
    return items;
  }
  if (r.screening_criteria.length === 0) {
    items.push({
      key: 'criteria',
      labelKey: 'recruitment.detail.req.missing.criteria',
      link: editLink,
    });
  }
  if (!r.hiring_manager) {
    items.push({
      key: 'manager',
      labelKey: 'recruitment.detail.req.missing.manager',
      link: editLink,
    });
  }
  if (!r.posting_text?.trim()) {
    items.push({
      key: 'posting',
      labelKey: 'recruitment.detail.req.missing.posting',
      link: editLink,
    });
  }
  return items;
}

/** Revision snapshot field -> label key (scoped). */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'recruitment.fields.title',
  description: 'recruitment.fields.description',
  justification: 'recruitment.fields.justification',
  department_id: 'recruitment.fields.department',
  location: 'recruitment.fields.location',
  employment_type: 'recruitment.fields.employmentType',
  headcount: 'recruitment.fields.headcount',
  role_risk: 'recruitment.fields.roleRisk',
  target_start_date: 'recruitment.fields.targetStartDate',
  hiring_manager_user_id: 'recruitment.fields.hiringManager',
  recruiter_user_id: 'recruitment.fields.recruiter',
  position_id: 'recruitment.fields.position',
  screening_criteria: 'recruitment.fields.screeningCriteria',
  posting_title: 'recruitment.fields.postingTitle',
  posting_text: 'recruitment.fields.postingText',
  posting_closes_at: 'recruitment.fields.postingClosesAt',
  status: 'recruitment.fields.status',
  code: 'recruitment.fields.code',
};

/** Actions that ask for a note first (`required` = the note must not be empty). */
const NOTE_ACTIONS: Partial<Record<RequisitionAction, { readonly required: boolean }>> = {
  approve: { required: false },
  reject: { required: true },
  fill: { required: false },
  cancel: { required: false },
};

/**
 * A job requisition, on the detail-page anatomy (docs/ux-guide.md §2.7): one next
 * step in the header (send, approve, open) and the assistant drafts in "Spør KI";
 * "Hovedinformasjon" with a status sentence, why the role is needed, the candidates
 * per stage (each opens the matching applications), the role risk with the checks it
 * needs, and the approval; the other fields, criteria and job ad under the details;
 * one "Oppfølging" card (what is missing, requirements, connections, metadata) and
 * the hiring team.
 */
@Component({
  selector: 'app-requisition-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    EntityTasks,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    StatusBadge,
    RecruitmentAiOutput,
    TeamEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (errorKey(); as key) {
      <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
        <app-error-state [bodyKey]="key" (retry)="reload()" />
        <a
          routerLink="/recruitment/requisitions"
          class="mt-4 inline-block text-ui font-semibold text-accent"
          >{{ 'recruitment.common.backToList' | transloco }}</a
        >
      </div>
    } @else if (req(); as r) {
      <app-record-detail-layout
        [anatomy]="true"
        [entityType]="entityType"
        [entityId]="r.id"
        [title]="r.title"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink()"
        [tabs]="tabs"
        [canEdit]="r.can_edit"
        [requirementsPanel]="true"
        [fieldLabels]="fieldLabels"
        [missing]="missing()"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="req-meta">{{ r.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'recruitment.detail.req.type' | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(r.status)"
            [labelKey]="'recruitment.requisitionStatus.' + r.status"
            data-testid="req-status"
          />
        </ng-container>

        @if (groups().primary; as action) {
          <app-button
            primary
            [loading]="busy() === action"
            [disabled]="busy() !== null"
            (click)="start(action)"
            [attr.data-testid]="'req-action-' + action"
          >
            {{ 'recruitment.requisition.actions.' + action | transloco }}
          </app-button>
        } @else if (canEdit()) {
          <app-button primary (click)="edit()" data-testid="req-edit">
            {{ 'recruitment.common.edit' | transloco }}
          </app-button>
        }
        @if (groups().secondary; as action) {
          <app-button
            secondary
            variant="secondary"
            [loading]="busy() === action"
            [disabled]="busy() !== null"
            (click)="start(action)"
            [attr.data-testid]="'req-action-' + action"
          >
            {{ 'recruitment.requisition.actions.' + action | transloco }}
          </app-button>
        }
        <a secondary [routerLink]="['/recruitment/requisitions', r.id, 'pipeline']">
          <app-button variant="secondary" data-testid="req-pipeline">
            <app-icon name="people" [size]="15" />
            {{ 'recruitment.requisition.pipeline' | transloco }}
          </app-button>
        </a>
        @if (groups().primary && canEdit()) {
          <button overflow appMenuItem type="button" (click)="edit()" data-testid="req-edit-menu">
            {{ 'recruitment.common.edit' | transloco }}
          </button>
        }
        @for (action of groups().overflow; track action) {
          <button
            overflow
            appMenuItem
            type="button"
            [danger]="action === 'cancel' || action === 'delete'"
            [disabled]="busy() !== null"
            (click)="start(action)"
            [attr.data-testid]="'req-action-' + action"
          >
            {{ 'recruitment.requisition.actions.' + action | transloco }}
          </button>
        }

        @if (perms().write && r.screening_criteria.length > 0) {
          <button
            appMenuItem
            ask
            type="button"
            data-testid="ask-interview-questions"
            (click)="runAssist('questions')"
          >
            <app-icon name="spark" [size]="15" />
            {{ 'recruitment.ai.interviewQuestions' | transloco }}
          </button>
        }
        @if (canEdit()) {
          <button
            appMenuItem
            ask
            type="button"
            data-testid="ask-job-ad"
            (click)="runAssist('jobAd')"
          >
            <app-icon name="spark" [size]="15" />
            {{ 'recruitment.ai.draftJobAd' | transloco }}
          </button>
        }

        <app-help-strip
          help
          scope="recruitment"
          page="requisition"
          lesson="screening-proportionate"
          [subject]="r.title"
        />

        <app-record-lead record-lead [fillLink]="canEdit() ? editLink() : null">
          <app-record-status-line status [tone]="statusTone()" data-testid="req-status-line">
            {{ statusSentence() }}
          </app-record-status-line>
          <app-field-item
            size="lead"
            [wide]="true"
            labelKey="recruitment.detail.req.why"
            [value]="r.justification"
            [multiline]="true"
          />
          <div class="min-w-0 sm:col-span-full" data-testid="req-flow">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="text-ui font-semibold text-fg">{{
                'recruitment.detail.req.candidates' | transloco
              }}</span>
              <span class="flex flex-wrap items-center gap-4">
                @if (stageTiles().length > 0) {
                  <a
                    routerLink="/recruitment/applications"
                    [queryParams]="{ requisition_id: r.id }"
                    class="text-ui font-semibold text-accent hover:underline"
                    data-testid="req-all-applications"
                    >{{ 'recruitment.requisition.allApplications' | transloco }}</a
                  >
                }
                @if (perms().write && r.status === 'open') {
                  <a
                    [routerLink]="['/recruitment/applications/new']"
                    [queryParams]="{ requisition_id: r.id }"
                    class="inline-flex items-center gap-1 text-ui font-semibold text-accent hover:underline"
                  >
                    <app-icon name="userplus" [size]="15" />
                    {{ 'recruitment.applications.new' | transloco }}
                  </a>
                }
              </span>
            </div>
            @if (stageTiles().length === 0) {
              <p class="mt-1 text-body text-fg-muted" data-testid="req-no-applications">
                {{
                  (r.status === 'open'
                    ? 'recruitment.requisition.noApplicationsOpen'
                    : 'recruitment.requisition.noApplications'
                  ) | transloco
                }}
              </p>
            } @else {
              <ul class="mt-2 flex flex-wrap gap-2" data-testid="req-stage-tiles">
                @for (stage of stageTiles(); track stage) {
                  <li>
                    <a
                      routerLink="/recruitment/applications"
                      [queryParams]="{ requisition_id: r.id, stage: stage }"
                      class="flex min-w-[112px] flex-col rounded-tile border border-border px-3 py-2 outline-none hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent"
                      [attr.aria-label]="
                        'recruitment.requisition.stageTileLabel'
                          | transloco
                            : {
                                count: r.stage_counts[stage] ?? 0,
                                stage: ('recruitment.stage.' + stage | transloco),
                              }
                      "
                    >
                      <span class="text-section font-bold text-fg">{{
                        r.stage_counts[stage] ?? 0
                      }}</span>
                      <span class="text-meta text-fg-muted">{{
                        'recruitment.stage.' + stage | transloco
                      }}</span>
                    </a>
                  </li>
                }
              </ul>
            }
          </div>
          <app-field-item size="lead" labelKey="recruitment.detail.req.risk" data-testid="req-risk">
            <app-status-badge
              meaning="severity"
              [value]="r.role_risk"
              [labelKey]="'recruitment.roleRisk.' + r.role_risk"
            />
            <span class="mt-1 block text-body text-fg" data-testid="req-required-checks">
              @if (requiredChecks()) {
                {{ 'recruitment.detail.req.checks' | transloco: { checks: requiredChecks() } }}
              } @else {
                {{ 'recruitment.detail.req.noChecks' | transloco }}
              }
            </span>
            <span class="mt-1 block text-meta text-fg-muted">
              {{ 'recruitment.detail.req.checksWhen' | transloco }}
              @if (showsLegalBasisNote()) {
                {{ 'recruitment.requisition.legalBasisNote' | transloco }}
              }
            </span>
          </app-field-item>
          <app-field-item
            size="lead"
            labelKey="recruitment.requisition.approval"
            [value]="decisionText()"
            data-testid="req-decision"
          />
        </app-record-lead>

        <app-record-details [columns]="3" [fillLink]="canEdit() ? editLink() : null">
          <app-field-item
            labelKey="recruitment.fields.employmentType"
            [value]="'recruitment.employmentType.' + r.employment_type | transloco"
          />
          <app-field-item
            labelKey="recruitment.detail.req.hires"
            [value]="
              'recruitment.requisition.hiresOf'
                | transloco: { hires: r.hires, headcount: r.headcount }
            "
          />
          <app-field-item
            labelKey="recruitment.fields.targetStartDate"
            [value]="r.target_start_date ? (r.target_start_date | localDay) : null"
          />
          <app-field-item
            labelKey="recruitment.fields.department"
            [value]="people.departmentName(r.department_id)"
          />
          <app-field-item labelKey="recruitment.fields.location" [value]="r.location" />
          <app-field-item labelKey="recruitment.fields.position" data-testid="req-position">
            @if (positionRef(); as ref) {
              <app-entity-chip [ref]="ref" [statusText]="true" />
            }
          </app-field-item>
          <app-field-item
            labelKey="recruitment.fields.description"
            [value]="r.description"
            [wide]="true"
            [multiline]="true"
          />

          <div after class="mt-6 flex flex-col gap-4">
            <app-card id="req-criteria" class="block scroll-mt-20">
              <h2 class="mb-2 font-display text-card font-bold text-fg">
                {{ 'recruitment.fields.screeningCriteria' | transloco }}
              </h2>
              @if (r.screening_criteria.length === 0) {
                <p class="text-ui text-fg-muted">
                  {{ 'recruitment.criteria.noneOnRequisition' | transloco }}
                </p>
              } @else {
                <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-body">
                  @for (c of r.screening_criteria; track c.id) {
                    <li>
                      <span class="font-semibold text-fg">{{ c.label }}</span>
                      @if (c.description) {
                        <span class="block text-fg-muted">{{ c.description }}</span>
                      }
                    </li>
                  }
                </ol>
              }
              @if (aiRunning() === 'questions') {
                <p class="mt-3 text-ui text-fg-muted" role="status">
                  {{ 'recruitment.detail.aiRunning' | transloco }}
                </p>
              }
              @if (questions().length > 0) {
                <app-recruitment-ai-output class="mt-3" (dismissed)="questions.set([])">
                  <ol class="flex list-decimal flex-col gap-2 pl-5 text-body">
                    @for (q of questions(); track $index) {
                      <li>
                        @if (criterionLabel(q.criterion_id); as label) {
                          <span class="block text-meta font-semibold text-fg-subtle">{{
                            label
                          }}</span>
                        }
                        <span class="text-fg">{{ q.question }}</span>
                        @if (q.follow_up) {
                          <span class="block text-fg-muted">
                            {{ 'recruitment.ai.followUp' | transloco: { text: q.follow_up } }}
                          </span>
                        }
                      </li>
                    }
                  </ol>
                </app-recruitment-ai-output>
              }
              @if (perms().write && r.screening_criteria.length > 0) {
                <app-ai-assist-button
                  #questionsAssist
                  class="hidden"
                  assist="recruitment.interview_questions"
                  labelKey="recruitment.ai.interviewQuestions"
                  [entityType]="entityType"
                  [entityId]="r.id"
                  (result)="onQuestions($event)"
                  (failed)="onAiFailed()"
                />
              }
            </app-card>

            <app-card id="req-posting" class="block scroll-mt-20">
              <h2 class="mb-2 font-display text-card font-bold text-fg">
                {{ 'recruitment.requisitionForm.postingSection' | transloco }}
              </h2>
              @if (aiRunning() === 'jobAd') {
                <p class="mb-3 text-ui text-fg-muted" role="status">
                  {{ 'recruitment.detail.aiRunning' | transloco }}
                </p>
              }
              @if (jobAd()) {
                <app-recruitment-ai-output
                  class="mb-3"
                  [text]="jobAd()"
                  useLabelKey="recruitment.ai.useAsPosting"
                  (used)="usePosting()"
                  (dismissed)="jobAd.set(null)"
                />
              }
              @if (r.posting_text) {
                <div data-testid="req-posting">
                  <h3 class="mb-1 text-body font-semibold text-fg">
                    {{ r.posting_title || r.title }}
                  </h3>
                  <p class="mb-2 text-meta text-fg-muted">
                    {{
                      r.posting_closes_at
                        ? ('recruitment.requisition.postingDeadline'
                          | transloco: { date: (r.posting_closes_at | localDate) })
                        : ('recruitment.requisition.postingNoDeadline' | transloco)
                    }}
                    ·
                    {{
                      (r.status === 'open'
                        ? 'recruitment.requisition.postingLive'
                        : 'recruitment.requisition.postingNotLive'
                      ) | transloco
                    }}
                  </p>
                  <p
                    class="text-body whitespace-pre-wrap text-fg"
                    [class.line-clamp-6]="!postingExpanded()"
                  >
                    {{ r.posting_text.trim() }}
                  </p>
                  <button
                    type="button"
                    class="mt-1 text-ui font-semibold text-accent"
                    (click)="postingExpanded.set(!postingExpanded())"
                  >
                    {{
                      (postingExpanded()
                        ? 'recruitment.requisition.showLess'
                        : 'recruitment.requisition.showAll'
                      ) | transloco
                    }}
                  </button>
                </div>
              } @else {
                <p class="text-ui text-fg-muted" data-testid="req-no-posting">
                  {{ 'recruitment.detail.req.noPosting' | transloco }}
                  @if (canEdit()) {
                    <a
                      [routerLink]="editLink()"
                      class="ml-1 font-semibold whitespace-nowrap text-accent hover:underline"
                      >{{ 'recruitment.requisition.writePosting' | transloco }}</a
                    >
                  }
                </p>
              }
              @if (canEdit()) {
                <app-ai-assist-button
                  #jobAdAssist
                  class="hidden"
                  assist="recruitment.draft_job_ad"
                  labelKey="recruitment.ai.draftJobAd"
                  [entityType]="entityType"
                  [entityId]="r.id"
                  (text)="onJobAd($event)"
                  (failed)="onAiFailed()"
                />
              }
            </app-card>
          </div>
        </app-record-details>

        <div tasks>
          <app-entity-tasks [entityType]="entityType" [entityId]="r.id" [canCreate]="r.can_edit" />
        </div>

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="recruitment.detail.opened"
            [value]="r.opened_at ? (r.opened_at | localDate) : null"
          />
          <app-field-item
            layout="inline"
            labelKey="recruitment.detail.updated"
            [value]="r.updated_at | localDate"
          />
        </app-record-meta>

        <ng-container ngProjectAs="[aside]">
          <app-team-editor
            [requisitionId]="r.id"
            [team]="r.team"
            [canEdit]="perms().write && r.can_edit && !closed()"
            (saved)="req.set($event)"
          />
        </ng-container>
        <app-why-it-matters aside-learn scope="recruitment" page="requisition" />
      </app-record-detail-layout>

      <app-prompt-dialog
        [open]="noteDialog() !== null"
        [title]="noteTitle() | transloco"
        [message]="noteMessage() | transloco"
        [label]="'recruitment.requisition.note' | transloco"
        [required]="noteDialog()?.required ?? false"
        [busy]="busy() !== null"
        [confirmVariant]="pending() === 'cancel' || pending() === 'reject' ? 'danger' : 'primary'"
        [confirmLabel]="noteTitle() | transloco"
        [cancelLabel]="'recruitment.common.keep' | transloco"
        (confirmed)="confirmNote($event)"
        (cancelled)="pending.set(null)"
      />
      <app-confirm-dialog
        [open]="pending() === 'delete'"
        [title]="'recruitment.requisition.deleteTitle' | transloco"
        [message]="'recruitment.requisition.deleteMessage' | transloco: { code: r.code }"
        [confirmLabel]="'recruitment.requisition.actions.delete' | transloco"
        [cancelLabel]="'recruitment.common.keep' | transloco"
        [busy]="busy() === 'delete'"
        (confirmed)="remove()"
        (cancelled)="pending.set(null)"
      />
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    }
  `,
})
export class RequisitionDetailPage {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly injector = inject(Injector);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly people = inject(RecruitmentPeople);
  protected readonly perms = injectRecruitmentPerms();
  protected readonly settingsLink = computed(() => settingsLinkFor(this.perms()));

  protected readonly entityType = ENTITY_REQUISITION;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly statusValue = requisitionToneValue;

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });
  protected readonly req = signal<RequisitionDetail | null>(null);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly busy = signal<RequisitionAction | 'posting' | null>(null);
  protected readonly pending = signal<RequisitionAction | null>(null);
  protected readonly questions = signal<readonly SuggestedQuestion[]>([]);
  protected readonly jobAd = signal<string | null>(null);
  protected readonly postingExpanded = signal(false);
  protected readonly aiRunning = signal<'questions' | 'jobAd' | null>(null);
  private readonly questionsAssist = viewChild<AiAssistButton>('questionsAssist');
  private readonly jobAdAssist = viewChild<AiAssistButton>('jobAdAssist');
  private readonly version = signal(0);
  private readonly refs = injectConfirmedRefs(ENTITY_REQUISITION, this.id);

  protected readonly closed = computed(() => {
    const r = this.req();
    return r !== null && isRequisitionClosed(r.status);
  });
  protected readonly canEdit = computed(() => {
    const r = this.req();
    return !!r && this.perms().write && r.can_edit && !isRequisitionClosed(r.status);
  });
  protected readonly groups = computed(() => {
    const r = this.req();
    return groupRequisitionActions(r ? requisitionActions(r, this.perms()) : []);
  });
  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => [
    RECRUITMENT_CRUMB,
    { labelKey: 'recruitment.nav.requisitions', link: '/recruitment/requisitions' },
    { label: this.req()?.title ?? '' },
  ]);
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/recruitment/requisitions',
    this.req()?.id ?? '',
    'edit',
  ]);
  protected readonly statusTone = computed<StatusLineTone>(
    () => STATUS_TONE[this.req()?.status ?? 'draft'] ?? 'neutral',
  );
  /** "Åpent for søknader – 5 kandidater er med, 0 av 1 ansatt." */
  protected readonly statusSentence = computed(() => {
    const r = this.req();
    if (!r) {
      return '';
    }
    let key = `recruitment.detail.req.status.${r.status}`;
    if (r.status === 'pending_approval' && r.can_approve) {
      key = 'recruitment.detail.req.status.pending_you';
    } else if (r.status === 'rejected' && r.decision_note) {
      key = 'recruitment.detail.req.status.rejected_note';
    }
    return this.language.translate(key, {
      active: activeApplicationCount(r),
      hires: r.hires,
      headcount: r.headcount,
      note: r.decision_note ?? '',
    });
  });
  protected readonly requiredChecks = computed(() =>
    (this.req()?.required_checks ?? [])
      .map((c) => this.language.translate(`recruitment.checkType.${c}`))
      .join(', '),
  );
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const r = this.req();
    return r && this.canEdit() ? requisitionMissing(r, this.editLink()) : [];
  });
  protected readonly stageTiles = computed(() =>
    visibleStageTiles(this.req()?.stage_counts ?? {}, STAGES),
  );
  protected readonly positionRef = computed(() => {
    const p = this.req()?.position;
    return p
      ? { entity_type: 'position', entity_id: p.id, title: p.title, code: p.code, url: p.url }
      : null;
  });
  protected readonly showsLegalBasisNote = computed(() => this.req()?.role_risk === 'high');
  protected readonly decisionText = computed(() => {
    const r = this.req();
    if (!r) {
      return null;
    }
    const locale = this.language.locale();
    const date = (value: string | null) => (value ? formatLocalDate(value, 'medium', locale) : '');
    const parts: string[] = [];
    if (r.decided_by) {
      const key =
        r.decision === 'rejected' || (!r.decision && r.status === 'rejected')
          ? 'recruitment.requisition.rejectedBy'
          : 'recruitment.requisition.approvedBy';
      parts.push(
        this.language.translate(key, { name: r.decided_by.name, date: date(r.decided_at) }),
      );
    }
    if (r.submitted_by) {
      parts.push(
        this.language.translate('recruitment.requisition.submittedBy', {
          name: r.submitted_by.name,
          date: date(r.submitted_at),
        }),
      );
    }
    if (r.decision_note && r.status !== 'rejected') {
      parts.push(r.decision_note);
    }
    const text = parts.join(' · ');
    return text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : null;
  });
  protected readonly noteDialog = computed(() => {
    const action = this.pending();
    return action ? (NOTE_ACTIONS[action] ?? null) : null;
  });
  protected readonly noteTitle = computed(() =>
    this.pending() ? `recruitment.requisition.actions.${this.pending()}` : 'recruitment.common.ok',
  );
  protected readonly noteMessage = computed(() =>
    this.pending() ? `recruitment.requisition.confirm.${this.pending()}` : 'recruitment.common.ok',
  );

  constructor() {
    this.people.ensureLoaded();
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_REQUISITION,
      entityId: this.id(),
      view: 'detail',
      title: this.req()?.title ?? null,
      requirements: this.refs(),
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const id = this.id();
      this.version();
      if (!orgId || !id) {
        return;
      }
      this.errorKey.set(null);
      const sub = this.api.getRequisition(orgId, id).subscribe({
        next: (r) => this.req.set(r),
        error: (err) => this.errorKey.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }

  protected edit(): void {
    const r = this.req();
    if (r) {
      void this.router.navigate(['/recruitment/requisitions', r.id, 'edit']);
    }
  }

  protected start(action: RequisitionAction): void {
    if (action === 'delete' || NOTE_ACTIONS[action]) {
      this.pending.set(action);
      return;
    }
    this.run(action, null);
  }

  protected confirmNote(note: string): void {
    const action = this.pending();
    if (action) {
      this.run(action, note);
    }
  }

  private run(action: RequisitionAction, note: string | null): void {
    const orgId = this.orgId();
    const r = this.req();
    if (!orgId || !r) {
      return;
    }
    const trimmed = note?.trim() || null;
    let call: Observable<RequisitionDetail>;
    switch (action) {
      case 'fill':
        call = this.api.closeRequisition(orgId, r.id, 'filled', trimmed);
        break;
      case 'cancel':
        call = this.api.closeRequisition(orgId, r.id, 'cancelled', trimmed);
        break;
      case 'submit':
      case 'approve':
      case 'reject':
      case 'open':
      case 'hold':
        call = this.api.transitionRequisition(orgId, r.id, action, trimmed);
        break;
      default:
        return;
    }
    this.busy.set(action);
    call.subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.pending.set(null);
        this.req.set(updated);
        this.toasts.success(`recruitment.requisition.done.${action}`, { code: updated.code });
      },
      error: (err) => {
        this.busy.set(null);
        this.pending.set(null);
        this.toasts.error(recruitmentError(err).key);
      },
    });
  }

  protected remove(): void {
    const orgId = this.orgId();
    const r = this.req();
    if (!orgId || !r) {
      return;
    }
    this.busy.set('delete');
    this.api.deleteRequisition(orgId, r.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.pending.set(null);
        this.toasts.success('recruitment.requisition.deleted', { code: r.code });
        void this.router.navigate(['/recruitment/requisitions']);
      },
      error: (err) => {
        this.busy.set(null);
        this.pending.set(null);
        this.toasts.error(recruitmentError(err).key);
      },
    });
  }

  /** "Spør KI": run a drafting assist; the answer shows in the card it belongs to. */
  protected runAssist(which: 'questions' | 'jobAd'): void {
    this.aiRunning.set(which);
    afterNextRender(
      () => {
        (which === 'questions' ? this.questionsAssist() : this.jobAdAssist())?.run();
        document
          .getElementById(which === 'questions' ? 'req-criteria' : 'req-posting')
          ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      },
      { injector: this.injector },
    );
  }

  protected onAiFailed(): void {
    this.aiRunning.set(null);
    this.toasts.error('recruitment.detail.aiFailed');
  }

  protected onJobAd(text: string): void {
    this.aiRunning.set(null);
    this.jobAd.set(text);
  }

  protected onQuestions(result: unknown): void {
    this.aiRunning.set(null);
    const list = (result as { questions?: unknown } | null)?.questions;
    if (Array.isArray(list)) {
      this.questions.set(
        list
          .filter((q): q is SuggestedQuestion => !!q && typeof q.question === 'string')
          .map((q) => ({
            criterion_id: q.criterion_id ?? null,
            question: q.question,
            follow_up: q.follow_up ?? null,
          })),
      );
    }
  }

  protected criterionLabel(id: string | null): string | null {
    return id ? (this.req()?.screening_criteria.find((c) => c.id === id)?.label ?? null) : null;
  }

  protected usePosting(): void {
    const orgId = this.orgId();
    const r = this.req();
    const text = this.jobAd();
    if (!orgId || !r || !text) {
      return;
    }
    this.busy.set('posting');
    this.api
      .updateRequisition(orgId, r.id, {
        posting_text: text,
        ...(r.posting_title ? {} : { posting_title: r.title }),
        change_reason: null,
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(null);
          this.jobAd.set(null);
          this.req.set(updated);
          this.toasts.success('recruitment.requisitionForm.saved', { code: updated.code });
        },
        error: (err) => {
          this.busy.set(null);
          this.toasts.error(recruitmentError(err).key);
        },
      });
  }
}

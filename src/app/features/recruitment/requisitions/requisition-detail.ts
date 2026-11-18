import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, formatLocalDate } from '../../../shared/locale/locale-pipes';
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
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { Breadcrumb } from '../../../shared/ui/page-header/page-header';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RecruitmentApi } from '../data/recruitment-api';
import {
  RequisitionAction,
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
  STAGES,
  SuggestedQuestion,
} from '../data/recruitment.models';
import { RecruitmentAiOutput } from '../shared/ai-output';
import { injectConfirmedRefs } from '../shared/confirmed-refs';
import {
  RECRUITMENT_CRUMB,
  injectRecruitmentNav,
  settingsLinkFor,
} from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';
import { TeamEditor } from '../shared/team-editor';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

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
 * A job requisition: one next step in the header (send, approve, open), the
 * candidate flow per stage (each tile opens the matching applications), the role,
 * criteria and required checks, the job ad, the hiring team, and the shared record
 * kit (requirements this documents, connections, tasks, activity, revisions).
 */
@Component({
  selector: 'app-requisition-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AiAssistButton,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    EntityTasks,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
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
        [entityType]="entityType"
        [entityId]="r.id"
        [title]="r.title"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink()"
        [tabs]="tabs"
        [canEdit]="r.can_edit"
        [requirementsPanel]="true"
        [fieldLabels]="fieldLabels"
      >
        <span meta class="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="req-meta">
          <span class="font-mono font-semibold">{{ r.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'recruitment.employmentType.' + r.employment_type | transloco }}</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(r.status)"
            [labelKey]="'recruitment.requisitionStatus.' + r.status"
            data-testid="req-status"
          />
          <app-status-badge
            meaning="severity"
            [value]="r.role_risk"
            [labelKey]="'recruitment.roleRisk.' + r.role_risk"
          />
        </span>

        @if (groups().primary; as action) {
          <app-button
            primary
            size="sm"
            [loading]="busy() === action"
            [disabled]="busy() !== null"
            (click)="start(action)"
            [attr.data-testid]="'req-action-' + action"
          >
            {{ 'recruitment.requisition.actions.' + action | transloco }}
          </app-button>
        } @else if (canEdit()) {
          <a primary [routerLink]="['/recruitment/requisitions', r.id, 'edit']">
            <app-button size="sm" data-testid="req-edit">
              {{ 'recruitment.common.edit' | transloco }}
            </app-button>
          </a>
        }
        @if (groups().secondary; as action) {
          <app-button
            secondary
            size="sm"
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
          <app-button variant="secondary" size="sm" data-testid="req-pipeline">
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

        <app-module-nav nav [items]="nav()" labelKey="modules.names.recruitment" />
        <app-help-strip
          help
          scope="recruitment"
          page="requisition"
          lesson="screening-proportionate"
          [subject]="r.title"
        />

        <div class="flex flex-col gap-4">
          @if (r.status === 'rejected' && r.decision_note) {
            <app-alert tone="error">
              {{ 'recruitment.requisition.rejectedNote' | transloco: { note: r.decision_note } }}
            </app-alert>
          }
          @if (r.status === 'pending_approval') {
            <app-alert tone="info" data-testid="req-awaiting">
              @if (r.can_approve) {
                {{ 'recruitment.requisition.awaitingYou' | transloco }}
              } @else {
                {{ 'recruitment.requisition.awaitingApproval' | transloco }}
              }
            </app-alert>
          }
          @if (r.status === 'draft' && canEdit()) {
            <app-alert tone="info">{{ 'recruitment.requisition.draftHint' | transloco }}</app-alert>
          }

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-card font-bold text-fg">
                {{ 'recruitment.requisition.pipelineSummary' | transloco }}
              </h2>
              <div class="flex flex-wrap items-center gap-2">
                <a
                  routerLink="/recruitment/applications"
                  [queryParams]="{ requisition_id: r.id }"
                  class="text-ui font-semibold text-accent"
                  data-testid="req-all-applications"
                  >{{ 'recruitment.requisition.allApplications' | transloco }}</a
                >
                @if (perms().write && r.status === 'open') {
                  <a
                    [routerLink]="['/recruitment/applications/new']"
                    [queryParams]="{ requisition_id: r.id }"
                  >
                    <app-button size="sm" variant="secondary">
                      <app-icon name="userplus" [size]="15" />
                      {{ 'recruitment.applications.new' | transloco }}
                    </app-button>
                  </a>
                }
              </div>
            </div>
            @if (stageTiles().length === 0) {
              <p class="text-ui text-fg-muted" data-testid="req-no-applications">
                {{
                  (r.status === 'open'
                    ? 'recruitment.requisition.noApplicationsOpen'
                    : 'recruitment.requisition.noApplications'
                  ) | transloco
                }}
              </p>
            } @else {
              <ul class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="req-stage-tiles">
                @for (stage of stageTiles(); track stage) {
                  <li>
                    <a
                      routerLink="/recruitment/applications"
                      [queryParams]="{ requisition_id: r.id, stage: stage }"
                      class="flex flex-col rounded-tile border border-border px-3 py-2 outline-none hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent"
                      [attr.aria-label]="
                        'recruitment.requisition.stageTileLabel'
                          | transloco
                            : {
                                count: r.stage_counts[stage] ?? 0,
                                stage: ('recruitment.stage.' + stage | transloco),
                              }
                      "
                    >
                      <span class="text-meta text-fg-muted">{{
                        'recruitment.stage.' + stage | transloco
                      }}</span>
                      <span class="text-section font-bold text-fg">{{
                        r.stage_counts[stage] ?? 0
                      }}</span>
                    </a>
                  </li>
                }
              </ul>
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 text-card font-bold text-fg">
              {{ 'recruitment.requisition.aboutRole' | transloco }}
            </h2>
            <app-field-list>
              <app-field-item
                labelKey="recruitment.fields.department"
                [value]="people.departmentName(r.department_id)"
              />
              <app-field-item labelKey="recruitment.fields.location" [value]="r.location" />
              <app-field-item
                labelKey="recruitment.fields.headcount"
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
                labelKey="recruitment.fields.hiringManager"
                [value]="r.hiring_manager?.name"
              />
              <app-field-item labelKey="recruitment.fields.recruiter" [value]="r.recruiter?.name" />
              <app-field-item labelKey="recruitment.fields.position" data-testid="req-position">
                @if (positionRef(); as ref) {
                  <app-entity-chip [ref]="ref" [showType]="false" />
                }
              </app-field-item>
              <app-field-item
                labelKey="recruitment.requisition.approval"
                [value]="decisionText()"
                data-testid="req-decision"
              />
              @if (r.description) {
                <app-field-item
                  labelKey="recruitment.fields.description"
                  [value]="r.description"
                  [wide]="true"
                  [multiline]="true"
                />
              }
              @if (r.justification) {
                <app-field-item
                  labelKey="recruitment.fields.justification"
                  [value]="r.justification"
                  [wide]="true"
                  [multiline]="true"
                />
              }
            </app-field-list>
          </app-card>

          <app-card>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-card font-bold text-fg">
                {{ 'recruitment.fields.screeningCriteria' | transloco }}
              </h2>
              @if (perms().write && r.screening_criteria.length > 0) {
                <app-ai-assist-button
                  assist="recruitment.interview_questions"
                  labelKey="recruitment.ai.interviewQuestions"
                  [entityType]="entityType"
                  [entityId]="r.id"
                  (result)="onQuestions($event)"
                />
              }
            </div>
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
            <div class="mt-3 border-t border-border pt-3">
              <h3 class="mb-1 text-ui font-semibold text-fg-muted">
                {{ 'recruitment.requisition.requiredChecks' | transloco }}
              </h3>
              <p class="mb-2 text-meta text-fg-muted">
                {{
                  'recruitment.requisition.requiredChecksHint'
                    | transloco: { risk: ('recruitment.roleRisk.' + r.role_risk | transloco) }
                }}
              </p>
              <div class="flex flex-wrap gap-1.5" data-testid="req-required-checks">
                @for (c of r.required_checks; track c) {
                  <app-status-badge
                    meaning="lifecycle"
                    value="draft"
                    [labelKey]="'recruitment.checkType.' + c"
                  />
                } @empty {
                  <span class="text-ui text-fg-muted">{{ 'common.empty.none' | transloco }}</span>
                }
              </div>
              @if (showsLegalBasisNote()) {
                <p class="mt-2 text-meta text-fg-muted">
                  {{ 'recruitment.requisition.legalBasisNote' | transloco }}
                </p>
              }
            </div>
          </app-card>

          <app-card>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-card font-bold text-fg">
                {{ 'recruitment.requisitionForm.postingSection' | transloco }}
              </h2>
              @if (canEdit()) {
                <app-ai-assist-button
                  assist="recruitment.draft_job_ad"
                  labelKey="recruitment.ai.draftJobAd"
                  [entityType]="entityType"
                  [entityId]="r.id"
                  (text)="jobAd.set($event)"
                />
              }
            </div>
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
                {{ 'recruitment.requisition.noPosting' | transloco }}
              </p>
              @if (canEdit()) {
                <a
                  [routerLink]="['/recruitment/requisitions', r.id, 'edit']"
                  class="mt-1 inline-block text-ui font-semibold text-accent"
                  >{{ 'recruitment.requisition.writePosting' | transloco }}</a
                >
              }
            }
          </app-card>
        </div>

        <app-entity-tasks
          tasks
          [entityType]="entityType"
          [entityId]="r.id"
          [canCreate]="r.can_edit"
        />

        <ng-container aside>
          <app-team-editor
            [requisitionId]="r.id"
            [team]="r.team"
            [canEdit]="perms().write && r.can_edit && !closed()"
            (saved)="req.set($event)"
          />
          <div class="flex justify-start">
            <app-watch-button [entityType]="entityType" [entityId]="r.id" />
          </div>
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
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly people = inject(RecruitmentPeople);
  protected readonly perms = injectRecruitmentPerms();
  protected readonly nav = injectRecruitmentNav();
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
    } else if (r.status === 'pending_approval') {
      parts.push(this.language.translate('recruitment.requisition.awaitingShort'));
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
    return parts.length > 0 ? parts.join(' · ') : null;
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

  protected onQuestions(result: unknown): void {
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

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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { RecruitmentApi } from '../data/recruitment-api';
import {
  RequisitionAction,
  isRequisitionClosed,
  requisitionActions,
  requisitionStatusTone,
  riskTone,
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
import { RecruitmentLessonButton } from '../shared/recruitment-lesson-button';
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

/** A job requisition: facts, criteria, posting, workflow actions, hiring team and history. */
@Component({
  selector: 'app-requisition-detail',
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
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    PromptDialog,
    RecruitmentAiOutput,
    RecruitmentLessonButton,
    TeamEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as key) {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-alert>{{ key | transloco }}</app-alert>
        <a
          routerLink="/recruitment/requisitions"
          class="mt-3 inline-block text-[13px] font-semibold text-accent"
          >{{ 'recruitment.common.backToList' | transloco }}</a
        >
      </div>
    } @else if (req(); as r) {
      <app-record-detail-layout
        [entityType]="entityType"
        [entityId]="r.id"
        [tabs]="tabs"
        [canEdit]="r.can_edit"
        [fieldLabels]="fieldLabels"
        backLink="/recruitment/requisitions"
        backLabelKey="recruitment.common.backToList"
      >
        <div header>
          <p class="mb-1 flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-fg-subtle">{{ r.code }}</span>
            <app-badge [tone]="statusTone(r.status)">{{
              'recruitment.requisitionStatus.' + r.status | transloco
            }}</app-badge>
            <app-badge [tone]="riskTone(r.role_risk)">{{
              'recruitment.roleRisk.' + r.role_risk | transloco
            }}</app-badge>
          </p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ r.title }}
          </h1>
        </div>
        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button [entityType]="entityType" [entityId]="r.id" />
          <a [routerLink]="['/recruitment/requisitions', r.id, 'pipeline']">
            <app-button variant="secondary" size="sm">
              <app-icon name="people" [size]="15" />
              {{ 'recruitment.requisition.pipeline' | transloco }}
            </app-button>
          </a>
          @if (r.can_edit && !closed()) {
            <a [routerLink]="['/recruitment/requisitions', r.id, 'edit']">
              <app-button variant="secondary" size="sm">
                {{ 'recruitment.common.edit' | transloco }}
              </app-button>
            </a>
          }
          @for (action of actions(); track action) {
            <app-button
              size="sm"
              [variant]="actionVariant(action)"
              [loading]="busy() === action"
              [disabled]="busy() !== null"
              (click)="start(action)"
              [attr.data-testid]="'req-action-' + action"
            >
              {{ 'recruitment.requisition.actions.' + action | transloco }}
            </app-button>
          }
        </div>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="recruitment" page="requisition" />
          @if (r.status === 'rejected' && r.decision_note) {
            <app-alert tone="error">
              {{ 'recruitment.requisition.rejectedNote' | transloco: { note: r.decision_note } }}
            </app-alert>
          }
          @if (r.status === 'pending_approval') {
            <app-alert tone="info">
              @if (r.can_approve) {
                {{ 'recruitment.requisition.awaitingYou' | transloco }}
              } @else {
                {{ 'recruitment.requisition.awaitingApproval' | transloco }}
              }
            </app-alert>
          }

          <app-card>
            <dl class="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.department' | transloco }}</dt>
                <dd class="text-fg">{{ people.departmentName(r.department_id) ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.location' | transloco }}</dt>
                <dd class="text-fg">{{ r.location ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">
                  {{ 'recruitment.fields.employmentType' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ 'recruitment.employmentType.' + r.employment_type | transloco }}
                </dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.headcount' | transloco }}</dt>
                <dd class="text-fg">
                  {{
                    'recruitment.requisition.hiresOf'
                      | transloco: { hires: r.hires, headcount: r.headcount }
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-fg-subtle">
                  {{ 'recruitment.fields.targetStartDate' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ r.target_start_date ? (r.target_start_date | localDay) : '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-fg-subtle">
                  {{ 'recruitment.fields.postingClosesAt' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ r.posting_closes_at ? (r.posting_closes_at | localDate: 'medium') : '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.hiringManager' | transloco }}</dt>
                <dd class="text-fg">{{ r.hiring_manager?.name ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.recruiter' | transloco }}</dt>
                <dd class="text-fg">{{ r.recruiter?.name ?? '—' }}</dd>
              </div>
              @if (r.decided_by) {
                <div class="sm:col-span-2">
                  <dt class="text-fg-subtle">
                    {{ 'recruitment.requisition.decision' | transloco }}
                  </dt>
                  <dd class="text-fg">
                    {{
                      'recruitment.requisition.decidedBy'
                        | transloco
                          : { name: r.decided_by.name, date: (r.decided_at | localDate: 'medium') }
                    }}
                    @if (r.decision_note && r.status !== 'rejected') {
                      <span class="block text-fg-muted">{{ r.decision_note }}</span>
                    }
                  </dd>
                </div>
              }
            </dl>
          </app-card>

          @if (r.description || r.justification) {
            <app-card>
              @if (r.description) {
                <h2 class="mb-1 text-[13px] font-semibold text-fg-muted">
                  {{ 'recruitment.fields.description' | transloco }}
                </h2>
                <p class="mb-3 text-[13.5px] whitespace-pre-wrap text-fg">{{ r.description }}</p>
              }
              @if (r.justification) {
                <h2 class="mb-1 text-[13px] font-semibold text-fg-muted">
                  {{ 'recruitment.fields.justification' | transloco }}
                </h2>
                <p class="text-[13.5px] whitespace-pre-wrap text-fg">{{ r.justification }}</p>
              }
            </app-card>
          }

          <app-card>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[15px] font-bold text-fg">
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
              <p class="text-[13px] text-fg-muted">{{ 'recruitment.criteria.none' | transloco }}</p>
            } @else {
              <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px]">
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
                <ol class="flex list-decimal flex-col gap-2 pl-5 text-[13.5px]">
                  @for (q of questions(); track $index) {
                    <li>
                      @if (criterionLabel(q.criterion_id); as label) {
                        <span class="block text-[12px] font-semibold text-fg-subtle">{{
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
              <h3 class="mb-1 text-[13px] font-semibold text-fg-muted">
                {{ 'recruitment.requisition.requiredChecks' | transloco }}
              </h3>
              <div class="flex flex-wrap gap-1.5">
                @for (c of r.required_checks; track c) {
                  <app-badge tone="neutral">{{
                    'recruitment.checkType.' + c | transloco
                  }}</app-badge>
                }
              </div>
            </div>
          </app-card>

          <app-card>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[15px] font-bold text-fg">
                {{ 'recruitment.requisitionForm.postingSection' | transloco }}
              </h2>
              @if (r.can_edit && !closed()) {
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
            @if (r.posting_title || r.posting_text) {
              @if (r.posting_title) {
                <h3 class="mb-1 text-[14px] font-semibold text-fg">{{ r.posting_title }}</h3>
              }
              <p class="text-[13.5px] whitespace-pre-wrap text-fg">{{ r.posting_text }}</p>
            } @else {
              <p class="text-[13px] text-fg-muted">
                {{ 'recruitment.requisition.noPosting' | transloco }}
              </p>
            }
          </app-card>

          <app-card>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[15px] font-bold text-fg">
                {{ 'recruitment.requisition.pipelineSummary' | transloco }}
              </h2>
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
            <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              @for (stage of stages; track stage) {
                <li class="rounded-tile border border-border px-3 py-2">
                  <span class="block text-[12px] text-fg-subtle">{{
                    'recruitment.stage.' + stage | transloco
                  }}</span>
                  <span class="text-[16px] font-bold text-fg">{{
                    r.stage_counts[stage] ?? 0
                  }}</span>
                </li>
              }
            </ul>
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
          <app-supports-requirements [entityType]="entityType" [entityId]="r.id" />
          <app-why-it-matters scope="recruitment" page="requisition" />
          <app-recruitment-lesson-button lesson="screening-proportionate" />
        </ng-container>
      </app-record-detail-layout>

      <app-prompt-dialog
        [open]="noteDialog() !== null"
        [title]="noteTitle() | transloco"
        [message]="noteMessage() | transloco"
        [label]="'recruitment.requisition.note' | transloco"
        [required]="noteDialog()?.required ?? false"
        [busy]="busy() !== null"
        [confirmLabel]="noteTitle() | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        (confirmed)="confirmNote($event)"
        (cancelled)="pending.set(null)"
      />
      <app-confirm-dialog
        [open]="pending() === 'delete'"
        [title]="'recruitment.requisition.deleteTitle' | transloco"
        [message]="'recruitment.requisition.deleteMessage' | transloco: { code: r.code }"
        [confirmLabel]="'recruitment.requisition.actions.delete' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="busy() === 'delete'"
        (confirmed)="remove()"
        (cancelled)="pending.set(null)"
      />
    } @else {
      <p class="mx-auto max-w-[1180px] px-8 pt-8 text-[14px] text-fg-muted">
        {{ 'common.loading' | transloco }}
      </p>
    }
  `,
})
export class RequisitionDetailPage {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly people = inject(RecruitmentPeople);
  protected readonly perms = injectRecruitmentPerms();

  protected readonly entityType = ENTITY_REQUISITION;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly stages = STAGES;
  protected readonly statusTone = requisitionStatusTone;
  protected readonly riskTone = riskTone;

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });
  protected readonly req = signal<RequisitionDetail | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal<RequisitionAction | 'posting' | null>(null);
  protected readonly pending = signal<RequisitionAction | null>(null);
  protected readonly questions = signal<readonly SuggestedQuestion[]>([]);
  protected readonly jobAd = signal<string | null>(null);

  protected readonly closed = computed(() => {
    const r = this.req();
    return r !== null && isRequisitionClosed(r.status);
  });
  protected readonly actions = computed(() => {
    const r = this.req();
    return r ? requisitionActions(r, this.perms()) : [];
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
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const id = this.id();
      if (!orgId || !id) {
        return;
      }
      this.error.set(null);
      const sub = this.api.getRequisition(orgId, id).subscribe({
        next: (r) => this.req.set(r),
        error: (err) => this.error.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected actionVariant(action: RequisitionAction): 'primary' | 'secondary' | 'danger' {
    if (action === 'submit' || action === 'approve' || action === 'open') {
      return 'primary';
    }
    return action === 'reject' || action === 'delete' || action === 'cancel'
      ? 'danger'
      : 'secondary';
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

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
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { RecruitmentApi } from '../data/recruitment-api';
import {
  ApplicationAction,
  applicationActions,
  blankToNull,
  pendingRequiredChecks,
  stageTone,
} from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  ApplicationDetail,
  ENTITY_APPLICATION,
  MODULE_KEY,
  RequisitionDetail,
} from '../data/recruitment.models';
import { RecruitmentLessonButton } from '../shared/recruitment-lesson-button';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';
import { StageMove } from '../shared/stage-move';
import { ApplicationChecks } from './application-checks';
import { ApplicationInterviews } from './application-interviews';
import { ApplicationScorecards } from './application-scorecards';
import { ApplicationScreening } from './application-screening';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
];

type Pending = ApplicationAction | 'delete' | null;

/**
 * One candidate's application to one requisition: stage, structured screening,
 * interviews, scorecards, background checks, offer and hire. Visible only to the
 * hiring team (the API returns 404 to anyone else).
 */
@Component({
  selector: 'app-application-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    PromptDialog,
    RecruitmentLessonButton,
    StageMove,
    ApplicationChecks,
    ApplicationInterviews,
    ApplicationScorecards,
    ApplicationScreening,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as key) {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-alert>{{ key | transloco }}</app-alert>
        <a
          routerLink="/recruitment/applications"
          class="mt-3 inline-block text-[13px] font-semibold text-accent"
          >{{ 'recruitment.common.backToList' | transloco }}</a
        >
      </div>
    } @else if (app(); as a) {
      <app-record-detail-layout
        [entityType]="entityType"
        [entityId]="a.id"
        [tabs]="tabs"
        [canEdit]="a.can_edit"
        [backLink]="['/recruitment/requisitions', a.requisition_id, 'pipeline']"
        backLabelKey="recruitment.application.backToPipeline"
      >
        <div header>
          <p class="mb-1 flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-fg-subtle">{{ a.code }}</span>
            <app-badge [tone]="stageTone(a.stage)">{{
              'recruitment.stage.' + a.stage | transloco
            }}</app-badge>
            @if (a.offer_status !== 'none') {
              <app-badge tone="accent">{{
                'recruitment.offerStatus.' + a.offer_status | transloco
              }}</app-badge>
            }
          </p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            <a
              [routerLink]="['/recruitment/candidates', a.candidate_id]"
              class="hover:text-accent"
              >{{ a.candidate_name }}</a
            >
          </h1>
          <p class="mt-1 text-[13px] text-fg-muted">
            <a
              [routerLink]="['/recruitment/requisitions', a.requisition_id]"
              class="hover:text-accent"
              >{{ a.requisition_code }} · {{ a.requisition_title }}</a
            >
          </p>
        </div>
        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button [entityType]="entityType" [entityId]="a.id" />
          @if (perms().write && a.can_edit) {
            <app-stage-move
              [applicationId]="a.id"
              [stage]="a.stage"
              [name]="a.candidate_name"
              (moved)="app.set($event)"
            />
          }
          @for (action of actions(); track action) {
            <app-button
              size="sm"
              [variant]="action === 'decline' ? 'danger' : 'primary'"
              [disabled]="busy()"
              (click)="pending.set(action)"
              [attr.data-testid]="'app-action-' + action"
            >
              {{ 'recruitment.application.actions.' + action | transloco }}
            </app-button>
          }
          @if (perms().manage) {
            <app-button size="sm" variant="ghost" (click)="pending.set('delete')">
              {{ 'recruitment.common.delete' | transloco }}
            </app-button>
          }
        </div>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="recruitment" page="application" />
          @if (!a.privacy_notice_given) {
            <app-alert tone="info">
              {{ 'recruitment.application.noticeMissing' | transloco }}
              <a
                [routerLink]="['/recruitment/candidates', a.candidate_id]"
                class="font-semibold underline"
                >{{ 'recruitment.application.openCandidate' | transloco }}</a
              >
            </app-alert>
          }
          @if (a.stage === 'rejected' && a.rejection_reason) {
            <app-alert tone="error">
              {{
                'recruitment.application.rejectedBecause'
                  | transloco: { reason: reasonLabel(a.rejection_reason) }
              }}
              @if (a.rejection_note) {
                <span class="block">{{ a.rejection_note }}</span>
              }
            </app-alert>
          }
          @if (a.stage === 'offer' || a.hired_at) {
            <app-card>
              <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                {{ 'recruitment.offer.title' | transloco }}
              </h2>
              <dl class="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                <div>
                  <dt class="text-fg-subtle">{{ 'recruitment.fields.offerStatus' | transloco }}</dt>
                  <dd class="text-fg">
                    {{ 'recruitment.offerStatus.' + a.offer_status | transloco }}
                  </dd>
                </div>
                <div>
                  <dt class="text-fg-subtle">{{ 'recruitment.fields.startDate' | transloco }}</dt>
                  <dd class="text-fg">
                    {{ a.offer_start_date ? (a.offer_start_date | localDay) : '—' }}
                  </dd>
                </div>
                @if (a.offer_extended_at) {
                  <div>
                    <dt class="text-fg-subtle">{{ 'recruitment.offer.extendedAt' | transloco }}</dt>
                    <dd class="text-fg">{{ a.offer_extended_at | localDate: 'medium' }}</dd>
                  </div>
                }
                @if (a.offer_responded_at) {
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'recruitment.offer.respondedAt' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ a.offer_responded_at | localDate: 'medium' }}</dd>
                  </div>
                }
                @if (a.offer_note) {
                  <div class="sm:col-span-2">
                    <dt class="text-fg-subtle">{{ 'recruitment.fields.offerNote' | transloco }}</dt>
                    <dd class="whitespace-pre-wrap text-fg">{{ a.offer_note }}</dd>
                  </div>
                }
                @if (a.hired_at) {
                  <div class="sm:col-span-2">
                    <dt class="text-fg-subtle">{{ 'recruitment.offer.hiredAt' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ a.hired_at | localDate: 'medium' }}
                      @if (a.onboarding_task_id) {
                        ·
                        <a
                          [routerLink]="['/tasks', a.onboarding_task_id]"
                          class="font-semibold text-accent"
                          >{{ 'recruitment.offer.onboardingTask' | transloco }}</a
                        >
                      }
                    </dd>
                  </div>
                }
              </dl>
            </app-card>
          }

          <app-application-screening
            [app]="a"
            [canEdit]="perms().write && a.can_edit"
            (changed)="app.set($event)"
          />
          <app-application-interviews
            [applicationId]="a.id"
            [interviews]="a.interviews"
            [canEdit]="perms().write && a.can_edit"
            (changed)="reload()"
          />
          <app-application-scorecards
            [applicationId]="a.id"
            [criteria]="a.criteria"
            [scorecards]="a.scorecards"
            [interviews]="a.interviews"
            [userId]="userId()"
            [canFile]="a.team_roles.length > 0 || perms().manage"
            (changed)="reload()"
          />
          <app-application-checks
            [applicationId]="a.id"
            [checks]="a.checks"
            [required]="a.required_checks"
            [canEdit]="perms().write && a.can_edit"
            [canManage]="perms().manage"
            (changed)="reload()"
          />
        </div>

        <app-entity-tasks
          tasks
          [entityType]="entityType"
          [entityId]="a.id"
          [canCreate]="a.can_edit"
        />

        <ng-container aside>
          <app-card>
            <h2 class="mb-2 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
              {{ 'recruitment.application.facts' | transloco }}
            </h2>
            <dl class="flex flex-col gap-2 text-[13px]">
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.source' | transloco }}</dt>
                <dd class="text-fg">{{ 'recruitment.source.' + a.source | transloco }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">
                  {{ 'recruitment.application.appliedAt' | transloco }}
                </dt>
                <dd class="text-fg">{{ a.created_at | localDate }}</dd>
              </div>
              @if (a.stage_changed_at) {
                <div>
                  <dt class="text-fg-subtle">
                    {{ 'recruitment.application.stageSince' | transloco }}
                  </dt>
                  <dd class="text-fg">{{ a.stage_changed_at | localDate: 'medium' }}</dd>
                </div>
              }
              @if (a.team_roles.length > 0) {
                <div>
                  <dt class="text-fg-subtle">
                    {{ 'recruitment.application.yourRole' | transloco }}
                  </dt>
                  <dd class="text-fg">
                    @for (r of a.team_roles; track r; let last = $last) {
                      {{ 'recruitment.teamRole.' + r | transloco }}{{ last ? '' : ', ' }}
                    }
                  </dd>
                </div>
              }
            </dl>
          </app-card>
          <app-why-it-matters scope="recruitment" page="application" />
          <app-recruitment-lesson-button lesson="fair-screening" />
        </ng-container>
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="pending() === 'offer'"
        [title]="'recruitment.offer.extendTitle' | transloco"
        [message]="offerMessage() | transloco: { count: pendingChecks().length }"
        [confirmLabel]="'recruitment.application.actions.offer' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        confirmVariant="primary"
        [busy]="busy()"
        (confirmed)="extendOffer()"
        (cancelled)="pending.set(null)"
      >
        <div class="mt-3 flex flex-col gap-2">
          <label class="text-[13px] font-semibold text-fg-muted" for="offer-start">{{
            'recruitment.fields.startDate' | transloco
          }}</label>
          <input
            id="offer-start"
            type="date"
            class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
            [value]="offerStart()"
            (input)="offerStart.set($any($event.target).value)"
          />
          <label class="text-[13px] font-semibold text-fg-muted" for="offer-note">{{
            'recruitment.fields.offerNote' | transloco
          }}</label>
          <textarea
            id="offer-note"
            rows="3"
            maxlength="5000"
            class="rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent"
            [value]="offerNote()"
            (input)="offerNote.set($any($event.target).value)"
          ></textarea>
        </div>
      </app-confirm-dialog>

      <app-prompt-dialog
        [open]="pending() === 'accept' || pending() === 'decline'"
        [title]="'recruitment.application.actions.' + (pending() ?? 'accept') | transloco"
        [message]="'recruitment.offer.respondMessage' | transloco"
        [label]="'recruitment.requisition.note' | transloco"
        [busy]="busy()"
        [confirmVariant]="pending() === 'decline' ? 'danger' : 'primary'"
        [confirmLabel]="'recruitment.application.actions.' + (pending() ?? 'accept') | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        (confirmed)="respond($event)"
        (cancelled)="pending.set(null)"
      />

      <app-confirm-dialog
        [open]="pending() === 'hire'"
        [title]="'recruitment.offer.hireTitle' | transloco"
        [message]="'recruitment.offer.hireMessage' | transloco: { name: a.candidate_name }"
        [confirmLabel]="'recruitment.application.actions.hire' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        confirmVariant="primary"
        [busy]="busy()"
        (confirmed)="hire()"
        (cancelled)="pending.set(null)"
      />

      <app-confirm-dialog
        [open]="pending() === 'delete'"
        [title]="'recruitment.application.deleteTitle' | transloco"
        [message]="'recruitment.application.deleteMessage' | transloco: { code: a.code }"
        [confirmLabel]="'recruitment.common.delete' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="busy()"
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
export class ApplicationDetailPage {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly perms = injectRecruitmentPerms();
  private readonly auth = inject(AuthService);
  protected readonly userId = computed(() => this.auth.user()?.id ?? null);

  protected readonly entityType = ENTITY_APPLICATION;
  protected readonly tabs = TABS;
  protected readonly stageTone = stageTone;

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });
  protected readonly app = signal<ApplicationDetail | null>(null);
  protected readonly requisition = signal<RequisitionDetail | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly pending = signal<Pending>(null);
  protected readonly offerStart = signal('');
  protected readonly offerNote = signal('');
  private readonly version = signal(0);

  protected readonly actions = computed(() => {
    const a = this.app();
    if (!a || !this.perms().write) {
      return [];
    }
    return applicationActions(a, this.requisition()?.status === 'open');
  });
  protected readonly pendingChecks = computed(() => {
    const a = this.app();
    return a ? pendingRequiredChecks(a.required_checks, a.checks) : [];
  });
  protected readonly offerMessage = computed(() =>
    this.pendingChecks().length > 0
      ? 'recruitment.offer.extendBlocked'
      : 'recruitment.offer.extendMessage',
  );

  constructor() {
    // Ids only: candidate data is not sent to the assistant (it has no candidate tools).
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_APPLICATION,
      entityId: this.id(),
      view: 'detail',
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const id = this.id();
      this.version();
      if (!orgId || !id) {
        return;
      }
      const sub = this.api.getApplication(orgId, id).subscribe({
        next: (a) => {
          this.error.set(null);
          this.app.set(a);
        },
        error: (err) => this.error.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
    effect((onCleanup) => {
      const orgId = this.orgId();
      const reqId = this.app()?.requisition_id;
      if (!orgId || !reqId || this.requisition()?.id === reqId) {
        return;
      }
      const sub = this.api.getRequisition(orgId, reqId).subscribe({
        next: (r) => this.requisition.set(r),
        error: () => this.requisition.set(null),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }

  protected reasonLabel(reason: string): string {
    return this.language.translate(`recruitment.rejectionReason.${reason}`);
  }

  protected extendOffer(): void {
    const orgId = this.orgId();
    const a = this.app();
    if (orgId && a) {
      this.run(
        this.api.extendOffer(orgId, a.id, {
          start_date: this.offerStart() || null,
          note: blankToNull(this.offerNote()),
        }),
        'recruitment.offer.extended',
      );
    }
  }

  protected respond(note: string): void {
    const orgId = this.orgId();
    const a = this.app();
    const accepted = this.pending() === 'accept';
    if (orgId && a) {
      this.run(
        this.api.respondOffer(orgId, a.id, { accepted, note: blankToNull(note) }),
        accepted ? 'recruitment.offer.accepted' : 'recruitment.offer.declined',
      );
    }
  }

  protected hire(): void {
    const orgId = this.orgId();
    const a = this.app();
    if (orgId && a) {
      this.run(this.api.hire(orgId, a.id), 'recruitment.offer.hired');
    }
  }

  protected remove(): void {
    const orgId = this.orgId();
    const a = this.app();
    if (!orgId || !a) {
      return;
    }
    this.busy.set(true);
    this.api.deleteApplication(orgId, a.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.pending.set(null);
        this.toasts.success('recruitment.application.deleted', { code: a.code });
        void this.router.navigate(['/recruitment/requisitions', a.requisition_id, 'pipeline']);
      },
      error: (err) => {
        this.busy.set(false);
        this.pending.set(null);
        this.toasts.error(recruitmentError(err).key);
      },
    });
  }

  private run(call: Observable<ApplicationDetail>, messageKey: string): void {
    this.busy.set(true);
    call.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.pending.set(null);
        this.app.set(updated);
        this.toasts.success(messageKey);
      },
      error: (err) => {
        this.busy.set(false);
        this.pending.set(null);
        const e = recruitmentError(err);
        const types = e.detail['check_types'];
        this.toasts.error(e.key, {
          checks: Array.isArray(types)
            ? types.map((t) => this.language.translate(`recruitment.checkType.${t}`)).join(', ')
            : '',
        });
        this.reload();
      },
    });
  }
}

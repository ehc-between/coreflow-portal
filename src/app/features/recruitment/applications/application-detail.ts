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
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { Breadcrumb } from '../../../shared/ui/page-header/page-header';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RecruitmentApi } from '../data/recruitment-api';
import {
  ApplicationAction,
  applicationActions,
  blankToNull,
  needsScreening,
  offerBlockers,
  offerNeedsOverride,
  stageToneValue,
} from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  ApplicationDetail,
  ENTITY_APPLICATION,
  MODULE_KEY,
  OfferBlocker,
  RequisitionDetail,
} from '../data/recruitment.models';
import { injectConfirmedRefs } from '../shared/confirmed-refs';
import {
  RECRUITMENT_CRUMB,
  injectRecruitmentNav,
  settingsLinkFor,
} from '../shared/recruitment-nav';
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
 * One candidate's application to one requisition: one next step in the header
 * (offer, record the answer, hire; "Gi tilbud" is disabled with the reasons while
 * something blocks it), structured screening, interviews, scorecards, background
 * checks, the offer and the hand-off to People. Visible only to the hiring team
 * (the API returns 404 to anyone else). The record documents ISO 27001 A.6.1
 * (screening) and GDPR art. 13 for this candidate.
 */
@Component({
  selector: 'app-application-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
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
    LoadingState,
    ModuleNav,
    MenuItem,
    PromptDialog,
    StatusBadge,
    StageMove,
    ApplicationChecks,
    ApplicationInterviews,
    ApplicationScorecards,
    ApplicationScreening,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (errorKey(); as key) {
      <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
        <app-error-state [bodyKey]="key" (retry)="reload()" />
        <a
          routerLink="/recruitment/applications"
          class="mt-4 inline-block text-ui font-semibold text-accent"
          >{{ 'recruitment.common.backToList' | transloco }}</a
        >
      </div>
    } @else if (app(); as a) {
      <app-record-detail-layout
        [entityType]="entityType"
        [entityId]="a.id"
        [title]="a.candidate_name"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink()"
        [tabs]="tabs"
        [canEdit]="a.can_edit"
        [requirementsPanel]="true"
      >
        <span meta class="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="app-meta">
          <span class="font-mono font-semibold">{{ a.code }}</span>
          <span aria-hidden="true">·</span>
          <a
            [routerLink]="['/recruitment/requisitions', a.requisition_id]"
            class="hover:text-fg hover:underline"
            >{{ a.requisition_code }} · {{ a.requisition_title }}</a
          >
          <app-status-badge
            meaning="lifecycle"
            [value]="stageValue(a.stage)"
            [labelKey]="'recruitment.stage.' + a.stage"
            data-testid="app-stage"
          />
          @if (a.offer_status !== 'none') {
            <app-status-badge
              meaning="lifecycle"
              [value]="a.offer_status === 'declined' ? 'withdrawn' : 'pending'"
              [labelKey]="'recruitment.offerStatus.' + a.offer_status"
            />
          }
          @if (screeningIncomplete()) {
            <app-status-badge
              meaning="lifecycle"
              value="blocked"
              labelKey="recruitment.application.screeningIncomplete"
              data-testid="app-screening-incomplete"
            />
          }
        </span>

        @if (primary(); as action) {
          <app-button
            primary
            size="sm"
            [disabled]="busy() || (action === 'offer' && offerBlocked())"
            [title]="action === 'offer' && offerBlocked() ? blockerSummary() : ''"
            (click)="pending.set(action)"
            [attr.data-testid]="'app-action-' + action"
          >
            {{ 'recruitment.application.actions.' + action | transloco }}
          </app-button>
        }
        @if (actions().includes('decline')) {
          <app-button
            secondary
            size="sm"
            variant="secondary"
            [disabled]="busy()"
            (click)="pending.set('decline')"
            data-testid="app-action-decline"
          >
            {{ 'recruitment.application.actions.decline' | transloco }}
          </app-button>
        }
        @if (perms().write && a.can_edit) {
          <app-stage-move
            secondary
            [applicationId]="a.id"
            [stage]="a.stage"
            [name]="a.candidate_name"
            (moved)="onMoved()"
          />
        }
        <button overflow appMenuItem type="button" (click)="openCandidate()">
          {{ 'recruitment.application.openCandidate' | transloco }}
        </button>
        <button overflow appMenuItem type="button" (click)="openPipeline()">
          {{ 'recruitment.application.openPipeline' | transloco }}
        </button>
        @if (perms().manage) {
          <button
            overflow
            appMenuItem
            type="button"
            [danger]="true"
            (click)="pending.set('delete')"
            data-testid="app-delete"
          >
            {{ 'recruitment.application.delete' | transloco }}
          </button>
        }

        <app-module-nav nav [items]="nav()" labelKey="modules.names.recruitment" />
        <app-help-strip help scope="recruitment" page="application" lesson="fair-screening" />

        <div class="flex flex-col gap-4">
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
          @if (a.screening_override; as o) {
            <app-alert tone="info" data-testid="app-override">
              {{
                'recruitment.application.overrideNote'
                  | transloco
                    : {
                        name: o.by?.name ?? ('recruitment.common.someone' | transloco),
                        date: (o.at | localDate),
                      }
              }}
              @if (o.reason) {
                <span class="mt-1 block">{{
                  'recruitment.application.overrideReason' | transloco: { reason: o.reason }
                }}</span>
              }
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
          @if (primary() === 'offer' && blockers().length > 0) {
            <app-card data-testid="app-offer-blockers">
              <h2 class="mb-1 text-card font-bold text-fg">
                {{ 'recruitment.offerBlockers.title' | transloco }}
              </h2>
              <ul class="flex list-disc flex-col gap-1 pl-5 text-ui text-fg">
                @for (b of blockers(); track b.code) {
                  <li>
                    {{ blockerText(b) }}
                    @if (blockerAnchor(b); as anchor) {
                      <a
                        [href]="'#' + anchor"
                        class="ml-1 font-semibold text-accent"
                        (click)="scrollTo($event, anchor)"
                        >{{ 'recruitment.offerBlockers.go' | transloco }}</a
                      >
                    }
                  </li>
                }
              </ul>
              @if (offerNeedsOverride()) {
                <p class="mt-2 text-meta text-fg-muted">
                  {{ 'recruitment.offerBlockers.overrideHint' | transloco }}
                </p>
              }
            </app-card>
          }
          @if (a.stage === 'offer' || a.hired_at) {
            <app-card>
              <h2 class="mb-3 text-card font-bold text-fg">
                {{ 'recruitment.offer.title' | transloco }}
              </h2>
              <app-field-list>
                <app-field-item
                  labelKey="recruitment.fields.offerStatus"
                  [value]="'recruitment.offerStatus.' + a.offer_status | transloco"
                />
                <app-field-item
                  labelKey="recruitment.fields.startDate"
                  [value]="a.offer_start_date ? (a.offer_start_date | localDay) : null"
                />
                <app-field-item
                  labelKey="recruitment.offer.extendedAt"
                  [value]="a.offer_extended_at ? (a.offer_extended_at | localDate) : null"
                />
                <app-field-item
                  labelKey="recruitment.offer.respondedAt"
                  [value]="a.offer_responded_at ? (a.offer_responded_at | localDate) : null"
                />
                @if (a.offer_note) {
                  <app-field-item
                    labelKey="recruitment.fields.offerNote"
                    [value]="a.offer_note"
                    [wide]="true"
                    [multiline]="true"
                  />
                }
                @if (a.hired_at) {
                  <app-field-item
                    labelKey="recruitment.offer.hiredAt"
                    [value]="a.hired_at | localDate"
                  />
                  <app-field-item labelKey="recruitment.offer.employee" data-testid="app-employee">
                    @if (employeeRef(); as ref) {
                      <app-entity-chip [ref]="ref" />
                    }
                  </app-field-item>
                  <app-field-item labelKey="recruitment.offer.onboardingTask">
                    @if (a.onboarding_task_id) {
                      <a
                        [routerLink]="['/tasks', a.onboarding_task_id]"
                        class="font-semibold text-accent"
                        >{{ 'recruitment.offer.openOnboarding' | transloco }}</a
                      >
                    }
                  </app-field-item>
                }
              </app-field-list>
              @if (a.hired_at && !a.employee) {
                <p class="mt-3 text-meta text-fg-muted">
                  {{ 'recruitment.offer.noEmployee' | transloco }}
                </p>
              }
            </app-card>
          }

          <app-application-screening
            id="app-screening"
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
            id="app-checks"
            [applicationId]="a.id"
            [stage]="a.stage"
            [checks]="a.checks"
            [required]="a.required_checks"
            [summary]="a.checks_summary ?? null"
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
            <h2 class="mb-3 text-card font-bold text-fg">
              {{ 'recruitment.application.facts' | transloco }}
            </h2>
            <app-field-list [columns]="1">
              <app-field-item
                labelKey="recruitment.fields.source"
                [value]="'recruitment.source.' + a.source | transloco"
              />
              <app-field-item
                labelKey="recruitment.application.appliedAt"
                [value]="a.created_at | localDate"
              />
              <app-field-item
                labelKey="recruitment.application.stageSince"
                [value]="a.stage_changed_at ? (a.stage_changed_at | localDate) : null"
              />
              <app-field-item labelKey="recruitment.application.yourRole" empty="none">
                @for (r of a.team_roles; track r; let last = $last) {
                  {{ 'recruitment.teamRole.' + r | transloco }}{{ last ? '' : ', ' }}
                }
              </app-field-item>
            </app-field-list>
          </app-card>
          <div class="flex justify-start">
            <app-watch-button [entityType]="entityType" [entityId]="a.id" />
          </div>
        </ng-container>
        <app-why-it-matters aside-learn scope="recruitment" page="application" />
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="pending() === 'offer'"
        [title]="'recruitment.offer.extendTitle' | transloco"
        [message]="'recruitment.offer.extendMessage' | transloco"
        [confirmLabel]="'recruitment.application.actions.offer' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        confirmVariant="primary"
        [busy]="busy()"
        [confirmDisabled]="offerNeedsOverride() && !overrideReason().trim()"
        (confirmed)="extendOffer()"
        (cancelled)="pending.set(null)"
      >
        <div class="mt-3 flex flex-col gap-2">
          <label class="text-ui font-semibold text-fg-muted" for="offer-start">{{
            'recruitment.fields.startDate' | transloco
          }}</label>
          <input
            id="offer-start"
            type="date"
            class="h-10 rounded-tile border border-border bg-bg px-3 text-body text-fg outline-none focus:border-accent"
            [value]="offerStart()"
            (input)="offerStart.set($any($event.target).value)"
          />
          <label class="text-ui font-semibold text-fg-muted" for="offer-note">{{
            'recruitment.fields.offerNote' | transloco
          }}</label>
          <textarea
            id="offer-note"
            rows="3"
            maxlength="5000"
            class="rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg outline-none focus:border-accent"
            [value]="offerNote()"
            (input)="offerNote.set($any($event.target).value)"
          ></textarea>
          @if (offerNeedsOverride()) {
            <label class="text-ui font-semibold text-fg-muted" for="offer-override">
              {{ 'recruitment.move.overrideLabel' | transloco }}
              <span class="text-fail" aria-hidden="true">*</span>
            </label>
            <p class="text-meta text-fg-muted">
              {{ 'recruitment.offerBlockers.overrideHint' | transloco }}
            </p>
            <textarea
              id="offer-override"
              rows="3"
              maxlength="2000"
              required
              class="rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg outline-none focus:border-accent"
              [value]="overrideReason()"
              (input)="overrideReason.set($any($event.target).value)"
            ></textarea>
          }
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
        [confirmLabel]="'recruitment.application.delete' | transloco"
        [cancelLabel]="'recruitment.common.keep' | transloco"
        [busy]="busy()"
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
export class ApplicationDetailPage {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly perms = injectRecruitmentPerms();
  protected readonly nav = injectRecruitmentNav(this.perms);
  protected readonly settingsLink = computed(() => settingsLinkFor(this.perms()));
  private readonly auth = inject(AuthService);
  protected readonly userId = computed(() => this.auth.user()?.id ?? null);

  protected readonly entityType = ENTITY_APPLICATION;
  protected readonly tabs = TABS;
  protected readonly stageValue = stageToneValue;

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });
  protected readonly app = signal<ApplicationDetail | null>(null);
  protected readonly requisition = signal<RequisitionDetail | null>(null);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly pending = signal<Pending>(null);
  protected readonly offerStart = signal('');
  protected readonly offerNote = signal('');
  protected readonly overrideReason = signal('');
  private readonly version = signal(0);
  private readonly refs = injectConfirmedRefs(ENTITY_APPLICATION, this.id);

  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => [
    RECRUITMENT_CRUMB,
    { labelKey: 'recruitment.nav.applications', link: '/recruitment/applications' },
    { label: this.app()?.candidate_name ?? '' },
  ]);
  protected readonly actions = computed(() => {
    const a = this.app();
    if (!a || !this.perms().write) {
      return [];
    }
    return applicationActions(a, (this.requisition()?.status ?? 'open') === 'open');
  });
  protected readonly primary = computed<ApplicationAction | null>(() => {
    const actions = this.actions();
    return actions.find((a) => a !== 'decline') ?? null;
  });
  protected readonly blockers = computed(() => {
    const a = this.app();
    return a ? offerBlockers(a) : [];
  });
  protected readonly offerNeedsOverride = computed(() => offerNeedsOverride(this.blockers()));
  /** The offer button is disabled while anything other than unfinished screening blocks it. */
  protected readonly offerBlocked = computed(
    () => this.blockers().length > 0 && !this.offerNeedsOverride(),
  );
  protected readonly blockerSummary = computed(() =>
    this.blockers()
      .map((b) => this.blockerText(b))
      .join(' · '),
  );
  protected readonly screeningIncomplete = computed(() => {
    const a = this.app();
    return (
      !!a &&
      (a.screening_missing?.length ?? 0) > 0 &&
      !a.screening_override &&
      needsScreening(a.stage)
    );
  });
  protected readonly employeeRef = computed(() => {
    const e = this.app()?.employee;
    return e
      ? { entity_type: 'employee', entity_id: e.id, title: e.title, code: e.code, url: e.url }
      : null;
  });

  constructor() {
    // Ids only: candidate data is not sent to the assistant (assist-only policy).
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_APPLICATION,
      entityId: this.id(),
      view: 'detail',
      title: this.app()?.code ?? null,
      requirements: this.refs(),
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
          this.errorKey.set(null);
          this.app.set(a);
        },
        error: (err) => this.errorKey.set(recruitmentError(err).key),
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

  protected onMoved(): void {
    this.reload();
  }

  protected openCandidate(): void {
    const a = this.app();
    if (a) {
      void this.router.navigate(['/recruitment/candidates', a.candidate_id]);
    }
  }

  protected openPipeline(): void {
    const a = this.app();
    if (a) {
      void this.router.navigate(['/recruitment/requisitions', a.requisition_id, 'pipeline']);
    }
  }

  protected reasonLabel(reason: string): string {
    return this.language.translate(`recruitment.rejectionReason.${reason}`);
  }

  protected blockerText(b: OfferBlocker): string {
    const types = (b.check_types ?? [])
      .map((t) => this.language.translate(`recruitment.checkType.${t}`))
      .join(', ');
    const count = b.count ?? b.missing?.length ?? b.check_types?.length ?? 0;
    const key = `recruitment.offerBlockers.${b.code}`;
    const text = this.language.translate(key, {
      count,
      checks: types,
      status: b.status ? this.language.translate(`recruitment.requisitionStatus.${b.status}`) : '',
    });
    return text === key ? this.language.translate('recruitment.offerBlockers.other') : text;
  }

  protected blockerAnchor(b: OfferBlocker): string | null {
    if (b.code === 'screening_incomplete') {
      return 'app-screening';
    }
    return b.code.startsWith('checks_') ? 'app-checks' : null;
  }

  protected scrollTo(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  protected extendOffer(): void {
    const orgId = this.orgId();
    const a = this.app();
    if (orgId && a) {
      const reason = blankToNull(this.overrideReason());
      this.run(
        this.api.extendOffer(orgId, a.id, {
          start_date: this.offerStart() || null,
          note: blankToNull(this.offerNote()),
          ...(this.offerNeedsOverride() && reason ? { override_reason: reason } : {}),
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
        this.overrideReason.set('');
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

import {
  ChangeDetectionStrategy,
  Component,
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
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
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
  pendingRequiredChecks,
  requisitionToneValue,
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
import { RECRUITMENT_CRUMB, settingsLinkFor } from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';
import { StageMove } from '../shared/stage-move';
import { ApplicationChecks } from './application-checks';
import { ApplicationInterviews } from './application-interviews';
import { ApplicationScorecards } from './application-scorecards';
import { ApplicationScreening } from './application-screening';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'tasks',
  'comments',
  'attachments',
];

type Pending = ApplicationAction | 'delete' | null;

/**
 * One candidate's application to one requisition, on the detail-page anatomy
 * (docs/ux-guide.md §2.7): one next step in the header (offer, record the answer,
 * hire; "Gi tilbud" is disabled while something blocks it) and the screening summary
 * in "Spør KI"; "Hovedinformasjon" with a status sentence, the requisition and the
 * candidate (linked), screening and background-check progress and the offer; the
 * work sections (offer, screening, interviews, scorecards, checks) under the details;
 * one "Oppfølging" card listing what blocks the offer (each line jumps to its place),
 * the requirements, the connections (with the People record after a hire) and the
 * metadata. Visible only to the hiring team (the API returns 404 to anyone else). The
 * record documents ISO 27001 A.6.1 (screening) and GDPR art. 13 for this candidate.
 */
@Component({
  selector: 'app-application-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    RecordDetailLayout,
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
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
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
        [anatomy]="true"
        [entityType]="entityType"
        [entityId]="a.id"
        [title]="a.candidate_name"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink()"
        [tabs]="tabs"
        [canEdit]="a.can_edit"
        [requirementsPanel]="true"
        [missing]="missing()"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="app-meta">{{ a.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'recruitment.detail.app.type' | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="stageValue(a.stage)"
            [labelKey]="'recruitment.stage.' + a.stage"
            data-testid="app-stage"
          />
        </ng-container>

        @if (primary(); as action) {
          <app-button
            primary
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
        @if (perms().write && a.can_edit && a.criteria.length > 0) {
          <button appMenuItem ask type="button" data-testid="ask-summarise" (click)="summarise()">
            <app-icon name="spark" [size]="15" />
            {{ 'recruitment.ai.summarise' | transloco }}
          </button>
        }

        <app-help-strip help scope="recruitment" page="application" lesson="fair-screening" />

        <app-record-lead record-lead>
          <app-record-status-line status [tone]="status().tone" data-testid="app-status-line">
            {{ status().text }}
          </app-record-status-line>
          <app-field-item size="lead" labelKey="recruitment.detail.app.requisition">
            <a
              [routerLink]="['/recruitment/requisitions', a.requisition_id]"
              class="group inline-flex max-w-full items-start gap-2"
              data-testid="app-requisition-link"
            >
              <app-icon name="userplus" [size]="18" class="mt-1 flex-none text-fg-muted" />
              <span class="min-w-0">
                <span class="font-mono text-meta text-fg-muted">{{ a.requisition_code }}</span>
                <span class="block font-semibold group-hover:text-accent group-hover:underline">{{
                  a.requisition_title
                }}</span>
                @if (requisition()?.status; as rs) {
                  <app-status-badge
                    class="mt-1 inline-block"
                    meaning="lifecycle"
                    [value]="requisitionTone(rs)"
                    [labelKey]="'recruitment.requisitionStatus.' + rs"
                  />
                }
              </span>
            </a>
          </app-field-item>
          <app-field-item size="lead" labelKey="recruitment.detail.app.candidate">
            <a
              [routerLink]="['/recruitment/candidates', a.candidate_id]"
              class="group inline-flex max-w-full items-start gap-2"
              data-testid="app-candidate-link"
            >
              <app-icon name="people" [size]="18" class="mt-1 flex-none text-fg-muted" />
              <span class="min-w-0">
                <span class="font-mono text-meta text-fg-muted">{{ a.candidate_code }}</span>
                <span class="block font-semibold group-hover:text-accent group-hover:underline">{{
                  a.candidate_name
                }}</span>
                @if (!a.privacy_notice_given) {
                  <app-status-badge
                    class="mt-1 inline-block"
                    meaning="lifecycle"
                    value="blocked"
                    labelKey="recruitment.candidates.noticeMissing"
                  />
                }
              </span>
            </a>
          </app-field-item>
          <app-field-item
            size="lead"
            labelKey="recruitment.screening.title"
            data-testid="app-lead-screening"
          >
            @if (a.criteria.length === 0) {
              <span class="text-fg-muted">{{
                'recruitment.detail.app.noCriteria' | transloco
              }}</span>
            } @else {
              <a
                href="#app-screening"
                class="hover:text-accent hover:underline"
                [class.text-warn-ink]="screeningIncomplete()"
                (click)="scrollTo($event, 'app-screening')"
                >{{ 'recruitment.screening.progress' | transloco: screening() }}</a
              >
            }
            @if (a.screening_override; as o) {
              <span class="mt-1 block text-ui text-fg-muted" data-testid="app-override">
                {{
                  'recruitment.application.overrideNote'
                    | transloco
                      : {
                          name: o.by?.name ?? ('recruitment.common.someone' | transloco),
                          date: (o.at | localDate),
                        }
                }}
                @if (o.reason) {
                  {{ 'recruitment.application.overrideReason' | transloco: { reason: o.reason } }}
                }
              </span>
            } @else if (primary() === 'offer' && offerNeedsOverride()) {
              <span class="mt-1 block text-ui text-fg-muted">{{
                'recruitment.offerBlockers.overrideHint' | transloco
              }}</span>
            }
          </app-field-item>
          <app-field-item
            size="lead"
            labelKey="recruitment.detail.app.checks"
            data-testid="app-lead-checks"
          >
            @if (checks().total === 0) {
              <span class="text-fg-muted">{{ 'recruitment.detail.app.noChecks' | transloco }}</span>
            } @else {
              <a
                href="#app-checks"
                class="hover:text-accent hover:underline"
                [class.text-warn-ink]="checks().done < checks().total"
                (click)="scrollTo($event, 'app-checks')"
                >{{ 'recruitment.detail.app.checksDone' | transloco: checks() }}</a
              >
            }
          </app-field-item>
          @if (a.offer_status !== 'none' || a.hired_at) {
            <app-field-item size="lead" [wide]="true" labelKey="recruitment.offer.title">
              {{ 'recruitment.offerStatus.' + a.offer_status | transloco }}
              @if (a.offer_start_date) {
                ·
                {{
                  'recruitment.detail.app.startsOn'
                    | transloco: { date: (a.offer_start_date | localDay) }
                }}
              }
            </app-field-item>
          }
        </app-record-lead>

        <div class="flex flex-col gap-4">
          @if (a.stage === 'offer' || a.hired_at) {
            <app-card>
              <h2 class="mb-3 font-display text-card font-bold text-fg">
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

        <div tasks>
          <app-entity-tasks [entityType]="entityType" [entityId]="a.id" [canCreate]="a.can_edit" />
        </div>

        @if (a.onboarding_task_id) {
          <a
            follow-up-connections
            [routerLink]="['/tasks', a.onboarding_task_id]"
            class="mt-3 inline-block text-ui font-semibold text-accent hover:underline"
            data-testid="app-onboarding"
            >{{ 'recruitment.offer.openOnboarding' | transloco }} →</a
          >
        }

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="recruitment.fields.source"
            [value]="'recruitment.source.' + a.source | transloco"
          />
          <app-field-item
            layout="inline"
            labelKey="recruitment.application.appliedAt"
            [value]="a.created_at | localDate"
          />
          <app-field-item
            layout="inline"
            labelKey="recruitment.application.stageSince"
            [value]="a.stage_changed_at ? (a.stage_changed_at | localDate) : null"
          />
          <app-field-item layout="inline" labelKey="recruitment.application.yourRole">
            @for (r of a.team_roles; track r; let last = $last) {
              {{ 'recruitment.teamRole.' + r | transloco }}{{ last ? '' : ', ' }}
            }
          </app-field-item>
        </app-record-meta>

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
  protected readonly settingsLink = computed(() => settingsLinkFor(this.perms()));
  private readonly auth = inject(AuthService);
  protected readonly userId = computed(() => this.auth.user()?.id ?? null);

  protected readonly entityType = ENTITY_APPLICATION;
  protected readonly tabs = TABS;
  protected readonly stageValue = stageToneValue;
  protected readonly requisitionTone = requisitionToneValue;
  private readonly screeningCard = viewChild(ApplicationScreening);

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
  /** Criteria with a result, out of all. */
  protected readonly screening = computed(() => {
    const a = this.app();
    const total = a?.criteria.length ?? 0;
    const missing = a?.screening_missing?.length;
    const done =
      missing !== undefined
        ? total - missing
        : (a?.screening.filter((s) => s.result !== 'unknown').length ?? 0);
    return { done: Math.max(0, done), total };
  });
  /** Required background checks that are settled, out of all required. */
  protected readonly checks = computed(() => {
    const a = this.app();
    if (!a) {
      return { done: 0, total: 0 };
    }
    const types = new Set([
      ...a.required_checks,
      ...a.checks.filter((c) => c.required).map((c) => c.check_type),
    ]);
    const open = pendingRequiredChecks(a.required_checks, a.checks).length;
    return { done: types.size - open, total: types.size };
  });
  /** The status sentence: where the application is and what it waits for. */
  protected readonly status = computed<{ tone: StatusLineTone; text: string }>(() => {
    const a = this.app();
    if (!a) {
      return { tone: 'neutral', text: '' };
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(`recruitment.detail.app.status.${key}`, params);
    const stage = this.language.translate(`recruitment.stage.${a.stage}`);
    switch (a.stage) {
      case 'hired':
        return { tone: 'pass', text: t(a.employee ? 'hiredPeople' : 'hired') };
      case 'rejected': {
        const reason = a.rejection_reason ? this.reasonLabel(a.rejection_reason) : '';
        const note = a.rejection_note ? ` ${a.rejection_note}` : '';
        return {
          tone: 'neutral',
          text: t(reason ? 'rejected' : 'rejectedPlain', { reason }) + note,
        };
      }
      case 'withdrawn':
        return { tone: 'neutral', text: t('withdrawn') };
      case 'offer':
        return a.offer_status === 'accepted'
          ? { tone: 'warn', text: t('offerAccepted') }
          : { tone: 'warn', text: t('offerExtended') };
    }
    const count = this.primary() === 'offer' ? this.blockers().length : 0;
    if (count > 0) {
      return { tone: 'warn', text: t(count === 1 ? 'blockedOne' : 'blocked', { stage, count }) };
    }
    return this.primary() === 'offer'
      ? { tone: 'pass', text: t('ready', { stage }) }
      : { tone: 'neutral', text: t('active', { stage }) };
  });
  /** "Oppfølging": what blocks the offer, each line jumping to its place. */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const a = this.app();
    if (!a) {
      return [];
    }
    const items: RecordMissingItem[] = [];
    if (!a.privacy_notice_given) {
      items.push({
        key: 'notice',
        labelKey: 'recruitment.detail.app.missing.notice',
        link: ['/recruitment/candidates', a.candidate_id],
      });
    }
    if (this.primary() === 'offer') {
      for (const b of this.blockers()) {
        if (b.code === 'privacy_notice_missing') {
          continue;
        }
        const anchor = this.blockerAnchor(b);
        items.push({
          key: b.code,
          labelKey: 'recruitment.detail.app.missing.text',
          params: { text: this.blockerText(b) },
          ...(anchor
            ? { action: () => this.jumpTo(anchor) }
            : b.code === 'requisition_not_open'
              ? { link: ['/recruitment/requisitions', a.requisition_id] }
              : { action: () => this.jumpTo('app-screening') }),
        });
      }
    }
    return items;
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
    this.jumpTo(id);
  }

  private jumpTo(id: string): void {
    document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  /** "Spør KI": summarise the application against the criteria, in the screening card. */
  protected summarise(): void {
    this.screeningCard()?.summarise();
    this.jumpTo('app-screening');
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

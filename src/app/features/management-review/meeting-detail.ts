import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AssigneeIn } from '../../core/tasks/task.models';
import { AskPanelService } from '../ask/ask-panel.service';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip, EntityChipRef } from '../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../shared/kit/record-detail-layout';
import {
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../shared/kit/record-sections';
import { LocalDatePipe, formatLocalDate } from '../../shared/locale/locale-pipes';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { MeetingWorkspace } from './components/meeting-workspace';
import { ManagementReviewApi } from './data/management-review-api';
import { mrErrorKey } from './data/management-review-errors';
import { MeetingDetail } from './data/management-review.models';
import {
  MR_MODULE,
  MR_PERMISSIONS,
  MR_SCOPE,
  MR_SETTINGS_LINK,
  meetingKindKey,
  meetingStatusKey,
  mrCrumbs,
  toneValue,
} from './management-review-display';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Snapshot field -> label key, for the revisions tab. */
export const MEETING_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'managementReview.fields.title',
  kind: 'managementReview.fields.kind',
  purpose: 'managementReview.fields.purpose',
  location: 'managementReview.fields.location',
  scheduled_at: 'managementReview.fields.scheduledAt',
  duration_minutes: 'managementReview.fields.duration',
  chair_user_id: 'managementReview.fields.chair',
  secretary_user_id: 'managementReview.fields.secretary',
  status: 'managementReview.fields.status',
  minutes: 'managementReview.minutes.label',
  minutes_status: 'managementReview.fields.minutesStatus',
  agenda: 'managementReview.agenda.title',
};

/** The status sentence of a meeting's "Hovedinformasjon" (docs/ux-guide.md §2.7). */
export function meetingStatusSentence(
  m: MeetingDetail,
  date: (value: string | null | undefined) => string,
): { key: string; params: Record<string, unknown>; tone: StatusLineTone } {
  const base = 'managementReview.meetingLead.status.';
  switch (m.status) {
    case 'planned':
      return m.scheduled_at
        ? { key: `${base}planned`, params: { date: date(m.scheduled_at) }, tone: 'info' }
        : { key: `${base}plannedNoDate`, params: {}, tone: 'warn' };
    case 'in_progress':
      return { key: `${base}in_progress`, params: {}, tone: 'warn' };
    case 'completed':
      return m.minutes_status === 'approved'
        ? {
            key: `${base}approved`,
            params: {
              name: m.minutes_approved_by?.name ?? '—',
              date: date(m.minutes_approved_at),
            },
            tone: 'pass',
          }
        : { key: `${base}completed`, params: {}, tone: 'warn' };
    default:
      return { key: `${base}cancelled`, params: {}, tone: 'neutral' };
  }
}

/** What the meeting still needs ("Oppfølging"); each line opens the card that fixes it. */
export function meetingMissing(
  m: MeetingDetail,
  scrollTo: (anchor: string) => void,
  editLink: readonly unknown[],
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (m.status === 'cancelled') {
    return items;
  }
  if (m.can_edit && !m.scheduled_at) {
    items.push({
      key: 'when',
      labelKey: 'managementReview.meetingLead.missing.when',
      link: editLink,
    });
  }
  if (m.can_edit && !m.chair) {
    items.push({
      key: 'chair',
      labelKey: 'managementReview.meetingLead.missing.chair',
      link: editLink,
    });
  }
  if (m.status === 'completed' && m.minutes_status !== 'approved') {
    items.push({
      key: 'minutes',
      labelKey: 'managementReview.meetingLead.missing.minutes',
      action: () => scrollTo('mr-meeting-minutes'),
    });
  }
  const noTask = m.decisions.filter((d) => d.follow_up_missing).length;
  if (noTask > 0) {
    items.push({
      key: 'tasks',
      labelKey: 'managementReview.meetingLead.missing.tasks',
      params: { count: noTask },
      action: () => scrollTo('mr-meeting-decisions'),
    });
  }
  return items;
}

/**
 * What the meeting concerns, as chips: its review first (a review meeting belongs to
 * one), then the records it is linked to ("Gjelder").
 */
export function meetingConcerns(m: MeetingDetail): EntityChipRef[] {
  const refs: EntityChipRef[] = [];
  if (m.review) {
    refs.push({
      entity_type: 'management_review',
      entity_id: m.review.id,
      title: m.review.title,
      code: m.review.code,
      url: m.review.url,
      status: m.review.status,
      module: MR_MODULE,
    });
  }
  for (const r of m.related ?? []) {
    refs.push(r);
  }
  return refs;
}

/**
 * `/management-review/meetings/:id`: a meeting with minutes — what it concerns
 * ("Gjelder"), time and place, the agenda, attendees and attendance, minutes
 * (drafted with AI and approved by the chair; final once approved), decisions
 * with their follow-up tasks and the records they concern — plus the shared
 * record tabs. A management review meeting links back to its review; a safety
 * committee (AMU) meeting explains what the Working Environment Act expects.
 */
@Component({
  selector: 'app-mr-meeting-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    TourStepDirective,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    EntityTasks,
    Alert,
    Button,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    MeetingWorkspace,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[880px] px-4 pt-7 sm:px-8">
          <app-error-state
            titleKey="managementReview.common.notFoundTitle"
            bodyKey="managementReview.common.notFound"
            (retry)="reload()"
          />
          <a
            routerLink="/management-review/meetings"
            class="mt-3 inline-flex min-h-6 items-center text-ui font-semibold text-accent"
          >
            {{ 'managementReview.common.backToMeetings' | transloco }}
          </a>
        </div>
      }
      @case ('ready') {
        @if (meeting(); as m) {
          <app-record-detail-layout
            [anatomy]="true"
            entityType="meeting"
            [entityId]="m.id"
            [title]="m.title"
            [breadcrumbs]="crumbs()"
            [settingsLink]="settingsLink"
            [tabs]="tabs"
            [canEdit]="m.can_edit"
            [fieldLabels]="fieldLabels"
            [requirementsPanel]="true"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ m.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ kindKey(m.kind) | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="tone(m.status)"
                [labelKey]="statusKey(m.status)"
              />
            </ng-container>

            @if (m.can_edit) {
              <app-button primary data-testid="meeting-edit" (click)="edit()">
                {{ 'managementReview.detail.edit' | transloco }}
              </app-button>
            }
            @if (canDelete()) {
              <button appMenuItem overflow [danger]="true" (click)="confirmDelete.set(true)">
                {{ 'managementReview.meeting.delete' | transloco }}
              </button>
            }
            <button appMenuItem ask type="button" (click)="askSummary()">
              <app-icon name="spark" [size]="15" />
              {{ 'managementReview.ai.summariseMeeting' | transloco }}
            </button>

            <app-help-strip
              help
              [scope]="scope"
              page="meetingDetail"
              tour="meetingDetail"
              lesson="good-minutes"
            />

            <!-- §2.7 Hovedinformasjon: where the meeting stands, when and where, why,
                 what it concerns and what was decided. -->
            <app-record-lead record-lead data-testid="meeting-lead">
              <app-record-status-line
                status
                [tone]="statusSentence().tone"
                data-testid="meeting-status-line"
              >
                {{ statusSentence().key | transloco: statusSentence().params }}
              </app-record-status-line>
              <app-field-item size="lead" labelKey="managementReview.meetingLead.when">
                @if (m.scheduled_at || m.location) {
                  @if (m.scheduled_at) {
                    {{ m.scheduled_at | localDate }}
                    @if (m.duration_minutes) {
                      ·
                      {{ 'managementReview.common.minutes' | transloco: { n: m.duration_minutes } }}
                    }
                  }
                  @if (m.location) {
                    <span class="block text-ui text-fg-muted">{{ m.location }}</span>
                  }
                }
              </app-field-item>
              <app-field-item
                size="lead"
                labelKey="managementReview.meetingLead.purpose"
                [value]="m.purpose"
                [multiline]="true"
              />
              <app-field-item
                size="lead"
                labelKey="managementReview.meetingLead.concerns"
                [wide]="true"
              >
                @if (concerns().length) {
                  <ul class="flex flex-col gap-2" data-testid="meeting-related">
                    @for (ref of concerns(); track ref.entity_type + ref.entity_id) {
                      <li
                        [attr.data-testid]="
                          ref.entity_type === 'management_review' ? 'review-link' : null
                        "
                      >
                        <app-entity-chip [ref]="ref" [statusText]="true" />
                      </li>
                    }
                  </ul>
                }
              </app-field-item>
              @if (decisionCounts(); as c) {
                <app-field-item
                  size="lead"
                  labelKey="managementReview.meetingLead.decisions"
                  [wide]="true"
                >
                  <a
                    href="#mr-meeting-decisions"
                    class="font-semibold text-accent hover:underline"
                    data-testid="meeting-decision-count"
                    (click)="$event.preventDefault(); scrollTo('mr-meeting-decisions')"
                    >{{ 'managementReview.meetingLead.decisionCount' | transloco: c }}</a
                  >
                </app-field-item>
              }
            </app-record-lead>

            <div class="flex flex-col gap-4">
              @if (m.kind === 'safety') {
                <app-alert tone="info" data-testid="amu-hint">{{
                  'managementReview.meeting.amuHint' | transloco
                }}</app-alert>
              }

              <app-mr-meeting-workspace
                appTourStep="mtg-workspace"
                [meeting]="m"
                [canManage]="canManage()"
                (changed)="meeting.set($event)"
              />
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="m.review ? 'management_review' : 'meeting'"
                [entityId]="m.review ? m.review.id : m.id"
                [canCreate]="m.can_edit"
                [defaultAssignee]="defaultAssignee()"
                [entityLabel]="
                  m.review ? m.review.code + ' ' + m.review.title : m.code + ' ' + m.title
                "
              />
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="managementReview.fields.chair"
                [value]="m.chair?.name ?? null"
              />
              <app-field-item
                layout="inline"
                labelKey="managementReview.fields.secretary"
                [value]="m.secretary?.name ?? null"
              />
              <app-field-item
                layout="inline"
                labelKey="managementReview.meetingLead.updated"
                [value]="m.updated_at | localDate"
              />
            </app-record-meta>

            <app-why-it-matters aside-learn [scope]="scope" page="meetingDetail" />
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'managementReview.meeting.deleteTitle' | transloco"
            [message]="'managementReview.meeting.deleteMessage' | transloco: { code: m.code }"
            [confirmLabel]="'managementReview.meeting.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class MeetingDetailPage {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly id = input.required<string>();

  protected readonly scope = MR_SCOPE;
  protected readonly settingsLink = MR_SETTINGS_LINK;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = MEETING_FIELD_LABELS;
  protected readonly statusKey = meetingStatusKey;
  protected readonly tone = toneValue;
  protected readonly kindKey = meetingKindKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly meeting = signal<MeetingDetail | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly busy = signal(false);

  protected readonly crumbs = computed(() =>
    mrCrumbs(
      { labelKey: 'managementReview.nav.meetings', link: '/management-review/meetings' },
      { label: this.meeting()?.code ?? '' },
    ),
  );
  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(MR_PERMISSIONS.manage),
  );
  /** Review meetings are removed with their review (the API answers 409 `meeting_in_review`). */
  protected readonly canDelete = computed(() => this.canManage() && !this.meeting()?.review);
  protected readonly defaultAssignee = computed<AssigneeIn | null>(() => {
    const chair = this.meeting()?.chair;
    return chair ? { type: 'user', value: chair.id } : null;
  });

  protected readonly statusSentence = computed(() => {
    const m = this.meeting();
    const locale = this.language.locale();
    return m
      ? meetingStatusSentence(m, (v) => formatLocalDate(v, 'mediumDate', locale))
      : { key: '', params: {}, tone: 'neutral' as StatusLineTone };
  });
  protected readonly missing = computed<RecordMissingItem[]>(() => {
    const m = this.meeting();
    return m
      ? meetingMissing(m, (a) => this.scrollTo(a), ['/management-review/meetings', m.id, 'edit'])
      : [];
  });
  protected readonly concerns = computed(() => {
    const m = this.meeting();
    return m ? meetingConcerns(m) : [];
  });
  /** "3 beslutninger · 1 tiltak", when anything was decided. */
  protected readonly decisionCounts = computed(() => {
    const decisions = this.meeting()?.decisions ?? [];
    return decisions.length
      ? {
          count: decisions.length,
          actions: decisions.filter((d) => d.category === 'action').length,
        }
      : null;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: MR_MODULE,
      entityType: 'meeting',
      entityId: this.id(),
      view: 'detail',
      title: this.meeting()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected edit(): void {
    void this.router.navigate(['/management-review/meetings', this.id(), 'edit']);
  }

  protected scrollTo(anchor: string): void {
    const target = this.host.nativeElement.querySelector<HTMLElement>('#' + anchor);
    target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  protected askSummary(): void {
    const m = this.meeting();
    if (m) {
      this.ask.showWith(
        this.language.translate('managementReview.ai.prompts.summariseMeeting', {
          code: m.code,
          title: m.title,
        }),
      );
    }
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteMeeting(orgId, this.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('managementReview.notices.meetingDeleted');
        void this.router.navigate(['/management-review/meetings']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(mrErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getMeeting(orgId, id).subscribe({
      next: (m) => {
        this.meeting.set(m);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

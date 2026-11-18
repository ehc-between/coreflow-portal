import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { WatchButton } from '../../shared/activity/watch-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
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
  reviewStatusKey,
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
    WatchButton,
    TourStepDirective,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
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
            entityType="meeting"
            [entityId]="m.id"
            [title]="m.title"
            [breadcrumbs]="crumbs()"
            [settingsLink]="settingsLink"
            [tabs]="tabs"
            [canEdit]="m.can_edit"
            [fieldLabels]="fieldLabels"
            [requirementsPanel]="true"
          >
            <ng-container meta>
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
              <app-button secondary variant="secondary" (click)="edit()">
                {{ 'managementReview.detail.edit' | transloco }}
              </app-button>
            }
            <app-watch-button secondary entityType="meeting" [entityId]="m.id" />
            <button appMenuItem overflow (click)="askSummary()">
              {{ 'managementReview.ai.summariseMeeting' | transloco }}
            </button>
            @if (canDelete()) {
              <button appMenuItem overflow [danger]="true" (click)="confirmDelete.set(true)">
                {{ 'managementReview.meeting.delete' | transloco }}
              </button>
            }

            <app-help-strip
              help
              [scope]="scope"
              page="meetingDetail"
              tour="meetingDetail"
              lesson="good-minutes"
            />

            <div class="flex flex-col gap-4">
              @if (m.review; as rv) {
                <app-alert tone="info">
                  {{ 'managementReview.meeting.partOfReview' | transloco }}
                  <a [routerLink]="rv.url" class="font-semibold underline" data-testid="review-link"
                    >{{ rv.code }} {{ rv.title }}</a
                  >
                  ({{ reviewStatusKey(rv.status) | transloco }})
                </app-alert>
              }
              @if (m.kind === 'safety') {
                <app-alert tone="info" data-testid="amu-hint">{{
                  'managementReview.meeting.amuHint' | transloco
                }}</app-alert>
              }

              <app-card>
                <app-field-list [columns]="2">
                  <app-field-item labelKey="managementReview.fields.scheduledAt">
                    @if (m.scheduled_at) {
                      {{ m.scheduled_at | localDate }}
                      @if (m.duration_minutes) {
                        ·
                        {{
                          'managementReview.common.minutes' | transloco: { n: m.duration_minutes }
                        }}
                      }
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="managementReview.fields.location"
                    [value]="m.location"
                  />
                  <app-field-item
                    labelKey="managementReview.fields.chair"
                    [value]="m.chair?.name ?? null"
                  />
                  <app-field-item
                    labelKey="managementReview.fields.secretary"
                    [value]="m.secretary?.name ?? null"
                  />
                  <app-field-item
                    labelKey="managementReview.fields.purpose"
                    [value]="m.purpose"
                    [wide]="true"
                    [multiline]="true"
                  />
                  <app-field-item
                    labelKey="managementReview.fields.related"
                    [wide]="true"
                    empty="none"
                  >
                    @if (m.related?.length) {
                      <ul class="flex flex-wrap gap-1.5" data-testid="meeting-related">
                        @for (r of m.related; track r.link_id) {
                          <li><app-entity-chip [ref]="r" /></li>
                        }
                      </ul>
                    }
                  </app-field-item>
                </app-field-list>
              </app-card>

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

  readonly id = input.required<string>();

  protected readonly scope = MR_SCOPE;
  protected readonly settingsLink = MR_SETTINGS_LINK;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = MEETING_FIELD_LABELS;
  protected readonly statusKey = meetingStatusKey;
  protected readonly tone = toneValue;
  protected readonly kindKey = meetingKindKey;
  protected readonly reviewStatusKey = reviewStatusKey;

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

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
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AssigneeIn } from '../../core/tasks/task.models';
import { AskPanelService } from '../ask/ask-panel.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { MeetingWorkspace } from './components/meeting-workspace';
import { ManagementReviewApi } from './data/management-review-api';
import { mrErrorKey } from './data/management-review-errors';
import { MeetingDetail } from './data/management-review.models';
import {
  MR_MODULE,
  MR_PERMISSIONS,
  MR_SCOPE,
  meetingKindKey,
  meetingStatusKey,
  meetingStatusTone,
  reviewStatusKey,
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
 * `/management-review/meetings/:id`: a meeting with minutes — details, agenda,
 * attendees and attendance, minutes (drafted with AI and approved by the chair),
 * decisions and their follow-up tasks — plus the shared record tabs. A meeting
 * that belongs to a management review links back to it.
 */
@Component({
  selector: 'app-mr-meeting-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    LocalDatePipe,
    WatchButton,
    GuideIntro,
    LessonView,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    MeetingWorkspace,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted">
          {{ 'managementReview.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[880px] px-4 pt-7 sm:px-8">
          <app-alert tone="error">{{ 'managementReview.common.notFound' | transloco }}</app-alert>
          <a
            routerLink="/management-review/meetings"
            class="mt-3 inline-block text-[13px] font-semibold text-accent"
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
            [tabs]="tabs"
            [canEdit]="m.can_edit"
            [fieldLabels]="fieldLabels"
            backLink="/management-review/meetings"
            backLabelKey="managementReview.common.backToMeetings"
          >
            <div header>
              <p class="font-mono text-[12.5px] text-fg-subtle">{{ m.code }}</p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
              >
                {{ m.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(m.status)">{{
                  statusKey(m.status) | transloco
                }}</app-badge>
                <app-badge tone="neutral">{{ kindKey(m.kind) | transloco }}</app-badge>
              </div>
            </div>

            <ng-container actions>
              <app-tour-button [scope]="scope" tour="meetingDetail" />
              <app-watch-button entityType="meeting" [entityId]="m.id" />
              <app-button variant="ghost" size="sm" (click)="askSummary()">
                <app-icon name="spark" [size]="14" />
                {{ 'managementReview.ai.summariseMeeting' | transloco }}
              </app-button>
              @if (m.can_edit) {
                <app-button variant="secondary" size="sm" (click)="edit()">
                  {{ 'managementReview.detail.edit' | transloco }}
                </app-button>
              }
              @if (canDelete()) {
                <app-button variant="danger" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'managementReview.meeting.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-4">
              <app-guide-intro [scope]="scope" page="meetingDetail" />

              @if (m.review; as rv) {
                <app-alert tone="info">
                  {{ 'managementReview.meeting.partOfReview' | transloco }}
                  <a [routerLink]="rv.url" class="font-semibold underline" data-testid="review-link"
                    >{{ rv.code }} {{ rv.title }}</a
                  >
                  ({{ reviewStatusKey(rv.status) | transloco }})
                </app-alert>
              }

              <app-card>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-4 text-[13.5px] sm:grid-cols-2">
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.fields.scheduledAt' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        (m.scheduled_at | localDate: 'medium') ||
                          ('managementReview.common.notScheduled' | transloco)
                      }}
                      @if (m.duration_minutes) {
                        ·
                        {{
                          'managementReview.common.minutes' | transloco: { n: m.duration_minutes }
                        }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.fields.location' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ m.location || '—' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.fields.chair' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ m.chair?.name ?? ('managementReview.common.nobody' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.fields.secretary' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ m.secretary?.name ?? ('managementReview.common.nobody' | transloco) }}
                    </dd>
                  </div>
                  @if (m.purpose) {
                    <div class="sm:col-span-2">
                      <dt class="text-[12px] font-semibold text-fg-muted">
                        {{ 'managementReview.fields.purpose' | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg">{{ m.purpose }}</dd>
                    </div>
                  }
                </dl>
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

            <ng-container aside>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="meeting" [entityId]="m.id" />
              </app-card>
              <app-why-it-matters [scope]="scope" page="meetingDetail" />
              <details class="rounded-card border border-border bg-surface p-4">
                <summary class="cursor-pointer text-[13.5px] font-semibold text-fg">
                  {{ 'managementReview.lessons.goodMinutes' | transloco }}
                </summary>
                <div class="mt-3"><app-lesson [scope]="scope" lesson="good-minutes" /></div>
              </details>
            </ng-container>
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
  protected readonly tabs = TABS;
  protected readonly fieldLabels = MEETING_FIELD_LABELS;
  protected readonly statusKey = meetingStatusKey;
  protected readonly statusTone = meetingStatusTone;
  protected readonly kindKey = meetingKindKey;
  protected readonly reviewStatusKey = reviewStatusKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly meeting = signal<MeetingDetail | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly busy = signal(false);

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

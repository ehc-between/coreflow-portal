import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { TasksApi } from '../../../core/tasks/tasks-api';
import { WatchButton } from '../../../shared/activity/watch-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { FeedbackAskButton } from '../ask-button';
import { FeedbackApi } from '../data/feedback-api';
import {
  exportFileName,
  questionTypeKey,
  saveBlob,
  surveyStatusKey,
  thresholdOnFive,
} from '../data/feedback-display';
import { feedbackErrorKey } from '../data/feedback-errors';
import {
  EXPORT_FORMATS,
  ExportFormat,
  PERM_MANAGE,
  PERM_WRITE,
  SURVEY_ENTITY,
  Survey,
  SurveyAction,
  SurveyResults,
} from '../data/feedback.models';
import { FEEDBACK_SETTINGS_LINK } from '../feedback-nav';
import { FeedbackThemes } from '../themes-panel';
import { SurveyAnswers } from './survey-answers';
import { SurveyResultsView } from './survey-results';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];
/** The survey's two views: its answers (a table) and its set-up and results. */
export const SURVEY_VIEWS = ['answers', 'overview'] as const;
export type SurveyView = (typeof SURVEY_VIEWS)[number];

export const SURVEY_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'feedback.surveyFields.title',
  description: 'feedback.surveyFields.description',
  status: 'feedback.fields.status',
  questions: 'feedback.surveyForm.sections.questions',
  anonymous: 'feedback.surveyFields.anonymous',
  thank_you_message: 'feedback.surveyFields.thankYouMessage',
  opens_on: 'feedback.surveyFields.opensOn',
  closes_on: 'feedback.surveyFields.closesOn',
  low_score_threshold: 'feedback.surveyFields.lowScoreThreshold',
  owner_user_id: 'feedback.fields.owner',
  language: 'feedback.surveyFields.language',
};

/** The full public link of a survey (`<portal origin>/survey/<token>`). */
export function publicSurveyUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** The survey's main next step: publish a draft, close an open one, reopen a closed one. */
export function primarySurveyAction(s: Pick<Survey, 'allowed_actions'>): SurveyAction | null {
  for (const a of ['publish', 'close', 'reopen'] as const) {
    if (s.allowed_actions.includes(a)) {
      return a;
    }
  }
  return null;
}

/**
 * One survey (`/feedback/surveys/:id`): its questions, the public link to share,
 * publish / close / reopen (one primary step), results with NPS and answer
 * distributions, the answers as a table ("Svar", the default once there are answers), an AI theme analysis whose
 * recommendations can become tasks, an export of the results, and the shared
 * record kit (requirements, connections, tasks, activity, revisions).
 */
@Component({
  selector: 'app-survey-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    WatchButton,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    FeedbackAskButton,
    FeedbackThemes,
    SurveyResultsView,
    SurveyAnswers,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-error-state [bodyKey]="errorKey()" (retry)="reload()" />
          <a
            routerLink="/feedback/surveys"
            class="mt-4 inline-block text-ui font-semibold text-accent"
          >
            {{ 'feedback.common.backToSurveys' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (survey(); as s) {
          <app-record-detail-layout
            [entityType]="entityType"
            [entityId]="s.id"
            [title]="s.title"
            [breadcrumbs]="[
              { labelKey: 'modules.names.feedback', link: '/feedback' },
              { labelKey: 'feedback.tabs.surveys', link: '/feedback/surveys' },
              { label: s.code },
            ]"
            [settingsLink]="settingsLink"
            [tabs]="tabs"
            [counts]="{ tasks: s.open_tasks ?? 0 }"
            [canEdit]="s.can_edit"
            [fieldLabels]="fieldLabels"
          >
            <ng-container meta>
              <span class="font-mono font-semibold">{{ s.code }}</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="s.status"
                [labelKey]="statusKey(s.status)"
                data-testid="survey-status"
              />
              @if (s.status === 'open') {
                <app-badge [tone]="s.accepting_responses ? 'pass' : 'warn'">{{
                  (s.accepting_responses
                    ? 'feedback.surveyDetail.accepting'
                    : 'feedback.surveyDetail.notAccepting'
                  ) | transloco
                }}</app-badge>
              }
              <span>{{
                (s.anonymous ? 'feedback.surveys.anonymous' : 'feedback.surveys.named') | transloco
              }}</span>
              <span>{{ 'feedback.surveyLanguages.' + (s.language || 'nb') | transloco }}</span>
            </ng-container>

            @if (primary(); as a) {
              @if (canManage()) {
                <app-button
                  primary
                  [variant]="a === 'publish' ? 'primary' : 'secondary'"
                  [disabled]="acting()"
                  (click)="pendingAction.set(a)"
                  [attr.data-testid]="'survey-action-' + a"
                >
                  {{ 'feedback.surveyActions.' + a | transloco }}
                </app-button>
              }
            }
            @if (s.can_edit) {
              <a
                secondary
                [routerLink]="['/feedback/surveys', s.id, 'edit']"
                class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                data-testid="survey-edit"
              >
                {{ 'feedback.common.edit' | transloco }}
              </a>
            }
            <app-feedback-ask-button
              secondary
              promptKey="feedback.ask.surveyResults"
              [requirements]="confirmedRefs()"
            />
            @if (canManage()) {
              @for (a of otherActions(); track a) {
                <button
                  appMenuItem
                  overflow
                  type="button"
                  (click)="pendingAction.set(a)"
                  [attr.data-testid]="'survey-action-' + a"
                >
                  {{ 'feedback.surveyActions.' + a | transloco }}
                </button>
              }
            }
            @for (f of formats; track f) {
              <button
                appMenuItem
                overflow
                type="button"
                (click)="export(f)"
                [attr.data-testid]="'survey-export-' + f"
              >
                <app-icon name="upload" [size]="14" class="rotate-180" />
                {{ 'feedback.export.as.' + f | transloco }}
              </button>
            }
            @if (canManage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleting.set(true)"
                data-testid="survey-delete"
              >
                <app-icon name="trash" [size]="14" />
                {{ 'feedback.common.delete' | transloco }}
              </button>
            }

            <app-help-strip
              help
              scope="feedback"
              page="surveyDetail"
              lesson="good-survey-questions"
            />

            <div class="flex flex-col gap-6">
              <div
                class="inline-flex w-fit rounded-tile border border-border bg-surface-2 p-0.5"
                role="group"
                [attr.aria-label]="'feedback.answers.viewLabel' | transloco"
                data-testid="survey-view-switch"
              >
                @for (v of views; track v) {
                  <button
                    type="button"
                    class="h-8 rounded-[8px] px-3 text-ui font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [class]="
                      view() === v
                        ? 'bg-surface text-fg shadow-card'
                        : 'text-fg-muted hover:text-fg'
                    "
                    [attr.aria-pressed]="view() === v"
                    (click)="view.set(v)"
                    [attr.data-testid]="'survey-view-' + v"
                  >
                    {{ 'feedback.answers.views.' + v | transloco: { count: answerCount() } }}
                  </button>
                }
              </div>

              <div [hidden]="view() !== 'answers'">
                <app-card>
                  <app-survey-answers
                    [survey]="s"
                    [canWrite]="canWrite()"
                    [canManage]="canManage()"
                    [canDeviate]="canDeviate()"
                    (counted)="onCounted($event)"
                    (changed)="reloadExtras()"
                  />
                </app-card>
              </div>

              <div class="flex flex-col gap-6" [hidden]="view() !== 'overview'">
                <app-card>
                  <h2 class="mb-1 font-display text-card font-bold text-fg">
                    {{ 'feedback.next.title' | transloco }}
                  </h2>
                  <p class="text-ui text-fg-muted" data-testid="survey-hint">
                    {{ 'feedback.surveyWorkflow.hint.' + s.status | transloco }}
                  </p>
                </app-card>

                @if (s.status !== 'draft') {
                  <app-card>
                    <h2 class="mb-2 font-display text-card font-bold text-fg">
                      {{ 'feedback.share.title' | transloco }}
                    </h2>
                    <p class="mb-2 text-meta text-fg-muted">
                      {{ 'feedback.share.intro' | transloco }}
                    </p>
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label for="cf-sv-link" class="sr-only">{{
                        'feedback.share.linkLabel' | transloco
                      }}</label>
                      <input
                        id="cf-sv-link"
                        type="text"
                        readonly
                        class="h-10 min-w-0 flex-1 rounded-tile border border-border bg-surface-2 px-3 font-mono text-meta text-fg"
                        [value]="publicUrl()"
                        (focus)="$any($event.target).select()"
                        data-testid="survey-link"
                      />
                      <div class="flex flex-wrap gap-2">
                        <app-button size="sm" variant="secondary" (click)="copyLink()">
                          {{ 'feedback.share.copy' | transloco }}
                        </app-button>
                        <a
                          [href]="publicUrl()"
                          target="_blank"
                          rel="noopener"
                          class="inline-flex h-8 items-center rounded-tile px-3 text-ui font-semibold text-accent hover:bg-accent-soft"
                        >
                          {{ 'feedback.share.open' | transloco }}
                        </a>
                        @if (canManage()) {
                          <app-button size="sm" variant="ghost" (click)="regenerating.set(true)">
                            {{ 'feedback.share.regenerate' | transloco }}
                          </app-button>
                        }
                      </div>
                    </div>
                  </app-card>
                }

                <app-card>
                  <h2 class="mb-3 font-display text-card font-bold text-fg">
                    {{ 'feedback.surveyDetail.questions' | transloco }}
                  </h2>
                  @if (s.description) {
                    <p class="mb-3 text-body whitespace-pre-line text-fg">{{ s.description }}</p>
                  }
                  @if (s.questions.length === 0) {
                    <p class="text-ui text-fg-muted">
                      {{ 'feedback.surveyDetail.noQuestions' | transloco }}
                    </p>
                  } @else {
                    <ol
                      class="flex flex-col gap-2 text-body text-fg"
                      data-testid="survey-questions"
                    >
                      @for (q of s.questions; track q.id; let i = $index) {
                        <li class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span class="text-fg-subtle">{{ i + 1 }}.</span>
                          <span class="min-w-0 flex-1">{{ q.label }}</span>
                          <span class="flex flex-wrap gap-1">
                            <app-badge tone="neutral">{{ typeKey(q.type) | transloco }}</app-badge>
                            @if (q.required) {
                              <app-badge tone="info">{{
                                'feedback.surveyDetail.requiredBadge' | transloco
                              }}</app-badge>
                            }
                          </span>
                        </li>
                      }
                    </ol>
                  }
                  <dl class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-ui sm:grid-cols-3">
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.surveyFields.opensOn' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{
                          s.opens_on
                            ? (s.opens_on | localDay)
                            : ('feedback.common.none' | transloco)
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.surveyFields.closesOn' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{
                          s.closes_on
                            ? (s.closes_on | localDay)
                            : ('feedback.common.none' | transloco)
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.surveyDetail.followUpRule' | transloco }}
                      </dt>
                      <dd class="text-fg" data-testid="survey-threshold">
                        @if (s.low_score_threshold === null) {
                          {{ 'feedback.surveyDetail.noThreshold' | transloco }}
                        } @else {
                          {{
                            'feedback.surveyDetail.thresholdValue'
                              | transloco
                                : {
                                    value: s.low_score_threshold,
                                    five: onFive(s.low_score_threshold),
                                  }
                          }}
                        }
                      </dd>
                    </div>
                  </dl>
                </app-card>

                <app-card>
                  <h2 class="mb-3 font-display text-card font-bold text-fg">
                    {{ 'feedback.results.title' | transloco }}
                  </h2>
                  @if (results(); as r) {
                    <app-survey-results [results]="r" />
                  } @else if (resultsFailed()) {
                    <app-error-state (retry)="reloadExtras()" />
                  } @else {
                    <app-loading-state [rows]="3" />
                  }
                </app-card>

                @if ((results()?.response_count ?? 0) > 0) {
                  <app-card>
                    <app-feedback-themes
                      [entityType]="entityType"
                      [entityId]="s.id"
                      [canCreateTasks]="canCreateTasks()"
                      (taskRequested)="createTask($event)"
                    />
                  </app-card>
                }
              </div>
            </div>

            <div tasks>
              @for (k of [tasksKey()]; track k) {
                <app-entity-tasks
                  [entityType]="entityType"
                  [entityId]="s.id"
                  [canCreate]="canCreateTasks()"
                  [entityLabel]="s.code + ' ' + s.title"
                />
              }
            </div>

            <ng-container aside-requirements>
              <app-supports-requirements
                [entityType]="entityType"
                [entityId]="s.id"
                [canEdit]="s.can_edit"
                (linksChange)="reqLinks.set($event)"
              />
            </ng-container>

            <ng-container aside>
              <app-card>
                <div class="mb-2 flex items-center justify-between gap-2">
                  <h2 class="text-ui font-semibold text-fg-subtle">
                    {{ 'feedback.surveyDetail.summary' | transloco }}
                  </h2>
                  <app-watch-button [entityType]="entityType" [entityId]="s.id" />
                </div>
                <dl class="flex flex-col gap-2 text-ui">
                  <div>
                    <dt class="text-meta text-fg-subtle">
                      {{ 'feedback.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ s.owner?.name ?? ('feedback.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-subtle">
                      {{ 'feedback.results.responses' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ s.response_count }}</dd>
                  </div>
                  @if (s.published_at) {
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.surveyFields.publishedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ s.published_at | localDate }}</dd>
                    </div>
                  }
                  @if (s.closed_at) {
                    <div>
                      <dt class="text-meta text-fg-subtle">
                        {{ 'feedback.fields.closedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ s.closed_at | localDate }}</dd>
                    </div>
                  }
                </dl>
                <a
                  [routerLink]="['/feedback']"
                  [queryParams]="{ survey: s.id }"
                  class="mt-3 inline-block text-meta font-semibold text-accent hover:underline"
                  data-testid="survey-follow-ups"
                >
                  {{ 'feedback.surveyDetail.followUps' | transloco: { count: s.follow_ups ?? 0 } }}
                </a>
              </app-card>
            </ng-container>

            <ng-container aside-learn>
              <app-why-it-matters scope="feedback" page="surveyDetail" />
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="!!pendingAction()"
            [title]="
              (pendingAction() ? 'feedback.surveyActionDialog.titles.' + pendingAction() : '')
                | transloco
            "
            [message]="
              (pendingAction() ? 'feedback.surveyActionDialog.messages.' + pendingAction() : '')
                | transloco
            "
            [confirmLabel]="
              (pendingAction() ? 'feedback.surveyActions.' + pendingAction() : '') | transloco
            "
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="primary"
            [busy]="acting()"
            (confirmed)="runAction()"
            (cancelled)="pendingAction.set(null)"
          />
          <app-confirm-dialog
            [open]="regenerating()"
            [title]="'feedback.share.regenerateTitle' | transloco"
            [message]="'feedback.share.regenerateMessage' | transloco"
            [confirmLabel]="'feedback.share.regenerate' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="regenerate()"
            (cancelled)="regenerating.set(false)"
          />
          <app-confirm-dialog
            [open]="deleting()"
            [title]="'feedback.surveyDetail.deleteTitle' | transloco"
            [message]="'feedback.surveyDetail.deleteMessage' | transloco: { code: s.code }"
            [confirmLabel]="'feedback.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
        }
      }
    }
  `,
})
export class SurveyDetail {
  private readonly api = inject(FeedbackApi);
  private readonly tasksApi = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly language = inject(LanguageService);

  readonly id = input.required<string>();

  protected readonly entityType = SURVEY_ENTITY;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = SURVEY_FIELD_LABELS;
  protected readonly settingsLink = FEEDBACK_SETTINGS_LINK;
  protected readonly formats = EXPORT_FORMATS;
  protected readonly statusKey = surveyStatusKey;
  protected readonly typeKey = questionTypeKey;
  protected readonly onFive = thresholdOnFive;
  protected readonly views = SURVEY_VIEWS;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('feedback.common.loadFailed');
  protected readonly survey = signal<Survey | null>(null);
  protected readonly results = signal<SurveyResults | null>(null);
  protected readonly resultsFailed = signal(false);
  /** All answers (unfiltered), from the answers table. */
  protected readonly answerCount = signal(0);
  /** Svar first once there are answers; the user's choice wins after that. */
  protected readonly view = linkedSignal<SurveyView>(() =>
    (this.survey()?.response_count ?? 0) > 0 ? 'answers' : 'overview',
  );
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly regenerating = signal(false);
  protected readonly pendingAction = signal<SurveyAction | null>(null);
  protected readonly reqLinks = signal<readonly RequirementLink[]>([]);
  /** Bumped to re-create the tasks tab after a task was added from here. */
  protected readonly tasksKey = signal(0);

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_MANAGE),
  );
  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );
  protected readonly canDeviate = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('deviations:write'),
  );
  protected readonly canCreateTasks = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('tasks:write'),
  );
  protected readonly primary = computed(() => {
    const s = this.survey();
    return s ? primarySurveyAction(s) : null;
  });
  protected readonly otherActions = computed(() => {
    const s = this.survey();
    const main = this.primary();
    return s ? s.allowed_actions.filter((a) => a !== main) : [];
  });
  protected readonly publicUrl = computed(() => {
    const s = this.survey();
    return s ? publicSurveyUrl(this.document.location?.origin ?? '', s.public_path) : '';
  });
  protected readonly confirmedRefs = computed(() =>
    this.reqLinks()
      .filter((l) => l.status === 'confirmed')
      .map((l) => l.requirement_ref)
      .filter((r): r is string => !!r),
  );

  private request = new Subscription();
  private extra = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.extra.unsubscribe();
    });
    providePageContext(() => {
      const s = this.survey();
      return {
        module: 'feedback',
        entityType: SURVEY_ENTITY,
        entityId: this.id(),
        view: 'detail',
        title: s ? `${s.code} ${s.title}` : null,
        requirements: this.confirmedRefs(),
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected onCounted(total: number): void {
    this.answerCount.set(total);
  }

  protected copyLink(): void {
    void navigator.clipboard?.writeText(this.publicUrl()).then(
      () => this.notifications.success('feedback.share.copied'),
      () => this.notifications.error('feedback.reply.copyFailed'),
    );
  }

  /** A theme recommendation becomes a tracked task on the survey. */
  protected createTask(recommendation: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.survey();
    if (!orgId || !s || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.tasksApi
      .create(orgId, {
        title: recommendation.slice(0, 255),
        description: this.language.translate('feedback.themes.taskDescription', {
          code: s.code,
          title: s.title,
        }),
        entity_type: SURVEY_ENTITY,
        entity_id: s.id,
      })
      .subscribe({
        next: () => {
          this.acting.set(false);
          this.tasksKey.update((n) => n + 1);
          this.survey.set({ ...s, open_tasks: (s.open_tasks ?? 0) + 1 });
          this.notifications.success('feedback.notices.taskCreated');
        },
        error: (error: unknown) => {
          this.acting.set(false);
          this.notifications.error(feedbackErrorKey(error));
        },
      });
  }

  protected export(format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.survey();
    if (!orgId || !s) {
      return;
    }
    this.api.exportSurvey(orgId, s.id, format, this.language.active()).subscribe({
      next: (blob) => saveBlob(blob, exportFileName(`${s.code} ${s.title}`, format)),
      error: (error: unknown) => this.notifications.error(feedbackErrorKey(error)),
    });
  }

  protected runAction(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const action = this.pendingAction();
    if (!orgId || !action || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.surveyAction(orgId, this.id(), action).subscribe({
      next: (survey) => {
        this.acting.set(false);
        this.pendingAction.set(null);
        this.survey.set(survey);
        this.notifications.success(`feedback.notices.surveyActions.${action}`, {
          code: survey.code,
        });
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.pendingAction.set(null);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  protected regenerate(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.regenerateLink(orgId, this.id()).subscribe({
      next: (survey) => {
        this.acting.set(false);
        this.regenerating.set(false);
        this.survey.set(survey);
        this.notifications.success('feedback.share.regenerated');
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.survey();
    if (!orgId || !s) {
      return;
    }
    this.acting.set(true);
    this.api.deleteSurvey(orgId, s.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('feedback.notices.surveyDeleted', { code: s.code });
        void this.router.navigate(['/feedback/surveys']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected reloadExtras(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.loadExtras(orgId, this.id());
    }
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getSurvey(orgId, id).subscribe({
      next: (survey) => {
        this.survey.set(survey);
        this.state.set('ready');
        this.loadExtras(orgId, id);
      },
      error: (error: unknown) => {
        this.errorKey.set(feedbackErrorKey(error));
        this.state.set('error');
      },
    });
  }

  /** The results (the answers table loads itself). */
  private loadExtras(orgId: string, id: string): void {
    this.extra.unsubscribe();
    this.resultsFailed.set(false);
    this.extra = this.api.results(orgId, id).subscribe({
      next: (results) => this.results.set(results),
      error: () => this.resultsFailed.set(true),
    });
  }
}

import { DOCUMENT } from '@angular/common';
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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { FeedbackApi } from '../data/feedback-api';
import { questionTypeKey, surveyStatusKey, surveyStatusTone } from '../data/feedback-display';
import { feedbackErrorKey } from '../data/feedback-errors';
import {
  PERM_MANAGE,
  SURVEY_ENTITY,
  Survey,
  SurveyAction,
  SurveyResponse,
  SurveyResults,
} from '../data/feedback.models';
import { FeedbackLessonLink } from '../lesson-link';
import { FeedbackThemes } from '../themes-panel';
import { SurveyResultsView } from './survey-results';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];
const RESPONSES_PAGE = 20;

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
};

/** The full public link of a survey (`<portal origin>/survey/<token>`). */
export function publicSurveyUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * One survey (`/feedback/surveys/:id`): its questions, the public link to share,
 * publish / close / reopen, results with NPS and answer distributions, the
 * individual responses, an AI theme analysis, and the shared record kit.
 */
@Component({
  selector: 'app-survey-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    Pager,
    FeedbackLessonLink,
    FeedbackThemes,
    SurveyResultsView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'feedback.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a
            routerLink="/feedback/surveys"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
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
            [tabs]="tabs"
            [canEdit]="s.can_edit"
            [fieldLabels]="fieldLabels"
            backLink="/feedback/surveys"
            backLabelKey="feedback.common.backToSurveys"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ s.code }}</span>
                <span>{{
                  (s.anonymous ? 'feedback.surveys.anonymous' : 'feedback.surveys.named')
                    | transloco
                }}</span>
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="survey-heading"
              >
                {{ s.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(s.status)" data-testid="survey-status">{{
                  statusKey(s.status) | transloco
                }}</app-badge>
                @if (s.status === 'open') {
                  <app-badge [tone]="s.accepting_responses ? 'pass' : 'warn'">{{
                    (s.accepting_responses
                      ? 'feedback.surveyDetail.accepting'
                      : 'feedback.surveyDetail.notAccepting'
                    ) | transloco
                  }}</app-badge>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button [entityType]="entityType" [entityId]="s.id" />
              <app-ask-about [prompt]="'feedback.ask.surveyResults' | transloco" />
              @if (s.can_edit) {
                <a
                  [routerLink]="['/feedback/surveys', s.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="survey-edit"
                >
                  {{ 'feedback.common.edit' | transloco }}
                </a>
              }
              @if (canManage()) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'feedback.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="feedback" page="surveyDetail" />

              @if (s.allowed_actions.length) {
                <app-card>
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p class="text-[13px] text-fg-muted">
                      {{ 'feedback.surveyWorkflow.hint.' + s.status | transloco }}
                    </p>
                    <div class="flex flex-wrap gap-2">
                      @for (a of s.allowed_actions; track a) {
                        <span [attr.data-testid]="'survey-action-' + a">
                          <app-button
                            size="sm"
                            [variant]="a === 'publish' ? 'primary' : 'secondary'"
                            [disabled]="acting()"
                            (click)="pendingAction.set(a)"
                          >
                            {{ 'feedback.surveyActions.' + a | transloco }}
                          </app-button>
                        </span>
                      }
                    </div>
                  </div>
                </app-card>
              }

              @if (s.status !== 'draft') {
                <app-card>
                  <h2
                    class="mb-2 flex items-center gap-1 font-display text-[15px] font-bold text-fg"
                  >
                    {{ 'feedback.share.title' | transloco }}
                  </h2>
                  <p class="mb-2 text-[12.5px] text-fg-muted">
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
                      class="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-3 font-mono text-[12.5px] text-fg"
                      [value]="publicUrl()"
                      (focus)="$any($event.target).select()"
                      data-testid="survey-link"
                    />
                    <div class="flex gap-2">
                      <app-button size="sm" variant="secondary" (click)="copyLink()">
                        {{ 'feedback.share.copy' | transloco }}
                      </app-button>
                      <a
                        [href]="publicUrl()"
                        target="_blank"
                        rel="noopener"
                        class="inline-flex h-8 items-center rounded-tile px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft"
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
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'feedback.surveyDetail.questions' | transloco }}
                </h2>
                @if (s.description) {
                  <p class="mb-3 text-[13.5px] whitespace-pre-line text-fg">{{ s.description }}</p>
                }
                @if (s.questions.length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'feedback.surveyDetail.noQuestions' | transloco }}
                  </p>
                } @else {
                  <ol
                    class="flex flex-col gap-1.5 text-[13.5px] text-fg"
                    data-testid="survey-questions"
                  >
                    @for (q of s.questions; track q.id; let i = $index) {
                      <li>
                        <span class="text-fg-subtle">{{ i + 1 }}.</span> {{ q.label }}
                        <span class="text-[12px] text-fg-subtle">
                          ({{ typeKey(q.type) | transloco
                          }}{{
                            q.required ? ', ' + ('feedback.surveyFields.required' | transloco) : ''
                          }})
                        </span>
                      </li>
                    }
                  </ol>
                }
                <dl
                  class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'feedback.surveyFields.opensOn' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        s.opens_on ? (s.opens_on | localDay) : ('feedback.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
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
                    <dt class="text-fg-subtle">
                      {{ 'feedback.surveyFields.lowScoreThreshold' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        s.low_score_threshold === null
                          ? ('feedback.surveyDetail.noThreshold' | transloco)
                          : s.low_score_threshold
                      }}
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'feedback.results.title' | transloco }}
                </h2>
                @if (results(); as r) {
                  <app-survey-results [results]="r" />
                } @else if (resultsFailed()) {
                  <p class="text-[13px] text-fail" role="alert">
                    {{ 'feedback.common.loadFailed' | transloco }}
                  </p>
                } @else {
                  <p class="text-[13px] text-fg-muted" role="status">
                    {{ 'feedback.common.loading' | transloco }}
                  </p>
                }
              </app-card>

              @if ((results()?.response_count ?? 0) > 0) {
                <app-card>
                  <app-feedback-themes [entityType]="entityType" [entityId]="s.id" />
                </app-card>
              }

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'feedback.responses.title' | transloco }}
                </h2>
                @if (responses().length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'feedback.responses.none' | transloco }}
                  </p>
                } @else {
                  <ul class="divide-y divide-border" data-testid="survey-responses">
                    @for (r of responses(); track r.id) {
                      <li class="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                        <div class="min-w-0 flex-1 text-[13px]">
                          <p class="font-semibold text-fg">{{ r.submitted_at | localDate }}</p>
                          @if (r.respondent_name || r.respondent_email) {
                            <p class="text-fg-muted">
                              {{ respondent(r) }}
                            </p>
                          }
                          <ul class="mt-1 flex flex-col gap-0.5 text-[12.5px] text-fg-muted">
                            @for (q of s.questions; track q.id) {
                              @if (answerText(r, q.id); as a) {
                                <li class="break-words">
                                  <span class="text-fg-subtle">{{ q.label }}:</span> {{ a }}
                                </li>
                              }
                            }
                          </ul>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                          @if (r.score !== null) {
                            <app-badge
                              [tone]="r.score >= 75 ? 'pass' : r.score >= 50 ? 'warn' : 'fail'"
                              >{{
                                'feedback.responses.score' | transloco: { score: r.score }
                              }}</app-badge
                            >
                          }
                          @if (r.feedback_id) {
                            <a
                              [routerLink]="['/feedback/items', r.feedback_id]"
                              class="font-semibold text-accent hover:underline"
                            >
                              {{ 'feedback.responses.followUp' | transloco }}
                            </a>
                          }
                          @if (canManage()) {
                            <button
                              type="button"
                              class="inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-subtle outline-none hover:bg-surface-2 hover:text-fail focus-visible:ring-2 focus-visible:ring-accent"
                              [attr.aria-label]="'feedback.responses.delete' | transloco"
                              (click)="deletingResponse.set(r)"
                            >
                              <app-icon name="trash" [size]="14" />
                            </button>
                          }
                        </div>
                      </li>
                    }
                  </ul>
                  <div class="mt-2">
                    <app-pager
                      [offset]="responsesOffset()"
                      [pageSize]="responsesPage"
                      [count]="responses().length"
                      [total]="responsesTotal()"
                      (pageChange)="loadResponses($event)"
                    />
                  </div>
                }
              </app-card>
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 text-[13px] font-semibold text-fg-subtle">
                  {{ 'feedback.surveyDetail.summary' | transloco }}
                </h2>
                <dl class="flex flex-col gap-2 text-[13px]">
                  <div>
                    <dt class="text-fg-subtle">{{ 'feedback.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ s.owner?.name ?? ('feedback.common.none' | transloco) }}
                    </dd>
                  </div>
                  @if (s.published_at) {
                    <div>
                      <dt class="text-fg-subtle">
                        {{ 'feedback.surveyFields.publishedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ s.published_at | localDate }}</dd>
                    </div>
                  }
                  @if (s.closed_at) {
                    <div>
                      <dt class="text-fg-subtle">{{ 'feedback.fields.closedAt' | transloco }}</dt>
                      <dd class="text-fg">{{ s.closed_at | localDate }}</dd>
                    </div>
                  }
                  <div>
                    <dt class="text-fg-subtle">{{ 'feedback.results.responses' | transloco }}</dt>
                    <dd class="text-fg">{{ s.response_count }}</dd>
                  </div>
                </dl>
                <a
                  [routerLink]="['/feedback']"
                  [queryParams]="{ survey: s.id }"
                  class="mt-3 inline-block text-[12.5px] font-semibold text-accent hover:underline"
                >
                  {{ 'feedback.surveyDetail.relatedFeedback' | transloco }}
                </a>
              </app-card>
              <app-supports-requirements [entityType]="entityType" [entityId]="s.id" />
              <app-why-it-matters scope="feedback" page="surveyDetail" />
              <div class="flex flex-col items-start gap-1">
                <app-feedback-lesson-link lesson="measuring-satisfaction" />
                <app-feedback-lesson-link lesson="good-survey-questions" />
              </div>
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
            [open]="!!deletingResponse()"
            [title]="'feedback.responses.deleteTitle' | transloco"
            [message]="'feedback.responses.deleteMessage' | transloco"
            [confirmLabel]="'feedback.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="removeResponse()"
            (cancelled)="deletingResponse.set(null)"
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
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly language = inject(LanguageService);

  readonly id = input.required<string>();

  protected readonly entityType = SURVEY_ENTITY;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = SURVEY_FIELD_LABELS;
  protected readonly statusKey = surveyStatusKey;
  protected readonly statusTone = surveyStatusTone;
  protected readonly typeKey = questionTypeKey;
  protected readonly responsesPage = RESPONSES_PAGE;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('feedback.common.loadFailed');
  protected readonly survey = signal<Survey | null>(null);
  protected readonly results = signal<SurveyResults | null>(null);
  protected readonly resultsFailed = signal(false);
  protected readonly responses = signal<readonly SurveyResponse[]>([]);
  protected readonly responsesTotal = signal(0);
  protected readonly responsesOffset = signal(0);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly regenerating = signal(false);
  protected readonly pendingAction = signal<SurveyAction | null>(null);
  protected readonly deletingResponse = signal<SurveyResponse | null>(null);

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_MANAGE),
  );
  protected readonly publicUrl = computed(() => {
    const s = this.survey();
    return s ? publicSurveyUrl(this.document.location?.origin ?? '', s.public_path) : '';
  });

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
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected respondent(r: SurveyResponse): string {
    return [r.respondent_name, r.respondent_email].filter(Boolean).join(' · ');
  }

  /** A response's answer to one question as display text ('' when unanswered). */
  protected answerText(r: SurveyResponse, questionId: string): string {
    const value = r.answers[questionId];
    if (value === null || value === undefined || value === '') {
      return '';
    }
    if (typeof value === 'boolean') {
      return this.language.translate(value ? 'feedback.answer.yes' : 'feedback.answer.no');
    }
    return Array.isArray(value) ? value.join(', ') : String(value);
  }

  protected copyLink(): void {
    void navigator.clipboard?.writeText(this.publicUrl()).then(
      () => this.notifications.success('feedback.share.copied'),
      () => this.notifications.error('feedback.reply.copyFailed'),
    );
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

  protected removeResponse(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const response = this.deletingResponse();
    if (!orgId || !response || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.deleteResponse(orgId, this.id(), response.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deletingResponse.set(null);
        this.notifications.success('feedback.notices.responseDeleted');
        this.loadExtras(orgId, this.id(), this.responsesOffset());
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

  protected loadResponses(offset: number): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.responsesOffset.set(offset);
    this.api.responses(orgId, this.id(), RESPONSES_PAGE, offset).subscribe({
      next: (page) => {
        this.responses.set(page.items);
        this.responsesTotal.set(page.total);
      },
      error: () => this.responses.set([]),
    });
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
        this.loadExtras(orgId, id, 0);
      },
      error: (error: unknown) => {
        this.errorKey.set(feedbackErrorKey(error));
        this.state.set('error');
      },
    });
  }

  private loadExtras(orgId: string, id: string, offset: number): void {
    this.extra.unsubscribe();
    this.resultsFailed.set(false);
    this.responsesOffset.set(offset);
    this.extra = new Subscription();
    this.extra.add(
      this.api.results(orgId, id).subscribe({
        next: (results) => this.results.set(results),
        error: () => this.resultsFailed.set(true),
      }),
    );
    this.extra.add(
      this.api.responses(orgId, id, RESPONSES_PAGE, offset).subscribe({
        next: (page) => {
          this.responses.set(page.items);
          this.responsesTotal.set(page.total);
        },
        error: () => this.responses.set([]),
      }),
    );
  }
}

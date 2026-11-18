import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Pager } from '../../../shared/ui/pager/pager';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackErrorKey } from '../data/feedback-errors';
import {
  FEEDBACK_ENTITY,
  NpsGroup,
  Survey,
  SurveyResponse,
  SurveyResponseQuery,
} from '../data/feedback.models';
import { DEVIATION_FLOW } from '../items/feedback-deviations';

const PAGE = 20;

/** "Har tilbakemelding" filter: any, yes, no. */
export const HAS_FEEDBACK_FILTERS = ['', 'yes', 'no'] as const;
export type HasFeedbackFilter = (typeof HAS_FEEDBACK_FILTERS)[number];

/**
 * A count the answers were opened from (a results bar, the promoters, the stats
 * period): the server filter plus the words shown above the table.
 */
export interface AnswerScope {
  readonly question_id?: string;
  readonly value?: string;
  readonly nps_group?: NpsGroup;
  readonly submitted_from?: string;
  readonly submitted_to?: string;
  readonly survey_id?: string;
  /** What the scope is, in words ("Hvor fornøyd …: 4"). */
  readonly label: string;
}

/** The request filters for the answers table. */
export function answersQuery(
  q: string,
  low: boolean,
  hasFeedback: HasFeedbackFilter,
  scope: AnswerScope | null = null,
): SurveyResponseQuery {
  const answer = !!scope?.question_id && !!scope.value;
  return {
    q: q.trim() || undefined,
    low: low || undefined,
    has_feedback: hasFeedback === '' ? undefined : hasFeedback === 'yes',
    question_id: answer ? scope?.question_id : undefined,
    value: answer ? scope?.value : undefined,
    nps_group: scope?.nps_group,
    submitted_from: scope?.submitted_from,
    submitted_to: scope?.submitted_to,
    survey_id: scope?.survey_id,
  };
}

const CONTROL =
  'h-9 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none';

/**
 * Survey answers as a register: one survey's (its "Svar" view) or, without a
 * survey, every survey's ("Svar fra undersøkelser", each row naming its survey).
 * Newest first, search,
 * "Bare lave score" and "Har tilbakemelding" filters, low scores flagged, the
 * follow-up record per answer, and per row "Lag tilbakemelding" (the answer
 * becomes a feedback record in the register) or "Lag avvik" (via that record,
 * the existing feedback → deviation flow). Each answer folds out in full.
 */
@Component({
  selector: 'app-survey-answers',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Badge,
    Button,
    ConfirmDialog,
    ErrorState,
    Icon,
    LoadingState,
    Pager,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId" data-testid="survey-answers">
      <h2 [id]="headingId" class="sr-only">{{ 'feedback.answers.title' | transloco }}</h2>
      <form
        class="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        role="search"
        (submit)="$event.preventDefault(); search(searchBox.value)"
      >
        <label [attr.for]="headingId + '-q'" class="sr-only">{{
          'feedback.answers.search' | transloco
        }}</label>
        <input
          #searchBox
          [id]="headingId + '-q'"
          type="search"
          [class]="control + ' min-w-0 px-3 sm:flex-1'"
          [value]="q()"
          (change)="search(searchBox.value)"
          [placeholder]="'feedback.answers.searchPlaceholder' | transloco"
          data-testid="answers-search"
        />
        <label class="inline-flex min-h-9 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="low()"
            (change)="setLow($any($event.target).checked)"
            data-testid="answers-low"
          />
          {{ 'feedback.answers.onlyLow' | transloco }}
        </label>
        <label [attr.for]="headingId + '-fb'" class="sr-only">{{
          'feedback.answers.hasFeedback' | transloco
        }}</label>
        <select
          [id]="headingId + '-fb'"
          [class]="control"
          (change)="setHasFeedback($any($event.target).value)"
          data-testid="answers-has-feedback"
        >
          @for (f of hasFeedbackFilters; track f) {
            <option [value]="f" [selected]="hasFeedback() === f">
              {{ 'feedback.answers.hasFeedbackOptions.' + (f || 'any') | transloco }}
            </option>
          }
        </select>
      </form>
      @if (scope(); as sc) {
        <p
          class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-muted"
          data-testid="answers-scope"
        >
          <span>{{ 'feedback.answers.scope' | transloco: { label: sc.label } }}</span>
          <button
            type="button"
            class="font-semibold text-accent hover:underline"
            (click)="scopeCleared.emit()"
            data-testid="answers-scope-clear"
          >
            {{ 'feedback.answers.clearScope' | transloco }}
          </button>
        </p>
      }
      @if (survey() && threshold() !== null) {
        <p class="mb-2 text-meta text-fg-muted">
          {{ 'feedback.answers.thresholdNote' | transloco: { threshold: threshold() } }}
        </p>
      }

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (items().length === 0) {
            <p class="text-ui text-fg-muted" data-testid="answers-empty">
              {{
                (filtered() ? 'feedback.answers.noMatch' : 'feedback.responses.none') | transloco
              }}
            </p>
          } @else {
            <p class="mb-2 text-meta text-fg-muted" aria-live="polite">
              {{ 'feedback.list.countOf' | transloco: { shown: items().length, total: total() } }}
            </p>
            <div
              class="hidden border-b border-border px-1 pb-2 text-micro font-semibold tracking-wide text-fg-subtle uppercase sm:grid sm:grid-cols-[120px_minmax(0,1fr)_96px_minmax(0,220px)] sm:gap-3"
              aria-hidden="true"
            >
              <span>{{ 'feedback.answers.columns.date' | transloco }}</span>
              <span>{{ 'feedback.answers.columns.answer' | transloco }}</span>
              <span>{{ 'feedback.answers.columns.score' | transloco }}</span>
              <span>{{ 'feedback.answers.columns.followUp' | transloco }}</span>
            </div>
            <ul class="divide-y divide-border" data-testid="survey-responses">
              @for (r of items(); track r.id) {
                <li
                  class="flex flex-col gap-2 px-1 py-3 sm:grid sm:grid-cols-[120px_minmax(0,1fr)_96px_minmax(0,220px)] sm:items-start sm:gap-3"
                  [class.bg-warn-soft]="r.low_score"
                  [attr.data-testid]="'answer-' + r.id"
                >
                  <div class="text-meta">
                    <p class="font-semibold text-fg">{{ r.submitted_at | localDate }}</p>
                    <p class="text-fg-muted">
                      {{ respondent(r) || ('feedback.answers.anonymous' | transloco) }}
                    </p>
                    @if (!survey() && r.survey_id) {
                      <a
                        [routerLink]="['/feedback/surveys', r.survey_id]"
                        class="font-semibold break-words text-accent hover:underline"
                        [attr.data-testid]="'answer-survey-' + r.id"
                        >{{ r.survey_code }} {{ r.survey_title }}</a
                      >
                    }
                  </div>
                  <div class="min-w-0 text-ui">
                    @if (r.comment) {
                      <p class="break-words text-fg">{{ r.comment }}</p>
                    } @else {
                      <p class="text-fg-muted">{{ 'feedback.answers.noComment' | transloco }}</p>
                    }
                    @if (survey(); as sv) {
                      <details class="mt-1">
                        <summary class="cursor-pointer text-meta font-semibold text-accent">
                          {{ 'feedback.answers.showAll' | transloco }}
                        </summary>
                        <dl
                          class="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-meta sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
                        >
                          @for (q of sv.questions; track q.id) {
                            @if (answerText(r, q.id); as a) {
                              <dt class="text-fg-muted">{{ q.label }}</dt>
                              <dd class="mb-1 font-semibold break-words text-fg sm:mb-0">
                                {{ a }}
                              </dd>
                            }
                          }
                        </dl>
                      </details>
                    }
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5">
                    @if (r.score !== null) {
                      <app-badge [tone]="r.low_score ? 'warn' : 'pass'">{{
                        'feedback.responses.score' | transloco: { score: r.score }
                      }}</app-badge>
                    }
                    @if (r.low_score) {
                      <app-badge tone="warn" data-testid="answer-low">{{
                        'feedback.answers.low' | transloco
                      }}</app-badge>
                    }
                  </div>
                  <div class="flex flex-wrap items-center gap-2 text-meta">
                    @if (r.feedback_id) {
                      <a
                        [routerLink]="['/feedback/items', r.feedback_id]"
                        class="font-semibold text-accent hover:underline"
                        [attr.data-testid]="'answer-feedback-' + r.id"
                      >
                        {{
                          'feedback.answers.openFeedback'
                            | transloco: { code: r.feedback_code || '' }
                        }}
                      </a>
                    } @else if (canWrite()) {
                      <app-button
                        size="sm"
                        variant="secondary"
                        [loading]="busy() === r.id + ':feedback'"
                        [disabled]="!!busy()"
                        (click)="makeFeedback(r)"
                        [attr.data-testid]="'answer-make-feedback-' + r.id"
                      >
                        {{ 'feedback.answers.makeFeedback' | transloco }}
                      </app-button>
                    }
                    @if (canWrite() && canDeviate()) {
                      <app-button
                        size="sm"
                        variant="ghost"
                        [loading]="busy() === r.id + ':deviation'"
                        [disabled]="!!busy()"
                        (click)="makeDeviation(r)"
                        [attr.data-testid]="'answer-make-deviation-' + r.id"
                      >
                        {{ 'feedback.answers.makeDeviation' | transloco }}
                      </app-button>
                    }
                    @if (canManage()) {
                      <button
                        type="button"
                        class="inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-subtle outline-none hover:bg-surface-2 hover:text-fail focus-visible:ring-2 focus-visible:ring-accent"
                        [attr.aria-label]="'feedback.responses.delete' | transloco"
                        (click)="deleting.set(r)"
                      >
                        <app-icon name="trash" [size]="14" />
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
            @if (total() > page) {
              <div class="mt-2">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="page"
                  [count]="items().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      }
    </section>

    <app-confirm-dialog
      [open]="!!deleting()"
      [title]="'feedback.responses.deleteTitle' | transloco"
      [message]="'feedback.responses.deleteMessage' | transloco"
      [confirmLabel]="'feedback.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="!!busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class SurveyAnswers {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly flows = inject(CreateFlowService);

  /** One survey's answers; null lists every survey's ("Svar fra undersøkelser"). */
  readonly survey = input<Survey | null>(null);
  /** The count the answers were opened from (cleared with `scopeCleared`). */
  readonly scope = input<AnswerScope | null>(null);
  readonly scopeCleared = output<void>();
  readonly canWrite = input(false);
  readonly canManage = input(false);
  /** The user may register deviations (`deviations:write`). */
  readonly canDeviate = input(false);
  /** The answers changed (one deleted or turned into feedback). */
  readonly changed = output<void>();
  /** The total number of answers (unfiltered), for the view switch. */
  readonly counted = output<number>();

  private static nextId = 0;
  protected readonly headingId = `cf-sv-answers-${SurveyAnswers.nextId++}`;
  protected readonly control = CONTROL;
  protected readonly page = PAGE;
  protected readonly hasFeedbackFilters = HAS_FEEDBACK_FILTERS;

  protected readonly q = signal('');
  protected readonly low = signal(false);
  protected readonly hasFeedback = signal<HasFeedbackFilter>('');
  protected readonly offset = signal(0);
  private readonly reloads = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly SurveyResponse[]>([]);
  protected readonly total = signal(0);
  protected readonly threshold = signal<number | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly deleting = signal<SurveyResponse | null>(null);

  protected readonly filtered = computed(
    () => !!this.q() || this.low() || !!this.hasFeedback() || !!this.scope(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.survey()?.id ?? null;
      const query = answersQuery(this.q(), this.low(), this.hasFeedback(), this.scope());
      const offset = this.offset();
      this.reloads();
      untracked(() => this.load(orgId, id, query, offset));
    });
  }

  protected respondent(r: SurveyResponse): string {
    return [r.respondent_name, r.respondent_email].filter(Boolean).join(' · ');
  }

  /** An answer to one question as display text ('' when unanswered). */
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

  protected search(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setLow(value: boolean): void {
    this.offset.set(0);
    this.low.set(value);
  }

  protected setHasFeedback(value: string): void {
    this.offset.set(0);
    this.hasFeedback.set(
      (HAS_FEEDBACK_FILTERS as readonly string[]).includes(value)
        ? (value as HasFeedbackFilter)
        : '',
    );
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  /** The answer becomes a feedback record in the register (the caller owns it). */
  protected makeFeedback(r: SurveyResponse): void {
    this.toFeedback(r, 'feedback', (id, code) => {
      this.notifications.success('feedback.answers.created', { code });
      this.patch(r.id, id, code);
    });
  }

  /** Via the answer's feedback record (made first when missing), open a linked deviation. */
  protected makeDeviation(r: SurveyResponse): void {
    if (r.feedback_id) {
      void this.flows.start(DEVIATION_FLOW, FEEDBACK_ENTITY, r.feedback_id);
      return;
    }
    this.toFeedback(r, 'deviation', (id, code) => {
      this.patch(r.id, id, code);
      void this.flows.start(DEVIATION_FLOW, FEEDBACK_ENTITY, id);
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const response = this.deleting();
    if (!orgId || !response || this.busy()) {
      return;
    }
    this.busy.set(response.id + ':delete');
    this.api.deleteResponse(orgId, this.surveyOf(response), response.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.deleting.set(null);
        this.notifications.success('feedback.notices.responseDeleted');
        this.reload();
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  private toFeedback(
    r: SurveyResponse,
    purpose: 'feedback' | 'deviation',
    done: (id: string, code: string | null) => void,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(`${r.id}:${purpose}`);
    this.api
      .responseToFeedback(orgId, this.surveyOf(r), r.id, {
        kind: purpose === 'deviation' ? 'complaint' : undefined,
      })
      .subscribe({
        next: (feedback) => {
          this.busy.set(null);
          done(feedback.id, feedback.code);
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.busy.set(null);
          // Someone else made it a moment ago: show the record that exists.
          const existing = codedErrorDetail(error);
          if (existing?.code === 'feedback_exists') {
            this.reload();
          }
          this.notifications.error(feedbackErrorKey(error));
        },
      });
  }

  /** The survey an answer belongs to (each row names it in the cross-survey list). */
  private surveyOf(r: SurveyResponse): string {
    return this.survey()?.id ?? r.survey_id ?? '';
  }

  private patch(responseId: string, feedbackId: string, code: string | null): void {
    this.items.update((items) =>
      items.map((i) =>
        i.id === responseId ? { ...i, feedback_id: feedbackId, feedback_code: code } : i,
      ),
    );
  }

  private load(
    orgId: string | null,
    id: string | null,
    query: SurveyResponseQuery,
    offset: number,
  ): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    const page = id
      ? this.api.responses(orgId, id, PAGE, offset, query)
      : this.api.allResponses(orgId, PAGE, offset, query);
    this.request = page.subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.threshold.set(page.low_score_threshold ?? null);
        this.state.set('ready');
        if (!answersFiltered(query)) {
          this.counted.emit(page.total);
        }
      },
      error: () => this.state.set('error'),
    });
  }
}

function answersFiltered(query: SurveyResponseQuery): boolean {
  return (
    !!query.q ||
    !!query.low ||
    query.has_feedback !== undefined ||
    !!query.value ||
    !!query.nps_group ||
    !!query.submitted_from ||
    !!query.submitted_to ||
    !!query.survey_id
  );
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { FeedbackApi } from '../data/feedback-api';
import { sortKey, surveyStatusKey, surveyStatusTone } from '../data/feedback-display';
import {
  PERM_MANAGE,
  SURVEY_ENTITY,
  SURVEY_SORTS,
  SURVEY_STATUSES,
  SurveyListItem,
  SurveySort,
  SurveyStatus,
} from '../data/feedback.models';
import { FeedbackTabs } from '../feedback-tabs';
import { FeedbackLessonLink } from '../lesson-link';

const PAGE_SIZE = 25;

/**
 * Satisfaction surveys (`/feedback/surveys`): each survey's status, response
 * count and average score, with search, a status filter, sorting and saved views.
 */
@Component({
  selector: 'app-surveys-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    GuideIntro,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    FeedbackTabs,
    FeedbackLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="feedback.surveys.title"
      scope="feedback"
      page="surveys"
      searchPlaceholderKey="feedback.surveys.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <p class="text-[14px] text-fg-muted">{{ 'feedback.surveys.subtitle' | transloco }}</p>
        <app-feedback-tabs />
        <app-guide-intro scope="feedback" page="surveys" />
      </div>

      <app-tour-button toolbar scope="feedback" tour="surveys" />
      @if (canManage()) {
        <app-button
          toolbar
          size="sm"
          (click)="newSurvey()"
          appTourStep="feedback-survey-new"
          data-testid="new-survey"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'feedback.surveys.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-sv-status">
        {{ 'feedback.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-sv-status"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setStatus($any($event.target).value)"
        data-testid="survey-filter-status"
      >
        <option value="" [selected]="!status()">
          {{ 'feedback.filters.statusOptions.all' | transloco }}
        </option>
        @for (s of statuses; track s) {
          <option [value]="s" [selected]="status() === s">{{ statusKey(s) | transloco }}</option>
        }
      </select>
      <label filters class="sr-only" for="cf-sv-sort">
        {{ 'feedback.filters.sort' | transloco }}
      </label>
      <select
        filters
        id="cf-sv-sort"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setSort($any($event.target).value)"
      >
        @for (s of sorts; track s) {
          <option [value]="s" [selected]="sort() === s">
            {{ 'feedback.sorts.' + sortKey(s) | transloco }}
          </option>
        }
      </select>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'feedback.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'feedback.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'feedback.surveys.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="survey-rows">
                @for (s of rows(); track s.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/feedback/surveys', s.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                          s.code
                        }}</span>
                        <span class="truncate">{{ s.title }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{
                          'feedback.surveys.questionCount' | transloco: { count: s.question_count }
                        }}</span>
                        <span>{{
                          (s.anonymous ? 'feedback.surveys.anonymous' : 'feedback.surveys.named')
                            | transloco
                        }}</span>
                        @if (s.closes_on) {
                          <span>{{
                            'feedback.surveys.closesOn'
                              | transloco: { date: (s.closes_on | localDay) }
                          }}</span>
                        }
                        @if (s.owner?.name; as ownerName) {
                          <span>{{ 'feedback.list.owner' | transloco: { name: ownerName } }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-3 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="statusTone(s.status)">{{
                        statusKey(s.status) | transloco
                      }}</app-badge>
                      <span>{{
                        'feedback.surveys.responses' | transloco: { count: s.response_count }
                      }}</span>
                      <span class="min-w-[90px] text-right">
                        @if (s.average_score !== null) {
                          {{
                            'feedback.surveys.averageScore'
                              | transloco: { score: (s.average_score | localNumber: '1.0-0') }
                          }}
                        } @else {
                          {{ 'feedback.surveys.noScore' | transloco }}
                        }
                      </span>
                    </span>
                  </li>
                }
              </ul>
              <div class="border-t border-border px-4 py-2.5">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="rows().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="feedback" page="surveys" />
        <app-feedback-lesson-link lesson="measuring-satisfaction" />
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="feedback"
            page="surveys"
            [showAction]="canManage()"
            (action)="newSurvey()"
          />
        </app-card>
        <app-why-it-matters scope="feedback" page="surveys" />
        <app-feedback-lesson-link lesson="measuring-satisfaction" />
      </div>
    </app-record-list-page>
  `,
})
export class SurveysList {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly statuses = SURVEY_STATUSES;
  protected readonly sorts = SURVEY_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = surveyStatusKey;
  protected readonly statusTone = surveyStatusTone;
  protected readonly sortKey = sortKey;

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_MANAGE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<SurveyStatus | ''>('');
  protected readonly sort = signal<SurveySort>('-updated_at');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly SurveyListItem[]>([]);
  protected readonly total = signal(0);

  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.q() && !this.status(),
  );
  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    sort: this.sort(),
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'feedback',
      entityType: SURVEY_ENTITY,
      view: 'list',
      title: this.language.translate('feedback.surveys.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const status = this.status();
      const query = {
        q: this.q() || undefined,
        status: status ? [status] : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set(
      (SURVEY_STATUSES as readonly string[]).includes(value) ? (value as SurveyStatus) : '',
    );
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (SURVEY_SORTS as readonly string[]).includes(value) ? (value as SurveySort) : '-updated_at',
    );
  }

  protected applyView(view: SavedView): void {
    this.setStatus(view.filters['status'] ?? '');
    this.setSort(view.filters['sort'] ?? '-updated_at');
  }

  protected newSurvey(): void {
    void this.router.navigate(['/feedback/surveys/new']);
  }

  private load(orgId: string | null, query: Parameters<FeedbackApi['listSurveys']>[1]): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listSurveys(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

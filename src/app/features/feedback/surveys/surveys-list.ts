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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { FeedbackApi } from '../data/feedback-api';
import { round1, sortKey, surveyStatusKey } from '../data/feedback-display';
import {
  PERM_MANAGE,
  SURVEY_ENTITY,
  SURVEY_SORTS,
  SURVEY_STATUSES,
  SurveyListItem,
  SurveySort,
  SurveyStatus,
} from '../data/feedback.models';
import { FEEDBACK_NAV, FEEDBACK_SETTINGS_LINK } from '../feedback-nav';

const PAGE_SIZE = 25;
const DEFAULT_SORT: SurveySort = '-updated_at';

/**
 * Satisfaction surveys (`/feedback/surveys`): each survey's status, number of
 * answers and score, with search, a status filter, sorting and saved views.
 */
@Component({
  selector: 'app-surveys-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="feedback.surveys.title"
      descriptionKey="feedback.surveys.subtitle"
      [breadcrumbs]="[
        { labelKey: 'modules.names.feedback', link: '/feedback' },
        { labelKey: 'feedback.tabs.surveys' },
      ]"
      [settingsLink]="settingsLink"
      scope="feedback"
      page="surveys"
      searchPlaceholderKey="feedback.surveys.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="sort() !== defaultSort ? 1 : 0"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (canManage()) {
        <app-button
          primary
          (click)="newSurvey()"
          appTourStep="feedback-survey-new"
          data-testid="new-survey"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'feedback.surveys.new' | transloco }}
        </app-button>
      }

      <app-module-nav nav labelKey="modules.names.feedback" [items]="nav" />
      <app-help-strip
        help
        scope="feedback"
        page="surveys"
        tour="surveys"
        lesson="measuring-satisfaction"
      />

      <label filters class="sr-only" for="cf-sv-status">
        {{ 'feedback.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-sv-status"
        class="h-10 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none"
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

      <div more-filters class="flex flex-col gap-1">
        <label for="cf-sv-sort" class="text-meta font-semibold text-fg-muted">{{
          'feedback.filters.sort' | transloco
        }}</label>
        <select
          id="cf-sv-sort"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'feedback.sorts.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="4" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (rows().length === 0) {
              <app-empty-state
                icon="search"
                titleKey="feedback.surveys.noMatch"
                ctaKey="feedback.list.resetFilters"
                ctaVariant="secondary"
                (cta)="resetFilters()"
                data-testid="no-match"
              />
            } @else {
              <div role="list" data-testid="survey-rows">
                <app-record-row-header dateKind="updated" [owner]="true" />
                @for (s of rows(); track s.id) {
                  <app-record-row
                    [code]="s.code"
                    [title]="s.title"
                    [subtitle]="subtitle(s)"
                    [link]="['/feedback/surveys', s.id]"
                    [owner]="s.owner?.name"
                    [date]="s.last_response_at ?? s.updated_at"
                    dateKind="updated"
                  >
                    <span coverage class="block max-w-full min-w-0 overflow-hidden">
                      <app-coverage-chip [entityType]="entityType" [entityId]="s.id" />
                    </span>
                    <span badges class="contents">
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="s.status"
                        [labelKey]="statusKey(s.status)"
                      />
                    </span>
                  </app-record-row>
                }
              </div>
              @if (total() > pageSize) {
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
        }
      </app-card>

      <app-why-it-matters below scope="feedback" page="surveys" />

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
      </div>
    </app-record-list-page>
  `,
})
export class SurveysList {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly entityType = SURVEY_ENTITY;
  protected readonly nav = FEEDBACK_NAV;
  protected readonly settingsLink = FEEDBACK_SETTINGS_LINK;
  protected readonly statuses = SURVEY_STATUSES;
  protected readonly sorts = SURVEY_SORTS;
  protected readonly defaultSort = DEFAULT_SORT;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = surveyStatusKey;
  protected readonly sortKey = sortKey;

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_MANAGE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<SurveyStatus | ''>('');
  protected readonly sort = signal<SurveySort>(DEFAULT_SORT);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly SurveyListItem[]>([]);
  protected readonly total = signal(0);
  private readonly reloads = signal(0);

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
      this.reloads();
      untracked(() => this.load(orgId, query));
    });
  }

  /** Questions · answers · score · anonymous / named, in the UI language. */
  protected subtitle(s: SurveyListItem): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [
      t('feedback.surveys.questionCount', { count: s.question_count }),
      t('feedback.surveys.responses', { count: s.response_count }),
      s.average_score !== null
        ? t('feedback.surveys.averageScore', { score: round1(s.average_score) })
        : t('feedback.surveys.noScore'),
      t(s.anonymous ? 'feedback.surveys.anonymous' : 'feedback.surveys.named'),
    ];
    return parts.join(' · ');
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
      (SURVEY_SORTS as readonly string[]).includes(value) ? (value as SurveySort) : DEFAULT_SORT,
    );
  }

  protected applyView(view: SavedView): void {
    this.setStatus(view.filters['status'] ?? '');
    this.setSort(view.filters['sort'] ?? DEFAULT_SORT);
  }

  protected resetFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('');
    this.sort.set(DEFAULT_SORT);
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
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

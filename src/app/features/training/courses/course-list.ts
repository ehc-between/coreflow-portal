import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, TrainingAccess, courseBadge } from '../data/training-display';
import {
  COURSE_CATEGORIES,
  COURSE_KINDS,
  COURSE_STATUSES,
  Course,
  CourseCategory,
  CourseKind,
  CourseSort,
  CourseStatus,
  TrainingStats,
} from '../data/training.models';
import { FilterOption, FilterSelect } from '../shared/filter-select';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;
const SORTS: readonly CourseSort[] = ['title', 'code', '-updated_at', '-created_at'];

/** `/training/courses`: the course catalogue with search, filters, saved views and paging. */
@Component({
  selector: 'app-course-list',
  imports: [
    FulfilsRequirements,
    TranslocoPipe,
    Button,
    CoverageChip,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    LocalNumberPipe,
    ModuleNav,
    Pager,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    FilterSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="training.courses.title"
      descriptionKey="training.courses.subtitle"
      [breadcrumbs]="[
        { labelKey: 'modules.names.training', link: '/training' },
        { labelKey: 'training.courses.title' },
      ]"
      scope="training"
      page="courses"
      searchPlaceholderKey="training.courses.search"
      [query]="q()"
      [filters]="filters()"
      [moreFiltersActive]="(kind() ? 1 : 0) + (sort() !== 'title' ? 1 : 0)"
      [empty]="loaded() && !failed() && courses().length === 0 && !hasFilters()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="training.courses" />
      @if (access.canWrite()) {
        <app-button
          primary
          (click)="router.navigate(['/training/courses/new'])"
          data-testid="course-new"
          [appTourStep]="'training-new-course'"
        >
          <app-icon name="plus" [size]="15" />
          {{ 'training.courses.new' | transloco }}
        </app-button>
      }
      <app-module-nav nav [items]="access.navItems()" labelKey="training.nav.label" />
      <app-help-strip help scope="training" page="courses" tour="courses" />

      <!-- U35: the programme figures (for people who oversee training) are the register band. -->
      @if (access.canOversee() && stats(); as s) {
        <ng-container ngProjectAs="[kpis]">
          <app-kpi-tile
            link="/training/matrix"
            data-testid="kpi-completion"
            [title]="'training.stats.completionRateHelp' | transloco"
            [label]="'training.stats.completionRate' | transloco"
            [value]="'training.stats.pct' | transloco: { value: s.completion_rate }"
            [delta]="
              s.required !== undefined
                ? ('training.stats.completionOf'
                  | transloco: { compliant: s.compliant ?? 0, required: s.required })
                : ''
            "
            [tone]="s.completion_rate >= 90 ? 'pass' : 'warn'"
          />
          <app-kpi-tile
            link="/training/assignments"
            [queryParams]="{ overdue: 'true' }"
            [label]="'training.stats.overdue' | transloco"
            [value]="s.assignments_overdue | localNumber"
            [tone]="s.assignments_overdue ? 'warn' : 'neutral'"
          />
          <app-kpi-tile
            link="/training/records"
            [queryParams]="{ validity: 'expiring' }"
            [label]="'training.stats.expiring' | transloco"
            [value]="s.expiring_30_days | localNumber"
            [tone]="s.expiring_30_days ? 'warn' : 'neutral'"
          />
          <app-kpi-tile
            link="/training/records"
            [queryParams]="{ validity: 'expired' }"
            [label]="'training.stats.expired' | transloco"
            [value]="s.expired | localNumber"
            [tone]="s.expired ? 'fail' : 'neutral'"
          />
        </ng-container>
      }

      <app-training-filter
        filters
        [label]="'training.filters.status' | transloco"
        [value]="status()"
        [options]="statusOptions()"
        testId="filter-status"
        (valueChange)="setFilter('status', $event)"
      />
      <app-training-filter
        filters
        [label]="'training.filters.category' | transloco"
        [value]="category()"
        [options]="categoryOptions()"
        (valueChange)="setFilter('category', $event)"
      />
      <div more-filters class="flex flex-col gap-3">
        <app-training-filter
          [label]="'training.filters.kind' | transloco"
          [showLabel]="true"
          [value]="kind()"
          [options]="kindOptions()"
          (valueChange)="setFilter('kind', $event)"
        />
        <app-training-filter
          [label]="'training.filters.sort' | transloco"
          [showLabel]="true"
          [value]="sort()"
          [options]="sortOptions()"
          (valueChange)="setFilter('sort', $event)"
        />
      </div>

      @if (!loaded()) {
        <app-loading-state [rows]="5" />
      } @else if (failed()) {
        <app-error-state (retry)="reload()" />
      } @else if (courses().length === 0) {
        <app-empty-state
          icon="search"
          titleKey="ui.empty.noResults"
          ctaKey="training.filters.clear"
          ctaVariant="secondary"
          (cta)="clearFilters()"
          data-testid="courses-no-match"
        />
      } @else {
        <div
          role="list"
          class="overflow-hidden rounded-card border border-border bg-surface"
          data-testid="course-table"
          [attr.aria-label]="'training.courses.title' | transloco"
        >
          <app-record-row-header dateKind="updated" />
          @for (course of courses(); track course.id) {
            @let badge = statusBadge(course.status);
            <app-record-row
              [code]="course.code"
              [title]="course.title"
              [subtitle]="subtitle(course)"
              [link]="['/training/courses', course.id]"
              [owner]="course.owner?.name"
              [date]="course.updated_at"
              dateKind="updated"
            >
              <app-coverage-chip coverage entityType="course" [entityId]="course.id" />
              <app-status-badge
                badges
                [meaning]="badge.meaning"
                [value]="badge.value"
                [labelKey]="badge.labelKey"
              />
            </app-record-row>
          }
        </div>
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="courses().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <app-teaching-empty
        empty
        scope="training"
        page="courses"
        [showAction]="access.canWrite()"
        (action)="router.navigate(['/training/courses/new'])"
      />
      @if (access.canOversee() && stats(); as s) {
        <p below class="mb-4 text-meta text-fg-muted" data-testid="training-effectiveness">
          {{
            'training.stats.effectiveness'
              | transloco
                : {
                    effective: s.effectiveness.effective,
                    partial: s.effectiveness.partially_effective,
                    not: s.effectiveness.not_effective,
                    pending: s.effectiveness.not_evaluated,
                  }
          }}
          @if (s.average_feedback !== null) {
            ·
            {{
              'training.stats.feedback'
                | transloco: { rating: (s.average_feedback | localNumber: '1.1-1') }
            }}
          }
        </p>
      }
      <app-why-it-matters below scope="training" page="courses" />
    </app-record-list-page>
  `,
})
export class CourseList {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  protected readonly access = inject(TrainingAccess);
  protected readonly router = inject(Router);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly q = signal('');
  /** `?status=published` (U24: the "Published courses" tile). */
  private readonly statusParam = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('status') ?? undefined,
  );
  protected readonly status = linkedSignal<CourseStatus | ''>(() => {
    const v = this.statusParam() ?? '';
    return (COURSE_STATUSES as readonly string[]).includes(v) ? (v as CourseStatus) : '';
  });
  protected readonly category = signal<CourseCategory | ''>('');
  protected readonly kind = signal<CourseKind | ''>('');
  protected readonly sort = signal<CourseSort>('title');
  protected readonly offset = signal(0);
  private readonly tick = signal(0);

  protected readonly courses = signal<readonly Course[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly statusBadge = courseBadge;
  /** Programme figures for people who oversee training (U35: moved from Min opplæring). */
  protected readonly stats = signal<TrainingStats | null>(null);

  protected readonly filters = computed(() => ({
    status: this.status(),
    category: this.category(),
    kind: this.kind(),
    sort: this.sort(),
  }));
  protected readonly hasFilters = computed(
    () => !!(this.q() || this.status() || this.category() || this.kind()),
  );

  protected readonly statusOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allStatuses') },
    ...COURSE_STATUSES.map((s) => ({
      value: s,
      label: this.language.translate(`training.status.${s}`),
    })),
  ]);
  protected readonly categoryOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allCategories') },
    ...COURSE_CATEGORIES.map((c) => ({
      value: c,
      label: this.language.translate(`training.category.${c}`),
    })),
  ]);
  protected readonly kindOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allKinds') },
    ...COURSE_KINDS.map((k) => ({
      value: k,
      label: this.language.translate(`training.kind.${k}`),
    })),
  ]);
  protected readonly sortOptions = computed<FilterOption[]>(() =>
    SORTS.map((s) => ({ value: s, label: this.language.translate(`training.sort.${s}`) })),
  );

  private sub: Subscription | null = null;
  private statsSub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      entityType: 'course',
      view: 'list',
      title: this.language.translate('training.courses.title'),
    }));
    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      this.statsSub?.unsubscribe();
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const oversee = this.access.canOversee();
      untracked(() => {
        this.statsSub?.unsubscribe();
        this.stats.set(null);
        if (orgId && oversee) {
          this.statsSub = this.api.stats(orgId).subscribe({
            next: (st) => this.stats.set(st),
            error: () => this.stats.set(null),
          });
        }
      });
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.tick();
      const query = {
        q: this.q(),
        status: this.status() ? [this.status() as CourseStatus] : [],
        category: this.category(),
        kind: this.kind(),
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.failed.set(false);
        this.sub = this.api.listCourses(orgId, query).subscribe({
          next: (res) => {
            this.courses.set(res.items);
            this.total.set(res.total);
            this.loaded.set(true);
          },
          error: () => {
            this.failed.set(true);
            this.loaded.set(true);
          },
        });
      });
    });
  }

  protected reload(): void {
    this.tick.update((n) => n + 1);
  }

  /** "Informasjonssikkerhet · Nettkurs · 4 leksjoner" (AI drafts say so). */
  protected subtitle(course: Course): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(`training.category.${course.category}`), t(`training.kind.${course.kind}`)];
    if (course.kind !== 'external') {
      parts.push(
        t(course.lesson_count === 1 ? 'training.courses.lessonsOne' : 'training.courses.lessons', {
          count: course.lesson_count,
        }),
      );
    }
    if (course.source === 'ai') {
      parts.push(t('training.courses.aiDraft'));
    }
    return parts.join(' · ');
  }

  protected setQuery(text: string): void {
    this.q.set(text);
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.q.set('');
    this.status.set('');
    this.category.set('');
    this.kind.set('');
    this.offset.set(0);
  }

  protected setFilter(name: 'status' | 'category' | 'kind' | 'sort', value: string): void {
    switch (name) {
      case 'status':
        this.status.set(
          (COURSE_STATUSES as readonly string[]).includes(value) ? (value as CourseStatus) : '',
        );
        break;
      case 'category':
        this.category.set(
          (COURSE_CATEGORIES as readonly string[]).includes(value) ? (value as CourseCategory) : '',
        );
        break;
      case 'kind':
        this.kind.set(
          (COURSE_KINDS as readonly string[]).includes(value) ? (value as CourseKind) : '',
        );
        break;
      case 'sort':
        this.sort.set(
          (SORTS as readonly string[]).includes(value) ? (value as CourseSort) : 'title',
        );
        break;
    }
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.setFilter('status', f['status'] ?? '');
    this.setFilter('category', f['category'] ?? '');
    this.setFilter('kind', f['kind'] ?? '');
    this.setFilter('sort', f['sort'] ?? 'title');
  }
}

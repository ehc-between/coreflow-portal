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
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, TrainingAccess, courseStatusTone } from '../data/training-display';
import {
  COURSE_CATEGORIES,
  COURSE_KINDS,
  COURSE_STATUSES,
  Course,
  CourseCategory,
  CourseKind,
  CourseSort,
  CourseStatus,
} from '../data/training.models';
import { FilterOption, FilterSelect } from '../shared/filter-select';
import { TrainingNav } from '../training-nav';

const PAGE_SIZE = 25;
const SORTS: readonly CourseSort[] = ['title', 'code', '-updated_at', '-created_at'];

/** `/training/courses`: the course catalogue with search, filters, saved views and paging. */
@Component({
  selector: 'app-course-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Badge,
    Button,
    Icon,
    Pager,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    RecordListPage,
    FilterSelect,
    TrainingNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-nav />
    <app-record-list-page
      titleKey="training.courses.title"
      scope="training"
      page="courses"
      searchPlaceholderKey="training.courses.search"
      [query]="q()"
      [filters]="filters()"
      [empty]="loaded() && courses().length === 0 && !hasFilters()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3 grid gap-3 lg:grid-cols-[1fr_300px]">
        <app-guide-intro scope="training" page="courses" />
        <app-why-it-matters scope="training" page="courses" />
      </div>
      <app-tour-button toolbar scope="training" tour="courses" />
      @if (access.canWrite()) {
        <a toolbar routerLink="/training/courses/new" [appTourStep]="'training-new-course'">
          <app-button data-testid="course-new">
            <app-icon name="plus" [size]="15" />
            {{ 'training.courses.new' | transloco }}
          </app-button>
        </a>
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
      <app-training-filter
        filters
        [label]="'training.filters.kind' | transloco"
        [value]="kind()"
        [options]="kindOptions()"
        (valueChange)="setFilter('kind', $event)"
      />
      <app-training-filter
        filters
        [label]="'training.filters.sort' | transloco"
        [value]="sort()"
        [options]="sortOptions()"
        (valueChange)="setFilter('sort', $event)"
      />

      @if (failed()) {
        <p class="text-[13.5px] text-fail" role="alert">
          {{ 'training.errors.loadFailed' | transloco }}
        </p>
      } @else if (loaded() && courses().length === 0) {
        <p class="py-8 text-center text-[13.5px] text-fg-muted" data-testid="courses-no-match">
          {{ 'training.courses.noMatch' | transloco }}
        </p>
      } @else {
        <div class="overflow-x-auto rounded-card border border-border bg-surface">
          <table class="w-full min-w-[720px] text-left text-[13px]" data-testid="course-table">
            <caption class="sr-only">
              {{
                'training.courses.title' | transloco
              }}
            </caption>
            <thead class="border-b border-border text-[12px] text-fg-muted">
              <tr>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.code' | transloco }}
                </th>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.title' | transloco }}
                </th>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.category' | transloco }}
                </th>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.kind' | transloco }}
                </th>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.status' | transloco }}
                </th>
                <th scope="col" class="px-4 py-2.5 text-right font-semibold">
                  {{ 'training.fields.lessons' | transloco }}
                </th>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.updated' | transloco }}
                </th>
              </tr>
            </thead>
            <tbody>
              @for (course of courses(); track course.id) {
                <tr class="border-b border-border last:border-0 hover:bg-surface-2">
                  <td class="px-4 py-2.5 font-mono text-[12px] text-fg-muted">{{ course.code }}</td>
                  <td class="px-4 py-2.5">
                    <a
                      [routerLink]="['/training/courses', course.id]"
                      class="font-semibold text-fg hover:text-accent"
                      >{{ course.title }}</a
                    >
                    @if (course.source === 'ai') {
                      <span class="ml-1.5 text-[11.5px] text-fg-subtle">
                        {{ 'training.courses.aiDraft' | transloco }}
                      </span>
                    }
                  </td>
                  <td class="px-4 py-2.5 text-fg-muted">
                    {{ 'training.category.' + course.category | transloco }}
                  </td>
                  <td class="px-4 py-2.5 text-fg-muted">
                    {{ 'training.kind.' + course.kind | transloco }}
                  </td>
                  <td class="px-4 py-2.5">
                    <app-badge [tone]="statusTone(course.status)">
                      {{ 'training.status.' + course.status | transloco }}
                    </app-badge>
                  </td>
                  <td class="px-4 py-2.5 text-right text-fg-muted">{{ course.lesson_count }}</td>
                  <td class="px-4 py-2.5 text-fg-muted">{{ course.updated_at | localDate }}</td>
                </tr>
              }
            </tbody>
          </table>
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
  protected readonly status = signal<CourseStatus | ''>('');
  protected readonly category = signal<CourseCategory | ''>('');
  protected readonly kind = signal<CourseKind | ''>('');
  protected readonly sort = signal<CourseSort>('title');
  protected readonly offset = signal(0);

  protected readonly courses = signal<readonly Course[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);

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

  constructor() {
    providePageContext(() => ({ module: TRAINING_MODULE, entityType: 'course', view: 'list' }));
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
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

  protected statusTone(status: string) {
    return courseStatusTone(status);
  }

  protected setQuery(text: string): void {
    this.q.set(text);
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

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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, TrainingAccess } from '../data/training-display';
import {
  ASSIGNMENT_STATUSES,
  Assignment,
  AssignmentSort,
  AssignmentStatus,
} from '../data/training.models';
import { AssignDialog } from '../shared/assign-dialog';
import { AssignmentTable } from '../shared/assignment-table';
import { FilterOption, FilterSelect } from '../shared/filter-select';
import { TrainingNav } from '../training-nav';

const PAGE_SIZE = 50;
const SORTS: readonly AssignmentSort[] = ['due_at', '-due_at', '-created_at', '-completed_at'];
type Scope = 'mine' | 'all';
type StatusFilter = '' | 'open' | 'overdue' | AssignmentStatus;

/** Filter text match on course code/title and person name (the page loaded). */
export function matchesAssignment(a: Assignment, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return (
    !needle ||
    a.course.title.toLowerCase().includes(needle) ||
    a.course.code.toLowerCase().includes(needle) ||
    a.user.name.toLowerCase().includes(needle)
  );
}

/** The API filters for a status filter value. */
export function statusQuery(status: StatusFilter): {
  status?: AssignmentStatus[];
  overdue?: boolean;
} {
  switch (status) {
    case '':
      return {};
    case 'open':
      return { status: ['assigned', 'in_progress'] };
    case 'overdue':
      return { status: ['assigned', 'in_progress'], overdue: true };
    default:
      return { status: [status] };
  }
}

/**
 * `/training/assignments`: training assignments. Learners see their own; people
 * who oversee training can switch to everyone's and assign courses.
 * `?course=<id>` narrows the list to one course.
 */
@Component({
  selector: 'app-assignment-list',
  imports: [
    TranslocoPipe,
    Button,
    Icon,
    Pager,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    RecordListPage,
    AssignDialog,
    AssignmentTable,
    FilterSelect,
    TrainingNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-nav />
    <app-record-list-page
      titleKey="training.assignments.title"
      scope="training"
      page="assignments"
      searchPlaceholderKey="training.assignments.search"
      [query]="q()"
      [filters]="filters()"
      [empty]="loaded() && items().length === 0 && !hasFilters()"
      (search)="q.set($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3 grid gap-3 lg:grid-cols-[1fr_300px]">
        <app-guide-intro scope="training" page="assignments" />
        <app-why-it-matters scope="training" page="assignments" />
      </div>
      @if (access.canAssign()) {
        <app-button toolbar (click)="assignOpen.set(true)" data-testid="assign-open">
          <app-icon name="userplus" [size]="15" />
          {{ 'training.assignments.assign' | transloco }}
        </app-button>
      }

      @if (access.canOversee()) {
        <app-training-filter
          filters
          [label]="'training.filters.scope' | transloco"
          [value]="scope()"
          [options]="scopeOptions()"
          testId="filter-scope"
          (valueChange)="setScope($event)"
        />
      }
      <app-training-filter
        filters
        [label]="'training.filters.status' | transloco"
        [value]="status()"
        [options]="statusOptions()"
        (valueChange)="setStatus($event)"
      />
      <app-training-filter
        filters
        [label]="'training.filters.sort' | transloco"
        [value]="sort()"
        [options]="sortOptions()"
        (valueChange)="setSort($event)"
      />

      @if (courseFilter()) {
        <p class="mb-3 flex items-center gap-2 text-[12.5px] text-fg-muted">
          {{ 'training.assignments.courseFilter' | transloco }}
          <button
            type="button"
            class="font-semibold text-accent hover:underline"
            (click)="clearCourse()"
          >
            {{ 'training.assignments.clearCourse' | transloco }}
          </button>
        </p>
      }

      @if (failed()) {
        <p class="text-[13.5px] text-fail" role="alert">
          {{ 'training.errors.loadFailed' | transloco }}
        </p>
      } @else if (loaded() && visible().length === 0) {
        <p class="py-8 text-center text-[13.5px] text-fg-muted">
          {{ 'training.assignments.noMatch' | transloco }}
        </p>
      } @else {
        <app-training-assignment-table [assignments]="visible()" [showUser]="scope() === 'all'" />
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <app-teaching-empty
        empty
        scope="training"
        page="assignments"
        (action)="router.navigate(['/training/courses'])"
      />
    </app-record-list-page>

    <app-training-assign-dialog
      [open]="assignOpen()"
      (closed)="assignOpen.set(false)"
      (assigned)="reload()"
    />
  `,
})
export class AssignmentList {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  protected readonly access = inject(TrainingAccess);
  protected readonly router = inject(Router);

  /** `?course=` query param. */
  readonly course = input<string | undefined>(undefined);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly courseFilter = linkedSignal(() => this.course() ?? '');
  protected readonly scope = linkedSignal<Scope>(() => (this.access.canOversee() ? 'all' : 'mine'));
  protected readonly status = signal<StatusFilter>('open');
  protected readonly sort = signal<AssignmentSort>('due_at');
  protected readonly q = signal('');
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Assignment[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly assignOpen = signal(false);
  private readonly reloadTick = signal(0);

  protected readonly visible = computed(() =>
    this.items().filter((a) => matchesAssignment(a, this.q())),
  );
  protected readonly filters = computed(() => ({
    scope: this.scope(),
    status: this.status(),
    sort: this.sort(),
  }));
  protected readonly hasFilters = computed(
    () => !!this.q() || this.status() !== 'open' || !!this.courseFilter(),
  );

  protected readonly scopeOptions = computed<FilterOption[]>(() => [
    { value: 'mine', label: this.language.translate('training.filters.mine') },
    { value: 'all', label: this.language.translate('training.filters.everyone') },
  ]);
  protected readonly statusOptions = computed<FilterOption[]>(() => [
    { value: 'open', label: this.language.translate('training.filters.open') },
    { value: 'overdue', label: this.language.translate('training.filters.overdue') },
    ...ASSIGNMENT_STATUSES.map((s) => ({
      value: s,
      label: this.language.translate(`training.assignmentStatus.${s}`),
    })),
    { value: '', label: this.language.translate('training.filters.allStatuses') },
  ]);
  protected readonly sortOptions = computed<FilterOption[]>(() =>
    SORTS.map((s) => ({ value: s, label: this.language.translate(`training.sort.${s}`) })),
  );

  private sub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      entityType: 'training_assignment',
      view: 'list',
    }));
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reloadTick();
      const query = {
        ...statusQuery(this.status()),
        mine: this.scope() === 'mine',
        course_id: this.courseFilter() || undefined,
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
        this.sub = this.api.listAssignments(orgId, query).subscribe({
          next: (res) => {
            this.items.set(res.items);
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

  reload(): void {
    this.reloadTick.update((n) => n + 1);
  }

  protected setScope(value: string): void {
    this.scope.set(value === 'all' ? 'all' : 'mine');
    this.offset.set(0);
  }

  protected setStatus(value: string): void {
    const allowed = ['', 'open', 'overdue', ...ASSIGNMENT_STATUSES];
    this.status.set(allowed.includes(value) ? (value as StatusFilter) : 'open');
    this.offset.set(0);
  }

  protected setSort(value: string): void {
    this.sort.set(
      (SORTS as readonly string[]).includes(value) ? (value as AssignmentSort) : 'due_at',
    );
    this.offset.set(0);
  }

  protected clearCourse(): void {
    this.courseFilter.set('');
    void this.router.navigate([], { queryParams: { course: null }, replaceUrl: true });
  }

  protected applyView(view: SavedView): void {
    if (view.filters['scope']) {
      this.setScope(view.filters['scope']);
    }
    this.setStatus(view.filters['status'] ?? 'open');
    this.setSort(view.filters['sort'] ?? 'due_at');
  }
}

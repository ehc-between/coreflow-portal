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
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  addDaysInput,
  exportFileName,
  fromDateInput,
  saveBlob,
  trainingErrorKey,
} from '../data/training-display';
import {
  ASSIGNMENT_STATUSES,
  Assignment,
  AssignmentCounts,
  AssignmentQuery,
  AssignmentSort,
  AssignmentStatus,
  BulkAction,
} from '../data/training.models';
import { AssignmentTable, groupAssignments } from '../shared/assignment-table';
import { FilterOption, FilterSelect } from '../shared/filter-select';

const PAGE_SIZE = 50;
const SORTS: readonly AssignmentSort[] = ['due_at', '-due_at', '-created_at', '-completed_at'];
type Scope = 'mine' | 'all';
type StatusFilter = '' | 'open' | 'overdue' | AssignmentStatus;
type GroupBy = '' | 'course' | 'person';
const STATUS_CHIPS: readonly StatusFilter[] = ['open', 'overdue', 'completed', 'cancelled', ''];

/** Filter text match on course code/title and person name (kept for local filters). */
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

/** The count shown on a status chip (null while the backend sends no counts). */
export function chipCount(counts: AssignmentCounts | undefined, chip: StatusFilter): number | null {
  if (!counts) {
    return null;
  }
  switch (chip) {
    case 'open':
      return counts.assigned + counts.in_progress;
    case 'overdue':
      return counts.overdue;
    case '':
      return counts.assigned + counts.in_progress + counts.completed + counts.cancelled;
    default:
      return counts[chip] ?? null;
  }
}

/**
 * `/training/assignments`: who must complete which course by when. Learners see
 * their own; people who oversee training see everyone's, search across all pages,
 * group by course or person, send reminders, extend or cancel many at once, and
 * export the list. `?course=<id>` and `?overdue=true` narrow it (deep links from
 * a course and from the home page's "do this now").
 */
@Component({
  selector: 'app-assignment-list',
  imports: [
    FormsModule,
    TranslocoPipe,
    Alert,
    Button,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    TeachingEmpty,
    WhyItMatters,
    RecordListPage,
    AssignmentTable,
    FilterSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="training.assignments.title"
      descriptionKey="training.assignments.subtitle"
      [breadcrumbs]="[
        { labelKey: 'modules.names.training', link: '/training' },
        { labelKey: 'training.assignments.title' },
      ]"
      scope="training"
      page="assignments"
      searchPlaceholderKey="training.assignments.search"
      [query]="q()"
      [filters]="filters()"
      [moreFiltersActive]="sort() !== 'due_at' ? 1 : 0"
      [empty]="loaded() && !failed() && items().length === 0 && !hasFilters()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (access.canAssign()) {
        <app-button
          primary
          (click)="router.navigate(['/training/assignments/new'])"
          data-testid="assign-open"
        >
          <app-icon name="userplus" [size]="15" />
          {{ 'training.assignments.assign' | transloco }}
        </app-button>
      }
      @if (access.canOversee()) {
        <app-button
          secondary
          variant="secondary"
          [loading]="exporting()"
          (click)="exportCsv()"
          data-testid="assignments-export"
        >
          {{ 'training.export.csv' | transloco }}
        </app-button>
      }
      <app-module-nav nav [items]="access.navItems()" labelKey="training.nav.label" />
      <app-help-strip help scope="training" page="assignments" />

      @if (access.canOversee()) {
        <ng-container ngProjectAs="[filters]">
          <app-training-filter
            [label]="'training.filters.scope' | transloco"
            [value]="scope()"
            [options]="scopeOptions()"
            testId="filter-scope"
            (valueChange)="setScope($event)"
          />
          <app-training-filter
            [label]="'training.filters.groupBy' | transloco"
            [value]="groupBy()"
            [options]="groupOptions()"
            testId="filter-group"
            (valueChange)="setGroup($event)"
          />
        </ng-container>
      }
      <div more-filters>
        <app-training-filter
          [label]="'training.filters.sort' | transloco"
          [showLabel]="true"
          [value]="sort()"
          [options]="sortOptions()"
          (valueChange)="setSort($event)"
        />
      </div>

      <div
        class="mb-3 flex flex-wrap gap-1.5"
        role="group"
        [attr.aria-label]="'training.filters.status' | transloco"
        data-testid="status-chips"
      >
        @for (chip of chips; track chip) {
          @let n = count(chip);
          <button
            type="button"
            class="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-ui font-semibold"
            [class]="
              status() === chip
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-surface text-fg-muted hover:text-fg'
            "
            [attr.aria-pressed]="status() === chip"
            (click)="setStatus(chip)"
          >
            {{ 'training.statusChip.' + (chip || 'all') | transloco }}
            @if (n !== null) {
              <span class="rounded-full bg-surface-2 px-1.5 text-micro text-fg-muted">{{ n }}</span>
            }
          </button>
        }
      </div>

      @if (courseFilter()) {
        <p class="mb-3 flex flex-wrap items-center gap-2 text-meta text-fg-muted">
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

      @if (selected().size > 0) {
        <div
          class="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-card border border-accent/30 bg-accent-soft px-3 py-2 text-ui"
          role="region"
          [attr.aria-label]="'training.bulk.label' | transloco"
          data-testid="bulk-bar"
        >
          <span class="font-semibold text-fg">
            {{ 'training.bulk.selected' | transloco: { count: selected().size } }}
          </span>
          <app-button
            size="sm"
            variant="secondary"
            [loading]="bulkBusy() === 'remind'"
            (click)="bulk('remind')"
          >
            {{ 'training.bulk.remind' | transloco }}
          </app-button>
          <span class="flex items-center gap-1.5">
            <label for="bulk-due" class="sr-only">{{ 'training.bulk.newDue' | transloco }}</label>
            <input
              id="bulk-due"
              type="date"
              class="h-8 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
              [min]="tomorrow"
              [(ngModel)]="bulkDue"
            />
            <app-button
              size="sm"
              variant="secondary"
              [disabled]="!bulkDue"
              [loading]="bulkBusy() === 'extend'"
              (click)="bulk('extend')"
            >
              {{ 'training.bulk.extend' | transloco }}
            </app-button>
          </span>
          <app-button size="sm" variant="ghost" (click)="cancelOpen.set(true)">
            {{ 'training.bulk.cancel' | transloco }}
          </app-button>
          <button
            type="button"
            class="ml-auto text-meta font-semibold text-fg-muted hover:text-fg"
            (click)="selected.set(empty)"
          >
            {{ 'training.bulk.clear' | transloco }}
          </button>
        </div>
      }
      @if (bulkError(); as key) {
        <div class="mb-3">
          <app-alert>{{ key | transloco }}</app-alert>
        </div>
      }

      @if (!loaded()) {
        <app-loading-state [rows]="6" />
      } @else if (failed()) {
        <app-error-state (retry)="reload()" />
      } @else if (items().length === 0) {
        <app-empty-state
          icon="search"
          titleKey="ui.empty.noResults"
          ctaKey="training.filters.clear"
          ctaVariant="secondary"
          (cta)="clearFilters()"
        />
      } @else {
        <div class="flex flex-col gap-4">
          @for (group of groups(); track group.key) {
            <section [attr.aria-label]="group.label || null">
              @if (group.label) {
                <h2 class="mb-1.5 flex items-center gap-2 text-ui font-semibold text-fg">
                  {{ group.label }}
                  <span class="text-meta font-normal text-fg-muted"
                    >({{ group.items.length }})</span
                  >
                </h2>
              }
              <app-training-assignment-table
                [assignments]="group.items"
                [showUser]="scope() === 'all'"
                [selectable]="access.canAssign()"
                [selected]="selected()"
                (toggled)="toggle($event)"
                (toggledAll)="toggleAll(group.items, $event)"
              />
            </section>
          }
        </div>
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
      <app-why-it-matters below scope="training" page="assignments" />
    </app-record-list-page>

    <app-confirm-dialog
      [open]="cancelOpen()"
      [title]="'training.bulk.cancelTitle' | transloco"
      [message]="'training.bulk.cancelMessage' | transloco: { count: selected().size }"
      [confirmLabel]="'training.bulk.cancel' | transloco"
      [cancelLabel]="'training.common.back' | transloco"
      [busy]="bulkBusy() === 'cancel'"
      (confirmed)="bulk('cancel')"
      (cancelled)="cancelOpen.set(false)"
    />
  `,
})
export class AssignmentList {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly access = inject(TrainingAccess);
  protected readonly router = inject(Router);

  /** `?course=` query param. */
  readonly course = input<string | undefined>(undefined);
  /** `?overdue=true` (from "do this now" on the home page). */
  readonly overdue = input<string | undefined>(undefined);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly chips = STATUS_CHIPS;
  protected readonly empty: ReadonlySet<string> = new Set();
  protected readonly tomorrow = addDaysInput(1);
  protected readonly courseFilter = linkedSignal(() => this.course() ?? '');
  protected readonly scope = linkedSignal<Scope>(() => (this.access.canOversee() ? 'all' : 'mine'));
  protected readonly status = linkedSignal<StatusFilter>(() =>
    this.overdue() === 'true' ? 'overdue' : 'open',
  );
  protected readonly sort = signal<AssignmentSort>('due_at');
  protected readonly groupBy = signal<GroupBy>('');
  protected readonly q = signal('');
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Assignment[]>([]);
  protected readonly counts = signal<AssignmentCounts | undefined>(undefined);
  protected readonly total = signal<number | null>(null);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly bulkBusy = signal<BulkAction | null>(null);
  protected readonly bulkError = signal<string | null>(null);
  protected readonly cancelOpen = signal(false);
  protected bulkDue = '';
  private readonly reloadTick = signal(0);

  protected readonly groups = computed(() => groupAssignments(this.items(), this.groupBy()));
  protected readonly filters = computed(() => ({
    scope: this.scope(),
    status: this.status(),
    sort: this.sort(),
    group: this.groupBy(),
  }));
  protected readonly hasFilters = computed(
    () => !!this.q() || this.status() !== 'open' || !!this.courseFilter(),
  );
  private readonly query = computed<AssignmentQuery>(() => ({
    ...statusQuery(this.status()),
    mine: this.scope() === 'mine',
    course_id: this.courseFilter() || undefined,
    q: this.q() || undefined,
    // Grouping sorts by the group first so a group is never split across the page.
    sort: this.groupBy() || this.sort(),
  }));

  protected readonly scopeOptions = computed<FilterOption[]>(() => [
    { value: 'all', label: this.language.translate('training.filters.everyone') },
    { value: 'mine', label: this.language.translate('training.filters.mine') },
  ]);
  protected readonly groupOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.noGrouping') },
    { value: 'course', label: this.language.translate('training.filters.byCourse') },
    { value: 'person', label: this.language.translate('training.filters.byPerson') },
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
      title: this.language.translate('training.assignments.title'),
    }));
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reloadTick();
      const query = { ...this.query(), limit: PAGE_SIZE, offset: this.offset() };
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.failed.set(false);
        this.sub = this.api.listAssignments(orgId, query).subscribe({
          next: (res) => {
            this.items.set(res.items);
            this.counts.set(res.counts);
            this.total.set(res.total);
            this.loaded.set(true);
            const ids = new Set(res.items.map((a) => a.id));
            this.selected.update((set) => new Set([...set].filter((id) => ids.has(id))));
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

  protected count(chip: StatusFilter): number | null {
    return chipCount(this.counts(), chip);
  }

  protected setQuery(text: string): void {
    this.q.set(text);
    this.offset.set(0);
  }

  protected setScope(value: string): void {
    this.scope.set(value === 'all' ? 'all' : 'mine');
    this.offset.set(0);
  }

  protected setGroup(value: string): void {
    this.groupBy.set(value === 'course' || value === 'person' ? value : '');
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

  protected clearFilters(): void {
    this.q.set('');
    this.status.set('open');
    this.clearCourse();
    this.offset.set(0);
  }

  protected toggle(id: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected toggleAll(rows: readonly Assignment[], on: boolean): void {
    const ids = rows
      .filter((a) => a.can_manage && (a.status === 'assigned' || a.status === 'in_progress'))
      .map((a) => a.id);
    this.selected.update((set) => {
      const next = new Set(set);
      for (const id of ids) {
        if (on) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }

  protected bulk(action: BulkAction): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ids = [...this.selected()];
    if (!orgId || ids.length === 0 || this.bulkBusy()) {
      return;
    }
    const dueAt = action === 'extend' ? fromDateInput(this.bulkDue, true) : null;
    if (action === 'extend' && !dueAt) {
      return;
    }
    this.bulkBusy.set(action);
    this.bulkError.set(null);
    this.api.bulkAssignments(orgId, { ids, action, due_at: dueAt }).subscribe({
      next: (res) => {
        this.bulkBusy.set(null);
        this.cancelOpen.set(false);
        this.selected.set(new Set());
        this.notifications.success(`training.bulk.done.${action}`, {
          count: res.updated,
          skipped: res.skipped.length,
        });
        this.reload();
      },
      error: (err: unknown) => {
        this.bulkBusy.set(null);
        this.cancelOpen.set(false);
        this.bulkError.set(trainingErrorKey(err));
      },
    });
  }

  protected exportCsv(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api.exportCsv(orgId, 'assignments', this.query(), this.language.active()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, exportFileName('assignments'));
      },
      error: () => {
        this.exporting.set(false);
        this.notifications.error('training.export.failed');
      },
    });
  }

  protected applyView(view: SavedView): void {
    if (view.filters['scope']) {
      this.setScope(view.filters['scope']);
    }
    this.setStatus(view.filters['status'] ?? 'open');
    this.setSort(view.filters['sort'] ?? 'due_at');
    this.setGroup(view.filters['group'] ?? '');
  }
}

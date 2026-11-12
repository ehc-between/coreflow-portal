import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { pluralKey } from '../../shared/i18n/plural';
import { Pager } from '../../shared/ui/pager/pager';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { categoryKey, categoryTone, statusKey, statusTone } from './data/process-display';
import {
  PROCESS_CATEGORIES,
  PROCESS_MODULE,
  PROCESS_SORTS,
  PROCESS_STATUSES,
  ProcessCategory,
  ProcessListQuery,
  ProcessOut,
  ProcessSort,
  ProcessStatus,
} from './data/process.models';
import { ProcessesApi } from './data/processes-api';

const PAGE_SIZE = 25;

/** i18n key suffix (`processes.sort.<key>`) per sort option. */
const SORT_KEYS: Readonly<Record<ProcessSort, string>> = {
  code: 'code',
  '-code': 'codeDesc',
  title: 'title',
  '-updated_at': 'updatedDesc',
  next_review_at: 'nextReview',
};

/** Filter values as stored in a saved view / the URL. */
export interface ProcessListFilters {
  readonly status: ProcessStatus | '';
  readonly category: ProcessCategory | '';
  readonly owner: '' | 'me';
  readonly reviewDue: '' | 'true';
  readonly sort: ProcessSort;
}

export const DEFAULT_FILTERS: ProcessListFilters = {
  status: '',
  category: '',
  owner: '',
  reviewDue: '',
  sort: 'code',
};

/** Restores filters from a saved view or query params, ignoring unknown values. */
export function parseFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): ProcessListFilters {
  const pick = <T extends string>(
    value: string | null | undefined,
    allowed: readonly T[],
    fallback: T,
  ): T => (value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);
  return {
    status: pick(raw['status'], ['', ...PROCESS_STATUSES], ''),
    category: pick(raw['category'], ['', ...PROCESS_CATEGORIES], ''),
    owner: pick(raw['owner'], ['', 'me'] as const, ''),
    reviewDue: pick(raw['reviewDue'] ?? raw['review_due'], ['', 'true'] as const, ''),
    sort: pick(raw['sort'], PROCESS_SORTS, 'code'),
  };
}

export function toQuery(q: string, f: ProcessListFilters, offset: number): ProcessListQuery {
  return {
    q: q.trim() || undefined,
    status: f.status ? [f.status] : undefined,
    category: f.category || undefined,
    owner: f.owner || undefined,
    review_due: f.reviewDue === 'true' ? true : undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * The process register (`/processes`): search, filters (status, category, mine,
 * review due), sort, saved views and paging over the org's processes, with links
 * to the interaction map and (with `processes:write`) a New process action. The
 * empty state teaches what a process register is for; a micro-lesson explains the
 * process approach and PDCA.
 */
@Component({
  selector: 'app-processes-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    GuideIntro,
    LessonView,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    SlideOver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="processes.list.title"
      scope="processes"
      searchPlaceholderKey="processes.list.searchPlaceholder"
      [query]="query()"
      [filters]="viewFilters()"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1.5 max-w-[640px]">
        <p class="text-[14px] text-fg-muted">{{ 'processes.list.subtitle' | transloco }}</p>
      </div>
      <app-tour-button toolbar scope="processes" tour="list" />
      <app-button toolbar variant="secondary" (click)="lessonOpen.set(true)">
        <app-icon name="training" [size]="15" />
        {{ 'processes.lesson.open' | transloco }}
      </app-button>
      <a toolbar routerLink="/processes/interaction-map" appTourStep="processes-interaction-map">
        <app-button variant="secondary">
          <app-icon name="projects" [size]="15" />
          {{ 'processes.list.interactionMap' | transloco }}
        </app-button>
      </a>
      <a
        toolbar
        *appHasPermission="'processes:write'"
        routerLink="/processes/new"
        appTourStep="processes-new"
      >
        <app-button>
          <app-icon name="plus" [size]="15" />
          {{ 'processes.list.new' | transloco }}
        </app-button>
      </a>

      <ng-container ngProjectAs="[filters]">
        <select
          class="cf-filter"
          [attr.aria-label]="'processes.filters.status' | transloco"
          [value]="filters().status"
          (change)="setFilter('status', $any($event.target).value)"
          appTourStep="processes-filters"
          data-testid="filter-status"
        >
          <option value="">{{ 'processes.filters.allStatuses' | transloco }}</option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="s === filters().status">
              {{ statusKey(s) | transloco }}
            </option>
          }
        </select>
        <select
          class="cf-filter"
          [attr.aria-label]="'processes.filters.category' | transloco"
          (change)="setFilter('category', $any($event.target).value)"
        >
          <option value="">{{ 'processes.filters.allCategories' | transloco }}</option>
          @for (c of categories; track c) {
            <option [value]="c" [selected]="c === filters().category">
              {{ categoryKey(c) | transloco }}
            </option>
          }
        </select>
        <select
          class="cf-filter"
          [attr.aria-label]="'processes.filters.owner' | transloco"
          (change)="setFilter('owner', $any($event.target).value)"
        >
          <option value="" [selected]="filters().owner === ''">
            {{ 'processes.filters.anyOwner' | transloco }}
          </option>
          <option value="me" [selected]="filters().owner === 'me'">
            {{ 'processes.filters.mine' | transloco }}
          </option>
        </select>
        <label
          class="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
        >
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="filters().reviewDue === 'true'"
            (change)="setFilter('reviewDue', $any($event.target).checked ? 'true' : '')"
            data-testid="filter-review-due"
          />
          {{ 'processes.filters.reviewDue' | transloco }}
        </label>
        <select
          class="cf-filter"
          [attr.aria-label]="'processes.filters.sort' | transloco"
          (change)="setFilter('sort', $any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === filters().sort">
              {{ 'processes.sort.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <app-guide-intro class="mb-3 block" scope="processes" page="list" />

      <app-card [padded]="false">
        @if (loading() && items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        } @else if (items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted" data-testid="no-matches">
            {{ 'processes.list.noMatches' | transloco }}
          </p>
        } @else {
          <ul [attr.aria-busy]="loading()" data-testid="process-rows">
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/processes', row.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap"
                >
                  <span class="w-[72px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1 basis-[200px]">
                    <span class="block truncate font-semibold text-fg">{{ row.title }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      @if (row.parent) {
                        {{ 'processes.list.partOf' | transloco: { code: row.parent.code } }} ·
                      }
                      {{
                        pluralKey('processes.list.steps', row.step_count)
                          | transloco: { count: row.step_count }
                      }}
                    </span>
                  </span>
                  <app-badge [tone]="categoryTone(row.category)">{{
                    categoryKey(row.category) | transloco
                  }}</app-badge>
                  <app-badge [tone]="statusTone(row.status)">{{
                    statusKey(row.status) | transloco
                  }}</app-badge>
                  <span
                    class="hidden w-[130px] flex-none truncate text-right text-[12.5px] text-fg-subtle md:block"
                  >
                    {{ row.owner?.name ?? ('processes.list.noOwner' | transloco) }}
                  </span>
                  <span class="w-[110px] flex-none text-right text-[12.5px]">
                    @if (row.next_review_at) {
                      <span
                        [class.text-fail]="row.review_overdue"
                        [class.font-semibold]="row.review_overdue"
                        [class.text-fg-subtle]="!row.review_overdue"
                        [attr.title]="'processes.fields.nextReview' | transloco"
                      >
                        {{ row.next_review_at | localDay }}
                      </span>
                      @if (row.review_overdue) {
                        <span class="sr-only">{{ 'processes.review.overdue' | transloco }}</span>
                      }
                    } @else {
                      <span class="text-fg-subtle">—</span>
                    }
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </app-card>
      <div class="mt-3">
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="goTo($event)"
        />
      </div>
      <app-why-it-matters class="mt-5 block" scope="processes" page="list" />

      <div empty>
        <app-guide-intro class="mb-3 block" scope="processes" page="list" />
        <app-card>
          <app-teaching-empty
            scope="processes"
            page="list"
            [showAction]="canWrite()"
            (action)="create()"
          />
        </app-card>
        <app-why-it-matters class="mt-5 block" scope="processes" page="list" />
      </div>
    </app-record-list-page>

    <app-slide-over
      [open]="lessonOpen()"
      [title]="'processes.lesson.title' | transloco"
      [closeLabel]="'processes.actions.close' | transloco"
      [width]="560"
      (closed)="lessonOpen.set(false)"
    >
      @if (lessonOpen()) {
        <app-lesson scope="processes" lesson="process-approach" />
      }
    </app-slide-over>
  `,
  styles: [
    `
      .cf-filter {
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13.5px;
        padding: 0 10px;
        outline: none;
      }
      .cf-filter:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ProcessesList {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statuses = PROCESS_STATUSES;
  protected readonly categories = PROCESS_CATEGORIES;
  protected readonly sorts = PROCESS_SORTS;
  protected readonly statusKey = statusKey;
  protected readonly statusTone = statusTone;
  protected readonly categoryKey = categoryKey;
  protected readonly categoryTone = categoryTone;
  protected readonly pluralKey = pluralKey;

  protected readonly query = signal('');
  protected readonly filters = signal<ProcessListFilters>(
    parseFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly ProcessOut[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  private readonly loaded = signal(false);
  protected readonly lessonOpen = signal(false);

  protected readonly canWrite = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('processes:write') ?? false,
  );

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));

  /** The register has no processes at all (not just no matches): teach instead. */
  protected readonly isEmptyRegister = computed(
    () =>
      this.loaded() &&
      this.total() === 0 &&
      !this.query().trim() &&
      JSON.stringify(this.filters()) === JSON.stringify(DEFAULT_FILTERS),
  );

  constructor() {
    providePageContext(() => ({ module: PROCESS_MODULE, view: 'list' }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const q = this.query();
      const filters = this.filters();
      const offset = this.offset();
      if (!orgId) {
        return;
      }
      untracked(() => this.load(orgId, q, filters, offset));
    });
  }

  private load(orgId: string, q: string, filters: ProcessListFilters, offset: number): void {
    this.loading.set(true);
    this.api.list(orgId, toQuery(q, filters, offset)).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  protected sortKey(sort: ProcessSort): string {
    return SORT_KEYS[sort];
  }

  protected onSearch(text: string): void {
    this.offset.set(0);
    this.query.set(text);
  }

  protected setFilter(key: keyof ProcessListFilters, value: string): void {
    this.offset.set(0);
    this.filters.set(parseFilters({ ...this.filters(), [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(parseFilters(view.filters));
  }

  protected goTo(offset: number): void {
    this.offset.set(offset);
  }

  protected create(): void {
    void this.router.navigate(['/processes/new']);
  }
}

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
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { pluralKey } from '../../shared/i18n/plural';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { categoryKey, healthValue, statusKey } from './data/process-display';
import { PROCESS_NAV } from './data/process-nav';
import {
  PROCESS_CATEGORIES,
  PROCESS_ENTITY_TYPE,
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
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';

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
  readonly owner: '' | 'me' | 'none';
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
    owner: pick(raw['owner'], ['', 'me', 'none'] as const, ''),
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
 * The process register (`/processes`, "Prosesser"): search, filters (status,
 * owner incl. "no owner"; category, review due and sort under "Flere filtre"), saved views and paging.
 * Each row shows the code, title, what it is (category, parent, map), how many
 * requirements it documents, its status, how complete it is ("6 av 9"), the
 * owner and the next review (overdue in amber with "Forfalt"). The empty
 * register teaches what processes are; learning sits in the help strip.
 */
@Component({
  selector: 'app-processes-list',
  imports: [
    FulfilsRequirements,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
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
      exportRegister="processes"
      titleKey="modules.names.processes"
      descriptionKey="processes.list.subtitle"
      scope="processes"
      searchPlaceholderKey="processes.list.searchPlaceholder"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="processes.register" />
      <a
        primary
        *appHasPermission="'processes:write'"
        routerLink="/processes/new"
        appTourStep="processes-new"
      >
        <app-button>
          <app-icon name="plus" [size]="15" />
          {{ 'processes.list.new' | transloco }}
        </app-button>
      </a>

      <app-module-nav
        nav
        class="mb-4 block"
        labelKey="modules.names.processes"
        [items]="nav"
        appTourStep="processes-interaction-map"
      />
      <app-help-strip help scope="processes" page="list" tour="list" lesson="process-approach" />

      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'processes.filters.status' | transloco"
        (change)="setFilter('status', $any($event.target).value)"
        appTourStep="processes-filters"
        data-testid="filter-status"
      >
        <option value="" [selected]="filters().status === ''">
          {{ 'processes.filters.allStatuses' | transloco }}
        </option>
        @for (s of statuses; track s) {
          <option [value]="s" [selected]="s === filters().status">
            {{ statusKey(s) | transloco }}
          </option>
        }
      </select>
      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'processes.filters.owner' | transloco"
        (change)="setFilter('owner', $any($event.target).value)"
        data-testid="filter-owner"
      >
        <option value="" [selected]="filters().owner === ''">
          {{ 'processes.filters.anyOwner' | transloco }}
        </option>
        <option value="me" [selected]="filters().owner === 'me'">
          {{ 'processes.filters.mine' | transloco }}
        </option>
        <option value="none" [selected]="filters().owner === 'none'">
          {{ 'processes.filters.noOwner' | transloco }}
        </option>
      </select>

      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'processes.filters.category' | transloco }}
          <select class="cf-filter" (change)="setFilter('category', $any($event.target).value)">
            <option value="" [selected]="filters().category === ''">
              {{ 'processes.filters.allCategories' | transloco }}
            </option>
            @for (c of categories; track c) {
              <option [value]="c" [selected]="c === filters().category">
                {{ categoryKey(c) | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="filters().reviewDue === 'true'"
            (change)="setFilter('reviewDue', $any($event.target).checked ? 'true' : '')"
            data-testid="filter-review-due"
          />
          {{ 'processes.filters.reviewDue' | transloco }}
        </label>
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'processes.filters.sort' | transloco }}
          <select class="cf-filter" (change)="setFilter('sort', $any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="s === filters().sort">
                {{ 'processes.sort.' + sortKey(s) | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (loading() && items().length === 0) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-card>
          <app-empty-state
            icon="search"
            titleKey="processes.list.noMatchesTitle"
            bodyKey="processes.list.noMatches"
            [compact]="true"
            data-testid="no-matches"
          />
          <div class="-mt-2 pb-4 text-center">
            <app-button variant="secondary" size="sm" (click)="clearFilters()">
              {{ 'processes.list.clearFilters' | transloco }}
            </app-button>
          </div>
        </app-card>
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-busy]="loading()" data-testid="process-rows">
            <app-record-row-header dateKind="next" />
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.title"
                [subtitle]="subtitle(row)"
                [link]="['/processes', row.id]"
                [owner]="row.owner?.name ?? noOwnerText()"
                [date]="row.next_review_at"
                dateKind="next"
                [overdue]="row.review_overdue"
              >
                <app-coverage-chip coverage [entityType]="entityType" [entityId]="row.id" />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="row.status"
                  [labelKey]="statusKey(row.status)"
                />
                @if (row.health; as h) {
                  <app-status-badge
                    badges
                    meaning="progress"
                    [value]="health(row)"
                    labelKey="processes.health.short"
                    [labelParams]="{ done: h.done, total: h.total }"
                    [attr.title]="
                      'processes.health.summary' | transloco: { done: h.done, total: h.total }
                    "
                    data-testid="row-health"
                  />
                }
              </app-record-row>
            }
          </div>
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
      }

      <div empty>
        <app-card>
          <app-teaching-empty
            scope="processes"
            page="list"
            [showAction]="canWrite()"
            (action)="create()"
          />
        </app-card>
      </div>

      <app-why-it-matters below scope="processes" page="list" />
    </app-record-list-page>
  `,
  styles: [
    `
      .cf-filter {
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        font-weight: 400;
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
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly nav = PROCESS_NAV;
  protected readonly entityType = PROCESS_ENTITY_TYPE;
  protected readonly statuses = PROCESS_STATUSES;
  protected readonly categories = PROCESS_CATEGORIES;
  protected readonly sorts = PROCESS_SORTS;
  protected readonly statusKey = statusKey;
  protected readonly categoryKey = categoryKey;

  protected readonly query = signal('');
  protected readonly filters = signal<ProcessListFilters>(
    parseFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly ProcessOut[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  private readonly loaded = signal(false);

  protected readonly canWrite = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('processes:write') ?? false,
  );

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly moreActive = computed(
    () =>
      (this.filters().category ? 1 : 0) +
      (this.filters().reviewDue ? 1 : 0) +
      (this.filters().sort !== DEFAULT_FILTERS.sort ? 1 : 0),
  );
  protected readonly noOwnerText = computed(() =>
    this.language.translate('processes.list.noOwner'),
  );

  /** The register has no processes at all (not just no matches): teach instead. */
  protected readonly isEmptyRegister = computed(
    () =>
      this.loaded() &&
      !this.error() &&
      this.total() === 0 &&
      !this.query().trim() &&
      JSON.stringify(this.filters()) === JSON.stringify(DEFAULT_FILTERS),
  );

  constructor() {
    providePageContext(() => ({
      module: PROCESS_MODULE,
      entityType: PROCESS_ENTITY_TYPE,
      view: 'list',
      title: this.language.translate('modules.names.processes'),
    }));

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
    this.error.set(false);
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
        this.error.set(true);
      },
    });
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId, this.query(), this.filters(), this.offset());
    }
  }

  /** "Kjerne · Del av PR-001 · 7 steg i arbeidsflyten" / "… · Ingen arbeidsflyt tegnet ennå". */
  protected subtitle(row: ProcessOut): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(categoryKey(row.category))];
    if (row.parent) {
      parts.push(t('processes.list.partOf', { code: row.parent.code }));
    }
    parts.push(
      row.step_count > 0
        ? t(pluralKey('processes.list.steps', row.step_count), { count: row.step_count })
        : t('processes.list.noMap'),
    );
    return parts.join(' · ');
  }

  protected health(row: ProcessOut): string {
    const h = row.health;
    return h && h.total ? String(Math.round((h.done / h.total) * 100)) : healthValue(h);
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

  protected clearFilters(): void {
    this.offset.set(0);
    this.filters.set(DEFAULT_FILTERS);
    this.query.set('');
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

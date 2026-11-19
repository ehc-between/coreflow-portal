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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { hasAnyPermission } from '../../core/auth/permission';
import { providePageContext } from '../../core/ai/page-context';
import {
  DeviationFilters,
  DeviationListItem,
  DeviationType,
  StatusCategory,
} from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { personOptions, saveBlob } from './deviation-display';
import {
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  STANDARD_OPTIONS,
  STATUS_OPTIONS,
  isOverdue,
  severityLabelKey,
  sourceLabelKey,
  standardLabelKey,
  statusLabelKey,
} from './deviation-enums';
import { DeviationStatusLabels, STATUS_CATEGORIES } from './deviation-status';
import { DeviationFilter, FilterGroup, FilterOption } from './ui/filter-select';
import { DeviationsNavService } from './ui/deviations-nav';
import { DeviationKpiBand } from './stats/deviation-kpi-band';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';
import { StatusLegend } from '../../shared/ui/status-legend/status-legend';

const PAGE_SIZE = 25;
const WIDE_QUERY = '(min-width: 640px)';

/** URL / saved-view filter keys of the list (the list endpoint's param names). */
export const LIST_FILTER_KEYS = [
  'state',
  'type_id',
  'owner_user_id',
  'severity',
  'source',
  'standard',
  'department_id',
  'tag',
  'clause',
  'due_after',
  'due_before',
  'sort',
] as const;
export type ListFilterKey = (typeof LIST_FILTER_KEYS)[number];

/** The filters that live under "Flere filtre" on wide screens. */
const MORE_KEYS: readonly ListFilterKey[] = [
  'owner_user_id',
  'severity',
  'source',
  'standard',
  'department_id',
  'tag',
  'clause',
  'due_after',
  'due_before',
  'sort',
];

export const SORT_OPTIONS: readonly FilterOption[] = [
  { value: 'raised_at', label: 'deviations.sort.oldest' },
  { value: 'due_at', label: 'deviations.sort.dueSoonest' },
  { value: '-severity', label: 'deviations.sort.severity' },
  { value: 'code', label: 'deviations.sort.code' },
];

/**
 * The one "Status" filter value: `scope:active|overdue` (open work), `cat:<category>`
 * (a lifecycle phase) or a status / workflow state key. Splits it into list params.
 */
export function stateFilter(
  value: string,
): Pick<DeviationFilters, 'active' | 'overdue' | 'closed' | 'category' | 'status'> {
  if (!value) {
    return {};
  }
  if (value === 'scope:active') {
    return { active: true };
  }
  if (value === 'scope:overdue') {
    return { overdue: true };
  }
  if (value === 'scope:closed') {
    return { closed: true };
  }
  if (value.startsWith('cat:')) {
    return { category: value.slice(4) as StatusCategory };
  }
  return { status: value };
}

/** The list params of the current filter values (also used by the export). */
export function toDeviationFilters(
  query: string,
  filters: Readonly<Record<string, string>>,
): DeviationFilters {
  const v = (key: ListFilterKey) => (filters[key] ?? '').trim() || undefined;
  return {
    q: query.trim() || undefined,
    ...stateFilter(filters['state'] ?? ''),
    type_id: v('type_id'),
    owner_user_id: v('owner_user_id'),
    severity: v('severity') as DeviationFilters['severity'],
    source: v('source') as DeviationFilters['source'],
    standard: v('standard') as DeviationFilters['standard'],
    department_id: v('department_id'),
    tag: v('tag'),
    clause: v('clause'),
    due_after: v('due_after'),
    due_before: v('due_before'),
    sort: v('sort') ?? '-raised_at',
  };
}

/**
 * Filters from drill-down links (`?status=`, `?category=`, `?active=true`,
 * `?overdue=true`, `?type_id=` …, e.g. from the statistics page and the home page).
 */
export function filtersFromParams(params: {
  get(name: string): string | null;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const state =
    params.get('state') ??
    (params.get('overdue') === 'true'
      ? 'scope:overdue'
      : params.get('active') === 'true'
        ? 'scope:active'
        : params.get('closed') === 'true'
          ? 'scope:closed'
          : params.get('category')
            ? `cat:${params.get('category')}`
            : params.get('status'));
  if (state) {
    out['state'] = state;
  }
  for (const key of LIST_FILTER_KEYS) {
    const value = params.get(key);
    if (key !== 'state' && value) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Deviations register on the shared list frame (docs/ux-guide.md, "List"): page
 * header with "Nytt avvik" and "Eksporter (CSV)", the module sub-navigation,
 * the help strip, search plus two filters (Status, Type; U30) and the rest (Owner …) in
 * "Flere filtre", saved views, rows with requirement coverage and a "Forfalt"
 * marker, pagination, a teaching empty state and why-it-matters below. Filters
 * are mirrored in the URL so drill-downs and reloads keep them.
 */
@Component({
  selector: 'app-deviations-list',
  imports: [
    StatusLegend,
    FulfilsRequirements,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Badge,
    Button,
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
    DeviationFilter,
    DeviationKpiBand,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="modules.names.deviations"
      outputsModule="deviations"
      descriptionKey="deviations.list.description"
      scope="deviations"
      page="list"
      searchPlaceholderKey="deviations.searchPlaceholder"
      [settingsLink]="isAdmin() ? '/settings/modules/deviations' : null"
      [query]="query()"
      [filters]="filters()"
      [moreFiltersActive]="moreActive()"
      [empty]="ready() && !error() && items().length === 0 && !hasCriteria()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="deviations.register" />
      <a
        primary
        *appHasPermission="'deviations:write'"
        routerLink="/deviations/new"
        tabindex="-1"
        appTourStep="deviations-new"
      >
        <app-button data-testid="deviation-new">
          <app-icon name="plus" [size]="15" />
          {{ 'deviations.new' | transloco }}
        </app-button>
      </a>
      <app-button
        secondary
        variant="secondary"
        [loading]="exporting()"
        (click)="exportCsv()"
        data-testid="deviation-export"
      >
        <app-icon name="upload" [size]="15" class="rotate-180" />
        {{ 'deviations.list.export' | transloco }}
      </app-button>
      <app-module-nav nav [items]="nav.items()" labelKey="modules.names.deviations" />
      <app-help-strip help scope="deviations" page="list" tour="list" lesson="deviations-basics" />
      @if (kpiBand()) {
        <app-deviation-kpi-band
          kpis
          [filters]="bandFilters()"
          [active]="filters()['state'] ?? ''"
          (pick)="setFilter('state', $event)"
        />
      }

      <app-deviation-filter
        filters
        appTourStep="deviations-search"
        [style.display]="wide() ? null : 'none'"
        labelKey="deviations.filters.status"
        allKey="deviations.filters.allStatuses"
        [groups]="stateGroups()"
        [value]="filters()['state'] ?? ''"
        testId="filter-state"
        (valueChange)="setFilter('state', $event)"
      />
      <app-status-legend filters [text]="'deviations.statusPair.list' | transloco" />
      <app-deviation-filter
        filters
        [style.display]="wide() ? null : 'none'"
        labelKey="deviations.filters.type"
        allKey="deviations.filters.allTypes"
        [options]="typeOptions()"
        [value]="filters()['type_id'] ?? ''"
        (valueChange)="setFilter('type_id', $event)"
      />

      <div more-filters class="flex flex-col gap-3">
        @if (!wide()) {
          <app-deviation-filter
            labelKey="deviations.filters.status"
            allKey="deviations.filters.allStatuses"
            [groups]="stateGroups()"
            [value]="filters()['state'] ?? ''"
            [showLabel]="true"
            (valueChange)="setFilter('state', $event)"
          />
          <app-deviation-filter
            labelKey="deviations.filters.type"
            allKey="deviations.filters.allTypes"
            [options]="typeOptions()"
            [value]="filters()['type_id'] ?? ''"
            [showLabel]="true"
            (valueChange)="setFilter('type_id', $event)"
          />
        }
        <app-deviation-filter
          labelKey="deviations.filters.owner"
          allKey="deviations.filters.allOwners"
          [options]="ownerOptions()"
          [value]="filters()['owner_user_id'] ?? ''"
          [showLabel]="true"
          (valueChange)="setFilter('owner_user_id', $event)"
        />
        <app-deviation-filter
          labelKey="deviations.filters.severity"
          allKey="deviations.filters.allSeverities"
          [options]="severityOptions"
          [value]="filters()['severity'] ?? ''"
          [showLabel]="true"
          (valueChange)="setFilter('severity', $event)"
        />
        <app-deviation-filter
          labelKey="deviations.filters.source"
          allKey="deviations.filters.allSources"
          [options]="sourceOptions"
          [value]="filters()['source'] ?? ''"
          [showLabel]="true"
          (valueChange)="setFilter('source', $event)"
        />
        <app-deviation-filter
          labelKey="deviations.filters.standard"
          allKey="deviations.filters.allStandards"
          [options]="standardOptions"
          [value]="filters()['standard'] ?? ''"
          [showLabel]="true"
          (valueChange)="setFilter('standard', $event)"
        />
        @if (departmentOptions().length) {
          <app-deviation-filter
            labelKey="deviations.filters.department"
            allKey="deviations.filters.allDepartments"
            [options]="departmentOptions()"
            [value]="filters()['department_id'] ?? ''"
            [showLabel]="true"
            (valueChange)="setFilter('department_id', $event)"
          />
        }
        <div class="flex flex-col gap-1">
          <label for="dev-filter-tag" class="text-meta font-semibold text-fg-muted">{{
            'deviations.filters.tagLabel' | transloco
          }}</label>
          <input
            id="dev-filter-tag"
            type="text"
            autocomplete="off"
            [value]="filters()['tag'] ?? ''"
            [placeholder]="'deviations.filters.tag' | transloco"
            (change)="setFilter('tag', $any($event.target).value)"
            class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label for="dev-filter-clause" class="text-meta font-semibold text-fg-muted">{{
            'deviations.filters.clauseLabel' | transloco
          }}</label>
          <input
            id="dev-filter-clause"
            type="text"
            autocomplete="off"
            [value]="filters()['clause'] ?? ''"
            [placeholder]="'deviations.filters.clausePlaceholder' | transloco"
            (change)="setFilter('clause', $any($event.target).value)"
            class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex min-w-0 flex-col gap-1">
            <label for="dev-filter-due-from" class="text-meta font-semibold text-fg-muted">{{
              'deviations.filters.dueFrom' | transloco
            }}</label>
            <input
              id="dev-filter-due-from"
              type="date"
              [value]="filters()['due_after'] ?? ''"
              (change)="setFilter('due_after', $any($event.target).value)"
              class="h-10 min-w-0 rounded-tile border border-border bg-bg px-2 text-ui text-fg outline-none focus:border-accent"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label for="dev-filter-due-to" class="text-meta font-semibold text-fg-muted">{{
              'deviations.filters.dueTo' | transloco
            }}</label>
            <input
              id="dev-filter-due-to"
              type="date"
              [value]="filters()['due_before'] ?? ''"
              (change)="setFilter('due_before', $any($event.target).value)"
              class="h-10 min-w-0 rounded-tile border border-border bg-bg px-2 text-ui text-fg outline-none focus:border-accent"
            />
          </div>
        </div>
        <app-deviation-filter
          labelKey="deviations.filters.sort"
          allKey="deviations.sort.newest"
          [options]="sortOptions"
          [value]="filters()['sort'] ?? ''"
          [showLabel]="true"
          (valueChange)="setFilter('sort', $event)"
        />
        @if (hasFilters()) {
          <button
            type="button"
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-tile border border-border px-3 text-ui font-semibold text-fg-muted hover:text-fg"
            (click)="clearFilters()"
          >
            <app-icon name="x" [size]="14" />
            {{ 'deviations.filters.clear' | transloco }}
          </button>
        }
      </div>

      @if (error()) {
        <app-error-state (retry)="load()" />
      } @else if (!ready()) {
        <app-loading-state [rows]="6" />
      } @else if (items().length === 0) {
        <app-empty-state
          icon="search"
          titleKey="ui.empty.noResults"
          bodyKey="ui.empty.noResultsBody"
          ctaKey="ui.empty.clearFilters"
          ctaVariant="secondary"
          (cta)="clearAll()"
        />
      } @else {
        <div class="overflow-hidden rounded-card border border-border bg-surface">
          <app-record-row-header dateKind="due" />
          <div role="list" [attr.aria-label]="'modules.names.deviations' | transloco">
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.title"
                [subtitle]="row.type_name"
                [link]="['/deviations', row.id]"
                [owner]="row.owner_name"
                [date]="row.due_at"
                dateKind="due"
                [overdue]="overdue(row)"
              >
                <span coverage class="block min-w-0 [&_span]:whitespace-normal">
                  <app-coverage-chip entityType="deviation" [entityId]="row.id" />
                </span>
                <app-badge badges [tone]="statusLabels.tone(row)" data-testid="row-status">{{
                  statusLabels.label(row)
                }}</app-badge>
                <app-status-badge
                  badges
                  meaning="severity"
                  [value]="row.severity"
                  [labelKey]="severityLabelKey(row.severity)"
                />
              </app-record-row>
            }
          </div>
        </div>
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
        <app-teaching-empty
          scope="deviations"
          page="list"
          [showAction]="canWrite()"
          (action)="openNew()"
        />
      </div>

      <app-why-it-matters below scope="deviations" page="list" />
    </app-record-list-page>
  `,
})
export class DeviationsList {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly statusLabels = inject(DeviationStatusLabels);
  protected readonly nav = inject(DeviationsNavService);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly severityLabelKey = severityLabelKey;

  protected readonly canWrite = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'deviations:write'),
  );
  protected readonly isAdmin = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'deviations:admin'),
  );

  protected readonly severityOptions: readonly FilterOption[] = SEVERITY_OPTIONS.map((s) => ({
    value: s,
    label: severityLabelKey(s),
  }));
  protected readonly sourceOptions: readonly FilterOption[] = SOURCE_OPTIONS.map((s) => ({
    value: s,
    label: sourceLabelKey(s),
  }));
  protected readonly standardOptions: readonly FilterOption[] = STANDARD_OPTIONS.map((s) => ({
    value: s,
    label: standardLabelKey(s),
  }));

  protected readonly query = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly filters = signal<Readonly<Record<string, string>>>(
    filtersFromParams(this.route.snapshot.queryParamMap),
  );
  protected readonly offset = signal(0);
  /** U24: `?kpi=1` shows the statistics band on top of the register. */
  protected readonly kpiBand = signal(this.route.snapshot.queryParamMap.get('kpi') === '1');
  protected readonly bandFilters = computed(() => toDeviationFilters('', this.filters()));

  protected readonly items = signal<readonly DeviationListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly ready = signal(false);
  protected readonly error = signal(false);
  protected readonly exporting = signal(false);

  protected readonly types = signal<readonly DeviationType[]>([]);
  protected readonly users = signal<
    readonly { readonly id: string; readonly name: string; readonly email: string }[]
  >([]);
  protected readonly departments = signal<readonly { id: string; name: string }[]>([]);

  /** Phones show every filter in the "Flere filtre" panel. */
  protected readonly wide = signal(matchesWide());

  protected readonly typeOptions = computed<FilterOption[]>(() =>
    this.types().map((t) => ({ value: t.id, label: t.name, literal: true })),
  );
  protected readonly ownerOptions = computed<FilterOption[]>(() =>
    personOptions(this.users()).map((u) => ({ value: u.id, label: u.name, literal: true })),
  );
  protected readonly departmentOptions = computed<FilterOption[]>(() =>
    this.departments().map((d) => ({ value: d.id, label: d.name, literal: true })),
  );

  /** One Status filter: open work, phases, statuses and workflow states as groups. */
  protected readonly stateGroups = computed<FilterGroup[]>(() => [
    {
      labelKey: 'deviations.filters.groups.work',
      options: [
        { value: 'scope:active', label: 'deviations.filters.scopeActive' },
        { value: 'scope:overdue', label: 'deviations.filters.scopeOverdue' },
        { value: 'scope:closed', label: 'deviations.filters.scopeClosed' },
      ],
    },
    {
      labelKey: 'deviations.filters.groups.phase',
      options: STATUS_CATEGORIES.map((c) => ({
        value: `cat:${c}`,
        label: `deviations.category.${c}`,
      })),
    },
    {
      labelKey: 'deviations.filters.groups.status',
      options: STATUS_OPTIONS.map((s) => ({ value: s, label: statusLabelKey(s) })),
    },
    {
      labelKey: 'deviations.wf.statesGroup',
      options: this.statusLabels
        .workflowStates()
        .filter((s) => !(STATUS_OPTIONS as readonly string[]).includes(s.key))
        .map((s) => ({ value: s.key, label: s.text, literal: true })),
    },
  ]);

  protected readonly moreActive = computed(() => {
    const filters = this.filters();
    const keys = this.wide() ? MORE_KEYS : LIST_FILTER_KEYS;
    return keys.filter((key) => !!filters[key]).length;
  });
  protected readonly hasFilters = computed(() =>
    Object.values(this.filters()).some((value) => !!value),
  );
  protected readonly hasCriteria = computed(() => this.hasFilters() || !!this.query().trim());

  private currentOrg: string | null = null;

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'deviation',
      view: 'list',
      title: this.language.translate('modules.names.deviations'),
    }));

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia(WIDE_QUERY);
      const listener = (event: MediaQueryListEvent) => this.wide.set(event.matches);
      media.addEventListener?.('change', listener);
      inject(DestroyRef).onDestroy(() => media.removeEventListener?.('change', listener));
    }

    effect(() => {
      const orgId = this.orgId();
      untracked(() => {
        if (this.currentOrg !== null && orgId !== this.currentOrg) {
          // Another org: its types, owners and departments differ.
          this.filters.set({});
          this.query.set('');
        }
        this.currentOrg = orgId;
        this.items.set([]);
        this.total.set(0);
        this.offset.set(0);
        if (orgId) {
          this.loadReferences(orgId);
          this.load();
        }
      });
    });
  }

  protected overdue(row: DeviationListItem): boolean {
    return row.overdue ?? isOverdue(row.due_at, row.status);
  }

  protected onSearch(text: string): void {
    this.query.set(text);
    this.offset.set(0);
    this.syncUrl();
    this.load();
  }

  protected setFilter(key: string, value: string): void {
    const next = { ...this.filters() };
    if (value) {
      next[key] = value;
    } else {
      delete next[key];
    }
    this.filters.set(next);
    this.offset.set(0);
    this.syncUrl();
    this.load();
  }

  protected clearFilters(): void {
    this.filters.set({});
    this.offset.set(0);
    this.syncUrl();
    this.load();
  }

  protected clearAll(): void {
    this.query.set('');
    this.clearFilters();
  }

  protected applyView(view: SavedView): void {
    this.filters.set({ ...view.filters });
    this.query.set(view.query);
    this.offset.set(0);
    this.syncUrl();
    this.load();
  }

  protected goTo(offset: number): void {
    this.offset.set(offset);
    this.load();
  }

  protected openNew(): void {
    void this.router.navigateByUrl('/deviations/new');
  }

  /** Download the filtered register as CSV (opens in Excel; nb headers and `;`). */
  protected exportCsv(): void {
    const orgId = this.orgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    const lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.api
      .exportDeviations(orgId, toDeviationFilters(this.query(), this.filters()), lang)
      .subscribe({
        next: (blob) => {
          this.exporting.set(false);
          const day = new Date().toISOString().slice(0, 10);
          saveBlob(blob, `${this.language.translate('deviations.list.exportFile')}-${day}.csv`);
        },
        error: () => {
          this.exporting.set(false);
          this.notifications.error('deviations.list.exportFailed');
        },
      });
  }

  load(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.error.set(false);
    this.ready.set(false);
    this.api
      .listDeviations(orgId, {
        ...toDeviationFilters(this.query(), this.filters()),
        limit: PAGE_SIZE,
        offset: this.offset(),
      })
      .subscribe({
        next: (response) => {
          this.items.set(response.items);
          this.total.set(response.total);
          this.ready.set(true);
        },
        error: () => {
          this.error.set(true);
          this.ready.set(true);
        },
      });
  }

  private syncUrl(): void {
    const queryParams: Record<string, string | null> = { q: this.query().trim() || null };
    for (const key of [...LIST_FILTER_KEYS, 'status', 'category', 'active', 'overdue', 'closed']) {
      queryParams[key] = this.filters()[key] || null;
    }
    queryParams['kpi'] = this.kpiBand() ? '1' : null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true,
    });
  }

  private loadReferences(orgId: string): void {
    this.api.listTypes(orgId).subscribe({ next: (types) => this.types.set(types) });
    this.api.listAccessSubjects(orgId).subscribe({
      next: (subjects) => {
        this.users.set(subjects.users);
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name })));
      },
    });
  }
}

function matchesWide(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(WIDE_QUERY).matches
    : true;
}

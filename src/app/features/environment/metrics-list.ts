import { formatDate, formatNumber } from '@angular/common';
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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
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
import { EnvironmentApi } from './data/environment-api';
import {
  ENTITY_METRIC,
  GHG_SCOPES,
  GhgScope,
  METRIC_CATEGORIES,
  METRIC_SORTS,
  Metric,
  MetricCategory,
  MetricListQuery,
  MetricSort,
  TARGET_STATUSES,
  TargetStatus,
} from './data/environment.models';
import {
  changeDirection,
  displayUnit,
  sortKey,
  targetBadgeValue,
} from './data/environment-display';
import {
  ENV_CRUMBS,
  ENV_FILTER_STYLES,
  ENV_MODULE,
  ENV_ROOT_CRUMB,
  injectEnvPermissions,
} from './environment-shared';

const PAGE_SIZE = 25;

export const METRIC_STATUS_FILTERS = ['active', 'retired', 'all'] as const;

export interface MetricListFilters {
  readonly category: MetricCategory | '';
  readonly target: TargetStatus | '';
  readonly scope: GhgScope | '';
  readonly status: (typeof METRIC_STATUS_FILTERS)[number];
  readonly owner: '' | 'me';
  readonly sort: MetricSort;
}

export const METRIC_DEFAULT_FILTERS: MetricListFilters = {
  category: '',
  target: '',
  scope: '',
  status: 'active',
  owner: '',
  sort: 'code',
};

function oneOf<T extends string>(
  values: readonly T[],
  value: string | null | undefined,
  fallback: T,
): T {
  const v = value ?? '';
  return (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Restores filters from a saved view or query params (`?target=off_track`). */
export function parseMetricFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): MetricListFilters {
  return {
    category: oneOf<MetricCategory | ''>(METRIC_CATEGORIES, raw['category'], ''),
    target: oneOf<TargetStatus | ''>(TARGET_STATUSES, raw['target'], ''),
    scope: oneOf<GhgScope | ''>(GHG_SCOPES, raw['scope'], ''),
    status: oneOf(METRIC_STATUS_FILTERS, raw['status'], 'active'),
    owner: raw['owner'] === 'me' ? 'me' : '',
    sort: oneOf(METRIC_SORTS, raw['sort'], 'code'),
  };
}

export function metricQuery(q: string, f: MetricListFilters, offset: number): MetricListQuery {
  return {
    q: q.trim() || undefined,
    category: f.category || undefined,
    target: f.target || undefined,
    ghg_scope: f.scope || undefined,
    status: f.status === 'all' ? undefined : [f.status],
    owner: f.owner || undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/** The arrow of a change: ↑ ↓ or → (flat). */
export function changeArrow(pct: number | null | undefined): string {
  switch (changeDirection(pct)) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'flat':
      return '→';
    default:
      return '';
  }
}

/**
 * Environmental indicators (`/environment/metrics`, ISO 14001 9.1.1): energy, water,
 * waste, emissions and materials measured over time. Search; category and target
 * filters, emission category (scope) and the rest under "Flere filtre"; saved views and
 * paging. Each row reads "Siste: 14 000 kWh (okt. 2026) ↓ 5 %", with the target
 * status, the requirements it documents and the owner.
 */
@Component({
  selector: 'app-env-metrics-list',
  imports: [
    RouterLink,
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
      titleKey="environment.metrics.title"
      descriptionKey="environment.metrics.subtitle"
      scope="environment"
      page="metrics"
      searchPlaceholderKey="environment.metrics.searchPlaceholder"
      [breadcrumbs]="crumbs"
      [settingsLink]="perms.settingsLink()"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      @if (perms.write()) {
        <a
          primary
          routerLink="/environment/metrics/new"
          tabindex="-1"
          appTourStep="env-metric-new"
          data-testid="new-metric"
        >
          <app-button>
            <app-icon name="plus" [size]="15" />
            {{ 'environment.metrics.new' | transloco }}
          </app-button>
        </a>
      }

      <app-module-nav
        nav
        class="mb-4 block"
        [items]="perms.nav()"
        labelKey="modules.names.environment"
      />
      <app-help-strip
        help
        scope="environment"
        page="metrics"
        tour="metrics"
        lesson="monitoring-and-emissions"
      />

      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'environment.fields.category' | transloco"
        (change)="setFilter('category', $any($event.target).value)"
        appTourStep="env-metric-filters"
        data-testid="filter-category"
      >
        <option value="" [selected]="!filters().category">
          {{ 'environment.filters.allCategories' | transloco }}
        </option>
        @for (c of categories; track c) {
          <option [value]="c" [selected]="filters().category === c">
            {{ 'environment.categories.' + c | transloco }}
          </option>
        }
      </select>
      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'environment.filters.target' | transloco"
        (change)="setFilter('target', $any($event.target).value)"
        data-testid="filter-target"
      >
        <option value="" [selected]="!filters().target">
          {{ 'environment.filters.anyTarget' | transloco }}
        </option>
        @for (t of targets; track t) {
          <option [value]="t" [selected]="filters().target === t">
            {{ 'environment.targetStatus.' + t | transloco }}
          </option>
        }
      </select>
      <div more-filters class="flex flex-col gap-3">
        <label class="cf-more-label">
          {{ 'environment.fields.ghgScope' | transloco }}
          <select
            class="cf-filter"
            (change)="setFilter('scope', $any($event.target).value)"
            data-testid="filter-scope"
          >
            <option value="" [selected]="!filters().scope">
              {{ 'environment.filters.anyScope' | transloco }}
            </option>
            @for (s of scopes; track s) {
              <option [value]="s" [selected]="filters().scope === s">
                {{ 'environment.scopes.' + s | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="cf-more-label">
          {{ 'environment.filters.status' | transloco }}
          <select class="cf-filter" (change)="setFilter('status', $any($event.target).value)">
            @for (s of statusFilters; track s) {
              <option [value]="s" [selected]="filters().status === s">
                {{ 'environment.filters.metricStatus.' + s | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="cf-more-label">
          {{ 'environment.fields.owner' | transloco }}
          <select class="cf-filter" (change)="setFilter('owner', $any($event.target).value)">
            <option value="" [selected]="!filters().owner">
              {{ 'environment.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="filters().owner === 'me'">
              {{ 'environment.filters.mine' | transloco }}
            </option>
          </select>
        </label>
        <label class="cf-more-label">
          {{ 'environment.filters.sort' | transloco }}
          <select class="cf-filter" (change)="setFilter('sort', $any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'environment.sorts.' + sortKey(s) | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (state() === 'error') {
        <app-error-state (retry)="reload()" />
      } @else if (state() === 'loading' && items().length === 0) {
        <app-loading-state [rows]="4" />
      } @else if (items().length === 0) {
        <app-card>
          <app-empty-state
            icon="search"
            titleKey="ui.empty.noResults"
            [compact]="true"
            data-testid="no-match"
          />
          <div class="-mt-2 pb-4 text-center">
            <app-button variant="secondary" size="sm" (click)="clearFilters()">
              {{ 'environment.common.clearFilters' | transloco }}
            </app-button>
          </div>
        </app-card>
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-busy]="state() === 'loading'" data-testid="metric-rows">
            <app-record-row-header dateKind="updated" />
            @for (m of items(); track m.id) {
              <app-record-row
                [code]="m.code"
                [title]="m.name"
                [subtitle]="subtitle(m)"
                [link]="['/environment/metrics', m.id]"
                [owner]="m.owner_name"
                [date]="m.latest_period_end"
                dateKind="updated"
              >
                <app-coverage-chip coverage [entityType]="entityType" [entityId]="m.id" />
                @if (m.status === 'retired') {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    value="retired"
                    labelKey="environment.status.retired"
                  />
                }
                @if (m.target_status && m.target_status !== 'no_target') {
                  <app-status-badge
                    badges
                    meaning="compliance"
                    [value]="targetValue(m.target_status)"
                    [labelKey]="'environment.targetStatus.' + m.target_status"
                  />
                }
              </app-record-row>
            }
          </div>
        </app-card>
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <div empty>
        <app-card>
          <app-teaching-empty
            scope="environment"
            page="metrics"
            [showAction]="perms.write()"
            (action)="create()"
          />
        </app-card>
      </div>

      <app-why-it-matters below scope="environment" page="metrics" />
    </app-record-list-page>
  `,
  styles: [ENV_FILTER_STYLES],
})
export class MetricsList {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly perms = injectEnvPermissions();
  protected readonly crumbs = [ENV_ROOT_CRUMB, { labelKey: ENV_CRUMBS.metrics.labelKey }];
  protected readonly entityType = ENTITY_METRIC;
  protected readonly categories = METRIC_CATEGORIES;
  protected readonly targets = TARGET_STATUSES;
  protected readonly scopes = GHG_SCOPES;
  protected readonly statusFilters = METRIC_STATUS_FILTERS;
  protected readonly sorts = METRIC_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortKey = sortKey;
  protected readonly targetValue = targetBadgeValue;

  protected readonly query = signal('');
  protected readonly filters = signal<MetricListFilters>(
    parseMetricFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Metric[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly moreActive = computed(
    () =>
      (['scope', 'status', 'owner', 'sort'] as const).filter(
        (k) => this.filters()[k] !== METRIC_DEFAULT_FILTERS[k],
      ).length,
  );
  protected readonly isEmptyRegister = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.query() &&
      JSON.stringify(this.filters()) === JSON.stringify(METRIC_DEFAULT_FILTERS),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: ENV_MODULE,
      entityType: ENTITY_METRIC,
      view: 'list',
      title: this.language.translate('environment.metrics.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = metricQuery(this.query(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  /** "Energi · Siste: 14 000 kWh (okt. 2026) ↓ 5 %" or "Energi · Ingen målinger ennå". */
  protected subtitle(m: Metric): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const locale = this.language.locale();
    const parts = [t(`environment.categories.${m.category}`)];
    if (m.latest_value === null) {
      parts.push(t('environment.metric.noData'));
    } else {
      const day = m.latest_period_start ?? m.latest_period_end;
      const period = day ? formatDate(day, 'MMM y', locale) : '';
      let latest = t('environment.metric.latest', {
        value: formatNumber(m.latest_value, locale, '1.0-2'),
        unit: displayUnit(m.unit),
        period,
      });
      const arrow = changeArrow(m.latest_change_pct);
      if (arrow && m.latest_change_pct !== null && m.latest_change_pct !== undefined) {
        latest += ` ${arrow} ${formatNumber(Math.abs(m.latest_change_pct), locale, '1.0-0')} %`;
      }
      parts.push(latest);
    }
    return parts.join(' · ');
  }

  protected onSearch(text: string): void {
    this.query.set(text.trim());
    this.offset.set(0);
  }

  protected setFilter(key: keyof MetricListFilters, value: string): void {
    this.filters.set(parseMetricFilters({ ...this.filters(), [key]: value }));
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.filters.set(METRIC_DEFAULT_FILTERS);
    this.query.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.filters.set(parseMetricFilters(view.filters));
    this.offset.set(0);
  }

  protected reload(): void {
    this.load(
      this.selectedOrg.currentOrgId(),
      metricQuery(this.query(), this.filters(), this.offset()),
    );
  }

  protected create(): void {
    void this.router.navigate(['/environment/metrics/new']);
  }

  private load(orgId: string | null, query: MetricListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listMetrics(orgId, query).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => {
        this.items.set([]);
        this.state.set('error');
      },
    });
  }
}

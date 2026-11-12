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
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { EnvironmentApi } from './data/environment-api';
import {
  GHG_SCOPES,
  GhgScope,
  METRIC_CATEGORIES,
  METRIC_SORTS,
  Metric,
  MetricCategory,
  MetricListQuery,
  MetricSort,
  MetricStatus,
  PERM_WRITE,
} from './data/environment.models';
import { sortKey, statusTone } from './data/environment-display';
import { EnvironmentTabs } from './environment-tabs';
import { EnvLessonLink } from './lesson-link';

const PAGE_SIZE = 25;

export const METRIC_STATUS_FILTERS = ['active', 'all', 'retired'] as const;

/**
 * Environmental monitoring metrics (`/environment/metrics`, ISO 14001 9.1.1):
 * energy, water, waste, emissions and materials with their units and GHG scope;
 * each row shows the latest recorded value.
 */
@Component({
  selector: 'app-env-metrics-list',
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
    EnvironmentTabs,
    EnvLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-environment-tabs />
    <app-record-list-page
      titleKey="environment.metrics.title"
      scope="environment"
      page="metrics"
      searchPlaceholderKey="environment.metrics.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <p class="text-[14px] text-fg-muted">{{ 'environment.metrics.subtitle' | transloco }}</p>
        <app-guide-intro scope="environment" page="metrics" />
      </div>

      <app-tour-button toolbar scope="environment" tour="metrics" />
      <a
        toolbar
        routerLink="/environment/emissions"
        class="inline-flex h-9 items-center gap-1.5 rounded-tile px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft"
        appTourStep="env-emissions-link"
      >
        <app-icon name="reports" [size]="15" />
        {{ 'environment.tabs.emissions' | transloco }}
      </a>
      @if (canWrite()) {
        <app-button
          toolbar
          size="sm"
          (click)="newMetric()"
          appTourStep="env-metric-new"
          data-testid="new-metric"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'environment.metrics.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-env-m-cat">
        {{ 'environment.fields.category' | transloco }}
      </label>
      <select
        filters
        id="cf-env-m-cat"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setCategory($any($event.target).value)"
        appTourStep="env-metric-filters"
        data-testid="filter-category"
      >
        <option value="" [selected]="!category()">
          {{ 'environment.filters.allCategories' | transloco }}
        </option>
        @for (c of categories; track c) {
          <option [value]="c" [selected]="category() === c">
            {{ 'environment.categories.' + c | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-env-m-scope">
        {{ 'environment.fields.ghgScope' | transloco }}
      </label>
      <select
        filters
        id="cf-env-m-scope"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setScope($any($event.target).value)"
      >
        <option value="" [selected]="!scope()">
          {{ 'environment.filters.anyScope' | transloco }}
        </option>
        @for (s of scopes; track s) {
          <option [value]="s" [selected]="scope() === s">
            {{ 'environment.scopes.' + s | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-env-m-status">
        {{ 'environment.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-env-m-status"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setStatus($any($event.target).value)"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ 'environment.filters.statusOptions.' + s | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-env-m-sort">
        {{ 'environment.filters.sort' | transloco }}
      </label>
      <select
        filters
        id="cf-env-m-sort"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setSort($any($event.target).value)"
      >
        @for (s of sorts; track s) {
          <option [value]="s" [selected]="sort() === s">
            {{ 'environment.sorts.' + sortKey(s) | transloco }}
          </option>
        }
      </select>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'environment.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'environment.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'environment.common.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="metric-rows">
                @for (m of rows(); track m.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/environment/metrics', m.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                          m.code
                        }}</span>
                        <span class="truncate">{{ m.name }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{ 'environment.categories.' + m.category | transloco }}</span>
                        <span>{{ m.unit }}</span>
                        @if (m.ghg_scope) {
                          <span>{{ 'environment.scopes.' + m.ghg_scope | transloco }}</span>
                        }
                        @if (m.site) {
                          <span>{{ m.site }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      @if (m.latest_value !== null) {
                        <span class="font-semibold text-fg">
                          {{ m.latest_value | localNumber: '1.0-2' }} {{ m.unit }}
                        </span>
                        @if (m.latest_period_end) {
                          <span>{{
                            'environment.metric.until'
                              | transloco: { date: (m.latest_period_end | localDay) }
                          }}</span>
                        }
                      } @else {
                        <span>{{ 'environment.metric.noData' | transloco }}</span>
                      }
                      @if (m.status !== 'active') {
                        <app-badge [tone]="tone(m.status)">{{
                          'environment.status.' + m.status | transloco
                        }}</app-badge>
                      }
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
        <app-why-it-matters scope="environment" page="metrics" />
        <app-env-lesson-link lesson="monitoring-and-emissions" />
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="environment"
            page="metrics"
            [showAction]="canWrite()"
            (action)="newMetric()"
          />
        </app-card>
        <app-why-it-matters scope="environment" page="metrics" />
        <app-env-lesson-link lesson="monitoring-and-emissions" />
      </div>
    </app-record-list-page>
  `,
})
export class MetricsList {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly categories = METRIC_CATEGORIES;
  protected readonly scopes = GHG_SCOPES;
  protected readonly statusFilters = METRIC_STATUS_FILTERS;
  protected readonly sorts = METRIC_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortKey = sortKey;
  protected readonly tone = statusTone;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly q = signal('');
  protected readonly category = signal<MetricCategory | ''>('');
  protected readonly scope = signal<GhgScope | ''>('');
  protected readonly status = signal<string>('active');
  protected readonly sort = signal<MetricSort>('code');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Metric[]>([]);
  protected readonly total = signal(0);

  protected readonly showEmpty = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.q() &&
      !this.category() &&
      !this.scope() &&
      this.status() === 'active',
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    category: this.category(),
    scope: this.scope(),
    status: this.status(),
    sort: this.sort(),
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'environment',
      entityType: 'env_metric',
      view: 'list',
      title: this.language.translate('environment.metrics.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const status = this.status();
      const query: MetricListQuery = {
        q: this.q() || undefined,
        category: this.category() || undefined,
        ghg_scope: this.scope() || undefined,
        status: status === 'all' ? undefined : [status as MetricStatus],
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

  protected setCategory(value: string): void {
    this.offset.set(0);
    this.category.set(
      (METRIC_CATEGORIES as readonly string[]).includes(value) ? (value as MetricCategory) : '',
    );
  }

  protected setScope(value: string): void {
    this.offset.set(0);
    this.scope.set((GHG_SCOPES as readonly string[]).includes(value) ? (value as GhgScope) : '');
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set(
      (METRIC_STATUS_FILTERS as readonly string[]).includes(value) ? value : 'active',
    );
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (METRIC_SORTS as readonly string[]).includes(value) ? (value as MetricSort) : 'code',
    );
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.setCategory(f['category'] ?? '');
    this.setScope(f['scope'] ?? '');
    this.setStatus(f['status'] ?? 'active');
    this.setSort(f['sort'] ?? 'code');
  }

  protected newMetric(): void {
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
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

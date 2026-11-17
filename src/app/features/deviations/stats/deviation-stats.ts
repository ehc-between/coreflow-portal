import { formatNumber } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { hasAnyPermission } from '../../../core/auth/permission';
import {
  DeviationFilters,
  DeviationStats,
  Severity,
  Source,
  Standard,
} from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { fixedShortName, shortNameKey } from '../../../shared/requirement-links/requirement-label';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { DEVIATIONS_ROOT_CRUMB } from '../deviation-display';
import {
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  STANDARD_OPTIONS,
  STATUS_OPTIONS,
  severityLabelKey,
  sourceLabelKey,
  standardLabelKey,
} from '../deviation-enums';
import { DeviationStatusLabels } from '../deviation-status';
import { DeviationFilter, FilterOption } from '../ui/filter-select';
import { DeviationsNavService } from '../ui/deviations-nav';
import { StatBarList } from './stat-bar-list';
import { RawBucket, StatBar, orderedBuckets, recordToBuckets, toBars } from './stats-bars';
import { TrendChart } from './trend-chart';

interface Breakdown {
  readonly titleKey: string;
  readonly hintKey?: string;
  readonly bars: readonly StatBar[];
  /** List filter param a bar drills into; null when not drillable. */
  readonly filterKey: string | null;
}

const TOP_REQUIREMENTS = 8;

type FilterKey = 'type_id' | 'standard' | 'severity' | 'source' | 'department_id';

/**
 * Deviation statistics (audit finding 20) on the shared page frame: the KPIs an
 * auditor and the management review ask for (open and overdue cases, median days
 * to close, % closed on time, % of actions that worked, recurrences, the age of
 * open cases), breakdowns in a meaningful order (statuses in workflow order,
 * severity low → critical) including by source and by linked requirement, and
 * opened vs closed per month with empty months shown. Bars drill into the
 * filtered register.
 */
@Component({
  selector: 'app-deviation-stats',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    ModuleNav,
    PageHeader,
    StatBarList,
    TrendChart,
    DeviationFilter,
  ],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="deviations.stats.title"
        descriptionKey="deviations.stats.subtitle"
        [breadcrumbs]="breadcrumbs"
      >
        @if (canReview()) {
          <a secondary routerLink="/management-review" tabindex="-1">
            <app-button variant="secondary">
              <app-icon name="target" [size]="15" />
              {{ 'deviations.stats.toReview' | transloco }}
            </app-button>
          </a>
        }
      </app-page-header>
      <app-module-nav [items]="nav.items()" labelKey="modules.names.deviations" />
      <app-help-strip scope="deviations" page="stats" />

      <div class="mb-5 flex flex-wrap items-end gap-2" role="search">
        <app-deviation-filter
          labelKey="deviations.filters.type"
          allKey="deviations.filters.allTypes"
          [options]="typeOptions()"
          [value]="filters()['type_id'] ?? ''"
          (valueChange)="setFilter('type_id', $event)"
        />
        <app-deviation-filter
          labelKey="deviations.filters.standard"
          allKey="deviations.filters.allStandards"
          [options]="standardOptions"
          [value]="filters()['standard'] ?? ''"
          (valueChange)="setFilter('standard', $event)"
        />
        <app-deviation-filter
          labelKey="deviations.filters.severity"
          allKey="deviations.filters.allSeverities"
          [options]="severityOptions"
          [value]="filters()['severity'] ?? ''"
          (valueChange)="setFilter('severity', $event)"
        />
        <app-deviation-filter
          labelKey="deviations.filters.source"
          allKey="deviations.filters.allSources"
          [options]="sourceOptions"
          [value]="filters()['source'] ?? ''"
          (valueChange)="setFilter('source', $event)"
        />
        @if (departmentOptions().length) {
          <app-deviation-filter
            labelKey="deviations.filters.department"
            allKey="deviations.filters.allDepartments"
            [options]="departmentOptions()"
            [value]="filters()['department_id'] ?? ''"
            (valueChange)="setFilter('department_id', $event)"
          />
        }
        @if (hasFilters()) {
          <button
            type="button"
            (click)="clearFilters()"
            class="inline-flex h-10 items-center gap-1.5 rounded-tile border border-border px-3 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="x" [size]="14" />
            {{ 'deviations.filters.clear' | transloco }}
          </button>
        }
      </div>

      @if (error()) {
        <app-error-state (retry)="load()" />
      } @else if (loading() || !stats()) {
        <app-loading-state [rows]="4" />
      } @else {
        @let s = stats()!;
        @if (s.total === 0) {
          <app-empty-state
            icon="reports"
            titleKey="deviations.stats.empty"
            bodyKey="deviations.stats.emptyBody"
          />
        } @else {
          <div
            class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
            role="group"
            [attr.aria-label]="'deviations.stats.kpisLabel' | transloco"
          >
            <app-kpi-tile
              [label]="'deviations.stats.cards.open' | transloco"
              [value]="s.open"
              [delta]="'deviations.stats.cards.ofTotal' | transloco: { total: s.total }"
              tone="accent"
            />
            <app-kpi-tile
              [label]="'deviations.stats.cards.overdue' | transloco"
              [value]="s.overdue"
              [tone]="s.overdue > 0 ? 'warn' : 'neutral'"
            />
            <app-kpi-tile
              [label]="'deviations.stats.kpis.medianDays' | transloco"
              [value]="days(s.kpis?.median_days_to_close)"
              [delta]="avgText(s.kpis?.avg_days_to_close)"
            />
            <app-kpi-tile
              [label]="'deviations.stats.kpis.onTime' | transloco"
              [value]="pct(s.kpis?.closed_on_time_pct)"
              [tone]="tone(s.kpis?.closed_on_time_pct)"
            />
            <app-kpi-tile
              [label]="'deviations.stats.kpis.effective' | transloco"
              [value]="pct(s.kpis?.actions_effective_pct)"
              [tone]="tone(s.kpis?.actions_effective_pct)"
            />
            <app-kpi-tile
              [label]="'deviations.stats.kpis.recurring' | transloco"
              [value]="s.kpis?.recurring ?? 0"
              [tone]="(s.kpis?.recurring ?? 0) > 0 ? 'warn' : 'neutral'"
            />
          </div>

          <div class="mb-5 grid gap-4 lg:grid-cols-3">
            <app-card class="lg:col-span-2">
              <h2 class="mb-1 font-display text-card font-bold text-fg">
                {{ 'deviations.stats.trend.title' | transloco }}
              </h2>
              <p class="mb-4 text-meta text-fg-muted">
                {{ 'deviations.stats.trend.hint' | transloco }}
              </p>
              <app-trend-chart
                [points]="s.opened_over_time"
                [secondary]="s.closed_over_time ?? null"
              />
            </app-card>
            <app-card>
              <h2 class="mb-1 font-display text-card font-bold text-fg">
                {{ 'deviations.stats.age.title' | transloco }}
              </h2>
              <p class="mb-4 text-meta text-fg-muted">
                {{ 'deviations.stats.age.hint' | transloco }}
              </p>
              <ul class="flex flex-col gap-3">
                @for (bucket of ageBuckets(); track bucket.key) {
                  <li class="flex items-center justify-between gap-3">
                    <span class="text-ui text-fg">{{
                      'deviations.stats.age.' + bucket.key | transloco
                    }}</span>
                    <span
                      class="text-body font-bold"
                      [class]="
                        bucket.key === 'gt_90' && bucket.count > 0 ? 'text-warn-ink' : 'text-fg'
                      "
                      >{{ bucket.count }}</span
                    >
                  </li>
                }
              </ul>
              <p class="mt-4 border-t border-border pt-3 text-meta text-fg-muted">
                {{
                  'deviations.stats.actionsLine'
                    | transloco: { open: s.open_actions, overdue: s.overdue_actions }
                }}
              </p>
            </app-card>
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            @for (breakdown of breakdowns(); track breakdown.titleKey) {
              <app-card>
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ breakdown.titleKey | transloco }}
                </h2>
                @if (breakdown.hintKey) {
                  <p class="mb-3 text-meta text-fg-muted">{{ breakdown.hintKey | transloco }}</p>
                } @else {
                  <div class="mb-3"></div>
                }
                <app-stat-bar-list
                  [bars]="breakdown.bars"
                  [drillable]="breakdown.filterKey !== null"
                  (selectBar)="drillDown(breakdown.filterKey, $event)"
                />
              </app-card>
            }
          </div>
        }
      }
    </div>
  `,
})
export class DeviationStatsPage {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly statusLabels = inject(DeviationStatusLabels);
  protected readonly nav = inject(DeviationsNavService);

  protected readonly breadcrumbs = [DEVIATIONS_ROOT_CRUMB, { labelKey: 'deviations.stats.title' }];
  protected readonly orgId = this.selectedOrg.currentOrgId;

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

  protected readonly filters = signal<Readonly<Record<string, string>>>({});
  protected readonly stats = signal<DeviationStats | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  protected readonly types = signal<readonly { id: string; name: string }[]>([]);
  protected readonly departments = signal<readonly { id: string; name: string }[]>([]);

  protected readonly canReview = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'management_review:read'),
  );
  protected readonly typeOptions = computed<FilterOption[]>(() =>
    this.types().map((t) => ({ value: t.id, label: t.name, literal: true })),
  );
  protected readonly departmentOptions = computed<FilterOption[]>(() =>
    this.departments().map((d) => ({ value: d.id, label: d.name, literal: true })),
  );
  protected readonly hasFilters = computed(() => Object.values(this.filters()).some((v) => !!v));

  protected readonly ageBuckets = computed(() => {
    const age = this.stats()?.kpis?.open_age ?? {};
    return (['lt_30', 'd30_90', 'gt_90'] as const).map((key) => ({ key, count: age[key] ?? 0 }));
  });

  protected readonly breakdowns = computed<readonly Breakdown[]>(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    this.language.active();
    const t = (key: string) => this.language.translate(key);
    const deptNames = new Map(this.departments().map((d) => [d.id, d.name]));
    const statusOrder = s.status_order?.length ? s.status_order : STATUS_OPTIONS;
    const statusBuckets = orderedBuckets(s.by_status, statusOrder, (k) =>
      this.statusLabels.label({ status: k, record_type_version_id: null }),
    );
    const severityBuckets = orderedBuckets(s.by_severity, SEVERITY_OPTIONS, (k) =>
      t(severityLabelKey(k as Severity)),
    );
    const sourceBuckets = orderedBuckets(s.by_source ?? {}, SOURCE_OPTIONS, (k) =>
      t(sourceLabelKey(k as Source)),
    );
    const standardBuckets = recordToBuckets(s.by_standard, (k) =>
      t(standardLabelKey(k as Standard)),
    );
    const typeBuckets: RawBucket[] = s.by_type.map((row) => ({
      id: row.type_id,
      label: row.name,
      count: row.count,
    }));
    const nb = this.language.active() === 'nb';
    const requirementBuckets: RawBucket[] = (s.by_requirement ?? []).map((row) => {
      const key = shortNameKey(row.framework);
      const short = key ? t(key) : (fixedShortName(row.framework) ?? row.framework);
      const title = nb ? row.title_nb || row.title : row.title;
      return {
        id: `${row.framework}:${row.number}`,
        label: title ? `${short} · ${row.number} – ${title}` : `${short} · ${row.number}`,
        count: row.count,
      };
    });
    const deptBuckets = recordToBuckets(
      s.by_department,
      (id) => deptNames.get(id) ?? t('deviations.stats.unknownDepartment'),
    );

    const list: Breakdown[] = [
      {
        titleKey: 'deviations.stats.breakdowns.byStatus',
        hintKey: 'deviations.stats.breakdowns.byStatusHint',
        bars: toBars(statusBuckets, undefined, true),
        filterKey: 'status',
      },
      {
        titleKey: 'deviations.stats.breakdowns.bySeverity',
        bars: toBars(severityBuckets, undefined, true),
        filterKey: 'severity',
      },
      {
        titleKey: 'deviations.stats.breakdowns.bySource',
        hintKey: 'deviations.stats.breakdowns.bySourceHint',
        bars: toBars(sourceBuckets),
        filterKey: 'source',
      },
      {
        titleKey: 'deviations.stats.breakdowns.byType',
        bars: toBars(typeBuckets),
        filterKey: 'type_id',
      },
      {
        titleKey: 'deviations.stats.breakdowns.byRequirement',
        hintKey: 'deviations.stats.breakdowns.byRequirementHint',
        bars: toBars(requirementBuckets, TOP_REQUIREMENTS),
        filterKey: 'clause',
      },
      {
        titleKey: 'deviations.stats.breakdowns.byStandard',
        bars: toBars(standardBuckets),
        filterKey: 'standard',
      },
    ];
    if (deptBuckets.some((b) => b.count > 0)) {
      list.push({
        titleKey: 'deviations.stats.breakdowns.byDepartment',
        bars: toBars(deptBuckets),
        filterKey: 'department_id',
      });
    }
    return list;
  });

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'deviation',
      view: 'dashboard',
      title: this.language.translate('deviations.stats.title'),
    }));
    effect(() => {
      const orgId = this.orgId();
      untracked(() => {
        this.filters.set({});
        this.stats.set(null);
        this.types.set([]);
        this.departments.set([]);
        if (orgId) {
          this.loadReferences(orgId);
          this.load();
        }
      });
    });
  }

  protected days(value: number | null | undefined): string {
    return value === null || value === undefined
      ? this.language.translate('common.empty.dash')
      : this.language.translate('deviations.stats.kpis.daysValue', {
          days: formatNumber(value, this.language.locale(), '1.0-1'),
        });
  }

  protected avgText(value: number | null | undefined): string {
    return value === null || value === undefined
      ? ''
      : this.language.translate('deviations.stats.kpis.avgDays', {
          days: formatNumber(value, this.language.locale(), '1.0-1'),
        });
  }

  protected pct(value: number | null | undefined): string {
    return value === null || value === undefined
      ? this.language.translate('common.empty.dash')
      : `${value} %`;
  }

  /** Progress colours: green at 80 % and up, amber below; never red. */
  protected tone(value: number | null | undefined): 'pass' | 'warn' | 'neutral' {
    if (value === null || value === undefined) {
      return 'neutral';
    }
    return value >= 80 ? 'pass' : 'warn';
  }

  protected setFilter(key: FilterKey, value: string): void {
    const next = { ...this.filters() };
    if (value) {
      next[key] = value;
    } else {
      delete next[key];
    }
    this.filters.set(next);
    this.load();
  }

  protected clearFilters(): void {
    this.filters.set({});
    this.load();
  }

  protected drillDown(filterKey: string | null, value: string): void {
    if (!filterKey) {
      return;
    }
    // Requirement bars are `framework:number`; the list filters on the clause number.
    const filterValue = filterKey === 'clause' ? (value.split(':')[1] ?? value) : value;
    const queryParams: Record<string, string> = { ...this.filters(), [filterKey]: filterValue };
    void this.router.navigate(['/deviations'], { queryParams });
  }

  load(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    const f = this.filters();
    const filters: DeviationFilters = {
      type_id: f['type_id'] || undefined,
      standard: (f['standard'] as Standard) || undefined,
      severity: (f['severity'] as Severity) || undefined,
      source: (f['source'] as Source) || undefined,
      department_id: f['department_id'] || undefined,
    };
    this.loading.set(true);
    this.error.set(false);
    this.api.getStats(orgId, filters).subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  private loadReferences(orgId: string): void {
    this.api.listTypes(orgId).subscribe({
      next: (types) => this.types.set(types.map((t) => ({ id: t.id, name: t.name }))),
    });
    this.api.listAccessSubjects(orgId).subscribe({
      next: (subjects) =>
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name }))),
    });
  }
}

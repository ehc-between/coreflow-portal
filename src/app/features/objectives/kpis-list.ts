import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { formatNumber } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
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
import { ObjectivesTiles, SummaryTile } from './components/summary-tiles';
import { ObjectivesApi } from './data/objectives-api';
import {
  KPI_SORTS,
  KPI_STATUSES,
  Kpi,
  KpiHealthFilter,
  KpiListQuery,
  KpiSort,
  KpiStatus,
  MANAGEMENT_SYSTEMS,
  ManagementSystem,
  ObjectivesOverview,
} from './data/objectives.models';
import {
  KPI_STATUS_TONE,
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  healthKey,
  healthSpec,
  kpiStatusKey,
  managementSystemKey,
} from './objectives-display';
import { KPIS_CRUMB, OBJECTIVES_NAV, OBJECTIVES_ROOT_CRUMB } from './objectives-nav';

const PAGE_SIZE = 25;

/** KPI status filter: `in_use` (active + paused) by default, one status, or everything. */
export type KpiStatusFilter = 'in_use' | 'all' | KpiStatus;
export const KPI_STATUS_FILTERS: readonly KpiStatusFilter[] = ['in_use', ...KPI_STATUSES, 'all'];

/** Health filter: one health, or "needs attention" (at risk + off track). */
export type KpiHealthChoice = KpiHealthFilter | 'attention';
export const KPI_HEALTH_CHOICES: readonly KpiHealthChoice[] = [
  'attention',
  'on_track',
  'at_risk',
  'off_track',
  'no_data',
  'no_target',
];

export function kpiStatusesForFilter(filter: KpiStatusFilter): readonly KpiStatus[] {
  if (filter === 'in_use') {
    return ['active', 'paused'];
  }
  return filter === 'all' ? [] : [filter];
}

export function healthForChoice(
  choice: KpiHealthChoice | '',
): readonly KpiHealthFilter[] | undefined {
  if (!choice) {
    return undefined;
  }
  return choice === 'attention' ? ['at_risk', 'off_track'] : [choice];
}

/** KPI-tab tiles (finding 28): totals by health plus overdue measurements; each is a filter. */
export function kpiTiles(
  o: ObjectivesOverview | null,
  health: KpiHealthChoice | '',
  overdue: boolean,
): SummaryTile[] {
  if (!o) {
    return [];
  }
  const k = o.kpis;
  return [
    {
      key: 'all',
      labelKey: 'objectives.tiles.kpisTotal',
      value: k.total,
      tone: 'info',
      active: !health && !overdue,
    },
    {
      key: 'on_track',
      labelKey: 'objectives.tiles.onTrack',
      value: k.on_track,
      tone: 'pass',
      active: health === 'on_track',
    },
    {
      key: 'at_risk',
      labelKey: 'objectives.tiles.atRisk',
      value: k.at_risk,
      tone: 'warn',
      active: health === 'at_risk',
    },
    {
      key: 'off_track',
      labelKey: 'objectives.tiles.offTrack',
      value: k.off_track,
      tone: 'fail',
      active: health === 'off_track',
    },
    {
      key: 'no_data',
      labelKey: 'objectives.tiles.noData',
      value: k.no_data,
      tone: 'neutral',
      active: health === 'no_data',
    },
    {
      key: 'overdue',
      labelKey: 'objectives.tiles.measurementOverdue',
      value: k.measurement_overdue,
      tone: 'warn',
      active: overdue,
    },
  ];
}

/**
 * `/objectives/kpis`: every KPI with its latest value against the target value,
 * its health (on track / at risk / off track), the next measurement due, and
 * filters on status, health, management system, owner and overdue measurement.
 * `?attention=1` opens it on the KPIs that need attention.
 */
@Component({
  selector: 'app-kpis-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
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
    ObjectivesTiles,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      exportRegister="kpis"
      titleKey="objectives.kpiList.title"
      descriptionKey="objectives.kpiList.description"
      [breadcrumbs]="breadcrumbs"
      [scope]="scope"
      page="kpis"
      searchPlaceholderKey="objectives.kpiList.searchPlaceholder"
      [query]="q()"
      [filters]="savedFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="state() === 'ready' && kpis().length === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (canWrite()) {
        <app-button primary appTourStep="kpis-new" (click)="create()" data-testid="kpi-new">
          <app-icon name="plus" [size]="15" />
          {{ 'objectives.kpiList.new' | transloco }}
        </app-button>
      }
      <app-button
        secondary
        variant="secondary"
        [attr.title]="'objectives.ai.opensAssistant' | transloco"
        (click)="askOffTarget()"
      >
        <app-icon name="spark" [size]="15" />
        {{ 'objectives.ai.explainAttention' | transloco }}
      </app-button>

      <app-module-nav nav [items]="nav" labelKey="modules.names.objectives" />
      <app-help-strip help [scope]="scope" page="kpis" tour="kpis" lesson="good-kpis" />

      <app-objectives-tiles kpis [tiles]="tiles()" (selected)="applyTile($event)" />

      <label filters class="sr-only" for="kpi-health">{{
        'objectives.filters.health' | transloco
      }}</label>
      <select
        filters
        id="kpi-health"
        class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
        appTourStep="kpis-health"
        (change)="setHealth($any($event.target).value)"
      >
        <option value="" [selected]="!healthChoice()">
          {{ 'objectives.filters.anyHealth' | transloco }}
        </option>
        @for (h of healthChoices; track h) {
          <option [value]="h" [selected]="healthChoice() === h">
            {{ 'objectives.filters.healthOptions.' + h | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="kpi-status">{{
        'objectives.filters.status' | transloco
      }}</label>
      <select
        filters
        id="kpi-status"
        class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
        (change)="setStatus($any($event.target).value)"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ 'objectives.filters.kpiStatusOptions.' + s | transloco }}
          </option>
        }
      </select>

      <div more-filters class="flex flex-col gap-1">
        <label for="kpi-ms" class="text-meta font-semibold text-fg-muted">{{
          'objectives.filters.system' | transloco
        }}</label>
        <select
          id="kpi-ms"
          class="h-10 max-w-[220px] rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setSystem($any($event.target).value)"
        >
          <option value="" [selected]="!system()">
            {{ 'objectives.filters.allSystems' | transloco }}
          </option>
          @for (m of systems; track m) {
            <option [value]="m" [selected]="system() === m">{{ systemKey(m) | transloco }}</option>
          }
        </select>
      </div>
      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted" for="kpi-sort">
          {{ 'objectives.filters.sort' | transloco }}
          <select
            id="kpi-sort"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setSort($any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'objectives.filters.kpiSorts.' + s | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="inline-flex min-h-9 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="mine()"
            (change)="setMine($any($event.target).checked)"
          />
          {{ 'objectives.filters.mineKpis' | transloco }}
        </label>
        <label class="inline-flex min-h-9 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="overdue()"
            (change)="setOverdue($any($event.target).checked)"
          />
          {{ 'objectives.filters.measurementOverdue' | transloco }}
        </label>
      </div>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (kpis().length === 0) {
            <app-empty-state
              icon="search"
              titleKey="ui.empty.noResults"
              bodyKey="ui.empty.noResultsBody"
              ctaKey="ui.empty.clearFilters"
              ctaVariant="secondary"
              (cta)="clearFilters()"
            />
          } @else {
            <div class="overflow-hidden rounded-card border border-border bg-surface">
              <app-record-row-header dateKind="next" titleKey="objectives.kpiList.columnTitle" />
              <div
                role="list"
                [attr.aria-label]="'objectives.kpiList.title' | transloco"
                data-testid="kpi-rows"
              >
                @for (k of kpis(); track k.id) {
                  <app-record-row
                    [code]="k.code"
                    [title]="k.name"
                    [subtitle]="subtitle(k)"
                    [link]="['/objectives/kpis', k.id]"
                    [owner]="k.owner?.name"
                    [date]="k.next_due_date"
                    dateKind="next"
                    [overdue]="k.measurement_overdue"
                  >
                    <span coverage class="block min-w-0 [&_span]:whitespace-normal">
                      <app-coverage-chip entityType="kpi" [entityId]="k.id" />
                    </span>
                    @let h = health(k);
                    <app-status-badge
                      badges
                      [meaning]="h.meaning"
                      [value]="h.value"
                      [labelKey]="healthKey(k.last_status)"
                    />
                    @if (k.status !== 'active') {
                      <app-status-badge
                        badges
                        [meaning]="statusTone[k.status].meaning"
                        [value]="statusTone[k.status].value"
                        [labelKey]="statusKey(k.status)"
                      />
                    }
                  </app-record-row>
                }
              </div>
            </div>
            @if (total() > pageSize) {
              <div class="mt-3">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="kpis().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      }

      <div empty>
        <app-teaching-empty
          [scope]="scope"
          page="kpis"
          [showAction]="canWrite()"
          (action)="create()"
        />
      </div>

      <app-why-it-matters below [scope]="scope" page="kpis" />
    </app-record-list-page>
  `,
})
export class KpisList {
  private readonly api = inject(ObjectivesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  /** `?attention=1`: start on the KPIs that need attention (from the objectives tile). */
  readonly attention = input<string | undefined>(undefined);

  protected readonly scope = OBJECTIVES_SCOPE;
  protected readonly nav = OBJECTIVES_NAV;
  protected readonly breadcrumbs = [OBJECTIVES_ROOT_CRUMB, { labelKey: KPIS_CRUMB.labelKey }];
  protected readonly statusFilters = KPI_STATUS_FILTERS;
  protected readonly healthChoices = KPI_HEALTH_CHOICES;
  protected readonly systems = MANAGEMENT_SYSTEMS;
  protected readonly sorts = KPI_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = kpiStatusKey;
  protected readonly statusTone = KPI_STATUS_TONE;
  protected readonly healthKey = healthKey;
  protected readonly health = (k: Kpi) => healthSpec(k.last_status);
  protected readonly systemKey = managementSystemKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('objectives:write'),
  );

  protected readonly q = signal('');
  protected readonly status = signal<KpiStatusFilter>('in_use');
  protected readonly healthChoice = signal<KpiHealthChoice | ''>('');
  protected readonly system = signal<ManagementSystem | ''>('');
  protected readonly sort = signal<KpiSort>('code');
  protected readonly mine = signal(false);
  protected readonly overdue = signal(false);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly kpis = signal<readonly Kpi[]>([]);
  protected readonly total = signal(0);
  protected readonly overview = signal<ObjectivesOverview | null>(null);

  protected readonly tiles = computed(() =>
    kpiTiles(this.overview(), this.healthChoice(), this.overdue()),
  );
  protected readonly moreActive = computed(
    () =>
      (this.system() ? 1 : 0) +
      (this.sort() !== 'code' ? 1 : 0) +
      (this.mine() ? 1 : 0) +
      (this.overdue() ? 1 : 0),
  );
  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      this.status() !== 'in_use' ||
      !!this.healthChoice() ||
      !!this.system() ||
      this.mine() ||
      this.overdue(),
  );
  protected readonly savedFilters = computed<Record<string, string>>(() => ({
    status: this.status(),
    health: this.healthChoice(),
    system: this.system(),
    sort: this.sort(),
    mine: this.mine() ? '1' : '',
    overdue: this.overdue() ? '1' : '',
  }));

  private readonly query = computed<KpiListQuery>(() => ({
    q: this.q() || undefined,
    status: kpiStatusesForFilter(this.status()),
    last_status: healthForChoice(this.healthChoice()),
    management_system: this.system() || undefined,
    owner: this.mine() ? 'me' : undefined,
    measurement_overdue: this.overdue() || undefined,
    sort: this.sort(),
    limit: PAGE_SIZE,
    offset: this.offset(),
  }));

  private request = new Subscription();
  private overviewRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.overviewRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'kpi',
      view: 'list',
      title: this.language.translate('objectives.kpiList.title'),
    }));

    effect(() => {
      if (this.attention() === '1') {
        untracked(() => this.healthChoice.set('attention'));
      }
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const system = this.system() || undefined;
      untracked(() => {
        this.overviewRequest.unsubscribe();
        if (orgId) {
          this.overviewRequest = this.api.overview(orgId, system).subscribe({
            next: (o) => this.overview.set(o),
            error: () => this.overview.set(null),
          });
        }
      });
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = this.query();
      untracked(() => this.load(orgId, query));
    });
  }

  /** "Siste 4 stk. · målverdi 5 stk. · Hører til OBJ-001 · Månedlig". */
  protected subtitle(k: Kpi): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const num = (v: number) => formatNumber(v, this.language.locale(), '1.0-2');
    const unit = k.unit ? ` ${k.unit}` : '';
    const parts: string[] = [];
    parts.push(
      k.last_value !== null
        ? t('objectives.kpiList.latest', { value: `${num(k.last_value)}${unit}` })
        : t('objectives.common.noValue'),
    );
    if (k.target_value !== null) {
      parts.push(t('objectives.kpiList.target', { value: `${num(k.target_value)}${unit}` }));
    }
    if (k.objective) {
      parts.push(t('objectives.kpiList.belongsTo', { code: k.objective.code }));
    }
    parts.push(t(`objectives.frequency.${k.frequency}`));
    return parts.join(' · ');
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: KpiStatusFilter): void {
    this.offset.set(0);
    this.status.set(value);
  }

  protected setHealth(value: KpiHealthChoice | ''): void {
    this.offset.set(0);
    this.healthChoice.set(value);
  }

  protected setSystem(value: ManagementSystem | ''): void {
    this.offset.set(0);
    this.system.set(value);
  }

  protected setSort(value: KpiSort): void {
    this.offset.set(0);
    this.sort.set(value);
  }

  protected setMine(value: boolean): void {
    this.offset.set(0);
    this.mine.set(value);
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected applyTile(key: string): void {
    this.offset.set(0);
    if (key === 'overdue') {
      this.overdue.set(!this.overdue());
      return;
    }
    this.overdue.set(false);
    if (key === 'all') {
      this.healthChoice.set('');
      return;
    }
    this.healthChoice.set(this.healthChoice() === key ? '' : (key as KpiHealthChoice));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('in_use');
    this.healthChoice.set('');
    this.system.set('');
    this.mine.set(false);
    this.overdue.set(false);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.status.set(
      KPI_STATUS_FILTERS.includes(f['status'] as KpiStatusFilter)
        ? (f['status'] as KpiStatusFilter)
        : 'in_use',
    );
    this.healthChoice.set(
      KPI_HEALTH_CHOICES.includes(f['health'] as KpiHealthChoice)
        ? (f['health'] as KpiHealthChoice)
        : '',
    );
    this.system.set(
      MANAGEMENT_SYSTEMS.includes(f['system'] as ManagementSystem)
        ? (f['system'] as ManagementSystem)
        : '',
    );
    this.sort.set(KPI_SORTS.includes(f['sort'] as KpiSort) ? (f['sort'] as KpiSort) : 'code');
    this.mine.set(f['mine'] === '1');
    this.overdue.set(f['overdue'] === '1');
  }

  protected create(): void {
    void this.router.navigate(['/objectives/kpis/new']);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.query());
  }

  protected askOffTarget(): void {
    this.ask.showWith(this.language.translate('objectives.ai.prompts.explainOffTarget'));
  }

  private load(orgId: string | null, query: KpiListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listKpis(orgId, query).subscribe({
      next: (page) => {
        this.kpis.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

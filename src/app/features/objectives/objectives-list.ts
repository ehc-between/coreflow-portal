import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
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
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { StarterSetup } from '../../shared/starter-setup/starter-setup';
import { StarterSetupPrompt } from '../../shared/starter-setup/starter-setup-prompt';
import { ObjectiveProgress } from './components/objective-progress';
import { ObjectivesTiles, SummaryTile } from './components/summary-tiles';
import { ObjectivesApi } from './data/objectives-api';
import { objectivesErrorKey } from './data/objectives-errors';
import {
  EXPORT_FORMATS,
  ExportFormat,
  MANAGEMENT_SYSTEMS,
  ManagementSystem,
  OBJECTIVE_SORTS,
  OBJECTIVE_STATUSES,
  Objective,
  ObjectiveSort,
  ObjectiveStatus,
  ObjectivesOverview,
} from './data/objectives.models';
import {
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  OBJECTIVE_STATUS_TONE,
  managementSystemKey,
  countKey,
  needsAttention,
  objectiveStatusKey,
  objectiveSystems,
  planYears,
  saveBlob,
} from './objectives-display';
import { OBJECTIVES_NAV } from './objectives-nav';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;

/** Status filter of the list: open work by default, or one status, or everything. */
export type ObjectiveStatusFilter = 'open' | 'all' | ObjectiveStatus;
export const OBJECTIVE_STATUS_FILTERS: readonly ObjectiveStatusFilter[] = [
  'open',
  ...OBJECTIVE_STATUSES,
  'all',
];

export function statusesForFilter(filter: ObjectiveStatusFilter): readonly ObjectiveStatus[] {
  if (filter === 'open') {
    return ['draft', 'active'];
  }
  return filter === 'all' ? [] : [filter];
}

/** The tiles a beginner sees (U34: at most four). */
export const BEGINNER_TILES: ReadonlySet<string> = new Set([
  'active',
  'overdue',
  'achieved',
  'kpis',
]);

/** The register's headline tiles; each one is a filter (finding 28: objective tiles only). */
export function objectiveTiles(
  o: ObjectivesOverview | null,
  status: ObjectiveStatusFilter,
  overdue: boolean,
): SummaryTile[] {
  if (!o) {
    return [];
  }
  const s = o.objectives.by_status;
  return [
    {
      key: 'active',
      labelKey: 'objectives.tiles.active',
      value: s.active ?? 0,
      tone: 'accent',
      active: status === 'active' && !overdue,
    },
    {
      key: 'draft',
      labelKey: 'objectives.tiles.draft',
      value: s.draft ?? 0,
      tone: 'info',
      active: status === 'draft' && !overdue,
    },
    {
      key: 'overdue',
      labelKey: 'objectives.tiles.overdue',
      value: o.objectives.overdue,
      tone: 'warn',
      active: overdue,
    },
    {
      key: 'achieved',
      labelKey: 'objectives.tiles.achieved',
      value: s.achieved ?? 0,
      tone: 'pass',
      active: status === 'achieved' && !overdue,
    },
    {
      key: 'not_achieved',
      labelKey: 'objectives.tiles.notAchieved',
      value: s.not_achieved ?? 0,
      tone: 'fail',
      active: status === 'not_achieved' && !overdue,
    },
    {
      key: 'kpis',
      labelKey: 'objectives.tiles.kpisNeedAttention',
      value: needsAttention(o.kpis),
      tone: 'warn',
    },
  ];
}

/**
 * `/objectives`: the objectives register on the shared list frame. Tiles that
 * filter, search, two filters (status, plan year; management system under "Flere filtre") and the
 * rest under "Flere filtre", saved views, rows with requirement coverage and
 * progress, the objectives plan export, and a teaching empty state.
 */
@Component({
  selector: 'app-objectives-list',
  imports: [
    FulfilsRequirements,
    RouterLink,
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
    MenuItem,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    ObjectiveProgress,
    ObjectivesTiles,
    StarterSetup,
    StarterSetupPrompt,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="modules.names.objectives"
      descriptionKey="objectives.list.description"
      [scope]="scope"
      searchPlaceholderKey="objectives.list.searchPlaceholder"
      [query]="q()"
      [filters]="savedFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="state() === 'ready' && objectives().length === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (overview(); as o) {
        <p intro class="mt-1 text-ui text-fg-muted" data-testid="objectives-measure">
          {{ 'objectives.measure.lead' | transloco }}
          <a routerLink="/objectives" class="font-semibold text-accent hover:underline">{{
            'objectives.measure.objectives' | transloco: { count: o.objectives.total }
          }}</a>
          ·
          <a routerLink="/objectives/kpis" class="font-semibold text-accent hover:underline">{{
            'objectives.measure.kpis' | transloco: { count: o.kpis.total }
          }}</a>
          <span class="block text-meta">{{ 'objectives.measure.explain' | transloco }}</span>
        </p>
      }
      <app-fulfils-requirements help locationKey="objectives.objectives" />
      @if (canWrite()) {
        <app-button
          primary
          appTourStep="objectives-new"
          (click)="create()"
          data-testid="objective-new"
        >
          <app-icon name="plus" [size]="15" />
          {{ 'objectives.list.new' | transloco }}
        </app-button>
      }
      <app-button
        secondary
        variant="secondary"
        [attr.title]="'objectives.ai.opensAssistant' | transloco"
        (click)="askStatus()"
      >
        <app-icon name="spark" [size]="15" />
        {{ 'objectives.ai.summariseAll' | transloco }}
      </app-button>
      @for (format of formats; track format) {
        <button
          appMenuItem
          overflow
          type="button"
          [disabled]="exporting()"
          (click)="exportPlan(format)"
          [attr.data-testid]="'export-' + format"
        >
          {{ 'objectives.export.' + format | transloco: { year: exportYear() } }}
        </button>
      }
      @if (canWrite() && total() > 0) {
        <button
          appMenuItem
          overflow
          type="button"
          data-testid="starter-more"
          (click)="starter()?.open()"
        >
          {{ 'objectives.list.suggestMore' | transloco }}
        </button>
      }

      <app-module-nav nav [items]="nav" labelKey="modules.names.objectives" />
      <app-help-strip help [scope]="scope" page="list" tour="list" lesson="smart-objectives" />

      <app-objectives-tiles kpis [tiles]="tiles()" (selected)="applyTile($event)" />

      <label filters class="sr-only" for="obj-status">{{
        'objectives.filters.status' | transloco
      }}</label>
      <select
        filters
        id="obj-status"
        class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
        appTourStep="objectives-filters"
        (change)="setStatus($any($event.target).value)"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ 'objectives.filters.statusOptions.' + s | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="obj-year">{{
        'objectives.filters.year' | transloco
      }}</label>
      <select
        filters
        id="obj-year"
        class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
        (change)="setYear($any($event.target).value)"
      >
        <option value="" [selected]="!year()">
          {{ 'objectives.filters.allYears' | transloco }}
        </option>
        @for (y of years; track y) {
          <option [value]="y" [selected]="year() === y">
            {{ 'objectives.filters.planYear' | transloco: { year: y } }}
          </option>
        }
      </select>

      <div more-filters class="flex flex-col gap-1">
        <label for="obj-ms" class="text-meta font-semibold text-fg-muted">{{
          'objectives.filters.system' | transloco
        }}</label>
        <select
          id="obj-ms"
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
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted" for="obj-sort">
          {{ 'objectives.filters.sort' | transloco }}
          <select
            id="obj-sort"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setSort($any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'objectives.filters.objectiveSorts.' + s | transloco }}
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
          {{ 'objectives.filters.mine' | transloco }}
        </label>
        <label class="inline-flex min-h-9 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="overdue()"
            (change)="setOverdue($any($event.target).checked)"
          />
          {{ 'objectives.filters.overdue' | transloco }}
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
          @if (objectives().length === 0) {
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
              <app-record-row-header dateKind="due" />
              <div
                role="list"
                [attr.aria-label]="'modules.names.objectives' | transloco"
                data-testid="objectives-rows"
              >
                @for (o of objectives(); track o.id) {
                  <app-record-row
                    [code]="o.code"
                    [title]="o.title"
                    [subtitle]="subtitle(o)"
                    [link]="['/objectives', o.id]"
                    [owner]="o.owner?.name"
                    [date]="o.due_date"
                    dateKind="due"
                    [overdue]="o.overdue"
                  >
                    <span coverage class="block min-w-0">
                      <app-coverage-chip entityType="objective" [entityId]="o.id" />
                    </span>
                    <app-status-badge
                      badges
                      [meaning]="statusTone[o.status].meaning"
                      [value]="statusTone[o.status].value"
                      [labelKey]="statusKey(o.status)"
                    />
                    <app-objective-progress
                      badges
                      class="w-full"
                      [objective]="o"
                      [compact]="true"
                    />
                  </app-record-row>
                }
              </div>
            </div>
            @if (total() > pageSize) {
              <div class="mt-3">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="objectives().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      }

      <div empty>
        @if (canWrite()) {
          <app-starter-setup-prompt [provider]="starterProvider" (begin)="starter()?.open()" />
        }
        <app-teaching-empty
          [scope]="scope"
          page="list"
          [showAction]="canWrite()"
          (action)="create()"
        />
      </div>

      <app-why-it-matters below [scope]="scope" page="list" />
    </app-record-list-page>
    <app-starter-setup [provider]="starterProvider" (created)="reload()" />
  `,
})
export class ObjectivesList {
  private readonly api = inject(ObjectivesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly scope = OBJECTIVES_SCOPE;
  protected readonly nav = OBJECTIVES_NAV;
  protected readonly statusFilters = OBJECTIVE_STATUS_FILTERS;
  protected readonly systems = MANAGEMENT_SYSTEMS;
  protected readonly sorts = OBJECTIVE_SORTS;
  protected readonly years = planYears();
  protected readonly formats = EXPORT_FORMATS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = objectiveStatusKey;
  protected readonly statusTone = OBJECTIVE_STATUS_TONE;
  protected readonly systemKey = managementSystemKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('objectives:write'),
  );
  /** The starter-setup provider of the register ("Kom i gang med et forslag"). */
  protected readonly starterProvider = 'objectives.objectives';
  protected readonly starter = viewChild(StarterSetup);

  protected readonly q = signal('');
  protected readonly status = signal<ObjectiveStatusFilter>('open');
  protected readonly system = signal<ManagementSystem | ''>('');
  protected readonly year = signal<number | null>(null);
  protected readonly sort = signal<ObjectiveSort>('due_date');
  protected readonly mine = signal(false);
  protected readonly overdue = signal(false);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly objectives = signal<readonly Objective[]>([]);
  protected readonly total = signal(0);
  protected readonly overview = signal<ObjectivesOverview | null>(null);
  protected readonly exporting = signal(false);

  private readonly beginner = inject(GuidanceService).isBeginner;
  /** Beginners get the four tiles that answer "how are we doing" (principle 5). */
  protected readonly tiles = computed(() => {
    const tiles = objectiveTiles(this.overview(), this.status(), this.overdue());
    return this.beginner() ? tiles.filter((tile) => BEGINNER_TILES.has(tile.key)) : tiles;
  });
  protected readonly exportYear = computed(() => this.year() ?? Number(new Date().getFullYear()));
  protected readonly moreActive = computed(
    () =>
      (this.system() ? 1 : 0) +
      (this.sort() !== 'due_date' ? 1 : 0) +
      (this.mine() ? 1 : 0) +
      (this.overdue() ? 1 : 0),
  );
  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      this.status() !== 'open' ||
      !!this.system() ||
      this.year() !== null ||
      this.mine() ||
      this.overdue(),
  );
  protected readonly savedFilters = computed<Record<string, string>>(() => ({
    status: this.status(),
    system: this.system(),
    year: this.year() === null ? '' : String(this.year()),
    sort: this.sort(),
    mine: this.mine() ? '1' : '',
    overdue: this.overdue() ? '1' : '',
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
      entityType: 'objective',
      view: 'list',
      title: this.language.translate('modules.names.objectives'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const system = this.system() || undefined;
      const year = this.year() ?? undefined;
      untracked(() => this.loadOverview(orgId, system, year));
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = this.query();
      untracked(() => this.load(orgId, query));
    });
  }

  private readonly query = computed(() => ({
    q: this.q() || undefined,
    status: statusesForFilter(this.status()),
    management_system: this.system() || undefined,
    period_year: this.year() ?? undefined,
    owner: this.mine() ? 'me' : undefined,
    overdue: this.overdue() || undefined,
    sort: this.sort(),
    limit: PAGE_SIZE,
    offset: this.offset(),
  }));

  /** Systems · KPI health in words ("1 KPI · 1 på sporet"), never "utenfor mål" for at-risk. */
  protected subtitle(o: Objective): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts: string[] = objectiveSystems(o).map((s) =>
      t(`objectives.managementSystemsShort.${s}`),
    );
    const k = o.kpis;
    if (k.total === 0) {
      parts.push(t('objectives.list.noKpis'));
    } else {
      const health = [t(countKey('objectives.list.kpiCount', k.total), { count: k.total })];
      if (k.on_track) health.push(t('objectives.list.onTrack', { count: k.on_track }));
      if (k.at_risk) health.push(t('objectives.list.atRisk', { count: k.at_risk }));
      if (k.off_track) health.push(t('objectives.list.offTrack', { count: k.off_track }));
      if (k.no_data) health.push(t('objectives.list.noData', { count: k.no_data }));
      parts.push(health.join(' · '));
    }
    return parts.join(' — ');
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: ObjectiveStatusFilter): void {
    this.offset.set(0);
    this.status.set(value);
  }

  protected setSystem(value: ManagementSystem | ''): void {
    this.offset.set(0);
    this.system.set(value);
  }

  protected setYear(value: string): void {
    this.offset.set(0);
    this.year.set(value ? Number(value) : null);
  }

  protected setSort(value: ObjectiveSort): void {
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

  /** A tile filters the list to what it counts; pressing the active tile clears it. */
  protected applyTile(key: string): void {
    this.offset.set(0);
    if (key === 'kpis') {
      void this.router.navigate(['/objectives/kpis'], { queryParams: { attention: 1 } });
      return;
    }
    if (key === 'overdue') {
      const on = !this.overdue();
      this.overdue.set(on);
      this.status.set('open');
      return;
    }
    this.overdue.set(false);
    this.status.set(this.status() === key ? 'open' : (key as ObjectiveStatusFilter));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('open');
    this.system.set('');
    this.year.set(null);
    this.mine.set(false);
    this.overdue.set(false);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.status.set(
      OBJECTIVE_STATUS_FILTERS.includes(f['status'] as ObjectiveStatusFilter)
        ? (f['status'] as ObjectiveStatusFilter)
        : 'open',
    );
    this.system.set(
      MANAGEMENT_SYSTEMS.includes(f['system'] as ManagementSystem)
        ? (f['system'] as ManagementSystem)
        : '',
    );
    const year = Number(f['year']);
    this.year.set(f['year'] && Number.isInteger(year) ? year : null);
    this.sort.set(
      OBJECTIVE_SORTS.includes(f['sort'] as ObjectiveSort)
        ? (f['sort'] as ObjectiveSort)
        : 'due_date',
    );
    this.mine.set(f['mine'] === '1');
    this.overdue.set(f['overdue'] === '1');
  }

  protected create(): void {
    void this.router.navigate(['/objectives/new']);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.query());
  }

  protected askStatus(): void {
    this.ask.showWith(this.language.translate('objectives.ai.prompts.summariseAll'));
  }

  /** Download the objectives plan ("Målplan 2026") for the chosen year and system. */
  protected exportPlan(format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    const year = this.exportYear();
    this.api
      .exportPlan(orgId, format, {
        period_year: year,
        management_system: this.system() || undefined,
        lang: this.language.active(),
      })
      .subscribe({
        next: (blob) => {
          this.exporting.set(false);
          const name = this.language.translate('objectives.export.fileName', { year });
          saveBlob(blob, `${name}.${format}`);
        },
        error: (error: unknown) => {
          this.exporting.set(false);
          this.notifications.error(objectivesErrorKey(error));
        },
      });
  }

  private loadOverview(
    orgId: string | null,
    system: ManagementSystem | undefined,
    year: number | undefined,
  ): void {
    this.overviewRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.overviewRequest = this.api.overview(orgId, system, year).subscribe({
      next: (overview) => this.overview.set(overview),
      error: () => this.overview.set(null),
    });
  }

  private load(orgId: string | null, query: Parameters<ObjectivesApi['list']>[1]): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, query).subscribe({
      next: (page) => {
        this.objectives.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

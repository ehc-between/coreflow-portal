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
import { ActivatedRoute, Router } from '@angular/router';
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
import { KpiTile, KpiTone } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { GanttRow } from './data/gantt';
import {
  OPEN_PROJECT_STATUSES,
  PERM_WRITE,
  PROJECT_KINDS,
  PROJECT_SORTS,
  PROJECT_STATUSES,
  Project,
  ProjectKind,
  ProjectListQuery,
  ProjectOverview,
  ProjectSort,
  ProjectStatus,
  isClosedStatus,
  isOneOf,
} from './data/project.models';
import {
  healthBadge,
  healthColour,
  projectStatusBadge,
  projectStatusKey,
} from './data/project-display';
import { ProjectsApi } from './data/projects-api';
import { GanttChart } from './gantt-chart';
import { CustomerFilter, customerIdFromRoute } from '../../shared/customers';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;
/** The "at risk" view filters open projects in the browser (the API has no health filter). */
const AT_RISK_LIMIT = 100;

/** Status filter options: `open` = every status that is not closed. */
export const STATUS_FILTERS = ['open', 'all', ...PROJECT_STATUSES] as const;
export const PEOPLE_FILTERS = ['', 'owner', 'member'] as const;
export const LIST_VIEWS = ['list', 'timeline'] as const;
export type ListView = (typeof LIST_VIEWS)[number];
/** Summary-strip shortcuts. */
export const FOCUS_FILTERS = ['', 'at_risk'] as const;
export type FocusFilter = (typeof FOCUS_FILTERS)[number];

export function statusesForFilter(filter: string): readonly ProjectStatus[] {
  if (filter === 'open') {
    return OPEN_PROJECT_STATUSES;
  }
  return isOneOf(PROJECT_STATUSES, filter) ? [filter] : [];
}

/** Open and red or amber, or overdue (the overview's `at_risk` rule). */
export function isAtRisk(p: Pick<Project, 'status' | 'health' | 'is_overdue'>): boolean {
  return !isClosedStatus(p.status) && (p.health === 'red' || p.health === 'amber' || p.is_overdue);
}

/** Portfolio timeline rows: one bar per project from its start to its due date, coloured by health. */
export function projectRows(projects: readonly Project[]): GanttRow[] {
  return projects.map((p) => ({
    id: p.id,
    kind: 'project',
    title: `${p.code} ${p.title}`,
    subtitle: p.owner?.name ?? null,
    status: p.status,
    start: p.start_date,
    end: p.due_date,
    depth: 0,
    overdue: p.is_overdue,
    url: p.url,
    tone: healthColour(p.health),
  }));
}

/**
 * The project register (`/projects`): a clickable portfolio summary, search,
 * filters on status and people (kind, sorting and overdue under "Flere filtre"),
 * saved views and paging, as a list or as a portfolio timeline.
 */
@Component({
  selector: 'app-projects-list',
  imports: [
    FulfilsRequirements,
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
    KpiTile,
    LoadingState,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    GanttChart,
    CustomerFilter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      exportRegister="projects"
      titleKey="modules.names.projects"
      descriptionKey="projects.list.subtitle"
      [breadcrumbs]="[{ labelKey: 'modules.names.projects' }]"
      scope="projects"
      searchPlaceholderKey="projects.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="projects.register" />
      @if (canWrite()) {
        <app-button
          primary
          (click)="newProject()"
          appTourStep="projects-new"
          data-testid="new-project"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'projects.list.new' | transloco }}
        </app-button>
      }
      <div
        secondary
        class="inline-flex rounded-tile border border-border p-0.5"
        role="group"
        [attr.aria-label]="'projects.list.viewLabel' | transloco"
        appTourStep="projects-views"
      >
        @for (v of views; track v) {
          <button
            type="button"
            class="h-8 rounded-tile px-3 text-ui font-semibold"
            [class.bg-accent-soft]="view() === v"
            [class.text-accent]="view() === v"
            [class.text-fg-muted]="view() !== v"
            [attr.aria-pressed]="view() === v"
            (click)="setView(v)"
            [attr.data-testid]="'view-' + v"
          >
            {{ 'projects.list.views.' + v | transloco }}
          </button>
        }
      </div>

      <app-help-strip help scope="projects" page="list" tour="list" lesson="project-basics" />

      <div kpis class="contents">
        @for (k of kpis(); track k.key) {
          <button
            type="button"
            class="block w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-default"
            [class.ring-2]="k.active"
            [class.ring-accent]="k.active"
            [disabled]="!k.clickable"
            [attr.aria-pressed]="k.clickable ? k.active : null"
            [attr.data-testid]="'kpi-' + k.key"
            (click)="focusKpi(k.key)"
          >
            <app-kpi-tile
              [label]="'projects.kpis.' + k.key | transloco"
              [value]="k.value"
              [tone]="k.tone"
              [delta]="k.hintKey ? (k.hintKey | transloco: { count: k.hint }) : ''"
              deltaTone="neutral"
            />
          </button>
        }
      </div>

      <app-customer-filter
        filters
        [value]="customerId()"
        (valueChange)="setCustomer($event)"
        data-testid="project-customer-filter"
      />
      <label filters class="sr-only" for="cf-project-status">
        {{ 'projects.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-project-status"
        class="h-10 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg"
        (change)="setStatus($any($event.target).value)"
        appTourStep="projects-filters"
        data-testid="filter-status"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ statusFilterKey(s) | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-project-people">
        {{ 'projects.filters.people' | transloco }}
      </label>
      <select
        filters
        id="cf-project-people"
        class="hidden h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg sm:block"
        (change)="setPeople($any($event.target).value)"
        data-testid="filter-people"
      >
        @for (p of peopleFilters; track p) {
          <option [value]="p" [selected]="people() === p">
            {{ 'projects.filters.peopleOptions.' + (p || 'anyone') | transloco }}
          </option>
        }
      </select>

      <div more-filters class="flex flex-col gap-3">
        <div class="flex flex-col gap-1 sm:hidden">
          <label for="cf-project-people-m" class="text-meta font-semibold text-fg-muted">{{
            'projects.filters.people' | transloco
          }}</label>
          <select
            id="cf-project-people-m"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="setPeople($any($event.target).value)"
          >
            @for (p of peopleFilters; track p) {
              <option [value]="p" [selected]="people() === p">
                {{ 'projects.filters.peopleOptions.' + (p || 'anyone') | transloco }}
              </option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cf-project-kind-m" class="text-meta font-semibold text-fg-muted">{{
            'projects.filters.kind' | transloco
          }}</label>
          <select
            id="cf-project-kind-m"
            data-testid="filter-kind"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="setKind($any($event.target).value)"
          >
            <option value="" [selected]="!kind()">
              {{ 'projects.filters.allKinds' | transloco }}
            </option>
            @for (k of kinds; track k) {
              <option [value]="k" [selected]="kind() === k">
                {{ 'projects.kinds.' + k | transloco }}
              </option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cf-project-sort" class="text-meta font-semibold text-fg-muted">{{
            'projects.filters.sort' | transloco
          }}</label>
          <select
            id="cf-project-sort"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="setSort($any($event.target).value)"
            data-testid="filter-sort"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'projects.sorts.' + sortKey(s) | transloco }}
              </option>
            }
          </select>
        </div>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="overdue()"
            (change)="setOverdue($any($event.target).checked)"
            data-testid="filter-overdue"
          />
          {{ 'projects.filters.overdue' | transloco }}
        </label>
      </div>

      @if (state() === 'ready' && total() > 0) {
        <p class="mb-2 text-meta text-fg-muted" data-testid="count-line" aria-live="polite">
          {{ countLine() }}
          @if (isFiltered()) {
            ·
            <button
              type="button"
              class="font-semibold text-accent hover:underline"
              (click)="resetFilters()"
              data-testid="reset-filters-inline"
            >
              {{ 'projects.list.resetFilters' | transloco }}
            </button>
          }
        </p>
      }

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (visibleRows().length === 0) {
              <app-empty-state
                icon="search"
                titleKey="projects.list.noMatch"
                [bodyKey]="hiddenClosed() ? 'projects.list.noMatchClosedHidden' : null"
                ctaKey="projects.list.resetFilters"
                ctaVariant="secondary"
                (cta)="resetFilters()"
                data-testid="no-match"
              />
            } @else {
              @if (view() === 'timeline') {
                <div class="p-3">
                  <app-gantt-chart
                    [rows]="timelineRows()"
                    labelKey="projects.list.timelineLabel"
                    emptyKey="projects.list.timelineEmpty"
                    legend="portfolio"
                  />
                </div>
              } @else {
                <div role="list" data-testid="project-rows">
                  <app-record-row-header dateKind="due" />
                  @for (p of visibleRows(); track p.id) {
                    <app-record-row
                      [code]="p.code"
                      [title]="p.title"
                      [subtitle]="subtitle(p)"
                      [link]="['/projects', p.id]"
                      [owner]="p.owner?.name"
                      [date]="p.due_date"
                      dateKind="due"
                      [overdue]="p.is_overdue"
                    >
                      <span coverage class="block max-w-full min-w-0 overflow-hidden">
                        <app-coverage-chip entityType="project" [entityId]="p.id" />
                      </span>
                      <span badges class="contents">
                        <app-status-badge
                          [meaning]="statusBadge(p.status).meaning"
                          [value]="statusBadge(p.status).value"
                          [labelKey]="statusBadge(p.status).labelKey"
                        />
                        @if (p.health && !closedStatus(p.status)) {
                          <app-status-badge
                            [meaning]="health(p.health).meaning"
                            [value]="health(p.health).value"
                            [labelKey]="health(p.health).labelKey"
                          />
                        }
                        @if (p.progress_percent !== undefined) {
                          <span
                            class="inline-flex items-center gap-1.5 text-meta text-fg-muted"
                            [attr.aria-label]="
                              'projects.list.progressLabel'
                                | transloco: { percent: p.progress_percent }
                            "
                            data-testid="row-progress"
                          >
                            <span class="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
                              <span
                                class="block h-full rounded-full"
                                [class]="p.progress_percent >= 100 ? 'bg-pass' : 'bg-accent'"
                                [style.width.%]="p.progress_percent"
                              ></span>
                            </span>
                            <span aria-hidden="true">{{ p.progress_percent }} %</span>
                          </span>
                        }
                      </span>
                    </app-record-row>
                  }
                </div>
              }
              @if (showPager()) {
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
        }
      </app-card>

      <app-why-it-matters below scope="projects" page="list" />

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="projects"
            page="list"
            [showAction]="canWrite()"
            (action)="newProject()"
          />
        </app-card>
        <app-why-it-matters scope="projects" page="list" />
      </div>
    </app-record-list-page>
  `,
})
export class ProjectsList {
  private readonly api = inject(ProjectsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly peopleFilters = PEOPLE_FILTERS;
  protected readonly kinds = PROJECT_KINDS;
  protected readonly sorts = PROJECT_SORTS;
  protected readonly views = LIST_VIEWS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusBadge = projectStatusBadge;
  protected readonly health = healthBadge;
  protected readonly closedStatus = isClosedStatus;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly q = signal('');
  /** The Kunde filter (`?customer_id=`, e.g. from the customer card's "Se alle"). */
  protected readonly customerId = signal<string | null>(customerIdFromRoute(this.route));
  protected readonly status = signal<string>('open');
  protected readonly people = signal<(typeof PEOPLE_FILTERS)[number]>('');
  protected readonly kind = signal<ProjectKind | ''>('');
  protected readonly overdue = signal(false);
  protected readonly focus = signal<FocusFilter>('');
  protected readonly sort = signal<ProjectSort>('-updated_at');
  protected readonly view = signal<ListView>('list');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Project[]>([]);
  protected readonly total = signal(0);
  protected readonly overview = signal<ProjectOverview | null>(null);
  /** The rows shown: all of the page, or only the at-risk ones for that shortcut. */
  protected readonly visibleRows = computed(() =>
    this.focus() === 'at_risk' ? this.rows().filter(isAtRisk) : this.rows(),
  );
  protected readonly timelineRows = computed(() => projectRows(this.visibleRows()));

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      !!this.customerId() ||
      (this.status() !== 'open' && this.status() !== 'all') ||
      !!this.people() ||
      !!this.kind() ||
      this.overdue() ||
      !!this.focus(),
  );
  protected readonly moreActive = computed(() => (this.overdue() ? 1 : 0) + (this.kind() ? 1 : 0));
  /** The teaching empty state: the register itself is empty (not just this filter). */
  protected readonly showEmpty = computed(() => {
    const o = this.overview();
    return (
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.isFiltered() &&
      (o === null || o.total === 0)
    );
  });
  /** Closed projects exist but the status filter hides them. */
  protected readonly hiddenClosed = computed(
    () => this.status() === 'open' && (this.overview()?.closed ?? 0) > 0,
  );
  protected readonly showPager = computed(
    () => this.focus() !== 'at_risk' && this.total() > PAGE_SIZE,
  );

  /** "Viser 3 av 4 prosjekter (1 avsluttet er skjult)". */
  protected readonly countLine = computed(() => {
    const shown = this.focus() === 'at_risk' ? this.visibleRows().length : this.total();
    const all = this.overview()?.total ?? null;
    const t = (key: string, params: Record<string, unknown>) =>
      this.language.translate(key, params);
    const base =
      all !== null && all !== shown
        ? t('projects.list.countOf', { shown, total: all })
        : t('projects.list.count', { count: shown });
    return this.hiddenClosed()
      ? `${base} ${t('projects.list.closedHidden', { count: this.overview()?.closed ?? 0 })}`
      : base;
  });

  protected readonly kpis = computed(() => {
    const o = this.overview();
    if (!o) {
      return [];
    }
    const f = this.focus();
    const tiles: {
      key: string;
      value: number;
      tone: KpiTone;
      clickable: boolean;
      active: boolean;
      hintKey: string | null;
      hint: number;
    }[] = [
      {
        key: 'active',
        value: o.active,
        tone: 'accent',
        clickable: true,
        active: this.status() === 'active' && !f && !this.overdue(),
        hintKey: o.open > o.active ? 'projects.kpis.openHint' : null,
        hint: o.open,
      },
      {
        key: 'at_risk',
        value: o.at_risk,
        tone: o.at_risk > 0 ? 'warn' : 'neutral',
        clickable: o.at_risk > 0,
        active: f === 'at_risk',
        hintKey: null,
        hint: 0,
      },
      {
        key: 'reviews_pending',
        value: o.reviews_pending,
        tone: o.reviews_pending > 0 ? 'info' : 'neutral',
        clickable: false,
        active: false,
        hintKey: o.milestones_overdue > 0 ? 'projects.kpis.milestonesOverdue' : null,
        hint: o.milestones_overdue,
      },
      {
        key: 'overdue',
        value: o.overdue,
        tone: o.overdue > 0 ? 'warn' : 'neutral',
        clickable: o.overdue > 0,
        active: this.overdue() && !f,
        hintKey: null,
        hint: 0,
      },
    ];
    return tiles;
  });

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    people: this.people(),
    kind: this.kind(),
    overdue: this.overdue() ? '1' : '',
    focus: this.focus(),
    sort: this.sort(),
    view: this.view(),
    customer: this.customerId() ?? '',
  }));

  private request = new Subscription();
  private overviewRequest = new Subscription();
  private readonly reloadTick = signal(0);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.overviewRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'projects',
      entityType: 'project',
      view: 'list',
      title: this.language.translate('modules.names.projects'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reloadTick();
      untracked(() => this.loadOverview(orgId));
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const people = this.people();
      const atRisk = this.focus() === 'at_risk';
      this.reloadTick();
      const query: ProjectListQuery = {
        q: this.q() || undefined,
        status: atRisk ? OPEN_PROJECT_STATUSES : statusesForFilter(this.status()),
        owner: people === 'owner' ? 'me' : undefined,
        member: people === 'member' ? 'me' : undefined,
        kind: this.kind() || undefined,
        customer_id: this.customerId() || undefined,
        overdue: this.overdue() ? true : undefined,
        sort: this.sort(),
        limit: atRisk ? AT_RISK_LIMIT : PAGE_SIZE,
        offset: atRisk ? 0 : this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected subtitle(p: Project): string {
    const kind = this.language.translate(`projects.kinds.${p.kind}`);
    const members = this.language.translate('projects.list.members', { count: p.member_count });
    return [p.customer?.name, kind, members].filter(Boolean).join(' · ');
  }

  protected statusFilterKey(filter: string): string {
    return filter === 'open' || filter === 'all'
      ? `projects.filters.statusOptions.${filter}`
      : projectStatusKey(filter);
  }

  protected sortKey(sort: string): string {
    return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
  }

  protected reload(): void {
    this.reloadTick.update((v) => v + 1);
  }

  protected focusKpi(key: string): void {
    this.offset.set(0);
    if (key === 'active') {
      const on = this.status() === 'active' && !this.focus() && !this.overdue();
      this.focus.set('');
      this.overdue.set(false);
      this.status.set(on ? 'open' : 'active');
    } else if (key === 'at_risk') {
      this.focus.set(this.focus() === 'at_risk' ? '' : 'at_risk');
      this.overdue.set(false);
      this.status.set('open');
    } else if (key === 'overdue') {
      const on = this.overdue() && !this.focus();
      this.focus.set('');
      this.status.set('open');
      this.overdue.set(!on);
    }
  }

  protected resetFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('all');
    this.people.set('');
    this.kind.set('');
    this.overdue.set(false);
    this.focus.set('');
    this.setCustomer(null);
  }

  /** Filter on one customer and keep `?customer_id=` in the address (shareable). */
  protected setCustomer(id: string | null): void {
    this.offset.set(0);
    this.customerId.set(id);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { customer_id: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.focus.set('');
    this.status.set(isOneOf(STATUS_FILTERS, value) ? value : 'open');
  }

  protected setPeople(value: string): void {
    this.offset.set(0);
    this.people.set(isOneOf(PEOPLE_FILTERS, value) ? value : '');
  }

  protected setKind(value: string): void {
    this.offset.set(0);
    this.kind.set(isOneOf(PROJECT_KINDS, value) ? value : '');
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(isOneOf(PROJECT_SORTS, value) ? value : '-updated_at');
  }

  protected setView(value: string): void {
    this.view.set(isOneOf(LIST_VIEWS, value) ? value : 'list');
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.setStatus(f['status'] ?? 'open');
    this.setPeople(f['people'] ?? '');
    this.setKind(f['kind'] ?? '');
    this.setOverdue(f['overdue'] === '1');
    this.focus.set(isOneOf(FOCUS_FILTERS, f['focus']) ? f['focus'] : '');
    this.setSort(f['sort'] ?? '-updated_at');
    this.setView(f['view'] ?? 'list');
    this.setCustomer(f['customer'] || null);
  }

  protected newProject(): void {
    void this.router.navigate(['/projects/new']);
  }

  private loadOverview(orgId: string | null): void {
    this.overviewRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.overviewRequest = this.api.overview(orgId).subscribe({
      next: (o) => this.overview.set(o),
      // Older servers have no overview: the list still works without the strip.
      error: () => this.overview.set(null),
    });
  }

  private load(orgId: string | null, query: ProjectListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

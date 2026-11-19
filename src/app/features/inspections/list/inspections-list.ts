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
import { providePageContext } from '../../../core/ai/page-context';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalPercentPipe, formatLocalDay } from '../../../shared/locale/locale-pipes';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { FILTER_STYLES, pick } from '../components/filter-styles';
import {
  INSPECTIONS_NAV,
  INSPECTIONS_SETTINGS_LINK,
  distinctTemplateTitle,
  inspectionStatusKey,
  resultKey,
} from '../data/inspection-display';
import { InspectionReferences } from '../data/inspection-references';
import {
  INSPECTIONS_MODULE,
  INSPECTION_ENTITY_TYPE,
  INSPECTION_RESULTS,
  INSPECTION_SORTS,
  INSPECTION_STATUSES,
  Inspection,
  InspectionListQuery,
  InspectionResult,
  InspectionSort,
  InspectionStats,
  InspectionStatus,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;

/** i18n key suffix (`inspections.sort.<key>`) per sort option. */
export const INSPECTION_SORT_KEYS: Readonly<Record<InspectionSort, string>> = {
  due_at: 'dueAsc',
  '-due_at': 'dueDesc',
  '-created_at': 'createdDesc',
  '-completed_at': 'completedDesc',
  code: 'code',
};

/** `open` is a shorthand for planned + in progress; '' is every status (the default). */
type StatusFilter = InspectionStatus | 'open' | '';

export interface InspectionListFilters {
  readonly status: StatusFilter;
  readonly result: InspectionResult | '';
  readonly inspector: '' | 'me';
  readonly overdue: '' | 'true';
  /** A template id (e.g. from "Inspeksjoner 3" on a template), or ''. */
  readonly template: string;
  readonly sort: InspectionSort;
}

export const DEFAULT_INSPECTION_FILTERS: InspectionListFilters = {
  status: '',
  result: '',
  inspector: '',
  overdue: '',
  template: '',
  sort: '-due_at',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseInspectionFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): InspectionListFilters {
  const template = raw['template'] ?? '';
  return {
    status: pick<StatusFilter>(raw['status'], ['', 'open', ...INSPECTION_STATUSES], ''),
    result: pick(raw['result'], ['', ...INSPECTION_RESULTS], ''),
    inspector: pick(raw['inspector'], ['', 'me'] as const, ''),
    overdue: pick(raw['overdue'], ['', 'true'] as const, ''),
    template: UUID.test(template) ? template : '',
    sort: pick(raw['sort'], INSPECTION_SORTS, '-due_at'),
  };
}

export function toInspectionQuery(
  q: string,
  f: InspectionListFilters,
  offset: number,
): InspectionListQuery {
  const status: readonly InspectionStatus[] | undefined =
    f.status === 'open' ? ['planned', 'in_progress'] : f.status ? [f.status] : undefined;
  return {
    q: q.trim() || undefined,
    status,
    result: f.result || undefined,
    inspector: f.inspector || undefined,
    overdue: f.overdue === 'true' ? true : undefined,
    template_id: f.template || undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * Inspections (`/inspections`, "Inspeksjoner"): key figures over all inspections, each
 * one a shortcut to the matching filter (open, overdue, completed, open findings,
 * serious findings without a deviation); then search, filters (status, result; mine,
 * overdue, checklist and sort under "Flere filtre"), saved views and paging. Every row
 * shows the checklist and place only when the title does not already say it, what
 * it checks, the inspector, how far it got or its result, the requirements it
 * documents and its due date. Planning needs `inspections:write`. Learning sits in
 * the help strip; the empty register teaches how inspections work.
 */
@Component({
  selector: 'app-inspections-list',
  imports: [
    FulfilsRequirements,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    LocalPercentPipe,
    CoverageChip,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
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
      exportRegister="inspections"
      titleKey="modules.names.inspections"
      descriptionKey="inspections.list.subtitle"
      scope="inspections"
      [settingsLink]="settingsLink"
      searchPlaceholderKey="inspections.list.searchPlaceholder"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="inspections.register" />
      <a
        primary
        *appHasPermission="'inspections:write'"
        routerLink="/inspections/new"
        appTourStep="inspections-new"
        data-testid="new-inspection"
      >
        <app-button>
          <app-icon name="plus" [size]="15" />
          {{ 'inspections.list.new' | transloco }}
        </app-button>
      </a>

      <app-module-nav nav class="mb-4 block" labelKey="modules.names.inspections" [items]="nav" />
      <app-help-strip help scope="inspections" page="list" tour="list" lesson="inspection-basics" />

      <ng-container ngProjectAs="[kpis]">
        @if (stats(); as st) {
          <button
            type="button"
            class="cf-kpi"
            (click)="showOnly({ status: 'open' })"
            [attr.aria-label]="'inspections.stats.openFilter' | transloco"
            data-testid="kpi-open"
          >
            <app-kpi-tile
              [label]="t('inspections.stats.open')"
              [value]="(st.by_status.planned ?? 0) + (st.by_status.in_progress ?? 0)"
              [delta]="nextDueText()"
              tone="info"
            />
          </button>
          <button
            type="button"
            class="cf-kpi"
            (click)="showOnly({ overdue: 'true' })"
            [attr.aria-label]="'inspections.stats.overdueFilter' | transloco"
            data-testid="kpi-overdue"
          >
            <app-kpi-tile
              [label]="t('inspections.stats.overdue')"
              [value]="st.overdue"
              [tone]="st.overdue ? 'warn' : 'neutral'"
            />
          </button>
          <button
            type="button"
            class="cf-kpi"
            (click)="showOnly({ status: 'completed' })"
            [attr.aria-label]="'inspections.stats.completedFilter' | transloco"
            data-testid="kpi-pass-rate"
          >
            <app-kpi-tile
              [label]="t('inspections.stats.passRate')"
              [value]="passRate() === null ? '—' : (passRate() | localPercent)"
              [delta]="completedText()"
              tone="pass"
            />
          </button>
          <button
            type="button"
            class="cf-kpi"
            (click)="showOnly({ status: 'completed' })"
            [attr.aria-label]="'inspections.stats.completedFilter' | transloco"
          >
            <app-kpi-tile
              [label]="t('inspections.stats.averageScore')"
              [value]="st.average_score_pct === null ? '—' : (st.average_score_pct | localPercent)"
              [delta]="t('inspections.stats.allCompleted')"
              tone="accent"
            />
          </button>
          <a
            class="cf-kpi"
            routerLink="/inspections/findings"
            [queryParams]="{ status: 'open' }"
            [attr.aria-label]="'inspections.stats.openFindingsLink' | transloco"
            data-testid="kpi-findings"
          >
            <app-kpi-tile
              [label]="t('inspections.stats.openFindings')"
              [value]="st.open_findings"
              [delta]="overdueFindingsText()"
              [tone]="st.open_findings ? 'warn' : 'neutral'"
            />
          </a>
          @if (st.open_high_findings_without_deviation) {
            <a
              class="cf-kpi"
              routerLink="/inspections/findings"
              [queryParams]="{ status: 'open', severity: 'high', deviation: 'false' }"
              [attr.aria-label]="'inspections.stats.seriousLink' | transloco"
              data-testid="kpi-serious"
            >
              <app-kpi-tile
                [label]="t('inspections.stats.serious')"
                [value]="st.open_high_findings_without_deviation"
                [delta]="t('inspections.stats.seriousHint')"
                tone="fail"
              />
            </a>
          }
        }
      </ng-container>

      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'inspections.filters.status' | transloco"
        (change)="setFilter('status', $any($event.target).value)"
        appTourStep="inspections-filters"
        data-testid="filter-status"
      >
        <option value="" [selected]="filters().status === ''">
          {{ 'inspections.filters.allStatuses' | transloco }}
        </option>
        <option value="open" [selected]="filters().status === 'open'">
          {{ 'inspections.filters.open' | transloco }}
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
        [attr.aria-label]="'inspections.filters.result' | transloco"
        (change)="setFilter('result', $any($event.target).value)"
      >
        <option value="" [selected]="filters().result === ''">
          {{ 'inspections.filters.anyResult' | transloco }}
        </option>
        @for (r of results; track r) {
          <option [value]="r" [selected]="r === filters().result">
            {{ resultKey(r) | transloco }}
          </option>
        }
      </select>
      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'inspections.filters.inspector' | transloco }}
          <select class="cf-filter" (change)="setFilter('inspector', $any($event.target).value)">
            <option value="" [selected]="filters().inspector === ''">
              {{ 'inspections.filters.anyInspector' | transloco }}
            </option>
            <option value="me" [selected]="filters().inspector === 'me'">
              {{ 'inspections.filters.mine' | transloco }}
            </option>
          </select>
        </label>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="filters().overdue === 'true'"
            (change)="setFilter('overdue', $any($event.target).checked ? 'true' : '')"
            data-testid="filter-overdue"
          />
          {{ 'inspections.filters.overdue' | transloco }}
        </label>
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'inspections.filters.template' | transloco }}
          <select
            class="cf-filter"
            (change)="setFilter('template', $any($event.target).value)"
            data-testid="filter-template"
          >
            <option value="" [selected]="!filters().template">
              {{ 'inspections.filters.anyTemplate' | transloco }}
            </option>
            @if (orphanTemplate()) {
              <option [value]="filters().template" selected>
                {{ 'inspections.filters.chosenTemplate' | transloco }}
              </option>
            }
            @for (t of templates(); track t.id) {
              <option [value]="t.id" [selected]="t.id === filters().template">
                {{ t.title }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'inspections.filters.sort' | transloco }}
          <select class="cf-filter" (change)="setFilter('sort', $any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="s === filters().sort">
                {{ 'inspections.sort.' + sortKeys[s] | transloco }}
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
            titleKey="inspections.list.noMatchesTitle"
            bodyKey="inspections.list.noMatches"
            [compact]="true"
            data-testid="no-matches"
          />
          <div class="-mt-2 pb-4 text-center">
            <app-button variant="secondary" size="sm" (click)="clearFilters()">
              {{ 'inspections.list.clearFilters' | transloco }}
            </app-button>
          </div>
        </app-card>
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-busy]="loading()" data-testid="inspection-rows">
            <app-record-row-header dateKind="due" />
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.title"
                [subtitle]="subtitle(row)"
                [link]="['/inspections', row.id]"
                [owner]="row.inspector?.name ?? unassigned()"
                [date]="row.due_at"
                dateKind="due"
                [overdue]="row.is_overdue"
              >
                <app-coverage-chip coverage [entityType]="entityType" [entityId]="row.id" />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="row.status"
                  [labelKey]="statusKey(row.status)"
                />
                @if (row.result) {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    [value]="row.result"
                    [labelKey]="
                      row.score_pct === null
                        ? resultKey(row.result)
                        : 'inspections.list.resultScore'
                    "
                    [labelParams]="{
                      result: (resultKey(row.result) | transloco),
                      score: (row.score_pct | localPercent),
                    }"
                  />
                }
                @if (row.open_finding_count > 0) {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    value="open"
                    labelKey="inspections.list.openFindings"
                    [labelParams]="{ count: row.open_finding_count }"
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
            (pageChange)="offset.set($event)"
          />
        </div>
      }

      <div empty>
        <app-card>
          <app-teaching-empty
            scope="inspections"
            page="list"
            [showAction]="canWrite()"
            (action)="create()"
          />
          <p class="mt-3 text-center text-ui">
            <a
              routerLink="/settings/modules/inspections/templates/library"
              class="font-semibold text-accent hover:underline"
            >
              {{ 'inspections.list.browseTemplates' | transloco }}
            </a>
          </p>
        </app-card>
      </div>

      <app-why-it-matters below scope="inspections" page="list" />
    </app-record-list-page>
  `,
  styles: [
    FILTER_STYLES,
    `
      .cf-kpi {
        display: flex;
        flex-direction: column;
        border-radius: 14px;
        text-align: left;
        outline: none;
      }
      .cf-kpi > app-kpi-tile {
        display: block;
        flex: 1;
      }
      .cf-kpi ::ng-deep app-kpi-tile > div {
        height: 100%;
      }
      .cf-kpi:hover ::ng-deep app-kpi-tile > div {
        border-color: var(--accent-border);
      }
      .cf-kpi:focus-visible {
        box-shadow: 0 0 0 2px var(--accent);
      }
    `,
  ],
})
export class InspectionsList {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly references = inject(InspectionReferences);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly nav = INSPECTIONS_NAV;
  protected readonly settingsLink = INSPECTIONS_SETTINGS_LINK;
  protected readonly entityType = INSPECTION_ENTITY_TYPE;
  protected readonly statuses = INSPECTION_STATUSES;
  protected readonly results = INSPECTION_RESULTS;
  protected readonly sorts = INSPECTION_SORTS;
  protected readonly sortKeys = INSPECTION_SORT_KEYS;
  protected readonly statusKey = inspectionStatusKey;
  protected readonly resultKey = resultKey;

  protected readonly query = signal('');
  protected readonly filters = signal<InspectionListFilters>(
    parseInspectionFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Inspection[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly stats = signal<InspectionStats | null>(null);
  private readonly loaded = signal(false);

  protected readonly templates = this.references.activeTemplates;

  protected readonly canWrite = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('inspections:write') ?? false,
  );

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly moreActive = computed(() => {
    const f = this.filters();
    return (
      (f.inspector ? 1 : 0) +
      (f.overdue ? 1 : 0) +
      (f.template ? 1 : 0) +
      (f.sort !== DEFAULT_INSPECTION_FILTERS.sort ? 1 : 0)
    );
  });
  protected readonly orphanTemplate = computed(() => {
    const id = this.filters().template;
    return !!id && !this.templates().some((t) => t.id === id);
  });
  protected readonly unassigned = computed(() =>
    this.language.translate('inspections.list.unassigned'),
  );

  protected readonly passRate = computed(() => {
    const st = this.stats();
    const done = st ? st.passed + st.failed : 0;
    return st && done > 0 ? Math.round((1000 * st.passed) / done) / 10 : null;
  });

  protected readonly completedText = computed(() => {
    const st = this.stats();
    const done = st ? st.passed + st.failed : 0;
    return this.language.translate('inspections.stats.ofCompleted', { count: done });
  });

  protected readonly nextDueText = computed(() => {
    const next = this.stats()?.next_due_at;
    return next
      ? this.language.translate('inspections.stats.nextDue', {
          date: this.day(next),
        })
      : '';
  });

  protected readonly overdueFindingsText = computed(() => {
    const n = this.stats()?.overdue_findings ?? 0;
    return n > 0 ? this.language.translate('inspections.stats.overdueFindings', { count: n }) : '';
  });

  /** The org has no inspections at all (not just no matches): teach instead. */
  protected readonly isEmptyRegister = computed(() => {
    const st = this.stats();
    const all = st ? Object.values(st.by_status).reduce((a, b) => a + (b ?? 0), 0) : null;
    return (
      this.loaded() && !this.error() && this.total() === 0 && !this.query().trim() && all === 0
    );
  });

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: INSPECTION_ENTITY_TYPE,
      view: 'list',
      title: this.language.translate('modules.names.inspections'),
    }));
    this.references.ensureTemplates();

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

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId) {
        untracked(() =>
          this.api.stats(orgId).subscribe({
            next: (s) => this.stats.set(s),
            error: () => this.stats.set(null),
          }),
        );
      }
    });
  }

  protected t(key: string): string {
    return this.language.translate(key);
  }

  private day(value: string): string {
    return formatLocalDay(value, 'mediumDate', this.language.locale());
  }

  private load(orgId: string, q: string, filters: InspectionListFilters, offset: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.list(orgId, toInspectionQuery(q, filters, offset)).subscribe({
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

  /**
   * "Vernerunde · Lager · Inspektør: Emma · 3 av 8 besvart" — the checklist only when the
   * title does not already name it, and progress only while it is open.
   */
  protected subtitle(row: Inspection): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts: string[] = [];
    const template = distinctTemplateTitle(row.title, row.template?.title);
    if (template) {
      parts.push(template);
    }
    if (row.location && !row.title.toLowerCase().includes(row.location.toLowerCase())) {
      parts.push(row.location);
    }
    if (row.subject?.title) {
      parts.push(row.subject.title);
    }
    if (row.status === 'planned' || row.status === 'in_progress') {
      parts.push(
        t('inspections.list.answered', { answered: row.answered_count, total: row.question_count }),
      );
    } else if (row.status === 'completed' && row.completed_at) {
      parts.push(t('inspections.list.completedOn', { date: this.day(row.completed_at) }));
    }
    return parts.join(' · ');
  }

  protected onSearch(text: string): void {
    this.offset.set(0);
    this.query.set(text);
  }

  protected setFilter(key: keyof InspectionListFilters, value: string): void {
    this.offset.set(0);
    this.filters.set(parseInspectionFilters({ ...this.filters(), [key]: value }));
  }

  /** A KPI tile: show only the matching inspections. */
  protected showOnly(change: Partial<InspectionListFilters>): void {
    this.offset.set(0);
    this.filters.set({ ...DEFAULT_INSPECTION_FILTERS, ...change });
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.filters.set(DEFAULT_INSPECTION_FILTERS);
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(parseInspectionFilters(view.filters));
  }

  protected create(): void {
    void this.router.navigate(['/inspections/new']);
  }
}

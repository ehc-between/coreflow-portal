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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContextApi } from '../data/context-api';
import { ContextFrameworks } from '../data/context-frameworks';
import {
  ContextAnalysis,
  ContextKind,
  ContextRecord,
  InterestedParty,
  Policy,
  Responsibility,
  ScopeStatement,
} from '../data/context.models';
import { BadgeSpec, KINDS, addressedBadge, asKind, isPastDay, statusBadge } from '../context-kinds';
import { CONTEXT_NAV, CONTEXT_ROOT_CRUMB } from '../context-nav';
import { injectContextPermissions } from '../context-permissions';
import { ContextFilter } from '../ui/filter-select';
import {
  ListFilterDef,
  SORT_OPTIONS,
  cleanFilters,
  listFilters,
  moreFiltersActive,
  splitFilters,
  toListQuery,
} from './list-config';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;
const WIDE_QUERY = '(min-width: 640px)';

/** The badges a list row shows after the status (warnings, handling, coverage of acknowledgements). */
export function rowBadges(kind: ContextKind, row: ContextRecord): BadgeSpec[] {
  const badges: BadgeSpec[] = [];
  switch (kind) {
    case 'analysis': {
      const open = (row as ContextAnalysis).open_factors ?? 0;
      if (open > 0) {
        badges.push({
          meaning: 'lifecycle',
          value: 'blocked',
          labelKey:
            open === 1 ? 'context.list.badges.openFactorsOne' : 'context.list.badges.openFactors',
        });
      }
      break;
    }
    case 'party':
      badges.push(addressedBadge((row as InterestedParty).addressed_status));
      break;
    case 'policy': {
      const policy = row as Policy;
      const ack = policy.acknowledgements;
      if (policy.status === 'approved' && ack) {
        badges.push(
          ack.total > 0
            ? {
                meaning: 'progress',
                value: String(ack.percent),
                labelKey: 'context.list.badges.acknowledged',
              }
            : {
                meaning: 'lifecycle',
                value: 'blocked',
                labelKey: 'context.list.badges.notCommunicated',
              },
        );
      }
      break;
    }
    case 'responsibility':
      for (const warning of (row as Responsibility).warnings) {
        badges.push({
          meaning: 'lifecycle',
          value: 'blocked',
          labelKey: `context.raci.warnings.${warning}`,
        });
      }
      break;
    default:
      break;
  }
  return badges;
}

/**
 * A register list (`/context/<segment>`, the kind comes from route data) on the
 * shared list frame: search, two filters in the toolbar and the rest under
 * "Flere filtre" (all of them on phones), saved views, rows with requirement
 * coverage, pagination and a teaching empty state. Filters are mirrored in the
 * URL so drill-downs from the overview (and reloads) keep them.
 */
@Component({
  selector: 'app-context-list',
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
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    ContextFilter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      [titleKey]="'context.kinds.' + kind() + '.plural'"
      [descriptionKey]="'context.list.descriptions.' + kind()"
      [breadcrumbs]="breadcrumbs()"
      scope="context"
      [page]="cfg().segment"
      [searchPlaceholderKey]="'context.list.search.' + kind()"
      [query]="query()"
      [filters]="filters()"
      [moreFiltersActive]="moreActive()"
      [empty]="ready() && !error() && rows().length === 0 && !hasCriteria()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help />
      @if (perms.canWrite()) {
        <a primary [routerLink]="newLink()" tabindex="-1" [appTourStep]="'context-new-' + kind()">
          <app-button data-testid="context-new">
            <app-icon name="plus" [size]="15" />
            {{ 'context.kinds.' + kind() + '.new' | transloco }}
          </app-button>
        </a>
      }
      @if (kind() === 'responsibility') {
        <a secondary routerLink="/context/responsibilities/matrix" tabindex="-1">
          <app-button variant="secondary" data-testid="open-matrix">
            <app-icon name="grid" [size]="15" />
            {{ 'context.raci.matrixLink' | transloco }}
          </app-button>
        </a>
      }

      <app-module-nav nav [items]="nav" labelKey="modules.names.context" />
      <app-help-strip
        help
        scope="context"
        [page]="cfg().guidance + '-list'"
        [tour]="cfg().guidance"
        [lesson]="cfg().lesson"
      />

      @for (filter of split().visible; track filter.key) {
        <app-context-filter
          filters
          [style.display]="wide() ? null : 'none'"
          [labelKey]="filter.labelKey"
          [allKey]="filter.allKey"
          [options]="filter.options"
          [value]="filters()[filter.key] ?? ''"
          (valueChange)="setFilter(filter.key, $event)"
        />
      }
      <div more-filters class="flex flex-col gap-3">
        @for (filter of panelFilters(); track filter.key) {
          <app-context-filter
            [labelKey]="filter.labelKey"
            [allKey]="filter.allKey"
            [options]="filter.options"
            [value]="filters()[filter.key] ?? ''"
            [showLabel]="true"
            (valueChange)="setFilter(filter.key, $event)"
          />
        }
        <app-context-filter
          labelKey="context.filters.sort"
          allKey="context.sort.desc_updated_at"
          [options]="sortOptions"
          [value]="filters()['sort'] ?? ''"
          [showLabel]="true"
          (valueChange)="setFilter('sort', $event)"
        />
      </div>

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (!ready()) {
        <app-loading-state [rows]="5" />
      } @else if (rows().length === 0) {
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
          <app-record-row-header dateKind="next" />
          <div role="list" [attr.aria-label]="'context.kinds.' + kind() + '.plural' | transloco">
            @for (row of rows(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="titleOf(row)"
                [subtitle]="subtitleOf(row)"
                [link]="row.url"
                [owner]="row.owner?.name"
                [date]="row.next_review_at"
                dateKind="next"
                [overdue]="overdue(row)"
              >
                <span coverage class="block min-w-0 [&_span]:whitespace-normal">
                  <app-coverage-chip [entityType]="cfg().entityType" [entityId]="row.id" />
                </span>
                @let status = statusOf(row);
                <app-status-badge
                  badges
                  [meaning]="status.meaning"
                  [value]="status.value"
                  [labelKey]="status.labelKey"
                />
                @for (badge of badgesOf(row); track badge.labelKey) {
                  <app-status-badge
                    badges
                    [meaning]="badge.meaning"
                    [value]="badge.value"
                    [labelKey]="badge.labelKey"
                    [labelParams]="badgeParams(row)"
                  />
                }
              </app-record-row>
            }
          </div>
        </div>
        <div class="mt-3">
          <app-pager
            [offset]="offset()"
            [pageSize]="pageSize"
            [count]="rows().length"
            [total]="total()"
            (pageChange)="goTo($event)"
          />
        </div>
      }

      <div empty>
        <app-teaching-empty
          scope="context"
          [page]="cfg().guidance + '-list'"
          [showAction]="perms.canWrite()"
          (action)="createNew()"
        />
      </div>

      <app-why-it-matters below scope="context" [page]="cfg().guidance + '-list'" />
    </app-record-list-page>
  `,
})
export class ContextList {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly frameworks = inject(ContextFrameworks);

  /** Route data (component input binding). */
  readonly contextKind = input<unknown>(undefined);

  protected readonly kind = computed(() => asKind(this.contextKind()));
  protected readonly cfg = computed(() => KINDS[this.kind()]);
  protected readonly newLink = computed(() => `/context/${this.cfg().segment}/new`);
  protected readonly nav = CONTEXT_NAV;
  protected readonly breadcrumbs = computed(() => [
    CONTEXT_ROOT_CRUMB,
    { labelKey: `context.kinds.${this.kind()}.plural` },
  ]);

  protected readonly perms = injectContextPermissions();
  protected readonly sortOptions = SORT_OPTIONS.slice(1);
  protected readonly pageSize = PAGE_SIZE;

  protected readonly filterDefs = computed(() =>
    listFilters(this.kind(), this.frameworks.ordered()),
  );
  protected readonly split = computed(() => splitFilters(this.filterDefs()));
  /** Phones show every filter in the "Flere filtre" panel. */
  protected readonly wide = signal(matchesWide());
  protected readonly panelFilters = computed<ListFilterDef[]>(() =>
    this.wide() ? this.split().more : this.filterDefs(),
  );

  protected readonly query = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly filters = signal<Readonly<Record<string, string>>>({});
  protected readonly offset = signal(0);
  protected readonly rows = signal<readonly ContextRecord[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly ready = signal(false);
  protected readonly error = signal(false);
  protected readonly hasCriteria = computed(
    () => !!this.query().trim() || Object.keys(this.filters()).some((k) => k !== 'sort'),
  );
  protected readonly moreActive = computed(() =>
    moreFiltersActive(this.panelFilters(), this.filters()),
  );

  private request = new Subscription();

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.request.unsubscribe());
    this.frameworks.ensureLoaded();
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia(WIDE_QUERY);
      const listener = (event: MediaQueryListEvent) => this.wide.set(event.matches);
      media.addEventListener?.('change', listener);
      destroyRef.onDestroy(() => media.removeEventListener?.('change', listener));
    }
    providePageContext(() => ({
      module: 'context',
      entityType: this.cfg().entityType,
      view: 'list',
      title: this.language.translate(`context.kinds.${this.kind()}.plural`),
    }));
    // Restore filters from the URL once the kind is known.
    effect(() => {
      const kind = this.kind();
      untracked(() => {
        const params: Record<string, string> = {};
        for (const key of this.route.snapshot.queryParamMap.keys) {
          params[key] = this.route.snapshot.queryParamMap.get(key) ?? '';
        }
        this.filters.set(cleanFilters(kind, params));
      });
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const kind = this.kind();
      const q = this.query();
      const filters = this.filters();
      const offset = this.offset();
      untracked(() => this.load(orgId, kind, q, filters, offset));
    });
  }

  protected onSearch(text: string): void {
    this.query.set(text);
    this.offset.set(0);
    this.syncUrl();
  }

  protected setFilter(key: string, value: string): void {
    this.filters.update((current) => {
      const next = { ...current };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
    this.offset.set(0);
    this.syncUrl();
  }

  protected clearFilters(): void {
    const sort = this.filters()['sort'];
    this.filters.set(sort ? { sort } : {});
    this.query.set('');
    this.offset.set(0);
    this.syncUrl();
  }

  protected applyView(view: SavedView): void {
    this.filters.set(cleanFilters(this.kind(), view.filters));
    this.offset.set(0);
    this.syncUrl();
  }

  protected goTo(offset: number): void {
    this.offset.set(offset);
  }

  protected reload(): void {
    this.load(
      this.selectedOrg.currentOrgId(),
      this.kind(),
      this.query(),
      this.filters(),
      this.offset(),
    );
  }

  protected createNew(): void {
    void this.router.navigateByUrl(this.newLink());
  }

  // --- row helpers ------------------------------------------------------------------

  protected titleOf(row: ContextRecord): string {
    return 'name' in row ? row.name : row.title;
  }

  /** One plain line under the title: method, category, standard, policy type or process. */
  protected subtitleOf(row: ContextRecord): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    switch (this.kind()) {
      case 'analysis': {
        const r = row as ContextAnalysis;
        const parts = [t(`context.methods.${r.method}`)];
        if (r.framework) {
          parts.push(t(`context.frameworks.${r.framework}`));
        }
        parts.push(
          r.items.length === 1
            ? t('context.list.factorCountOne')
            : t('context.list.factorCount', { count: r.items.length }),
        );
        return parts.join(' · ');
      }
      case 'party': {
        const r = row as InterestedParty;
        return [
          t(`context.partyCategories.${r.category}`),
          t(`context.partyTypes.${r.party_type}`),
          t(`context.priorities.${r.priority}`),
        ].join(' · ');
      }
      case 'scope':
        return t(`context.frameworks.${(row as ScopeStatement).framework}`);
      case 'policy':
        return t(`context.policyKinds.${(row as Policy).kind}`);
      case 'responsibility': {
        const r = row as Responsibility;
        const area = r.process?.title || r.area;
        const count = t('context.raci.assignmentCount', { count: r.assignments.length });
        return area ? `${area} · ${count}` : count;
      }
    }
  }

  protected statusOf(row: ContextRecord): BadgeSpec {
    return statusBadge(row.status);
  }

  protected badgesOf(row: ContextRecord): BadgeSpec[] {
    return rowBadges(this.kind(), row);
  }

  protected badgeParams(row: ContextRecord): Record<string, unknown> {
    if (this.kind() === 'analysis') {
      return { count: (row as ContextAnalysis).open_factors ?? 0 };
    }
    const ack = (row as Policy).acknowledgements;
    return ack ? { acknowledged: ack.acknowledged, total: ack.total } : {};
  }

  protected overdue(row: ContextRecord): boolean {
    const flagged = (row as { review_overdue?: boolean }).review_overdue;
    return flagged ?? isPastDay(row.next_review_at);
  }

  private syncUrl(): void {
    const q = this.query().trim();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...this.filters(), ...(q ? { q } : {}) },
      replaceUrl: true,
    });
  }

  private load(
    orgId: string | null,
    kind: ContextKind,
    q: string,
    filters: Readonly<Record<string, string>>,
    offset: number,
  ): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.error.set(false);
    this.request = this.api
      .list(orgId, kind, toListQuery(kind, q, filters, offset, PAGE_SIZE))
      .subscribe({
        next: (page) => {
          this.rows.set(page.items);
          this.total.set(page.total);
          this.ready.set(true);
        },
        error: () => {
          this.error.set(true);
          this.ready.set(true);
        },
      });
  }
}

function matchesWide(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(WIDE_QUERY).matches
    : true;
}

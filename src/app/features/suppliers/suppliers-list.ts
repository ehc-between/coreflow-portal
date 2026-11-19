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
import { AskPanelService } from '../ask/ask-panel.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { locationName } from '../../shared/locale/countries';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  ATTENTION_BADGE,
  criticalityBadge,
  scoreParams,
  supplierStatusBadge,
} from './data/supplier-display';
import {
  ATTENTION_CODES,
  AttentionCode,
  CRITICALITIES,
  Criticality,
  EVALUATION_DUE_FILTERS,
  EvaluationDueFilter,
  SUPPLIER_CATEGORIES,
  SUPPLIER_FLAGS,
  SUPPLIER_SORTS,
  SUPPLIER_STATUSES,
  SupplierCategory,
  SupplierFlag,
  SupplierListItem,
  SupplierListQuery,
  SupplierSort,
  SupplierStatus,
  SupplierSummary,
} from './data/supplier.models';
import { SuppliersApi } from './data/suppliers-api';
import { suppliersNav } from './shared/suppliers-nav';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;

/** "Trenger oppfølging": '' = any supplier, 'any' = at least one flag, else one flag. */
export type AttentionFilter = AttentionCode | 'any' | '';

/** The list filters kept in a saved view and the URL (all strings; '' = any). */
export interface SupplierFilters {
  readonly status: SupplierStatus | '';
  readonly attention: AttentionFilter;
  readonly criticality: Criticality | '';
  readonly category: SupplierCategory | '';
  readonly due: EvaluationDueFilter | '';
  readonly flag: SupplierFlag | '';
  readonly owner: 'me' | '';
  readonly sort: SupplierSort;
}

export const DEFAULT_FILTERS: SupplierFilters = {
  status: '',
  attention: '',
  criticality: '',
  category: '',
  due: '',
  flag: '',
  owner: '',
  sort: 'name',
};

/** The filters under "Flere filtre" (search, status and follow-up stay visible; U30). */
const MORE_FILTERS: readonly (keyof SupplierFilters)[] = [
  'criticality',
  'category',
  'due',
  'flag',
  'owner',
];

/** Restore filters from a saved view or the URL, ignoring unknown values. */
export function filtersFromView(values: Readonly<Record<string, string>>): SupplierFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
  const sort = pick(values['sort'], SUPPLIER_SORTS);
  const attention: AttentionFilter =
    values['attention'] === 'any' || values['attention'] === '1' || values['attention'] === 'true'
      ? 'any'
      : pick(values['attention'] || values['attention_code'], ATTENTION_CODES);
  return {
    status: pick(values['status'], SUPPLIER_STATUSES),
    attention,
    criticality: pick(values['criticality'], CRITICALITIES),
    category: pick(values['category'], SUPPLIER_CATEGORIES),
    due: pick(values['due'], EVALUATION_DUE_FILTERS),
    flag: pick(values['flag'], SUPPLIER_FLAGS),
    owner: values['owner'] === 'me' ? 'me' : '',
    sort: sort || 'name',
  };
}

/** How many of the "Flere filtre" filters are set (shown on the button). */
export function moreFiltersCount(f: SupplierFilters): number {
  return MORE_FILTERS.filter((key) => !!f[key]).length;
}

/** The API query for a search text, filters and page offset. */
export function toQuery(q: string, f: SupplierFilters, offset: number): SupplierListQuery {
  return {
    q: q || undefined,
    status: f.status ? [f.status] : undefined,
    criticality: f.criticality ? [f.criticality] : undefined,
    category: f.category ? [f.category] : undefined,
    evaluation_due: f.due || undefined,
    owner: f.owner || undefined,
    ...(f.flag ? { [f.flag]: true } : {}),
    ...(f.attention === 'any' ? { attention: true } : {}),
    ...(f.attention && f.attention !== 'any' ? { attention_code: [f.attention] } : {}),
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/** A headline figure that is also a filter: clicking it shows those suppliers. */
interface Kpi {
  readonly key: string;
  readonly labelKey: string;
  readonly value: number;
  readonly tone: KpiTone;
  readonly delta: string;
  readonly filter: Partial<SupplierFilters>;
}

/**
 * The supplier register (`/suppliers`). Headline figures that double as filters
 * ("Trenger oppfølging", approved, approved with conditions, re-evaluation overdue /
 * due soon, personal data); search, status, follow-up and criticality filters with the
 * rest under "Flere filtre"; saved views; one row per supplier with its status,
 * criticality, follow-up flags, requirement coverage, owner and next re-evaluation.
 * `?attention=1`, `?attention_code=<code>`, `?status=…` (links from the home page and
 * the assistant) set the filters.
 */
@Component({
  selector: 'app-suppliers-list',
  imports: [
    FulfilsRequirements,
    TranslocoPipe,
    Button,
    Card,
    CoverageChip,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    ModuleNav,
    Pager,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      exportRegister="suppliers"
      titleKey="modules.names.suppliers"
      descriptionKey="suppliers.list.subtitle"
      scope="suppliers"
      settingsLink="/settings/modules/suppliers"
      searchPlaceholderKey="suppliers.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="suppliers.register" />
      @if (canWrite()) {
        <app-button primary appTourStep="suppliers-new" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'suppliers.list.new' | transloco }}
        </app-button>
      }
      <app-button secondary variant="ghost" (click)="askOverview()">
        <app-icon name="spark" [size]="14" />
        {{ 'suppliers.ai.overview' | transloco }}
      </app-button>

      <div nav appTourStep="suppliers-sections">
        <app-module-nav labelKey="modules.names.suppliers" [items]="nav()" />
      </div>
      <app-help-strip help scope="suppliers" page="list" tour="list" lesson="supplier-control" />

      <ng-container ngProjectAs="[kpis]">
        @for (k of kpis(); track k.key) {
          <button
            type="button"
            class="block h-full w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&_app-kpi-tile]:block [&_app-kpi-tile]:h-full [&_app-kpi-tile>div]:h-full"
            [class.max-sm:hidden]="k.key === 'conditional' || k.key === 'dueSoon'"
            [class.ring-2]="kpiActive(k)"
            [class.ring-accent]="kpiActive(k)"
            [attr.aria-pressed]="kpiActive(k)"
            [attr.data-testid]="'kpi-' + k.key"
            [appTourStep]="k.key === 'attention' ? 'suppliers-summary' : 'suppliers-kpi-' + k.key"
            (click)="applyKpi(k)"
          >
            <app-kpi-tile
              [label]="k.labelKey | transloco"
              [value]="k.value"
              [tone]="k.tone"
              [delta]="k.delta"
            />
          </button>
        }
      </ng-container>

      <ng-container filters>
        <label class="sr-only" for="sup-f-status">{{
          'suppliers.fields.status' | transloco
        }}</label>
        <select
          id="sup-f-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          appTourStep="suppliers-filters"
          (change)="setFilter('status', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().status">
            {{ 'suppliers.filters.anyStatus' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="filters().status === s">
              {{ 'suppliers.status.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="sup-f-attention">
          {{ 'suppliers.filters.attention' | transloco }}
        </label>
        <select
          id="sup-f-attention"
          class="h-10 max-w-[220px] rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setFilter('attention', $any($event.target).value)"
          data-testid="filter-attention"
        >
          <option value="" [selected]="!filters().attention">
            {{ 'suppliers.filters.anyAttention' | transloco }}
          </option>
          <option value="any" [selected]="filters().attention === 'any'">
            {{ 'suppliers.filters.needsAttention' | transloco }}
          </option>
          @for (c of attentionCodes; track c) {
            <option [value]="c" [selected]="filters().attention === c">
              {{ 'suppliers.attention.' + c | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'suppliers.fields.criticality' | transloco }}
          <select
            id="sup-f-crit"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setFilter('criticality', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().criticality">
              {{ 'suppliers.filters.anyCriticality' | transloco }}
            </option>
            @for (c of criticalities; track c) {
              <option [value]="c" [selected]="filters().criticality === c">
                {{ 'suppliers.criticality.' + c | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'suppliers.fields.category' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setFilter('category', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().category">
              {{ 'suppliers.filters.anyCategory' | transloco }}
            </option>
            @for (c of categories; track c) {
              <option [value]="c" [selected]="filters().category === c">
                {{ 'suppliers.category.' + c | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'suppliers.filters.evaluationDue' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setFilter('due', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().due">
              {{ 'suppliers.filters.anyDue' | transloco }}
            </option>
            @for (d of dueFilters; track d) {
              <option [value]="d" [selected]="filters().due === d">
                {{ 'suppliers.filters.due.' + d | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'suppliers.filters.flag' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setFilter('flag', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().flag">
              {{ 'suppliers.filters.anyFlag' | transloco }}
            </option>
            @for (f of flags; track f) {
              <option [value]="f" [selected]="filters().flag === f">
                {{ 'suppliers.flags.' + f | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'suppliers.fields.owner' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setFilter('owner', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().owner">
              {{ 'suppliers.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="filters().owner === 'me'">
              {{ 'suppliers.filters.ownedByMe' | transloco }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'suppliers.filters.sort' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'suppliers.filters.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (rows().length === 0) {
              <app-empty-state
                icon="search"
                titleKey="ui.empty.noResults"
                bodyKey="ui.empty.noResultsBody"
                ctaKey="ui.empty.clearFilters"
                ctaVariant="secondary"
                (cta)="clearFilters()"
              />
            } @else {
              <div role="list" data-testid="supplier-rows">
                <app-record-row-header dateKind="next" />
                @for (row of rows(); track row.id) {
                  <app-record-row
                    [code]="row.code"
                    [title]="row.name"
                    [subtitle]="subtitle(row)"
                    [link]="['/suppliers', row.id]"
                    [owner]="row.owner?.name"
                    [date]="row.next_evaluation_at"
                    dateKind="next"
                    [overdue]="row.evaluation_overdue"
                  >
                    @let st = statusBadge(row.status);
                    <app-status-badge
                      badges
                      [meaning]="st.meaning"
                      [value]="st.value"
                      [labelKey]="'suppliers.status.' + row.status"
                    />
                    @let cr = critBadge(row.criticality);
                    <app-status-badge
                      badges
                      [meaning]="cr.meaning"
                      [value]="cr.value"
                      [labelKey]="'suppliers.criticality.' + row.criticality"
                    />
                    @if (row.attention?.length) {
                      <span
                        badges
                        class="inline-flex"
                        [title]="attentionTitle(row)"
                        data-testid="row-attention"
                      >
                        <app-status-badge
                          [meaning]="attentionBadge.meaning"
                          [value]="attentionBadge.value"
                          [labelKey]="
                            row.attention!.length > 1
                              ? 'suppliers.list.attentionMore'
                              : 'suppliers.attention.' + row.attention![0]
                          "
                          [labelParams]="{
                            first: attentionLabel(row.attention![0]),
                            count: row.attention!.length - 1,
                          }"
                        />
                      </span>
                    }
                    <app-coverage-chip coverage entityType="supplier" [entityId]="row.id" />
                  </app-record-row>
                }
              </div>
              @if (total() > pageSize) {
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

      <app-why-it-matters below scope="suppliers" page="list" />

      <div empty class="flex flex-col gap-4">
        <app-teaching-empty
          scope="suppliers"
          page="list"
          [showAction]="canWrite()"
          (action)="create()"
        />
        <app-why-it-matters scope="suppliers" page="list" />
      </div>
    </app-record-list-page>
  `,
})
export class SuppliersList {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly statuses = SUPPLIER_STATUSES;
  protected readonly criticalities = CRITICALITIES;
  protected readonly categories = SUPPLIER_CATEGORIES;
  protected readonly dueFilters = EVALUATION_DUE_FILTERS;
  protected readonly flags = SUPPLIER_FLAGS;
  protected readonly sorts = SUPPLIER_SORTS;
  protected readonly attentionCodes = ATTENTION_CODES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusBadge = supplierStatusBadge;
  protected readonly critBadge = criticalityBadge;
  protected readonly attentionBadge = ATTENTION_BADGE;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('suppliers:write'));

  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly filters = signal<SupplierFilters>(
    filtersFromView(this.route.snapshot.queryParams as Record<string, string>),
  );
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly SupplierListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<SupplierSummary | null>(null);

  protected readonly nav = computed(() => suppliersNav(this.summary()?.open_evaluations));
  protected readonly moreActive = computed(() => moreFiltersCount(this.filters()));
  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  private readonly isFiltered = computed(() => {
    const f = this.filters();
    return !!this.q() || Object.entries(f).some(([k, v]) => k !== 'sort' && !!v);
  });
  /** The teaching empty state: only for an org with no suppliers at all. */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly kpis = computed<readonly Kpi[]>(() => {
    const s = this.summary();
    if (!s) {
      return [];
    }
    const attention = s.needs_attention ?? 0;
    const noDpa = s.attention_by_code?.dpa_missing ?? 0;
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return [
      {
        key: 'attention',
        labelKey: 'suppliers.summary.needsAttention',
        value: attention,
        tone: attention ? 'warn' : 'pass',
        delta: '',
        filter: { attention: 'any' },
      },
      {
        key: 'approved',
        labelKey: 'suppliers.summary.approved',
        value: s.approved ?? s.by_status['approved'] ?? 0,
        tone: 'pass',
        delta: '',
        filter: { status: 'approved' },
      },
      {
        key: 'conditional',
        labelKey: 'suppliers.summary.conditional',
        value: s.conditional ?? s.by_status['conditional'] ?? 0,
        tone: 'warn',
        delta: '',
        filter: { status: 'conditional' },
      },
      {
        key: 'overdue',
        labelKey: 'suppliers.summary.overdue',
        value: s.evaluations_overdue,
        tone: s.evaluations_overdue ? 'warn' : 'neutral',
        delta: '',
        filter: { due: 'overdue' },
      },
      {
        key: 'dueSoon',
        labelKey: 'suppliers.summary.dueSoon',
        value: s.evaluations_due_soon,
        tone: s.evaluations_due_soon ? 'info' : 'neutral',
        delta: '',
        filter: { due: 'due_soon' },
      },
      {
        key: 'personalData',
        labelKey: 'suppliers.summary.processors',
        value: s.processors,
        tone: noDpa ? 'fail' : 'neutral',
        delta: noDpa ? t('suppliers.summary.withoutDpa', { count: noDpa }) : '',
        filter: { flag: 'processes_personal_data' },
      },
    ];
  });

  private request = new Subscription();
  private summaryRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.summaryRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'suppliers',
      entityType: 'supplier',
      view: 'list',
      title: this.language.translate('modules.names.suppliers'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = toQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadSummary(orgId));
    });
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof SupplierFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => filtersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(filtersFromView(view.filters));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.filters.set({ ...DEFAULT_FILTERS, sort: this.filters().sort });
  }

  /** A tile's filter is active when every value it sets is the current one. */
  protected kpiActive(k: Kpi): boolean {
    const f = this.filters();
    return Object.entries(k.filter).every(
      ([key, value]) => f[key as keyof SupplierFilters] === value,
    );
  }

  /** Clicking a tile shows those suppliers (on top of the search); clicking it again clears it. */
  protected applyKpi(k: Kpi): void {
    this.offset.set(0);
    const active = this.kpiActive(k);
    const base: SupplierFilters = { ...DEFAULT_FILTERS, sort: this.filters().sort };
    this.filters.set(active ? base : { ...base, ...k.filter });
  }

  /** Category · country · what the supplier does for us · last score ("90,8 / 100"). */
  protected subtitle(row: SupplierListItem): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(`suppliers.category.${row.category}`)];
    if (row.country) {
      parts.push(locationName(row.country, this.language));
    }
    const score = scoreParams(row.last_score, null, this.language.locale());
    if (score) {
      parts.push(t('suppliers.list.lastScore', { score: score.score }));
    }
    for (const flag of SUPPLIER_FLAGS) {
      if (row[flag]) {
        parts.push(t(`suppliers.flagsShort.${flag}`));
      }
    }
    return parts.join(' · ');
  }

  protected attentionLabel(code: AttentionCode): string {
    return this.language.translate(`suppliers.attention.${code}`);
  }

  protected attentionTitle(row: SupplierListItem): string {
    return (row.attention ?? []).map((c) => this.attentionLabel(c)).join(', ');
  }

  protected create(): void {
    void this.router.navigate(['/suppliers/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('suppliers.ai.prompts.overview'));
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), toQuery(this.q(), this.filters(), this.offset()));
    this.loadSummary(this.selectedOrg.currentOrgId());
  }

  private load(orgId: string | null, query: SupplierListQuery): void {
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

  private loadSummary(orgId: string | null): void {
    this.summaryRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.summaryRequest = this.api.summary(orgId).subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.summary.set(null),
    });
  }
}

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
import { Observable, Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { AiAvailability } from '../../core/ai/ai-availability';
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
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  attentionBadge,
  calibrationBadge,
  classificationBadge,
  levelBadge,
  lifecycleBadge,
} from './data/asset-display';
import {
  ASSET_SORTS,
  ASSET_TYPES,
  ATTENTION_CODES,
  Asset,
  AssetListQuery,
  AssetSort,
  AssetType,
  AttentionCode,
  CLASSIFICATIONS,
  Classification,
  LIFECYCLE_STATUSES,
  LifecycleStatus,
} from './data/asset.models';
import { AssetsApi } from './data/assets-api';
import { assetsNav } from './shared/assets-nav';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';
import { CustomerFilter } from '../../shared/customers';

const PAGE_SIZE = 25;

export const ASSET_FLAGS = ['requires_calibration', 'contains_personal_data'] as const;
export type AssetFlag = (typeof ASSET_FLAGS)[number];

/** "Trenger oppfølging": '' = any asset, 'any' = at least one flag, else one flag. */
export type AssetAttentionFilter = AttentionCode | 'any' | '';

/** The list filters kept in a saved view and the URL (all strings; '' = any). */
export interface AssetFilters {
  readonly type: AssetType | '';
  readonly classification: Classification | '';
  readonly lifecycle: LifecycleStatus | '';
  readonly attention: AssetAttentionFilter;
  readonly flag: AssetFlag | '';
  readonly owner: 'me' | '';
  /** Equipment held by me (custodian). */
  readonly holder: 'me' | '';
  readonly review: 'overdue' | '';
  readonly supplier: string;
  /** Customer property of one customer (`?customer_id=`). */
  readonly customer: string;
  readonly sort: AssetSort;
}

export const DEFAULT_ASSET_FILTERS: AssetFilters = {
  type: '',
  classification: '',
  lifecycle: '',
  attention: '',
  flag: '',
  owner: '',
  holder: '',
  review: '',
  supplier: '',
  customer: '',
  sort: 'code',
};

/** The filters under "Flere filtre" (search, type and follow-up stay visible; U30). */
const MORE_FILTERS: readonly (keyof AssetFilters)[] = [
  'lifecycle',
  'classification',
  'flag',
  'owner',
  'holder',
  'review',
  'supplier',
  'customer',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Restore filters from a saved view or the URL, ignoring unknown values. */
export function assetFiltersFromView(values: Readonly<Record<string, string>>): AssetFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
  const rawAttention = values['attention'];
  const attention: AssetAttentionFilter =
    rawAttention === 'any' || rawAttention === '1' || rawAttention === 'true'
      ? 'any'
      : pick(rawAttention, ATTENTION_CODES);
  const review =
    values['review'] === 'overdue' || values['review_overdue'] === 'true' ? 'overdue' : '';
  const supplier = values['supplier'] || values['supplier_id'] || '';
  const customer = values['customer'] || values['customer_id'] || '';
  return {
    type: pick(values['type'], ASSET_TYPES),
    classification: pick(values['classification'], CLASSIFICATIONS),
    lifecycle: pick(values['lifecycle'], LIFECYCLE_STATUSES),
    attention,
    flag: pick(values['flag'], ASSET_FLAGS),
    owner: values['owner'] === 'me' ? 'me' : '',
    holder: values['holder'] === 'me' || values['custodian'] === 'me' ? 'me' : '',
    review,
    supplier: UUID.test(supplier) ? supplier : '',
    customer: UUID.test(customer) ? customer : '',
    sort: pick(values['sort'], ASSET_SORTS) || 'code',
  };
}

/** How many of the "Flere filtre" filters are set (shown on the button). */
export function moreAssetFiltersCount(f: AssetFilters): number {
  return MORE_FILTERS.filter((key) => !!f[key]).length;
}

/** The API query for a search text, filters and page offset. */
export function assetQuery(q: string, f: AssetFilters, offset: number): AssetListQuery {
  return {
    q: q || undefined,
    type: f.type ? [f.type] : undefined,
    classification: f.classification ? [f.classification] : undefined,
    lifecycle: f.lifecycle ? [f.lifecycle] : undefined,
    owner: f.owner || undefined,
    custodian: f.holder || undefined,
    supplier_id: f.supplier || undefined,
    customer_id: f.customer || undefined,
    review_overdue: f.review === 'overdue' ? true : undefined,
    attention: f.attention === 'any' ? 'any' : f.attention ? [f.attention] : undefined,
    ...(f.flag ? { [f.flag]: true } : {}),
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/** A headline figure that is also a filter: clicking it shows those assets. */
interface Kpi {
  readonly key: string;
  readonly labelKey: string;
  readonly value: number;
  readonly tone: KpiTone;
  readonly filter: Partial<AssetFilters>;
}

interface Summary {
  readonly total: number;
  readonly attention: number;
  readonly calibrationOverdue: number;
  readonly reviewOverdue: number;
  readonly personalDataUnlinked: number;
  readonly heldByLeaver: number;
}

/**
 * The asset register (`/assets`). Headline figures that double as filters (needs
 * follow-up, calibration overdue in use, register review overdue, personal data
 * without a processing activity, held by someone who has left); search, type,
 * follow-up filters with the rest (lifecycle …) under "Flere filtre"; saved views;
 * one row per asset with lifecycle, criticality, classification, calibration and
 * follow-up badges, requirement coverage, owner and the next calibration or review.
 * `?attention=<code|any>`, `?review_overdue=true` and `?supplier_id=` (links from the
 * home page, the supplier page and the assistant) set the filters.
 */
@Component({
  selector: 'app-assets-list',
  imports: [
    CustomerFilter,
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
    MenuItem,
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
      exportRegister="assets"
      titleKey="modules.names.assets"
      descriptionKey="assets.list.subtitle"
      scope="assets"
      searchPlaceholderKey="assets.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="assets.register" />
      @if (canWrite()) {
        <app-button primary appTourStep="assets-new" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'assets.list.new' | transloco }}
        </app-button>
      }
      @if (!ai.unavailable()) {
        <button appMenuItem overflow type="button" (click)="askOverview()">
          {{ 'assets.ai.overview' | transloco }}
        </button>
      }

      <div nav appTourStep="assets-sections">
        <app-module-nav labelKey="modules.names.assets" [items]="nav()" />
      </div>
      <app-help-strip help scope="assets" page="list" tour="list" lesson="asset-inventory" />

      <ng-container ngProjectAs="[kpis]">
        @for (k of kpis(); track k.key) {
          <button
            type="button"
            class="block h-full w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&_app-kpi-tile]:block [&_app-kpi-tile]:h-full [&_app-kpi-tile>div]:h-full"
            [class.max-sm:hidden]="k.key === 'heldByLeaver' || k.key === 'personalData'"
            [class.ring-2]="kpiActive(k)"
            [class.ring-accent]="kpiActive(k)"
            [attr.aria-pressed]="kpiActive(k)"
            [attr.data-testid]="'kpi-' + k.key"
            [appTourStep]="k.key === 'attention' ? 'assets-summary' : 'assets-kpi-' + k.key"
            (click)="applyKpi(k)"
          >
            <app-kpi-tile [label]="k.labelKey | transloco" [value]="k.value" [tone]="k.tone" />
          </button>
        }
      </ng-container>

      <ng-container filters>
        <label class="sr-only" for="ast-f-type">{{ 'assets.fields.assetType' | transloco }}</label>
        <select
          id="ast-f-type"
          [class]="selectClass"
          appTourStep="assets-filters"
          (change)="setFilter('type', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().type">
            {{ 'assets.filters.anyType' | transloco }}
          </option>
          @for (t of types; track t) {
            <option [value]="t" [selected]="filters().type === t">
              {{ 'assets.assetType.' + t | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ast-f-attention">
          {{ 'assets.filters.attention' | transloco }}
        </label>
        <select
          id="ast-f-attention"
          [class]="selectClass + ' max-w-[240px]'"
          data-testid="filter-attention"
          (change)="setFilter('attention', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().attention">
            {{ 'assets.filters.anyAttention' | transloco }}
          </option>
          <option value="any" [selected]="filters().attention === 'any'">
            {{ 'assets.filters.needsAttention' | transloco }}
          </option>
          @for (c of attentionCodes; track c) {
            <option [value]="c" [selected]="filters().attention === c">
              {{ 'assets.attention.' + c | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        <div [class]="moreLabelClass">
          {{ 'assets.fields.customer' | transloco }}
          <app-customer-filter
            [value]="filters().customer || null"
            (valueChange)="setFilter('customer', $event ?? '')"
            data-testid="asset-customer-filter"
          />
        </div>
        <label [class]="moreLabelClass">
          {{ 'assets.fields.lifecycle' | transloco }}
          <select
            id="ast-f-life"
            [class]="moreSelectClass"
            (change)="setFilter('lifecycle', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().lifecycle">
              {{ 'assets.filters.anyLifecycle' | transloco }}
            </option>
            @for (l of lifecycles; track l) {
              <option [value]="l" [selected]="filters().lifecycle === l">
                {{ 'assets.lifecycle.' + l | transloco }}
              </option>
            }
          </select>
        </label>
        <label [class]="moreLabelClass">
          {{ 'assets.fields.classification' | transloco }}
          <select
            [class]="moreSelectClass"
            (change)="setFilter('classification', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().classification">
              {{ 'assets.filters.anyClassification' | transloco }}
            </option>
            @for (c of classifications; track c) {
              <option [value]="c" [selected]="filters().classification === c">
                {{ 'assets.classification.' + c | transloco }}
              </option>
            }
          </select>
        </label>
        <label [class]="moreLabelClass">
          {{ 'assets.filters.flag' | transloco }}
          <select [class]="moreSelectClass" (change)="setFilter('flag', $any($event.target).value)">
            <option value="" [selected]="!filters().flag">
              {{ 'assets.filters.anyFlag' | transloco }}
            </option>
            @for (f of flags; track f) {
              <option [value]="f" [selected]="filters().flag === f">
                {{ 'assets.filters.flags.' + f | transloco }}
              </option>
            }
          </select>
        </label>
        <label [class]="moreLabelClass">
          {{ 'assets.filters.responsibility' | transloco }}
          <select [class]="moreSelectClass" (change)="setResponsibility($any($event.target).value)">
            <option value="" [selected]="!filters().owner && !filters().holder">
              {{ 'assets.filters.anyOwner' | transloco }}
            </option>
            <option value="owner" [selected]="filters().owner === 'me'">
              {{ 'assets.filters.ownedByMe' | transloco }}
            </option>
            <option value="holder" [selected]="filters().holder === 'me'">
              {{ 'assets.filters.heldByMe' | transloco }}
            </option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="filters().review === 'overdue'"
            (change)="setFilter('review', $any($event.target).checked ? 'overdue' : '')"
          />
          {{ 'assets.filters.reviewOverdue' | transloco }}
        </label>
        @if (filters().supplier) {
          <p class="flex items-center justify-between gap-2 text-meta text-fg-muted">
            {{ 'assets.filters.supplierSet' | transloco }}
            <app-button variant="ghost" size="sm" (click)="setFilter('supplier', '')">
              {{ 'assets.filters.clear' | transloco }}
            </app-button>
          </p>
        }
        <label [class]="moreLabelClass">
          {{ 'assets.filters.sort' | transloco }}
          <select [class]="moreSelectClass" (change)="setFilter('sort', $any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'assets.filters.sorts.' + s | transloco }}
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
              <div role="list" data-testid="asset-rows">
                <app-record-row-header dateKind="next" />
                @for (row of rows(); track row.id) {
                  <app-record-row
                    [code]="row.code"
                    [title]="row.name"
                    [subtitle]="subtitle(row)"
                    [link]="['/assets', row.id]"
                    [owner]="row.owner?.name"
                    [date]="nextDate(row)"
                    dateKind="next"
                    [overdue]="isOverdue(row)"
                  >
                    <app-status-badge
                      badges
                      [meaning]="lifeBadge(row.lifecycle_status).meaning"
                      [value]="lifeBadge(row.lifecycle_status).value"
                      [labelKey]="'assets.lifecycle.' + row.lifecycle_status"
                    />
                    @if (row.criticality) {
                      <app-status-badge
                        badges
                        [meaning]="critBadge(row.criticality).meaning"
                        [value]="critBadge(row.criticality).value"
                        labelKey="assets.criticalityLabel"
                        [labelParams]="{
                          level: ('assets.criticality.' + row.criticality | transloco),
                        }"
                      />
                    }
                    @if (row.requires_calibration && row.calibration_status) {
                      <app-status-badge
                        badges
                        [meaning]="calBadge(row.calibration_status).meaning"
                        [value]="calBadge(row.calibration_status).value"
                        labelKey="assets.calibrationLabel"
                        [labelParams]="{
                          status:
                            ('assets.calibrationStatus.' + row.calibration_status | transloco),
                        }"
                      />
                    }
                    @if (row.attention?.length) {
                      <span
                        badges
                        class="inline-flex"
                        [title]="attentionTitle(row)"
                        data-testid="row-attention"
                      >
                        <app-status-badge
                          [meaning]="attnBadge(row.attention[0]).meaning"
                          [value]="attnBadge(row.attention[0]).value"
                          [labelKey]="
                            row.attention.length > 1
                              ? 'assets.list.attentionMore'
                              : 'assets.attention.' + row.attention[0]
                          "
                          [labelParams]="{
                            first: attentionLabel(row.attention[0]),
                            count: row.attention.length - 1,
                          }"
                        />
                      </span>
                    }
                    <app-coverage-chip coverage entityType="asset" [entityId]="row.id" />
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

      <app-why-it-matters below scope="assets" page="list" />

      <div empty class="flex flex-col gap-4">
        <app-teaching-empty
          scope="assets"
          page="list"
          [showAction]="canWrite()"
          (action)="create()"
        />
        <app-why-it-matters scope="assets" page="list" />
      </div>
    </app-record-list-page>
  `,
})
export class AssetsList {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly ai = inject(AiAvailability);

  protected readonly selectClass =
    'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg';
  protected readonly moreLabelClass = 'flex flex-col gap-1 text-meta font-semibold text-fg-muted';
  protected readonly moreSelectClass =
    'h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg';
  protected readonly types = ASSET_TYPES;
  protected readonly classifications = CLASSIFICATIONS;
  protected readonly lifecycles = LIFECYCLE_STATUSES;
  protected readonly attentionCodes = ATTENTION_CODES;
  protected readonly flags = ASSET_FLAGS;
  protected readonly sorts = ASSET_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly lifeBadge = lifecycleBadge;
  protected readonly critBadge = levelBadge;
  protected readonly classBadge = classificationBadge;
  protected readonly calBadge = calibrationBadge;
  protected readonly attnBadge = attentionBadge;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('assets:write'));

  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly filters = signal<AssetFilters>(
    assetFiltersFromView(this.route.snapshot.queryParams as Record<string, string>),
  );
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Asset[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<Summary | null>(null);

  protected readonly nav = computed(() =>
    assetsNav({ calibrationDue: this.summary()?.calibrationOverdue }),
  );
  protected readonly moreActive = computed(() => moreAssetFiltersCount(this.filters()));
  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  private readonly isFiltered = computed(() => {
    const f = this.filters();
    return !!this.q() || Object.entries(f).some(([k, v]) => k !== 'sort' && !!v);
  });
  /** The teaching empty state: only for an org with no assets at all. */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly kpis = computed<readonly Kpi[]>(() => {
    const s = this.summary();
    if (!s || s.total === 0) {
      return [];
    }
    return [
      {
        key: 'total',
        labelKey: 'assets.summary.total',
        value: s.total,
        tone: 'neutral',
        filter: {},
      },
      {
        key: 'attention',
        labelKey: 'assets.summary.needsAttention',
        value: s.attention,
        tone: s.attention ? 'warn' : 'pass',
        filter: { attention: 'any' },
      },
      {
        key: 'calibration',
        labelKey: 'assets.summary.calibrationOverdue',
        value: s.calibrationOverdue,
        tone: s.calibrationOverdue ? 'fail' : 'neutral',
        filter: { attention: 'calibration_overdue_in_use' },
      },
      {
        key: 'review',
        labelKey: 'assets.summary.reviewOverdue',
        value: s.reviewOverdue,
        tone: s.reviewOverdue ? 'warn' : 'neutral',
        filter: { review: 'overdue' },
      },
      {
        key: 'personalData',
        labelKey: 'assets.summary.personalDataUnlinked',
        value: s.personalDataUnlinked,
        tone: s.personalDataUnlinked ? 'warn' : 'neutral',
        filter: { attention: 'personal_data_unlinked' },
      },
      {
        key: 'heldByLeaver',
        labelKey: 'assets.summary.heldByLeaver',
        value: s.heldByLeaver,
        tone: s.heldByLeaver ? 'warn' : 'neutral',
        filter: { attention: 'held_by_leaver' },
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
      module: 'assets',
      entityType: 'asset',
      view: 'list',
      title: this.language.translate('modules.names.assets'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = assetQuery(this.q(), this.filters(), this.offset());
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

  protected setFilter<K extends keyof AssetFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => assetFiltersFromView({ ...f, [key]: value }));
  }

  /** "Ansvar": owned by me or held by me (one select, two filters). */
  protected setResponsibility(value: string): void {
    this.offset.set(0);
    this.filters.update((f) =>
      assetFiltersFromView({
        ...f,
        owner: value === 'owner' ? 'me' : '',
        holder: value === 'holder' ? 'me' : '',
      }),
    );
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(assetFiltersFromView(view.filters));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.filters.set({ ...DEFAULT_ASSET_FILTERS, sort: this.filters().sort });
  }

  /** A tile's filter is active when every value it sets is the current one. */
  protected kpiActive(k: Kpi): boolean {
    const entries = Object.entries(k.filter);
    if (entries.length === 0) {
      return false;
    }
    const f = this.filters();
    return entries.every(([key, value]) => f[key as keyof AssetFilters] === value);
  }

  /** Clicking a tile shows those assets; clicking it again (or "Eiendeler") clears it. */
  protected applyKpi(k: Kpi): void {
    this.offset.set(0);
    const active = this.kpiActive(k);
    const base: AssetFilters = { ...DEFAULT_ASSET_FILTERS, sort: this.filters().sort };
    this.filters.set(active ? base : { ...base, ...k.filter });
  }

  /** Type · location · supplier · personal data. */
  protected subtitle(row: Asset): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(`assets.assetType.${row.asset_type}`)];
    if (row.location) {
      parts.push(row.location);
    }
    const supplier = row.supplier?.name ?? row.vendor;
    if (supplier) {
      parts.push(supplier);
    }
    if (row.contains_personal_data) {
      parts.push(t('assets.list.personalData'));
    }
    if (row.classification !== 'internal') {
      parts.push(t(`assets.classification.${row.classification}`));
    }
    return parts.join(' · ');
  }

  /** Measuring equipment shows its next calibration; everything else its next review. */
  protected nextDate(row: Asset): string | null {
    return row.requires_calibration && row.next_calibration_due
      ? row.next_calibration_due
      : row.review_date;
  }

  protected isOverdue(row: Asset): boolean {
    return row.requires_calibration && row.next_calibration_due
      ? row.calibration_status === 'overdue'
      : row.review_status === 'overdue';
  }

  protected attentionLabel(code: AttentionCode): string {
    return this.language.translate(`assets.attention.${code}`);
  }

  protected attentionTitle(row: Asset): string {
    return (row.attention ?? []).map((c) => this.attentionLabel(c)).join(', ');
  }

  protected create(): void {
    void this.router.navigate(['/assets/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.overview'));
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.load(orgId, assetQuery(this.q(), this.filters(), this.offset()));
    this.loadSummary(orgId);
  }

  private load(orgId: string | null, query: AssetListQuery): void {
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

  /** Headline figures: one cheap count per filter (limit 1), failing quietly to 0. */
  private loadSummary(orgId: string | null): void {
    this.summaryRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    const count = (query: AssetListQuery): Observable<number> =>
      this.api.list(orgId, { ...query, limit: 1 }).pipe(
        map((page) => page.total),
        catchError(() => of(0)),
      );
    this.summaryRequest = forkJoin({
      total: count({}),
      attention: count({ attention: 'any' }),
      calibrationOverdue: count({ attention: ['calibration_overdue_in_use'] }),
      reviewOverdue: count({ review_overdue: true }),
      personalDataUnlinked: count({ attention: ['personal_data_unlinked'] }),
      heldByLeaver: count({ attention: ['held_by_leaver'] }),
    }).subscribe((summary) => this.summary.set(summary));
  }
}

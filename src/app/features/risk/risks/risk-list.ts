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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RiskApi } from '../data/risk-api';
import {
  appetiteState,
  bandLabel,
  currentBasis,
  currentRating,
  riskStatusValue,
  saveBlob,
} from '../data/risk-display';
import {
  MatrixBand,
  OPEN_RISK_STATUSES,
  RISK_SORTS,
  RISK_STATUSES,
  Register,
  Risk,
  RiskListQuery,
  RiskSort,
  RiskStatus,
} from '../data/risk.models';
import { RatingBadge } from '../shared/rating-badge';
import { RiskNav } from '../shared/risk-nav';
import { RiskPermissions } from '../shared/risk-permissions';

const PAGE_SIZE = 50;

/** Status filter values: a single status, every open one, or everything. */
export const RISK_STATUS_FILTERS = ['open', 'all', ...RISK_STATUSES] as const;
export type RiskStatusFilter = (typeof RISK_STATUS_FILTERS)[number];

export interface RiskFilters {
  readonly status: RiskStatusFilter;
  readonly register: string;
  readonly level: string;
  readonly owner: '' | 'me';
  readonly review: '' | 'due';
  readonly appetite: '' | 'above';
  readonly sort: RiskSort;
}

const DEFAULT_FILTERS: RiskFilters = {
  status: 'open',
  register: '',
  level: '',
  owner: '',
  review: '',
  appetite: '',
  sort: '-score',
};

/** Filters from URL query params / a saved view, falling back to the defaults. */
export function parseRiskFilters(raw: Readonly<Record<string, string | undefined>>): RiskFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T) =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  return {
    status: pick(raw['status'], RISK_STATUS_FILTERS, DEFAULT_FILTERS.status),
    register: raw['register'] ?? '',
    level: raw['level'] ?? '',
    owner: raw['owner'] === 'me' ? 'me' : '',
    review: raw['review'] === 'due' ? 'due' : '',
    appetite: raw['appetite'] === 'above' ? 'above' : '',
    sort: pick(raw['sort'], RISK_SORTS, DEFAULT_FILTERS.sort),
  };
}

/**
 * The API query for a filter set. "Open" uses the same statuses as the overview
 * KPI (accepted risks included), so the two numbers always agree.
 */
export function riskQuery(filters: RiskFilters, q: string, offset: number): RiskListQuery {
  const status: readonly RiskStatus[] =
    filters.status === 'open'
      ? OPEN_RISK_STATUSES
      : filters.status === 'all'
        ? []
        : [filters.status];
  return {
    q: q || undefined,
    status,
    register_id: filters.register || undefined,
    level: filters.level ? [filters.level] : undefined,
    owner: filters.owner || undefined,
    review_due: filters.review === 'due' ? true : undefined,
    above_appetite: filters.appetite === 'above' ? true : undefined,
    include_closed: filters.status === 'all' || filters.status === 'closed',
    sort: filters.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/** How many of the "Flere filtre" options are set. */
export function moreFiltersCount(filters: RiskFilters): number {
  return (
    (filters.sort !== DEFAULT_FILTERS.sort ? 1 : 0) +
    (filters.owner ? 1 : 0) +
    (filters.review ? 1 : 0) +
    (filters.appetite ? 1 : 0)
  );
}

/**
 * Risks across every register the caller can read: filtered by status, register
 * and level (plus owner, review due and appetite under "Flere filtre"),
 * searchable, sortable, with saved views and a CSV export that keeps the filters.
 * Each row shows the current rating (residual when set, otherwise inherent) and
 * whether the risk is above the appetite or accepted above it.
 */
@Component({
  selector: 'app-risk-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    RatingBadge,
    RiskNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="risk.risks.title"
      descriptionKey="risk.risks.subtitle"
      scope="risk"
      page="risks"
      settingsLink="/risk/matrices"
      [breadcrumbs]="[
        { labelKey: 'modules.names.risk', link: '/risk' },
        { labelKey: 'risk.risks.title' },
      ]"
      searchPlaceholderKey="risk.risks.searchPlaceholder"
      [query]="q()"
      [filters]="filterRecord()"
      [moreFiltersActive]="moreActive()"
      [empty]="state() === 'ready' && rows().length === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (perms.canWrite()) {
        <app-button primary [appTourStep]="'risk-new'" (click)="newRisk()">
          <app-icon name="plus" [size]="14" />
          {{ 'risk.risks.new' | transloco }}
        </app-button>
      }
      <app-button
        secondary
        variant="secondary"
        [loading]="exporting()"
        (click)="exportCsv()"
        data-testid="risk-export"
      >
        <app-icon name="upload" [size]="14" />
        {{ 'risk.risks.export' | transloco }}
      </app-button>

      <app-risk-nav nav />
      <app-help-strip help scope="risk" page="risks" tour="risks" lesson="first-risk-assessment" />

      <ng-container filters>
        <label class="sr-only" for="risk-f-status">{{ 'risk.filters.status' | transloco }}</label>
        <select
          id="risk-f-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          [appTourStep]="'risk-filters'"
          (change)="patch({ status: $any($event.target).value })"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="s === filters().status">
              {{ 'risk.filters.statusOptions.' + s | transloco }}
            </option>
          }
        </select>
        @if (registers().length > 1) {
          <label class="sr-only" for="risk-f-register">{{
            'risk.fields.register' | transloco
          }}</label>
          <select
            id="risk-f-register"
            class="h-10 max-w-[200px] rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="patch({ register: $any($event.target).value })"
          >
            <option value="" [selected]="!filters().register">
              {{ 'risk.filters.allRegisters' | transloco }}
            </option>
            @for (r of registers(); track r.id) {
              <option [value]="r.id" [selected]="r.id === filters().register">{{ r.name }}</option>
            }
          </select>
        }
        <label class="sr-only" for="risk-f-level">{{ 'risk.filters.level' | transloco }}</label>
        <select
          id="risk-f-level"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="patch({ level: $any($event.target).value })"
        >
          <option value="" [selected]="!filters().level">
            {{ 'risk.filters.allLevels' | transloco }}
          </option>
          @for (b of levelOptions(); track b.key) {
            <option [value]="b.key" [selected]="b.key === filters().level">{{ b.text }}</option>
          }
        </select>
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-meta font-semibold text-fg-muted" for="risk-f-sort">{{
            'risk.filters.sort' | transloco
          }}</label>
          <select
            id="risk-f-sort"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="patch({ sort: $any($event.target).value })"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="s === filters().sort">
                {{ 'risk.filters.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="filters().owner === 'me'"
            (change)="patch({ owner: $any($event.target).checked ? 'me' : '' })"
          />
          {{ 'risk.filters.mine' | transloco }}
        </label>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="filters().review === 'due'"
            (change)="patch({ review: $any($event.target).checked ? 'due' : '' })"
          />
          {{ 'risk.filters.reviewDue' | transloco }}
        </label>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="filters().appetite === 'above'"
            (change)="patch({ appetite: $any($event.target).checked ? 'above' : '' })"
          />
          {{ 'risk.filters.aboveAppetite' | transloco }}
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
                ctaKey="risk.filters.clear"
                ctaVariant="secondary"
                [compact]="true"
                (cta)="clearFilters()"
              />
            } @else {
              <div role="list" [attr.aria-label]="'risk.risks.title' | transloco">
                <app-record-row-header dateKind="next" />
                @for (r of rows(); track r.id) {
                  @let rating = current(r);
                  <app-record-row
                    [code]="r.code"
                    [title]="r.title"
                    [subtitle]="subtitle(r)"
                    [link]="['/risk/risks', r.id]"
                    [owner]="r.owner?.name ?? ('risk.common.unassigned' | transloco)"
                    [date]="r.next_review_at"
                    dateKind="next"
                    [overdue]="r.review_overdue"
                  >
                    <app-coverage-chip
                      coverage
                      class="max-w-full [&_[data-testid=coverage-chip]]:flex-wrap [&_[data-testid=coverage-chip]]:whitespace-normal"
                      entityType="risk"
                      [entityId]="r.id"
                    />
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="statusValue(r.status)"
                      [labelKey]="'risk.status.' + r.status"
                    />
                    <app-rating-badge
                      badges
                      [score]="rating?.score"
                      [level]="rating?.level"
                      [label]="rating?.label"
                      [color]="rating?.color"
                      [hintKey]="basisHint(r)"
                    />
                    @switch (appetite(r)) {
                      @case ('above') {
                        <app-badge badges tone="fail">{{
                          'risk.rating.aboveAppetite' | transloco
                        }}</app-badge>
                      }
                      @case ('accepted') {
                        <app-badge badges tone="neutral">{{
                          'risk.rating.acceptedAboveAppetite' | transloco
                        }}</app-badge>
                      }
                    }
                  </app-record-row>
                }
              </div>
              <div class="px-4 py-2">
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

      <app-card empty>
        <app-teaching-empty
          scope="risk"
          page="risks"
          [showAction]="perms.canWrite()"
          (action)="newRisk()"
        />
      </app-card>

      <app-why-it-matters below scope="risk" page="risks" />
    </app-record-list-page>
  `,
})
export class RiskListPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly toasts = inject(NotificationService);
  protected readonly perms = inject(RiskPermissions);

  protected readonly statusFilters = RISK_STATUS_FILTERS;
  protected readonly sorts = RISK_SORTS;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly rows = signal<readonly Risk[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly registers = signal<readonly Register[]>([]);
  private readonly bands = signal<readonly MatrixBand[]>([]);
  protected readonly offset = signal(0);
  protected readonly exporting = signal(false);
  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly filters = signal<RiskFilters>(
    parseRiskFilters(this.route.snapshot.queryParams as Record<string, string>),
  );
  private sub: Subscription | null = null;

  protected readonly filterRecord = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly moreActive = computed(() => moreFiltersCount(this.filters()));

  protected readonly isFiltered = computed(() => {
    const f = this.filters();
    return (
      !!this.q() ||
      f.status !== 'open' ||
      !!f.register ||
      !!f.level ||
      !!f.owner ||
      !!f.review ||
      !!f.appetite
    );
  });

  /** Distinct band keys across the org's matrices, for the level filter. */
  protected readonly levelOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const band of this.bands()) {
      if (!seen.has(band.key)) {
        seen.set(
          band.key,
          bandLabel(band, (k, p) => this.language.translate(k, p)),
        );
      }
    }
    return [...seen.entries()].map(([key, text]) => ({ key, text }));
  });

  protected readonly current = currentRating;
  protected readonly appetite = appetiteState;
  protected readonly statusValue = riskStatusValue;

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk',
      view: 'list',
      title: this.language.translate('risk.risks.title'),
      selection: {
        ids: this.rows()
          .slice(0, 50)
          .map((r) => r.id),
      },
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      if (!orgId) {
        return;
      }
      untracked(() => this.loadLookups(orgId));
    });
    effect(() => {
      const orgId = this.perms.orgId();
      const filters = this.filters();
      const q = this.q();
      const offset = this.offset();
      untracked(() => this.load(orgId, filters, q, offset));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private loadLookups(orgId: string): void {
    this.api.listRegisters(orgId).subscribe({
      next: (res) => this.registers.set(res.items),
      error: () => this.registers.set([]),
    });
    this.api.listMatrices(orgId).subscribe({
      next: (res) => this.bands.set(res.items.flatMap((m) => m.bands)),
      error: () => this.bands.set([]),
    });
  }

  private load(orgId: string | null, filters: RiskFilters, q: string, offset: number): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = this.api.listRisks(orgId, riskQuery(filters, q, offset)).subscribe({
      next: (res) => {
        this.rows.set(res.items);
        this.total.set(res.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected reload(): void {
    this.load(this.perms.orgId(), this.filters(), this.q(), this.offset());
  }

  /** Register name, plus the open treatments. */
  protected subtitle(r: Risk): string {
    const parts = [r.register.name];
    if (r.treatments.open > 0) {
      parts.push(
        this.language.translate('risk.risks.openTreatments', { count: r.treatments.open }),
      );
    }
    return parts.join(' · ');
  }

  protected basisHint(r: Risk): string | null {
    const basis = currentBasis(r);
    return basis ? `risk.rating.basisHint.${basis}` : null;
  }

  protected setQuery(q: string): void {
    this.q.set(q);
    this.offset.set(0);
    this.syncUrl();
  }

  protected patch(change: Partial<RiskFilters>): void {
    this.filters.update((f) => ({ ...f, ...change }));
    this.offset.set(0);
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.q.set('');
    this.filters.set(DEFAULT_FILTERS);
    this.offset.set(0);
    this.syncUrl();
  }

  protected applyView(view: SavedView): void {
    this.filters.set(parseRiskFilters(view.filters));
    this.offset.set(0);
    this.syncUrl();
  }

  protected newRisk(): void {
    void this.router.navigate(['/risk/risks/new']);
  }

  protected exportCsv(): void {
    const orgId = this.perms.orgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    // The export takes the list's filters but never its page window.
    const query = riskQuery(this.filters(), this.q(), 0);
    this.api.exportRisks(orgId, query, this.language.active()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, 'risk-register.csv');
      },
      error: () => {
        this.exporting.set(false);
        this.toasts.error('risk.risks.exportFailed');
      },
    });
  }

  private syncUrl(): void {
    const f = this.filters();
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: this.q() || null,
        status: f.status === DEFAULT_FILTERS.status ? null : f.status,
        register: f.register || null,
        level: f.level || null,
        owner: f.owner || null,
        review: f.review || null,
        appetite: f.appetite || null,
        sort: f.sort === DEFAULT_FILTERS.sort ? null : f.sort,
      },
    });
  }
}

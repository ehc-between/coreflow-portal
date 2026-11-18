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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
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
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { CONTRACTS_NAV, CONTRACTS_SETTINGS_LINK } from './contracts-nav';
import { ContractsApi } from './data/contracts-api';
import {
  CONTRACT_SORTS,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  CONTRACT_WARNINGS,
  ContractListItem,
  ContractListQuery,
  ContractSort,
  ContractStatus,
  ContractType,
  ContractWarning,
  PERM_MANAGE,
  PERM_WRITE,
  PERSONAL_DATA_ROLES,
  PersonalDataRole,
} from './data/contract.models';
import {
  contractStatusKey,
  contractTypeKey,
  deadlineKindKey,
  formatAmount,
  saveBlob,
  todayIso,
  warningKey,
} from './data/contract-display';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;
/** Notice deadlines this close are called out on the row ("Notice deadline in 31 days"). */
export const NOTICE_HIGHLIGHT_DAYS = 90;

/** Status filter options: `open` = every status that is not closed. */
export const STATUS_FILTERS = ['open', 'all', ...CONTRACT_STATUSES] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const EXPIRY_FILTERS = ['', '30', '60', '90', '180'] as const;
/** "Needs attention" filter: any warning, or one in particular. */
export const ATTENTION_FILTERS = ['', 'any', ...CONTRACT_WARNINGS] as const;

export function statusesForFilter(filter: string): readonly ContractStatus[] {
  if (filter === 'open') {
    return ['draft', 'in_review', 'approved', 'active'];
  }
  return (CONTRACT_STATUSES as readonly string[]).includes(filter)
    ? [filter as ContractStatus]
    : [];
}

/** The warnings an attention filter value asks for. */
export function warningsForFilter(filter: string): readonly ContractWarning[] {
  if (filter === 'any') {
    return CONTRACT_WARNINGS;
  }
  return (CONTRACT_WARNINGS as readonly string[]).includes(filter)
    ? [filter as ContractWarning]
    : [];
}

interface Kpi {
  readonly key: 'active' | 'dpa_missing' | 'notice_soon' | 'review';
  readonly filter: string;
  readonly tone: 'neutral' | 'warn' | 'fail' | 'accent';
}

const KPIS: readonly Kpi[] = [
  { key: 'active', filter: '', tone: 'accent' },
  { key: 'dpa_missing', filter: 'dpa_missing', tone: 'fail' },
  { key: 'notice_soon', filter: 'notice_soon', tone: 'warn' },
  { key: 'review', filter: 'review_overdue', tone: 'warn' },
];

/**
 * The contract register (`/contracts`): search, filters (status, type, what needs
 * attention; owner, end date, GDPR role and sort under "More filters"), saved
 * views, CSV export and paging. Each row shows the counterparties, the status, the
 * most important warning (no DPA, notice deadline soon, review overdue …), how many
 * requirements it documents and the next deadline.
 */
@Component({
  selector: 'app-contracts-list',
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
    ModuleNav,
    MenuItem,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="modules.names.contracts"
      descriptionKey="contracts.list.subtitle"
      scope="contracts"
      [settingsLink]="canManage() ? settingsLink : null"
      searchPlaceholderKey="contracts.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      [moreFiltersActive]="moreFiltersActive()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="contracts.register" />
      <app-module-nav nav [items]="nav" appTourStep="contracts-deadlines" />
      <app-help-strip
        help
        class="mb-5 block"
        scope="contracts"
        page="list"
        tour="list"
        lesson="contract-lifecycle"
      />

      @if (canWrite()) {
        <app-button
          primary
          size="sm"
          (click)="newContract()"
          appTourStep="contracts-new"
          data-testid="new-contract"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'contracts.list.new' | transloco }}
        </app-button>
      }
      <button
        overflow
        appMenuItem
        type="button"
        [disabled]="exporting()"
        (click)="exportCsv()"
        data-testid="export-csv"
      >
        {{ 'contracts.list.export' | transloco }}
      </button>

      @if (kpis(); as k) {
        <!-- One root element, so the tiles land in the [kpis] slot (a grid). -->
        <div kpis class="contents">
          @for (tile of kpiTiles; track tile.key) {
            <button
              type="button"
              class="hidden w-full min-w-0 rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:flex sm:flex-col"
              [attr.aria-pressed]="tile.filter ? attention() === tile.filter : null"
              (click)="applyKpi(tile)"
              [attr.data-testid]="'kpi-' + tile.key"
            >
              <app-kpi-tile
                class="flex-1 [&>div]:h-full"
                [label]="'contracts.kpis.' + tile.key | transloco"
                [value]="k[tile.key]"
                [tone]="k[tile.key] > 0 ? tile.tone : 'neutral'"
              />
            </button>
          }
        </div>
      }

      <label filters class="sr-only" for="cf-contract-status">
        {{ 'contracts.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-contract-status"
        class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
        (change)="setStatus($any($event.target).value)"
        appTourStep="contracts-filters"
        data-testid="filter-status"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ statusFilterKey(s) | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-contract-type">
        {{ 'contracts.filters.type' | transloco }}
      </label>
      <select
        filters
        id="cf-contract-type"
        class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
        (change)="setType($any($event.target).value)"
        data-testid="filter-type"
      >
        <option value="" [selected]="!type()">
          {{ 'contracts.filters.allTypes' | transloco }}
        </option>
        @for (t of types; track t) {
          <option [value]="t" [selected]="type() === t">
            {{ 'contracts.types.' + t | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-contract-attention">
        {{ 'contracts.filters.attention' | transloco }}
      </label>
      <select
        filters
        id="cf-contract-attention"
        class="h-10 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg sm:max-w-[240px]"
        (change)="setAttention($any($event.target).value)"
        data-testid="filter-attention"
      >
        @for (a of attentionFilters; track a) {
          <option [value]="a" [selected]="attention() === a">
            {{ attentionKey(a) | transloco }}
          </option>
        }
      </select>

      <div more-filters class="flex flex-col gap-1">
        <label for="cf-contract-owner" class="text-meta font-semibold text-fg-muted">
          {{ 'contracts.filters.owner' | transloco }}
        </label>
        <select
          id="cf-contract-owner"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setOwner($any($event.target).value)"
        >
          <option value="" [selected]="!owner()">
            {{ 'contracts.filters.anyOwner' | transloco }}
          </option>
          <option value="me" [selected]="owner() === 'me'">
            {{ 'contracts.filters.mine' | transloco }}
          </option>
        </select>
      </div>
      <div more-filters class="flex flex-col gap-1">
        <label for="cf-contract-expiry" class="text-meta font-semibold text-fg-muted">
          {{ 'contracts.filters.expiring' | transloco }}
        </label>
        <select
          id="cf-contract-expiry"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setExpiring($any($event.target).value)"
        >
          @for (e of expiryFilters; track e) {
            <option [value]="e" [selected]="expiring() === e">
              {{
                e
                  ? ('contracts.filters.expiringWithin' | transloco: { days: e })
                  : ('contracts.filters.anyExpiry' | transloco)
              }}
            </option>
          }
        </select>
      </div>
      <div more-filters class="flex flex-col gap-1">
        <label for="cf-contract-role" class="text-meta font-semibold text-fg-muted">
          {{ 'contracts.filters.personalDataRole' | transloco }}
        </label>
        <select
          id="cf-contract-role"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setRole($any($event.target).value)"
          data-testid="filter-role"
        >
          <option value="" [selected]="!role()">
            {{ 'contracts.filters.anyRole' | transloco }}
          </option>
          @for (r of roles; track r) {
            <option [value]="r" [selected]="role() === r">
              {{ 'contracts.personalDataRoles.' + r + '.label' | transloco }}
            </option>
          }
        </select>
      </div>
      <div more-filters class="flex flex-col gap-1">
        <label for="cf-contract-sort" class="text-meta font-semibold text-fg-muted">
          {{ 'contracts.filters.sort' | transloco }}
        </label>
        <select
          id="cf-contract-sort"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'contracts.sorts.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
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
                bodyKey="contracts.list.noMatch"
                ctaKey="contracts.list.clearFilters"
                ctaVariant="secondary"
                (cta)="clearFilters()"
                data-testid="no-match"
              />
            } @else {
              <div role="list" data-testid="contract-rows">
                <app-record-row-header dateKind="next" />
                @for (c of rows(); track c.id) {
                  <app-record-row
                    [code]="c.code"
                    [title]="c.title"
                    [subtitle]="subtitle(c)"
                    [link]="['/contracts', c.id]"
                    [owner]="c.owner?.name"
                    [date]="c.next_deadline?.due_date ?? c.end_date"
                    dateKind="next"
                    [overdue]="!!c.next_deadline?.overdue"
                  >
                    <app-coverage-chip coverage entityType="contract" [entityId]="c.id" />
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="c.status"
                      [labelKey]="statusKey(c.status)"
                    />
                    @if (noticeSoon(c); as days) {
                      <app-status-badge
                        badges
                        meaning="lifecycle"
                        value="due"
                        labelKey="contracts.list.noticeIn"
                        [labelParams]="{ days: days }"
                        data-testid="row-notice"
                      />
                    }
                    @if (rowWarning(c); as w) {
                      <app-status-badge
                        badges
                        [meaning]="w === 'dpa_missing' ? 'compliance' : 'lifecycle'"
                        [value]="w === 'dpa_missing' ? 'gap' : 'due'"
                        [labelKey]="warnKey(w)"
                        [attr.data-testid]="'row-warning-' + w"
                      />
                    }
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

      <app-why-it-matters below scope="contracts" page="list" />

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="contracts"
            page="list"
            [showAction]="canWrite()"
            (action)="newContract()"
          />
        </app-card>
        <app-why-it-matters scope="contracts" page="list" />
      </div>
    </app-record-list-page>
  `,
})
export class ContractsList {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly nav = CONTRACTS_NAV;
  protected readonly settingsLink = CONTRACTS_SETTINGS_LINK;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly expiryFilters = EXPIRY_FILTERS;
  protected readonly attentionFilters = ATTENTION_FILTERS;
  protected readonly types = CONTRACT_TYPES;
  protected readonly roles = PERSONAL_DATA_ROLES;
  protected readonly sorts = CONTRACT_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly kpiTiles = KPIS;
  protected readonly statusKey = contractStatusKey;
  protected readonly warnKey = warningKey;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes(PERM_WRITE));
  protected readonly canManage = computed(() => this.permissions().includes(PERM_MANAGE));

  protected readonly q = signal('');
  protected readonly status = signal<string>('open');
  protected readonly type = signal<ContractType | ''>('');
  protected readonly attention = signal<string>('');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly expiring = signal<string>('');
  protected readonly role = signal<PersonalDataRole | ''>('');
  protected readonly sort = signal<ContractSort>('-updated_at');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly ContractListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly exporting = signal(false);
  protected readonly kpis = signal<Readonly<Record<Kpi['key'], number>> | null>(null);
  private readonly reloadTick = signal(0);

  protected readonly moreFiltersActive = computed(
    () =>
      Number(!!this.owner()) +
      Number(!!this.expiring()) +
      Number(!!this.role()) +
      Number(this.sort() !== '-updated_at'),
  );
  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      this.status() !== 'open' ||
      !!this.type() ||
      !!this.attention() ||
      !!this.owner() ||
      !!this.expiring() ||
      !!this.role(),
  );
  /** The teaching empty state: the register itself is empty (not just this filter). */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    type: this.type(),
    attention: this.attention(),
    owner: this.owner(),
    expiring: this.expiring(),
    role: this.role(),
    sort: this.sort(),
  }));

  private readonly query = computed<ContractListQuery>(() => {
    const expiring = this.expiring();
    const role = this.role();
    return {
      q: this.q() || undefined,
      status: statusesForFilter(this.status()),
      type: this.type() ? [this.type() as ContractType] : undefined,
      warning: warningsForFilter(this.attention()),
      owner: this.owner() || undefined,
      expiring_within_days: expiring ? Number(expiring) : undefined,
      personal_data_role: role ? [role] : undefined,
      sort: this.sort(),
    };
  });

  private request = new Subscription();
  private kpiRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.kpiRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'contracts',
      entityType: 'contract',
      view: 'list',
      title: this.language.translate('modules.names.contracts'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = { ...this.query(), limit: PAGE_SIZE, offset: this.offset() };
      this.reloadTick();
      untracked(() => this.load(orgId, query));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reloadTick();
      untracked(() => this.loadKpis(orgId));
    });
  }

  /** "Supplier agreement · Nordic Cloud AS · 850 000 NOK · Next: notice deadline". */
  protected subtitle(c: ContractListItem): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(contractTypeKey(c.contract_type))];
    if (c.counterparties.length) {
      parts.push(c.counterparties.join(', '));
    }
    if (c.value_amount) {
      parts.push(
        `${formatAmount(c.value_amount, this.language.locale())} ${c.currency ?? ''}`.trim(),
      );
    }
    if (c.next_deadline) {
      parts.push(t('contracts.list.nextKind', { kind: t(deadlineKindKey(c.next_deadline.kind)) }));
    } else if (!c.end_date) {
      parts.push(t('contracts.list.noEnd'));
    }
    return parts.join(' · ');
  }

  /** Days left to give notice when that is within the highlight window. */
  protected noticeSoon(c: ContractListItem): number | null {
    const days = c.notice_due_in_days;
    return days !== null && days !== undefined && days >= 1 && days <= NOTICE_HIGHLIGHT_DAYS
      ? days
      : null;
  }

  /** The most important warning other than the notice deadline (shown as its own badge). */
  protected rowWarning(c: ContractListItem): ContractWarning | null {
    return (c.warnings ?? []).find((w) => w !== 'notice_soon') ?? null;
  }

  protected statusFilterKey(filter: string): string {
    return filter === 'open' || filter === 'all'
      ? `contracts.filters.statusOptions.${filter}`
      : contractStatusKey(filter);
  }

  protected attentionKey(filter: string): string {
    if (filter === '') {
      return 'contracts.filters.attentionOptions.all';
    }
    return filter === 'any'
      ? 'contracts.filters.attentionOptions.any'
      : `contracts.warnings.${filter}.filter`;
  }

  protected sortKey(sort: string): string {
    return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set((STATUS_FILTERS as readonly string[]).includes(value) ? value : 'open');
  }

  protected setType(value: string): void {
    this.offset.set(0);
    this.type.set(
      (CONTRACT_TYPES as readonly string[]).includes(value) ? (value as ContractType) : '',
    );
  }

  protected setAttention(value: string): void {
    this.offset.set(0);
    this.attention.set((ATTENTION_FILTERS as readonly string[]).includes(value) ? value : '');
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setExpiring(value: string): void {
    this.offset.set(0);
    this.expiring.set((EXPIRY_FILTERS as readonly string[]).includes(value) ? value : '');
  }

  protected setRole(value: string): void {
    this.offset.set(0);
    this.role.set(
      (PERSONAL_DATA_ROLES as readonly string[]).includes(value) ? (value as PersonalDataRole) : '',
    );
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (CONTRACT_SORTS as readonly string[]).includes(value)
        ? (value as ContractSort)
        : '-updated_at',
    );
  }

  protected applyKpi(tile: Kpi): void {
    if (tile.key === 'active') {
      this.setAttention('');
      this.setStatus('active');
      return;
    }
    this.setStatus('open');
    this.setAttention(this.attention() === tile.filter ? '' : tile.filter);
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('open');
    this.type.set('');
    this.attention.set('');
    this.owner.set('');
    this.expiring.set('');
    this.role.set('');
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.setStatus(f['status'] ?? 'open');
    this.setType(f['type'] ?? '');
    this.setAttention(f['attention'] ?? (f['personalData'] === '1' ? 'dpa_missing' : ''));
    this.setOwner(f['owner'] ?? '');
    this.setExpiring(f['expiring'] ?? '');
    this.setRole(f['role'] ?? '');
    this.setSort(f['sort'] ?? '-updated_at');
  }

  protected newContract(): void {
    void this.router.navigate(['/contracts/new']);
  }

  protected reload(): void {
    this.reloadTick.update((n) => n + 1);
  }

  /** The register with the active filters as CSV, in the UI language. */
  protected exportCsv(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    const lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.api.exportCsv(orgId, this.query(), lang).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, `${this.language.translate('contracts.list.exportFile')}-${todayIso()}.csv`);
      },
      error: () => {
        this.exporting.set(false);
        this.notifications.error('contracts.errors.exportFailed');
      },
    });
  }

  private load(orgId: string | null, query: ContractListQuery): void {
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

  /** Four counts for the tiles (one small request each; failures hide the tiles). */
  private loadKpis(orgId: string | null): void {
    this.kpiRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    const open = statusesForFilter('open');
    const count = (query: ContractListQuery) =>
      this.api.list(orgId, { ...query, limit: 1 }).pipe(map((page) => page.total));
    this.kpiRequest = forkJoin({
      active: count({ status: ['active'] }),
      dpa_missing: count({ status: open, warning: ['dpa_missing'] }),
      notice_soon: count({ status: open, warning: ['notice_soon'] }),
      review: count({ status: open, warning: ['review_overdue'] }),
    })
      .pipe(catchError(() => of(null)))
      .subscribe((counts) => this.kpis.set(counts));
  }
}

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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { HseApi } from '../data/hse-api';
import {
  PPE_CATEGORIES,
  PPE_SORTS,
  PPE_STATUSES,
  Ppe,
  PpeCategory,
  PpeQuery,
  PpeSort,
  PpeStatus,
} from '../data/hse.models';
import { ppeStatusValue } from '../hse-format';
import { HSE_MODULE, HSE_NAV, HSE_ROOT_CRUMB, injectHsePermissions } from '../shared/hse-shared';

const PAGE_SIZE = 25;

/** "Due" filter: '' = any, 'overdue' = inspection or expiry passed, '30' = within 30 days. */
export const PPE_DUE_FILTERS = ['', 'overdue', '30'] as const;
export type PpeDueFilter = (typeof PPE_DUE_FILTERS)[number];

export interface PpeListFilters {
  readonly status: PpeStatus | '';
  readonly category: PpeCategory | '';
  readonly due: PpeDueFilter;
  readonly mine: '' | '1';
  readonly sort: PpeSort;
}

export const PPE_DEFAULT_FILTERS: PpeListFilters = {
  status: '',
  category: '',
  due: '',
  mine: '',
  sort: '-created_at',
};

/**
 * Filters from a saved view or the URL. Accepts the overview / next-action links
 * (`?overdue=true`, `?due=0` = overdue, `?due=30`) and the SJA "Lever ut" link
 * (`?category=head&status=in_stock`).
 */
export function parsePpeFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): PpeListFilters {
  const pick = <T extends string>(value: string | null | undefined, allowed: readonly T[], d: T) =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : d;
  const dueRaw = raw['overdue'] === 'true' || raw['due'] === '0' ? 'overdue' : raw['due'];
  return {
    status: pick(raw['status'], ['', ...PPE_STATUSES], ''),
    category: pick(raw['category'], ['', ...PPE_CATEGORIES], ''),
    due: pick(dueRaw, PPE_DUE_FILTERS, ''),
    mine: raw['mine'] === '1' ? '1' : '',
    sort: pick(raw['sort'], PPE_SORTS, '-created_at'),
  };
}

export function ppeQuery(q: string, f: PpeListFilters, offset: number): PpeQuery {
  return {
    q: q.trim() || undefined,
    status: f.status ? [f.status] : undefined,
    category: f.category || undefined,
    holder: f.mine ? 'me' : undefined,
    overdue: f.due === 'overdue' ? true : undefined,
    due_within_days: f.due === '30' ? 30 : undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/** i18n key suffix (`hse.ppe.sort.<key>`) of a sort option. */
export function ppeSortKey(sort: PpeSort): string {
  return sort.replace(/^-/, 'desc_');
}

/**
 * `/hse/ppe` ("Verneutstyr"): the PPE register with search, status / category /
 * due filters, "held by me", sorting, saved views and paging. Each row shows
 * the code, the item, its category and holder (or how many are in stock), the
 * requirements it documents, the status plus a red "Kontroll forfalt" /
 * "Utløpt" badge when it must not be used, and the next due date.
 */
@Component({
  selector: 'app-ppe-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    Card,
    CoverageChip,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="hse.ppe.list.title"
      descriptionKey="hse.ppe.list.subtitle"
      scope="hse"
      page="ppe"
      searchPlaceholderKey="hse.ppe.list.search"
      [breadcrumbs]="crumbs"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      @if (perms.write()) {
        <a primary routerLink="/hse/ppe/new" tabindex="-1">
          <app-button>
            <app-icon name="plus" [size]="15" />
            {{ 'hse.ppe.new' | transloco }}
          </app-button>
        </a>
      }

      <app-module-nav nav class="mb-4 block" [items]="nav" labelKey="modules.names.hse" />
      <app-help-strip help scope="hse" page="ppe" lesson="ppe-last-line" />

      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'hse.common.status' | transloco"
        (change)="setFilter('status', $any($event.target).value)"
        data-testid="ppe-filter-status"
      >
        <option value="" [selected]="filters().status === ''">
          {{ 'hse.common.allStatuses' | transloco }}
        </option>
        @for (s of statuses; track s) {
          <option [value]="s" [selected]="s === filters().status">
            {{ 'hse.ppe.status.' + s | transloco }}
          </option>
        }
      </select>
      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'hse.ppe.list.due' | transloco"
        (change)="setFilter('due', $any($event.target).value)"
        data-testid="ppe-filter-due"
      >
        @for (d of dueFilters; track d) {
          <option [value]="d" [selected]="d === filters().due">
            {{ 'hse.ppe.list.dueFilter.' + (d || 'any') | transloco }}
          </option>
        }
      </select>
      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'hse.ppe.fields.category' | transloco"
        (change)="setFilter('category', $any($event.target).value)"
        data-testid="ppe-filter-category"
      >
        <option value="" [selected]="filters().category === ''">
          {{ 'hse.ppe.list.allCategories' | transloco }}
        </option>
        @for (c of categories; track c) {
          <option [value]="c" [selected]="c === filters().category">
            {{ 'hse.ppeCategory.' + c | transloco }}
          </option>
        }
      </select>
      <div more-filters class="flex flex-col gap-3">
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="filters().mine === '1'"
            (change)="setFilter('mine', $any($event.target).checked ? '1' : '')"
          />
          {{ 'hse.ppe.list.heldByMe' | transloco }}
        </label>
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'hse.common.sort' | transloco }}
          <select class="cf-filter" (change)="setFilter('sort', $any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="s === filters().sort">
                {{ 'hse.ppe.sort.' + sortKey(s) | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (state() === 'error') {
        <app-error-state (retry)="reload()" />
      } @else if (state() === 'loading' && items().length === 0) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-card>
          <app-empty-state
            icon="search"
            titleKey="hse.common.noMatchesTitle"
            bodyKey="hse.common.noMatches"
            [compact]="true"
            data-testid="no-matches"
          />
          <div class="-mt-2 pb-4 text-center">
            <app-button variant="secondary" size="sm" (click)="clearFilters()">
              {{ 'hse.common.clearFilters' | transloco }}
            </app-button>
          </div>
        </app-card>
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-busy]="state() === 'loading'" data-testid="ppe-rows">
            <app-record-row-header dateKind="due" />
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.name"
                [subtitle]="subtitle(row)"
                [link]="['/hse/ppe', row.id]"
                [owner]="row.responsible?.name"
                [date]="row.due_at"
                dateKind="due"
                [overdue]="row.overdue"
              >
                <app-coverage-chip coverage entityType="ppe_item" [entityId]="row.id" />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="statusValue(row.status)"
                  [labelKey]="'hse.ppe.status.' + row.status"
                />
                @if (row.expired) {
                  <app-status-badge
                    badges
                    meaning="severity"
                    value="high"
                    labelKey="hse.ppe.badge.expired"
                    data-testid="ppe-badge-expired"
                  />
                } @else if (row.inspection_overdue || row.overdue) {
                  <app-status-badge
                    badges
                    meaning="severity"
                    value="high"
                    labelKey="hse.ppe.badge.inspectionOverdue"
                    data-testid="ppe-badge-overdue"
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
            scope="hse"
            page="ppe"
            [showAction]="perms.write()"
            (action)="create()"
          />
        </app-card>
      </div>

      <app-why-it-matters below scope="hse" page="ppe" />
    </app-record-list-page>
  `,
  styles: [
    `
      .cf-filter {
        height: 40px;
        max-width: 100%;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        font-weight: 400;
        padding: 0 10px;
        outline: none;
      }
      .cf-filter:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class PpeList {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly perms = injectHsePermissions();
  protected readonly nav = HSE_NAV;
  protected readonly crumbs = [HSE_ROOT_CRUMB, { labelKey: 'hse.nav.ppe' }];
  protected readonly statuses = PPE_STATUSES;
  protected readonly categories = PPE_CATEGORIES;
  protected readonly sorts = PPE_SORTS;
  protected readonly dueFilters = PPE_DUE_FILTERS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortKey = ppeSortKey;
  protected readonly statusValue = ppeStatusValue;

  protected readonly query = signal('');
  protected readonly filters = signal<PpeListFilters>(
    parsePpeFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Ppe[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly moreActive = computed(
    () =>
      (this.filters().mine ? 1 : 0) + (this.filters().sort !== PPE_DEFAULT_FILTERS.sort ? 1 : 0),
  );
  protected readonly isEmptyRegister = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.query() &&
      JSON.stringify(this.filters()) === JSON.stringify(PPE_DEFAULT_FILTERS),
  );

  private request = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'ppe_item',
      view: 'list',
      title: this.language.translate('hse.ppe.list.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = ppeQuery(this.query(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  private load(orgId: string | null, query: PpeQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listPpe(orgId, query).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.state.set('ready');
      },
      error: () => {
        this.items.set([]);
        this.state.set('error');
      },
    });
  }

  protected reload(): void {
    this.load(
      this.selectedOrg.currentOrgId(),
      ppeQuery(this.query(), this.filters(), this.offset()),
    );
  }

  /** "Hodevern · Holdes av Ola Hansen" / "Hodevern · 20 på lager · Lager B". */
  protected subtitle(row: Ppe): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(`hse.ppeCategory.${row.category}`)];
    const holder = row.holder?.name || row.holder_name;
    if (holder) {
      parts.push(t('hse.ppe.list.heldBy', { name: holder }));
    } else if (row.quantity > 1) {
      parts.push(t('hse.ppe.list.quantity', { count: row.quantity }));
    }
    if (row.location && !holder) {
      parts.push(row.location);
    }
    return parts.join(' · ');
  }

  protected onSearch(text: string): void {
    this.query.set(text.trim());
    this.offset.set(0);
  }

  protected setFilter(key: keyof PpeListFilters, value: string): void {
    this.filters.set(parsePpeFilters({ ...this.filters(), [key]: value }));
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.filters.set(PPE_DEFAULT_FILTERS);
    this.query.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.filters.set(parsePpeFilters(view.filters));
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigate(['/hse/ppe/new']);
  }
}

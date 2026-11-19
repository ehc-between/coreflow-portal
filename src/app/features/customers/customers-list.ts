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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import {
  CUSTOMER_ENTITY,
  CUSTOMER_STATUSES,
  CUSTOMERS_MANAGE,
  CUSTOMERS_WRITE,
  CustomerStatus,
  customerStatusBadge,
} from '../../shared/customers/customer.models';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { customerErrorKey, formatOrgNumber } from './data/customer-display';
import {
  CUSTOMER_SORTS,
  CustomerListItem,
  CustomerQuery,
  CustomerSort,
  CustomerSummary,
  ScanResult,
} from './data/customer.models';
import { CustomersApi } from './data/customers-api';
import { CustomerOwnerSelect } from './data/owner-select';

const PAGE_SIZE = 25;
const DEFAULT_SORT: CustomerSort = 'name';
const RENEWAL_SOON_DAYS = 60;

/**
 * The customer register (`/customers`, docs/customer-register-design.md §3.1):
 * name (+ "Også leverandør"), org. number, status, segment, customer owner, open
 * claims and the next contract renewal; search, status and segment filters, more
 * filters (owner, open claims, sort) and saved views. An empty register offers to
 * find customers in existing data (`customers:manage`); pending matches show a
 * banner with a link to the review list.
 */
@Component({
  selector: 'app-customers-list',
  imports: [
    TranslocoPipe,
    RouterLink,
    RecordListPage,
    CoverageChip,
    Alert,
    Button,
    Card,
    EmptyState,
    ErrorState,
    Icon,
    LoadingState,
    MenuItem,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    CustomerOwnerSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="modules.names.customers"
      descriptionKey="customers.list.subtitle"
      [breadcrumbs]="[{ labelKey: 'modules.names.customers' }]"
      scope="customers"
      page="list"
      searchPlaceholderKey="customers.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (canWrite()) {
        <app-button primary (click)="newCustomer()" data-testid="new-customer">
          <app-icon name="plus" [size]="14" />
          {{ 'customers.actions.new' | transloco }}
        </app-button>
      }
      @if (canWrite() && pending() > 0) {
        <a
          secondary
          routerLink="/customers/matches"
          class="inline-flex h-9 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
        >
          {{ 'customers.matches.title' | transloco }}
        </a>
      }
      @if (canManage()) {
        <button
          appMenuItem
          overflow
          type="button"
          [disabled]="scanning()"
          (click)="scan()"
          data-testid="scan-overflow"
        >
          {{ 'customers.scan.action' | transloco }}
        </button>
      }

      <div intro class="mt-3 flex flex-col gap-2 empty:hidden">
        @if (scanResult(); as r) {
          <app-alert tone="success" data-testid="scan-result">
            {{
              'customers.scan.result'
                | transloco: { created: r.created, linked: r.linked, pending: r.pending }
            }}
            @if (r.pending > 0) {
              <a routerLink="/customers/matches" class="ml-1 font-semibold underline">
                {{ 'customers.scan.review' | transloco }}
              </a>
            }
          </app-alert>
        } @else if (canWrite() && pending() > 0) {
          <div
            class="flex flex-wrap items-center gap-2 rounded-tile border border-warn/40 bg-warn-soft px-3 py-2 text-ui text-fg"
            data-testid="pending-banner"
          >
            <span>{{ pendingKey() | transloco: { count: pending() } }}</span>
            <a routerLink="/customers/matches" class="font-semibold text-accent hover:underline">
              {{ 'customers.list.pendingReview' | transloco }} <span aria-hidden="true">→</span>
            </a>
          </div>
        }
      </div>

      <label filters class="sr-only" for="cf-cus-status">
        {{ 'customers.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-cus-status"
        class="h-10 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none"
        (change)="setStatus($any($event.target).value)"
        data-testid="filter-status"
      >
        <option value="" [selected]="!status()">
          {{ 'customers.filters.allStatuses' | transloco }}
        </option>
        @for (s of statuses; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ 'customers.status.' + s | transloco }}
          </option>
        }
      </select>
      @if (segments().length) {
        <ng-container ngProjectAs="[filters]">
          <label class="sr-only" for="cf-cus-segment">
            {{ 'customers.filters.segment' | transloco }}
          </label>
          <select
            id="cf-cus-segment"
            class="h-10 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none"
            (change)="setSegment($any($event.target).value)"
            data-testid="filter-segment"
          >
            <option value="" [selected]="!segment()">
              {{ 'customers.filters.allSegments' | transloco }}
            </option>
            @for (s of segments(); track s) {
              <option [value]="s" [selected]="segment() === s">{{ s }}</option>
            }
          </select>
        </ng-container>
      }

      <div more-filters class="flex flex-col gap-1">
        <label for="cf-cus-owner" class="text-meta font-semibold text-fg-muted">{{
          'customers.fields.owner' | transloco
        }}</label>
        <app-customer-owner-select
          inputId="cf-cus-owner"
          emptyKey="customers.filters.allOwners"
          selectClass="h-10 w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          [value]="owner()"
          (valueChange)="setOwner($event)"
        />
      </div>
      <label more-filters class="flex items-center gap-2 text-ui text-fg">
        <input
          type="checkbox"
          [checked]="openClaims()"
          (change)="setOpenClaims($any($event.target).checked)"
          data-testid="filter-open-claims"
        />
        {{ 'customers.filters.openClaims' | transloco }}
      </label>
      <div more-filters class="flex flex-col gap-1">
        <label for="cf-cus-sort" class="text-meta font-semibold text-fg-muted">{{
          'customers.filters.sort' | transloco
        }}</label>
        <select
          id="cf-cus-sort"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'customers.sorts.' + sortLabel(s) | transloco }}
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
                ctaKey="customers.list.resetFilters"
                ctaVariant="secondary"
                (cta)="resetFilters()"
                data-testid="no-match"
              />
            } @else {
              <div role="list" data-testid="customer-rows">
                <app-record-row-header dateKind="next" [owner]="true" />
                @for (c of rows(); track c.id) {
                  <app-record-row
                    [code]="c.code"
                    [title]="c.name"
                    [subtitle]="subtitle(c)"
                    [link]="['/customers', c.id]"
                    [owner]="c.owner?.name"
                    [date]="c.next_renewal?.date ?? null"
                    dateKind="next"
                    [overdue]="renewalSoon(c)"
                  >
                    <span coverage class="block max-w-full min-w-0 overflow-hidden">
                      <app-coverage-chip [entityType]="entityType" [entityId]="c.id" />
                    </span>
                    <span badges class="contents">
                      @let st = statusBadge(c.status);
                      <app-status-badge
                        [meaning]="st.meaning"
                        [value]="st.value"
                        [labelKey]="st.labelKey"
                      />
                      @if (c.open_claims > 0) {
                        <app-status-badge
                          meaning="lifecycle"
                          value="overdue"
                          [labelKey]="claimsKey(c.open_claims)"
                          [labelParams]="{ count: c.open_claims }"
                          data-testid="row-claims"
                        />
                      }
                      @if (c.also_supplier) {
                        <span
                          class="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-micro font-semibold text-fg-muted"
                          data-testid="row-also-supplier"
                          >{{ 'customers.alsoSupplier' | transloco }}</span
                        >
                      }
                    </span>
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

      <div empty>
        <app-card>
          @if (canManage() && neverScanned()) {
            <app-empty-state
              icon="search"
              titleKey="customers.empty.scanTitle"
              bodyKey="customers.empty.scanBody"
              ctaKey="customers.scan.action"
              (cta)="scan()"
              data-testid="empty-scan"
            />
            @if (canWrite()) {
              <p class="pb-6 text-center text-ui">
                <a routerLink="/customers/new" class="font-semibold text-accent hover:underline">
                  {{ 'customers.empty.orNew' | transloco }}
                </a>
              </p>
            }
          } @else {
            <app-empty-state
              icon="plus"
              titleKey="customers.empty.title"
              bodyKey="customers.empty.body"
              [ctaKey]="canWrite() ? 'customers.actions.new' : null"
              (cta)="newCustomer()"
              data-testid="empty-register"
            />
          }
        </app-card>
      </div>
    </app-record-list-page>
  `,
})
export class CustomersList {
  private readonly api = inject(CustomersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly entityType = CUSTOMER_ENTITY;
  protected readonly statuses = CUSTOMER_STATUSES;
  protected readonly sorts = CUSTOMER_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusBadge = customerStatusBadge;

  private readonly permissions = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );
  protected readonly canWrite = computed(() => this.permissions().has(CUSTOMERS_WRITE));
  protected readonly canManage = computed(() => this.permissions().has(CUSTOMERS_MANAGE));

  protected readonly q = signal('');
  protected readonly status = signal<CustomerStatus | ''>('');
  protected readonly segment = signal('');
  protected readonly owner = signal('');
  protected readonly openClaims = signal(false);
  protected readonly sort = signal<CustomerSort>(DEFAULT_SORT);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly CustomerListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<CustomerSummary | null>(null);
  protected readonly segments = signal<readonly string[]>([]);
  protected readonly scanning = signal(false);
  protected readonly scanResult = signal<ScanResult | null>(null);
  private readonly reloads = signal(0);

  protected readonly pending = computed(() => this.summary()?.pending_matches ?? 0);
  protected readonly pendingKey = computed(() =>
    this.pending() === 1 ? 'customers.list.pendingOne' : 'customers.list.pending',
  );
  protected readonly neverScanned = computed(() => {
    const s = this.summary();
    return !!s && !s.last_scan;
  });
  protected readonly filtered = computed(
    () => !!(this.q() || this.status() || this.segment() || this.owner() || this.openClaims()),
  );
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.filtered(),
  );
  protected readonly moreActive = computed(
    () =>
      (this.owner() ? 1 : 0) + (this.openClaims() ? 1 : 0) + (this.sort() !== DEFAULT_SORT ? 1 : 0),
  );
  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    segment: this.segment(),
    owner: this.owner(),
    open_claims: this.openClaims() ? '1' : '',
    sort: this.sort(),
  }));

  private request = new Subscription();
  private side = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.side.unsubscribe();
    });
    providePageContext(() => ({
      module: 'customers',
      entityType: CUSTOMER_ENTITY,
      view: 'list',
      title: this.language.translate('modules.names.customers'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const status = this.status();
      const query: CustomerQuery = {
        q: this.q() || undefined,
        status: status ? [status] : undefined,
        segment: this.segment() || undefined,
        owner_user_id: this.owner() || undefined,
        has_open_claims: this.openClaims() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      this.reloads();
      untracked(() => this.load(orgId, query));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reloads();
      untracked(() => this.loadSide(orgId));
    });
  }

  protected subtitle(c: CustomerListItem): string {
    const parts: string[] = [];
    if (c.org_number) {
      parts.push(
        this.language.translate('customers.list.orgNumber', {
          number: formatOrgNumber(c.org_number),
        }),
      );
    }
    if (c.segment) {
      parts.push(c.segment);
    }
    if (c.city) {
      parts.push(c.city);
    }
    if (c.next_renewal && c.next_renewal.days >= 0) {
      parts.push(
        this.language.translate(
          c.next_renewal.days === 1 ? 'customers.list.renewsOne' : 'customers.list.renews',
          { count: c.next_renewal.days },
        ),
      );
    }
    return parts.join(' · ');
  }

  protected renewalSoon(c: CustomerListItem): boolean {
    const days = c.next_renewal?.days;
    return days !== undefined && days !== null && days >= 0 && days <= RENEWAL_SOON_DAYS;
  }

  protected claimsKey(count: number): string {
    return count === 1 ? 'customers.list.openClaimsOne' : 'customers.list.openClaims';
  }

  protected sortLabel(sort: CustomerSort): string {
    return sort === '-updated' ? 'updated' : sort === 'next_renewal' ? 'nextRenewal' : 'name';
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set(
      (CUSTOMER_STATUSES as readonly string[]).includes(value) ? (value as CustomerStatus) : '',
    );
  }

  protected setSegment(value: string): void {
    this.offset.set(0);
    this.segment.set(value);
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value);
  }

  protected setOpenClaims(value: boolean): void {
    this.offset.set(0);
    this.openClaims.set(value);
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (CUSTOMER_SORTS as readonly string[]).includes(value)
        ? (value as CustomerSort)
        : DEFAULT_SORT,
    );
  }

  protected applyView(view: SavedView): void {
    this.setStatus(view.filters['status'] ?? '');
    this.setSegment(view.filters['segment'] ?? '');
    this.setOwner(view.filters['owner'] ?? '');
    this.setOpenClaims(view.filters['open_claims'] === '1');
    this.setSort(view.filters['sort'] ?? DEFAULT_SORT);
  }

  protected resetFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('');
    this.segment.set('');
    this.owner.set('');
    this.openClaims.set(false);
    this.sort.set(DEFAULT_SORT);
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  protected newCustomer(): void {
    void this.router.navigate(['/customers/new']);
  }

  /** "Finn kunder i eksisterende data": run the matching engine, then show the result. */
  protected scan(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.scanning()) {
      return;
    }
    this.scanning.set(true);
    this.api.scan(orgId).subscribe({
      next: (result) => {
        this.scanning.set(false);
        this.scanResult.set({
          created: result.created ?? 0,
          linked: result.linked ?? 0,
          pending: result.pending ?? 0,
        });
        this.reload();
      },
      error: (err: unknown) => {
        this.scanning.set(false);
        this.notifications.error(customerErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, query: CustomerQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items ?? []);
        this.total.set(page.total ?? 0);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private loadSide(orgId: string | null): void {
    this.side.unsubscribe();
    if (!orgId) {
      return;
    }
    this.side = new Subscription();
    this.side.add(
      this.api.summary(orgId).subscribe({
        next: (s) => this.summary.set(s),
        error: () => this.summary.set(null),
      }),
    );
    this.side.add(
      this.api.segments(orgId).subscribe({
        next: (list) => this.segments.set(list.filter((s) => !!s?.trim())),
        error: () => this.segments.set([]),
      }),
    );
  }
}

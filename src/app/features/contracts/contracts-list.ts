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
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { ContractsApi } from './data/contracts-api';
import {
  CONTRACT_SORTS,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  ContractListItem,
  ContractListQuery,
  ContractSort,
  ContractStatus,
  ContractType,
  PERM_WRITE,
} from './data/contract.models';
import {
  contractStatusKey,
  contractStatusTone,
  contractTypeKey,
  deadlineKindKey,
} from './data/contract-display';
import { ContractLessonLink } from './lesson-link';

const PAGE_SIZE = 25;

/** Status filter options: `open` = every status that is not closed. */
export const STATUS_FILTERS = ['open', 'all', ...CONTRACT_STATUSES] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const EXPIRY_FILTERS = ['', '30', '60', '90', '180'] as const;

export function statusesForFilter(filter: string): readonly ContractStatus[] {
  if (filter === 'open') {
    return ['draft', 'in_review', 'approved', 'active'];
  }
  return (CONTRACT_STATUSES as readonly string[]).includes(filter)
    ? [filter as ContractStatus]
    : [];
}

/**
 * The contract register (`/contracts`): search, filters on status, type, owner,
 * expiry window and personal data, sorting, saved views and paging. Each row
 * shows the counterparties, status and the next deadline (overdue highlighted).
 */
@Component({
  selector: 'app-contracts-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    GuideIntro,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    ContractLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="contracts.list.title"
      scope="contracts"
      searchPlaceholderKey="contracts.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <p class="text-[14px] text-fg-muted">{{ 'contracts.list.subtitle' | transloco }}</p>
        <app-guide-intro scope="contracts" page="list" />
      </div>

      <app-tour-button toolbar scope="contracts" tour="list" />
      <a
        toolbar
        routerLink="/contracts/deadlines"
        class="inline-flex h-9 items-center gap-1.5 rounded-tile px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft"
        appTourStep="contracts-deadlines"
        data-testid="deadlines-link"
      >
        <app-icon name="calendar" [size]="15" />
        {{ 'contracts.deadlines.link' | transloco }}
      </a>
      @if (canWrite()) {
        <app-button
          toolbar
          size="sm"
          (click)="newContract()"
          appTourStep="contracts-new"
          data-testid="new-contract"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'contracts.list.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-contract-status">
        {{ 'contracts.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-contract-status"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
      <label filters class="sr-only" for="cf-contract-owner">
        {{ 'contracts.filters.owner' | transloco }}
      </label>
      <select
        filters
        id="cf-contract-owner"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setOwner($any($event.target).value)"
      >
        <option value="" [selected]="!owner()">
          {{ 'contracts.filters.anyOwner' | transloco }}
        </option>
        <option value="me" [selected]="owner() === 'me'">
          {{ 'contracts.filters.mine' | transloco }}
        </option>
      </select>
      <label filters class="sr-only" for="cf-contract-expiry">
        {{ 'contracts.filters.expiring' | transloco }}
      </label>
      <select
        filters
        id="cf-contract-expiry"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
      <label filters class="sr-only" for="cf-contract-sort">
        {{ 'contracts.filters.sort' | transloco }}
      </label>
      <select
        filters
        id="cf-contract-sort"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setSort($any($event.target).value)"
      >
        @for (s of sorts; track s) {
          <option [value]="s" [selected]="sort() === s">
            {{ 'contracts.sorts.' + sortKey(s) | transloco }}
          </option>
        }
      </select>
      <label
        filters
        class="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
      >
        <input
          type="checkbox"
          class="h-4 w-4 accent-[var(--accent)]"
          [checked]="personalData()"
          (change)="setPersonalData($any($event.target).checked)"
        />
        {{ 'contracts.filters.personalData' | transloco }}
      </label>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'contracts.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'contracts.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'contracts.list.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="contract-rows">
                @for (c of rows(); track c.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/contracts', c.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                          c.code
                        }}</span>
                        <span class="truncate">{{ c.title }}</span>
                        @if (c.confidential) {
                          <app-icon name="lock" [size]="13" class="flex-none text-fg-subtle" />
                          <span class="sr-only">{{
                            'contracts.fields.confidential' | transloco
                          }}</span>
                        }
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{ typeKey(c.contract_type) | transloco }}</span>
                        @if (c.counterparties.length) {
                          <span class="truncate">{{ c.counterparties.join(', ') }}</span>
                        }
                        @if (c.value_amount) {
                          <span>
                            {{ c.value_amount | localNumber: '1.0-2' }} {{ c.currency ?? '' }}
                          </span>
                        }
                        @if (c.processes_personal_data) {
                          <span>{{ 'contracts.list.personalData' | transloco }}</span>
                        }
                        @if (c.owner?.name; as ownerName) {
                          <span>{{ 'contracts.list.owner' | transloco: { name: ownerName } }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="statusTone(c.status)">{{
                        statusKey(c.status) | transloco
                      }}</app-badge>
                      <span
                        class="inline-flex min-w-[150px] items-center justify-end gap-1 text-right"
                        [class.text-fail]="c.next_deadline?.overdue"
                        [class.font-semibold]="c.next_deadline?.overdue"
                      >
                        @if (c.next_deadline; as d) {
                          @if (d.overdue) {
                            <app-icon name="alert" [size]="13" />
                            <span class="sr-only">{{
                              'contracts.common.overdue' | transloco
                            }}</span>
                          }
                          {{ kindKey(d.kind) | transloco }}: {{ d.due_date | localDay }}
                        } @else if (c.end_date) {
                          {{ 'contracts.list.ends' | transloco: { date: (c.end_date | localDay) } }}
                        } @else {
                          {{ 'contracts.list.noEnd' | transloco }}
                        }
                      </span>
                    </span>
                  </li>
                }
              </ul>
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
      </app-card>

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="contracts" page="list" />
        <div class="flex flex-wrap gap-2">
          <app-contract-lesson-link lesson="contract-lifecycle" />
          <app-contract-lesson-link lesson="processor-agreements" />
        </div>
      </div>

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
        <div class="flex flex-wrap gap-2">
          <app-contract-lesson-link lesson="contract-lifecycle" />
          <app-contract-lesson-link lesson="processor-agreements" />
        </div>
      </div>
    </app-record-list-page>
  `,
})
export class ContractsList {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly expiryFilters = EXPIRY_FILTERS;
  protected readonly types = CONTRACT_TYPES;
  protected readonly sorts = CONTRACT_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = contractStatusKey;
  protected readonly statusTone = contractStatusTone;
  protected readonly typeKey = contractTypeKey;
  protected readonly kindKey = deadlineKindKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<string>('open');
  protected readonly type = signal<ContractType | ''>('');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly expiring = signal<string>('');
  protected readonly personalData = signal(false);
  protected readonly sort = signal<ContractSort>('-updated_at');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly ContractListItem[]>([]);
  protected readonly total = signal(0);

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      this.status() !== 'open' ||
      !!this.type() ||
      !!this.owner() ||
      !!this.expiring() ||
      this.personalData(),
  );
  /** The teaching empty state: the register itself is empty (not just this filter). */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    type: this.type(),
    owner: this.owner(),
    expiring: this.expiring(),
    personalData: this.personalData() ? '1' : '',
    sort: this.sort(),
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'contracts',
      entityType: 'contract',
      view: 'list',
      title: this.language.translate('contracts.list.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const expiring = this.expiring();
      const query: ContractListQuery = {
        q: this.q() || undefined,
        status: statusesForFilter(this.status()),
        type: this.type() ? [this.type() as ContractType] : undefined,
        owner: this.owner() || undefined,
        expiring_within_days: expiring ? Number(expiring) : undefined,
        processes_personal_data: this.personalData() ? true : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected statusFilterKey(filter: string): string {
    return filter === 'open' || filter === 'all'
      ? `contracts.filters.statusOptions.${filter}`
      : contractStatusKey(filter);
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

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setExpiring(value: string): void {
    this.offset.set(0);
    this.expiring.set((EXPIRY_FILTERS as readonly string[]).includes(value) ? value : '');
  }

  protected setPersonalData(value: boolean): void {
    this.offset.set(0);
    this.personalData.set(value);
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (CONTRACT_SORTS as readonly string[]).includes(value)
        ? (value as ContractSort)
        : '-updated_at',
    );
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.setStatus(f['status'] ?? 'open');
    this.setType(f['type'] ?? '');
    this.setOwner(f['owner'] ?? '');
    this.setExpiring(f['expiring'] ?? '');
    this.setPersonalData(f['personalData'] === '1');
    this.setSort(f['sort'] ?? '-updated_at');
  }

  protected newContract(): void {
    void this.router.navigate(['/contracts/new']);
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
}

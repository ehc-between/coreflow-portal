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
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
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
import { ppeStatusTone } from '../hse-format';
import { HSE_MODULE, HseLessonButton, HseNav, injectHsePermissions } from '../shared/hse-shared';

const PAGE_SIZE = 25;
/** "Due" filter values: '' = any, '0' = overdue / due today, '30' = within 30 days. */
const DUE_FILTERS = ['', '0', '30'] as const;
type DueFilter = (typeof DUE_FILTERS)[number];

const SELECT_CLASS =
  'h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent';

/**
 * `/hse/ppe`: the PPE register with search, status / category / due filters,
 * "held by me", sorting, saved views and paging. `?status=` and `?due=` (from the
 * overview) seed the filters.
 */
@Component({
  selector: 'app-ppe-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    RecordListPage,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    HseNav,
    HseLessonButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="hse.ppe.list.title"
      scope="hse"
      page="ppe"
      searchPlaceholderKey="hse.ppe.list.search"
      [query]="query()"
      [filters]="filters()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1">
        <p class="text-[14px] text-fg-muted">{{ 'hse.ppe.list.subtitle' | transloco }}</p>
      </div>
      <ng-container toolbar>
        <app-hse-lesson-button lesson="ppe-last-line" labelKey="hse.ppe.lesson" />
        @if (perms.write()) {
          <a routerLink="/hse/ppe/new" tabindex="-1">
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'hse.ppe.new' | transloco }}
            </app-button>
          </a>
        }
      </ng-container>
      <ng-container filters>
        <label class="sr-only" for="ppe-status">{{ 'hse.common.status' | transloco }}</label>
        <select
          id="ppe-status"
          [class]="selectClass"
          (change)="set('status', $any($event.target).value)"
        >
          <option value="">{{ 'hse.common.allStatuses' | transloco }}</option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="s === status()">
              {{ 'hse.ppe.status.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ppe-category">{{
          'hse.ppe.fields.category' | transloco
        }}</label>
        <select
          id="ppe-category"
          [class]="selectClass"
          (change)="set('category', $any($event.target).value)"
        >
          <option value="">{{ 'hse.ppe.list.allCategories' | transloco }}</option>
          @for (c of categories; track c) {
            <option [value]="c" [selected]="c === category()">
              {{ 'hse.ppeCategory.' + c | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ppe-due">{{ 'hse.ppe.list.due' | transloco }}</label>
        <select id="ppe-due" [class]="selectClass" (change)="set('due', $any($event.target).value)">
          @for (d of dueFilters; track d) {
            <option [value]="d" [selected]="d === due()">
              {{ 'hse.ppe.list.dueFilter.' + (d || 'any') | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ppe-sort">{{ 'hse.common.sort' | transloco }}</label>
        <select
          id="ppe-sort"
          [class]="selectClass"
          (change)="set('sort', $any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === sort()">
              {{ 'hse.ppe.sort.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
        <button
          type="button"
          class="h-10 rounded-[10px] border px-3 text-[13px] font-semibold"
          [class]="
            mine()
              ? 'border-accent-border bg-accent-soft text-accent'
              : 'border-border bg-bg text-fg-muted hover:text-fg'
          "
          [attr.aria-pressed]="mine()"
          (click)="toggleMine()"
        >
          {{ 'hse.ppe.list.heldByMe' | transloco }}
        </button>
      </ng-container>

      <app-hse-nav />
      <div class="mb-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <app-guide-intro scope="hse" page="ppe" />
        <app-why-it-matters scope="hse" page="ppe" />
      </div>

      <app-card [padded]="false">
        @if (state() === 'loading') {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'hse.common.loading' | transloco }}
          </p>
        } @else if (state() === 'error') {
          <p class="px-4 py-10 text-center text-[14px] text-fail" role="alert">
            {{ 'hse.common.loadFailed' | transloco }}
          </p>
        } @else if (items().length === 0 && !filtered()) {
          <app-teaching-empty
            scope="hse"
            page="ppe"
            [showAction]="perms.write()"
            (action)="create()"
          />
        } @else if (items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'hse.common.noMatches' | transloco }}
          </p>
        } @else {
          <ul data-testid="ppe-rows">
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/hse/ppe', row.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none focus-visible:bg-surface-2"
                >
                  <span class="w-[84px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{ row.name }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      {{ 'hse.ppeCategory.' + row.category | transloco }}
                      @if (row.holder?.name || row.holder_name; as holder) {
                        · {{ 'hse.ppe.list.heldBy' | transloco: { name: holder } }}
                      }
                    </span>
                  </span>
                  <app-badge [tone]="statusTone(row.status)">{{
                    'hse.ppe.status.' + row.status | transloco
                  }}</app-badge>
                  <span class="w-[120px] flex-none text-right text-[12.5px]">
                    @if (row.due_at) {
                      <span [class]="row.overdue ? 'font-semibold text-fail' : 'text-fg-subtle'">
                        {{
                          (row.overdue ? 'hse.ppe.list.overdueOn' : 'hse.ppe.list.dueOn')
                            | transloco: { date: (row.due_at | localDay) }
                        }}
                      </span>
                    } @else {
                      <span class="text-fg-subtle">—</span>
                    }
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </app-card>
      <app-pager
        [offset]="offset()"
        [pageSize]="pageSize"
        [count]="items().length"
        [total]="total()"
        (pageChange)="offset.set($event)"
      />
    </app-record-list-page>
  `,
})
export class PpeList {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);

  protected readonly perms = injectHsePermissions();
  protected readonly statuses = PPE_STATUSES;
  protected readonly categories = PPE_CATEGORIES;
  protected readonly sorts = PPE_SORTS;
  protected readonly dueFilters = DUE_FILTERS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly selectClass = SELECT_CLASS;
  protected readonly statusTone = ppeStatusTone;

  protected readonly query = signal('');
  protected readonly status = signal<PpeStatus | ''>('');
  protected readonly category = signal<PpeCategory | ''>('');
  protected readonly due = signal<DueFilter>('');
  protected readonly sort = signal<PpeSort>('-created_at');
  protected readonly mine = signal(false);
  protected readonly offset = signal(0);

  protected readonly items = signal<readonly Ppe[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly filtered = computed(
    () => !!(this.query() || this.status() || this.category() || this.due() || this.mine()),
  );
  protected readonly filters = computed(() => ({
    status: this.status(),
    category: this.category(),
    due: this.due(),
    sort: this.sort(),
    mine: this.mine() ? '1' : '',
  }));

  private request = new Subscription();

  constructor() {
    providePageContext(() => ({ module: HSE_MODULE, entityType: 'ppe_item', view: 'list' }));
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    this.applyFilters({ status: params.get('status') ?? '', due: params.get('due') ?? '' });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: PpeQuery = {
        q: this.query() || undefined,
        status: this.status() ? [this.status() as PpeStatus] : undefined,
        category: this.category() || undefined,
        holder: this.mine() ? 'me' : undefined,
        due_within_days: this.due() ? Number(this.due()) : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
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

  private applyFilters(f: Readonly<Record<string, string>>): void {
    const status = f['status'] ?? '';
    this.status.set(
      (PPE_STATUSES as readonly string[]).includes(status) ? (status as PpeStatus) : '',
    );
    const category = f['category'] ?? '';
    this.category.set(
      (PPE_CATEGORIES as readonly string[]).includes(category) ? (category as PpeCategory) : '',
    );
    const due = f['due'] ?? '';
    this.due.set((DUE_FILTERS as readonly string[]).includes(due) ? (due as DueFilter) : '');
    const sort = f['sort'] ?? '';
    this.sort.set(
      (PPE_SORTS as readonly string[]).includes(sort) ? (sort as PpeSort) : '-created_at',
    );
    this.mine.set(f['mine'] === '1');
  }

  protected sortKey(sort: PpeSort): string {
    return sort.replace(/^-/, 'desc_');
  }

  protected onSearch(text: string): void {
    this.query.set(text.trim());
    this.offset.set(0);
  }

  protected set(key: 'status' | 'category' | 'due' | 'sort', value: string): void {
    this.applyFilters({ ...this.filters(), [key]: value });
    this.offset.set(0);
  }

  protected toggleMine(): void {
    this.mine.update((v) => !v);
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.applyFilters(view.filters);
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigate(['/hse/ppe/new']);
  }
}

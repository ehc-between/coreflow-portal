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
import { AskPanelService } from '../ask/ask-panel.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
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
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { Pager } from '../../shared/ui/pager/pager';
import { criticalityTone, statusTone } from './data/supplier-display';
import {
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
import { SuppliersNav } from './shared/suppliers-nav';

const PAGE_SIZE = 25;

/** The list filters kept in a saved view (all strings; '' = any). */
export interface SupplierFilters {
  readonly status: SupplierStatus | '';
  readonly criticality: Criticality | '';
  readonly category: SupplierCategory | '';
  readonly due: EvaluationDueFilter | '';
  readonly flag: SupplierFlag | '';
  readonly owner: 'me' | '';
  readonly sort: SupplierSort;
}

export const DEFAULT_FILTERS: SupplierFilters = {
  status: '',
  criticality: '',
  category: '',
  due: '',
  flag: '',
  owner: '',
  sort: 'name',
};

/** Restore filters from a saved view, ignoring unknown values. */
export function filtersFromView(values: Readonly<Record<string, string>>): SupplierFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
  const sort = pick(values['sort'], SUPPLIER_SORTS);
  return {
    status: pick(values['status'], SUPPLIER_STATUSES),
    criticality: pick(values['criticality'], CRITICALITIES),
    category: pick(values['category'], SUPPLIER_CATEGORIES),
    due: pick(values['due'], EVALUATION_DUE_FILTERS),
    flag: pick(values['flag'], SUPPLIER_FLAGS),
    owner: values['owner'] === 'me' ? 'me' : '',
    sort: sort || 'name',
  };
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
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * The supplier register (`/suppliers`): headline figures, search, filters on
 * status, criticality, category, re-evaluation due date, risk flags and owner, saved
 * views, sorting and paging. Each row shows the approval status, criticality and the
 * next re-evaluation date (red when overdue).
 */
@Component({
  selector: 'app-suppliers-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Badge,
    Button,
    Card,
    GuideIntro,
    Icon,
    KpiTile,
    LessonView,
    Pager,
    RecordListPage,
    SuppliersNav,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="suppliers.list.title"
      scope="suppliers"
      searchPlaceholderKey="suppliers.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <p class="mt-1 text-[14px] text-fg-muted">{{ 'suppliers.list.subtitle' | transloco }}</p>
        <app-suppliers-nav />
      </div>

      <ng-container toolbar>
        <app-tour-button scope="suppliers" tour="list" />
        <app-button variant="ghost" size="sm" (click)="askOverview()">
          <app-icon name="spark" [size]="14" />
          {{ 'suppliers.ai.overview' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="suppliers-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'suppliers.list.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <div class="flex flex-wrap items-center gap-2" appTourStep="suppliers-filters">
          <label class="sr-only" for="sup-f-status">{{
            'suppliers.fields.status' | transloco
          }}</label>
          <select
            id="sup-f-status"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <label class="sr-only" for="sup-f-crit">
            {{ 'suppliers.fields.criticality' | transloco }}
          </label>
          <select
            id="sup-f-crit"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <label class="sr-only" for="sup-f-cat">{{
            'suppliers.fields.category' | transloco
          }}</label>
          <select
            id="sup-f-cat"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <label class="sr-only" for="sup-f-due">
            {{ 'suppliers.filters.evaluationDue' | transloco }}
          </label>
          <select
            id="sup-f-due"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <label class="sr-only" for="sup-f-flag">{{ 'suppliers.filters.flag' | transloco }}</label>
          <select
            id="sup-f-flag"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <label class="sr-only" for="sup-f-owner">{{
            'suppliers.fields.owner' | transloco
          }}</label>
          <select
            id="sup-f-owner"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('owner', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().owner">
              {{ 'suppliers.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="filters().owner === 'me'">
              {{ 'suppliers.filters.ownedByMe' | transloco }}
            </option>
          </select>
          <label class="sr-only" for="sup-f-sort">{{ 'suppliers.filters.sort' | transloco }}</label>
          <select
            id="sup-f-sort"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'suppliers.filters.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
      </ng-container>

      <div class="mb-4 flex flex-col gap-3">
        <app-guide-intro scope="suppliers" page="list" />
        <div><app-lesson scope="suppliers" lesson="supplier-control" /></div>
      </div>

      @if (summary(); as s) {
        <div
          class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
          appTourStep="suppliers-summary"
        >
          <app-kpi-tile [label]="'suppliers.summary.total' | transloco" [value]="s.total" />
          <app-kpi-tile
            [label]="'suppliers.summary.approved' | transloco"
            [value]="(s.by_status['approved'] ?? 0) + (s.by_status['conditional'] ?? 0)"
            tone="pass"
          />
          <app-kpi-tile
            [label]="'suppliers.summary.overdue' | transloco"
            [value]="s.evaluations_overdue"
            [tone]="s.evaluations_overdue ? 'fail' : 'neutral'"
          />
          <app-kpi-tile
            [label]="'suppliers.summary.dueSoon' | transloco"
            [value]="s.evaluations_due_soon"
            [tone]="s.evaluations_due_soon ? 'warn' : 'neutral'"
          />
          <app-kpi-tile
            [label]="'suppliers.summary.openEvaluations' | transloco"
            [value]="s.open_evaluations"
            tone="info"
          />
          <app-kpi-tile
            [label]="'suppliers.summary.processors' | transloco"
            [value]="s.processors"
            [delta]="'suppliers.summary.aiSuppliers' | transloco: { count: s.ai_suppliers }"
          />
        </div>
      }

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'suppliers.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'suppliers.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'suppliers.filters.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="supplier-rows">
                @for (row of rows(); track row.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/suppliers', row.id]"
                        class="flex items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                        <span class="truncate">{{ row.name }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{ 'suppliers.category.' + row.category | transloco }}</span>
                        @if (row.country) {
                          <span>{{ row.country }}</span>
                        }
                        @if (row.owner?.name; as owner) {
                          <span>{{ 'suppliers.list.ownedBy' | transloco: { name: owner } }}</span>
                        }
                        @for (flag of flagsOf(row); track flag) {
                          <span
                            class="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted"
                          >
                            {{ 'suppliers.flagsShort.' + flag | transloco }}
                          </span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="critTone(row.criticality)">
                        {{ 'suppliers.criticality.' + row.criticality | transloco }}
                      </app-badge>
                      <app-badge [tone]="supplierTone(row.status)">
                        {{ 'suppliers.status.' + row.status | transloco }}
                      </app-badge>
                      @if (row.last_score !== null) {
                        <span class="w-[64px] text-right">
                          {{
                            'suppliers.list.score'
                              | transloco: { score: (row.last_score | localNumber: '1.0-1') }
                          }}
                        </span>
                      }
                      <span
                        class="inline-flex w-[130px] items-center justify-end gap-1"
                        [class.text-fail]="row.evaluation_overdue"
                        [class.font-semibold]="row.evaluation_overdue"
                      >
                        @if (row.evaluation_overdue) {
                          <app-icon name="alert" [size]="13" />
                          <span class="sr-only">{{ 'suppliers.common.overdue' | transloco }}</span>
                        }
                        @if (row.next_evaluation_at) {
                          {{
                            'suppliers.list.nextEvaluation'
                              | transloco: { date: (row.next_evaluation_at | localDay) }
                          }}
                        } @else {
                          {{ 'suppliers.list.noEvaluationDate' | transloco }}
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

      <div class="mt-6">
        <app-why-it-matters scope="suppliers" page="list" />
      </div>

      <div empty class="flex flex-col gap-4">
        <app-guide-intro scope="suppliers" page="list" />
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

  protected readonly statuses = SUPPLIER_STATUSES;
  protected readonly criticalities = CRITICALITIES;
  protected readonly categories = SUPPLIER_CATEGORIES;
  protected readonly dueFilters = EVALUATION_DUE_FILTERS;
  protected readonly flags = SUPPLIER_FLAGS;
  protected readonly sorts = SUPPLIER_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly critTone = criticalityTone;
  protected readonly supplierTone = statusTone;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('suppliers:write'));

  protected readonly q = signal('');
  protected readonly filters = signal<SupplierFilters>(DEFAULT_FILTERS);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly SupplierListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<SupplierSummary | null>(null);

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
      title: this.language.translate('suppliers.list.title'),
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

  protected flagsOf(row: SupplierListItem): readonly SupplierFlag[] {
    return SUPPLIER_FLAGS.filter((f) => row[f]);
  }

  protected create(): void {
    void this.router.navigate(['/suppliers/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('suppliers.ai.prompts.overview'));
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

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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RiskApi } from '../data/risk-api';
import { treatmentStatusValue } from '../data/risk-display';
import {
  TREATMENT_SORTS,
  TREATMENT_STATUSES,
  TreatmentPlanItem,
  TreatmentSort,
} from '../data/risk.models';
import { RiskNav } from '../shared/risk-nav';
import { RiskPermissions } from '../shared/risk-permissions';

const PAGE_SIZE = 50;

export const TREATMENT_STATUS_FILTERS = ['open', 'all', ...TREATMENT_STATUSES] as const;
export type TreatmentStatusFilter = (typeof TREATMENT_STATUS_FILTERS)[number];

/** The URL state of the list (`?status=open&overdue=true&check=true&owner=me&q=`). */
export interface TreatmentPlanFilters {
  readonly q: string;
  readonly status: TreatmentStatusFilter;
  readonly overdue: boolean;
  readonly check: boolean;
  readonly mine: boolean;
  readonly sort: TreatmentSort;
}

export function treatmentFiltersFromParams(params: ParamMap): TreatmentPlanFilters {
  const status = params.get('status');
  const sort = params.get('sort');
  return {
    q: params.get('q') ?? '',
    status:
      status && (TREATMENT_STATUS_FILTERS as readonly string[]).includes(status)
        ? (status as TreatmentStatusFilter)
        : 'open',
    overdue: params.get('overdue') === 'true',
    check: params.get('check') === 'true',
    mine: params.get('owner') === 'me',
    sort:
      sort && (TREATMENT_SORTS as readonly string[]).includes(sort)
        ? (sort as TreatmentSort)
        : 'due_at',
  };
}

/**
 * U24: the risk treatment plan, every treatment across all risks. The overview's "Open
 * treatments" tile opens it (`?status=open`), its overdue line `?overdue=true` and the
 * effectiveness reminder `?status=done&check=true`; the counts match the rows.
 */
@Component({
  selector: 'app-treatment-plan-list',
  imports: [
    TranslocoPipe,
    RouterLink,
    RecordListPage,
    Card,
    EmptyState,
    ErrorState,
    LoadingState,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    RiskNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      exportRegister="risk_treatments"
      titleKey="risk.treatmentPlan.title"
      descriptionKey="risk.treatmentPlan.subtitle"
      scope="risk"
      page="treatments"
      settingsLink="/settings/modules/risk"
      [breadcrumbs]="[
        { labelKey: 'modules.names.risk', link: '/risk' },
        { labelKey: 'risk.treatmentPlan.title' },
      ]"
      searchPlaceholderKey="risk.treatmentPlan.searchPlaceholder"
      [query]="filters().q"
      [filters]="filterRecord()"
      [moreFiltersActive]="(filters().mine ? 1 : 0) + (filters().check ? 1 : 0)"
      (search)="patch({ q: $event || null })"
      (viewApplied)="applyView($event)"
    >
      <app-risk-nav nav />

      <ng-container filters>
        <label class="sr-only" for="tp-f-status">{{ 'risk.filters.status' | transloco }}</label>
        <select
          id="tp-f-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          data-testid="tp-status"
          (change)="patch({ status: $any($event.target).value })"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="s === filters().status">
              {{ 'risk.treatmentPlan.statusFilters.' + s | transloco }}
            </option>
          }
        </select>
        <label class="inline-flex min-h-10 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            data-testid="tp-overdue"
            [checked]="filters().overdue"
            (change)="patch({ overdue: $any($event.target).checked ? 'true' : null })"
          />
          {{ 'risk.treatmentPlan.overdueOnly' | transloco }}
        </label>
      </ng-container>
      <div more-filters class="flex flex-col gap-2">
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="filters().mine"
            (change)="patch({ owner: $any($event.target).checked ? 'me' : null })"
          />
          {{ 'risk.filters.mine' | transloco }}
        </label>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="filters().check"
            (change)="patch({ check: $any($event.target).checked ? 'true' : null })"
          />
          {{ 'risk.treatmentPlan.needsCheck' | transloco }}
        </label>
        <label class="text-meta font-semibold text-fg-muted" for="tp-f-sort">
          {{ 'risk.filters.sort' | transloco }}
        </label>
        <select
          id="tp-f-sort"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="patch({ sort: $any($event.target).value })"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === filters().sort">
              {{ 'risk.treatmentPlan.sorts.' + s | transloco }}
            </option>
          }
        </select>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="4" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (rows().length === 0) {
              <app-empty-state
                icon="search"
                [titleKey]="isFiltered() ? 'ui.empty.noResults' : 'risk.treatmentPlan.empty'"
                [ctaKey]="isFiltered() ? 'risk.filters.clear' : null"
                ctaVariant="secondary"
                [compact]="true"
                (cta)="clearFilters()"
              />
            } @else {
              <div
                role="list"
                [attr.aria-label]="'risk.treatmentPlan.title' | transloco"
                data-testid="tp-rows"
              >
                <app-record-row-header dateKind="due" />
                @for (t of rows(); track t.id) {
                  <app-record-row
                    [code]="t.risk.code"
                    [title]="t.title"
                    [subtitle]="t.risk.title"
                    [link]="['/risk/risks', t.risk_id]"
                    [owner]="t.owner?.name ?? ('risk.common.unassigned' | transloco)"
                    [date]="t.due_at"
                    dateKind="due"
                    [overdue]="t.overdue"
                  >
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="statusValue(t.status)"
                      [labelKey]="'risk.treatments.status.' + t.status"
                    />
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
      <p class="mt-3 text-meta text-fg-muted">
        <a routerLink="/risk/risks" class="text-accent underline">
          {{ 'risk.treatmentPlan.toRisks' | transloco }}
        </a>
      </p>
    </app-record-list-page>
  `,
})
export class TreatmentPlanListPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly perms = inject(RiskPermissions);

  protected readonly statusFilters = TREATMENT_STATUS_FILTERS;
  protected readonly sorts = TREATMENT_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusValue = treatmentStatusValue;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly rows = signal<readonly TreatmentPlanItem[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly offset = signal(0);
  protected readonly filters = signal<TreatmentPlanFilters>(
    treatmentFiltersFromParams(this.route.snapshot.queryParamMap),
  );
  private readonly revision = signal(0);
  private sub: Subscription | null = null;

  protected readonly filterRecord = computed<Record<string, string>>(() => {
    const f = this.filters();
    return {
      status: f.status,
      overdue: f.overdue ? 'true' : '',
      check: f.check ? 'true' : '',
      owner: f.mine ? 'me' : '',
      sort: f.sort,
    };
  });
  protected readonly isFiltered = computed(() => {
    const f = this.filters();
    return !!f.q || f.status !== 'open' || f.overdue || f.check || f.mine;
  });

  constructor() {
    // The tiles link here with query params, so the URL is the source of truth.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.filters.set(treatmentFiltersFromParams(params));
      this.offset.set(0);
    });
    effect(() => {
      const orgId = this.perms.orgId();
      const f = this.filters();
      const offset = this.offset();
      this.revision();
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.state.set('loading');
        this.sub = this.api
          .listAllTreatments(orgId, {
            q: f.q || undefined,
            status: f.status === 'all' ? undefined : f.status,
            overdue: f.overdue,
            needs_effectiveness_check: f.check,
            owner: f.mine ? 'me' : undefined,
            sort: f.sort,
            limit: PAGE_SIZE,
            offset,
          })
          .subscribe({
            next: (res) => {
              this.rows.set(res.items);
              this.total.set(res.total);
              this.state.set('ready');
            },
            error: () => this.state.set('error'),
          });
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.revision.update((n) => n + 1);
  }

  /** Filters live in the URL so every tile and saved view is a shareable link. */
  protected patch(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.patch({
      status: f['status'] || null,
      overdue: f['overdue'] || null,
      check: f['check'] || null,
      owner: f['owner'] || null,
      sort: f['sort'] || null,
    });
  }
}

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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { RiskApi } from '../data/risk-api';
import { bandLabel, riskStatusTone } from '../data/risk-display';
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
import { RiskPageGuide } from '../shared/risk-page-guide';
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
  readonly sort: RiskSort;
}

const DEFAULT_FILTERS: RiskFilters = {
  status: 'open',
  register: '',
  level: '',
  owner: '',
  review: '',
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
    sort: pick(raw['sort'], RISK_SORTS, DEFAULT_FILTERS.sort),
  };
}

/** The API query for a filter set. */
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
    include_closed: filters.status === 'all' || filters.status === 'closed',
    sort: filters.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * The risk register: every risk the caller can read, filtered by status, register,
 * level, owner and review due date, searchable, sortable, with saved views. Rows show
 * the inherent and residual rating so the effect of treatment is visible at a glance.
 */
@Component({
  selector: 'app-risk-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    TeachingEmpty,
    TourStepDirective,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    RatingBadge,
    RiskPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="risk.risks.title"
      scope="risk"
      page="risks"
      searchPlaceholderKey="risk.risks.searchPlaceholder"
      [query]="q()"
      [filters]="filterRecord()"
      [empty]="state() === 'ready' && rows().length === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3">
        <app-risk-page-guide page="risks" lesson="first-risk-assessment" tour="risks" />
      </div>
      @if (perms.canWrite()) {
        <app-button toolbar size="sm" [appTourStep]="'risk-new'" (click)="newRisk()">
          <app-icon name="plus" [size]="14" />
          {{ 'risk.risks.new' | transloco }}
        </app-button>
      }

      <ng-container filters>
        <label class="sr-only" for="risk-f-status">{{ 'risk.filters.status' | transloco }}</label>
        <select
          id="risk-f-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
            class="h-10 max-w-[200px] rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="patch({ level: $any($event.target).value })"
        >
          <option value="" [selected]="!filters().level">
            {{ 'risk.filters.allLevels' | transloco }}
          </option>
          @for (b of levelOptions(); track b.key) {
            <option [value]="b.key" [selected]="b.key === filters().level">{{ b.text }}</option>
          }
        </select>
        <label class="sr-only" for="risk-f-sort">{{ 'risk.filters.sort' | transloco }}</label>
        <select
          id="risk-f-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="patch({ sort: $any($event.target).value })"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === filters().sort">
              {{ 'risk.filters.sorts.' + s | transloco }}
            </option>
          }
        </select>
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg-muted">
          <input
            type="checkbox"
            [checked]="filters().owner === 'me'"
            (change)="patch({ owner: $any($event.target).checked ? 'me' : '' })"
          />
          {{ 'risk.filters.mine' | transloco }}
        </label>
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg-muted">
          <input
            type="checkbox"
            [checked]="filters().review === 'due'"
            (change)="patch({ review: $any($event.target).checked ? 'due' : '' })"
          />
          {{ 'risk.filters.reviewDue' | transloco }}
        </label>
      </ng-container>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'risk.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'risk.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'risk.filters.noMatch' | transloco }}
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full min-w-[760px] text-left text-[13px]">
                  <caption class="sr-only">
                    {{
                      'risk.risks.title' | transloco
                    }}
                  </caption>
                  <thead class="border-b border-border text-[12px] text-fg-muted">
                    <tr>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'risk.fields.code' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'risk.fields.title' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'risk.fields.inherent' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'risk.fields.residual' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'risk.fields.status' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'risk.fields.owner' | transloco }}
                      </th>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'risk.fields.nextReview' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (r of rows(); track r.id) {
                      <tr class="align-top hover:bg-surface-2">
                        <td
                          class="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap text-fg-subtle"
                        >
                          {{ r.code }}
                        </td>
                        <td class="px-2 py-2.5">
                          <a
                            [routerLink]="['/risk/risks', r.id]"
                            class="font-semibold text-fg hover:underline"
                            [class.line-through]="r.status === 'closed'"
                            >{{ r.title }}</a
                          >
                          <div class="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                            <span>{{ r.register.name }}</span>
                            @if (r.above_appetite) {
                              <span class="font-semibold text-fail">
                                {{ 'risk.rating.aboveAppetite' | transloco }}
                              </span>
                            }
                            @if (r.treatments.open > 0) {
                              <span>
                                {{
                                  'risk.risks.openTreatments'
                                    | transloco: { count: r.treatments.open }
                                }}
                              </span>
                            }
                          </div>
                        </td>
                        <td class="px-2 py-2.5">
                          <app-rating-badge
                            [score]="r.inherent?.score"
                            [level]="r.inherent?.level"
                            [label]="r.inherent?.label"
                            [color]="r.inherent?.color"
                          />
                        </td>
                        <td class="px-2 py-2.5">
                          <app-rating-badge
                            [score]="r.residual?.score"
                            [level]="r.residual?.level"
                            [label]="r.residual?.label"
                            [color]="r.residual?.color"
                          />
                        </td>
                        <td class="px-2 py-2.5">
                          <app-badge [tone]="statusTone(r.status)">
                            {{ 'risk.status.' + r.status | transloco }}
                          </app-badge>
                        </td>
                        <td class="px-2 py-2.5 text-fg-muted">
                          {{ r.owner?.name ?? ('risk.common.unassigned' | transloco) }}
                        </td>
                        <td
                          class="px-4 py-2.5 whitespace-nowrap"
                          [class.text-fail]="r.review_overdue"
                          [class.font-semibold]="r.review_overdue"
                          [class.text-fg-muted]="!r.review_overdue"
                        >
                          {{ r.next_review_at | localDay }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="border-t border-border px-4 py-2">
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
    </app-record-list-page>
  `,
})
export class RiskListPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
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
  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly filters = signal<RiskFilters>(
    parseRiskFilters(this.route.snapshot.queryParams as Record<string, string>),
  );
  private sub: Subscription | null = null;

  protected readonly filterRecord = computed<Record<string, string>>(() => ({ ...this.filters() }));

  protected readonly isFiltered = computed(() => {
    const f = this.filters();
    return (
      !!this.q() || f.status !== 'open' || !!f.register || !!f.level || !!f.owner || !!f.review
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

  protected statusTone(status: RiskStatus) {
    return riskStatusTone(status);
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

  protected applyView(view: SavedView): void {
    this.filters.set(parseRiskFilters(view.filters));
    this.offset.set(0);
    this.syncUrl();
  }

  protected newRisk(): void {
    void this.router.navigate(['/risk/risks/new']);
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
        sort: f.sort === DEFAULT_FILTERS.sort ? null : f.sort,
      },
    });
  }
}

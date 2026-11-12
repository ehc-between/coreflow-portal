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
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { RiskApi } from '../data/risk-api';
import { opportunityStatusTone } from '../data/risk-display';
import {
  OPPORTUNITY_SORTS,
  OPPORTUNITY_STATUSES,
  Opportunity,
  OpportunitySort,
  OpportunityStatus,
} from '../data/risk.models';
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';

const PAGE_SIZE = 50;
const OPEN_STATUSES: readonly OpportunityStatus[] = [
  'identified',
  'evaluating',
  'planned',
  'in_progress',
];

export const OPPORTUNITY_STATUS_FILTERS = ['open', 'all', ...OPPORTUNITY_STATUSES] as const;
export type OpportunityStatusFilter = (typeof OPPORTUNITY_STATUS_FILTERS)[number];

/**
 * Opportunities (ISO 6.1: actions to address risks *and opportunities*): ideas with a
 * benefit x feasibility score, an owner, a due date and an action plan.
 */
@Component({
  selector: 'app-opportunity-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    TeachingEmpty,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    RiskPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="risk.opportunities.title"
      scope="risk"
      page="opportunities"
      searchPlaceholderKey="risk.opportunities.searchPlaceholder"
      [query]="q()"
      [filters]="filterRecord()"
      [empty]="state() === 'ready' && rows().length === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3">
        <app-risk-page-guide page="opportunities" lesson="opportunities" />
      </div>
      @if (perms.canWrite()) {
        <app-button toolbar size="sm" (click)="newOpportunity()">
          <app-icon name="plus" [size]="14" />
          {{ 'risk.opportunities.new' | transloco }}
        </app-button>
      }
      <ng-container filters>
        <label class="sr-only" for="opp-f-status">{{ 'risk.filters.status' | transloco }}</label>
        <select
          id="opp-f-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setStatus($any($event.target).value)"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="s === status()">
              {{ 'risk.opportunities.statusFilters.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="opp-f-sort">{{ 'risk.filters.sort' | transloco }}</label>
        <select
          id="opp-f-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === sort()">
              {{ 'risk.filters.sorts.' + s | transloco }}
            </option>
          }
        </select>
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg-muted">
          <input
            type="checkbox"
            [checked]="mine()"
            (change)="setMine($any($event.target).checked)"
          />
          {{ 'risk.filters.mine' | transloco }}
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
            <ul class="divide-y divide-border">
              @for (o of rows(); track o.id) {
                <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <span class="font-mono text-[12px] text-fg-subtle">{{ o.code }}</span>
                  <div class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/risk/opportunities', o.id]"
                      class="block truncate text-[13.5px] font-semibold text-fg hover:underline"
                      >{{ o.title }}</a
                    >
                    <span class="flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                      <span>{{ o.owner?.name ?? ('risk.common.unassigned' | transloco) }}</span>
                      @if (o.due_at) {
                        <span [class.text-fail]="o.overdue" [class.font-semibold]="o.overdue">
                          {{ 'risk.treatments.due' | transloco: { date: (o.due_at | localDay) } }}
                        </span>
                      }
                    </span>
                  </div>
                  @if (o.score !== null) {
                    <span
                      class="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent"
                      [attr.aria-label]="
                        'risk.opportunities.scoreLabel' | transloco: { score: o.score }
                      "
                    >
                      {{ o.score }}
                    </span>
                  }
                  <app-badge [tone]="tone(o.status)">
                    {{ 'risk.opportunities.status.' + o.status | transloco }}
                  </app-badge>
                </li>
              } @empty {
                <li class="py-10 text-center text-[14px] text-fg-muted">
                  {{ 'risk.filters.noMatch' | transloco }}
                </li>
              }
            </ul>
            @if (rows().length) {
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
          page="opportunities"
          [showAction]="perms.canWrite()"
          (action)="newOpportunity()"
        />
      </app-card>
    </app-record-list-page>
  `,
})
export class OpportunityListPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(RiskPermissions);

  protected readonly statusFilters = OPPORTUNITY_STATUS_FILTERS;
  protected readonly sorts = OPPORTUNITY_SORTS;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly rows = signal<readonly Opportunity[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly offset = signal(0);
  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly status = signal<OpportunityStatusFilter>(
    pickStatus(this.route.snapshot.queryParamMap.get('status')),
  );
  protected readonly sort = signal<OpportunitySort>('-score');
  protected readonly mine = signal(false);
  private sub: Subscription | null = null;

  protected readonly filterRecord = computed<Record<string, string>>(() => ({
    status: this.status(),
    sort: this.sort(),
    owner: this.mine() ? 'me' : '',
  }));
  protected readonly isFiltered = computed(
    () => !!this.q() || this.status() !== 'open' || this.mine(),
  );

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'opportunity',
      view: 'list',
      title: this.language.translate('risk.opportunities.title'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const q = this.q();
      const status = this.status();
      const sort = this.sort();
      const mine = this.mine();
      const offset = this.offset();
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.state.set('loading');
        this.sub = this.api
          .listOpportunities(orgId, {
            q: q || undefined,
            status: status === 'open' ? OPEN_STATUSES : status === 'all' ? [] : [status],
            owner: mine ? 'me' : undefined,
            sort,
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

  protected tone(status: OpportunityStatus) {
    return opportunityStatusTone(status);
  }

  protected setQuery(q: string): void {
    this.q.set(q);
    this.offset.set(0);
  }

  protected setStatus(value: string): void {
    this.status.set(pickStatus(value));
    this.offset.set(0);
  }

  protected setSort(value: string): void {
    if ((OPPORTUNITY_SORTS as readonly string[]).includes(value)) {
      this.sort.set(value as OpportunitySort);
    }
  }

  protected setMine(value: boolean): void {
    this.mine.set(value);
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.setStatus(view.filters['status'] ?? 'open');
    this.setSort(view.filters['sort'] ?? '-score');
    this.setMine(view.filters['owner'] === 'me');
  }

  protected newOpportunity(): void {
    void this.router.navigate(['/risk/opportunities/new']);
  }
}

function pickStatus(value: string | null | undefined): OpportunityStatusFilter {
  return value && (OPPORTUNITY_STATUS_FILTERS as readonly string[]).includes(value)
    ? (value as OpportunityStatusFilter)
    : 'open';
}

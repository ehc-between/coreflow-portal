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
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RiskApi } from '../data/risk-api';
import { opportunityStatusValue } from '../data/risk-display';
import {
  OPPORTUNITY_SORTS,
  OPPORTUNITY_STATUSES,
  Opportunity,
  OpportunitySort,
  OpportunityStatus,
} from '../data/risk.models';
import { OpportunityScore } from '../shared/opportunity-score';
import { RiskNav } from '../shared/risk-nav';
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
 * benefit x feasibility score out of 25, an owner, a due date and action items. The
 * same list rows as risks: code, title, score, status, owner and due date.
 */
@Component({
  selector: 'app-opportunity-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
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
    OpportunityScore,
    RiskNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="risk.opportunities.title"
      descriptionKey="risk.opportunities.subtitle"
      scope="risk"
      page="opportunities"
      settingsLink="/settings/modules/risk"
      [breadcrumbs]="[
        { labelKey: 'modules.names.risk', link: '/risk' },
        { labelKey: 'risk.opportunities.title' },
      ]"
      searchPlaceholderKey="risk.opportunities.searchPlaceholder"
      [query]="q()"
      [filters]="filterRecord()"
      [moreFiltersActive]="mine() ? 1 : 0"
      [empty]="state() === 'ready' && rows().length === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (perms.canWrite()) {
        <app-button primary (click)="newOpportunity()">
          <app-icon name="plus" [size]="14" />
          {{ 'risk.opportunities.new' | transloco }}
        </app-button>
      }
      <app-risk-nav nav />
      <app-help-strip help scope="risk" page="opportunities" lesson="opportunities" />

      <ng-container filters>
        <label class="sr-only" for="opp-f-status">{{ 'risk.filters.status' | transloco }}</label>
        <select
          id="opp-f-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
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
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === sort()">
              {{ 'risk.filters.sorts.' + s | transloco }}
            </option>
          }
        </select>
      </ng-container>
      <div more-filters>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="mine()"
            (change)="setMine($any($event.target).checked)"
          />
          {{ 'risk.filters.mine' | transloco }}
        </label>
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
                titleKey="ui.empty.noResults"
                ctaKey="risk.filters.clear"
                ctaVariant="secondary"
                [compact]="true"
                (cta)="clearFilters()"
              />
            } @else {
              <div role="list" [attr.aria-label]="'risk.opportunities.title' | transloco">
                <app-record-row-header dateKind="due" />
                @for (o of rows(); track o.id) {
                  <app-record-row
                    [code]="o.code"
                    [title]="o.title"
                    [subtitle]="subtitle(o)"
                    [link]="['/risk/opportunities', o.id]"
                    [owner]="o.owner?.name ?? ('risk.common.unassigned' | transloco)"
                    [date]="o.due_at"
                    dateKind="due"
                    [overdue]="o.overdue"
                  >
                    <app-coverage-chip
                      coverage
                      class="max-w-full [&_[data-testid=coverage-chip]]:flex-wrap [&_[data-testid=coverage-chip]]:whitespace-normal"
                      entityType="opportunity"
                      [entityId]="o.id"
                    />
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="statusValue(o.status)"
                      [labelKey]="'risk.opportunities.status.' + o.status"
                    />
                    <app-opportunity-score badges [score]="o.score" [max]="o.max_score ?? 25" />
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
          page="opportunities"
          [showAction]="perms.canWrite()"
          (action)="newOpportunity()"
        />
      </app-card>

      <app-why-it-matters below scope="risk" page="opportunities" />
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
  protected readonly statusValue = opportunityStatusValue;

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
  private readonly revision = signal(0);
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
      selection: {
        ids: this.rows()
          .slice(0, 50)
          .map((o) => o.id),
      },
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const q = this.q();
      const status = this.status();
      const sort = this.sort();
      const mine = this.mine();
      const offset = this.offset();
      this.revision();
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

  /** Register and the open action items. */
  protected subtitle(o: Opportunity): string {
    const parts: string[] = [];
    if (o.register) {
      parts.push(o.register.name);
    }
    if (o.actions && o.actions.open > 0) {
      parts.push(
        this.language.translate('risk.opportunities.openActions', { count: o.actions.open }),
      );
    }
    return parts.join(' · ');
  }

  protected reload(): void {
    this.revision.update((n) => n + 1);
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

  protected clearFilters(): void {
    this.q.set('');
    this.setStatus('open');
    this.setMine(false);
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

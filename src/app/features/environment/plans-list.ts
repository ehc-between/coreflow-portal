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
import { formatDate } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
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
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { EnvironmentApi } from './data/environment-api';
import {
  ENTITY_PLAN,
  EmergencyPlan,
  PLAN_ATTENTION,
  PLAN_SORTS,
  PlanAttention,
  PlanListQuery,
  PlanSort,
} from './data/environment.models';
import { outcomeBadgeValue, sortKey, statusesForFilter } from './data/environment-display';
import { STATUS_FILTERS } from './aspects-list';
import {
  ENV_CRUMBS,
  ENV_FILTER_STYLES,
  ENV_MODULE,
  ENV_ROOT_CRUMB,
  injectEnvPermissions,
} from './environment-shared';

const PAGE_SIZE = 25;

export interface PlanListFilters {
  readonly status: (typeof STATUS_FILTERS)[number];
  readonly attention: PlanAttention | '';
  readonly owner: '' | 'me';
  readonly sort: PlanSort;
}

export const PLAN_DEFAULT_FILTERS: PlanListFilters = {
  status: 'open',
  attention: '',
  owner: '',
  sort: 'code',
};

function oneOf<T extends string>(
  values: readonly T[],
  value: string | null | undefined,
  fallback: T,
): T {
  const v = value ?? '';
  return (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Restores filters from a saved view or query params (`?attention=drill_overdue`). */
export function parsePlanFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): PlanListFilters {
  return {
    status: oneOf(STATUS_FILTERS, raw['status'], 'open'),
    attention: oneOf<PlanAttention | ''>(PLAN_ATTENTION, raw['attention'], ''),
    owner: raw['owner'] === 'me' ? 'me' : '',
    sort: oneOf(PLAN_SORTS, raw['sort'], 'code'),
  };
}

export function planQuery(q: string, f: PlanListFilters, offset: number): PlanListQuery {
  return {
    q: q.trim() || undefined,
    status: statusesForFilter(f.status),
    attention: f.attention || undefined,
    owner: f.owner || undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * Emergency preparedness and response plans (`/environment/emergency-plans`, ISO
 * 14001 / 45001 8.2): search, status and "needs follow-up" filters, owner and sort
 * under "Flere filtre", saved views and paging. Each row shows the plan, its site,
 * how many aspects it covers, the last drill and its outcome, an overdue drill, the
 * requirements it documents, the owner and the next drill.
 */
@Component({
  selector: 'app-env-plans-list',
  imports: [
    RouterLink,
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
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="environment.plans.title"
      descriptionKey="environment.plans.subtitle"
      scope="environment"
      page="plans"
      searchPlaceholderKey="environment.plans.searchPlaceholder"
      [breadcrumbs]="crumbs"
      [settingsLink]="perms.settingsLink()"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      @if (perms.write()) {
        <a
          primary
          routerLink="/environment/emergency-plans/new"
          tabindex="-1"
          appTourStep="env-plan-new"
          data-testid="new-plan"
        >
          <app-button>
            <app-icon name="plus" [size]="15" />
            {{ 'environment.plans.new' | transloco }}
          </app-button>
        </a>
      }

      <app-module-nav
        nav
        class="mb-4 block"
        [items]="perms.nav()"
        labelKey="modules.names.environment"
      />
      <app-help-strip
        help
        scope="environment"
        page="plans"
        tour="plans"
        lesson="emergency-preparedness"
      />

      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'environment.filters.status' | transloco"
        (change)="setFilter('status', $any($event.target).value)"
        appTourStep="env-plan-filters"
        data-testid="filter-status"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="filters().status === s">
            {{ 'environment.filters.statusOptions.' + s | transloco }}
          </option>
        }
      </select>
      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'environment.filters.attention' | transloco"
        (change)="setFilter('attention', $any($event.target).value)"
        data-testid="filter-attention"
      >
        <option value="" [selected]="!filters().attention">
          {{ 'environment.filters.attentionAny' | transloco }}
        </option>
        @for (a of attentions; track a) {
          <option [value]="a" [selected]="filters().attention === a">
            {{ 'environment.filters.planAttention.' + a | transloco }}
          </option>
        }
      </select>
      <div more-filters class="flex flex-col gap-3">
        <label class="cf-more-label">
          {{ 'environment.fields.owner' | transloco }}
          <select class="cf-filter" (change)="setFilter('owner', $any($event.target).value)">
            <option value="" [selected]="!filters().owner">
              {{ 'environment.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="filters().owner === 'me'">
              {{ 'environment.filters.mine' | transloco }}
            </option>
          </select>
        </label>
        <label class="cf-more-label">
          {{ 'environment.filters.sort' | transloco }}
          <select class="cf-filter" (change)="setFilter('sort', $any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'environment.sorts.' + sortKey(s) | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (state() === 'error') {
        <app-error-state (retry)="reload()" />
      } @else if (state() === 'loading' && items().length === 0) {
        <app-loading-state [rows]="4" />
      } @else if (items().length === 0) {
        <app-card>
          <app-empty-state
            icon="search"
            titleKey="ui.empty.noResults"
            [compact]="true"
            data-testid="no-match"
          />
          <div class="-mt-2 pb-4 text-center">
            <app-button variant="secondary" size="sm" (click)="clearFilters()">
              {{ 'environment.common.clearFilters' | transloco }}
            </app-button>
          </div>
        </app-card>
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-busy]="state() === 'loading'" data-testid="plan-rows">
            <app-record-row-header dateKind="next" />
            @for (p of items(); track p.id) {
              <app-record-row
                [code]="p.code"
                [title]="p.title"
                [subtitle]="subtitle(p)"
                [link]="['/environment/emergency-plans', p.id]"
                [owner]="p.owner_name"
                [date]="p.next_drill_due_at"
                dateKind="next"
                [overdue]="p.drill_overdue"
              >
                <app-coverage-chip coverage [entityType]="entityType" [entityId]="p.id" />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="p.status"
                  [labelKey]="'environment.status.' + p.status"
                />
                @if (p.drill_overdue) {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    value="overdue"
                    labelKey="environment.plan.drillOverdue"
                  />
                } @else if (p.last_drill_outcome) {
                  <app-status-badge
                    badges
                    meaning="compliance"
                    [value]="outcomeValue(p.last_drill_outcome)"
                    [labelKey]="'environment.outcomes.' + p.last_drill_outcome"
                  />
                }
              </app-record-row>
            }
          </div>
        </app-card>
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <div empty>
        <app-card>
          <app-teaching-empty
            scope="environment"
            page="plans"
            [showAction]="perms.write()"
            (action)="create()"
          />
        </app-card>
      </div>

      <app-why-it-matters below scope="environment" page="plans" />
    </app-record-list-page>
  `,
  styles: [ENV_FILTER_STYLES],
})
export class PlansList {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly perms = injectEnvPermissions();
  protected readonly crumbs = [ENV_ROOT_CRUMB, { labelKey: ENV_CRUMBS.plans.labelKey }];
  protected readonly entityType = ENTITY_PLAN;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly attentions = PLAN_ATTENTION;
  protected readonly sorts = PLAN_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortKey = sortKey;
  protected readonly outcomeValue = outcomeBadgeValue;

  protected readonly query = signal('');
  protected readonly filters = signal<PlanListFilters>(
    parsePlanFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly EmergencyPlan[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly moreActive = computed(
    () =>
      (['owner', 'sort'] as const).filter((k) => this.filters()[k] !== PLAN_DEFAULT_FILTERS[k])
        .length,
  );
  protected readonly isEmptyRegister = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.query() &&
      JSON.stringify(this.filters()) === JSON.stringify(PLAN_DEFAULT_FILTERS),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: ENV_MODULE,
      entityType: ENTITY_PLAN,
      view: 'list',
      title: this.language.translate('environment.plans.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = planQuery(this.query(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  /** "Verkstedet · Dekker 2 aspekter · Sist øvd 14. aug. 2026". */
  protected subtitle(p: EmergencyPlan): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts: string[] = [];
    if (p.site) {
      parts.push(p.site);
    }
    const covered = p.aspects?.length ?? 0;
    if (covered) {
      parts.push(t('environment.plan.coversCount', { count: covered }));
    }
    parts.push(
      p.last_drill_at
        ? t('environment.plan.lastDrill', {
            date: formatDate(p.last_drill_at, 'mediumDate', this.language.locale()),
          })
        : t('environment.plan.noDrillYet'),
    );
    return parts.join(' · ');
  }

  protected onSearch(text: string): void {
    this.query.set(text.trim());
    this.offset.set(0);
  }

  protected setFilter(key: keyof PlanListFilters, value: string): void {
    this.filters.set(parsePlanFilters({ ...this.filters(), [key]: value }));
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.filters.set(PLAN_DEFAULT_FILTERS);
    this.query.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.filters.set(parsePlanFilters(view.filters));
    this.offset.set(0);
  }

  protected reload(): void {
    this.load(
      this.selectedOrg.currentOrgId(),
      planQuery(this.query(), this.filters(), this.offset()),
    );
  }

  protected create(): void {
    void this.router.navigate(['/environment/emergency-plans/new']);
  }

  private load(orgId: string | null, query: PlanListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listPlans(orgId, query).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => {
        this.items.set([]);
        this.state.set('error');
      },
    });
  }
}

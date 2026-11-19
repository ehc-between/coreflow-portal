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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { pluralKey } from '../../../shared/i18n/plural';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { formatLocalDay } from '../../../shared/locale/locale-pipes';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContinuityApi } from '../data/continuity-api';
import { badge, formatDuration } from '../data/continuity-display';
import {
  CONTROLLED_STATUSES,
  ControlledStatus,
  PLAN_SORTS,
  PLAN_TYPES,
  PlanListItem,
  PlanListQuery,
  PlanSort,
  PlanType,
} from '../data/continuity.models';
import {
  CONTINUITY_NAV,
  ContinuityAskButton,
  ContinuityTargetsLegend,
  sectionCrumbs,
} from '../shared/continuity-page';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;

export interface PlanFilters {
  readonly status: ControlledStatus | '';
  readonly type: PlanType | '';
  readonly owner: 'me' | '';
  readonly reviewDue: 'yes' | '';
  readonly sort: PlanSort;
}

export const DEFAULT_PLAN_FILTERS: PlanFilters = {
  status: '',
  type: '',
  owner: '',
  reviewDue: '',
  sort: 'code',
};

const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : '';

export function planFiltersFromView(values: Readonly<Record<string, string>>): PlanFilters {
  return {
    status: pick(values['status'], CONTROLLED_STATUSES),
    type: pick(values['type'], PLAN_TYPES),
    owner: values['owner'] === 'me' ? 'me' : '',
    reviewDue: values['reviewDue'] === 'yes' ? 'yes' : '',
    sort: pick(values['sort'], PLAN_SORTS) || 'code',
  };
}

export function planQuery(q: string, f: PlanFilters, offset: number): PlanListQuery {
  return {
    q: q || undefined,
    status: f.status ? [f.status] : undefined,
    type: f.type || undefined,
    owner: f.owner || undefined,
    review_due: f.reviewDue ? true : undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

const SELECT =
  'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none';

/**
 * Continuity plans (`/continuity/plans`): search, filters on status and
 * review due (plan type, owner and sort under "More filters"), saved views and paging. Each row
 * shows the plan's recovery targets (the strictest of the BIAs it covers), the
 * requirements it documents, an ICT gap, and when it was last exercised.
 */
@Component({
  selector: 'app-plan-list',
  imports: [
    FulfilsRequirements,
    TranslocoPipe,
    Button,
    ContinuityAskButton,
    ContinuityTargetsLegend,
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
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      exportRegister="continuity_plans"
      titleKey="continuity.nav.plans"
      descriptionKey="continuity.plans.subtitle"
      scope="continuity"
      page="plans"
      [breadcrumbs]="crumbs"
      searchPlaceholderKey="continuity.plans.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="continuity.plans" />
      <app-continuity-ask-button
        secondary
        labelKey="continuity.ai.planOverview"
        promptKey="continuity.ai.prompts.planOverview"
      />
      @if (canWrite()) {
        <app-button primary appTourStep="continuity-plan-new" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'continuity.plans.new' | transloco }}
        </app-button>
      }

      <app-module-nav nav labelKey="continuity.nav.label" [items]="nav" />
      <app-help-strip help scope="continuity" page="plans" tour="plans" lesson="writing-a-plan" />

      <ng-container filters>
        <label class="sr-only" for="plan-f-status">{{
          'continuity.fields.status' | transloco
        }}</label>
        <select
          id="plan-f-status"
          appTourStep="continuity-plan-filters"
          [class]="select"
          (change)="setFilter('status', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().status">
            {{ 'continuity.filters.anyStatus' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="filters().status === s">
              {{ 'continuity.status.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="plan-f-review">{{
          'continuity.filters.show' | transloco
        }}</label>
        <select
          id="plan-f-review"
          [class]="select"
          (change)="setFilter('reviewDue', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().reviewDue">
            {{ 'continuity.filters.all' | transloco }}
          </option>
          <option value="yes" [selected]="filters().reviewDue === 'yes'">
            {{ 'continuity.filters.reviewDue' | transloco }}
          </option>
        </select>
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted" for="plan-f-type">
          {{ 'continuity.fields.planType' | transloco }}
          <select
            id="plan-f-type"
            [class]="select"
            (change)="setFilter('type', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().type">
              {{ 'continuity.filters.anyType' | transloco }}
            </option>
            @for (t of types; track t) {
              <option [value]="t" [selected]="filters().type === t">
                {{ 'continuity.planType.' + t | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted" for="plan-f-owner">
          {{ 'continuity.fields.owner' | transloco }}
          <select
            id="plan-f-owner"
            [class]="select"
            (change)="setFilter('owner', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().owner">
              {{ 'continuity.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="filters().owner === 'me'">
              {{ 'continuity.filters.ownedByMe' | transloco }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted" for="plan-f-sort">
          {{ 'continuity.filters.sort' | transloco }}
          <select
            id="plan-f-sort"
            [class]="select"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'continuity.filters.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

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
              ctaKey="continuity.filters.clear"
              ctaVariant="secondary"
              (cta)="clearFilters()"
            />
          } @else {
            <app-continuity-targets-legend class="mb-2" />
            <div
              role="list"
              class="overflow-hidden rounded-card border border-border bg-surface"
              data-testid="plan-rows"
            >
              <app-record-row-header dateKind="next" />
              @for (row of rows(); track row.id) {
                <app-record-row
                  [code]="row.code"
                  [title]="row.title"
                  [subtitle]="subtitle(row)"
                  [link]="['/continuity/plans', row.id]"
                  [owner]="row.owner?.name"
                  [date]="row.next_review_on"
                  dateKind="next"
                  [overdue]="row.review_state === 'overdue'"
                >
                  <app-coverage-chip
                    coverage
                    class="max-w-full"
                    entityType="continuity_plan"
                    [entityId]="row.id"
                  />
                  <app-status-badge
                    badges
                    [meaning]="status(row).meaning"
                    [value]="status(row).value"
                    [labelKey]="'continuity.status.' + row.status"
                  />
                  @if (row.ict_gap) {
                    <app-status-badge
                      badges
                      meaning="compliance"
                      value="not_met"
                      labelKey="continuity.plans.ictGapBadge"
                    />
                  }
                  @if (!row.last_exercised_on && row.status !== 'retired') {
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      value="due"
                      labelKey="continuity.plans.neverExercised"
                    />
                  }
                </app-record-row>
              }
            </div>
            @if (total() > pageSize) {
              <div class="mt-3">
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

      <app-teaching-empty
        empty
        scope="continuity"
        page="plans"
        [showAction]="canWrite()"
        (action)="create()"
      />
      <app-why-it-matters below scope="continuity" page="plans" />
    </app-record-list-page>
  `,
})
export class PlanList {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly nav = CONTINUITY_NAV;
  protected readonly crumbs = sectionCrumbs('plans');
  protected readonly select = SELECT;
  protected readonly statuses = CONTROLLED_STATUSES;
  protected readonly types = PLAN_TYPES;
  protected readonly sorts = PLAN_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly status = (row: PlanListItem) => badge.controlled(row.status);

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('continuity:write'),
  );

  protected readonly q = signal('');
  protected readonly filters = signal<PlanFilters>(DEFAULT_PLAN_FILTERS);
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly PlanListItem[]>([]);
  protected readonly total = signal(0);

  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  protected readonly moreActive = computed(
    () =>
      (this.filters().type ? 1 : 0) +
      (this.filters().owner ? 1 : 0) +
      (this.filters().sort !== 'code' ? 1 : 0),
  );
  private readonly isFiltered = computed(
    () => !!this.q() || Object.entries(this.filters()).some(([k, v]) => k !== 'sort' && !!v),
  );
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'continuity_plan',
      view: 'list',
      title: this.language.translate('continuity.nav.plans'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = planQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  /** "Kontinuitetsplan · RTO 4 t · 2 konsekvensanalyser · sist øvd 12. okt. 2026". */
  protected subtitle(row: PlanListItem): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [
      t('continuity.planType.' + row.plan_type),
      `${t('continuity.fields.rtoShort')} ${formatDuration(row.recovery_targets.rto_minutes, t)}`,
      t(pluralKey('continuity.plans.biaCount', row.bia_count), { count: row.bia_count }),
    ];
    if (row.last_exercised_on) {
      parts.push(
        t('continuity.plans.lastExercisedShort', {
          date: formatLocalDay(row.last_exercised_on, 'mediumDate', this.language.locale()),
        }),
      );
    }
    return parts.join(' · ');
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof PlanFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => planFiltersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(planFiltersFromView(view.filters));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.filters.set(DEFAULT_PLAN_FILTERS);
  }

  protected create(): void {
    void this.router.navigate(['/continuity/plans/new']);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), planQuery(this.q(), this.filters(), this.offset()));
  }

  private load(orgId: string | null, query: PlanListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listPlans(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

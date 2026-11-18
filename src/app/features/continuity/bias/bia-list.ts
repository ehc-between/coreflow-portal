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
  BIA_SORTS,
  BiaListItem,
  BiaListQuery,
  BiaSort,
  CONTROLLED_STATUSES,
  CRITICALITIES,
  ControlledStatus,
  Criticality,
} from '../data/continuity.models';
import {
  CONTINUITY_NAV,
  ContinuityAskButton,
  ContinuityTargetsLegend,
  sectionCrumbs,
} from '../shared/continuity-page';

const PAGE_SIZE = 25;

/** The BIA list filters kept in a saved view (all strings; '' = any). */
export interface BiaFilters {
  readonly status: ControlledStatus | '';
  readonly criticality: Criticality | '';
  readonly owner: 'me' | '';
  readonly flag: 'uncovered' | 'review_due' | '';
  readonly sort: BiaSort;
}

export const DEFAULT_BIA_FILTERS: BiaFilters = {
  status: '',
  criticality: '',
  owner: '',
  flag: '',
  sort: 'code',
};

const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : '';

export function biaFiltersFromView(values: Readonly<Record<string, string>>): BiaFilters {
  return {
    status: pick(values['status'], CONTROLLED_STATUSES),
    criticality: pick(values['criticality'], CRITICALITIES),
    owner: values['owner'] === 'me' ? 'me' : '',
    flag: pick(values['flag'], ['uncovered', 'review_due'] as const),
    sort: pick(values['sort'], BIA_SORTS) || 'code',
  };
}

export function biaQuery(q: string, f: BiaFilters, offset: number): BiaListQuery {
  return {
    q: q || undefined,
    status: f.status ? [f.status] : undefined,
    criticality: f.criticality ? [f.criticality] : undefined,
    owner: f.owner || undefined,
    uncovered: f.flag === 'uncovered' ? true : undefined,
    review_due: f.flag === 'review_due' ? true : undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

const SELECT =
  'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none';

/**
 * The business impact analyses (`/continuity/bias`): search, filters on status,
 * criticality and coverage (owner and sort under "More filters"), saved views and
 * paging. Each row shows the recovery targets, the requirements it documents, the
 * criticality, the highest impact, the status and how many plans cover it.
 */
@Component({
  selector: 'app-bia-list',
  imports: [
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
      titleKey="continuity.nav.bias"
      descriptionKey="continuity.bias.subtitle"
      scope="continuity"
      page="bias"
      [breadcrumbs]="crumbs"
      searchPlaceholderKey="continuity.bias.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <app-continuity-ask-button
        secondary
        labelKey="continuity.ai.biaOverview"
        promptKey="continuity.ai.prompts.biaOverview"
      />
      @if (canWrite()) {
        <app-button primary appTourStep="continuity-bia-new" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'continuity.bias.new' | transloco }}
        </app-button>
      }

      <app-module-nav nav labelKey="continuity.nav.label" [items]="nav" />
      <app-help-strip help scope="continuity" page="bias" tour="bias" lesson="running-a-bia" />

      <ng-container filters>
        <label class="sr-only" for="bia-f-status">{{
          'continuity.fields.status' | transloco
        }}</label>
        <select
          id="bia-f-status"
          appTourStep="continuity-bia-filters"
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
        <label class="sr-only" for="bia-f-crit">{{
          'continuity.fields.criticality' | transloco
        }}</label>
        <select
          id="bia-f-crit"
          [class]="select"
          (change)="setFilter('criticality', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().criticality">
            {{ 'continuity.filters.anyCriticality' | transloco }}
          </option>
          @for (c of criticalities; track c) {
            <option [value]="c" [selected]="filters().criticality === c">
              {{ 'continuity.criticality.' + c | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="bia-f-flag">{{ 'continuity.filters.show' | transloco }}</label>
        <select
          id="bia-f-flag"
          [class]="select"
          (change)="setFilter('flag', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().flag">
            {{ 'continuity.filters.all' | transloco }}
          </option>
          <option value="uncovered" [selected]="filters().flag === 'uncovered'">
            {{ 'continuity.filters.uncovered' | transloco }}
          </option>
          <option value="review_due" [selected]="filters().flag === 'review_due'">
            {{ 'continuity.filters.reviewDue' | transloco }}
          </option>
        </select>
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted" for="bia-f-owner">
          {{ 'continuity.fields.owner' | transloco }}
          <select
            id="bia-f-owner"
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
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted" for="bia-f-sort">
          {{ 'continuity.filters.sort' | transloco }}
          <select
            id="bia-f-sort"
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
              data-testid="bia-rows"
            >
              <app-record-row-header dateKind="next" />
              @for (row of rows(); track row.id) {
                <app-record-row
                  [code]="row.code"
                  [title]="row.title"
                  [subtitle]="targets(row)"
                  [link]="['/continuity/bias', row.id]"
                  [owner]="row.owner?.name"
                  [date]="row.next_review_on"
                  dateKind="next"
                  [overdue]="row.review_state === 'overdue'"
                >
                  <app-coverage-chip coverage entityType="bia" [entityId]="row.id" />
                  <app-status-badge
                    badges
                    [meaning]="status(row).meaning"
                    [value]="status(row).value"
                    [labelKey]="'continuity.status.' + row.status"
                  />
                  @if (row.criticality) {
                    <app-status-badge
                      badges
                      meaning="severity"
                      [value]="row.criticality"
                      [labelKey]="'continuity.criticality.' + row.criticality"
                    />
                  }
                  @if (row.plan_count === 0 && row.status !== 'retired') {
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      value="due"
                      labelKey="continuity.bias.uncovered"
                    />
                  } @else if (row.plan_count > 0) {
                    <span badges class="text-meta text-fg-muted">{{
                      planCountKey(row.plan_count) | transloco: { count: row.plan_count }
                    }}</span>
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
        page="bias"
        [showAction]="canWrite()"
        (action)="create()"
      />
      <app-why-it-matters below scope="continuity" page="bias" />
    </app-record-list-page>
  `,
})
export class BiaList {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly nav = CONTINUITY_NAV;
  protected readonly crumbs = sectionCrumbs('bias');
  protected readonly select = SELECT;
  protected readonly statuses = CONTROLLED_STATUSES;
  protected readonly criticalities = CRITICALITIES;
  protected readonly sorts = BIA_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly status = (row: BiaListItem) => badge.controlled(row.status);

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('continuity:write'),
  );

  protected readonly q = signal('');
  protected readonly filters = signal<BiaFilters>(DEFAULT_BIA_FILTERS);
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly BiaListItem[]>([]);
  protected readonly total = signal(0);

  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  protected readonly moreActive = computed(
    () => (this.filters().owner ? 1 : 0) + (this.filters().sort !== 'code' ? 1 : 0),
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
      entityType: 'bia',
      view: 'list',
      title: this.language.translate('continuity.nav.bias'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = biaQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  /** "RTO 1 d · RPO 4 t · MTPD 3 d" (the legend above the list explains them). */
  protected targets(row: BiaListItem): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return [
      `${t('continuity.fields.rtoShort')} ${formatDuration(row.rto_minutes, t)}`,
      `${t('continuity.fields.rpoShort')} ${formatDuration(row.rpo_minutes, t)}`,
      `${t('continuity.fields.mtpdShort')} ${formatDuration(row.mtpd_minutes, t)}`,
    ].join(' · ');
  }

  protected planCountKey(count: number): string {
    return pluralKey('continuity.bias.planCount', count);
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof BiaFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => biaFiltersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(biaFiltersFromView(view.filters));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.filters.set(DEFAULT_BIA_FILTERS);
  }

  protected create(): void {
    void this.router.navigate(['/continuity/bias/new']);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), biaQuery(this.q(), this.filters(), this.offset()));
  }

  private load(orgId: string | null, query: BiaListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listBias(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

import { formatNumber } from '@angular/common';
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
  ASPECT_ATTENTION,
  ASPECT_SORTS,
  Aspect,
  AspectAttention,
  AspectListQuery,
  AspectSort,
  CONDITIONS,
  Condition,
  ENTITY_ASPECT,
  IMPACT_TYPES,
  ImpactType,
  LIFECYCLE_STAGES,
  LifecycleStage,
} from './data/environment.models';
import { sortKey, statusesForFilter } from './data/environment-display';
import {
  ENV_CRUMBS,
  ENV_FILTER_STYLES,
  ENV_MODULE,
  ENV_ROOT_CRUMB,
  injectEnvPermissions,
} from './environment-shared';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;

export const STATUS_FILTERS = ['open', 'all', 'draft', 'active', 'retired'] as const;
export const SIGNIFICANCE_FILTERS = ['', 'significant', 'not_significant'] as const;

/** Filter values as stored in a saved view or the URL (`?attention=…` from the overview). */
export interface AspectListFilters {
  readonly status: (typeof STATUS_FILTERS)[number];
  readonly significance: (typeof SIGNIFICANCE_FILTERS)[number];
  readonly attention: AspectAttention | '';
  readonly impactType: ImpactType | '';
  readonly condition: Condition | '';
  readonly stage: LifecycleStage | '';
  readonly owner: '' | 'me';
  readonly process: string;
  readonly sort: AspectSort;
  /** '1': group the rows by activity. */
  readonly group: '' | '1';
}

export const ASPECT_DEFAULT_FILTERS: AspectListFilters = {
  status: 'open',
  significance: '',
  attention: '',
  impactType: '',
  condition: '',
  stage: '',
  owner: '',
  process: '',
  sort: 'code',
  group: '',
};

function oneOf<T extends string>(
  values: readonly T[],
  value: string | null | undefined,
  fallback: T,
): T {
  const v = value ?? '';
  return (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** A process id from the URL (`?process=` / `?process_id=`), or ''. */
function processParam(value: string | null | undefined): string {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : '';
}

/** Restores filters from a saved view or query params, ignoring unknown values. */
export function parseAspectFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): AspectListFilters {
  return {
    status: oneOf(STATUS_FILTERS, raw['status'], 'open'),
    significance: oneOf(SIGNIFICANCE_FILTERS, raw['significance'], ''),
    attention: oneOf<AspectAttention | ''>(ASPECT_ATTENTION, raw['attention'], ''),
    impactType: oneOf<ImpactType | ''>(IMPACT_TYPES, raw['impactType'], ''),
    condition: oneOf<Condition | ''>(CONDITIONS, raw['condition'], ''),
    stage: oneOf<LifecycleStage | ''>(LIFECYCLE_STAGES, raw['stage'], ''),
    owner: raw['owner'] === 'me' ? 'me' : '',
    process: processParam(raw['process'] ?? raw['process_id']),
    sort: oneOf(ASPECT_SORTS, raw['sort'], 'code'),
    group: raw['group'] === '1' ? '1' : '',
  };
}

/** The API query of the filters (grouping sorts by activity). */
export function aspectQuery(q: string, f: AspectListFilters, offset: number): AspectListQuery {
  return {
    q: q.trim() || undefined,
    status: statusesForFilter(f.status),
    significant: f.significance ? f.significance === 'significant' : undefined,
    attention: f.attention || undefined,
    impact_type: f.impactType || undefined,
    condition: f.condition || undefined,
    lifecycle_stage: f.stage || undefined,
    owner: f.owner || undefined,
    process_id: f.process || undefined,
    sort: f.group ? 'activity' : f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/** How many of the "Flere filtre" values differ from the defaults. */
export function moreFiltersCount(f: AspectListFilters): number {
  return (
    ['attention', 'impactType', 'condition', 'stage', 'owner', 'process', 'sort', 'group'] as const
  ).filter((k) => f[k] !== ASPECT_DEFAULT_FILTERS[k]).length;
}

/** Rows grouped by activity (in the order they came), for "Grupper etter aktivitet". */
export function groupByActivity(
  rows: readonly Aspect[],
): { readonly activity: string; readonly rows: readonly Aspect[] }[] {
  const groups = new Map<string, Aspect[]>();
  for (const row of rows) {
    const key = row.activity.trim();
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([activity, list]) => ({ activity, rows: list }));
}

/**
 * The register of environmental aspects and impacts (`/environment/aspects`, ISO
 * 14001 6.1.2). Search; status and significance filters, with "needs follow-up" and
 * the rest under "Flere filtre"; grouping by activity; saved views; paging. Each row
 * shows the aspect, its activity, the score against the threshold, significance,
 * missing controls or emergency plan, the requirements it documents, the owner
 * and the next review. Query params (`?attention=`, `?significance=`,
 * `?process=`) come from the overview and the process page.
 */
@Component({
  selector: 'app-env-aspects-list',
  imports: [
    FulfilsRequirements,
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
      titleKey="environment.aspects.title"
      descriptionKey="environment.aspects.subtitle"
      scope="environment"
      page="aspects"
      searchPlaceholderKey="environment.aspects.searchPlaceholder"
      [breadcrumbs]="crumbs"
      [settingsLink]="perms.settingsLink()"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="environment.aspects" />
      @if (perms.write()) {
        <a
          primary
          routerLink="/environment/aspects/new"
          tabindex="-1"
          appTourStep="env-aspect-new"
          data-testid="new-aspect"
        >
          <app-button>
            <app-icon name="plus" [size]="15" />
            {{ 'environment.aspects.new' | transloco }}
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
        page="aspects"
        tour="aspects"
        lesson="aspects-and-impacts"
      />

      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'environment.filters.status' | transloco"
        (change)="setFilter('status', $any($event.target).value)"
        appTourStep="env-aspect-filters"
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
        [attr.aria-label]="'environment.filters.significance' | transloco"
        (change)="setFilter('significance', $any($event.target).value)"
        data-testid="filter-significance"
      >
        @for (s of significanceFilters; track s) {
          <option [value]="s" [selected]="filters().significance === s">
            {{ 'environment.filters.significanceOptions.' + (s || 'any') | transloco }}
          </option>
        }
      </select>

      <div more-filters class="flex flex-col gap-3">
        <label class="cf-more-label">
          {{ 'environment.filters.attention' | transloco }}
          <select
            class="cf-filter"
            (change)="setFilter('attention', $any($event.target).value)"
            data-testid="filter-attention"
          >
            <option value="" [selected]="!filters().attention">
              {{ 'environment.filters.attentionAny' | transloco }}
            </option>
            @for (a of attentions; track a) {
              <option [value]="a" [selected]="filters().attention === a">
                {{ 'environment.filters.aspectAttention.' + a | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="cf-more-label">
          {{ 'environment.fields.impactType' | transloco }}
          <select
            class="cf-filter"
            (change)="setFilter('impactType', $any($event.target).value)"
            data-testid="filter-impact-type"
          >
            <option value="" [selected]="!filters().impactType">
              {{ 'environment.filters.allImpactTypes' | transloco }}
            </option>
            @for (t of impactTypes; track t) {
              <option [value]="t" [selected]="filters().impactType === t">
                {{ 'environment.impactTypes.' + t | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="cf-more-label">
          {{ 'environment.fields.condition' | transloco }}
          <select class="cf-filter" (change)="setFilter('condition', $any($event.target).value)">
            <option value="" [selected]="!filters().condition">
              {{ 'environment.filters.allConditions' | transloco }}
            </option>
            @for (c of conditions; track c) {
              <option [value]="c" [selected]="filters().condition === c">
                {{ 'environment.conditions.' + c | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="cf-more-label">
          {{ 'environment.fields.lifecycleStages' | transloco }}
          <select class="cf-filter" (change)="setFilter('stage', $any($event.target).value)">
            <option value="" [selected]="!filters().stage">
              {{ 'environment.filters.allStages' | transloco }}
            </option>
            @for (s of stages; track s) {
              <option [value]="s" [selected]="filters().stage === s">
                {{ 'environment.stages.' + s | transloco }}
              </option>
            }
          </select>
        </label>
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
          <select
            class="cf-filter"
            [disabled]="!!filters().group"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'environment.sorts.' + sortKey(s) | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="flex items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="!!filters().group"
            (change)="setFilter('group', $any($event.target).checked ? '1' : '')"
            data-testid="filter-group"
          />
          {{ 'environment.aspects.groupByActivity' | transloco }}
        </label>
      </div>

      @if (filters().process) {
        <p
          class="mb-3 flex flex-wrap items-center gap-2 text-ui text-fg-muted"
          data-testid="process-filter"
        >
          {{ 'environment.aspects.processFilter' | transloco }}
          <app-button variant="ghost" size="sm" (click)="setFilter('process', '')">
            <app-icon name="x" [size]="13" />
            {{ 'environment.common.clearFilter' | transloco }}
          </app-button>
        </p>
      }

      @if (state() === 'error') {
        <app-error-state (retry)="reload()" />
      } @else if (state() === 'loading' && items().length === 0) {
        <app-loading-state [rows]="5" />
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
          <div role="list" [attr.aria-busy]="state() === 'loading'" data-testid="aspect-rows">
            <app-record-row-header dateKind="next" />
            @for (group of groups(); track group.activity) {
              @if (filters().group) {
                <div
                  role="presentation"
                  class="border-b border-border bg-surface-2 px-4 py-2 text-meta font-semibold text-fg-muted"
                >
                  {{ group.activity }}
                  <span class="font-normal text-fg-subtle">· {{ group.rows.length }}</span>
                </div>
              }
              @for (a of group.rows; track a.id) {
                <app-record-row
                  [code]="a.code"
                  [title]="a.aspect"
                  [subtitle]="subtitle(a)"
                  [link]="['/environment/aspects', a.id]"
                  [owner]="a.owner_name"
                  [date]="a.review_due_at"
                  dateKind="next"
                  [overdue]="a.review_overdue"
                >
                  <app-coverage-chip coverage [entityType]="entityType" [entityId]="a.id" />
                  @if (a.significant) {
                    <app-status-badge
                      badges
                      meaning="severity"
                      value="medium"
                      labelKey="environment.aspect.significant"
                    />
                  }
                  @if (a.status !== 'active') {
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="a.status"
                      [labelKey]="'environment.status.' + a.status"
                    />
                  }
                  @if (a.controls_missing) {
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      value="blocked"
                      labelKey="environment.aspect.controlsMissingShort"
                    />
                  }
                  @if (a.needs_emergency_plan) {
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      value="blocked"
                      labelKey="environment.aspect.needsPlanShort"
                    />
                  }
                </app-record-row>
              }
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
            page="aspects"
            [showAction]="perms.write()"
            (action)="create()"
          />
        </app-card>
      </div>

      <app-why-it-matters below scope="environment" page="aspects" />
    </app-record-list-page>
  `,
  styles: [ENV_FILTER_STYLES],
})
export class AspectsList {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly perms = injectEnvPermissions();
  protected readonly crumbs = [ENV_ROOT_CRUMB, { labelKey: ENV_CRUMBS.aspects.labelKey }];
  protected readonly entityType = ENTITY_ASPECT;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly significanceFilters = SIGNIFICANCE_FILTERS;
  protected readonly attentions = ASPECT_ATTENTION;
  protected readonly impactTypes = IMPACT_TYPES;
  protected readonly conditions = CONDITIONS;
  protected readonly stages = LIFECYCLE_STAGES;
  protected readonly sorts = ASPECT_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortKey = sortKey;

  protected readonly query = signal('');
  protected readonly filters = signal<AspectListFilters>(
    parseAspectFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Aspect[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly moreActive = computed(() => moreFiltersCount(this.filters()));
  protected readonly groups = computed(() =>
    this.filters().group ? groupByActivity(this.items()) : [{ activity: '', rows: this.items() }],
  );
  protected readonly isEmptyRegister = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.query() &&
      JSON.stringify(this.filters()) === JSON.stringify(ASPECT_DEFAULT_FILTERS),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: ENV_MODULE,
      entityType: ENTITY_ASPECT,
      view: 'list',
      title: this.language.translate('environment.aspects.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = aspectQuery(this.query(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  /** "Vask av biler · Vann · Normal · Poeng 13 av 20 (vesentlig fra 12)". */
  protected subtitle(a: Aspect): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [
      ...(this.filters().group ? [] : [a.activity]),
      t(`environment.impactTypes.${a.impact_type}`),
      t(`environment.conditions.${a.condition}`),
    ];
    if (a.score !== null) {
      const locale = this.language.locale();
      parts.push(
        a.max_score !== undefined && a.threshold !== undefined
          ? t('environment.aspect.scoreLine', {
              score: formatNumber(a.score, locale, '1.0-2'),
              max: formatNumber(a.max_score, locale, '1.0-2'),
              threshold: formatNumber(a.threshold, locale, '1.0-2'),
            })
          : t('environment.aspect.scoreShort', { score: formatNumber(a.score, locale, '1.0-2') }),
      );
    } else {
      parts.push(t('environment.aspect.notEvaluated'));
    }
    return parts.join(' · ');
  }

  protected onSearch(text: string): void {
    this.query.set(text.trim());
    this.offset.set(0);
  }

  protected setFilter(key: keyof AspectListFilters, value: string): void {
    this.filters.set(parseAspectFilters({ ...this.filters(), [key]: value }));
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.filters.set(ASPECT_DEFAULT_FILTERS);
    this.query.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.filters.set(parseAspectFilters(view.filters));
    this.offset.set(0);
  }

  protected reload(): void {
    this.load(
      this.selectedOrg.currentOrgId(),
      aspectQuery(this.query(), this.filters(), this.offset()),
    );
  }

  protected create(): void {
    void this.router.navigate(['/environment/aspects/new']);
  }

  private load(orgId: string | null, query: AspectListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listAspects(orgId, query).subscribe({
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

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
import { Observable, Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { formatLocalDay } from '../../../shared/locale/locale-pipes';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  changeTypeBadge,
  levelBadge,
  localizedLabel,
  stateCategoryBadge,
} from '../data/asset-display';
import {
  CHANGE_CATEGORIES,
  CHANGE_SORTS,
  CHANGE_STATES,
  CHANGE_TYPES,
  ChangeCategory,
  ChangeListQuery,
  ChangeRequest,
  ChangeSort,
  ChangeState,
  ChangeType,
  LocalizedLabel,
  RISK_LEVELS,
  RiskLevel,
} from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { assetsNav } from '../shared/assets-nav';

const PAGE_SIZE = 25;

export interface ChangeFilters {
  /** A workflow state, `open` (not closed) or '' (any). */
  readonly status: ChangeState | 'open' | '';
  readonly type: ChangeType | '';
  readonly category: ChangeCategory | '';
  readonly risk: RiskLevel | '';
  readonly owner: 'me' | '';
  readonly sort: ChangeSort;
}

export const DEFAULT_CHANGE_FILTERS: ChangeFilters = {
  status: 'open',
  type: '',
  category: '',
  risk: '',
  owner: '',
  sort: '-updated_at',
};

const MORE_FILTERS: readonly (keyof ChangeFilters)[] = ['risk', 'category', 'owner'];

export function changeFiltersFromView(values: Readonly<Record<string, string>>): ChangeFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
  const status =
    values['status'] === 'open'
      ? 'open'
      : values['status'] === undefined
        ? DEFAULT_CHANGE_FILTERS.status
        : pick(values['status'], CHANGE_STATES);
  return {
    status,
    type: pick(values['type'], CHANGE_TYPES),
    category: pick(values['category'], CHANGE_CATEGORIES),
    risk: pick(values['risk'], RISK_LEVELS),
    owner: values['owner'] === 'me' ? 'me' : '',
    sort: pick(values['sort'], CHANGE_SORTS) || '-updated_at',
  };
}

export function changeQuery(q: string, f: ChangeFilters, offset: number): ChangeListQuery {
  return {
    q: q || undefined,
    open: f.status === 'open' ? true : undefined,
    status: f.status && f.status !== 'open' ? [f.status] : undefined,
    type: f.type || undefined,
    category: f.category ? [f.category] : undefined,
    risk_level: f.risk ? [f.risk] : undefined,
    owner: f.owner || undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

interface Kpi {
  readonly key: string;
  readonly labelKey: string;
  readonly value: number;
  readonly tone: KpiTone;
  readonly filter: Partial<ChangeFilters>;
}

interface Summary {
  readonly all: number;
  readonly open: number;
  readonly assessment: number;
  readonly implementing: number;
  readonly review: number;
  readonly emergency: number;
}

/**
 * Change requests (`/assets/changes`): planned changes to systems, processes,
 * products or the organisation, each going through request, impact and risk
 * assessment, approval, implementation and review (ISO 27001 A.8.32, ISO 9001 6.3 and
 * 8.5.6). Headline figures by stage double as filters. The filters only appear once
 * the first change exists, so an empty register shows the teaching empty state alone.
 */
@Component({
  selector: 'app-changes-list',
  imports: [
    TranslocoPipe,
    Button,
    Card,
    CoverageChip,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    MenuItem,
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
      titleKey="assets.changes.title"
      descriptionKey="assets.changes.subtitle"
      [breadcrumbs]="[{ labelKey: 'modules.names.assets', link: '/assets' }]"
      scope="assets"
      page="changes"
      searchPlaceholderKey="assets.changes.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      @if (canWrite()) {
        <app-button primary appTourStep="assets-change-new" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'assets.changes.new' | transloco }}
        </app-button>
      }
      @if (!ai.unavailable() && hasAny()) {
        <button appMenuItem overflow type="button" (click)="askOverview()">
          {{ 'assets.ai.changesOverview' | transloco }}
        </button>
      }

      <div nav appTourStep="assets-sections">
        <app-module-nav labelKey="modules.names.assets" [items]="nav()" />
      </div>
      <app-help-strip
        help
        scope="assets"
        page="changes"
        tour="changes"
        lesson="change-management"
      />

      <ng-container ngProjectAs="[kpis]">
        @for (k of kpis(); track k.key) {
          <button
            type="button"
            class="block h-full w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&_app-kpi-tile]:block [&_app-kpi-tile]:h-full [&_app-kpi-tile>div]:h-full"
            [class.ring-2]="kpiActive(k)"
            [class.ring-accent]="kpiActive(k)"
            [attr.aria-pressed]="kpiActive(k)"
            [attr.data-testid]="'kpi-' + k.key"
            (click)="applyKpi(k)"
          >
            <app-kpi-tile [label]="k.labelKey | transloco" [value]="k.value" [tone]="k.tone" />
          </button>
        }
      </ng-container>

      <ng-container filters>
        @if (hasAny()) {
          <label class="sr-only" for="chg-f-status">{{ 'assets.fields.status' | transloco }}</label>
          <select
            id="chg-f-status"
            [class]="selectClass"
            appTourStep="assets-change-filters"
            (change)="setFilter('status', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().status">
              {{ 'assets.filters.anyStatus' | transloco }}
            </option>
            <option value="open" [selected]="filters().status === 'open'">
              {{ 'assets.changes.openOnly' | transloco }}
            </option>
            @for (s of states; track s) {
              <option [value]="s" [selected]="filters().status === s">
                {{ 'assets.changeState.' + s | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="chg-f-type">{{
            'assets.fields.changeType' | transloco
          }}</label>
          <select
            id="chg-f-type"
            [class]="selectClass"
            (change)="setFilter('type', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().type">
              {{ 'assets.filters.anyChangeType' | transloco }}
            </option>
            @for (t of types; track t) {
              <option [value]="t" [selected]="filters().type === t">
                {{ 'assets.changeTypeShort.' + t | transloco }}
              </option>
            }
          </select>
        }
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        @if (hasAny()) {
          <label [class]="moreLabelClass">
            {{ 'assets.fields.riskLevel' | transloco }}
            <select
              id="chg-f-risk"
              [class]="moreSelectClass"
              (change)="setFilter('risk', $any($event.target).value)"
            >
              <option value="" [selected]="!filters().risk">
                {{ 'assets.filters.anyRisk' | transloco }}
              </option>
              @for (r of risks; track r) {
                <option [value]="r" [selected]="filters().risk === r">
                  {{ 'assets.criticality.' + r | transloco }}
                </option>
              }
            </select>
          </label>
          <label [class]="moreLabelClass">
            {{ 'assets.fields.changeCategory' | transloco }}
            <select
              [class]="moreSelectClass"
              (change)="setFilter('category', $any($event.target).value)"
            >
              <option value="" [selected]="!filters().category">
                {{ 'assets.filters.anyCategory' | transloco }}
              </option>
              @for (c of categories; track c) {
                <option [value]="c" [selected]="filters().category === c">
                  {{ 'assets.changeCategory.' + c | transloco }}
                </option>
              }
            </select>
          </label>
          <label [class]="moreLabelClass">
            {{ 'assets.fields.owner' | transloco }}
            <select
              [class]="moreSelectClass"
              (change)="setFilter('owner', $any($event.target).value)"
            >
              <option value="" [selected]="!filters().owner">
                {{ 'assets.filters.anyOwner' | transloco }}
              </option>
              <option value="me" [selected]="filters().owner === 'me'">
                {{ 'assets.filters.ownedByMe' | transloco }}
              </option>
            </select>
          </label>
          <label [class]="moreLabelClass">
            {{ 'assets.filters.sort' | transloco }}
            <select
              [class]="moreSelectClass"
              (change)="setFilter('sort', $any($event.target).value)"
            >
              @for (s of sorts; track s) {
                <option [value]="s" [selected]="filters().sort === s">
                  {{ 'assets.filters.changeSorts.' + s | transloco }}
                </option>
              }
            </select>
          </label>
        }
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
                bodyKey="ui.empty.noResultsBody"
                ctaKey="ui.empty.clearFilters"
                ctaVariant="secondary"
                (cta)="clearFilters()"
              />
            } @else {
              <div role="list" data-testid="change-rows">
                <app-record-row-header dateKind="date" />
                @for (row of rows(); track row.id) {
                  <app-record-row
                    [code]="row.code"
                    [title]="row.title"
                    [subtitle]="subtitle(row)"
                    [link]="['/assets/changes', row.id]"
                    [owner]="row.owner?.name"
                    [date]="row.planned_start"
                    dateKind="date"
                  >
                    <app-status-badge
                      badges
                      [meaning]="stateBadge(row.status_category).meaning"
                      [value]="stateBadge(row.status_category).value"
                      [labelKey]="'assets.changeState.' + row.status"
                    />
                    @if (row.pending_approval) {
                      <app-status-badge
                        badges
                        meaning="lifecycle"
                        value="pending_approval"
                        labelKey="assets.changes.awaitingApproval"
                      />
                    }
                    @if (row.change_type === 'emergency') {
                      <app-status-badge
                        badges
                        [meaning]="typeBadge(row.change_type).meaning"
                        [value]="typeBadge(row.change_type).value"
                        labelKey="assets.changeTypeShort.emergency"
                      />
                    }
                    @if (row.risk_level) {
                      <app-status-badge
                        badges
                        [meaning]="riskBadge(row.risk_level).meaning"
                        [value]="riskBadge(row.risk_level).value"
                        labelKey="assets.changes.riskBadge"
                        [labelParams]="{
                          level: ('assets.criticality.' + row.risk_level | transloco),
                        }"
                      />
                    }
                    <app-coverage-chip coverage entityType="change_request" [entityId]="row.id" />
                  </app-record-row>
                }
              </div>
              @if (total() > pageSize) {
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
        }
      </app-card>

      <app-why-it-matters below scope="assets" page="changes" />

      <div empty class="flex flex-col gap-4">
        <app-teaching-empty
          scope="assets"
          page="changes"
          [showAction]="canWrite()"
          (action)="create()"
        />
        <app-why-it-matters scope="assets" page="changes" />
      </div>
    </app-record-list-page>
  `,
})
export class ChangesList {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly ai = inject(AiAvailability);

  protected readonly selectClass =
    'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg';
  protected readonly moreLabelClass = 'flex flex-col gap-1 text-meta font-semibold text-fg-muted';
  protected readonly moreSelectClass =
    'h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg';
  protected readonly states = CHANGE_STATES;
  protected readonly types = CHANGE_TYPES;
  protected readonly categories = CHANGE_CATEGORIES;
  protected readonly risks = RISK_LEVELS;
  protected readonly sorts = CHANGE_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly riskBadge = levelBadge;
  protected readonly stateBadge = stateCategoryBadge;
  protected readonly typeBadge = changeTypeBadge;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('assets:write'),
  );

  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly filters = signal<ChangeFilters>(
    changeFiltersFromView(this.route.snapshot.queryParams as Record<string, string>),
  );
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly ChangeRequest[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<Summary | null>(null);

  /** Whether the organisation has any change request at all (shows filters and figures). */
  protected readonly hasAny = computed(() => (this.summary()?.all ?? 0) > 0);
  protected readonly nav = computed(() => assetsNav({ openChanges: this.summary()?.open }));
  protected readonly moreActive = computed(
    () => MORE_FILTERS.filter((key) => !!this.filters()[key]).length,
  );
  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  private readonly isFiltered = computed(() => {
    const f = this.filters();
    return (
      !!this.q() ||
      !!f.type ||
      !!f.category ||
      !!f.risk ||
      !!f.owner ||
      (!!f.status && f.status !== 'open')
    );
  });
  /** Teaching empty state: no change requests at all (open or closed). */
  protected readonly showEmpty = computed(
    () =>
      this.state() === 'ready' && this.summary() !== null && !this.hasAny() && !this.isFiltered(),
  );

  protected readonly kpis = computed<readonly Kpi[]>(() => {
    const s = this.summary();
    if (!s || s.all === 0) {
      return [];
    }
    return [
      {
        key: 'open',
        labelKey: 'assets.changes.kpiOpen',
        value: s.open,
        tone: 'neutral',
        filter: { status: 'open', type: '' },
      },
      {
        key: 'assessment',
        labelKey: 'assets.changes.kpiAssessment',
        value: s.assessment,
        tone: s.assessment ? 'warn' : 'neutral',
        filter: { status: 'assessment', type: '' },
      },
      {
        key: 'implementing',
        labelKey: 'assets.changes.kpiImplementing',
        value: s.implementing,
        tone: 'neutral',
        filter: { status: 'implementing', type: '' },
      },
      {
        key: 'review',
        labelKey: 'assets.changes.kpiReview',
        value: s.review,
        tone: s.review ? 'warn' : 'neutral',
        filter: { status: 'review', type: '' },
      },
      {
        key: 'emergency',
        labelKey: 'assets.changes.kpiEmergency',
        value: s.emergency,
        tone: s.emergency ? 'fail' : 'neutral',
        filter: { status: 'open', type: 'emergency' },
      },
    ];
  });

  private request = new Subscription();
  private summaryRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.summaryRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'assets',
      entityType: 'change_request',
      view: 'list',
      title: this.language.translate('assets.changes.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = changeQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadSummary(orgId));
    });
  }

  protected label(value: LocalizedLabel): string {
    return localizedLabel(value, this.language.active());
  }

  /** Category · type · planned start. */
  protected subtitle(row: ChangeRequest): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [
      t(`assets.changeCategory.${row.category}`),
      t(`assets.changeTypeShort.${row.change_type}`),
    ];
    if (row.planned_start) {
      parts.push(
        t('assets.changes.plannedFor', {
          date: formatLocalDay(row.planned_start, 'mediumDate', this.language.locale()),
        }),
      );
    }
    return parts.join(' · ');
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof ChangeFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => changeFiltersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(changeFiltersFromView(view.filters));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.filters.set({ ...DEFAULT_CHANGE_FILTERS, status: '', sort: this.filters().sort });
  }

  protected kpiActive(k: Kpi): boolean {
    const f = this.filters();
    return Object.entries(k.filter).every(
      ([key, value]) => f[key as keyof ChangeFilters] === value,
    );
  }

  protected applyKpi(k: Kpi): void {
    this.offset.set(0);
    const active = this.kpiActive(k);
    const base: ChangeFilters = { ...DEFAULT_CHANGE_FILTERS, sort: this.filters().sort };
    this.filters.set(active ? base : { ...base, ...k.filter });
  }

  protected create(): void {
    void this.router.navigate(['/assets/changes/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.changesOverview'));
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.load(orgId, changeQuery(this.q(), this.filters(), this.offset()));
    this.loadSummary(orgId);
  }

  private load(orgId: string | null, query: ChangeListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listChanges(orgId, query).subscribe({
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
    const count = (query: ChangeListQuery): Observable<number> =>
      this.api.listChanges(orgId, { ...query, limit: 1 }).pipe(
        map((page) => page.total),
        catchError(() => of(0)),
      );
    this.summaryRequest = forkJoin({
      all: count({}),
      open: count({ open: true }),
      assessment: count({ status: ['assessment'] }),
      implementing: count({ status: ['implementing'] }),
      review: count({ status: ['review'] }),
      emergency: count({ open: true, type: 'emergency' }),
    }).subscribe((summary) => this.summary.set(summary));
  }
}

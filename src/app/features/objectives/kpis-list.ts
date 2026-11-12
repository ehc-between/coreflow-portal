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
import { Pager } from '../../shared/ui/pager/pager';
import { AskPanelService } from '../ask/ask-panel.service';
import { ObjectivesOverviewTiles } from './components/objectives-overview';
import { ObjectivesTabs } from './components/objectives-tabs';
import { ObjectivesApi } from './data/objectives-api';
import {
  KPI_HEALTH_FILTERS,
  KPI_SORTS,
  KPI_STATUSES,
  Kpi,
  KpiHealthFilter,
  KpiListQuery,
  KpiSort,
  KpiStatus,
  MANAGEMENT_SYSTEMS,
  ManagementSystem,
  ObjectivesOverview,
} from './data/objectives.models';
import {
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  healthKey,
  healthTone,
  kpiStatusKey,
  kpiStatusTone,
  managementSystemKey,
} from './objectives-display';

const PAGE_SIZE = 25;

/** KPI status filter: `in_use` (active + paused) by default, one status, or everything. */
export type KpiStatusFilter = 'in_use' | 'all' | KpiStatus;
export const KPI_STATUS_FILTERS: readonly KpiStatusFilter[] = ['in_use', ...KPI_STATUSES, 'all'];

export function kpiStatusesForFilter(filter: KpiStatusFilter): readonly KpiStatus[] {
  if (filter === 'in_use') {
    return ['active', 'paused'];
  }
  return filter === 'all' ? [] : [filter];
}

/**
 * `/objectives/kpis`: every KPI with its latest value against target, health
 * (on track / at risk / off track), the next measurement due, and filters on
 * status, health, management system and owner.
 */
@Component({
  selector: 'app-kpis-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    GuideIntro,
    LessonView,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    ObjectivesOverviewTiles,
    ObjectivesTabs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="objectives.kpiList.title"
      [scope]="scope"
      page="kpis"
      searchPlaceholderKey="objectives.kpiList.searchPlaceholder"
      [query]="q()"
      [filters]="savedFilters()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <p intro class="mt-1.5 text-[14px] text-fg-muted">
        {{ 'objectives.kpiList.subtitle' | transloco }}
      </p>

      <ng-container toolbar>
        <app-tour-button [scope]="scope" tour="kpis" />
        <app-button variant="ghost" size="sm" (click)="askOffTarget()">
          <app-icon name="spark" [size]="14" />
          {{ 'objectives.ai.explainOffTarget' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="kpis-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'objectives.kpiList.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <label class="sr-only" for="kpi-status">{{
          'objectives.filters.status' | transloco
        }}</label>
        <select
          id="kpi-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setStatus($any($event.target).value)"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'objectives.filters.kpiStatusOptions.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="kpi-health">{{
          'objectives.filters.health' | transloco
        }}</label>
        <select
          id="kpi-health"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          appTourStep="kpis-health"
          (change)="setHealth($any($event.target).value)"
        >
          <option value="" [selected]="!health()">
            {{ 'objectives.filters.anyHealth' | transloco }}
          </option>
          @for (h of healthFilters; track h) {
            <option [value]="h" [selected]="health() === h">
              {{ 'objectives.health.' + h | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="kpi-ms">{{ 'objectives.filters.system' | transloco }}</label>
        <select
          id="kpi-ms"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setSystem($any($event.target).value)"
        >
          <option value="" [selected]="!system()">
            {{ 'objectives.filters.allSystems' | transloco }}
          </option>
          @for (m of systems; track m) {
            <option [value]="m" [selected]="system() === m">{{ systemKey(m) | transloco }}</option>
          }
        </select>
        <label class="sr-only" for="kpi-sort">{{ 'objectives.filters.sort' | transloco }}</label>
        <select
          id="kpi-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'objectives.filters.kpiSorts.' + s | transloco }}
            </option>
          }
        </select>
        <label
          class="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
        >
          <input
            type="checkbox"
            [checked]="mine()"
            (change)="setMine($any($event.target).checked)"
          />
          {{ 'objectives.filters.mine' | transloco }}
        </label>
      </ng-container>

      <div class="mb-4 flex flex-col gap-4">
        <app-objectives-tabs />
        <app-guide-intro [scope]="scope" page="kpis" />
        <app-objectives-overview [overview]="overview()" />
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'objectives.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'objectives.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (kpis().length === 0) {
              @if (isFiltered()) {
                <p class="py-10 text-center text-[14px] text-fg-muted">
                  {{ 'objectives.filters.noMatch' | transloco }}
                </p>
              } @else {
                <app-teaching-empty
                  [scope]="scope"
                  page="kpis"
                  [showAction]="canWrite()"
                  (action)="create()"
                />
              }
            } @else {
              <ul class="divide-y divide-border" data-testid="kpi-rows">
                @for (k of kpis(); track k.id) {
                  <li class="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/objectives/kpis', k.id]"
                        class="flex min-w-0 items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-subtle">{{ k.code }}</span>
                        <span class="truncate">{{ k.name }}</span>
                      </a>
                      <span
                        class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        @if (k.objective; as obj) {
                          <span class="inline-flex items-center gap-1">
                            <app-icon name="flag" [size]="12" />
                            <span class="font-mono">{{ obj.code }}</span>
                            {{ obj.title }}
                          </span>
                        }
                        <span>{{ 'objectives.frequency.' + k.frequency | transloco }}</span>
                        <span>{{
                          k.owner?.name ?? ('objectives.common.noOwner' | transloco)
                        }}</span>
                      </span>
                    </div>
                    <div class="text-[13px] text-fg md:w-[180px] md:text-right">
                      @if (k.last_value !== null) {
                        <span class="font-semibold">{{ k.last_value | localNumber: '1.0-2' }}</span>
                        {{ k.unit }}
                      } @else {
                        <span class="text-fg-muted">{{
                          'objectives.common.noValue' | transloco
                        }}</span>
                      }
                      @if (k.target_value !== null) {
                        <span class="block text-[12px] text-fg-subtle">
                          {{
                            'objectives.kpiList.target'
                              | transloco
                                : {
                                    value: (k.target_value | localNumber: '1.0-2'),
                                    unit: k.unit ?? '',
                                  }
                          }}
                        </span>
                      }
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      @if (k.status !== 'active') {
                        <app-badge [tone]="statusTone(k.status)">
                          {{ statusKey(k.status) | transloco }}
                        </app-badge>
                      }
                      <app-badge [tone]="healthTone(k.last_status)">
                        {{ healthKey(k.last_status) | transloco }}
                      </app-badge>
                      <span
                        class="inline-flex min-w-[110px] items-center justify-end gap-1"
                        [class.text-fail]="k.measurement_overdue"
                        [class.font-semibold]="k.measurement_overdue"
                      >
                        @if (k.measurement_overdue) {
                          <app-icon name="alert" [size]="13" />
                          <span class="sr-only">
                            {{ 'objectives.kpi.measurementOverdue' | transloco }}
                          </span>
                        }
                        @if (k.next_due_date) {
                          {{ 'objectives.kpiList.nextDue' | transloco }}
                          {{ k.next_due_date | localDay }}
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
                  [count]="kpis().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>
    </app-record-list-page>

    <div class="mx-auto -mt-6 flex max-w-[1180px] flex-col gap-4 px-4 pb-12 sm:px-8">
      <app-why-it-matters [scope]="scope" page="kpis" />
      <details class="rounded-card border border-border bg-surface p-4">
        <summary class="cursor-pointer text-[13.5px] font-semibold text-fg">
          {{ 'objectives.lessons.goodKpis' | transloco }}
        </summary>
        <div class="mt-3">
          <app-lesson [scope]="scope" lesson="good-kpis" />
        </div>
      </details>
    </div>
  `,
})
export class KpisList {
  private readonly api = inject(ObjectivesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly scope = OBJECTIVES_SCOPE;
  protected readonly statusFilters = KPI_STATUS_FILTERS;
  protected readonly healthFilters = KPI_HEALTH_FILTERS;
  protected readonly systems = MANAGEMENT_SYSTEMS;
  protected readonly sorts = KPI_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = kpiStatusKey;
  protected readonly statusTone = kpiStatusTone;
  protected readonly healthKey = healthKey;
  protected readonly healthTone = healthTone;
  protected readonly systemKey = managementSystemKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('objectives:write'),
  );

  protected readonly q = signal('');
  protected readonly status = signal<KpiStatusFilter>('in_use');
  protected readonly health = signal<KpiHealthFilter | ''>('');
  protected readonly system = signal<ManagementSystem | ''>('');
  protected readonly sort = signal<KpiSort>('code');
  protected readonly mine = signal(false);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly kpis = signal<readonly Kpi[]>([]);
  protected readonly total = signal(0);
  protected readonly overview = signal<ObjectivesOverview | null>(null);

  protected readonly isFiltered = computed(
    () =>
      !!this.q() || this.status() !== 'in_use' || !!this.health() || !!this.system() || this.mine(),
  );
  protected readonly savedFilters = computed<Record<string, string>>(() => ({
    status: this.status(),
    health: this.health(),
    system: this.system(),
    sort: this.sort(),
    mine: this.mine() ? '1' : '',
  }));

  private request = new Subscription();
  private overviewRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.overviewRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'kpi',
      view: 'list',
      title: this.language.translate('objectives.kpiList.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const system = this.system() || undefined;
      untracked(() => {
        this.overviewRequest.unsubscribe();
        if (orgId) {
          this.overviewRequest = this.api.overview(orgId, system).subscribe({
            next: (o) => this.overview.set(o),
            error: () => this.overview.set(null),
          });
        }
      });
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const health = this.health();
      const query: KpiListQuery = {
        q: this.q() || undefined,
        status: kpiStatusesForFilter(this.status()),
        last_status: health ? [health] : undefined,
        management_system: this.system() || undefined,
        owner: this.mine() ? 'me' : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: KpiStatusFilter): void {
    this.offset.set(0);
    this.status.set(value);
  }

  protected setHealth(value: KpiHealthFilter | ''): void {
    this.offset.set(0);
    this.health.set(value);
  }

  protected setSystem(value: ManagementSystem | ''): void {
    this.offset.set(0);
    this.system.set(value);
  }

  protected setSort(value: KpiSort): void {
    this.offset.set(0);
    this.sort.set(value);
  }

  protected setMine(value: boolean): void {
    this.offset.set(0);
    this.mine.set(value);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.status.set(
      KPI_STATUS_FILTERS.includes(f['status'] as KpiStatusFilter)
        ? (f['status'] as KpiStatusFilter)
        : 'in_use',
    );
    this.health.set(
      KPI_HEALTH_FILTERS.includes(f['health'] as KpiHealthFilter)
        ? (f['health'] as KpiHealthFilter)
        : '',
    );
    this.system.set(
      MANAGEMENT_SYSTEMS.includes(f['system'] as ManagementSystem)
        ? (f['system'] as ManagementSystem)
        : '',
    );
    this.sort.set(KPI_SORTS.includes(f['sort'] as KpiSort) ? (f['sort'] as KpiSort) : 'code');
    this.mine.set(f['mine'] === '1');
  }

  protected create(): void {
    void this.router.navigate(['/objectives/kpis/new']);
  }

  protected askOffTarget(): void {
    this.ask.showWith(this.language.translate('objectives.ai.prompts.explainOffTarget'));
  }

  private load(orgId: string | null, query: KpiListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listKpis(orgId, query).subscribe({
      next: (page) => {
        this.kpis.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

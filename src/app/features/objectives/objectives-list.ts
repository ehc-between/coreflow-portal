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
import { AskPanelService } from '../ask/ask-panel.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { ObjectivesOverviewTiles } from './components/objectives-overview';
import { ObjectivesTabs } from './components/objectives-tabs';
import { ObjectivesApi } from './data/objectives-api';
import {
  MANAGEMENT_SYSTEMS,
  ManagementSystem,
  OBJECTIVE_SORTS,
  OBJECTIVE_STATUSES,
  Objective,
  ObjectiveSort,
  ObjectiveStatus,
  ObjectivesOverview,
} from './data/objectives.models';
import {
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  managementSystemKey,
  objectiveStatusKey,
  objectiveStatusTone,
} from './objectives-display';

const PAGE_SIZE = 25;

/** Status filter of the list: open work by default, or one status, or everything. */
export type ObjectiveStatusFilter = 'open' | 'all' | ObjectiveStatus;
export const OBJECTIVE_STATUS_FILTERS: readonly ObjectiveStatusFilter[] = [
  'open',
  ...OBJECTIVE_STATUSES,
  'all',
];

export function statusesForFilter(filter: ObjectiveStatusFilter): readonly ObjectiveStatus[] {
  if (filter === 'open') {
    return ['draft', 'active'];
  }
  return filter === 'all' ? [] : [filter];
}

/**
 * `/objectives`: the objectives register with headline tiles, search, filters
 * (status, management system, mine, overdue), sorting, saved views and paging.
 */
@Component({
  selector: 'app-objectives-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    ProgressBar,
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
      titleKey="objectives.list.title"
      [scope]="scope"
      searchPlaceholderKey="objectives.list.searchPlaceholder"
      [query]="q()"
      [filters]="savedFilters()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1.5 flex flex-col gap-3">
        <p class="text-[14px] text-fg-muted">{{ 'objectives.list.subtitle' | transloco }}</p>
      </div>

      <ng-container toolbar>
        <app-tour-button [scope]="scope" tour="list" />
        <app-button variant="ghost" size="sm" (click)="askStatus()">
          <app-icon name="spark" [size]="14" />
          {{ 'objectives.ai.summariseAll' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="objectives-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'objectives.list.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <label class="sr-only" for="obj-status">{{
          'objectives.filters.status' | transloco
        }}</label>
        <select
          id="obj-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          appTourStep="objectives-filters"
          (change)="setStatus($any($event.target).value)"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'objectives.filters.statusOptions.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="obj-ms">{{ 'objectives.filters.system' | transloco }}</label>
        <select
          id="obj-ms"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setSystem($any($event.target).value)"
        >
          <option value="" [selected]="!system()">
            {{ 'objectives.filters.allSystems' | transloco }}
          </option>
          @for (m of systems; track m) {
            <option [value]="m" [selected]="system() === m">
              {{ systemKey(m) | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="obj-sort">{{ 'objectives.filters.sort' | transloco }}</label>
        <select
          id="obj-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'objectives.filters.objectiveSorts.' + s | transloco }}
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
        <label
          class="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
        >
          <input
            type="checkbox"
            [checked]="overdue()"
            (change)="setOverdue($any($event.target).checked)"
          />
          {{ 'objectives.filters.overdue' | transloco }}
        </label>
      </ng-container>

      <div class="mb-4 flex flex-col gap-4">
        <app-objectives-tabs />
        <app-guide-intro [scope]="scope" page="list" />
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
            @if (objectives().length === 0) {
              @if (isFiltered()) {
                <p class="py-10 text-center text-[14px] text-fg-muted">
                  {{ 'objectives.filters.noMatch' | transloco }}
                </p>
              } @else {
                <app-teaching-empty
                  [scope]="scope"
                  page="list"
                  [showAction]="canWrite()"
                  (action)="create()"
                />
              }
            } @else {
              <ul class="divide-y divide-border" data-testid="objectives-rows">
                @for (o of objectives(); track o.id) {
                  <li
                    class="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4"
                    [class.bg-fail-soft]="o.overdue"
                  >
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/objectives', o.id]"
                        class="flex min-w-0 items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-subtle">{{ o.code }}</span>
                        <span class="truncate">{{ o.title }}</span>
                      </a>
                      <span
                        class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        @if (o.management_system) {
                          <span>{{ systemKey(o.management_system) | transloco }}</span>
                        }
                        <span>{{
                          o.owner?.name ?? ('objectives.common.noOwner' | transloco)
                        }}</span>
                        <span>
                          {{
                            'objectives.list.kpiSummary'
                              | transloco
                                : {
                                    total: o.kpis.total,
                                    onTrack: o.kpis.on_track,
                                    off: o.kpis.at_risk + o.kpis.off_track,
                                  }
                          }}
                        </span>
                      </span>
                    </div>
                    <div class="w-full md:w-[140px]">
                      <app-progress-bar
                        [value]="o.progress ?? 0"
                        [label]="'objectives.list.progress' | transloco: { value: o.progress ?? 0 }"
                      />
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="statusTone(o.status)">
                        {{ statusKey(o.status) | transloco }}
                      </app-badge>
                      <span
                        class="inline-flex min-w-[100px] items-center justify-end gap-1"
                        [class.text-fail]="o.overdue"
                        [class.font-semibold]="o.overdue"
                      >
                        @if (o.overdue) {
                          <app-icon name="alert" [size]="13" />
                          <span class="sr-only">{{ 'objectives.common.overdue' | transloco }}</span>
                        }
                        @if (o.due_date) {
                          {{ o.due_date | localDay }}
                        } @else {
                          {{ 'objectives.common.noDueDate' | transloco }}
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
                  [count]="objectives().length"
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
      <app-why-it-matters [scope]="scope" page="list" />
      <details class="rounded-card border border-border bg-surface p-4">
        <summary class="cursor-pointer text-[13.5px] font-semibold text-fg">
          {{ 'objectives.lessons.smartObjectives' | transloco }}
        </summary>
        <div class="mt-3">
          <app-lesson [scope]="scope" lesson="smart-objectives" />
        </div>
      </details>
    </div>
  `,
})
export class ObjectivesList {
  private readonly api = inject(ObjectivesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly scope = OBJECTIVES_SCOPE;
  protected readonly statusFilters = OBJECTIVE_STATUS_FILTERS;
  protected readonly systems = MANAGEMENT_SYSTEMS;
  protected readonly sorts = OBJECTIVE_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = objectiveStatusKey;
  protected readonly statusTone = objectiveStatusTone;
  protected readonly systemKey = managementSystemKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('objectives:write'),
  );

  protected readonly q = signal('');
  protected readonly status = signal<ObjectiveStatusFilter>('open');
  protected readonly system = signal<ManagementSystem | ''>('');
  protected readonly sort = signal<ObjectiveSort>('due_date');
  protected readonly mine = signal(false);
  protected readonly overdue = signal(false);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly objectives = signal<readonly Objective[]>([]);
  protected readonly total = signal(0);
  protected readonly overview = signal<ObjectivesOverview | null>(null);

  protected readonly isFiltered = computed(
    () =>
      !!this.q() || this.status() !== 'open' || !!this.system() || this.mine() || this.overdue(),
  );
  protected readonly savedFilters = computed<Record<string, string>>(() => ({
    status: this.status(),
    system: this.system(),
    sort: this.sort(),
    mine: this.mine() ? '1' : '',
    overdue: this.overdue() ? '1' : '',
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
      entityType: 'objective',
      view: 'list',
      title: this.language.translate('objectives.list.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const system = this.system() || undefined;
      untracked(() => this.loadOverview(orgId, system));
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = {
        q: this.q() || undefined,
        status: statusesForFilter(this.status()),
        management_system: this.system() || undefined,
        owner: this.mine() ? 'me' : undefined,
        overdue: this.overdue() || undefined,
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

  protected setStatus(value: ObjectiveStatusFilter): void {
    this.offset.set(0);
    this.status.set(value);
  }

  protected setSystem(value: ManagementSystem | ''): void {
    this.offset.set(0);
    this.system.set(value);
  }

  protected setSort(value: ObjectiveSort): void {
    this.offset.set(0);
    this.sort.set(value);
  }

  protected setMine(value: boolean): void {
    this.offset.set(0);
    this.mine.set(value);
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.status.set(
      OBJECTIVE_STATUS_FILTERS.includes(f['status'] as ObjectiveStatusFilter)
        ? (f['status'] as ObjectiveStatusFilter)
        : 'open',
    );
    this.system.set(
      MANAGEMENT_SYSTEMS.includes(f['system'] as ManagementSystem)
        ? (f['system'] as ManagementSystem)
        : '',
    );
    this.sort.set(
      OBJECTIVE_SORTS.includes(f['sort'] as ObjectiveSort)
        ? (f['sort'] as ObjectiveSort)
        : 'due_date',
    );
    this.mine.set(f['mine'] === '1');
    this.overdue.set(f['overdue'] === '1');
  }

  protected create(): void {
    void this.router.navigate(['/objectives/new']);
  }

  protected askStatus(): void {
    this.ask.showWith(this.language.translate('objectives.ai.prompts.summariseAll'));
  }

  private loadOverview(orgId: string | null, system: ManagementSystem | undefined): void {
    this.overviewRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.overviewRequest = this.api.overview(orgId, system).subscribe({
      next: (overview) => this.overview.set(overview),
      error: () => this.overview.set(null),
    });
  }

  private load(orgId: string | null, query: Parameters<ObjectivesApi['list']>[1]): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, query).subscribe({
      next: (page) => {
        this.objectives.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

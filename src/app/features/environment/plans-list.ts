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
import { EnvironmentApi } from './data/environment-api';
import {
  EmergencyPlan,
  PERM_WRITE,
  PLAN_SORTS,
  PlanListQuery,
  PlanSort,
} from './data/environment.models';
import { outcomeTone, sortKey, statusTone, statusesForFilter } from './data/environment-display';
import { STATUS_FILTERS } from './aspects-list';
import { EnvironmentTabs } from './environment-tabs';
import { EnvLessonLink } from './lesson-link';

const PAGE_SIZE = 25;

/**
 * Emergency preparedness and response plans (`/environment/emergency-plans`,
 * ISO 14001 8.2 / ISO 45001 8.2): search, status and owner filters, sorting,
 * saved views; each row shows the last drill and whether a drill is overdue.
 */
@Component({
  selector: 'app-env-plans-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    GuideIntro,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    EnvironmentTabs,
    EnvLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-environment-tabs />
    <app-record-list-page
      titleKey="environment.plans.title"
      scope="environment"
      page="plans"
      searchPlaceholderKey="environment.plans.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <p class="text-[14px] text-fg-muted">{{ 'environment.plans.subtitle' | transloco }}</p>
        <app-guide-intro scope="environment" page="plans" />
      </div>

      <app-tour-button toolbar scope="environment" tour="plans" />
      @if (canWrite()) {
        <app-button
          toolbar
          size="sm"
          (click)="newPlan()"
          appTourStep="env-plan-new"
          data-testid="new-plan"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'environment.plans.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-env-p-status">
        {{ 'environment.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-env-p-status"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setStatus($any($event.target).value)"
        appTourStep="env-plan-filters"
        data-testid="filter-status"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ 'environment.filters.statusOptions.' + s | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-env-p-owner">
        {{ 'environment.fields.owner' | transloco }}
      </label>
      <select
        filters
        id="cf-env-p-owner"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setOwner($any($event.target).value)"
      >
        <option value="" [selected]="!owner()">
          {{ 'environment.filters.anyOwner' | transloco }}
        </option>
        <option value="me" [selected]="owner() === 'me'">
          {{ 'environment.filters.mine' | transloco }}
        </option>
      </select>
      <label filters class="sr-only" for="cf-env-p-sort">
        {{ 'environment.filters.sort' | transloco }}
      </label>
      <select
        filters
        id="cf-env-p-sort"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setSort($any($event.target).value)"
      >
        @for (s of sorts; track s) {
          <option [value]="s" [selected]="sort() === s">
            {{ 'environment.sorts.' + sortKey(s) | transloco }}
          </option>
        }
      </select>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'environment.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'environment.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'environment.common.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="plan-rows">
                @for (p of rows(); track p.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/environment/emergency-plans', p.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                          p.code
                        }}</span>
                        <span class="truncate">{{ p.title }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        @if (p.site) {
                          <span>{{ p.site }}</span>
                        }
                        @if (p.owner_name) {
                          <span>{{
                            'environment.common.ownerName' | transloco: { name: p.owner_name }
                          }}</span>
                        }
                        <span>{{
                          'environment.plan.drillCount' | transloco: { count: p.drill_count }
                        }}</span>
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="tone(p.status)">{{
                        'environment.status.' + p.status | transloco
                      }}</app-badge>
                      @if (p.last_drill_outcome) {
                        <app-badge [tone]="outcome(p.last_drill_outcome)">{{
                          'environment.outcomes.' + p.last_drill_outcome | transloco
                        }}</app-badge>
                      }
                      @if (p.drill_overdue) {
                        <span class="inline-flex items-center gap-1 font-semibold text-fail">
                          <app-icon name="alert" [size]="13" />
                          {{ 'environment.plan.drillOverdue' | transloco }}
                        </span>
                      } @else if (p.last_drill_at) {
                        <span>{{
                          'environment.plan.lastDrill'
                            | transloco: { date: (p.last_drill_at | localDay) }
                        }}</span>
                      } @else {
                        <span>{{ 'environment.plan.noDrillYet' | transloco }}</span>
                      }
                    </span>
                  </li>
                }
              </ul>
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
      </app-card>

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="environment" page="plans" />
        <app-env-lesson-link lesson="emergency-preparedness" />
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="environment"
            page="plans"
            [showAction]="canWrite()"
            (action)="newPlan()"
          />
        </app-card>
        <app-why-it-matters scope="environment" page="plans" />
        <app-env-lesson-link lesson="emergency-preparedness" />
      </div>
    </app-record-list-page>
  `,
})
export class PlansList {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly sorts = PLAN_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortKey = sortKey;
  protected readonly tone = statusTone;
  protected readonly outcome = outcomeTone;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<string>('open');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly sort = signal<PlanSort>('-updated_at');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly EmergencyPlan[]>([]);
  protected readonly total = signal(0);

  protected readonly showEmpty = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.q() &&
      this.status() === 'open' &&
      !this.owner(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    owner: this.owner(),
    sort: this.sort(),
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'environment',
      entityType: 'emergency_plan',
      view: 'list',
      title: this.language.translate('environment.plans.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: PlanListQuery = {
        q: this.q() || undefined,
        status: statusesForFilter(this.status()),
        owner: this.owner() || undefined,
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

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set((STATUS_FILTERS as readonly string[]).includes(value) ? value : 'open');
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (PLAN_SORTS as readonly string[]).includes(value) ? (value as PlanSort) : '-updated_at',
    );
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.setStatus(f['status'] ?? 'open');
    this.setOwner(f['owner'] ?? '');
    this.setSort(f['sort'] ?? '-updated_at');
  }

  protected newPlan(): void {
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
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

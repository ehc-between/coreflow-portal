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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { ContinuityApi } from '../data/continuity-api';
import { controlledStatusTone, reviewStateTone } from '../data/continuity-display';
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
import { ContinuityNav } from '../shared/continuity-nav';
import { ContinuityDuration } from '../shared/duration';

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

/**
 * Continuity plans (`/continuity/plans`): search, filters on status, plan type,
 * owner and review due, saved views, sort and paging. Each row shows the plan's
 * recovery targets (the strictest of the BIAs it covers) and when it was last
 * exercised.
 */
@Component({
  selector: 'app-plan-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    ContinuityDuration,
    ContinuityNav,
    GuideIntro,
    Icon,
    LessonView,
    Pager,
    RecordListPage,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="continuity.plans.title"
      scope="continuity"
      page="plans"
      searchPlaceholderKey="continuity.plans.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <p class="mt-1 text-[14px] text-fg-muted">{{ 'continuity.plans.subtitle' | transloco }}</p>
        <app-continuity-nav />
      </div>

      <ng-container toolbar>
        <app-tour-button scope="continuity" tour="plans" />
        <app-button variant="ghost" size="sm" (click)="askOverview()">
          <app-icon name="spark" [size]="14" />
          {{ 'continuity.ai.planOverview' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="continuity-plan-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'continuity.plans.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <div class="flex flex-wrap items-center gap-2" appTourStep="continuity-plan-filters">
          <label class="sr-only" for="plan-f-status">{{
            'continuity.fields.status' | transloco
          }}</label>
          <select
            id="plan-f-status"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <label class="sr-only" for="plan-f-type">{{
            'continuity.fields.planType' | transloco
          }}</label>
          <select
            id="plan-f-type"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <label class="sr-only" for="plan-f-review">{{
            'continuity.filters.show' | transloco
          }}</label>
          <select
            id="plan-f-review"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('reviewDue', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().reviewDue">
              {{ 'continuity.filters.all' | transloco }}
            </option>
            <option value="yes" [selected]="filters().reviewDue === 'yes'">
              {{ 'continuity.filters.reviewDue' | transloco }}
            </option>
          </select>
          <label class="sr-only" for="plan-f-owner">{{
            'continuity.fields.owner' | transloco
          }}</label>
          <select
            id="plan-f-owner"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('owner', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().owner">
              {{ 'continuity.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="filters().owner === 'me'">
              {{ 'continuity.filters.ownedByMe' | transloco }}
            </option>
          </select>
          <label class="sr-only" for="plan-f-sort">{{
            'continuity.filters.sort' | transloco
          }}</label>
          <select
            id="plan-f-sort"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'continuity.filters.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
      </ng-container>

      <div class="mb-4 flex flex-col gap-3">
        <app-guide-intro scope="continuity" page="plans" />
        <div><app-lesson scope="continuity" lesson="writing-a-plan" /></div>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'continuity.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'continuity.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'continuity.filters.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="plan-rows">
                @for (row of rows(); track row.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/continuity/plans', row.id]"
                        class="flex items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                        <span class="truncate">{{ row.title }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{ 'continuity.planType.' + row.plan_type | transloco }}</span>
                        <span>
                          {{ 'continuity.fields.rtoShort' | transloco }}:
                          <app-continuity-duration [minutes]="row.recovery_targets.rto_minutes" />
                        </span>
                        <span>{{
                          'continuity.plans.biaCount' | transloco: { count: row.bia_count }
                        }}</span>
                        @if (row.location) {
                          <span>{{ row.location }}</span>
                        }
                        @if (row.owner?.name; as owner) {
                          <span>{{
                            'continuity.common.ownedBy' | transloco: { name: owner }
                          }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="statusTone(row.status)">
                        {{ 'continuity.status.' + row.status | transloco }}
                      </app-badge>
                      <span>{{
                        'continuity.control.version' | transloco: { version: row.version }
                      }}</span>
                      @if (row.last_exercised_on) {
                        <span>
                          {{
                            'continuity.plans.lastExercised'
                              | transloco: { date: (row.last_exercised_on | localDay) }
                          }}
                        </span>
                      } @else {
                        <app-badge tone="warn">{{
                          'continuity.plans.neverExercised' | transloco
                        }}</app-badge>
                      }
                      @if (row.review_state === 'overdue' || row.review_state === 'due_soon') {
                        <app-badge [tone]="reviewTone(row.review_state)">
                          {{ 'continuity.reviewState.' + row.review_state | transloco }}
                        </app-badge>
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

      <div class="mt-6">
        <app-why-it-matters scope="continuity" page="plans" />
      </div>

      <div empty class="flex flex-col gap-4">
        <app-guide-intro scope="continuity" page="plans" />
        <app-teaching-empty
          scope="continuity"
          page="plans"
          [showAction]="canWrite()"
          (action)="create()"
        />
        <app-why-it-matters scope="continuity" page="plans" />
      </div>
    </app-record-list-page>
  `,
})
export class PlanList {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly statuses = CONTROLLED_STATUSES;
  protected readonly types = PLAN_TYPES;
  protected readonly sorts = PLAN_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusTone = controlledStatusTone;
  protected readonly reviewTone = reviewStateTone;

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
      title: this.language.translate('continuity.plans.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = planQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
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

  protected create(): void {
    void this.router.navigate(['/continuity/plans/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.planOverview'));
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

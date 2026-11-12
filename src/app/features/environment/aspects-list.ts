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
import { LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { EnvironmentApi } from './data/environment-api';
import {
  ASPECT_SORTS,
  Aspect,
  AspectListQuery,
  AspectSort,
  CONDITIONS,
  Condition,
  IMPACT_TYPES,
  ImpactType,
  LIFECYCLE_STAGES,
  LifecycleStage,
  PERM_WRITE,
} from './data/environment.models';
import { sortKey, statusTone, statusesForFilter } from './data/environment-display';
import { EnvironmentTabs } from './environment-tabs';
import { EnvLessonLink } from './lesson-link';

const PAGE_SIZE = 25;

export const STATUS_FILTERS = ['open', 'all', 'draft', 'active', 'retired'] as const;
export const SIGNIFICANCE_FILTERS = ['', 'significant', 'not_significant'] as const;

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * The aspects and impacts register (`/environment/aspects`, ISO 14001 6.1.2):
 * search, filters on status, significance, impact type, condition, lifecycle
 * stage and owner, sorting, saved views and paging.
 */
@Component({
  selector: 'app-env-aspects-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
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
      titleKey="environment.aspects.title"
      scope="environment"
      page="aspects"
      searchPlaceholderKey="environment.aspects.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <p class="text-[14px] text-fg-muted">{{ 'environment.aspects.subtitle' | transloco }}</p>
        <app-guide-intro scope="environment" page="aspects" />
      </div>

      <app-tour-button toolbar scope="environment" tour="aspects" />
      @if (canWrite()) {
        <app-button
          toolbar
          size="sm"
          (click)="newAspect()"
          appTourStep="env-aspect-new"
          data-testid="new-aspect"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'environment.aspects.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-env-a-status">
        {{ 'environment.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-env-a-status"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setStatus($any($event.target).value)"
        appTourStep="env-aspect-filters"
        data-testid="filter-status"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ 'environment.filters.statusOptions.' + s | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-env-a-sig">
        {{ 'environment.filters.significance' | transloco }}
      </label>
      <select
        filters
        id="cf-env-a-sig"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setSignificance($any($event.target).value)"
        data-testid="filter-significance"
      >
        @for (s of significanceFilters; track s) {
          <option [value]="s" [selected]="significance() === s">
            {{ 'environment.filters.significanceOptions.' + (s || 'any') | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-env-a-type">
        {{ 'environment.fields.impactType' | transloco }}
      </label>
      <select
        filters
        id="cf-env-a-type"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setImpactType($any($event.target).value)"
        data-testid="filter-impact-type"
      >
        <option value="" [selected]="!impactType()">
          {{ 'environment.filters.allImpactTypes' | transloco }}
        </option>
        @for (t of impactTypes; track t) {
          <option [value]="t" [selected]="impactType() === t">
            {{ 'environment.impactTypes.' + t | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-env-a-cond">
        {{ 'environment.fields.condition' | transloco }}
      </label>
      <select
        filters
        id="cf-env-a-cond"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setCondition($any($event.target).value)"
      >
        <option value="" [selected]="!condition()">
          {{ 'environment.filters.allConditions' | transloco }}
        </option>
        @for (c of conditions; track c) {
          <option [value]="c" [selected]="condition() === c">
            {{ 'environment.conditions.' + c | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-env-a-stage">
        {{ 'environment.fields.lifecycleStages' | transloco }}
      </label>
      <select
        filters
        id="cf-env-a-stage"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setStage($any($event.target).value)"
      >
        <option value="" [selected]="!stage()">
          {{ 'environment.filters.allStages' | transloco }}
        </option>
        @for (s of stages; track s) {
          <option [value]="s" [selected]="stage() === s">
            {{ 'environment.stages.' + s | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-env-a-owner">
        {{ 'environment.fields.owner' | transloco }}
      </label>
      <select
        filters
        id="cf-env-a-owner"
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
      <label filters class="sr-only" for="cf-env-a-sort">
        {{ 'environment.filters.sort' | transloco }}
      </label>
      <select
        filters
        id="cf-env-a-sort"
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
              <ul class="divide-y divide-border" data-testid="aspect-rows">
                @for (a of rows(); track a.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/environment/aspects', a.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                          a.code
                        }}</span>
                        <span class="truncate">{{ a.aspect }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span class="truncate">{{ a.activity }}</span>
                        <span>{{ 'environment.impactTypes.' + a.impact_type | transloco }}</span>
                        <span>{{ 'environment.conditions.' + a.condition | transloco }}</span>
                        @if (a.site) {
                          <span>{{ a.site }}</span>
                        }
                        @if (a.owner_name) {
                          <span>{{
                            'environment.common.ownerName' | transloco: { name: a.owner_name }
                          }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      @if (a.score !== null) {
                        <span class="font-semibold text-fg">
                          {{
                            'environment.aspect.scoreShort'
                              | transloco: { score: (a.score | localNumber: '1.0-2') }
                          }}
                        </span>
                      } @else {
                        <span>{{ 'environment.aspect.notEvaluated' | transloco }}</span>
                      }
                      @if (a.significant) {
                        <app-badge tone="warn">
                          <app-icon name="flag" [size]="12" />
                          {{ 'environment.aspect.significant' | transloco }}
                        </app-badge>
                      }
                      <app-badge [tone]="tone(a.status)">{{
                        'environment.status.' + a.status | transloco
                      }}</app-badge>
                      @if (a.review_due_at) {
                        <span
                          class="inline-flex items-center gap-1"
                          [class.text-fail]="a.review_overdue"
                          [class.font-semibold]="a.review_overdue"
                        >
                          @if (a.review_overdue) {
                            <app-icon name="alert" [size]="13" />
                          }
                          {{
                            (a.review_overdue
                              ? 'environment.common.reviewOverdue'
                              : 'environment.common.reviewDue'
                            ) | transloco: { date: (a.review_due_at | localDay) }
                          }}
                        </span>
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
        <app-why-it-matters scope="environment" page="aspects" />
        <div class="flex flex-wrap gap-2">
          <app-env-lesson-link lesson="aspects-and-impacts" />
          <app-env-lesson-link lesson="significance" />
        </div>
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="environment"
            page="aspects"
            [showAction]="canWrite()"
            (action)="newAspect()"
          />
        </app-card>
        <app-why-it-matters scope="environment" page="aspects" />
        <div class="flex flex-wrap gap-2">
          <app-env-lesson-link lesson="aspects-and-impacts" />
          <app-env-lesson-link lesson="significance" />
        </div>
      </div>
    </app-record-list-page>
  `,
})
export class AspectsList {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly significanceFilters = SIGNIFICANCE_FILTERS;
  protected readonly impactTypes = IMPACT_TYPES;
  protected readonly conditions = CONDITIONS;
  protected readonly stages = LIFECYCLE_STAGES;
  protected readonly sorts = ASPECT_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortKey = sortKey;
  protected readonly tone = statusTone;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<string>('open');
  protected readonly significance = signal<string>('');
  protected readonly impactType = signal<ImpactType | ''>('');
  protected readonly condition = signal<Condition | ''>('');
  protected readonly stage = signal<LifecycleStage | ''>('');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly sort = signal<AspectSort>('-updated_at');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Aspect[]>([]);
  protected readonly total = signal(0);

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      this.status() !== 'open' ||
      !!this.significance() ||
      !!this.impactType() ||
      !!this.condition() ||
      !!this.stage() ||
      !!this.owner(),
  );
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    significance: this.significance(),
    impactType: this.impactType(),
    condition: this.condition(),
    stage: this.stage(),
    owner: this.owner(),
    sort: this.sort(),
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'environment',
      entityType: 'env_aspect',
      view: 'list',
      title: this.language.translate('environment.aspects.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const sig = this.significance();
      const query: AspectListQuery = {
        q: this.q() || undefined,
        status: statusesForFilter(this.status()),
        significant: sig ? sig === 'significant' : undefined,
        impact_type: this.impactType() || undefined,
        condition: this.condition() || undefined,
        lifecycle_stage: this.stage() || undefined,
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
    this.status.set(oneOf(STATUS_FILTERS, value, 'open'));
  }

  protected setSignificance(value: string): void {
    this.offset.set(0);
    this.significance.set(oneOf(SIGNIFICANCE_FILTERS, value, ''));
  }

  protected setImpactType(value: string): void {
    this.offset.set(0);
    this.impactType.set(oneOf<ImpactType | ''>(IMPACT_TYPES, value, ''));
  }

  protected setCondition(value: string): void {
    this.offset.set(0);
    this.condition.set(oneOf<Condition | ''>(CONDITIONS, value, ''));
  }

  protected setStage(value: string): void {
    this.offset.set(0);
    this.stage.set(oneOf<LifecycleStage | ''>(LIFECYCLE_STAGES, value, ''));
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(oneOf(ASPECT_SORTS, value, '-updated_at'));
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.setStatus(f['status'] ?? 'open');
    this.setSignificance(f['significance'] ?? '');
    this.setImpactType(f['impactType'] ?? '');
    this.setCondition(f['condition'] ?? '');
    this.setStage(f['stage'] ?? '');
    this.setOwner(f['owner'] ?? '');
    this.setSort(f['sort'] ?? '-updated_at');
  }

  protected newAspect(): void {
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
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

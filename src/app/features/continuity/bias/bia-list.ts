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
import {
  controlledStatusTone,
  criticalityTone,
  impactTone,
  reviewStateTone,
} from '../data/continuity-display';
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
import { ContinuityNav } from '../shared/continuity-nav';
import { ContinuityDuration } from '../shared/duration';

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

/**
 * The business impact analyses (`/continuity/bias`): search, filters on status,
 * criticality, owner, coverage and review due, saved views, sort and paging. Each
 * row shows the highest impact, the MTPD/RTO/RPO and how many plans cover it.
 */
@Component({
  selector: 'app-bia-list',
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
      titleKey="continuity.bias.title"
      scope="continuity"
      page="bias"
      searchPlaceholderKey="continuity.bias.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <p class="mt-1 text-[14px] text-fg-muted">{{ 'continuity.bias.subtitle' | transloco }}</p>
        <app-continuity-nav />
      </div>

      <ng-container toolbar>
        <app-tour-button scope="continuity" tour="bias" />
        <app-button variant="ghost" size="sm" (click)="askOverview()">
          <app-icon name="spark" [size]="14" />
          {{ 'continuity.ai.biaOverview' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="continuity-bia-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'continuity.bias.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <div class="flex flex-wrap items-center gap-2" appTourStep="continuity-bia-filters">
          <label class="sr-only" for="bia-f-status">{{
            'continuity.fields.status' | transloco
          }}</label>
          <select
            id="bia-f-status"
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
          <label class="sr-only" for="bia-f-crit">{{
            'continuity.fields.criticality' | transloco
          }}</label>
          <select
            id="bia-f-crit"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <label class="sr-only" for="bia-f-flag">{{
            'continuity.filters.show' | transloco
          }}</label>
          <select
            id="bia-f-flag"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          <label class="sr-only" for="bia-f-owner">{{
            'continuity.fields.owner' | transloco
          }}</label>
          <select
            id="bia-f-owner"
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
          <label class="sr-only" for="bia-f-sort">{{
            'continuity.filters.sort' | transloco
          }}</label>
          <select
            id="bia-f-sort"
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
        <app-guide-intro scope="continuity" page="bias" />
        <div><app-lesson scope="continuity" lesson="running-a-bia" /></div>
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
              <ul class="divide-y divide-border" data-testid="bia-rows">
                @for (row of rows(); track row.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/continuity/bias', row.id]"
                        class="flex items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                        <span class="truncate">{{ row.title }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>
                          {{ 'continuity.fields.rtoShort' | transloco }}:
                          <app-continuity-duration [minutes]="row.rto_minutes" />
                        </span>
                        <span>
                          {{ 'continuity.fields.rpoShort' | transloco }}:
                          <app-continuity-duration [minutes]="row.rpo_minutes" />
                        </span>
                        <span>
                          {{ 'continuity.fields.mtpdShort' | transloco }}:
                          <app-continuity-duration [minutes]="row.mtpd_minutes" />
                        </span>
                        @if (row.owner?.name; as owner) {
                          <span>{{
                            'continuity.common.ownedBy' | transloco: { name: owner }
                          }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      @if (row.criticality) {
                        <app-badge [tone]="critTone(row.criticality)">
                          {{ 'continuity.criticality.' + row.criticality | transloco }}
                        </app-badge>
                      }
                      <app-badge [tone]="impTone(row.max_impact)">
                        {{ 'continuity.bias.maxImpact' | transloco: { value: row.max_impact } }}
                      </app-badge>
                      <app-badge [tone]="statusTone(row.status)">
                        {{ 'continuity.status.' + row.status | transloco }}
                      </app-badge>
                      @if (row.plan_count === 0 && row.status !== 'retired') {
                        <app-badge tone="warn">{{
                          'continuity.bias.uncovered' | transloco
                        }}</app-badge>
                      } @else {
                        <span>{{
                          'continuity.bias.planCount' | transloco: { count: row.plan_count }
                        }}</span>
                      }
                      @if (row.review_state === 'overdue' || row.review_state === 'due_soon') {
                        <app-badge [tone]="reviewTone(row.review_state)">
                          {{ 'continuity.reviewState.' + row.review_state | transloco }}
                          @if (row.next_review_on) {
                            · {{ row.next_review_on | localDay }}
                          }
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
        <app-why-it-matters scope="continuity" page="bias" />
      </div>

      <div empty class="flex flex-col gap-4">
        <app-guide-intro scope="continuity" page="bias" />
        <app-teaching-empty
          scope="continuity"
          page="bias"
          [showAction]="canWrite()"
          (action)="create()"
        />
        <app-why-it-matters scope="continuity" page="bias" />
      </div>
    </app-record-list-page>
  `,
})
export class BiaList {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly statuses = CONTROLLED_STATUSES;
  protected readonly criticalities = CRITICALITIES;
  protected readonly sorts = BIA_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusTone = controlledStatusTone;
  protected readonly critTone = criticalityTone;
  protected readonly impTone = impactTone;
  protected readonly reviewTone = reviewStateTone;

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
      title: this.language.translate('continuity.bias.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = biaQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
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

  protected create(): void {
    void this.router.navigate(['/continuity/bias/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.biaOverview'));
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

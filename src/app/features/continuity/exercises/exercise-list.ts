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
import { exerciseStatusTone, outcomeTone } from '../data/continuity-display';
import {
  EXERCISE_SORTS,
  EXERCISE_STATUSES,
  EXERCISE_TYPES,
  ExerciseListItem,
  ExerciseListQuery,
  ExerciseSort,
  ExerciseStatus,
  ExerciseType,
} from '../data/continuity.models';
import { ContinuityNav } from '../shared/continuity-nav';

const PAGE_SIZE = 25;

export interface ExerciseFilters {
  readonly status: ExerciseStatus | '';
  readonly type: ExerciseType | '';
  readonly owner: 'me' | '';
  readonly overdue: 'yes' | '';
  readonly sort: ExerciseSort;
}

export const DEFAULT_EXERCISE_FILTERS: ExerciseFilters = {
  status: '',
  type: '',
  owner: '',
  overdue: '',
  sort: '-scheduled_on',
};

const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : '';

export function exerciseFiltersFromView(values: Readonly<Record<string, string>>): ExerciseFilters {
  return {
    status: pick(values['status'], EXERCISE_STATUSES),
    type: pick(values['type'], EXERCISE_TYPES),
    owner: values['owner'] === 'me' ? 'me' : '',
    overdue: values['overdue'] === 'yes' ? 'yes' : '',
    sort: pick(values['sort'], EXERCISE_SORTS) || '-scheduled_on',
  };
}

export function exerciseQuery(q: string, f: ExerciseFilters, offset: number): ExerciseListQuery {
  return {
    q: q || undefined,
    status: f.status || undefined,
    type: f.type || undefined,
    owner: f.owner || undefined,
    overdue: f.overdue ? true : undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * Exercises and tests (`/continuity/exercises`): search, filters on status, type,
 * owner and overdue, saved views, sort and paging. Each row shows what is exercised
 * (a plan and/or an ICT service), the date and the outcome.
 */
@Component({
  selector: 'app-exercise-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
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
      titleKey="continuity.exercises.title"
      scope="continuity"
      page="exercises"
      searchPlaceholderKey="continuity.exercises.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <p class="mt-1 text-[14px] text-fg-muted">
          {{ 'continuity.exercises.subtitle' | transloco }}
        </p>
        <app-continuity-nav />
      </div>

      <ng-container toolbar>
        <app-tour-button scope="continuity" tour="exercises" />
        <app-button variant="ghost" size="sm" (click)="askOverview()">
          <app-icon name="spark" [size]="14" />
          {{ 'continuity.ai.exerciseOverview' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="continuity-exercise-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'continuity.exercises.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <div class="flex flex-wrap items-center gap-2" appTourStep="continuity-exercise-filters">
          <label class="sr-only" for="ex-f-status">{{
            'continuity.fields.status' | transloco
          }}</label>
          <select
            id="ex-f-status"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('status', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().status">
              {{ 'continuity.filters.anyStatus' | transloco }}
            </option>
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="filters().status === s">
                {{ 'continuity.exerciseStatus.' + s | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="ex-f-type">{{
            'continuity.fields.exerciseType' | transloco
          }}</label>
          <select
            id="ex-f-type"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('type', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().type">
              {{ 'continuity.filters.anyType' | transloco }}
            </option>
            @for (t of types; track t) {
              <option [value]="t" [selected]="filters().type === t">
                {{ 'continuity.exerciseType.' + t | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="ex-f-overdue">{{
            'continuity.filters.show' | transloco
          }}</label>
          <select
            id="ex-f-overdue"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('overdue', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().overdue">
              {{ 'continuity.filters.all' | transloco }}
            </option>
            <option value="yes" [selected]="filters().overdue === 'yes'">
              {{ 'continuity.filters.overdue' | transloco }}
            </option>
          </select>
          <label class="sr-only" for="ex-f-owner">{{
            'continuity.fields.owner' | transloco
          }}</label>
          <select
            id="ex-f-owner"
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
          <label class="sr-only" for="ex-f-sort">{{ 'continuity.filters.sort' | transloco }}</label>
          <select
            id="ex-f-sort"
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
        <app-guide-intro scope="continuity" page="exercises" />
        <div><app-lesson scope="continuity" lesson="exercising-plans" /></div>
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
              <ul class="divide-y divide-border" data-testid="exercise-rows">
                @for (row of rows(); track row.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/continuity/exercises', row.id]"
                        class="flex items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                        <span class="truncate">{{ row.title }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{
                          'continuity.exerciseType.' + row.exercise_type | transloco
                        }}</span>
                        @if (row.plan; as plan) {
                          <span>{{ plan.code }} {{ plan.title }}</span>
                        }
                        @if (row.ict_system; as system) {
                          <span>{{ system.code }} {{ system.name }}</span>
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
                        {{ 'continuity.exerciseStatus.' + row.status | transloco }}
                      </app-badge>
                      @if (row.outcome) {
                        <app-badge [tone]="resultTone(row.outcome)">
                          {{ 'continuity.outcome.' + row.outcome | transloco }}
                        </app-badge>
                      }
                      <span
                        class="inline-flex items-center gap-1"
                        [class.text-fail]="row.overdue"
                        [class.font-semibold]="row.overdue"
                      >
                        @if (row.overdue) {
                          <app-icon name="alert" [size]="13" />
                          <span class="sr-only">{{ 'continuity.common.overdue' | transloco }}</span>
                        }
                        @if (row.conducted_on) {
                          {{
                            'continuity.exercises.heldOn'
                              | transloco: { date: (row.conducted_on | localDay) }
                          }}
                        } @else if (row.scheduled_on) {
                          {{
                            'continuity.exercises.scheduledFor'
                              | transloco: { date: (row.scheduled_on | localDay) }
                          }}
                        } @else {
                          {{ 'continuity.exercises.notScheduled' | transloco }}
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
        <app-why-it-matters scope="continuity" page="exercises" />
      </div>

      <div empty class="flex flex-col gap-4">
        <app-guide-intro scope="continuity" page="exercises" />
        <app-teaching-empty
          scope="continuity"
          page="exercises"
          [showAction]="canWrite()"
          (action)="create()"
        />
        <app-why-it-matters scope="continuity" page="exercises" />
      </div>
    </app-record-list-page>
  `,
})
export class ExerciseList {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly statuses = EXERCISE_STATUSES;
  protected readonly types = EXERCISE_TYPES;
  protected readonly sorts = EXERCISE_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusTone = exerciseStatusTone;
  protected readonly resultTone = outcomeTone;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('continuity:write'),
  );

  protected readonly q = signal('');
  protected readonly filters = signal<ExerciseFilters>(DEFAULT_EXERCISE_FILTERS);
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly ExerciseListItem[]>([]);
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
      entityType: 'continuity_exercise',
      view: 'list',
      title: this.language.translate('continuity.exercises.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = exerciseQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof ExerciseFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => exerciseFiltersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(exerciseFiltersFromView(view.filters));
  }

  protected create(): void {
    void this.router.navigate(['/continuity/exercises/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.exerciseOverview'));
  }

  private load(orgId: string | null, query: ExerciseListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listExercises(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

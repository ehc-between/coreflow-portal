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
import { badge } from '../data/continuity-display';
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
import { CONTINUITY_NAV, ContinuityAskButton, sectionCrumbs } from '../shared/continuity-page';

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

const SELECT =
  'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none';

/**
 * Exercises and tests (`/continuity/exercises`): search, filters on status, type and
 * overdue (owner and sort under "More filters"), saved views and paging. Each row
 * shows what is exercised (a plan and/or an ICT service), the requirements it
 * documents, the status or outcome and one date (held on, else planned for).
 */
@Component({
  selector: 'app-exercise-list',
  imports: [
    TranslocoPipe,
    Button,
    ContinuityAskButton,
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
      titleKey="continuity.nav.exercises"
      descriptionKey="continuity.exercises.subtitle"
      scope="continuity"
      page="exercises"
      [breadcrumbs]="crumbs"
      searchPlaceholderKey="continuity.exercises.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <app-continuity-ask-button
        secondary
        labelKey="continuity.ai.exerciseOverview"
        promptKey="continuity.ai.prompts.exerciseOverview"
      />
      @if (canWrite()) {
        <app-button primary appTourStep="continuity-exercise-new" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'continuity.exercises.new' | transloco }}
        </app-button>
      }

      <app-module-nav nav labelKey="continuity.nav.label" [items]="nav" />
      <app-help-strip
        help
        scope="continuity"
        page="exercises"
        tour="exercises"
        lesson="exercising-plans"
      />

      <ng-container filters>
        <label class="sr-only" for="ex-f-status">{{
          'continuity.fields.status' | transloco
        }}</label>
        <select
          id="ex-f-status"
          appTourStep="continuity-exercise-filters"
          [class]="select"
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
          [class]="select"
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
          [class]="select"
          (change)="setFilter('overdue', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().overdue">
            {{ 'continuity.filters.all' | transloco }}
          </option>
          <option value="yes" [selected]="filters().overdue === 'yes'">
            {{ 'continuity.filters.overdue' | transloco }}
          </option>
        </select>
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted" for="ex-f-owner">
          {{ 'continuity.fields.owner' | transloco }}
          <select
            id="ex-f-owner"
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
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted" for="ex-f-sort">
          {{ 'continuity.filters.sort' | transloco }}
          <select
            id="ex-f-sort"
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
            <div
              role="list"
              class="overflow-hidden rounded-card border border-border bg-surface"
              data-testid="exercise-rows"
            >
              <app-record-row-header dateKind="date" />
              @for (row of rows(); track row.id) {
                <app-record-row
                  [code]="row.code"
                  [title]="row.title"
                  [subtitle]="subtitle(row)"
                  [link]="['/continuity/exercises', row.id]"
                  [owner]="row.owner?.name"
                  [date]="row.conducted_on ?? row.scheduled_on"
                  dateKind="date"
                  [overdue]="row.overdue"
                >
                  <app-coverage-chip
                    coverage
                    class="max-w-full [&_[data-testid=coverage-chip]]:flex-wrap [&_[data-testid=coverage-chip]]:whitespace-normal"
                    entityType="continuity_exercise"
                    [entityId]="row.id"
                  />
                  @if (row.outcome) {
                    <app-status-badge
                      badges
                      [meaning]="outcome(row).meaning"
                      [value]="outcome(row).value"
                      [labelKey]="'continuity.outcome.' + row.outcome"
                    />
                  } @else {
                    <app-status-badge
                      badges
                      [meaning]="status(row).meaning"
                      [value]="status(row).value"
                      [labelKey]="'continuity.exerciseStatus.' + row.status"
                    />
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
        page="exercises"
        [showAction]="canWrite()"
        (action)="create()"
      />
      <app-why-it-matters below scope="continuity" page="exercises" />
    </app-record-list-page>
  `,
})
export class ExerciseList {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly nav = CONTINUITY_NAV;
  protected readonly crumbs = sectionCrumbs('exercises');
  protected readonly select = SELECT;
  protected readonly statuses = EXERCISE_STATUSES;
  protected readonly types = EXERCISE_TYPES;
  protected readonly sorts = EXERCISE_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly status = (row: ExerciseListItem) => badge.exercise(row.status);
  protected readonly outcome = (row: ExerciseListItem) => badge.outcome(row.outcome);

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
  protected readonly moreActive = computed(
    () => (this.filters().owner ? 1 : 0) + (this.filters().sort !== '-scheduled_on' ? 1 : 0),
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
      title: this.language.translate('continuity.nav.exercises'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = exerciseQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  /** "Bordøvelse · BCP-0001 Kundeordre · IKT-0001 ERP". */
  protected subtitle(row: ExerciseListItem): string {
    const parts = [this.language.translate('continuity.exerciseType.' + row.exercise_type)];
    if (row.plan) {
      parts.push(`${row.plan.code} ${row.plan.title}`);
    }
    if (row.ict_system) {
      parts.push(`${row.ict_system.code} ${row.ict_system.name}`);
    }
    return parts.join(' · ');
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

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.filters.set(DEFAULT_EXERCISE_FILTERS);
  }

  protected create(): void {
    void this.router.navigate(['/continuity/exercises/new']);
  }

  protected reload(): void {
    this.load(
      this.selectedOrg.currentOrgId(),
      exerciseQuery(this.q(), this.filters(), this.offset()),
    );
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

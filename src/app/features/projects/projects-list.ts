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
import { GanttRow } from './data/gantt';
import {
  OPEN_PROJECT_STATUSES,
  PERM_WRITE,
  PROJECT_KINDS,
  PROJECT_SORTS,
  PROJECT_STATUSES,
  Project,
  ProjectKind,
  ProjectListQuery,
  ProjectSort,
  ProjectStatus,
  isOneOf,
} from './data/project.models';
import {
  healthTone,
  priorityTone,
  projectStatusKey,
  projectStatusTone,
} from './data/project-display';
import { ProjectsApi } from './data/projects-api';
import { GanttChart } from './gantt-chart';
import { ProjectLessonLink } from './lesson-link';

const PAGE_SIZE = 25;

/** Status filter options: `open` = every status that is not closed. */
export const STATUS_FILTERS = ['open', 'all', ...PROJECT_STATUSES] as const;
export const PEOPLE_FILTERS = ['', 'owner', 'member'] as const;
export const LIST_VIEWS = ['list', 'timeline'] as const;
export type ListView = (typeof LIST_VIEWS)[number];

export function statusesForFilter(filter: string): readonly ProjectStatus[] {
  if (filter === 'open') {
    return OPEN_PROJECT_STATUSES;
  }
  return isOneOf(PROJECT_STATUSES, filter) ? [filter] : [];
}

/** Portfolio timeline rows: one bar per project from its start to its due date. */
export function projectRows(projects: readonly Project[]): GanttRow[] {
  return projects.map((p) => ({
    id: p.id,
    kind: 'project',
    title: `${p.code} ${p.title}`,
    subtitle: p.owner?.name ?? null,
    status: p.status,
    start: p.start_date,
    end: p.due_date,
    depth: 0,
    overdue: p.is_overdue,
    url: p.url,
  }));
}

/**
 * The project register (`/projects`): search, filters on status, people, kind and
 * overdue, sorting, saved views and paging, as a list or as a portfolio timeline.
 */
@Component({
  selector: 'app-projects-list',
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
    GanttChart,
    ProjectLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="projects.list.title"
      scope="projects"
      searchPlaceholderKey="projects.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <p class="text-[14px] text-fg-muted">{{ 'projects.list.subtitle' | transloco }}</p>
        <app-guide-intro scope="projects" page="list" />
      </div>

      <app-tour-button toolbar scope="projects" tour="list" />
      <div
        toolbar
        class="inline-flex rounded-tile border border-border p-0.5"
        role="group"
        [attr.aria-label]="'projects.list.viewLabel' | transloco"
        appTourStep="projects-views"
      >
        @for (v of views; track v) {
          <button
            type="button"
            class="h-8 rounded-[8px] px-3 text-[12.5px] font-semibold"
            [class.bg-accent-soft]="view() === v"
            [class.text-accent]="view() === v"
            [class.text-fg-muted]="view() !== v"
            [attr.aria-pressed]="view() === v"
            (click)="setView(v)"
            [attr.data-testid]="'view-' + v"
          >
            {{ 'projects.list.views.' + v | transloco }}
          </button>
        }
      </div>
      @if (canWrite()) {
        <app-button
          toolbar
          size="sm"
          (click)="newProject()"
          appTourStep="projects-new"
          data-testid="new-project"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'projects.list.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-project-status">
        {{ 'projects.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-project-status"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setStatus($any($event.target).value)"
        appTourStep="projects-filters"
        data-testid="filter-status"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ statusFilterKey(s) | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-project-people">
        {{ 'projects.filters.people' | transloco }}
      </label>
      <select
        filters
        id="cf-project-people"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setPeople($any($event.target).value)"
        data-testid="filter-people"
      >
        @for (p of peopleFilters; track p) {
          <option [value]="p" [selected]="people() === p">
            {{ 'projects.filters.peopleOptions.' + (p || 'anyone') | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-project-kind">
        {{ 'projects.filters.kind' | transloco }}
      </label>
      <select
        filters
        id="cf-project-kind"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setKind($any($event.target).value)"
        data-testid="filter-kind"
      >
        <option value="" [selected]="!kind()">{{ 'projects.filters.allKinds' | transloco }}</option>
        @for (k of kinds; track k) {
          <option [value]="k" [selected]="kind() === k">
            {{ 'projects.kinds.' + k | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-project-sort">
        {{ 'projects.filters.sort' | transloco }}
      </label>
      <select
        filters
        id="cf-project-sort"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setSort($any($event.target).value)"
      >
        @for (s of sorts; track s) {
          <option [value]="s" [selected]="sort() === s">
            {{ 'projects.sorts.' + sortKey(s) | transloco }}
          </option>
        }
      </select>
      <label
        filters
        class="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
      >
        <input
          type="checkbox"
          class="h-4 w-4 accent-[var(--accent)]"
          [checked]="overdue()"
          (change)="setOverdue($any($event.target).checked)"
          data-testid="filter-overdue"
        />
        {{ 'projects.filters.overdue' | transloco }}
      </label>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'projects.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'projects.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'projects.list.noMatch' | transloco }}
              </p>
            } @else {
              @if (view() === 'timeline') {
                <div class="p-3">
                  <app-gantt-chart
                    [rows]="timelineRows()"
                    labelKey="projects.list.timelineLabel"
                    emptyKey="projects.list.timelineEmpty"
                  />
                </div>
              } @else {
                <ul class="divide-y divide-border" data-testid="project-rows">
                  @for (p of rows(); track p.id) {
                    <li
                      class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div class="min-w-0 flex-1">
                        <a
                          [routerLink]="['/projects', p.id]"
                          class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                        >
                          <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                            p.code
                          }}</span>
                          <span class="truncate">{{ p.title }}</span>
                          @if (p.security_relevant) {
                            <app-icon name="lock" [size]="13" class="flex-none text-fg-subtle" />
                            <span class="sr-only">{{
                              'projects.fields.securityRelevant' | transloco
                            }}</span>
                          }
                        </a>
                        <span
                          class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                        >
                          <span>{{ 'projects.kinds.' + p.kind | transloco }}</span>
                          @if (p.owner?.name; as ownerName) {
                            <span>{{
                              'projects.list.owner' | transloco: { name: ownerName }
                            }}</span>
                          }
                          <span>{{
                            'projects.list.members' | transloco: { count: p.member_count }
                          }}</span>
                        </span>
                      </div>
                      <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                        <app-badge [tone]="statusTone(p.status)">{{
                          statusKey(p.status) | transloco
                        }}</app-badge>
                        @if (p.priority !== 'normal') {
                          <app-badge [tone]="priorityTone(p.priority)">{{
                            'projects.priorities.' + p.priority | transloco
                          }}</app-badge>
                        }
                        @if (p.health) {
                          <app-badge [tone]="healthTone(p.health)">{{
                            'projects.healths.' + p.health | transloco
                          }}</app-badge>
                        }
                        <span
                          class="inline-flex min-w-[130px] items-center justify-end gap-1 text-right"
                          [class.text-fail]="p.is_overdue"
                          [class.font-semibold]="p.is_overdue"
                        >
                          @if (p.is_overdue) {
                            <app-icon name="alert" [size]="13" />
                            <span class="sr-only">{{ 'projects.common.overdue' | transloco }}</span>
                          }
                          @if (p.due_date) {
                            {{ 'projects.list.due' | transloco: { date: (p.due_date | localDay) } }}
                          } @else {
                            {{ 'projects.list.noDue' | transloco }}
                          }
                        </span>
                      </span>
                    </li>
                  }
                </ul>
              }
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
        <app-why-it-matters scope="projects" page="list" />
        <div class="flex flex-wrap gap-2">
          <app-project-lesson-link lesson="project-basics" />
          <app-project-lesson-link lesson="design-control" />
        </div>
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="projects"
            page="list"
            [showAction]="canWrite()"
            (action)="newProject()"
          />
        </app-card>
        <app-why-it-matters scope="projects" page="list" />
        <div class="flex flex-wrap gap-2">
          <app-project-lesson-link lesson="project-basics" />
          <app-project-lesson-link lesson="design-control" />
        </div>
      </div>
    </app-record-list-page>
  `,
})
export class ProjectsList {
  private readonly api = inject(ProjectsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly peopleFilters = PEOPLE_FILTERS;
  protected readonly kinds = PROJECT_KINDS;
  protected readonly sorts = PROJECT_SORTS;
  protected readonly views = LIST_VIEWS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = projectStatusKey;
  protected readonly statusTone = projectStatusTone;
  protected readonly healthTone = healthTone;
  protected readonly priorityTone = priorityTone;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<string>('open');
  protected readonly people = signal<(typeof PEOPLE_FILTERS)[number]>('');
  protected readonly kind = signal<ProjectKind | ''>('');
  protected readonly overdue = signal(false);
  protected readonly sort = signal<ProjectSort>('-updated_at');
  protected readonly view = signal<ListView>('list');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Project[]>([]);
  protected readonly total = signal(0);
  protected readonly timelineRows = computed(() => projectRows(this.rows()));

  protected readonly isFiltered = computed(
    () =>
      !!this.q() || this.status() !== 'open' || !!this.people() || !!this.kind() || this.overdue(),
  );
  /** The teaching empty state: the register itself is empty (not just this filter). */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    people: this.people(),
    kind: this.kind(),
    overdue: this.overdue() ? '1' : '',
    sort: this.sort(),
    view: this.view(),
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'projects',
      entityType: 'project',
      view: 'list',
      title: this.language.translate('projects.list.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const people = this.people();
      const query: ProjectListQuery = {
        q: this.q() || undefined,
        status: statusesForFilter(this.status()),
        owner: people === 'owner' ? 'me' : undefined,
        member: people === 'member' ? 'me' : undefined,
        kind: this.kind() || undefined,
        overdue: this.overdue() ? true : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected statusFilterKey(filter: string): string {
    return filter === 'open' || filter === 'all'
      ? `projects.filters.statusOptions.${filter}`
      : projectStatusKey(filter);
  }

  protected sortKey(sort: string): string {
    return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set(isOneOf(STATUS_FILTERS, value) ? value : 'open');
  }

  protected setPeople(value: string): void {
    this.offset.set(0);
    this.people.set(isOneOf(PEOPLE_FILTERS, value) ? value : '');
  }

  protected setKind(value: string): void {
    this.offset.set(0);
    this.kind.set(isOneOf(PROJECT_KINDS, value) ? value : '');
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(isOneOf(PROJECT_SORTS, value) ? value : '-updated_at');
  }

  protected setView(value: string): void {
    this.view.set(isOneOf(LIST_VIEWS, value) ? value : 'list');
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.offset.set(0);
    this.setStatus(f['status'] ?? 'open');
    this.setPeople(f['people'] ?? '');
    this.setKind(f['kind'] ?? '');
    this.setOverdue(f['overdue'] === '1');
    this.setSort(f['sort'] ?? '-updated_at');
    this.setView(f['view'] ?? 'list');
  }

  protected newProject(): void {
    void this.router.navigate(['/projects/new']);
  }

  private load(orgId: string | null, query: ProjectListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

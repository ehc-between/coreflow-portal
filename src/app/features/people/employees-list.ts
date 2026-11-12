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
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { Pager } from '../../shared/ui/pager/pager';
import { PeopleApi } from './data/people-api';
import { FILTER_SELECT_CLASS, employeeStatusTone, hasPerm, sortKey } from './data/people-display';
import { PeopleLookups } from './data/people-lookups';
import {
  EMPLOYEE_SORTS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  Employee,
  EmployeeListQuery,
  EmployeeSort,
  EmployeeStatus,
  EmploymentType,
  PERM_WRITE,
  PeopleSummary,
} from './data/people.models';
import { PeopleLessonLink, PeopleSectionNav } from './people-section-nav';

const PAGE_SIZE = 25;

/** Status filter options: `current` = everyone who has not left. */
export const EMPLOYEE_STATUS_FILTERS = ['current', 'all', ...EMPLOYEE_STATUSES] as const;

export function statusesForFilter(filter: string): readonly EmployeeStatus[] {
  if (filter === 'current') {
    return ['onboarding', 'active', 'on_leave', 'offboarding'];
  }
  return (EMPLOYEE_STATUSES as readonly string[]).includes(filter)
    ? [filter as EmployeeStatus]
    : [];
}

/**
 * The employee register (`/people/employees`): headline numbers, search, filters on
 * status, employment type, position and department, sorting, saved views and paging.
 */
@Component({
  selector: 'app-people-employees-list',
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
    KpiTile,
    Pager,
    PeopleLessonLink,
    PeopleSectionNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="people.employees.title"
      scope="people"
      page="list"
      searchPlaceholderKey="people.employees.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <app-people-section-nav />
        <p class="text-[14px] text-fg-muted">{{ 'people.employees.subtitle' | transloco }}</p>
        <app-guide-intro scope="people" page="list" />
      </div>

      <app-tour-button toolbar scope="people" tour="list" />
      @if (canWrite()) {
        <app-button
          toolbar
          size="sm"
          (click)="newEmployee()"
          appTourStep="people-new"
          data-testid="new-employee"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'people.employees.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-emp-status">
        {{ 'people.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-emp-status"
        [class]="selectClass"
        (change)="setStatus($any($event.target).value)"
        appTourStep="people-filters"
        data-testid="filter-status"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ statusFilterKey(s) | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-emp-type">
        {{ 'people.filters.employmentType' | transloco }}
      </label>
      <select
        filters
        id="cf-emp-type"
        [class]="selectClass"
        (change)="setType($any($event.target).value)"
        data-testid="filter-type"
      >
        <option value="" [selected]="!type()">{{ 'people.filters.allTypes' | transloco }}</option>
        @for (t of types; track t) {
          <option [value]="t" [selected]="type() === t">
            {{ 'people.employmentTypes.' + t | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-emp-position">
        {{ 'people.filters.position' | transloco }}
      </label>
      <select
        filters
        id="cf-emp-position"
        [class]="selectClass"
        (change)="setPosition($any($event.target).value)"
        data-testid="filter-position"
      >
        <option value="" [selected]="!positionId()">
          {{ 'people.filters.anyPosition' | transloco }}
        </option>
        @for (p of lookups.positions(); track p.id) {
          <option [value]="p.id" [selected]="positionId() === p.id">{{ p.title }}</option>
        }
      </select>
      @if (lookups.departments().length) {
        <ng-container filters>
          <label class="sr-only" for="cf-emp-dept">
            {{ 'people.filters.department' | transloco }}
          </label>
          <select
            id="cf-emp-dept"
            [class]="selectClass"
            (change)="setDepartment($any($event.target).value)"
          >
            <option value="" [selected]="!departmentId()">
              {{ 'people.filters.anyDepartment' | transloco }}
            </option>
            @for (d of lookups.departments(); track d.id) {
              <option [value]="d.id" [selected]="departmentId() === d.id">{{ d.label }}</option>
            }
          </select>
        </ng-container>
      }
      <label filters class="sr-only" for="cf-emp-sort">
        {{ 'people.filters.sort' | transloco }}
      </label>
      <select
        filters
        id="cf-emp-sort"
        [class]="selectClass"
        (change)="setSort($any($event.target).value)"
      >
        @for (s of sorts; track s) {
          <option [value]="s" [selected]="sort() === s">
            {{ 'people.sorts.' + sortKeyOf(s) | transloco }}
          </option>
        }
      </select>

      @if (summary(); as s) {
        <div
          class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
          appTourStep="people-summary"
          data-testid="people-summary"
        >
          <app-kpi-tile
            [label]="'people.summary.current' | transloco"
            [value]="currentCount()"
            tone="accent"
          />
          <app-kpi-tile
            [label]="'people.summary.gaps' | transloco"
            [value]="s.gaps"
            [tone]="s.gaps ? 'warn' : 'pass'"
          />
          <app-kpi-tile
            [label]="'people.summary.openChecklists' | transloco"
            [value]="s.open_checklists"
            [tone]="s.overdue_checklists ? 'fail' : 'info'"
            [delta]="
              s.overdue_checklists
                ? ('people.summary.overdue' | transloco: { count: s.overdue_checklists })
                : ''
            "
          />
          <app-kpi-tile
            [label]="'people.summary.missingConfidentiality' | transloco"
            [value]="s.missing_confidentiality"
            [tone]="s.missing_confidentiality ? 'warn' : 'pass'"
            [delta]="
              s.expiring_soon
                ? ('people.summary.expiringSoon' | transloco: { count: s.expiring_soon })
                : ''
            "
          />
        </div>
      }

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'people.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'people.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'people.employees.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="employee-rows">
                @for (e of rows(); track e.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/people/employees', e.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                          e.code
                        }}</span>
                        <span class="truncate">{{ e.full_name }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        @if (e.position?.name ?? e.job_title; as role) {
                          <span>{{ role }}</span>
                        }
                        @if (e.department?.name; as dept) {
                          <span>{{ dept }}</span>
                        }
                        <span>{{ 'people.employmentTypes.' + e.employment_type | transloco }}</span>
                        @if (e.start_date) {
                          <span>{{
                            'people.employees.since'
                              | transloco: { date: (e.start_date | localDay) }
                          }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px]">
                      @if (e.gap_count > 0) {
                        <app-badge tone="warn">{{
                          'people.employees.gapCount' | transloco: { count: e.gap_count }
                        }}</app-badge>
                      }
                      @if (e.open_checklists > 0) {
                        <app-badge tone="info">{{
                          'people.employees.openChecklists'
                            | transloco: { count: e.open_checklists }
                        }}</app-badge>
                      }
                      @if (!e.confidentiality_signed_on && e.status !== 'former') {
                        <app-badge tone="neutral">{{
                          'people.employees.noConfidentiality' | transloco
                        }}</app-badge>
                      }
                      <app-badge [tone]="statusTone(e.status)">{{
                        'people.status.' + e.status | transloco
                      }}</app-badge>
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
        <app-why-it-matters scope="people" page="list" />
        <div class="flex flex-wrap gap-2">
          <app-people-lesson-link lesson="competence-basics" />
          <app-people-lesson-link lesson="joiners-and-leavers" />
        </div>
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="people"
            page="list"
            [showAction]="canWrite()"
            (action)="newEmployee()"
          />
        </app-card>
        <app-why-it-matters scope="people" page="list" />
        <div class="flex flex-wrap gap-2">
          <app-people-lesson-link lesson="competence-basics" />
          <app-people-lesson-link lesson="joiners-and-leavers" />
        </div>
      </div>
    </app-record-list-page>
  `,
})
export class EmployeesList {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly lookups = inject(PeopleLookups);

  protected readonly selectClass = FILTER_SELECT_CLASS;
  protected readonly statusFilters = EMPLOYEE_STATUS_FILTERS;
  protected readonly types = EMPLOYMENT_TYPES;
  protected readonly sorts = EMPLOYEE_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusTone = employeeStatusTone;
  protected readonly sortKeyOf = sortKey;

  protected readonly canWrite = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_WRITE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<string>('current');
  protected readonly type = signal<EmploymentType | ''>('');
  protected readonly positionId = signal('');
  protected readonly departmentId = signal('');
  protected readonly sort = signal<EmployeeSort>('name');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Employee[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<PeopleSummary | null>(null);

  protected readonly currentCount = computed(() => {
    const by = this.summary()?.employees_by_status;
    return by ? by.onboarding + by.active + by.on_leave + by.offboarding : 0;
  });

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      this.status() !== 'current' ||
      !!this.type() ||
      !!this.positionId() ||
      !!this.departmentId(),
  );
  /** The teaching empty state: the register itself is empty (not just this filter). */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    type: this.type(),
    position: this.positionId(),
    department: this.departmentId(),
    sort: this.sort(),
  }));

  private request = new Subscription();
  private summaryRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.summaryRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'people',
      entityType: 'employee',
      view: 'list',
      title: this.language.translate('people.employees.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        this.lookups.ensureLoaded();
        this.loadSummary(orgId);
      });
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: EmployeeListQuery = {
        q: this.q() || undefined,
        status: statusesForFilter(this.status()),
        employment_type: this.type() || undefined,
        position_id: this.positionId() || undefined,
        department_id: this.departmentId() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected statusFilterKey(filter: string): string {
    return filter === 'current' || filter === 'all'
      ? `people.filters.statusOptions.${filter}`
      : `people.status.${filter}`;
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set(
      (EMPLOYEE_STATUS_FILTERS as readonly string[]).includes(value) ? value : 'current',
    );
  }

  protected setType(value: string): void {
    this.offset.set(0);
    this.type.set(
      (EMPLOYMENT_TYPES as readonly string[]).includes(value) ? (value as EmploymentType) : '',
    );
  }

  protected setPosition(value: string): void {
    this.offset.set(0);
    this.positionId.set(value || '');
  }

  protected setDepartment(value: string): void {
    this.offset.set(0);
    this.departmentId.set(value || '');
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (EMPLOYEE_SORTS as readonly string[]).includes(value) ? (value as EmployeeSort) : 'name',
    );
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.setStatus(f['status'] ?? 'current');
    this.setType(f['type'] ?? '');
    this.setPosition(f['position'] ?? '');
    this.setDepartment(f['department'] ?? '');
    this.setSort(f['sort'] ?? 'name');
  }

  protected newEmployee(): void {
    void this.router.navigate(['/people/employees/new']);
  }

  private loadSummary(orgId: string | null): void {
    this.summaryRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.summaryRequest = this.api.summary(orgId).subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.summary.set(null),
    });
  }

  private load(orgId: string | null, query: EmployeeListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listEmployees(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

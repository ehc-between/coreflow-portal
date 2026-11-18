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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PeopleApi } from './data/people-api';
import {
  FILTER_SELECT_CLASS,
  countKey,
  employeeStatusLook,
  hasPerm,
  sameTitle,
  sortKey,
} from './data/people-display';
import { PeopleLookups } from './data/people-lookups';
import {
  EMPLOYEE_FLAGS,
  EMPLOYEE_SORTS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  Employee,
  EmployeeFlag,
  EmployeeListQuery,
  EmployeeSort,
  EmployeeStatus,
  EmploymentType,
  PERM_WRITE,
  PeopleSummary,
} from './data/people.models';
import { ImportUsersDialog } from './ui/import-users-dialog';
import { PEOPLE_NAV, PEOPLE_SETTINGS_LINK } from './ui/people-nav';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';

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

/** A summary tile and the list filter it opens. */
export interface SummaryTile {
  readonly key: string;
  readonly value: number;
  readonly flag: EmployeeFlag | null;
  readonly tone: 'accent' | 'warn' | 'pass';
  /** U24: a tile that opens another list (the gaps view counts competence cells). */
  readonly link?: string;
  readonly queryParams?: Readonly<Record<string, string>>;
}

/** The six tiles above the register (each one is a filter). */
export function summaryTiles(s: PeopleSummary): readonly SummaryTile[] {
  const by = s.employees_by_status;
  const current = by.onboarding + by.active + by.on_leave + by.offboarding;
  // U24: a flag tile shows the number of people the `?flag=` filter lists.
  const byFlag = s.employees_by_flag ?? {};
  const issue = (key: string, value: number, flag: EmployeeFlag): SummaryTile => {
    const people = byFlag[flag] ?? value;
    return { key, value: people, flag, tone: people ? 'warn' : 'pass' };
  };
  return [
    { key: 'current', value: current, flag: null, tone: 'accent' },
    // Competence gaps are counted per person and competence: the gap list shows each one.
    {
      key: 'gaps',
      value: s.gaps,
      flag: null,
      tone: s.gaps ? 'warn' : 'pass',
      link: '/people/matrix',
      queryParams: { view: 'gaps' },
    },
    issue('expiringSoon', s.expiring_soon, 'expiring_soon'),
    issue('missingConfidentiality', s.missing_confidentiality, 'missing_confidentiality'),
    issue('screeningMissing', s.screening_missing ?? 0, 'screening_missing'),
    issue('noUserAccount', s.no_user_account ?? 0, 'no_user_account'),
  ];
}

function isFlag(value: string | null | undefined): value is EmployeeFlag {
  return !!value && (EMPLOYEE_FLAGS as readonly string[]).includes(value);
}

/**
 * The people register (`/people/employees`, h1 "Personer"): six tiles that each open
 * a filter (gaps, expiring competences, missing agreements, background checks, people
 * without a user account), search, filters, saved views and paging; "Importer brukere
 * som personer" for members who have no record yet (`?import=users`).
 */
@Component({
  selector: 'app-people-employees-list',
  imports: [
    FulfilsRequirements,
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Badge,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    ImportUsersDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="modules.names.people"
      descriptionKey="people.employees.subtitle"
      [settingsLink]="settingsLink"
      scope="people"
      page="list"
      searchPlaceholderKey="people.employees.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="people.employees" />
      @if (canWrite()) {
        <app-button
          primary
          (click)="newEmployee()"
          appTourStep="people-new"
          data-testid="new-employee"
        >
          <app-icon name="plus" [size]="15" />
          {{ 'people.employees.new' | transloco }}
        </app-button>
      }
      @if (canWrite()) {
        <app-button
          secondary
          variant="secondary"
          (click)="importOpen.set(true)"
          data-testid="import-users"
        >
          {{ 'people.import.open' | transloco }}
          @if (summary()?.members_without_employee; as n) {
            <span class="rounded-full bg-accent-soft px-1.5 text-micro font-bold text-accent">{{
              n
            }}</span>
          }
        </app-button>
      }

      <app-module-nav nav [items]="nav" labelKey="people.sections.label" />
      <app-help-strip help scope="people" page="list" tour="list" lesson="competence-basics" />

      <div kpis class="contents" appTourStep="people-summary" data-testid="people-summary">
        @for (tile of tiles(); track tile.key) {
          @if (tile.link) {
            <app-kpi-tile
              [link]="tile.link"
              [queryParams]="tile.queryParams ?? null"
              [attr.data-testid]="'tile-' + tile.key"
              [label]="'people.summary.' + tile.key | transloco"
              [value]="tile.value"
              [tone]="tile.tone"
            />
          } @else {
            <button
              type="button"
              class="block w-full rounded-card text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [class.ring-2]="tile.flag !== null && flag() === tile.flag"
              [class.ring-accent]="tile.flag !== null && flag() === tile.flag"
              [attr.aria-pressed]="tile.flag !== null ? flag() === tile.flag : null"
              [attr.aria-label]="
                'people.summary.filterLabel'
                  | transloco
                    : { label: ('people.summary.' + tile.key | transloco), count: tile.value }
              "
              (click)="setFlag(tile.flag && flag() !== tile.flag ? tile.flag : '')"
              [attr.data-testid]="'tile-' + tile.key"
            >
              <app-kpi-tile
                [label]="'people.summary.' + tile.key | transloco"
                [value]="tile.value"
                [tone]="tile.tone"
              />
            </button>
          }
        }
      </div>

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
      <label filters class="sr-only" for="cf-emp-flag">
        {{ 'people.filters.flag' | transloco }}
      </label>
      <select
        filters
        id="cf-emp-flag"
        [class]="selectClass"
        (change)="setFlag($any($event.target).value)"
        data-testid="filter-flag"
      >
        <option value="" [selected]="!flag()">{{ 'people.filters.anyFlag' | transloco }}</option>
        @for (f of flags; track f) {
          <option [value]="f" [selected]="flag() === f">
            {{ 'people.flags.' + f | transloco }}
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

      <div more-filters class="flex flex-col gap-1">
        <label class="text-meta font-semibold text-fg-muted" for="cf-emp-type">
          {{ 'people.filters.employmentType' | transloco }}
        </label>
        <select
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
      </div>
      @if (lookups.departments().length) {
        <div more-filters class="flex flex-col gap-1">
          <label class="text-meta font-semibold text-fg-muted" for="cf-emp-dept">
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
        </div>
      }
      <div more-filters class="flex flex-col gap-1">
        <label class="text-meta font-semibold text-fg-muted" for="cf-emp-sort">
          {{ 'people.filters.sort' | transloco }}
        </label>
        <select
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
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (rows().length === 0) {
              <div class="px-4 py-10 text-center" data-testid="no-match">
                <p class="text-body text-fg-muted">{{ 'people.employees.noMatch' | transloco }}</p>
                @if (flag()) {
                  <button
                    type="button"
                    class="mt-2 text-ui font-semibold text-accent hover:underline"
                    (click)="setFlag('')"
                  >
                    {{ 'people.filters.clearFlag' | transloco }}
                  </button>
                }
              </div>
            } @else {
              <div role="list" data-testid="employee-rows">
                <app-record-row-header
                  titleKey="people.fields.fullName"
                  dateKind="date"
                  [owner]="false"
                />
                @for (e of rows(); track e.id) {
                  <app-record-row
                    [code]="e.code"
                    [title]="e.full_name"
                    [subtitle]="subtitle(e)"
                    [link]="['/people/employees', e.id]"
                    [date]="e.start_date"
                    dateKind="date"
                  >
                    <app-coverage-chip coverage entityType="employee" [entityId]="e.id" />
                    <ng-container ngProjectAs="[badges]">
                      <app-status-badge
                        [meaning]="statusLook(e.status).meaning"
                        [value]="statusLook(e.status).value"
                        [labelKey]="'people.status.' + e.status"
                      />
                      @if (e.gap_count > 0) {
                        <app-badge tone="warn">{{
                          countKey('people.employees.gapCount', e.gap_count)
                            | transloco: { count: e.gap_count }
                        }}</app-badge>
                      }
                      @for (f of rowFlags(e); track f) {
                        <app-badge tone="neutral">{{ 'people.flags.' + f | transloco }}</app-badge>
                      }
                    </ng-container>
                  </app-record-row>
                }
              </div>
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

      <app-why-it-matters below scope="people" page="list" />

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="people"
            page="list"
            [showAction]="canWrite()"
            (action)="newEmployee()"
          />
          @if (canWrite() && summary()?.members_without_employee) {
            <div class="mt-3 text-center">
              <app-button variant="secondary" (click)="importOpen.set(true)">
                {{ 'people.import.open' | transloco }}
              </app-button>
            </div>
          }
        </app-card>
        <app-why-it-matters scope="people" page="list" />
      </div>
    </app-record-list-page>

    <app-people-import-users-dialog
      [open]="importOpen()"
      (done)="onImported()"
      (closed)="closeImport()"
    />
  `,
})
export class EmployeesList {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly lookups = inject(PeopleLookups);

  protected readonly nav = PEOPLE_NAV;
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  protected readonly selectClass = FILTER_SELECT_CLASS;
  protected readonly statusFilters = EMPLOYEE_STATUS_FILTERS;
  protected readonly flags = EMPLOYEE_FLAGS;
  protected readonly types = EMPLOYMENT_TYPES;
  protected readonly sorts = EMPLOYEE_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusLook = employeeStatusLook;
  protected readonly sortKeyOf = sortKey;
  protected readonly countKey = countKey;

  protected readonly canWrite = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_WRITE),
  );

  private readonly query = toSignal(this.route.queryParamMap);

  protected readonly q = signal('');
  protected readonly status = signal<string>('current');
  protected readonly flag = signal<EmployeeFlag | ''>('');
  protected readonly type = signal<EmploymentType | ''>('');
  protected readonly positionId = signal('');
  protected readonly departmentId = signal('');
  protected readonly sort = signal<EmployeeSort>('name');
  protected readonly offset = signal(0);
  protected readonly importOpen = signal(false);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Employee[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<PeopleSummary | null>(null);

  protected readonly tiles = computed(() => {
    const s = this.summary();
    return s ? summaryTiles(s) : [];
  });

  protected readonly moreActive = computed(
    () => (this.type() ? 1 : 0) + (this.departmentId() ? 1 : 0) + (this.sort() !== 'name' ? 1 : 0),
  );

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      this.status() !== 'current' ||
      !!this.flag() ||
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
    flag: this.flag(),
    type: this.type(),
    position: this.positionId(),
    department: this.departmentId(),
    sort: this.sort(),
  }));

  private lastQuery: EmployeeListQuery = {};
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
      title: this.language.translate('modules.names.people'),
    }));

    // Deep links: `?flag=screening_missing` (tiles, next actions) and `?import=users`.
    effect(() => {
      const params = this.query();
      untracked(() => {
        const flag = params?.get('flag');
        this.flag.set(isFlag(flag) ? flag : '');
        if (params?.get('import') === 'users' && this.canWrite()) {
          this.importOpen.set(true);
        }
      });
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        this.lookups.ensureLoaded();
        this.loadSummary(orgId);
      });
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const flag = this.flag();
      const query: EmployeeListQuery = {
        q: this.q() || undefined,
        // Flags are about current staff; the backend ignores former people for them.
        status: flag ? undefined : statusesForFilter(this.status()),
        flag: flag || undefined,
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

  protected subtitle(e: Employee): string {
    const parts: string[] = [];
    const role = e.position?.name ?? e.job_title;
    if (role) {
      parts.push(role);
    }
    if (e.job_title && e.position?.name && !sameTitle(e.job_title, e.position.name)) {
      parts.push(e.job_title);
    }
    if (e.department?.name) {
      parts.push(e.department.name);
    }
    parts.push(this.language.translate(`people.employmentTypes.${e.employment_type}`));
    return parts.join(' · ');
  }

  /** The issues worth a badge in the list (gaps already have their own). */
  protected rowFlags(e: Employee): readonly EmployeeFlag[] {
    return (e.flags ?? []).filter((f) => f !== 'competence_gaps').slice(0, 1);
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

  protected setFlag(value: string): void {
    this.offset.set(0);
    const flag = isFlag(value) ? value : '';
    this.flag.set(flag);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { flag: flag || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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
    this.setFlag(f['flag'] ?? '');
    this.setType(f['type'] ?? '');
    this.setPosition(f['position'] ?? '');
    this.setDepartment(f['department'] ?? '');
    this.setSort(f['sort'] ?? 'name');
  }

  protected newEmployee(): void {
    void this.router.navigate(['/people/employees/new']);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.lastQuery);
  }

  protected onImported(): void {
    this.closeImport();
    this.loadSummary(this.selectedOrg.currentOrgId());
    this.reload();
  }

  protected closeImport(): void {
    this.importOpen.set(false);
    if (this.route.snapshot.queryParamMap.get('import')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { import: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
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
    this.lastQuery = query;
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

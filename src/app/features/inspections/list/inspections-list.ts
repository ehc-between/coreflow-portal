import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe, LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { Pager } from '../../../shared/ui/pager/pager';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { FILTER_STYLES, pick } from '../components/filter-styles';
import { InspectionsTabs } from '../components/inspections-tabs';
import {
  inspectionStatusKey,
  inspectionStatusTone,
  resultKey,
  resultTone,
} from '../data/inspection-display';
import {
  INSPECTIONS_MODULE,
  INSPECTION_RESULTS,
  INSPECTION_SORTS,
  INSPECTION_STATUSES,
  Inspection,
  InspectionListQuery,
  InspectionResult,
  InspectionSort,
  InspectionStats,
  InspectionStatus,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';

const PAGE_SIZE = 25;

/** i18n key suffix (`inspections.sort.<key>`) per sort option. */
export const INSPECTION_SORT_KEYS: Readonly<Record<InspectionSort, string>> = {
  due_at: 'dueAsc',
  '-due_at': 'dueDesc',
  '-created_at': 'createdDesc',
  '-completed_at': 'completedDesc',
  code: 'code',
};

/** `open` is a shorthand for planned + in progress (the default). */
type StatusFilter = InspectionStatus | 'open' | '';

export interface InspectionListFilters {
  readonly status: StatusFilter;
  readonly result: InspectionResult | '';
  readonly inspector: '' | 'me';
  readonly overdue: '' | 'true';
  readonly sort: InspectionSort;
}

export const DEFAULT_INSPECTION_FILTERS: InspectionListFilters = {
  status: 'open',
  result: '',
  inspector: '',
  overdue: '',
  sort: 'due_at',
};

export function parseInspectionFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): InspectionListFilters {
  return {
    status: pick<StatusFilter>(raw['status'], ['', 'open', ...INSPECTION_STATUSES], 'open'),
    result: pick(raw['result'], ['', ...INSPECTION_RESULTS], ''),
    inspector: pick(raw['inspector'], ['', 'me'] as const, ''),
    overdue: pick(raw['overdue'], ['', 'true'] as const, ''),
    sort: pick(raw['sort'], INSPECTION_SORTS, 'due_at'),
  };
}

export function toInspectionQuery(
  q: string,
  f: InspectionListFilters,
  offset: number,
): InspectionListQuery {
  const status: readonly InspectionStatus[] | undefined =
    f.status === 'open' ? ['planned', 'in_progress'] : f.status ? [f.status] : undefined;
  return {
    q: q.trim() || undefined,
    status,
    result: f.result || undefined,
    inspector: f.inspector || undefined,
    overdue: f.overdue === 'true' ? true : undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * Inspections (`/inspections`): key figures (open, overdue, pass rate, average score,
 * open findings), then search, filters (status, result, mine, overdue), sort, saved
 * views and paging over the org's inspections. Planning a new one needs
 * `inspections:write`. The empty state teaches how inspections work; a micro-lesson
 * explains checklists, scoring and findings.
 */
@Component({
  selector: 'app-inspections-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    GuideIntro,
    LessonView,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    LocalDayPipe,
    LocalPercentPipe,
    Badge,
    Button,
    Card,
    Icon,
    KpiTile,
    Pager,
    SlideOver,
    InspectionsTabs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="inspections.list.title"
      scope="inspections"
      searchPlaceholderKey="inspections.list.searchPlaceholder"
      [query]="query()"
      [filters]="viewFilters()"
      [empty]="isEmpty()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1.5 max-w-[680px]">
        <p class="text-[14px] text-fg-muted">{{ 'inspections.list.subtitle' | transloco }}</p>
        <app-inspections-tabs active="inspections" />
      </div>
      <app-tour-button toolbar scope="inspections" tour="list" />
      <app-button toolbar variant="secondary" (click)="lessonOpen.set(true)">
        <app-icon name="training" [size]="15" />
        {{ 'inspections.lesson.open' | transloco }}
      </app-button>
      <a
        toolbar
        *appHasPermission="'inspections:write'"
        routerLink="/inspections/new"
        appTourStep="inspections-new"
        data-testid="new-inspection"
      >
        <app-button>
          <app-icon name="plus" [size]="15" />
          {{ 'inspections.list.new' | transloco }}
        </app-button>
      </a>

      <ng-container ngProjectAs="[filters]">
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.status' | transloco"
          (change)="setFilter('status', $any($event.target).value)"
          appTourStep="inspections-filters"
          data-testid="filter-status"
        >
          <option value="open" [selected]="filters().status === 'open'">
            {{ 'inspections.filters.open' | transloco }}
          </option>
          <option value="" [selected]="filters().status === ''">
            {{ 'inspections.filters.allStatuses' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="s === filters().status">
              {{ statusKey(s) | transloco }}
            </option>
          }
        </select>
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.result' | transloco"
          (change)="setFilter('result', $any($event.target).value)"
        >
          <option value="">{{ 'inspections.filters.anyResult' | transloco }}</option>
          @for (r of results; track r) {
            <option [value]="r" [selected]="r === filters().result">
              {{ resultKey(r) | transloco }}
            </option>
          }
        </select>
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.inspector' | transloco"
          (change)="setFilter('inspector', $any($event.target).value)"
        >
          <option value="" [selected]="filters().inspector === ''">
            {{ 'inspections.filters.anyInspector' | transloco }}
          </option>
          <option value="me" [selected]="filters().inspector === 'me'">
            {{ 'inspections.filters.mine' | transloco }}
          </option>
        </select>
        <label class="cf-check">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="filters().overdue === 'true'"
            (change)="setFilter('overdue', $any($event.target).checked ? 'true' : '')"
            data-testid="filter-overdue"
          />
          {{ 'inspections.filters.overdue' | transloco }}
        </label>
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.sort' | transloco"
          (change)="setFilter('sort', $any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === filters().sort">
              {{ 'inspections.sort.' + sortKeys[s] | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <app-guide-intro class="mb-3 block" scope="inspections" page="list" />

      @if (stats(); as st) {
        <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="stats">
          <app-kpi-tile
            [label]="t('inspections.stats.open')"
            [value]="(st.by_status.planned ?? 0) + (st.by_status.in_progress ?? 0)"
            tone="info"
          />
          <app-kpi-tile
            [label]="t('inspections.stats.overdue')"
            [value]="st.overdue"
            [tone]="st.overdue ? 'fail' : 'neutral'"
          />
          <app-kpi-tile
            [label]="t('inspections.stats.passRate')"
            [value]="passRate() === null ? '—' : (passRate() | localPercent)"
            tone="pass"
          />
          <app-kpi-tile
            [label]="t('inspections.stats.averageScore')"
            [value]="st.average_score_pct === null ? '—' : (st.average_score_pct | localPercent)"
            tone="accent"
          />
          <app-kpi-tile
            [label]="t('inspections.stats.openFindings')"
            [value]="st.open_findings"
            [tone]="st.open_findings ? 'warn' : 'neutral'"
          />
        </div>
      }

      <app-card [padded]="false">
        @if (loading() && items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        } @else if (items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted" data-testid="no-matches">
            {{ 'inspections.list.noMatches' | transloco }}
          </p>
        } @else {
          <ul [attr.aria-busy]="loading()" data-testid="inspection-rows">
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/inspections', row.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap"
                >
                  <span class="w-[76px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1 basis-[200px]">
                    <span class="block truncate font-semibold text-fg">{{ row.title }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      {{ row.template?.title ?? ('inspections.list.noTemplate' | transloco) }}
                      @if (row.location) {
                        · {{ row.location }}
                      }
                      ·
                      {{
                        'inspections.list.answered'
                          | transloco: { answered: row.answered_count, total: row.question_count }
                      }}
                    </span>
                  </span>
                  <app-badge [tone]="statusTone(row.status)">{{
                    statusKey(row.status) | transloco
                  }}</app-badge>
                  @if (row.result) {
                    <app-badge [tone]="resultTone(row.result)">
                      {{ resultKey(row.result) | transloco }}
                      @if (row.score_pct !== null) {
                        · {{ row.score_pct | localPercent }}
                      }
                    </app-badge>
                  }
                  @if (row.open_finding_count > 0) {
                    <app-badge tone="warn">{{
                      'inspections.list.openFindings' | transloco: { count: row.open_finding_count }
                    }}</app-badge>
                  }
                  <span
                    class="hidden w-[130px] flex-none truncate text-right text-[12.5px] text-fg-subtle md:block"
                  >
                    {{ row.inspector?.name ?? ('inspections.list.noInspector' | transloco) }}
                  </span>
                  <span class="w-[110px] flex-none text-right text-[12.5px]">
                    @if (row.status === 'completed' && row.completed_at) {
                      <span class="text-fg-subtle">{{ row.completed_at | localDay }}</span>
                    } @else if (row.due_at) {
                      <span
                        [class.text-fail]="row.is_overdue"
                        [class.font-semibold]="row.is_overdue"
                        [class.text-fg-subtle]="!row.is_overdue"
                        [attr.title]="'inspections.fields.dueAt' | transloco"
                      >
                        {{ row.due_at | localDay }}
                      </span>
                      @if (row.is_overdue) {
                        <span class="sr-only">{{ 'inspections.list.overdue' | transloco }}</span>
                      }
                    } @else {
                      <span class="text-fg-subtle">—</span>
                    }
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </app-card>
      <div class="mt-3">
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      </div>
      <app-why-it-matters class="mt-5 block" scope="inspections" page="list" />

      <div empty>
        <app-guide-intro class="mb-3 block" scope="inspections" page="list" />
        <app-card>
          <app-teaching-empty
            scope="inspections"
            page="list"
            [showAction]="canWrite()"
            (action)="create()"
          />
          <p class="mt-3 text-center text-[13px]">
            <a
              routerLink="/inspections/templates"
              class="font-semibold text-accent hover:underline"
            >
              {{ 'inspections.list.browseTemplates' | transloco }}
            </a>
          </p>
        </app-card>
        <app-why-it-matters class="mt-5 block" scope="inspections" page="list" />
      </div>
    </app-record-list-page>

    <app-slide-over
      [open]="lessonOpen()"
      [title]="'inspections.lesson.title' | transloco"
      [closeLabel]="'inspections.actions.close' | transloco"
      [width]="560"
      (closed)="lessonOpen.set(false)"
    >
      @if (lessonOpen()) {
        <app-lesson scope="inspections" lesson="inspection-basics" />
      }
    </app-slide-over>
  `,
  styles: [FILTER_STYLES],
})
export class InspectionsList {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statuses = INSPECTION_STATUSES;
  protected readonly results = INSPECTION_RESULTS;
  protected readonly sorts = INSPECTION_SORTS;
  protected readonly sortKeys = INSPECTION_SORT_KEYS;
  protected readonly statusKey = inspectionStatusKey;
  protected readonly statusTone = inspectionStatusTone;
  protected readonly resultKey = resultKey;
  protected readonly resultTone = resultTone;

  protected readonly query = signal('');
  protected readonly filters = signal<InspectionListFilters>(
    parseInspectionFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Inspection[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly stats = signal<InspectionStats | null>(null);
  private readonly loaded = signal(false);
  protected readonly lessonOpen = signal(false);

  protected readonly canWrite = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('inspections:write') ?? false,
  );

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));

  protected readonly passRate = computed(() => {
    const st = this.stats();
    const done = st ? st.passed + st.failed : 0;
    return st && done > 0 ? Math.round((1000 * st.passed) / done) / 10 : null;
  });

  /** The org has no inspections at all (not just no matches): teach instead. */
  protected readonly isEmpty = computed(() => {
    const st = this.stats();
    const all = st ? Object.values(st.by_status).reduce((a, b) => a + (b ?? 0), 0) : null;
    return this.loaded() && this.total() === 0 && !this.query().trim() && all === 0;
  });

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: 'inspection',
      view: 'list',
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const q = this.query();
      const filters = this.filters();
      const offset = this.offset();
      if (!orgId) {
        return;
      }
      untracked(() => this.load(orgId, q, filters, offset));
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId) {
        untracked(() =>
          this.api.stats(orgId).subscribe({
            next: (s) => this.stats.set(s),
            error: () => this.stats.set(null),
          }),
        );
      }
    });
  }

  protected t(key: string): string {
    return this.language.translate(key);
  }

  private load(orgId: string, q: string, filters: InspectionListFilters, offset: number): void {
    this.loading.set(true);
    this.api.list(orgId, toInspectionQuery(q, filters, offset)).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  protected onSearch(text: string): void {
    this.offset.set(0);
    this.query.set(text);
  }

  protected setFilter(key: keyof InspectionListFilters, value: string): void {
    this.offset.set(0);
    this.filters.set(parseInspectionFilters({ ...this.filters(), [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(parseInspectionFilters(view.filters));
  }

  protected create(): void {
    void this.router.navigate(['/inspections/new']);
  }
}

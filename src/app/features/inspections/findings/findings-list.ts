import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { FILTER_STYLES, pick } from '../components/filter-styles';
import { InspectionsTabs } from '../components/inspections-tabs';
import {
  findingStatusKey,
  findingStatusTone,
  severityKey,
  severityTone,
} from '../data/inspection-display';
import {
  FINDING_SORTS,
  FINDING_STATUSES,
  Finding,
  FindingListQuery,
  FindingSort,
  FindingStatus,
  INSPECTIONS_MODULE,
  SEVERITIES,
  Severity,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';

const PAGE_SIZE = 25;

export const FINDING_SORT_KEYS: Readonly<Record<FindingSort, string>> = {
  '-created_at': 'createdDesc',
  due_at: 'dueAsc',
  severity: 'severity',
  code: 'code',
};

export interface FindingListFilters {
  readonly status: FindingStatus | '';
  readonly severity: Severity | '';
  readonly owner: '' | 'me';
  readonly deviation: '' | 'true' | 'false';
  readonly sort: FindingSort;
}

export const DEFAULT_FINDING_FILTERS: FindingListFilters = {
  status: 'open',
  severity: '',
  owner: '',
  deviation: '',
  sort: '-created_at',
};

export function parseFindingFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): FindingListFilters {
  return {
    status: pick<FindingStatus | ''>(raw['status'], ['', ...FINDING_STATUSES], 'open'),
    severity: pick(raw['severity'], ['', ...SEVERITIES], ''),
    owner: pick(raw['owner'], ['', 'me'] as const, ''),
    deviation: pick(raw['deviation'], ['', 'true', 'false'] as const, ''),
    sort: pick(raw['sort'], FINDING_SORTS, '-created_at'),
  };
}

export function toFindingQuery(q: string, f: FindingListFilters, offset: number): FindingListQuery {
  return {
    q: q.trim() || undefined,
    status: f.status ? [f.status] : undefined,
    severity: f.severity ? [f.severity] : undefined,
    owner: f.owner || undefined,
    has_deviation: f.deviation === '' ? undefined : f.deviation === 'true',
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * Findings (`/inspections/findings`): every finding raised by an inspection, with
 * filters (status, severity, mine, with/without a deviation), sort, saved views and
 * paging. A row opens the finding on its inspection (`?finding=`).
 */
@Component({
  selector: 'app-findings-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    RecordListPage,
    LocalDayPipe,
    Badge,
    Card,
    Icon,
    Pager,
    InspectionsTabs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="inspections.findings.title"
      scope="inspections"
      page="findings"
      searchPlaceholderKey="inspections.findings.searchPlaceholder"
      [query]="query()"
      [filters]="viewFilters()"
      [empty]="isEmpty()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1.5 max-w-[680px]">
        <p class="text-[14px] text-fg-muted">{{ 'inspections.findings.subtitle' | transloco }}</p>
        <app-inspections-tabs active="findings" />
      </div>

      <ng-container ngProjectAs="[filters]">
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.status' | transloco"
          (change)="setFilter('status', $any($event.target).value)"
          data-testid="finding-filter-status"
        >
          <option value="" [selected]="filters().status === ''">
            {{ 'inspections.filters.allStatuses' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="s === filters().status">
              {{ findingStatusKey(s) | transloco }}
            </option>
          }
        </select>
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.severity' | transloco"
          (change)="setFilter('severity', $any($event.target).value)"
        >
          <option value="">{{ 'inspections.filters.anySeverity' | transloco }}</option>
          @for (s of severities; track s) {
            <option [value]="s" [selected]="s === filters().severity">
              {{ severityKey(s) | transloco }}
            </option>
          }
        </select>
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.owner' | transloco"
          (change)="setFilter('owner', $any($event.target).value)"
        >
          <option value="" [selected]="filters().owner === ''">
            {{ 'inspections.filters.anyOwner' | transloco }}
          </option>
          <option value="me" [selected]="filters().owner === 'me'">
            {{ 'inspections.filters.ownedByMe' | transloco }}
          </option>
        </select>
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.deviation' | transloco"
          (change)="setFilter('deviation', $any($event.target).value)"
        >
          <option value="" [selected]="filters().deviation === ''">
            {{ 'inspections.filters.deviationAny' | transloco }}
          </option>
          <option value="true" [selected]="filters().deviation === 'true'">
            {{ 'inspections.filters.deviationYes' | transloco }}
          </option>
          <option value="false" [selected]="filters().deviation === 'false'">
            {{ 'inspections.filters.deviationNo' | transloco }}
          </option>
        </select>
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

      <app-guide-intro class="mb-3 block" scope="inspections" page="findings" />

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
          <ul [attr.aria-busy]="loading()" data-testid="finding-rows">
            @for (f of items(); track f.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/inspections', f.inspection?.id ?? '']"
                  [queryParams]="{ finding: f.id }"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap"
                >
                  <span class="w-[76px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    f.code
                  }}</span>
                  <span class="min-w-0 flex-1 basis-[200px]">
                    <span class="block truncate font-semibold text-fg">{{ f.title }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      @if (f.inspection; as ins) {
                        {{ ins.code }} · {{ ins.title }}
                      }
                    </span>
                  </span>
                  <app-badge [tone]="severityTone(f.severity)">{{
                    severityKey(f.severity) | transloco
                  }}</app-badge>
                  <app-badge [tone]="findingStatusTone(f.status)">{{
                    findingStatusKey(f.status) | transloco
                  }}</app-badge>
                  @if (f.deviation; as dev) {
                    <app-badge tone="accent">
                      <app-icon name="flag" [size]="12" />
                      {{ dev.code }}
                    </app-badge>
                  }
                  <span
                    class="hidden w-[130px] flex-none truncate text-right text-[12.5px] text-fg-subtle md:block"
                  >
                    {{ f.owner?.name ?? ('inspections.findings.noOwner' | transloco) }}
                  </span>
                  <span class="w-[100px] flex-none text-right text-[12.5px]">
                    @if (f.due_at) {
                      <span
                        [class.text-fail]="f.is_overdue"
                        [class.font-semibold]="f.is_overdue"
                        [class.text-fg-subtle]="!f.is_overdue"
                      >
                        {{ f.due_at | localDay }}
                      </span>
                      @if (f.is_overdue) {
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
      <app-why-it-matters class="mt-5 block" scope="inspections" page="findings" />

      <div empty>
        <app-guide-intro class="mb-3 block" scope="inspections" page="findings" />
        <app-card>
          <app-teaching-empty scope="inspections" page="findings" [showAction]="false" />
        </app-card>
        <app-why-it-matters class="mt-5 block" scope="inspections" page="findings" />
      </div>
    </app-record-list-page>
  `,
  styles: [FILTER_STYLES],
})
export class FindingsList {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly route = inject(ActivatedRoute);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statuses = FINDING_STATUSES;
  protected readonly severities = SEVERITIES;
  protected readonly sorts = FINDING_SORTS;
  protected readonly sortKeys = FINDING_SORT_KEYS;
  protected readonly severityKey = severityKey;
  protected readonly severityTone = severityTone;
  protected readonly findingStatusKey = findingStatusKey;
  protected readonly findingStatusTone = findingStatusTone;

  protected readonly query = signal('');
  protected readonly filters = signal<FindingListFilters>(
    parseFindingFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Finding[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  private readonly loaded = signal(false);

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));

  protected readonly isEmpty = computed(
    () =>
      this.loaded() &&
      this.total() === 0 &&
      !this.query().trim() &&
      JSON.stringify(this.filters()) === JSON.stringify(DEFAULT_FINDING_FILTERS),
  );

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: 'inspection_finding',
      view: 'list',
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const q = this.query();
      const filters = this.filters();
      const offset = this.offset();
      if (orgId) {
        untracked(() => this.load(orgId, q, filters, offset));
      }
    });
  }

  private load(orgId: string, q: string, filters: FindingListFilters, offset: number): void {
    this.loading.set(true);
    this.api.listFindings(orgId, toFindingQuery(q, filters, offset)).subscribe({
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

  protected setFilter(key: keyof FindingListFilters, value: string): void {
    this.offset.set(0);
    this.filters.set(parseFindingFilters({ ...this.filters(), [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(parseFindingFilters(view.filters));
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { ContextApi } from '../data/context-api';
import {
  ContextAnalysis,
  ContextKind,
  ContextRecord,
  InterestedParty,
  Policy,
  Responsibility,
  ScopeStatement,
} from '../data/context.models';
import {
  KINDS,
  addressedTone,
  asKind,
  categoriesFor,
  priorityTone,
  statusTone,
} from '../context-kinds';
import { injectContextPermissions } from '../context-permissions';
import { ContextLessonButton } from '../ui/context-lesson-button';
import { ContextNav } from '../ui/context-nav';
import { ContextFilter } from '../ui/filter-select';
import { SORT_OPTIONS, cleanFilters, listFilters, toListQuery } from './list-config';

const PAGE_SIZE = 25;

/** The lesson offered on each register's list. */
const LIST_LESSON: Readonly<Record<ContextKind, string>> = {
  analysis: 'context-foundation',
  party: 'interested-parties',
  scope: 'context-foundation',
  policy: 'policies-and-raci',
  responsibility: 'policies-and-raci',
};

/**
 * A register list (`/context/<segment>`, the kind comes from route data):
 * search, status and per-kind filters, sort, saved views, pagination, and a
 * teaching empty state. Filters are mirrored in the URL so drill-downs from the
 * overview (and reloads) keep them.
 */
@Component({
  selector: 'app-context-list',
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
    Alert,
    Badge,
    Button,
    Icon,
    Pager,
    ContextFilter,
    ContextLessonButton,
    ContextNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      [titleKey]="'context.kinds.' + kind() + '.plural'"
      scope="context"
      [page]="cfg().segment"
      [searchPlaceholderKey]="'context.list.searchPlaceholder'"
      [query]="query()"
      [filters]="filters()"
      [empty]="ready() && rows().length === 0 && !hasCriteria()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <app-context-nav />
      </div>

      <ng-container toolbar>
        <app-tour-button scope="context" [tour]="cfg().guidance" />
        @if (kind() === 'responsibility') {
          <a routerLink="/context/responsibilities/matrix" tabindex="-1">
            <app-button variant="secondary">
              <app-icon name="people" [size]="15" />
              {{ 'context.raci.matrixLink' | transloco }}
            </app-button>
          </a>
        }
        @if (perms.canWrite()) {
          <a [routerLink]="newLink()" tabindex="-1" [appTourStep]="'context-new-' + kind()">
            <app-button data-testid="context-new">
              <app-icon name="plus" [size]="15" />
              {{ 'context.kinds.' + kind() + '.new' | transloco }}
            </app-button>
          </a>
        }
      </ng-container>

      <ng-container filters>
        @for (filter of filterDefs(); track filter.key) {
          <app-context-filter
            [labelKey]="filter.labelKey"
            [allKey]="filter.allKey"
            [options]="filter.options"
            [value]="filters()[filter.key] ?? ''"
            (valueChange)="setFilter(filter.key, $event)"
          />
        }
        <app-context-filter
          labelKey="context.filters.sort"
          allKey="context.sort.desc_updated_at"
          [options]="sortOptions"
          [value]="filters()['sort'] ?? ''"
          (valueChange)="setFilter('sort', $event)"
        />
      </ng-container>

      <div class="mb-4 flex flex-col gap-3">
        <app-guide-intro scope="context" [page]="cfg().guidance + '-list'" />
      </div>

      @if (error()) {
        <app-alert tone="error">{{ 'context.list.loadError' | transloco }}</app-alert>
      } @else if (!ready()) {
        <p class="text-[13.5px] text-fg-muted">{{ 'context.common.loading' | transloco }}</p>
      } @else if (rows().length === 0) {
        <p
          class="rounded-card border border-border bg-surface p-6 text-center text-[13.5px] text-fg-muted"
        >
          {{ 'context.list.noMatches' | transloco }}
        </p>
      } @else {
        <div class="overflow-x-auto rounded-card border border-border bg-surface">
          <table class="w-full min-w-[640px] text-left text-[13px]">
            <caption class="sr-only">
              {{
                'context.kinds.' + kind() + '.plural' | transloco
              }}
            </caption>
            <thead class="border-b border-border text-[12px] text-fg-subtle">
              <tr>
                <th scope="col" class="px-3 py-2 font-semibold">
                  {{ 'context.fields.code' | transloco }}
                </th>
                <th scope="col" class="px-3 py-2 font-semibold">
                  {{
                    (kind() === 'party' ? 'context.fields.name' : 'context.fields.title')
                      | transloco
                  }}
                </th>
                @switch (kind()) {
                  @case ('analysis') {
                    <th scope="col" class="px-3 py-2 font-semibold">
                      {{ 'context.fields.method' | transloco }}
                    </th>
                    <th scope="col" class="hidden px-3 py-2 font-semibold md:table-cell">
                      {{ 'context.fields.items' | transloco }}
                    </th>
                  }
                  @case ('party') {
                    <th scope="col" class="px-3 py-2 font-semibold">
                      {{ 'context.fields.category' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 font-semibold">
                      {{ 'context.fields.priority' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 font-semibold">
                      {{ 'context.fields.addressedStatus' | transloco }}
                    </th>
                  }
                  @case ('scope') {
                    <th scope="col" class="px-3 py-2 font-semibold">
                      {{ 'context.fields.framework' | transloco }}
                    </th>
                  }
                  @case ('policy') {
                    <th scope="col" class="px-3 py-2 font-semibold">
                      {{ 'context.fields.kind' | transloco }}
                    </th>
                  }
                  @case ('responsibility') {
                    <th scope="col" class="hidden px-3 py-2 font-semibold md:table-cell">
                      {{ 'context.fields.area' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 font-semibold">
                      {{ 'context.fields.assignments' | transloco }}
                    </th>
                  }
                }
                <th scope="col" class="px-3 py-2 font-semibold">
                  {{ 'context.fields.status' | transloco }}
                </th>
                <th scope="col" class="hidden px-3 py-2 font-semibold md:table-cell">
                  {{ 'context.fields.owner' | transloco }}
                </th>
                <th scope="col" class="hidden px-3 py-2 font-semibold lg:table-cell">
                  {{ 'context.fields.nextReview' | transloco }}
                </th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.id) {
                <tr class="border-b border-border last:border-b-0 hover:bg-surface-2">
                  <td class="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap text-fg-muted">
                    {{ row.code }}
                  </td>
                  <td class="px-3 py-2.5">
                    <a
                      [routerLink]="row.url"
                      class="font-semibold text-fg hover:text-accent hover:underline"
                    >
                      {{ titleOf(row) }}
                    </a>
                  </td>
                  @switch (kind()) {
                    @case ('analysis') {
                      <td class="px-3 py-2.5">
                        <app-badge tone="accent">{{
                          'context.methods.' + asAnalysis(row).method | transloco
                        }}</app-badge>
                      </td>
                      <td class="hidden px-3 py-2.5 text-[12px] text-fg-muted md:table-cell">
                        @for (entry of countEntries(asAnalysis(row)); track entry.category) {
                          <span class="mr-2 whitespace-nowrap"
                            >{{ 'context.categories.' + entry.category | transloco }}
                            {{ entry.count }}</span
                          >
                        }
                      </td>
                    }
                    @case ('party') {
                      <td class="px-3 py-2.5 text-fg-muted">
                        {{ 'context.partyCategories.' + asParty(row).category | transloco }}
                        <span class="block text-[11.5px] text-fg-subtle">
                          {{ 'context.partyTypes.' + asParty(row).party_type | transloco }}
                        </span>
                      </td>
                      <td class="px-3 py-2.5">
                        <app-badge [tone]="priorityTone(asParty(row).priority)">
                          {{ 'context.priorities.' + asParty(row).priority | transloco }}
                        </app-badge>
                      </td>
                      <td class="px-3 py-2.5">
                        <app-badge [tone]="addressedTone(asParty(row).addressed_status)">
                          {{ 'context.addressed.' + asParty(row).addressed_status | transloco }}
                        </app-badge>
                      </td>
                    }
                    @case ('scope') {
                      <td class="px-3 py-2.5 text-fg-muted">
                        {{ 'context.frameworks.' + asScope(row).framework | transloco }}
                      </td>
                    }
                    @case ('policy') {
                      <td class="px-3 py-2.5 text-fg-muted">
                        {{ 'context.policyKinds.' + asPolicy(row).kind | transloco }}
                      </td>
                    }
                    @case ('responsibility') {
                      <td class="hidden px-3 py-2.5 text-fg-muted md:table-cell">
                        {{ asRaci(row).area || '–' }}
                      </td>
                      <td class="px-3 py-2.5">
                        <span class="text-fg-muted">
                          {{
                            'context.raci.assignmentCount'
                              | transloco: { count: asRaci(row).assignments.length }
                          }}
                        </span>
                        @for (warning of asRaci(row).warnings; track warning) {
                          <app-badge tone="warn" class="ml-1">{{
                            'context.raci.warnings.' + warning | transloco
                          }}</app-badge>
                        }
                      </td>
                    }
                  }
                  <td class="px-3 py-2.5 whitespace-nowrap">
                    <app-badge [tone]="statusTone(statusOf(row))">
                      {{ 'context.status.' + statusOf(row) | transloco }}
                    </app-badge>
                    @if (versionOf(row); as version) {
                      <span class="ml-1 text-[11.5px] text-fg-subtle">
                        {{ 'context.common.version' | transloco: { version } }}
                      </span>
                    }
                  </td>
                  <td class="hidden px-3 py-2.5 text-fg-muted md:table-cell">
                    {{ row.owner?.name || ('context.fields.noOwner' | transloco) }}
                  </td>
                  <td class="hidden px-3 py-2.5 whitespace-nowrap lg:table-cell">
                    @if (nextReview(row); as next) {
                      <span
                        [class.text-fail]="overdue(row)"
                        [class.font-semibold]="overdue(row)"
                        [class.text-fg-muted]="!overdue(row)"
                      >
                        {{ next | localDay }}
                      </span>
                    } @else {
                      <span class="text-fg-subtle">–</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="mt-3">
          <app-pager
            [offset]="offset()"
            [pageSize]="pageSize"
            [count]="rows().length"
            [total]="total()"
            (pageChange)="goTo($event)"
          />
        </div>
      }

      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <app-why-it-matters scope="context" [page]="cfg().guidance + '-list'" />
        <div class="flex flex-col items-start gap-2">
          <app-context-lesson-button [lessonKey]="lesson()" />
        </div>
      </div>

      <div empty>
        <app-teaching-empty
          scope="context"
          [page]="cfg().guidance + '-list'"
          [showAction]="perms.canWrite()"
          (action)="createNew()"
        />
        <div class="mt-4 flex flex-col items-start gap-2">
          <app-guide-intro scope="context" [page]="cfg().guidance + '-list'" />
          <app-context-lesson-button [lessonKey]="lesson()" />
        </div>
      </div>
    </app-record-list-page>
  `,
})
export class ContextList {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Route data (component input binding). */
  readonly contextKind = input<unknown>(undefined);

  protected readonly kind = computed(() => asKind(this.contextKind()));
  protected readonly cfg = computed(() => KINDS[this.kind()]);
  protected readonly filterDefs = computed(() => listFilters(this.kind()));
  protected readonly lesson = computed(() => LIST_LESSON[this.kind()]);
  protected readonly newLink = computed(() => `/context/${this.cfg().segment}/new`);

  protected readonly perms = injectContextPermissions();
  protected readonly sortOptions = SORT_OPTIONS.slice(1);
  protected readonly pageSize = PAGE_SIZE;

  protected readonly query = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly filters = signal<Readonly<Record<string, string>>>({});
  protected readonly offset = signal(0);
  protected readonly rows = signal<readonly ContextRecord[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly ready = signal(false);
  protected readonly error = signal(false);
  protected readonly hasCriteria = computed(
    () => !!this.query().trim() || Object.keys(this.filters()).some((k) => k !== 'sort'),
  );

  protected readonly statusTone = statusTone;
  protected readonly priorityTone = priorityTone;
  protected readonly addressedTone = addressedTone;

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'context',
      entityType: this.cfg().entityType,
      view: 'list',
    }));
    // Restore filters from the URL once the kind is known.
    effect(() => {
      const kind = this.kind();
      untracked(() => {
        const params: Record<string, string> = {};
        for (const key of this.route.snapshot.queryParamMap.keys) {
          params[key] = this.route.snapshot.queryParamMap.get(key) ?? '';
        }
        this.filters.set(cleanFilters(kind, params));
      });
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const kind = this.kind();
      const q = this.query();
      const filters = this.filters();
      const offset = this.offset();
      untracked(() => this.load(orgId, kind, q, filters, offset));
    });
  }

  protected onSearch(text: string): void {
    this.query.set(text);
    this.offset.set(0);
    this.syncUrl();
  }

  protected setFilter(key: string, value: string): void {
    this.filters.update((current) => {
      const next = { ...current };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
    this.offset.set(0);
    this.syncUrl();
  }

  protected applyView(view: SavedView): void {
    this.filters.set(cleanFilters(this.kind(), view.filters));
    this.offset.set(0);
    this.syncUrl();
  }

  protected goTo(offset: number): void {
    this.offset.set(offset);
  }

  protected createNew(): void {
    void this.router.navigateByUrl(this.newLink());
  }

  // --- row helpers (typed views of the union) ---------------------------------------

  protected asAnalysis(row: ContextRecord): ContextAnalysis {
    return row as ContextAnalysis;
  }
  protected asParty(row: ContextRecord): InterestedParty {
    return row as InterestedParty;
  }
  protected asScope(row: ContextRecord): ScopeStatement {
    return row as ScopeStatement;
  }
  protected asPolicy(row: ContextRecord): Policy {
    return row as Policy;
  }
  protected asRaci(row: ContextRecord): Responsibility {
    return row as Responsibility;
  }

  protected titleOf(row: ContextRecord): string {
    return 'name' in row ? row.name : row.title;
  }

  protected statusOf(row: ContextRecord): string {
    return row.status;
  }

  protected versionOf(row: ContextRecord): number | null {
    return 'version_no' in row ? row.version_no : null;
  }

  protected nextReview(row: ContextRecord): string | null {
    return row.next_review_at ?? null;
  }

  protected overdue(row: ContextRecord): boolean {
    if ('review_overdue' in row) {
      return row.review_overdue;
    }
    const next = row.next_review_at;
    return !!next && next.slice(0, 10) < new Date().toISOString().slice(0, 10);
  }

  protected countEntries(row: ContextAnalysis): { category: string; count: number }[] {
    return categoriesFor(row.method).map((category) => ({
      category,
      count: row.counts[category] ?? 0,
    }));
  }

  private syncUrl(): void {
    const q = this.query().trim();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...this.filters(), ...(q ? { q } : {}) },
      replaceUrl: true,
    });
  }

  private load(
    orgId: string | null,
    kind: ContextKind,
    q: string,
    filters: Readonly<Record<string, string>>,
    offset: number,
  ): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.error.set(false);
    this.request = this.api
      .list(orgId, kind, toListQuery(kind, q, filters, offset, PAGE_SIZE))
      .subscribe({
        next: (page) => {
          this.rows.set(page.items);
          this.total.set(page.total);
          this.ready.set(true);
        },
        error: () => {
          this.error.set(true);
          this.ready.set(true);
        },
      });
  }
}

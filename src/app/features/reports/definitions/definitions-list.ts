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
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Pager } from '../../../shared/ui/pager/pager';
import { ReportsNav } from '../components/reports-nav';
import { reportErrorKey } from '../data/report-errors';
import { clauseText, localized } from '../data/report-display';
import {
  DEFINITION_SORTS,
  DefinitionSort,
  REPORTS_MODULE,
  REPORTS_PERMISSIONS,
  Register,
  ReportDefinition,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { pluralKey } from '../../../shared/i18n/plural';

const PAGE_SIZE = 25;

export type OwnerFilter = 'all' | 'me';
export const OWNER_FILTERS: readonly OwnerFilter[] = ['all', 'me'];

/**
 * `/reports/custom`: saved reports (a register with its filters, columns,
 * format and language) that anyone can run again in one click. Each row says what
 * it exports, which requirements it is evidence for, when it last ran and whether
 * it is scheduled. Search, filter by register and owner, sort, saved views.
 */
@Component({
  selector: 'app-definitions-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    Pager,
    ReportsNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="reports.definitions.title"
      descriptionKey="reports.definitions.subtitle"
      [breadcrumbs]="[
        { labelKey: 'reports.hub.title', link: '/reports' },
        { labelKey: 'reports.nav.definitions' },
      ]"
      scope="reports"
      page="definitions"
      searchPlaceholderKey="reports.definitions.search"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="sort() !== 'name' ? 1 : 0"
      [empty]="loaded() && !error() && items().length === 0 && !filtered()"
      (search)="setSearch($event)"
      (viewApplied)="applyView($event)"
    >
      @if (canWrite()) {
        <app-button primary [appTourStep]="'reports-new-definition'" (click)="create()">
          <app-icon name="plus" [size]="15" />
          {{ 'reports.definitions.new' | transloco }}
        </app-button>
      }
      <app-reports-nav nav />
      <app-help-strip help scope="reports" page="definitions" tour="definitions" />

      <ng-container filters>
        <label for="def-register" class="sr-only">{{
          'reports.definitions.register' | transloco
        }}</label>
        <select
          id="def-register"
          class="h-10 max-w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg"
          (change)="registerKey.set($any($event.target).value || null); offset.set(0)"
        >
          <option value="" [selected]="!registerKey()">
            {{ 'reports.definitions.allRegisters' | transloco }}
          </option>
          @for (reg of registers(); track reg.key) {
            <option [value]="reg.key" [selected]="reg.key === registerKey()">
              {{ registerName(reg.label, reg.key) }}
            </option>
          }
        </select>
        <label for="def-owner" class="sr-only">{{ 'reports.definitions.owner' | transloco }}</label>
        <select
          id="def-owner"
          class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
          (change)="owner.set($any($event.target).value); offset.set(0)"
        >
          @for (o of owners; track o) {
            <option [value]="o" [selected]="o === owner()">
              {{ 'reports.definitions.owners.' + o | transloco }}
            </option>
          }
        </select>
      </ng-container>
      <div more-filters class="flex flex-col gap-1 empty:hidden">
        <label for="def-sort" class="text-meta font-semibold text-fg-muted">{{
          'reports.definitions.sortLabel' | transloco
        }}</label>
        <select
          id="def-sort"
          class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
          (change)="sort.set($any($event.target).value); offset.set(0)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === sort()">
              {{ 'reports.definitions.sorts.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </div>

      @if (error(); as key) {
        <app-error-state [bodyKey]="key" (retry)="reload()" />
      } @else if (!loaded()) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-empty-state
          titleKey="ui.empty.noResults"
          bodyKey="ui.empty.noResultsBody"
          ctaKey="ui.empty.clearFilters"
          ctaVariant="secondary"
          (cta)="clearFilters()"
        />
      } @else {
        <app-card [padded]="false">
          <ul class="divide-y divide-border" data-testid="definitions">
            @for (d of items(); track d.id) {
              <li
                class="relative flex flex-col gap-2 px-4 py-3 hover:bg-surface-2 lg:flex-row lg:items-center lg:gap-4"
              >
                <div class="min-w-0 flex-1">
                  <a
                    [routerLink]="['/reports/custom', d.id]"
                    class="block truncate text-body font-semibold text-fg after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:rounded-tile focus-visible:after:ring-2 focus-visible:after:ring-accent"
                  >
                    {{ d.name }}
                  </a>
                  <p class="mt-0.5 truncate text-meta text-fg-muted">
                    {{ registerName(d.register_label, d.register_key) }} ·
                    {{ 'reports.formats.' + d.default_format | transloco }} ·
                    {{ 'reports.langs.' + d.lang | transloco }}
                    @if (d.owner?.name; as ownerName) {
                      · {{ 'reports.definitions.ownedBy' | transloco: { name: ownerName } }}
                    }
                  </p>
                  @if (clauses(d).length) {
                    <p class="mt-1 truncate text-meta text-fg-subtle">
                      {{ 'reports.registers.evidenceFor' | transloco }}
                      {{ clauses(d).join(', ') }}
                    </p>
                  }
                </div>
                <div class="relative z-10 flex flex-wrap items-center gap-1.5">
                  <app-coverage-chip entityType="report_definition" [entityId]="d.id" />
                  @if (d.schedule) {
                    <app-badge tone="info">
                      <app-icon name="clock" [size]="12" />
                      {{ 'reports.definitions.scheduled' | transloco }}
                    </app-badge>
                  }
                </div>
                <p class="flex-none text-meta text-fg-subtle lg:w-[190px] lg:text-right">
                  @if (lastRunAt(d); as at) {
                    {{ 'reports.definitions.lastExported' | transloco: { date: (at | localDate) } }}
                    @if (d.run_count) {
                      <span class="block">{{
                        plural('reports.definitions.runCount', d.run_count)
                          | transloco: { count: d.run_count }
                      }}</span>
                    }
                  } @else {
                    {{ 'reports.definitions.neverExported' | transloco }}
                  }
                </p>
              </li>
            }
          </ul>
        </app-card>
        <app-pager
          class="mt-3 block"
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <div empty>
        <app-card>
          <app-teaching-empty
            scope="reports"
            page="definitions"
            [showAction]="canWrite()"
            (action)="create()"
          />
        </app-card>
      </div>

      <app-why-it-matters below scope="reports" page="definitions" />
    </app-record-list-page>
  `,
})
export class DefinitionsList {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  protected readonly owners = OWNER_FILTERS;
  protected readonly plural = pluralKey;
  protected readonly sorts = DEFINITION_SORTS;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly q = signal('');
  protected readonly registerKey = signal<string | null>(null);
  protected readonly owner = signal<OwnerFilter>('all');
  protected readonly sort = signal<DefinitionSort>('name');
  protected readonly offset = signal(0);

  protected readonly items = signal<readonly ReportDefinition[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly registers = signal<readonly Register[]>([]);

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(REPORTS_PERMISSIONS.write),
  );

  /** Whether a search or filter narrows the list (an empty result is then "no match"). */
  protected readonly filtered = computed(
    () => !!this.q().trim() || !!this.registerKey() || this.owner() !== 'all',
  );

  protected readonly viewFilters = computed(() => ({
    register: this.registerKey() ?? '',
    owner: this.owner(),
    sort: this.sort(),
  }));

  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: REPORTS_MODULE,
      entityType: 'report_definition',
      view: 'list',
      title: this.language.translate('reports.definitions.title'),
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId) {
        untracked(() =>
          this.api.registers(orgId).subscribe({
            next: (list) => this.registers.set(list.items),
            error: () => this.registers.set([]),
          }),
        );
      }
    });
    effect(() => {
      const args = {
        orgId: this.selectedOrg.currentOrgId(),
        q: this.q(),
        register: this.registerKey(),
        owner: this.owner(),
        sort: this.sort(),
        offset: this.offset(),
      };
      untracked(() => this.load(args));
    });
  }

  protected registerName(
    label: Readonly<Partial<Record<string, string>>> | null,
    key: string,
  ): string {
    return localized(label, this.language.active(), key);
  }

  protected clauses(d: ReportDefinition): string[] {
    const lang = this.language.active();
    return (d.register_clauses ?? []).map((c) => clauseText(c, lang));
  }

  protected lastRunAt(d: ReportDefinition): string | null {
    return d.last_run?.run_at ?? d.last_exported_at;
  }

  /** `-updated_at` -> `updated` (i18n key segment). */
  protected sortKey(sort: DefinitionSort): string {
    return sort.replace(/^-/, '').replace(/_at$/, '').replace('register_key', 'register');
  }

  protected setSearch(text: string): void {
    this.q.set(text);
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.registerKey.set(null);
    this.owner.set('all');
    this.q.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.registerKey.set(f['register'] || null);
    this.owner.set(f['owner'] === 'me' ? 'me' : 'all');
    this.sort.set(
      (DEFINITION_SORTS as readonly string[]).includes(f['sort'])
        ? (f['sort'] as DefinitionSort)
        : 'name',
    );
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigate(['/reports/custom/new']);
  }

  protected reload(): void {
    this.load({
      orgId: this.selectedOrg.currentOrgId(),
      q: this.q(),
      register: this.registerKey(),
      owner: this.owner(),
      sort: this.sort(),
      offset: this.offset(),
    });
  }

  private load(args: {
    orgId: string | null;
    q: string;
    register: string | null;
    owner: OwnerFilter;
    sort: DefinitionSort;
    offset: number;
  }): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!args.orgId) {
      return;
    }
    this.error.set(null);
    this.sub.add(
      this.api
        .listDefinitions(args.orgId, {
          q: args.q,
          register_key: args.register,
          owner: args.owner === 'me' ? 'me' : null,
          sort: args.sort,
          limit: PAGE_SIZE,
          offset: args.offset,
        })
        .subscribe({
          next: (list) => {
            this.items.set(list.items);
            this.total.set(list.total);
            this.loaded.set(true);
          },
          error: (error: unknown) => {
            this.error.set(reportErrorKey(error));
            this.loaded.set(true);
          },
        }),
    );
  }
}

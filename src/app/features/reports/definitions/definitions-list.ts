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
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { reportErrorKey } from '../data/report-errors';
import { localized } from '../data/report-display';
import {
  DEFINITION_SORTS,
  DefinitionSort,
  REPORTS_MODULE,
  REPORTS_PERMISSIONS,
  Register,
  ReportDefinition,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';

const PAGE_SIZE = 25;

export type OwnerFilter = 'all' | 'me';
export const OWNER_FILTERS: readonly OwnerFilter[] = ['all', 'me'];

/**
 * `/reports/definitions`: saved reports (a register with its filters, columns,
 * format and language) the caller can re-run in one click. Search, filter by
 * register and owner, sort, saved views.
 */
@Component({
  selector: 'app-definitions-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="reports.definitions.title"
      scope="reports"
      page="definitions"
      searchPlaceholderKey="reports.definitions.search"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="loaded() && items().length === 0 && !error()"
      (search)="setSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3 flex flex-col gap-3">
        <app-guide-intro scope="reports" page="definitions" />
        <app-why-it-matters scope="reports" page="definitions" />
      </div>
      <ng-container toolbar>
        <app-tour-button scope="reports" tour="definitions" />
        @if (canWrite()) {
          <app-button [appTourStep]="'reports-new-definition'" (click)="create()">
            <app-icon name="plus" [size]="15" />
            {{ 'reports.definitions.new' | transloco }}
          </app-button>
        }
      </ng-container>
      <ng-container filters>
        <label for="def-register" class="sr-only">{{
          'reports.definitions.register' | transloco
        }}</label>
        <select
          id="def-register"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg"
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
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg"
          (change)="owner.set($any($event.target).value); offset.set(0)"
        >
          @for (o of owners; track o) {
            <option [value]="o" [selected]="o === owner()">
              {{ 'reports.definitions.owners.' + o | transloco }}
            </option>
          }
        </select>
        <label for="def-sort" class="sr-only">{{
          'reports.definitions.sortLabel' | transloco
        }}</label>
        <select
          id="def-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg"
          (change)="sort.set($any($event.target).value); offset.set(0)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === sort()">
              {{ 'reports.definitions.sorts.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </ng-container>

      @if (error(); as key) {
        <app-card>
          <p class="py-6 text-center text-[13.5px] text-fg-muted" role="alert">
            {{ key | transloco }}
          </p>
        </app-card>
      } @else if (!loaded()) {
        <p class="py-10 text-center text-[13.5px] text-fg-muted" role="status">
          {{ 'reports.common.loading' | transloco }}
        </p>
      } @else {
        <app-card [padded]="false">
          <ul class="divide-y divide-border" data-testid="definitions">
            @for (d of items(); track d.id) {
              <li
                class="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0">
                  <a
                    [routerLink]="['/reports/definitions', d.id]"
                    class="font-semibold text-fg hover:text-accent hover:underline"
                  >
                    {{ d.name }}
                  </a>
                  <p
                    class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-muted"
                  >
                    <app-badge tone="info">{{
                      registerName(d.register_label, d.register_key)
                    }}</app-badge>
                    <span>{{ 'reports.formats.' + d.default_format | transloco }}</span>
                    @if (d.owner?.name; as ownerName) {
                      <span
                        >·
                        {{ 'reports.definitions.ownedBy' | transloco: { name: ownerName } }}</span
                      >
                    }
                  </p>
                </div>
                <p class="flex-none text-[12px] text-fg-subtle">
                  @if (d.last_exported_at) {
                    {{
                      'reports.definitions.lastExported'
                        | transloco: { date: (d.last_exported_at | localDate) }
                    }}
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
    </app-record-list-page>
  `,
})
export class DefinitionsList {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  protected readonly owners = OWNER_FILTERS;
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

  /** `-updated_at` -> `updated` (i18n key segment). */
  protected sortKey(sort: DefinitionSort): string {
    return sort.replace(/^-/, '').replace(/_at$/, '').replace('register_key', 'register');
  }

  protected setSearch(text: string): void {
    this.q.set(text);
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
    void this.router.navigate(['/reports/definitions/new']);
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

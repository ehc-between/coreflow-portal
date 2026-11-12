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
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FRAMEWORK_KEYS } from '../../../core/standards/frameworks-data';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
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
import { FILTER_STYLES, pick } from '../components/filter-styles';
import { InspectionsTabs } from '../components/inspections-tabs';
import { categoryKey, templateStatusKey, templateStatusTone } from '../data/inspection-display';
import {
  INSPECTIONS_MODULE,
  TEMPLATE_CATEGORIES,
  TEMPLATE_SORTS,
  TEMPLATE_STATUSES,
  Template,
  TemplateListQuery,
  TemplateSort,
  TemplateStatus,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';

const PAGE_SIZE = 25;

export const TEMPLATE_SORT_KEYS: Readonly<Record<TemplateSort, string>> = {
  title: 'title',
  '-updated_at': 'updatedDesc',
  '-created_at': 'createdDesc',
  code: 'code',
};

type TemplateStatusFilter = TemplateStatus | 'current' | '';

export interface TemplateListFilters {
  readonly status: TemplateStatusFilter;
  readonly category: string;
  readonly framework: string;
  readonly sort: TemplateSort;
}

export const DEFAULT_TEMPLATE_FILTERS: TemplateListFilters = {
  status: 'current',
  category: '',
  framework: '',
  sort: 'title',
};

export function parseTemplateFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): TemplateListFilters {
  return {
    status: pick<TemplateStatusFilter>(
      raw['status'],
      ['', 'current', ...TEMPLATE_STATUSES],
      'current',
    ),
    category: pick(raw['category'], ['', ...TEMPLATE_CATEGORIES], ''),
    framework: pick(raw['framework'], ['', ...FRAMEWORK_KEYS], ''),
    sort: pick(raw['sort'], TEMPLATE_SORTS, 'title'),
  };
}

export function toTemplateQuery(
  q: string,
  f: TemplateListFilters,
  offset: number,
): TemplateListQuery {
  return {
    q: q.trim() || undefined,
    status: f.status === 'current' ? ['draft', 'active'] : f.status ? [f.status] : undefined,
    category: f.category || undefined,
    framework: f.framework || undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * Checklist templates (`/inspections/templates`): search, filters (status, category,
 * framework), sort, saved views and paging. Designers (`inspections:templates`) build
 * a new template or start from the built-in library.
 */
@Component({
  selector: 'app-templates-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    GuideIntro,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    InspectionsTabs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="inspections.templates.title"
      scope="inspections"
      page="templates"
      searchPlaceholderKey="inspections.templates.searchPlaceholder"
      [query]="query()"
      [filters]="viewFilters()"
      [empty]="isEmpty()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1.5 max-w-[680px]">
        <p class="text-[14px] text-fg-muted">{{ 'inspections.templates.subtitle' | transloco }}</p>
        <app-inspections-tabs active="templates" />
      </div>
      <app-tour-button toolbar scope="inspections" tour="templates" />
      <a toolbar routerLink="/inspections/templates/library" data-testid="open-library">
        <app-button variant="secondary">
          <app-icon name="documents" [size]="15" />
          {{ 'inspections.templates.library' | transloco }}
        </app-button>
      </a>
      <a
        toolbar
        *appHasPermission="'inspections:templates'"
        routerLink="/inspections/templates/new"
        appTourStep="inspections-template-new"
        data-testid="new-template"
      >
        <app-button>
          <app-icon name="plus" [size]="15" />
          {{ 'inspections.templates.new' | transloco }}
        </app-button>
      </a>

      <ng-container ngProjectAs="[filters]">
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.status' | transloco"
          (change)="setFilter('status', $any($event.target).value)"
          data-testid="template-filter-status"
        >
          <option value="current" [selected]="filters().status === 'current'">
            {{ 'inspections.filters.current' | transloco }}
          </option>
          <option value="" [selected]="filters().status === ''">
            {{ 'inspections.filters.allStatuses' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="s === filters().status">
              {{ templateStatusKey(s) | transloco }}
            </option>
          }
        </select>
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.category' | transloco"
          (change)="setFilter('category', $any($event.target).value)"
        >
          <option value="">{{ 'inspections.filters.anyCategory' | transloco }}</option>
          @for (c of categories; track c) {
            <option [value]="c" [selected]="c === filters().category">
              {{ 'inspections.category.' + c | transloco }}
            </option>
          }
        </select>
        <select
          class="cf-filter"
          [attr.aria-label]="'inspections.filters.framework' | transloco"
          (change)="setFilter('framework', $any($event.target).value)"
        >
          <option value="">{{ 'inspections.filters.anyFramework' | transloco }}</option>
          @for (fw of frameworks; track fw) {
            <option [value]="fw" [selected]="fw === filters().framework">
              {{ 'inspections.frameworks.' + fw | transloco }}
            </option>
          }
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

      <app-guide-intro class="mb-3 block" scope="inspections" page="templates" />

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
          <ul [attr.aria-busy]="loading()" data-testid="template-rows">
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/inspections/templates', row.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap"
                >
                  <span class="w-[64px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1 basis-[200px]">
                    <span class="block truncate font-semibold text-fg">{{ row.title }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      @if (categoryLabel(row.category); as cat) {
                        {{ cat | transloco }} ·
                      } @else if (row.category) {
                        {{ row.category }} ·
                      }
                      {{
                        'inspections.templates.questions' | transloco: { count: row.question_count }
                      }}
                      · {{ 'inspections.templates.version' | transloco: { version: row.version } }}
                    </span>
                  </span>
                  @for (fw of row.frameworks; track fw) {
                    <app-badge tone="neutral">{{
                      'inspections.frameworks.' + fw | transloco
                    }}</app-badge>
                  }
                  <app-badge [tone]="templateStatusTone(row.status)">{{
                    templateStatusKey(row.status) | transloco
                  }}</app-badge>
                  <span
                    class="hidden w-[110px] flex-none text-right text-[12.5px] text-fg-subtle md:block"
                  >
                    {{ row.updated_at | localDay }}
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
      <app-why-it-matters class="mt-5 block" scope="inspections" page="templates" />

      <div empty>
        <app-guide-intro class="mb-3 block" scope="inspections" page="templates" />
        <app-card>
          <app-teaching-empty
            scope="inspections"
            page="templates"
            [showAction]="canDesign()"
            (action)="openLibrary()"
          />
        </app-card>
        <app-why-it-matters class="mt-5 block" scope="inspections" page="templates" />
      </div>
    </app-record-list-page>
  `,
  styles: [FILTER_STYLES],
})
export class TemplatesList {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statuses = TEMPLATE_STATUSES;
  protected readonly categories = TEMPLATE_CATEGORIES;
  protected readonly frameworks = FRAMEWORK_KEYS;
  protected readonly sorts = TEMPLATE_SORTS;
  protected readonly sortKeys = TEMPLATE_SORT_KEYS;
  protected readonly templateStatusKey = templateStatusKey;
  protected readonly templateStatusTone = templateStatusTone;
  protected readonly categoryLabel = categoryKey;

  protected readonly query = signal('');
  protected readonly filters = signal<TemplateListFilters>(
    parseTemplateFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Template[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  private readonly loaded = signal(false);

  protected readonly canDesign = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('inspections:templates') ?? false,
  );

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));

  protected readonly isEmpty = computed(
    () =>
      this.loaded() &&
      this.total() === 0 &&
      !this.query().trim() &&
      JSON.stringify(this.filters()) === JSON.stringify(DEFAULT_TEMPLATE_FILTERS),
  );

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: 'checklist_template',
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

  private load(orgId: string, q: string, filters: TemplateListFilters, offset: number): void {
    this.loading.set(true);
    this.api.listTemplates(orgId, toTemplateQuery(q, filters, offset)).subscribe({
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

  protected setFilter(key: keyof TemplateListFilters, value: string): void {
    this.offset.set(0);
    this.filters.set(parseTemplateFilters({ ...this.filters(), [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(parseTemplateFilters(view.filters));
  }

  protected openLibrary(): void {
    void this.router.navigate(['/inspections/templates/library']);
  }
}

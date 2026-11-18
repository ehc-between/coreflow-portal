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
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { FILTER_STYLES, pick } from '../components/filter-styles';
import { categoryKey, templateStatusKey } from '../data/inspection-display';
import {
  INSPECTIONS_MODULE,
  SUPPORTED_FRAMEWORKS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_ENTITY_TYPE,
  TEMPLATE_SORTS,
  TEMPLATE_STATUSES,
  Template,
  TemplateListQuery,
  TemplateSort,
  TemplateStatus,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';
import { ModuleConfigNav } from '../../../shared/ui/module-config-nav/module-config-nav';

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
    framework: pick(raw['framework'], ['', ...SUPPORTED_FRAMEWORKS], ''),
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
 * Checklist templates (`/settings/modules/inspections/templates`, "Sjekklistemaler"): search, filters
 * (status, category, standard), sort, saved views and paging. Each row shows the
 * category, question count, version, the standards it is for and the requirements
 * it documents. Designers (`inspections:templates`) build a new template or start
 * from the library.
 */
@Component({
  selector: 'app-templates-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleConfigNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="inspections.templates.title"
      descriptionKey="inspections.templates.subtitle"
      [breadcrumbs]="breadcrumbs"
      scope="inspections"
      page="templates"
      searchPlaceholderKey="inspections.templates.searchPlaceholder"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <a
        secondary
        routerLink="/settings/modules/inspections/templates/library"
        data-testid="open-library"
      >
        <app-button variant="secondary">
          <app-icon name="documents" [size]="15" />
          {{ 'inspections.templates.library' | transloco }}
        </app-button>
      </a>
      <a
        primary
        *appHasPermission="'inspections:templates'"
        routerLink="/settings/modules/inspections/templates/new"
        appTourStep="inspections-template-new"
        data-testid="new-template"
      >
        <app-button>
          <app-icon name="plus" [size]="15" />
          {{ 'inspections.templates.new' | transloco }}
        </app-button>
      </a>

      <app-module-config-nav nav module="inspections" />
      <app-help-strip
        help
        scope="inspections"
        page="templates"
        tour="templates"
        lesson="inspection-basics"
      />

      <select
        filters
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
        filters
        class="cf-filter"
        [attr.aria-label]="'inspections.filters.category' | transloco"
        (change)="setFilter('category', $any($event.target).value)"
      >
        <option value="" [selected]="filters().category === ''">
          {{ 'inspections.filters.anyCategory' | transloco }}
        </option>
        @for (c of categories; track c) {
          <option [value]="c" [selected]="c === filters().category">
            {{ 'inspections.category.' + c | transloco }}
          </option>
        }
      </select>
      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'inspections.filters.framework' | transloco"
        (change)="setFilter('framework', $any($event.target).value)"
      >
        <option value="" [selected]="filters().framework === ''">
          {{ 'inspections.filters.anyFramework' | transloco }}
        </option>
        @for (fw of frameworks; track fw) {
          <option [value]="fw" [selected]="fw === filters().framework">
            {{ 'inspections.frameworks.' + fw | transloco }}
          </option>
        }
      </select>
      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'inspections.filters.sort' | transloco }}
          <select class="cf-filter" (change)="setFilter('sort', $any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="s === filters().sort">
                {{ 'inspections.sort.' + sortKeys[s] | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (loading() && items().length === 0) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-card>
          <app-empty-state
            icon="search"
            titleKey="inspections.list.noMatchesTitle"
            bodyKey="inspections.templates.noMatches"
            [compact]="true"
            data-testid="no-matches"
          />
          <div class="-mt-2 pb-4 text-center">
            <app-button variant="secondary" size="sm" (click)="clearFilters()">
              {{ 'inspections.list.clearFilters' | transloco }}
            </app-button>
          </div>
        </app-card>
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-busy]="loading()" data-testid="template-rows">
            <app-record-row-header dateKind="updated" [owner]="false" />
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.title"
                [subtitle]="subtitle(row)"
                [link]="['/settings/modules/inspections/templates', row.id]"
                [date]="row.updated_at"
                dateKind="updated"
              >
                <app-coverage-chip coverage [entityType]="entityType" [entityId]="row.id" />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="row.status"
                  [labelKey]="templateStatusKey(row.status)"
                />
              </app-record-row>
            }
          </div>
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
      }

      <div empty>
        <app-card>
          <app-teaching-empty
            scope="inspections"
            page="templates"
            [showAction]="canDesign()"
            (action)="openLibrary()"
          />
        </app-card>
      </div>

      <app-why-it-matters below scope="inspections" page="templates" />
    </app-record-list-page>
  `,
  styles: [FILTER_STYLES],
})
export class TemplatesList {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly entityType = TEMPLATE_ENTITY_TYPE;
  protected readonly breadcrumbs = [
    { labelKey: 'nav.settings', link: '/settings' },
    { labelKey: 'modules.names.inspections' },
    { labelKey: 'inspections.templates.title' },
  ];
  protected readonly statuses = TEMPLATE_STATUSES;
  protected readonly categories = TEMPLATE_CATEGORIES;
  protected readonly frameworks = SUPPORTED_FRAMEWORKS;
  protected readonly sorts = TEMPLATE_SORTS;
  protected readonly sortKeys = TEMPLATE_SORT_KEYS;
  protected readonly templateStatusKey = templateStatusKey;

  protected readonly query = signal('');
  protected readonly filters = signal<TemplateListFilters>(
    parseTemplateFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Template[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  private readonly loaded = signal(false);

  protected readonly canDesign = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('inspections:templates') ?? false,
  );

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly moreActive = computed(() =>
    this.filters().sort !== DEFAULT_TEMPLATE_FILTERS.sort ? 1 : 0,
  );

  protected readonly isEmptyRegister = computed(
    () =>
      this.loaded() &&
      !this.error() &&
      this.total() === 0 &&
      !this.query().trim() &&
      JSON.stringify(this.filters()) === JSON.stringify(DEFAULT_TEMPLATE_FILTERS),
  );

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: TEMPLATE_ENTITY_TYPE,
      view: 'list',
      title: this.language.translate('inspections.templates.title'),
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
    this.error.set(false);
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
        this.error.set(true);
      },
    });
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId, this.query(), this.filters(), this.offset());
    }
  }

  /** "Helse og sikkerhet · 9 spørsmål · versjon 2 · ISO 45001". */
  protected subtitle(row: Template): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const cat = categoryKey(row.category);
    const parts = [
      cat ? t(cat) : row.category,
      t('inspections.templates.questions', { count: row.question_count }),
      t('inspections.templates.versionShort', { version: row.version }),
      ...row.frameworks.map((fw) => t(`inspections.frameworks.${fw}`)),
    ];
    return parts.filter((p): p is string => !!p).join(' · ');
  }

  protected onSearch(text: string): void {
    this.offset.set(0);
    this.query.set(text);
  }

  protected setFilter(key: keyof TemplateListFilters, value: string): void {
    this.offset.set(0);
    this.filters.set(parseTemplateFilters({ ...this.filters(), [key]: value }));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.filters.set({ ...DEFAULT_TEMPLATE_FILTERS, status: '' });
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(parseTemplateFilters(view.filters));
  }

  protected openLibrary(): void {
    void this.router.navigate(['/settings/modules/inspections/templates/library']);
  }
}

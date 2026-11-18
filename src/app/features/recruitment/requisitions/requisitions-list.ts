import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { formatLocalDay } from '../../../shared/locale/locale-pipes';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { RequirementCoverageService } from '../../../shared/requirement-links/requirement-coverage.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RecruitmentApi } from '../data/recruitment-api';
import { activeApplicationCount, requisitionToneValue } from '../data/recruitment-display';
import {
  ENTITY_REQUISITION,
  MODULE_KEY,
  REQUISITION_SORTS,
  REQUISITION_STATUSES,
  Requisition,
  RequisitionSort,
  RequisitionStatus,
} from '../data/recruitment.models';
import {
  RECRUITMENT_CRUMB,
  injectRecruitmentNav,
  settingsLinkFor,
} from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';
import { RecruitmentRowHeader } from '../shared/recruitment-row-header';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;
const ACTIVE: readonly RequisitionStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'open',
  'on_hold',
];

type StatusFilter = '' | 'active' | RequisitionStatus;

function parseStatus(value: string | null): StatusFilter {
  if (value === 'active') {
    return 'active';
  }
  return value && (REQUISITION_STATUSES as readonly string[]).includes(value)
    ? (value as RequisitionStatus)
    : '';
}

/**
 * Job requisitions of the current org: search, status / owner filters (also from the
 * overview links, `?status=`), sort, saved views and requirement coverage per row.
 */
@Component({
  selector: 'app-requisitions-list',
  imports: [
    FulfilsRequirements,
    RouterLink,
    TranslocoPipe,
    RecordListPage,
    WhyItMatters,
    TeachingEmpty,
    TourStepDirective,
    CoverageChip,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    StatusBadge,
    RecruitmentRowHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="recruitment.requisitions.title"
      descriptionKey="recruitment.requisitions.description"
      [breadcrumbs]="breadcrumbs"
      [settingsLink]="settingsLink()"
      scope="recruitment"
      page="requisitions"
      searchPlaceholderKey="recruitment.requisitions.search"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="!loading() && !errorKey() && items().length === 0 && !filtered()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="recruitment.requisitions" />
      @if (perms().write) {
        <a
          primary
          routerLink="/recruitment/requisitions/new"
          data-testid="req-new"
          appTourStep="recruitment-new"
        >
          <app-button size="sm">
            <app-icon name="plus" [size]="15" />
            {{ 'recruitment.requisitions.new' | transloco }}
          </app-button>
        </a>
      }
      <app-module-nav nav [items]="nav()" labelKey="modules.names.recruitment" />
      <app-help-strip
        help
        scope="recruitment"
        page="requisitions"
        tour="requisitions"
        lesson="fair-screening"
      />

      <ng-container filters>
        <label class="sr-only" for="req-status">{{
          'recruitment.filters.status' | transloco
        }}</label>
        <select
          id="req-status"
          class="cf-filter"
          appTourStep="recruitment-status-filter"
          (change)="setStatus($any($event.target).value)"
        >
          <option value="" [selected]="status() === ''">
            {{ 'recruitment.filters.allStatuses' | transloco }}
          </option>
          <option value="active" [selected]="status() === 'active'">
            {{ 'recruitment.filters.activeStatuses' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'recruitment.requisitionStatus.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="req-owner">{{ 'recruitment.filters.owner' | transloco }}</label>
        <select id="req-owner" class="cf-filter" (change)="setOwner($any($event.target).value)">
          <option value="" [selected]="owner() === ''">
            {{ 'recruitment.filters.everyone' | transloco }}
          </option>
          <option value="me" [selected]="owner() === 'me'">
            {{ 'recruitment.filters.mine' | transloco }}
          </option>
        </select>
        <label class="sr-only" for="req-sort">{{ 'recruitment.filters.sort' | transloco }}</label>
        <select id="req-sort" class="cf-filter" (change)="setSort($any($event.target).value)">
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'recruitment.requisitions.sort.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </ng-container>

      @if (errorKey(); as key) {
        <app-error-state [bodyKey]="key" (retry)="reload()" />
      } @else if (loading() && items().length === 0) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-empty-state
          icon="search"
          titleKey="ui.empty.noResults"
          bodyKey="ui.empty.noResultsBody"
          ctaKey="ui.empty.clearFilters"
          ctaVariant="secondary"
          (cta)="clearFilters()"
        />
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-label]="'recruitment.requisitions.title' | transloco">
            <app-recruitment-row-header ownerKey="recruitment.fields.hiringManager" />
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.title"
                [subtitle]="subtitle(row)"
                [link]="['/recruitment/requisitions', row.id]"
                [owner]="row.hiring_manager?.name"
              >
                <app-coverage-chip coverage [entityType]="entityType" [entityId]="row.id" />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="statusValue(row.status)"
                  [labelKey]="'recruitment.requisitionStatus.' + row.status"
                />
                <app-status-badge
                  badges
                  meaning="severity"
                  [value]="row.role_risk"
                  [labelKey]="'recruitment.roleRisk.' + row.role_risk"
                />
              </app-record-row>
            }
          </div>
        </app-card>
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <app-card empty>
        <app-teaching-empty
          scope="recruitment"
          page="requisitions"
          [showAction]="perms().write"
          (action)="create()"
        />
      </app-card>
      <app-why-it-matters below scope="recruitment" page="requisitions" />
    </app-record-list-page>
  `,
  styles: [
    `
      .cf-filter {
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        padding: 0 12px;
        outline: none;
        max-width: 100%;
      }
      .cf-filter:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class RequisitionsList {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly coverage = inject(RequirementCoverageService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly perms = injectRecruitmentPerms();
  protected readonly nav = injectRecruitmentNav(this.perms);
  protected readonly settingsLink = computed(() => settingsLinkFor(this.perms()));
  protected readonly breadcrumbs = [
    RECRUITMENT_CRUMB,
    { labelKey: 'recruitment.nav.requisitions' },
  ];

  protected readonly entityType = ENTITY_REQUISITION;
  protected readonly statuses = REQUISITION_STATUSES;
  protected readonly sorts = REQUISITION_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusValue = requisitionToneValue;

  protected readonly q = signal('');
  protected readonly status = signal<StatusFilter>(parseStatus(this.params.get('status')));
  protected readonly owner = signal<'' | 'me'>(this.params.get('owner') === 'me' ? 'me' : '');
  protected readonly sort = signal<RequisitionSort>('-created_at');
  protected readonly offset = signal(0);
  private readonly version = signal(0);

  protected readonly items = signal<readonly Requisition[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly filtered = computed(
    () => this.q() !== '' || this.status() !== '' || this.owner() !== '',
  );
  protected readonly viewFilters = computed(() => ({
    status: this.status(),
    owner: this.owner(),
    sort: this.sort(),
  }));

  constructor() {
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_REQUISITION,
      view: 'list',
      title: this.language.translate('recruitment.requisitions.title'),
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      this.version();
      const query = {
        q: this.q(),
        status: this.statusFilter(),
        owner: this.owner() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      } as const;
      if (!orgId) {
        return;
      }
      this.loading.set(true);
      this.errorKey.set(null);
      const sub = this.api.listRequisitions(orgId, query).subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
          this.coverage
            .load(
              ENTITY_REQUISITION,
              res.items.map((r) => r.id),
            )
            .subscribe();
        },
        error: () => {
          this.loading.set(false);
          this.errorKey.set('recruitment.common.loadFailed');
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  private statusFilter(): readonly RequisitionStatus[] | undefined {
    const s = this.status();
    if (s === 'active') {
      return ACTIVE;
    }
    return s ? [s] : undefined;
  }

  protected subtitle(row: Requisition): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(`recruitment.employmentType.${row.employment_type}`)];
    if (row.location) {
      parts.push(row.location);
    }
    if (row.target_start_date) {
      parts.push(
        t('recruitment.requisitions.startsOn', {
          date: formatLocalDay(row.target_start_date, 'mediumDate', this.language.locale()),
        }),
      );
    }
    parts.push(this.countsText(row));
    return parts.join(' · ');
  }

  protected countsText(row: Requisition): string {
    return this.language.translate('recruitment.requisitions.counts', {
      active: activeApplicationCount(row),
      hires: row.hires,
      headcount: row.headcount,
    });
  }

  protected sortKey(sort: RequisitionSort): string {
    return sort === '-created_at' ? 'newest' : sort === 'created_at' ? 'oldest' : sort;
  }

  protected onSearch(text: string): void {
    this.q.set(text.trim());
    this.offset.set(0);
  }

  protected setStatus(value: string): void {
    this.status.set(parseStatus(value));
    this.offset.set(0);
  }

  protected setOwner(value: string): void {
    this.owner.set(value === 'me' ? 'me' : '');
    this.offset.set(0);
  }

  protected setSort(value: string): void {
    if ((REQUISITION_SORTS as readonly string[]).includes(value)) {
      this.sort.set(value as RequisitionSort);
      this.offset.set(0);
    }
  }

  protected clearFilters(): void {
    this.status.set('');
    this.owner.set('');
    this.q.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.status.set(parseStatus(f['status'] ?? ''));
    this.owner.set(f['owner'] === 'me' ? 'me' : '');
    this.setSort(f['sort'] ?? '-created_at');
    this.offset.set(0);
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }

  protected create(): void {
    void this.router.navigate(['/recruitment/requisitions/new']);
  }
}

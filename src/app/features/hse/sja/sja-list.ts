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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
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
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { HseApi } from '../data/hse-api';
import { SJA_SORTS, SJA_STATUSES, Sja, SjaQuery, SjaSort, SjaStatus } from '../data/hse.models';
import { HSE_MODULE, HSE_NAV, HSE_ROOT_CRUMB, injectHsePermissions } from '../shared/hse-shared';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;

/** Filter values as stored in a saved view / the URL. */
export interface SjaListFilters {
  readonly status: SjaStatus | '';
  readonly mine: '' | '1';
  readonly sort: SjaSort;
}

export const SJA_DEFAULT_FILTERS: SjaListFilters = { status: '', mine: '', sort: '-created_at' };

/** Restores filters from a saved view or query params, ignoring unknown values. */
export function parseSjaFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): SjaListFilters {
  const status = raw['status'] ?? '';
  const sort = raw['sort'] ?? '';
  return {
    status: (SJA_STATUSES as readonly string[]).includes(status) ? (status as SjaStatus) : '',
    mine: raw['mine'] === '1' ? '1' : '',
    sort: (SJA_SORTS as readonly string[]).includes(sort) ? (sort as SjaSort) : '-created_at',
  };
}

export function sjaQuery(q: string, f: SjaListFilters, offset: number): SjaQuery {
  return {
    q: q.trim() || undefined,
    status: f.status ? [f.status] : undefined,
    owner: f.mine ? 'me' : undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/** i18n key suffix (`hse.sja.sort.<key>`) of a sort option. */
export function sjaSortKey(sort: SjaSort): string {
  return sort.replace(/^-/, 'desc_');
}

/**
 * `/hse/sja` ("Sikker jobbanalyse (SJA)"): search, status / "mine" filters,
 * sorting, saved views and paging. Each row shows the code, the job, where it
 * is done, hazards and controls, how many participants have signed off, how
 * many requirements it documents, the status and residual risk, the owner and
 * the start of the work. `?status=` (from the overview) seeds the filter.
 */
@Component({
  selector: 'app-sja-list',
  imports: [
    FulfilsRequirements,
    RouterLink,
    TranslocoPipe,
    Button,
    Card,
    CoverageChip,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      exportRegister="safe_job_analyses"
      titleKey="hse.sja.list.title"
      descriptionKey="hse.sja.list.subtitle"
      scope="hse"
      page="sja"
      searchPlaceholderKey="hse.sja.list.search"
      [breadcrumbs]="crumbs"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="filters().sort !== defaults.sort ? 1 : 0"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="hse.sja" />
      @if (perms.write()) {
        <a primary routerLink="/hse/sja/new" tabindex="-1" appTourStep="hse-sja-new">
          <app-button>
            <app-icon name="plus" [size]="15" />
            {{ 'hse.sja.new' | transloco }}
          </app-button>
        </a>
      }

      <app-module-nav nav class="mb-4 block" [items]="nav" labelKey="modules.names.hse" />
      <app-help-strip help scope="hse" page="sja" tour="sja" lesson="sja-basics" />

      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'hse.common.status' | transloco"
        (change)="setFilter('status', $any($event.target).value)"
        appTourStep="hse-sja-filters"
        data-testid="sja-filter-status"
      >
        <option value="" [selected]="filters().status === ''">
          {{ 'hse.common.allStatuses' | transloco }}
        </option>
        @for (s of statuses; track s) {
          <option [value]="s" [selected]="s === filters().status">
            {{ 'hse.sja.status.' + s | transloco }}
          </option>
        }
      </select>
      <button
        filters
        type="button"
        class="h-10 rounded-tile border px-3 text-ui font-semibold"
        [class]="
          filters().mine
            ? 'border-accent-border bg-accent-soft text-accent'
            : 'border-border bg-bg text-fg-muted hover:text-fg'
        "
        [attr.aria-pressed]="!!filters().mine"
        (click)="setFilter('mine', filters().mine ? '' : '1')"
      >
        {{ 'hse.common.mine' | transloco }}
      </button>
      <label more-filters class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
        {{ 'hse.common.sort' | transloco }}
        <select class="cf-filter" (change)="setFilter('sort', $any($event.target).value)">
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === filters().sort">
              {{ 'hse.sja.sort.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </label>

      @if (state() === 'error') {
        <app-error-state (retry)="reload()" />
      } @else if (state() === 'loading' && items().length === 0) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-card>
          <app-empty-state
            icon="search"
            titleKey="hse.common.noMatchesTitle"
            bodyKey="hse.common.noMatches"
            [compact]="true"
            data-testid="no-matches"
          />
          <div class="-mt-2 pb-4 text-center">
            <app-button variant="secondary" size="sm" (click)="clearFilters()">
              {{ 'hse.common.clearFilters' | transloco }}
            </app-button>
          </div>
        </app-card>
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-busy]="state() === 'loading'" data-testid="sja-rows">
            <app-record-row-header dateKind="date" />
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.title"
                [subtitle]="subtitle(row)"
                [link]="['/hse/sja', row.id]"
                [owner]="row.owner?.name"
                [date]="row.work_start_at"
                dateKind="date"
              >
                <app-coverage-chip coverage entityType="sja" [entityId]="row.id" />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="row.status"
                  [labelKey]="'hse.sja.status.' + row.status"
                />
                @if (row.residual_risk_level || row.risk_level; as level) {
                  <app-status-badge
                    badges
                    meaning="severity"
                    [value]="level"
                    labelKey="hse.sja.list.riskBadge"
                    [labelParams]="{ level: ('hse.risk.' + level | transloco) }"
                  />
                }
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
            scope="hse"
            page="sja"
            [showAction]="perms.write()"
            (action)="create()"
          />
        </app-card>
      </div>

      <app-why-it-matters below scope="hse" page="sja" />
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
        font-weight: 400;
        padding: 0 10px;
        outline: none;
      }
      .cf-filter:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class SjaList {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly perms = injectHsePermissions();
  protected readonly nav = HSE_NAV;
  protected readonly crumbs = [HSE_ROOT_CRUMB, { labelKey: 'hse.nav.sja' }];
  protected readonly statuses = SJA_STATUSES;
  protected readonly sorts = SJA_SORTS;
  protected readonly defaults = SJA_DEFAULT_FILTERS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortKey = sjaSortKey;

  protected readonly query = signal('');
  protected readonly filters = signal<SjaListFilters>(
    parseSjaFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Sja[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly isEmptyRegister = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.query() &&
      JSON.stringify(this.filters()) === JSON.stringify(SJA_DEFAULT_FILTERS),
  );

  private request = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'sja',
      view: 'list',
      title: this.language.translate('hse.sja.list.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = sjaQuery(this.query(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  private load(orgId: string | null, query: SjaQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listSja(orgId, query).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.state.set('ready');
      },
      error: () => {
        this.items.set([]);
        this.state.set('error');
      },
    });
  }

  protected reload(): void {
    this.load(
      this.selectedOrg.currentOrgId(),
      sjaQuery(this.query(), this.filters(), this.offset()),
    );
  }

  /** "Tak bygg B · 6 farer · 9 tiltak · 3 av 4 har signert". */
  protected subtitle(row: Sja): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [
      row.location || t('hse.common.noLocation'),
      t('hse.sja.list.counts', { hazards: row.hazard_count, controls: row.control_count }),
    ];
    const signOff = row.sign_off;
    if (signOff && signOff.expected > 0) {
      parts.push(
        t('hse.sja.list.signedOff', { signed: signOff.signed, expected: signOff.expected }),
      );
    }
    return parts.join(' · ');
  }

  protected onSearch(text: string): void {
    this.query.set(text.trim());
    this.offset.set(0);
  }

  protected setFilter(key: keyof SjaListFilters, value: string): void {
    this.filters.set(parseSjaFilters({ ...this.filters(), [key]: value }));
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.filters.set(SJA_DEFAULT_FILTERS);
    this.query.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.filters.set(parseSjaFilters(view.filters));
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigate(['/hse/sja/new']);
  }
}

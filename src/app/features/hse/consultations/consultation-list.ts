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
import {
  CONSULTATION_KINDS,
  CONSULTATION_SORTS,
  CONSULTATION_STATUSES,
  Consultation,
  ConsultationKind,
  ConsultationQuery,
  ConsultationSort,
  ConsultationStatus,
} from '../data/hse.models';
import { consultationStatusValue } from '../hse-format';
import { HSE_MODULE, HSE_NAV, HSE_ROOT_CRUMB, injectHsePermissions } from '../shared/hse-shared';

const PAGE_SIZE = 25;

export interface ConsultationListFilters {
  readonly status: ConsultationStatus | '';
  readonly kind: ConsultationKind | '';
  readonly sort: ConsultationSort;
}

export const CONSULTATION_DEFAULT_FILTERS: ConsultationListFilters = {
  status: '',
  kind: '',
  sort: '-created_at',
};

export function parseConsultationFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): ConsultationListFilters {
  const pick = <T extends string>(value: string | null | undefined, allowed: readonly T[], d: T) =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : d;
  return {
    status: pick(raw['status'], ['', ...CONSULTATION_STATUSES], ''),
    kind: pick(raw['kind'], ['', ...CONSULTATION_KINDS], ''),
    sort: pick(raw['sort'], CONSULTATION_SORTS, '-created_at'),
  };
}

export function consultationQuery(
  q: string,
  f: ConsultationListFilters,
  offset: number,
): ConsultationQuery {
  return {
    q: q.trim() || undefined,
    status: f.status ? [f.status] : undefined,
    kind: f.kind || undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * `/hse/consultations` ("Medvirkning"): worker consultation records with search,
 * status / kind filters, sorting, saved views and paging. Each row shows the
 * code, the meeting, its kind and place, the follow-up tasks of its decisions
 * (open / overdue / done), the requirements it documents, the status (and
 * "Uten verneombud" when one should have taken part), the organiser and date.
 */
@Component({
  selector: 'app-consultation-list',
  imports: [
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
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="hse.consultation.list.title"
      descriptionKey="hse.consultation.list.subtitle"
      scope="hse"
      page="consultations"
      searchPlaceholderKey="hse.consultation.list.search"
      [breadcrumbs]="crumbs"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="filters().sort !== defaults.sort ? 1 : 0"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      @if (perms.write()) {
        <a primary routerLink="/hse/consultations/new" tabindex="-1">
          <app-button>
            <app-icon name="plus" [size]="15" />
            {{ 'hse.consultation.new' | transloco }}
          </app-button>
        </a>
      }

      <app-module-nav nav class="mb-4 block" [items]="nav" labelKey="modules.names.hse" />
      <app-help-strip help scope="hse" page="consultations" lesson="worker-participation" />

      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'hse.common.status' | transloco"
        (change)="setFilter('status', $any($event.target).value)"
      >
        <option value="" [selected]="filters().status === ''">
          {{ 'hse.common.allStatuses' | transloco }}
        </option>
        @for (s of statuses; track s) {
          <option [value]="s" [selected]="s === filters().status">
            {{ 'hse.consultation.status.' + s | transloco }}
          </option>
        }
      </select>
      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'hse.consultation.fields.kind' | transloco"
        (change)="setFilter('kind', $any($event.target).value)"
      >
        <option value="" [selected]="filters().kind === ''">
          {{ 'hse.consultation.list.allKinds' | transloco }}
        </option>
        @for (k of kinds; track k) {
          <option [value]="k" [selected]="k === filters().kind">
            {{ 'hse.consultation.kind.' + k | transloco }}
          </option>
        }
      </select>
      <label more-filters class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
        {{ 'hse.common.sort' | transloco }}
        <select class="cf-filter" (change)="setFilter('sort', $any($event.target).value)">
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === filters().sort">
              {{ 'hse.consultation.sort.' + sortKey(s) | transloco }}
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
          <div role="list" [attr.aria-busy]="state() === 'loading'" data-testid="wc-rows">
            <app-record-row-header dateKind="date" />
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.title"
                [subtitle]="subtitle(row)"
                [link]="['/hse/consultations', row.id]"
                [owner]="row.owner?.name"
                [date]="row.held_at || row.scheduled_at"
                dateKind="date"
              >
                <app-coverage-chip coverage entityType="worker_consultation" [entityId]="row.id" />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="statusValue(row.status)"
                  [labelKey]="'hse.consultation.status.' + row.status"
                />
                @if (row.status === 'held' && !row.worker_representative_present) {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    value="blocked"
                    labelKey="hse.consultation.list.noRep"
                  />
                }
                @if (row.actions?.overdue) {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    value="overdue"
                    labelKey="hse.consultation.list.actionsOverdue"
                    [labelParams]="{ count: row.actions.overdue }"
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
            page="consultations"
            [showAction]="perms.write()"
            (action)="create()"
          />
        </app-card>
      </div>

      <app-why-it-matters below scope="hse" page="consultations" />
    </app-record-list-page>
  `,
  styles: [
    `
      .cf-filter {
        height: 40px;
        max-width: 100%;
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
export class ConsultationList {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly perms = injectHsePermissions();
  protected readonly nav = HSE_NAV;
  protected readonly crumbs = [HSE_ROOT_CRUMB, { labelKey: 'hse.nav.consultations' }];
  protected readonly statuses = CONSULTATION_STATUSES;
  protected readonly kinds = CONSULTATION_KINDS;
  protected readonly sorts = CONSULTATION_SORTS;
  protected readonly defaults = CONSULTATION_DEFAULT_FILTERS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusValue = consultationStatusValue;

  protected readonly query = signal('');
  protected readonly filters = signal<ConsultationListFilters>(
    parseConsultationFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Consultation[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly isEmptyRegister = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.query() &&
      JSON.stringify(this.filters()) === JSON.stringify(CONSULTATION_DEFAULT_FILTERS),
  );

  private request = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'worker_consultation',
      view: 'list',
      title: this.language.translate('hse.consultation.list.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = consultationQuery(this.query(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  private load(orgId: string | null, query: ConsultationQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listConsultations(orgId, query).subscribe({
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
      consultationQuery(this.query(), this.filters(), this.offset()),
    );
  }

  /** "AMU-møte · Kantina · 2 oppgaver åpne, 1 fullført". */
  protected subtitle(row: Consultation): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(`hse.consultation.kind.${row.kind}`)];
    if (row.location) {
      parts.push(row.location);
    }
    const a = row.actions;
    if (a?.total) {
      parts.push(t('hse.consultation.list.actions', { open: a.open, done: a.done }));
    }
    return parts.join(' · ');
  }

  protected sortKey(sort: ConsultationSort): string {
    return sort.replace(/^-/, 'desc_');
  }

  protected onSearch(text: string): void {
    this.query.set(text.trim());
    this.offset.set(0);
  }

  protected setFilter(key: keyof ConsultationListFilters, value: string): void {
    this.filters.set(parseConsultationFilters({ ...this.filters(), [key]: value }));
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.filters.set(CONSULTATION_DEFAULT_FILTERS);
    this.query.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.filters.set(parseConsultationFilters(view.filters));
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigate(['/hse/consultations/new']);
  }
}

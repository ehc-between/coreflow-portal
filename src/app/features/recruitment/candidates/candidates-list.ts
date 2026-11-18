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
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { formatLocalDate } from '../../../shared/locale/locale-pipes';
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
import { retentionDue, stageToneValue } from '../data/recruitment-display';
import {
  CANDIDATE_SORTS,
  Candidate,
  CandidateSort,
  ENTITY_CANDIDATE,
  MODULE_KEY,
} from '../data/recruitment.models';
import {
  RECRUITMENT_CRUMB,
  injectRecruitmentNav,
  settingsLinkFor,
} from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';
import { RecruitmentRowHeader } from '../shared/recruitment-row-header';

const PAGE_SIZE = 25;
const DUE_SOON_DAYS = 30;

type PoolFilter = '' | 'yes' | 'no';
type RetentionFilter = '' | 'soon';

/**
 * Candidates the caller may see (their hiring teams, records they created, or all
 * with `recruitment:manage`). Each row shows the latest stage, talent-pool consent,
 * a missing privacy notice and the deletion date (amber within 30 days).
 */
@Component({
  selector: 'app-candidates-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    RecordListPage,
    WhyItMatters,
    TeachingEmpty,
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
      titleKey="recruitment.candidates.title"
      descriptionKey="recruitment.candidates.description"
      [breadcrumbs]="breadcrumbs"
      [settingsLink]="settingsLink()"
      scope="recruitment"
      page="candidates"
      searchPlaceholderKey="recruitment.candidates.search"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="!loading() && !errorKey() && items().length === 0 && !filtered()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      @if (perms().write) {
        <a primary routerLink="/recruitment/candidates/new" data-testid="cand-new">
          <app-button size="sm">
            <app-icon name="userplus" [size]="15" />
            {{ 'recruitment.candidates.new' | transloco }}
          </app-button>
        </a>
      }
      <app-module-nav nav [items]="nav()" labelKey="modules.names.recruitment" />
      <app-help-strip help scope="recruitment" page="candidates" lesson="candidate-privacy" />

      <ng-container filters>
        <label class="sr-only" for="cand-pool">{{
          'recruitment.filters.talentPool' | transloco
        }}</label>
        <select id="cand-pool" class="cf-filter" (change)="setPool($any($event.target).value)">
          <option value="" [selected]="pool() === ''">
            {{ 'recruitment.filters.anyPool' | transloco }}
          </option>
          <option value="yes" [selected]="pool() === 'yes'">
            {{ 'recruitment.filters.inPool' | transloco }}
          </option>
          <option value="no" [selected]="pool() === 'no'">
            {{ 'recruitment.filters.notInPool' | transloco }}
          </option>
        </select>
        <label class="sr-only" for="cand-retention">{{
          'recruitment.filters.retention' | transloco
        }}</label>
        <select
          id="cand-retention"
          class="cf-filter"
          (change)="setRetention($any($event.target).value)"
        >
          <option value="" [selected]="retention() === ''">
            {{ 'recruitment.filters.anyRetention' | transloco }}
          </option>
          <option value="soon" [selected]="retention() === 'soon'">
            {{ 'recruitment.filters.retentionSoon' | transloco: { days: dueSoonDays } }}
          </option>
        </select>
        <label class="sr-only" for="cand-sort">{{ 'recruitment.filters.sort' | transloco }}</label>
        <select id="cand-sort" class="cf-filter" (change)="setSort($any($event.target).value)">
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'recruitment.candidates.sort.' + sortKey(s) | transloco }}
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
          <div role="list" [attr.aria-label]="'recruitment.candidates.title' | transloco">
            <app-recruitment-row-header titleKey="recruitment.candidates.nameColumn" />
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.full_name"
                [subtitle]="subtitle(row)"
                [link]="['/recruitment/candidates', row.id]"
              >
                <app-coverage-chip coverage [entityType]="entityType" [entityId]="row.id" />
                @if (row.latest_stage) {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    [value]="stageValue(row.latest_stage)"
                    [labelKey]="'recruitment.stage.' + row.latest_stage"
                  />
                }
                @if (row.talent_pool_consent) {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    value="submitted"
                    labelKey="recruitment.candidates.inPool"
                  />
                }
                @if (!row.privacy_notice_given_at) {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    value="blocked"
                    labelKey="recruitment.candidates.noticeMissing"
                  />
                }
                <span
                  badges
                  class="text-meta whitespace-nowrap"
                  data-testid="cand-retention"
                  [class]="isDue(row) ? 'font-semibold text-warn-ink' : 'text-fg-muted'"
                >
                  {{ retentionText(row) }}
                </span>
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
          page="candidates"
          [showAction]="perms().write"
          (action)="create()"
        />
      </app-card>
      <app-why-it-matters below scope="recruitment" page="candidates" />
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
export class CandidatesList {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly coverage = inject(RequirementCoverageService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly perms = injectRecruitmentPerms();
  protected readonly nav = injectRecruitmentNav();
  protected readonly settingsLink = computed(() => settingsLinkFor(this.perms()));
  protected readonly breadcrumbs = [RECRUITMENT_CRUMB, { labelKey: 'recruitment.nav.candidates' }];

  protected readonly entityType = ENTITY_CANDIDATE;
  protected readonly sorts = CANDIDATE_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly dueSoonDays = DUE_SOON_DAYS;
  protected readonly stageValue = stageToneValue;

  protected readonly q = signal('');
  protected readonly pool = signal<PoolFilter>('');
  protected readonly retention = signal<RetentionFilter>('');
  protected readonly sort = signal<CandidateSort>(this.initialSort());
  protected readonly offset = signal(0);
  private readonly version = signal(0);

  protected readonly items = signal<readonly Candidate[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly filtered = computed(
    () => this.q() !== '' || this.pool() !== '' || this.retention() !== '',
  );
  protected readonly viewFilters = computed(() => ({
    pool: this.pool(),
    retention: this.retention(),
    sort: this.sort(),
  }));

  constructor() {
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_CANDIDATE,
      view: 'list',
      title: this.language.translate('recruitment.candidates.title'),
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      this.version();
      const pool = this.pool();
      const query = {
        q: this.q(),
        talent_pool: pool === '' ? undefined : pool === 'yes',
        retention_before:
          this.retention() === 'soon'
            ? new Date(Date.now() + DUE_SOON_DAYS * 86_400_000).toISOString()
            : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      if (!orgId) {
        return;
      }
      this.loading.set(true);
      this.errorKey.set(null);
      const sub = this.api.listCandidates(orgId, query).subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
          this.coverage
            .load(
              ENTITY_CANDIDATE,
              res.items.map((c) => c.id),
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

  private initialSort(): CandidateSort {
    const value = this.params.get('sort');
    return value && (CANDIDATE_SORTS as readonly string[]).includes(value)
      ? (value as CandidateSort)
      : '-created_at';
  }

  protected isDue(row: Candidate): boolean {
    return retentionDue(row.retention_until, DUE_SOON_DAYS);
  }

  protected subtitle(row: Candidate): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return [
      t(`recruitment.source.${row.source}`),
      t(
        row.application_count === 1
          ? 'recruitment.candidates.applicationOne'
          : 'recruitment.candidates.applicationCount',
        { count: row.application_count },
      ),
    ].join(' · ');
  }

  /** "Slettes 3. feb. 2027" / "Slettes når søknaden lukkes". */
  protected retentionText(row: Candidate): string {
    if (row.retention_until) {
      return this.language.translate('recruitment.candidates.deletesOn', {
        date: formatLocalDate(row.retention_until, 'mediumDate', this.language.locale()),
      });
    }
    return this.language.translate('recruitment.candidates.deletesWhenClosed');
  }

  protected sortKey(sort: CandidateSort): string {
    return sort === '-created_at' ? 'newest' : sort === 'created_at' ? 'oldest' : sort;
  }

  protected onSearch(text: string): void {
    this.q.set(text.trim());
    this.offset.set(0);
  }

  protected setPool(value: string): void {
    this.pool.set(value === 'yes' || value === 'no' ? value : '');
    this.offset.set(0);
  }

  protected setRetention(value: string): void {
    this.retention.set(value === 'soon' ? 'soon' : '');
    this.offset.set(0);
  }

  protected setSort(value: string): void {
    if ((CANDIDATE_SORTS as readonly string[]).includes(value)) {
      this.sort.set(value as CandidateSort);
      this.offset.set(0);
    }
  }

  protected clearFilters(): void {
    this.pool.set('');
    this.retention.set('');
    this.q.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.setPool(view.filters['pool'] ?? '');
    this.setRetention(view.filters['retention'] ?? '');
    this.setSort(view.filters['sort'] ?? '-created_at');
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }

  protected create(): void {
    void this.router.navigate(['/recruitment/candidates/new']);
  }
}

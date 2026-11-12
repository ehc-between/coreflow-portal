import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecruitmentApi } from '../data/recruitment-api';
import { retentionDue } from '../data/recruitment-display';
import {
  CANDIDATE_SORTS,
  Candidate,
  CandidateSort,
  ENTITY_CANDIDATE,
  MODULE_KEY,
} from '../data/recruitment.models';
import { RecruitmentLessonButton } from '../shared/recruitment-lesson-button';
import { RecruitmentNav } from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';

const PAGE_SIZE = 25;
const DUE_SOON_DAYS = 30;

type PoolFilter = '' | 'yes' | 'no';
type RetentionFilter = '' | 'soon';

/**
 * Candidates the caller may see (their hiring teams, records they created, or all
 * with `recruitment:manage`), with talent-pool and retention filters.
 */
@Component({
  selector: 'app-candidates-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    RecordListPage,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    LocalDatePipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    RecruitmentNav,
    RecruitmentLessonButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="recruitment.candidates.title"
      scope="recruitment"
      page="candidates"
      searchPlaceholderKey="recruitment.candidates.search"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="!loading() && items().length === 0 && !filtered()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3 flex flex-col gap-3">
        <app-recruitment-nav />
        <app-guide-intro scope="recruitment" page="candidates" />
      </div>
      <ng-container toolbar>
        <app-recruitment-lesson-button lesson="candidate-privacy" />
        @if (perms().write) {
          <a routerLink="/recruitment/candidates/new">
            <app-button>
              <app-icon name="userplus" [size]="15" />
              {{ 'recruitment.candidates.new' | transloco }}
            </app-button>
          </a>
        }
      </ng-container>
      <ng-container filters>
        <label class="sr-only" for="cand-pool">{{
          'recruitment.filters.talentPool' | transloco
        }}</label>
        <select
          id="cand-pool"
          class="cf-filter"
          [value]="pool()"
          (change)="setPool($any($event.target).value)"
        >
          <option value="">{{ 'recruitment.filters.anyPool' | transloco }}</option>
          <option value="yes">{{ 'recruitment.filters.inPool' | transloco }}</option>
          <option value="no">{{ 'recruitment.filters.notInPool' | transloco }}</option>
        </select>
        <label class="sr-only" for="cand-retention">{{
          'recruitment.filters.retention' | transloco
        }}</label>
        <select
          id="cand-retention"
          class="cf-filter"
          [value]="retention()"
          (change)="setRetention($any($event.target).value)"
        >
          <option value="">{{ 'recruitment.filters.anyRetention' | transloco }}</option>
          <option value="soon">
            {{ 'recruitment.filters.retentionSoon' | transloco: { days: dueSoonDays } }}
          </option>
        </select>
        <label class="sr-only" for="cand-sort">{{ 'recruitment.filters.sort' | transloco }}</label>
        <select
          id="cand-sort"
          class="cf-filter"
          [value]="sort()"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s">
              {{ 'recruitment.candidates.sort.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <app-card [padded]="false">
        @if (loading() && items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        } @else if (items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'recruitment.common.noMatches' | transloco }}
          </p>
        } @else {
          <ul>
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/recruitment/candidates', row.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span class="w-[84px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{ row.full_name }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      {{ 'recruitment.source.' + row.source | transloco }} ·
                      {{
                        'recruitment.candidates.applicationCount'
                          | transloco: { count: row.application_count }
                      }}
                    </span>
                  </span>
                  @if (row.talent_pool_consent) {
                    <app-badge tone="accent">{{
                      'recruitment.candidates.inPool' | transloco
                    }}</app-badge>
                  }
                  @if (!row.privacy_notice_given_at) {
                    <app-badge tone="warn">{{
                      'recruitment.candidates.noticeMissing' | transloco
                    }}</app-badge>
                  }
                  <span
                    class="w-[160px] flex-none text-right text-[12.5px]"
                    [class.text-fail]="isDue(row)"
                    [class.font-semibold]="isDue(row)"
                    [class.text-fg-subtle]="!isDue(row)"
                  >
                    @if (row.retention_until) {
                      {{
                        'recruitment.candidates.retainedUntil'
                          | transloco: { date: (row.retention_until | localDate) }
                      }}
                    }
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </app-card>
      <app-pager
        [offset]="offset()"
        [pageSize]="pageSize"
        [count]="items().length"
        [total]="total()"
        (pageChange)="offset.set($event)"
      />
      <div class="mt-6">
        <app-why-it-matters scope="recruitment" page="candidates" />
      </div>

      <div empty>
        <app-card>
          <app-teaching-empty
            scope="recruitment"
            page="candidates"
            [showAction]="perms().write"
            (action)="create()"
          />
        </app-card>
        <div class="mt-6">
          <app-why-it-matters scope="recruitment" page="candidates" />
        </div>
      </div>
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
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
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
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly perms = injectRecruitmentPerms();

  protected readonly sorts = CANDIDATE_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly dueSoonDays = DUE_SOON_DAYS;

  protected readonly q = signal('');
  protected readonly pool = signal<PoolFilter>('');
  protected readonly retention = signal<RetentionFilter>('');
  protected readonly sort = signal<CandidateSort>('-created_at');
  protected readonly offset = signal(0);

  protected readonly items = signal<readonly Candidate[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);

  protected readonly filtered = computed(
    () => this.q() !== '' || this.pool() !== '' || this.retention() !== '',
  );
  protected readonly viewFilters = computed(() => ({
    pool: this.pool(),
    retention: this.retention(),
    sort: this.sort(),
  }));

  constructor() {
    providePageContext(() => ({ module: MODULE_KEY, entityType: ENTITY_CANDIDATE, view: 'list' }));
    effect((onCleanup) => {
      const orgId = this.orgId();
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
      const sub = this.api.listCandidates(orgId, query).subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected isDue(row: Candidate): boolean {
    return retentionDue(row.retention_until, DUE_SOON_DAYS);
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

  protected applyView(view: SavedView): void {
    this.setPool(view.filters['pool'] ?? '');
    this.setRetention(view.filters['retention'] ?? '');
    this.setSort(view.filters['sort'] ?? '-created_at');
  }

  protected create(): void {
    void this.router.navigate(['/recruitment/candidates/new']);
  }
}

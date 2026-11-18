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
import { Router } from '@angular/router';
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
import { Badge } from '../../../shared/ui/badge/badge';
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
import { AiGovernanceApi } from '../data/ai-governance-api';
import { AiGovernanceStore } from '../data/ai-governance-store';
import {
  ASSESSMENT_KINDS,
  ASSESSMENT_SORTS,
  ASSESSMENT_STATUSES,
  AssessmentSort,
  AssessmentSummary,
} from '../data/ai-governance.models';
import {
  AI_ASSESSMENT_ENTITY,
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  assessmentStatusKey,
  assessmentStatusValue,
} from '../data/ai-governance-display';
import { AI_GOV_ROOT } from '../ui/ai-gov-page';
import { AiNav } from '../ui/ai-nav';

const PAGE_SIZE = 25;

/** Whether a draft assessment is past its due date (`now` injectable for tests). */
export function isOverdue(a: AssessmentSummary, now: Date = new Date()): boolean {
  return a.status === 'draft' && !!a.due_at && new Date(`${a.due_at}Z`).getTime() < now.getTime();
}

/** Whether an assessment's next review date has passed. */
export function isReviewOverdue(a: AssessmentSummary, now: Date = new Date()): boolean {
  return (
    a.status !== 'draft' &&
    !!a.next_review_at &&
    new Date(`${a.next_review_at}Z`).getTime() < now.getTime()
  );
}

/**
 * `/ai-governance/assessments`: classification, impact (ISO/IEC 42001 6.1.4)
 * and fundamental rights (Art. 27) assessments across all AI systems, with
 * search, kind / status filters, "needs review", sorting, saved views and
 * paging. Each row says how far it is ("2 av 4 påkrevde deler skrevet"),
 * whether the system changed since, and when it is due or next reviewed. The
 * overview deep-links with `?status=completed`, `?status=draft` and
 * `?needs_review=true`.
 */
@Component({
  selector: 'app-ai-assessments-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
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
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    AiNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="aiGovernance.assessments.title"
      descriptionKey="aiGovernance.assessments.subtitle"
      [scope]="scope"
      page="assessments"
      settingsLink="/ai-governance/settings"
      [breadcrumbs]="[root, { labelKey: 'aiGovernance.assessments.title' }]"
      searchPlaceholderKey="aiGovernance.assessments.searchPlaceholder"
      [query]="q()"
      [filters]="filters()"
      [moreFiltersActive]="review() ? 1 : 0"
      [empty]="state() === 'ready' && total() === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (store.canWrite()) {
        <app-button primary (click)="create()" data-testid="assessment-new">
          <app-icon name="plus" [size]="14" />
          {{ 'aiGovernance.assessments.new' | transloco }}
        </app-button>
      }

      <app-ai-nav nav />
      <app-help-strip help [scope]="scope" page="assessments" lesson="impact-assessment-and-fria" />

      <ng-container filters>
        <label class="sr-only" for="aia-kind">{{ 'aiGovernance.filters.kind' | transloco }}</label>
        <select
          id="aia-kind"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setFilter('kind', $any($event.target).value)"
        >
          <option value="" [selected]="!kindFilter()">
            {{ 'aiGovernance.filters.anyKind' | transloco }}
          </option>
          @for (k of kinds; track k) {
            <option [value]="k" [selected]="kindFilter() === k">
              {{ kindShortKey(k) | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="aia-status">{{
          'aiGovernance.filters.status' | transloco
        }}</label>
        <select
          id="aia-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setFilter('status', $any($event.target).value)"
        >
          <option value="" [selected]="!statusFilter()">
            {{ 'aiGovernance.filters.anyStatus' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="statusFilter() === s">
              {{ statusKey(s) | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="review()"
            (change)="setReview($any($event.target).checked)"
            data-testid="filter-needs-review"
          />
          {{ 'aiGovernance.filters.needsReview' | transloco }}
        </label>
        <div class="flex flex-col gap-1">
          <label class="text-meta font-semibold text-fg-muted" for="aia-sort">{{
            'aiGovernance.filters.sort' | transloco
          }}</label>
          <select
            id="aia-sort"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'aiGovernance.assessments.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload.update((n) => n + 1)" />
          }
          @default {
            @if (items().length === 0) {
              <app-empty-state
                icon="search"
                titleKey="ui.empty.noResults"
                ctaKey="aiGovernance.filters.clear"
                ctaVariant="secondary"
                [compact]="true"
                (cta)="clearFilters()"
              />
            } @else {
              <div
                role="list"
                [attr.aria-label]="'aiGovernance.assessments.title' | transloco"
                data-testid="assessments-list"
              >
                <app-record-row-header dateKind="due" />
                @for (a of items(); track a.id) {
                  <app-record-row
                    [code]="a.code"
                    [title]="a.title"
                    [subtitle]="subtitle(a)"
                    [link]="['/ai-governance/assessments', a.id]"
                    [owner]="a.owner?.name ?? ('aiGovernance.common.noOwner' | transloco)"
                    [date]="a.status === 'draft' ? a.due_at : (a.next_review_at ?? null)"
                    [dateKind]="a.status === 'draft' ? 'due' : 'next'"
                    [overdue]="overdue(a) || reviewOverdue(a)"
                  >
                    <app-coverage-chip
                      coverage
                      class="max-w-full [&_[data-testid=coverage-chip]]:flex-wrap [&_[data-testid=coverage-chip]]:whitespace-normal"
                      [entityType]="entity"
                      [entityId]="a.id"
                    />
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="statusValue(a.status)"
                      [labelKey]="statusKey(a.status)"
                    />
                    @if (a.review_flag) {
                      <app-badge badges tone="warn">{{
                        'aiGovernance.assessments.needsReview' | transloco
                      }}</app-badge>
                    }
                  </app-record-row>
                }
              </div>
              <div class="px-4 py-2">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="items().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <app-card empty>
        <app-teaching-empty
          [scope]="scope"
          page="assessments"
          [showAction]="store.canWrite()"
          (action)="create()"
        />
      </app-card>

      <app-why-it-matters below [scope]="scope" page="assessments" />
    </app-record-list-page>
  `,
})
export class AiAssessmentsList {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly root = AI_GOV_ROOT;
  protected readonly entity = AI_ASSESSMENT_ENTITY;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly kinds = ASSESSMENT_KINDS;
  protected readonly statuses = ASSESSMENT_STATUSES;
  protected readonly sorts = ASSESSMENT_SORTS;
  protected readonly kindShortKey = (k: string): string => `aiGovernance.kindShort.${k}`;
  protected readonly statusKey = assessmentStatusKey;
  protected readonly statusValue = assessmentStatusValue;
  protected readonly overdue = (a: AssessmentSummary): boolean => isOverdue(a);
  protected readonly reviewOverdue = (a: AssessmentSummary): boolean => isReviewOverdue(a);

  /** Query params from the overview's deep links. */
  readonly status = input<string | undefined>(undefined);
  readonly kind = input<string | undefined>(undefined);
  readonly needs_review = input<string | undefined>(undefined);

  protected readonly q = signal('');
  protected readonly kindFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly review = signal(false);
  protected readonly sort = signal<AssessmentSort>('-updated_at');
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly AssessmentSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly reload = signal(0);

  protected readonly filters = computed(() => ({
    kind: this.kindFilter(),
    status: this.statusFilter(),
    review: this.review() ? '1' : '',
    sort: this.sort(),
  }));
  protected readonly isFiltered = computed(
    () => !!this.q() || !!this.kindFilter() || !!this.statusFilter() || this.review(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_ASSESSMENT_ENTITY,
      view: 'list',
      title: this.language.translate('aiGovernance.assessments.title'),
    }));
    effect(() => {
      const status = this.status();
      const kind = this.kind();
      const needsReview = this.needs_review();
      untracked(() => {
        if (status && (ASSESSMENT_STATUSES as readonly string[]).includes(status)) {
          this.statusFilter.set(status);
        }
        if (kind && (ASSESSMENT_KINDS as readonly string[]).includes(kind)) {
          this.kindFilter.set(kind);
        }
        if (needsReview === 'true') {
          this.review.set(true);
        }
      });
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reload();
      this.language.active();
      const query = {
        q: this.q() || undefined,
        kind: this.kindFilter() || undefined,
        status: this.statusFilter() || undefined,
        needs_review: this.review() ? true : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.listAssessments(orgId, query).subscribe({
          next: (page) => {
            this.items.set(page.items);
            this.total.set(page.total);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  /** "Konsekvensvurdering · AIS-004 Rangering … · 2 av 4 påkrevde deler skrevet". */
  protected subtitle(a: AssessmentSummary): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [
      t(`aiGovernance.kindShort.${a.kind}`),
      `${a.ai_system.code} ${a.ai_system.name}`,
    ];
    if (a.kind !== 'classification' && a.status === 'draft' && a.required_total) {
      parts.push(
        t('aiGovernance.assessments.progress', {
          done: a.required_complete ?? 0,
          total: a.required_total,
        }),
      );
    }
    return parts.join(' · ');
  }

  protected setQuery(q: string): void {
    this.offset.set(0);
    this.q.set(q.trim());
  }

  protected setFilter(key: 'kind' | 'status' | 'sort', value: string): void {
    this.offset.set(0);
    if (key === 'sort') {
      this.sort.set(this.toSort(value));
    } else if (key === 'kind') {
      this.kindFilter.set(value);
    } else {
      this.statusFilter.set(value);
    }
  }

  protected setReview(on: boolean): void {
    this.offset.set(0);
    this.review.set(on);
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.kindFilter.set('');
    this.statusFilter.set('');
    this.review.set(false);
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.kindFilter.set(view.filters['kind'] ?? '');
    this.statusFilter.set(view.filters['status'] ?? '');
    this.review.set(view.filters['review'] === '1');
    this.sort.set(this.toSort(view.filters['sort'] ?? ''));
  }

  private toSort(value: string): AssessmentSort {
    return (ASSESSMENT_SORTS as readonly string[]).includes(value)
      ? (value as AssessmentSort)
      : '-updated_at';
  }

  protected create(): void {
    void this.router.navigate(['/ai-governance/assessments/new']);
  }
}

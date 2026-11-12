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
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
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
  assessmentStatusTone,
  kindKey,
} from '../data/ai-governance-display';
import { AiGovNav } from '../ui/ai-gov-nav';
import { AiLessonCard } from '../ui/ai-lesson-card';

const PAGE_SIZE = 25;

/** Whether a draft assessment is past its due date (`now` injectable for tests). */
export function isOverdue(a: AssessmentSummary, now: Date = new Date()): boolean {
  return a.status === 'draft' && !!a.due_at && new Date(`${a.due_at}Z`).getTime() < now.getTime();
}

/**
 * `/ai-governance/assessments`: classification, impact (ISO/IEC 42001 6.1.4)
 * and fundamental rights (Art. 27) assessments across all AI systems, with
 * search, kind / status filters, sorting, saved views and paging.
 */
@Component({
  selector: 'app-ai-assessments-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    RecordListPage,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    AiGovNav,
    AiLessonCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="aiGovernance.assessments.title"
      [scope]="scope"
      page="assessments"
      searchPlaceholderKey="aiGovernance.assessments.searchPlaceholder"
      [query]="q()"
      [filters]="filters()"
      [empty]="state() === 'ready' && total() === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3 flex flex-col gap-3">
        <app-ai-gov-nav />
        <app-guide-intro [scope]="scope" page="assessments" />
      </div>
      <div toolbar>
        @if (store.canWrite()) {
          <app-button size="sm" (click)="create()" data-testid="assessment-new">
            <app-icon name="plus" [size]="14" />
            {{ 'aiGovernance.assessments.new' | transloco }}
          </app-button>
        }
      </div>
      <div filters class="flex flex-wrap items-center gap-2">
        <label class="sr-only" for="aia-kind">{{ 'aiGovernance.filters.kind' | transloco }}</label>
        <select
          id="aia-kind"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setFilter('kind', $any($event.target).value)"
        >
          <option value="" [selected]="!kind()">
            {{ 'aiGovernance.filters.anyKind' | transloco }}
          </option>
          @for (k of kinds; track k) {
            <option [value]="k" [selected]="kind() === k">{{ kindKey(k) | transloco }}</option>
          }
        </select>
        <label class="sr-only" for="aia-status">{{
          'aiGovernance.filters.status' | transloco
        }}</label>
        <select
          id="aia-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setFilter('status', $any($event.target).value)"
        >
          <option value="" [selected]="!status()">
            {{ 'aiGovernance.filters.anyStatus' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">{{ statusKey(s) | transloco }}</option>
          }
        </select>
        <label class="sr-only" for="aia-sort">{{ 'aiGovernance.filters.sort' | transloco }}</label>
        <select
          id="aia-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setFilter('sort', $any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'aiGovernance.assessments.sorts.' + s | transloco }}
            </option>
          }
        </select>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'aiGovernance.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ errorKey() | transloco }}
            </p>
          }
          @default {
            @if (items().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'aiGovernance.filters.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="assessments-list">
                @for (a of items(); track a.id) {
                  <li
                    class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
                    [class.bg-fail-soft]="overdue(a)"
                  >
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/ai-governance/assessments', a.id]"
                        class="block truncate text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="mr-1.5 font-mono text-[12px] text-fg-subtle">{{
                          a.code
                        }}</span>
                        {{ a.title }}
                      </a>
                      <a
                        [routerLink]="['/ai-governance/systems', a.ai_system.id]"
                        class="text-[12px] text-fg-subtle hover:underline"
                      >
                        {{ a.ai_system.code }} {{ a.ai_system.name }}
                      </a>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      @if (a.owner) {
                        <span>{{ a.owner.name }}</span>
                      }
                      <app-badge tone="neutral">{{ kindKey(a.kind) | transloco }}</app-badge>
                      <app-badge [tone]="statusTone(a.status)">{{
                        statusKey(a.status) | transloco
                      }}</app-badge>
                      <span
                        class="inline-flex min-w-[96px] items-center justify-end gap-1"
                        [class.text-fail]="overdue(a)"
                        [class.font-semibold]="overdue(a)"
                      >
                        @if (overdue(a)) {
                          <app-icon name="alert" [size]="13" />
                          <span class="sr-only">{{
                            'aiGovernance.common.overdue' | transloco
                          }}</span>
                        }
                        @if (a.due_at) {
                          {{ a.due_at | localDay }}
                        } @else {
                          {{ 'aiGovernance.common.noDueDate' | transloco }}
                        }
                      </span>
                    </span>
                  </li>
                }
              </ul>
              <div class="border-t border-border px-4 py-2.5">
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

      <div empty>
        <app-card>
          <app-teaching-empty
            [scope]="scope"
            page="assessments"
            [showAction]="store.canWrite()"
            (action)="create()"
          />
        </app-card>
      </div>
    </app-record-list-page>
    <div class="mx-auto -mt-6 flex max-w-[1180px] flex-col gap-4 px-4 pb-12 sm:px-8">
      <app-ai-lesson-card lesson="impact-assessment-and-fria" />
      <app-why-it-matters [scope]="scope" page="assessments" />
    </div>
  `,
})
export class AiAssessmentsList {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly kinds = ASSESSMENT_KINDS;
  protected readonly statuses = ASSESSMENT_STATUSES;
  protected readonly sorts = ASSESSMENT_SORTS;
  protected readonly kindKey = kindKey;
  protected readonly statusKey = assessmentStatusKey;
  protected readonly statusTone = assessmentStatusTone;
  protected readonly overdue = (a: AssessmentSummary): boolean => isOverdue(a);

  protected readonly q = signal('');
  protected readonly kind = signal('');
  protected readonly status = signal('');
  protected readonly sort = signal<AssessmentSort>('-updated_at');
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('aiGovernance.common.loadFailed');
  protected readonly items = signal<readonly AssessmentSummary[]>([]);
  protected readonly total = signal(0);

  protected readonly filters = computed(() => ({
    kind: this.kind(),
    status: this.status(),
    sort: this.sort(),
  }));
  protected readonly isFiltered = computed(() => !!this.q() || !!this.kind() || !!this.status());

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
      const orgId = this.selectedOrg.currentOrgId();
      const query = {
        q: this.q() || undefined,
        kind: this.kind() || undefined,
        status: this.status() || undefined,
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
          error: (err: unknown) => {
            this.errorKey.set(aiGovernanceErrorKey(err));
            this.state.set('error');
          },
        });
      });
    });
  }

  protected setQuery(q: string): void {
    this.offset.set(0);
    this.q.set(q.trim());
  }

  protected setFilter(key: 'kind' | 'status' | 'sort', value: string): void {
    this.offset.set(0);
    if (key === 'sort') {
      this.sort.set(this.toSort(value));
    } else {
      this[key].set(value);
    }
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.kind.set(view.filters['kind'] ?? '');
    this.status.set(view.filters['status'] ?? '');
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

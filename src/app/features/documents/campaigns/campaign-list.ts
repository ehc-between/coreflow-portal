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
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { DocumentControlApi } from '../data/document-control-api';
import {
  CAMPAIGN_SORTS,
  CAMPAIGN_STATUSES,
  Campaign,
  CampaignListQuery,
  CampaignSort,
  CampaignStatus,
} from '../data/document-control.models';
import { campaignStatusTone } from '../shared/document-control-display';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';

const PAGE_SIZE = 50;

/** Status filter values: the open ones (draft + active), everything, or one status. */
export const CAMPAIGN_STATUS_FILTERS = ['open', 'all', ...CAMPAIGN_STATUSES] as const;
export type CampaignStatusFilter = (typeof CAMPAIGN_STATUS_FILTERS)[number];

export function campaignQuery(
  status: CampaignStatusFilter,
  sort: CampaignSort,
  q: string,
  offset: number,
): CampaignListQuery {
  const statuses: readonly CampaignStatus[] =
    status === 'open' ? ['draft', 'active'] : status === 'all' ? [] : [status];
  return { q: q || undefined, status: statuses, sort, limit: PAGE_SIZE, offset };
}

/**
 * Distribution and read-and-acknowledge campaigns: who must read which approved
 * revision, by when, and how far along they are.
 */
@Component({
  selector: 'app-campaign-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    TeachingEmpty,
    TourStepDirective,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    ProgressBar,
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="documents.control.campaigns.title"
      scope="documents"
      page="campaigns"
      searchPlaceholderKey="documents.control.campaigns.searchPlaceholder"
      [query]="q()"
      [filters]="{ status: status(), sort: sort() }"
      [empty]="state() === 'ready' && rows().length === 0 && !q() && status() === 'open'"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3">
        <app-documents-page-guide page="campaigns" lesson="read-and-acknowledge" tour="campaigns" />
      </div>
      <app-button toolbar size="sm" [appTourStep]="'documents-campaign-new'" (click)="create()">
        <app-icon name="plus" [size]="14" />
        {{ 'documents.control.campaigns.new' | transloco }}
      </app-button>

      <ng-container filters>
        <label class="sr-only" for="camp-f-status">{{
          'documents.control.fields.status' | transloco
        }}</label>
        <select
          id="camp-f-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setStatus($any($event.target).value)"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="s === status()">
              {{ 'documents.control.campaigns.statusFilters.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="camp-f-sort">{{
          'documents.control.filters.sort' | transloco
        }}</label>
        <select
          id="camp-f-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setSort($any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === sort()">
              {{ 'documents.control.filters.sorts.' + s | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'documents.control.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'documents.control.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'documents.control.filters.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border">
                @for (c of rows(); track c.id) {
                  <li
                    class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                    data-testid="campaign-row"
                  >
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/documents/campaigns', c.id]"
                        class="font-semibold text-fg hover:underline"
                        >{{ c.title }}</a
                      >
                      <p class="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                        <span class="font-mono">{{ c.document.code }}</span>
                        <span>{{ c.document.title }}</span>
                        @if (c.revision) {
                          <span>{{
                            'documents.control.campaigns.revisionShort'
                              | transloco: { rev: c.revision }
                          }}</span>
                        }
                        @if (c.due_at) {
                          <span>{{
                            'documents.control.campaigns.dueOn'
                              | transloco: { date: (c.due_at | localDay) }
                          }}</span>
                        }
                      </p>
                    </div>
                    <div class="flex items-center gap-3 sm:w-[300px]">
                      @if (c.status !== 'draft') {
                        <div class="min-w-0 flex-1">
                          <app-progress-bar
                            [value]="c.stats.percent"
                            [label]="
                              'documents.control.campaigns.progress'
                                | transloco: { done: c.stats.acknowledged, total: c.stats.total }
                            "
                          />
                          <p class="mt-0.5 text-[11.5px] text-fg-subtle">
                            {{
                              (c.require_acknowledgement
                                ? 'documents.control.campaigns.progress'
                                : 'documents.control.campaigns.recipientsCount'
                              ) | transloco: { done: c.stats.acknowledged, total: c.stats.total }
                            }}
                            @if (c.stats.overdue > 0) {
                              <span class="font-semibold text-fail">
                                ·
                                {{
                                  'documents.control.campaigns.overdueCount'
                                    | transloco: { count: c.stats.overdue }
                                }}
                              </span>
                            }
                          </p>
                        </div>
                      } @else {
                        <span class="flex-1"></span>
                      }
                      <app-badge [tone]="tone(c.status)">
                        {{ 'documents.control.campaigns.status.' + c.status | transloco }}
                      </app-badge>
                    </div>
                  </li>
                }
              </ul>
              <div class="border-t border-border px-4 py-2">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="rows().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <app-teaching-empty empty scope="documents" page="campaigns" (action)="create()" />
    </app-record-list-page>
  `,
})
export class CampaignListPage {
  private readonly api = inject(DocumentControlApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  protected readonly statusFilters = CAMPAIGN_STATUS_FILTERS;
  protected readonly sorts = CAMPAIGN_SORTS;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly q = signal('');
  protected readonly status = signal<CampaignStatusFilter>('open');
  protected readonly sort = signal<CampaignSort>('-created_at');
  protected readonly offset = signal(0);
  protected readonly rows = signal<readonly Campaign[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private sub: Subscription | null = null;

  private readonly query = computed(() =>
    campaignQuery(this.status(), this.sort(), this.q(), this.offset()),
  );

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'distribution_campaign',
      view: 'list',
      title: this.language.translate('documents.control.campaigns.title'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const query = this.query();
      untracked(() => this.load(orgId, query));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, query: CampaignListQuery): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = this.api.listCampaigns(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected tone(status: CampaignStatus) {
    return campaignStatusTone(status);
  }

  protected setQuery(q: string): void {
    this.q.set(q);
    this.offset.set(0);
  }

  protected setStatus(value: string): void {
    const status = (CAMPAIGN_STATUS_FILTERS as readonly string[]).includes(value)
      ? (value as CampaignStatusFilter)
      : 'open';
    this.status.set(status);
    this.offset.set(0);
  }

  protected setSort(value: string): void {
    this.sort.set(
      (CAMPAIGN_SORTS as readonly string[]).includes(value)
        ? (value as CampaignSort)
        : '-created_at',
    );
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.setStatus(view.filters['status'] ?? 'open');
    this.setSort(view.filters['sort'] ?? '-created_at');
  }

  protected create(): void {
    void this.router.navigateByUrl('/documents/campaigns/new');
  }
}

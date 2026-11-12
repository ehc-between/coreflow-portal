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
import { AuthService } from '../../../core/auth/auth.service';
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
import { DocumentControlApi } from '../data/document-control-api';
import {
  EXTERNAL_SORTS,
  EXTERNAL_STATUSES,
  ExternalDocument,
  ExternalListQuery,
  ExternalSort,
  ExternalStatus,
} from '../data/document-control.models';
import { externalStatusTone } from '../shared/document-control-display';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';

const PAGE_SIZE = 50;

export const EXTERNAL_STATUS_FILTERS = [...EXTERNAL_STATUSES, 'all'] as const;
export type ExternalStatusFilter = (typeof EXTERNAL_STATUS_FILTERS)[number];

export interface ExternalFilters {
  readonly status: ExternalStatusFilter;
  readonly mine: boolean;
  readonly reviewDue: boolean;
  readonly sort: ExternalSort;
}

const DEFAULTS: ExternalFilters = {
  status: 'current',
  mine: false,
  reviewDue: false,
  sort: 'title',
};

export function parseExternalFilters(
  raw: Readonly<Record<string, string | undefined>>,
): ExternalFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T) =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  return {
    status: pick(raw['status'], EXTERNAL_STATUS_FILTERS, DEFAULTS.status),
    mine: raw['mine'] === '1',
    reviewDue: raw['reviewDue'] === '1',
    sort: pick(raw['sort'], EXTERNAL_SORTS, DEFAULTS.sort),
  };
}

export function externalQuery(
  filters: ExternalFilters,
  q: string,
  me: string | null,
  offset: number,
): ExternalListQuery {
  // One status narrows the list; "all" sends none.
  const status: readonly ExternalStatus[] = filters.status === 'all' ? [] : [filters.status];
  return {
    q: q || undefined,
    status,
    owner: filters.mine && me ? me : undefined,
    review_due: filters.reviewDue,
    sort: filters.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * The register of external documents (ISO HS 7.5.3.2): standards, laws, supplier
 * manuals and customer specifications the organisation relies on, with their
 * publisher, version and when they were last checked for changes.
 */
@Component({
  selector: 'app-external-list',
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
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="documents.control.external.title"
      scope="documents"
      page="external"
      searchPlaceholderKey="documents.control.external.searchPlaceholder"
      [query]="q()"
      [filters]="filterRecord()"
      [empty]="state() === 'ready' && rows().length === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3">
        <app-documents-page-guide page="external" lesson="external-documents" tour="external" />
      </div>
      @if (perms.canDraft()) {
        <app-button toolbar size="sm" [appTourStep]="'documents-external-new'" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'documents.control.external.new' | transloco }}
        </app-button>
      }

      <ng-container filters>
        <label class="sr-only" for="ext-f-status">{{
          'documents.control.fields.status' | transloco
        }}</label>
        <select
          id="ext-f-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="patch({ status: $any($event.target).value })"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="s === filters().status">
              {{ 'documents.control.external.statusFilters.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ext-f-sort">{{
          'documents.control.filters.sort' | transloco
        }}</label>
        <select
          id="ext-f-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="patch({ sort: $any($event.target).value })"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === filters().sort">
              {{ 'documents.control.filters.sorts.' + s | transloco }}
            </option>
          }
        </select>
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg-muted">
          <input
            type="checkbox"
            [checked]="filters().mine"
            (change)="patch({ mine: $any($event.target).checked })"
          />
          {{ 'documents.control.filters.mine' | transloco }}
        </label>
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg-muted">
          <input
            type="checkbox"
            [checked]="filters().reviewDue"
            (change)="patch({ reviewDue: $any($event.target).checked })"
          />
          {{ 'documents.control.filters.reviewDue' | transloco }}
        </label>
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
              <div class="overflow-x-auto">
                <table class="w-full min-w-[720px] text-left text-[13px]">
                  <caption class="sr-only">
                    {{
                      'documents.control.external.title' | transloco
                    }}
                  </caption>
                  <thead class="border-b border-border text-[12px] text-fg-muted">
                    <tr>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'documents.control.fields.title' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.external.fields.publisher' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.external.fields.version' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.status' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.owner' | transloco }}
                      </th>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'documents.control.fields.nextReview' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (r of rows(); track r.id) {
                      <tr class="align-top hover:bg-surface-2" data-testid="external-row">
                        <td class="px-4 py-2.5">
                          <a
                            [routerLink]="['/documents/external', r.id]"
                            class="font-semibold text-fg hover:underline"
                            >{{ r.title }}</a
                          >
                          @if (r.code || r.reference) {
                            <div class="mt-0.5 font-mono text-[12px] text-fg-subtle">
                              {{ r.code || r.reference }}
                            </div>
                          }
                        </td>
                        <td class="px-2 py-2.5 text-fg-muted">{{ r.publisher || '—' }}</td>
                        <td class="px-2 py-2.5 text-fg-muted">{{ r.version || '—' }}</td>
                        <td class="px-2 py-2.5">
                          <app-badge [tone]="tone(r.status)">{{
                            'documents.control.external.status.' + r.status | transloco
                          }}</app-badge>
                        </td>
                        <td class="px-2 py-2.5 text-fg-muted">
                          {{ r.owner?.name ?? ('documents.control.common.unassigned' | transloco) }}
                        </td>
                        <td
                          class="px-4 py-2.5 whitespace-nowrap"
                          [class.text-fail]="r.review_overdue"
                          [class.font-semibold]="r.review_overdue"
                        >
                          {{ r.next_review_at ? (r.next_review_at | localDay) : '—' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
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

      <app-teaching-empty
        empty
        scope="documents"
        page="external"
        [showAction]="perms.canDraft()"
        (action)="create()"
      />
    </app-record-list-page>
  `,
})
export class ExternalListPage {
  private readonly api = inject(DocumentControlApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  protected readonly statusFilters = EXTERNAL_STATUS_FILTERS;
  protected readonly sorts = EXTERNAL_SORTS;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly q = signal('');
  protected readonly filters = signal<ExternalFilters>(DEFAULTS);
  protected readonly offset = signal(0);
  protected readonly rows = signal<readonly ExternalDocument[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private sub: Subscription | null = null;

  protected readonly isFiltered = computed(() => {
    const f = this.filters();
    return !!this.q() || f.status !== 'current' || f.mine || f.reviewDue;
  });

  protected readonly filterRecord = computed<Record<string, string>>(() => {
    const f = this.filters();
    return {
      status: f.status,
      mine: f.mine ? '1' : '',
      reviewDue: f.reviewDue ? '1' : '',
      sort: f.sort,
    };
  });

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'external_document',
      view: 'list',
      title: this.language.translate('documents.control.external.title'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const query = externalQuery(
        this.filters(),
        this.q(),
        this.auth.user()?.id ?? null,
        this.offset(),
      );
      untracked(() => this.load(orgId, query));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, query: ExternalListQuery): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = this.api.listExternal(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected tone(status: ExternalStatus) {
    return externalStatusTone(status);
  }

  protected setQuery(q: string): void {
    this.q.set(q);
    this.offset.set(0);
  }

  protected patch(change: Partial<ExternalFilters>): void {
    this.filters.update((f) => ({ ...f, ...change }));
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.filters.set(parseExternalFilters(view.filters));
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigateByUrl('/documents/external/new');
  }
}

import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import {
  DocumentSearchResult,
  DocumentStatus,
  DocumentSummary,
} from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { STATUS_FILTERS, statusLabelKey, statusTone } from './document-status';
import { ReviewState, reviewLabelKey, reviewState, reviewTone } from './workflow/document-review';

/** Rows per page of the documents list. */
export const DOCUMENTS_PAGE_SIZE = 25;

/** A unified list row: either a list document or a search hit. */
interface Row {
  readonly id: string;
  readonly title: string;
  readonly doc_code: string;
  readonly status: string;
  readonly type: string;
  readonly current_rev?: string | number | null;
  readonly updated_at?: string;
  readonly snippet?: string;
  readonly review?: ReviewState;
}

/**
 * Documents list, scoped to the currently selected org. Shows a searchable,
 * status-filterable, paginated table of the org's documents and a New document
 * action (gated on `documents:draft`). Rows flag periodic reviews that are due
 * soon or overdue, and a "Review due" toggle narrows the list to them. A
 * non-empty search box switches to the search endpoint (unpaginated); clearing
 * it (or changing a filter) returns to the first page of the list. Reloads on
 * org switch.
 */
@Component({
  selector: 'app-documents-list',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Card,
    Badge,
    Button,
    Icon,
    Pager,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-8 pt-7 pb-12">
      <div class="mb-[18px] flex items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'documents.title' | transloco }}
          </h1>
          <div class="mt-1.5 text-[14px] text-fg-muted">{{ 'documents.subtitle' | transloco }}</div>
        </div>
        <a *appHasPermission="'documents:draft'" routerLink="/documents/new">
          <app-button>
            <app-icon name="plus" [size]="15" />
            {{ 'documents.new' | transloco }}
          </app-button>
        </a>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-2.5">
        <div
          class="flex h-10 flex-1 items-center gap-2.5 rounded-[10px] border border-border bg-bg px-3"
        >
          <span class="flex text-fg-subtle"><app-icon name="search" [size]="17" /></span>
          <input
            type="search"
            [(ngModel)]="query"
            (ngModelChange)="onQueryChange($event)"
            [placeholder]="'documents.searchPlaceholder' | transloco"
            [attr.aria-label]="'documents.searchPlaceholder' | transloco"
            class="h-full flex-1 bg-transparent text-[13.5px] text-fg outline-none"
          />
        </div>
        <select
          [ngModel]="status()"
          (ngModelChange)="onStatusChange($event)"
          [attr.aria-label]="'documents.filterStatus' | transloco"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
        >
          <option value="">{{ 'documents.status.all' | transloco }}</option>
          @for (option of statusFilters; track option) {
            <option [value]="option">{{ statusLabelKey(option) | transloco }}</option>
          }
        </select>
        <button
          type="button"
          [attr.aria-pressed]="reviewDue()"
          (click)="onReviewDueToggle()"
          class="flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13.5px] font-semibold transition-colors"
          [class]="
            reviewDue()
              ? 'border-warn/40 bg-warn-soft text-warn'
              : 'border-border bg-bg text-fg-muted hover:text-fg'
          "
        >
          <app-icon name="history" [size]="15" />
          {{ 'documents.review.filter' | transloco }}
        </button>
      </div>

      <app-card [padded]="false">
        @if (loading()) {
          <div class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        } @else if (rows().length === 0) {
          <div class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ (searching() ? 'documents.noResults' : 'documents.empty') | transloco }}
          </div>
        } @else {
          <ul>
            @for (row of rows(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a [routerLink]="['/documents', row.id]" class="flex items-center gap-3 px-4 py-3">
                  <span class="w-[92px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.doc_code
                  }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{ row.title }}</span>
                    @if (row.snippet) {
                      <span class="block truncate text-[12.5px] text-fg-muted">{{
                        row.snippet
                      }}</span>
                    }
                  </span>
                  @if (row.review; as review) {
                    <app-badge [tone]="reviewTone(review)">{{
                      reviewLabelKey(review) | transloco
                    }}</app-badge>
                  }
                  <app-badge tone="neutral">{{ row.type }}</app-badge>
                  <app-badge [tone]="statusTone(row.status)">{{
                    statusLabelKey(row.status) | transloco
                  }}</app-badge>
                  @if (row.current_rev !== null && row.current_rev !== undefined) {
                    <span class="w-[60px] flex-none text-right text-[12.5px] text-fg-subtle">
                      {{ 'documents.revShort' | transloco: { rev: row.current_rev } }}
                    </span>
                  }
                  @if (row.updated_at) {
                    <span class="w-[96px] flex-none text-right text-[12.5px] text-fg-subtle">
                      {{ row.updated_at | date: 'mediumDate' }}
                    </span>
                  }
                </a>
              </li>
            }
          </ul>
        }
      </app-card>

      @if (!loading() && !searching()) {
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="rows().length"
          [total]="total()"
          (pageChange)="goToPage($event)"
        />
      }
    </div>
  `,
})
export class DocumentsList {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly route = inject(ActivatedRoute);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly statusTone = statusTone;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly reviewTone = reviewTone;
  protected readonly reviewLabelKey = reviewLabelKey;
  protected readonly pageSize = DOCUMENTS_PAGE_SIZE;

  protected readonly query = signal('');
  protected readonly status = signal<DocumentStatus | ''>('');
  /** Only documents whose periodic review is due soon or overdue. */
  protected readonly reviewDue = signal(false);
  protected readonly offset = signal(0);
  /** Unpaged total; null when the backend doesn't report one. */
  protected readonly total = signal<number | null>(null);
  protected readonly rows = signal<readonly Row[]>([]);
  protected readonly loading = signal(false);
  protected readonly searching = signal(false);

  private readonly search$ = new Subject<{ orgId: string; q: string }>();

  constructor() {
    this.search$
      .pipe(
        debounceTime(250),
        distinctUntilChanged((a, b) => a.orgId === b.orgId && a.q === b.q),
        switchMap(({ orgId, q }) => this.api.search(orgId, q)),
      )
      .subscribe({
        next: (results) => {
          this.rows.set(results.map(this.fromSearch));
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });

    effect(() => {
      const orgId = this.orgId();
      // Reset transient state when the active org changes.
      this.query.set('');
      this.status.set(this.initialStatus());
      this.reviewDue.set(this.route.snapshot.queryParamMap.get('review') === 'due');
      this.offset.set(0);
      this.searching.set(false);
      this.rows.set([]);
      if (orgId) {
        this.loadList(orgId);
      }
    });
  }

  protected onQueryChange(value: string): void {
    const orgId = this.orgId();
    const q = value.trim();
    if (!orgId) {
      return;
    }
    if (q.length === 0) {
      this.searching.set(false);
      this.offset.set(0);
      this.loadList(orgId);
      return;
    }
    this.searching.set(true);
    this.loading.set(true);
    this.search$.next({ orgId, q });
  }

  protected onStatusChange(value: DocumentStatus | ''): void {
    this.status.set(value);
    const orgId = this.orgId();
    // A status filter applies to the full list, so clear any active search.
    this.query.set('');
    this.searching.set(false);
    this.offset.set(0);
    if (orgId) {
      this.loadList(orgId);
    }
  }

  protected onReviewDueToggle(): void {
    this.reviewDue.update((on) => !on);
    this.query.set('');
    this.searching.set(false);
    this.offset.set(0);
    const orgId = this.orgId();
    if (orgId) {
      this.loadList(orgId);
    }
  }

  protected goToPage(offset: number): void {
    const orgId = this.orgId();
    this.offset.set(offset);
    if (orgId) {
      this.loadList(orgId);
    }
  }

  /** A `?status=` drill-down (e.g. from the dashboard), when it names a known status. */
  private initialStatus(): DocumentStatus | '' {
    const status = this.route.snapshot.queryParamMap.get('status');
    return STATUS_FILTERS.find((option) => option === status) ?? '';
  }

  private loadList(orgId: string): void {
    this.loading.set(true);
    this.api
      .listPage(orgId, {
        status: this.status() || undefined,
        review_due: this.reviewDue() || undefined,
        limit: this.pageSize,
        offset: this.offset(),
      })
      .subscribe({
        next: (page) => {
          this.rows.set(page.items.map((doc) => this.fromSummary(doc)));
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private fromSummary(doc: DocumentSummary): Row {
    return {
      id: doc.id,
      title: doc.title,
      doc_code: doc.doc_code,
      status: doc.status,
      type: doc.type,
      current_rev: doc.current_rev,
      updated_at: doc.updated_at,
      review: reviewState(doc),
    };
  }

  private fromSearch(hit: DocumentSearchResult): Row {
    return {
      id: hit.id,
      title: hit.title,
      doc_code: hit.doc_code,
      status: hit.status,
      type: hit.type,
      snippet: hit.snippet,
    };
  }
}

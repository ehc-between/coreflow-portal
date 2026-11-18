import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import {
  DocumentRequirementLinks,
  DocumentSearchResult,
  DocumentStatus,
  DocumentSummary,
} from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents-api';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { pluralKey } from '../../shared/i18n/plural';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { DocumentControlApi } from './data/document-control-api';
import { DocumentType } from './data/document-control.models';
import { STATUS_FILTERS, documentTypeName, statusLabelKey } from './document-status';
import { DocumentsNav } from './shared/documents-nav';
import { DocumentsPageGuide } from './shared/documents-page-guide';
import { ReviewState, reviewLabelKey, reviewState } from './workflow/document-review';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';

/** Rows per page of the documents list. */
export const DOCUMENTS_PAGE_SIZE = 25;

/** A unified list row: either a list document or a search hit. */
interface Row {
  readonly id: string;
  readonly title: string;
  readonly doc_code: string;
  readonly status: string;
  /** Type key and name; shown through `documentTypeName` (never the raw key). */
  readonly type: string;
  readonly type_name?: string | null;
  readonly current_rev?: string | number | null;
  readonly owner?: string | null;
  readonly owner_user_id?: string | null;
  readonly next_review_at?: string | null;
  readonly updated_at?: string;
  readonly snippet?: string;
  readonly review?: ReviewState;
  /** Requirement link counts (list rows only; search hits don't carry them). */
  readonly links?: DocumentRequirementLinks | null;
}

/**
 * Documents list (module root), scoped to the selected org, on the shared list
 * frame: header with "Nytt dokument", the module navigation, the help strip, one
 * toolbar row (search, status, review due, not linked to requirements) and a
 * table of `app-record-row`s with column headers — code, title (+ type and
 * revision), requirement coverage, status / review badges, owner and next review.
 * A non-empty search uses the search endpoint (unpaginated); clearing it (or
 * changing a filter) returns to the first page. Reloads on org switch.
 */
@Component({
  selector: 'app-documents-list',
  imports: [
    FulfilsRequirements,
    TranslocoPipe,
    HasPermissionDirective,
    TourStepDirective,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    CoverageChip,
    StatusBadge,
    Button,
    Card,
    Icon,
    Pager,
    EmptyState,
    ErrorState,
    LoadingState,
    TeachingEmpty,
    WhyItMatters,
    DocumentsNav,
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="modules.names.documents"
      descriptionKey="documents.subtitle"
      scope="documents"
      page="list"
      searchPlaceholderKey="documents.searchPlaceholder"
      settingsLink="/settings/modules/documents"
      [query]="query()"
      [filters]="viewFilters()"
      [empty]="registerEmpty()"
      (search)="onQueryChange($event)"
      (viewApplied)="applyView($event.filters)"
    >
      <app-fulfils-requirements help locationKey="documents.register" />
      @if (!registerEmpty()) {
        <app-button
          primary
          *appHasPermission="'documents:draft'"
          [appTourStep]="'documents-new'"
          (click)="newDocument()"
        >
          <app-icon name="plus" [size]="15" />
          {{ 'documents.new' | transloco }}
        </app-button>
      }
      <app-documents-nav nav />
      <app-documents-page-guide help page="list" lesson="first-document" tour="list" />

      <select
        filters
        [value]="status()"
        (change)="onStatusChange($any($event.target).value)"
        [attr.aria-label]="'documents.filterStatus' | transloco"
        class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
        data-testid="filter-status"
      >
        <option value="" [selected]="status() === ''">
          {{ 'documents.status.all' | transloco }}
        </option>
        @for (option of statusFilters; track option) {
          <option [value]="option" [selected]="status() === option">
            {{ statusLabelKey(option) | transloco }}
          </option>
        }
      </select>
      <button
        filters
        type="button"
        [attr.aria-pressed]="reviewDue()"
        (click)="onReviewDueToggle()"
        class="flex h-10 items-center gap-2 rounded-tile border px-3 text-ui font-semibold transition-colors"
        [class]="
          reviewDue()
            ? 'border-warn/40 bg-warn-soft text-warn-ink'
            : 'border-border bg-bg text-fg-muted hover:text-fg'
        "
        data-testid="filter-review"
      >
        <app-icon name="history" [size]="15" />
        {{ 'documents.review.filter' | transloco }}
      </button>
      @if (canReadStandards()) {
        <button
          filters
          type="button"
          data-testid="filter-unlinked"
          [appTourStep]="'documents-filter-unlinked'"
          [attr.aria-pressed]="unlinked()"
          (click)="onUnlinkedToggle()"
          class="flex h-10 items-center gap-2 rounded-tile border px-3 text-ui font-semibold transition-colors"
          [class]="
            unlinked()
              ? 'border-accent-border bg-accent-soft text-accent'
              : 'border-border bg-bg text-fg-muted hover:text-fg'
          "
        >
          <app-icon name="link" [size]="15" />
          {{ 'documents.requirements.filterUnlinked' | transloco }}
        </button>
      }

      @if (loading()) {
        <app-loading-state [rows]="6" />
      } @else if (failed()) {
        <app-error-state (retry)="reload()" />
      } @else if (rows().length === 0) {
        <app-empty-state
          icon="search"
          titleKey="ui.empty.noResults"
          bodyKey="ui.empty.noResultsBody"
          ctaKey="ui.empty.clearFilters"
          ctaVariant="secondary"
          (cta)="clearFilters()"
        />
      } @else {
        <app-card [padded]="false" [appTourStep]="'documents-rows'">
          <div role="list" [attr.aria-label]="'modules.names.documents' | transloco">
            <app-record-row-header
              dateKind="next"
              [coverage]="canReadStandards()"
              codeKey="documents.meta.code"
              titleKey="documents.fields.title"
            />
            @for (row of rows(); track row.id) {
              <app-record-row
                [code]="row.doc_code"
                [title]="row.title"
                [subtitle]="subtitle(row)"
                [link]="['/documents', row.id]"
                [owner]="row.owner ?? ownerNames().get(row.owner_user_id ?? '')"
                [date]="row.next_review_at"
                dateKind="next"
                [overdue]="row.review === 'overdue'"
              >
                @if (canReadStandards() && row.links) {
                  <span
                    coverage
                    class="block min-w-0 [&_[data-testid=coverage-chip]]:whitespace-normal"
                    [title]="coverageTitle(row.links)"
                    data-testid="requirement-cell"
                  >
                    <app-coverage-chip
                      [counts]="{
                        confirmed: row.links.confirmed,
                        suggested: row.links.suggested,
                      }"
                    />
                  </span>
                }
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="row.status"
                  [labelKey]="statusLabelKey(row.status)"
                />
                @if (row.review === 'due') {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    value="due"
                    [labelKey]="reviewLabelKey(row.review)"
                  />
                }
              </app-record-row>
            }
          </div>
        </app-card>
        @if (!searching()) {
          <app-pager
            [offset]="offset()"
            [pageSize]="pageSize"
            [count]="rows().length"
            [total]="total()"
            (pageChange)="goToPage($event)"
          />
        }
      }

      <app-teaching-empty
        empty
        scope="documents"
        page="list"
        [showAction]="canDraft()"
        (action)="newDocument()"
      />
      <app-why-it-matters below scope="documents" page="list" />
    </app-record-list-page>
  `,
})
export class DocumentsList {
  private readonly api = inject(DocumentsApi);
  private readonly controlApi = inject(DocumentControlApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly reviewLabelKey = reviewLabelKey;
  protected readonly plural = pluralKey;
  protected readonly pageSize = DOCUMENTS_PAGE_SIZE;

  protected readonly query = signal('');
  protected readonly status = signal<DocumentStatus | ''>('');
  /** Only documents whose periodic review is due soon or overdue. */
  protected readonly reviewDue = signal(false);
  /** Only documents without a confirmed requirement link. */
  protected readonly unlinked = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canReadStandards = computed(() =>
    this.permissions().includes('standards:read'),
  );
  protected readonly canDraft = computed(() => this.permissions().includes('documents:draft'));
  protected readonly offset = signal(0);
  /** Total rows matching the filters. */
  protected readonly total = signal(0);
  protected readonly rows = signal<readonly Row[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly searching = signal(false);
  /** The org's document types, for readable type names. */
  private readonly types = signal<readonly DocumentType[]>([]);
  /** Member names by user id, for older servers that send no `owner_name`. */
  protected readonly ownerNames = signal<ReadonlyMap<string, string>>(new Map());

  /** Any filter or search narrowing the list. */
  protected readonly filtered = computed(
    () => !!this.query().trim() || !!this.status() || this.reviewDue() || this.unlinked(),
  );
  /** The org has no documents at all: the teaching empty state replaces the list. */
  protected readonly registerEmpty = computed(
    () => !this.loading() && !this.failed() && !this.filtered() && this.total() === 0,
  );
  /** Filter values stored with saved views. */
  protected readonly viewFilters = computed(() => ({
    status: this.status(),
    review: this.reviewDue() ? 'due' : '',
    requirements: this.unlinked() ? 'none' : '',
  }));

  private readonly search$ = new Subject<{ orgId: string; q: string }>();
  /** The in-flight list request; a new load cancels it so a stale page never wins. */
  private listRequest: Subscription | null = null;

  constructor() {
    // The assistant knows the user is on the documents list.
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document',
      view: 'list',
      title: this.language.translate('modules.names.documents'),
    }));

    this.search$
      .pipe(
        debounceTime(250),
        distinctUntilChanged((a, b) => a.orgId === b.orgId && a.q === b.q),
        switchMap(({ orgId, q }) => this.api.search(orgId, q)),
      )
      .subscribe({
        next: (results) => {
          this.rows.set(results.map((hit) => this.fromSearch(hit)));
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });

    effect(() => {
      const orgId = this.orgId();
      // Reset transient state when the active org changes. Only the org is a
      // dependency: the filter / paging signals read below must not re-run this.
      untracked(() => {
        this.query.set('');
        this.status.set(this.initialStatus());
        this.reviewDue.set(this.route.snapshot.queryParamMap.get('review') === 'due');
        this.unlinked.set(this.route.snapshot.queryParamMap.get('requirements') === 'none');
        this.offset.set(0);
        this.searching.set(false);
        this.rows.set([]);
        this.types.set([]);
        if (orgId) {
          this.controlApi.listTypes(orgId).subscribe({
            next: (types) => this.types.set(types),
            error: () => this.types.set([]),
          });
          this.loadList(orgId);
          if (!this.canDraft()) {
            return;
          }
          this.api.listAccessSubjects(orgId).subscribe({
            next: (subjects) =>
              this.ownerNames.set(new Map(subjects.users.map((u) => [u.id, u.name]))),
            error: () => this.ownerNames.set(new Map()),
          });
        }
      });
    });
  }

  protected newDocument(): void {
    void this.router.navigateByUrl('/documents/new');
  }

  /** Type and revision under the title ("Prosedyre · Rev B"), or the search snippet. */
  protected subtitle(row: Row): string {
    if (row.snippet) {
      return row.snippet;
    }
    const rev =
      row.current_rev !== null && row.current_rev !== undefined ? ` · Rev ${row.current_rev}` : '';
    return `${documentTypeName(row, this.types())}${rev}`;
  }

  /** Tooltip of the coverage chip: what confirmed and suggested mean. */
  protected coverageTitle(links: DocumentRequirementLinks): string {
    return links.suggested > 0 ? this.suggestionHint() : '';
  }

  private suggestionHint(): string {
    return this.language.translate('documents.page.list.suggestionHint');
  }

  protected onQueryChange(value: string): void {
    const orgId = this.orgId();
    const q = value.trim();
    this.query.set(value);
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
    this.failed.set(false);
    this.search$.next({ orgId, q });
  }

  protected onStatusChange(value: DocumentStatus | ''): void {
    this.status.set(value);
    this.resetAndLoad();
  }

  protected onReviewDueToggle(): void {
    this.reviewDue.update((on) => !on);
    this.resetAndLoad();
  }

  protected onUnlinkedToggle(): void {
    this.unlinked.update((on) => !on);
    this.resetAndLoad();
  }

  protected clearFilters(): void {
    this.status.set('');
    this.reviewDue.set(false);
    this.unlinked.set(false);
    this.resetAndLoad();
  }

  /** A saved view was applied: restore its filters. */
  protected applyView(filters: Readonly<Record<string, string>>): void {
    const status = STATUS_FILTERS.find((s) => s === filters['status']) ?? '';
    this.status.set(status);
    this.reviewDue.set(filters['review'] === 'due');
    this.unlinked.set(filters['requirements'] === 'none');
    if (!this.query().trim()) {
      this.resetAndLoad();
    }
  }

  protected goToPage(offset: number): void {
    const orgId = this.orgId();
    this.offset.set(offset);
    if (orgId) {
      this.loadList(orgId);
    }
  }

  protected reload(): void {
    const orgId = this.orgId();
    if (orgId) {
      this.loadList(orgId);
    }
  }

  /** A filter changed: it applies to the full list, so clear any search. */
  private resetAndLoad(): void {
    this.query.set('');
    this.searching.set(false);
    this.offset.set(0);
    const orgId = this.orgId();
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
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.failed.set(false);
    this.listRequest = this.api
      .listPage(orgId, {
        status: this.status() || undefined,
        review_due: this.reviewDue() || undefined,
        unlinked: (this.canReadStandards() && this.unlinked()) || undefined,
        limit: this.pageSize,
        offset: this.offset(),
      })
      .subscribe({
        next: (page) => {
          this.rows.set(page.items.map((doc) => this.fromSummary(doc)));
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  private fromSummary(doc: DocumentSummary): Row {
    return {
      id: doc.id,
      title: doc.title,
      doc_code: doc.doc_code,
      status: doc.status,
      type: doc.type,
      type_name: doc.type_name ?? null,
      current_rev: doc.current_rev,
      owner: doc.owner_name ?? null,
      owner_user_id: doc.owner_user_id,
      next_review_at: doc.next_review_at ?? null,
      updated_at: doc.updated_at,
      review: reviewState(doc),
      links: doc.requirement_links,
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

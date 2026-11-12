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
import { NotificationService } from '../../../core/notifications/notification.service';
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
import { statusLabelKey, statusTone } from '../document-status';
import { DocumentControlApi } from '../data/document-control-api';
import {
  DocumentType,
  ExternalStatus,
  REGISTER_SORTS,
  RegisterItem,
  RegisterQuery,
  RegisterSort,
} from '../data/document-control.models';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';
import { externalStatusTone, portalLink, saveBlob } from '../shared/document-control-display';

export const REGISTER_PAGE_SIZE = 100;

/** Status filter values of the master list (controlled + external statuses). */
export const REGISTER_STATUS_FILTERS = [
  '',
  'draft',
  'in_review',
  'approved',
  'obsolete',
  'current',
  'superseded',
  'withdrawn',
] as const;

export interface RegisterFilters {
  readonly type: string;
  readonly status: string;
  readonly mine: boolean;
  readonly reviewDue: boolean;
  readonly external: boolean;
  readonly sort: RegisterSort;
}

const DEFAULTS: RegisterFilters = {
  type: '',
  status: '',
  mine: false,
  reviewDue: false,
  external: true,
  sort: 'code',
};

/** Filters from a saved view, falling back to the defaults. */
export function parseRegisterFilters(
  raw: Readonly<Record<string, string | undefined>>,
): RegisterFilters {
  const sort = raw['sort'];
  return {
    type: raw['type'] ?? '',
    status: (REGISTER_STATUS_FILTERS as readonly string[]).includes(raw['status'] ?? '')
      ? (raw['status'] ?? '')
      : '',
    mine: raw['mine'] === '1',
    reviewDue: raw['reviewDue'] === '1',
    external: raw['external'] !== '0',
    sort:
      sort && (REGISTER_SORTS as readonly string[]).includes(sort)
        ? (sort as RegisterSort)
        : 'code',
  };
}

/** The API query for a filter set. */
export function registerQuery(
  filters: RegisterFilters,
  q: string,
  me: string | null,
  offset: number,
): RegisterQuery {
  return {
    q: q || undefined,
    type: filters.type || undefined,
    status: filters.status || undefined,
    owner: filters.mine && me ? me : undefined,
    review_due: filters.reviewDue,
    include_external: filters.external,
    sort: filters.sort,
    limit: REGISTER_PAGE_SIZE,
    offset,
  };
}

/**
 * The master document list (ISO HS 7.5.3): every controlled document the caller can
 * see and, optionally, the external documents register — with type, revision,
 * approval date, owner, review status, open campaigns and retention. Exportable as
 * CSV for auditors.
 */
@Component({
  selector: 'app-document-register',
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
      titleKey="documents.control.register.title"
      scope="documents"
      page="register"
      searchPlaceholderKey="documents.control.register.searchPlaceholder"
      [query]="q()"
      [filters]="filterRecord()"
      [empty]="state() === 'ready' && rows().length === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3">
        <app-documents-page-guide page="register" lesson="master-list" tour="register" />
      </div>
      <app-button
        toolbar
        size="sm"
        variant="secondary"
        [loading]="exporting()"
        [appTourStep]="'documents-register-export'"
        (click)="exportCsv()"
        data-testid="register-export"
      >
        <app-icon name="upload" [size]="14" />
        {{ 'documents.control.register.export' | transloco }}
      </app-button>

      <ng-container filters>
        @if (types().length) {
          <label class="sr-only" for="reg-f-type">{{
            'documents.control.fields.type' | transloco
          }}</label>
          <select
            id="reg-f-type"
            class="h-10 max-w-[200px] rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="patch({ type: $any($event.target).value })"
          >
            <option value="" [selected]="!filters().type">
              {{ 'documents.control.filters.allTypes' | transloco }}
            </option>
            @for (t of types(); track t.id) {
              <option [value]="t.key" [selected]="t.key === filters().type">{{ t.name }}</option>
            }
          </select>
        }
        <label class="sr-only" for="reg-f-status">{{
          'documents.control.fields.status' | transloco
        }}</label>
        <select
          id="reg-f-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          [appTourStep]="'documents-register-filters'"
          (change)="patch({ status: $any($event.target).value })"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="s === filters().status">
              {{ 'documents.control.register.status.' + (s || 'all') | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="reg-f-sort">{{
          'documents.control.filters.sort' | transloco
        }}</label>
        <select
          id="reg-f-sort"
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
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg-muted">
          <input
            type="checkbox"
            [checked]="filters().external"
            (change)="patch({ external: $any($event.target).checked })"
            data-testid="register-include-external"
          />
          {{ 'documents.control.register.includeExternal' | transloco }}
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
                <table class="w-full min-w-[900px] text-left text-[13px]">
                  <caption class="sr-only">
                    {{
                      'documents.control.register.title' | transloco
                    }}
                  </caption>
                  <thead class="border-b border-border text-[12px] text-fg-muted">
                    <tr>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'documents.control.fields.code' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.title' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.type' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.revision' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.status' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.approvedAt' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.owner' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.nextReview' | transloco }}
                      </th>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'documents.control.fields.retentionUntil' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (r of rows(); track r.kind + r.id) {
                      <tr class="align-top hover:bg-surface-2" data-testid="register-row">
                        <td
                          class="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap text-fg-subtle"
                        >
                          {{ r.code || '—' }}
                        </td>
                        <td class="px-2 py-2.5">
                          @if (link(r); as href) {
                            <a [routerLink]="href" class="font-semibold text-fg hover:underline">{{
                              r.title
                            }}</a>
                          } @else {
                            <span class="font-semibold text-fg">{{ r.title }}</span>
                          }
                          <div class="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                            @if (r.kind === 'external_document') {
                              <span>{{
                                'documents.control.register.externalTag' | transloco
                              }}</span>
                              @if (r.publisher) {
                                <span>{{ r.publisher }}</span>
                              }
                            }
                            @if (r.acknowledgement_required) {
                              <span>{{
                                'documents.control.register.ackRequired' | transloco
                              }}</span>
                            }
                            @if (r.open_campaigns > 0) {
                              <span class="font-semibold text-accent">
                                {{
                                  'documents.control.register.openCampaigns'
                                    | transloco: { count: r.open_campaigns }
                                }}
                              </span>
                            }
                          </div>
                        </td>
                        <td class="px-2 py-2.5 text-fg-muted">
                          {{ r.type_name || r.type || '—' }}
                        </td>
                        <td class="px-2 py-2.5 font-mono text-[12px] text-fg-muted">
                          {{ r.revision || '—' }}
                        </td>
                        <td class="px-2 py-2.5">
                          <app-badge [tone]="tone(r)">{{ statusKey(r) | transloco }}</app-badge>
                        </td>
                        <td class="px-2 py-2.5 whitespace-nowrap text-fg-muted">
                          {{ r.approved_at ? (r.approved_at | localDay) : '—' }}
                        </td>
                        <td class="px-2 py-2.5 text-fg-muted">
                          {{ r.owner?.name ?? ('documents.control.common.unassigned' | transloco) }}
                        </td>
                        <td
                          class="px-2 py-2.5 whitespace-nowrap"
                          [class.text-fail]="r.review_overdue"
                          [class.font-semibold]="r.review_overdue"
                        >
                          {{ r.next_review_at ? (r.next_review_at | localDay) : '—' }}
                        </td>
                        <td class="px-4 py-2.5 whitespace-nowrap text-fg-muted">
                          @if (r.retention_until) {
                            {{ r.retention_until | localDay }}
                            @if (r.retention_rule; as rule) {
                              <span class="block text-[11.5px] text-fg-subtle">{{
                                rule.name
                              }}</span>
                            }
                          } @else {
                            —
                          }
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
                  (pageChange)="goTo($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <app-teaching-empty
        empty
        scope="documents"
        page="register"
        [showAction]="perms.canDraft()"
        (action)="newDocument()"
      />
    </app-record-list-page>
  `,
})
export class DocumentRegisterPage {
  private readonly api = inject(DocumentControlApi);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  protected readonly perms = inject(DocumentControlPermissions);

  protected readonly statusFilters = REGISTER_STATUS_FILTERS;
  protected readonly sorts = REGISTER_SORTS;
  protected readonly pageSize = REGISTER_PAGE_SIZE;

  protected readonly q = signal('');
  protected readonly filters = signal<RegisterFilters>(DEFAULTS);
  protected readonly offset = signal(0);
  protected readonly rows = signal<readonly RegisterItem[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly types = signal<readonly DocumentType[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly exporting = signal(false);
  private sub: Subscription | null = null;

  protected readonly isFiltered = computed(() => {
    const f = this.filters();
    return !!this.q() || !!f.type || !!f.status || f.mine || f.reviewDue;
  });

  protected readonly filterRecord = computed<Record<string, string>>(() => {
    const f = this.filters();
    return {
      type: f.type,
      status: f.status,
      mine: f.mine ? '1' : '',
      reviewDue: f.reviewDue ? '1' : '',
      external: f.external ? '1' : '0',
      sort: f.sort,
    };
  });

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: null,
      view: 'list',
      title: this.language.translate('documents.control.register.title'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const query = registerQuery(
        this.filters(),
        this.q(),
        this.auth.user()?.id ?? null,
        this.offset(),
      );
      untracked(() => this.load(orgId, query));
    });
    effect(() => {
      const orgId = this.perms.orgId();
      if (orgId) {
        untracked(() =>
          this.api.listTypes(orgId).subscribe({
            next: (types) => this.types.set(types),
            error: () => this.types.set([]),
          }),
        );
      }
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, query: RegisterQuery): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = this.api.register(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected setQuery(q: string): void {
    this.q.set(q);
    this.offset.set(0);
  }

  protected patch(change: Partial<RegisterFilters>): void {
    this.filters.update((f) => ({ ...f, ...change }));
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.filters.set(parseRegisterFilters(view.filters));
    this.offset.set(0);
  }

  protected goTo(offset: number): void {
    this.offset.set(offset);
  }

  protected link(row: RegisterItem): string | null {
    return portalLink(row.url);
  }

  protected tone(row: RegisterItem) {
    return row.kind === 'external_document'
      ? externalStatusTone(row.status as ExternalStatus)
      : statusTone(row.status);
  }

  protected statusKey(row: RegisterItem): string {
    return row.kind === 'external_document'
      ? `documents.control.external.status.${row.status}`
      : statusLabelKey(row.status);
  }

  protected newDocument(): void {
    void this.router.navigateByUrl('/documents/new');
  }

  protected exportCsv(): void {
    const orgId = this.perms.orgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    const query = registerQuery(this.filters(), this.q(), this.auth.user()?.id ?? null, 0);
    this.api.exportRegister(orgId, query).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, 'master-document-list.csv');
      },
      error: () => {
        this.exporting.set(false);
        this.toasts.error('documents.control.register.exportFailed');
      },
    });
  }
}

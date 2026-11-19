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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import { findingStatusBadge, findingTypeBadge } from '../data/audit-display';
import {
  FINDING_SORTS,
  FINDING_STATUSES,
  FINDING_STATUS_FILTERS,
  FINDING_TYPES,
  Finding,
  FindingSort,
  FindingStatusFilter,
  ListResponse,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

const PAGE_SIZE = 25;

/**
 * The `status` query value of a status filter. `unresolved` is the backend's
 * meta-value for every open status; `all` sends nothing; a single status is sent as is.
 */
export function findingStatusParam(filter: string): string | undefined {
  if (filter === 'unresolved') {
    return 'unresolved';
  }
  return (FINDING_STATUSES as readonly string[]).includes(filter) ? filter : undefined;
}

/** A status filter from the URL / a saved view; the old group value `open` meant every open status. */
export function parseFindingStatusFilter(value: string | null | undefined): FindingStatusFilter {
  if (!value) {
    return 'unresolved';
  }
  return (FINDING_STATUS_FILTERS as readonly string[]).includes(value)
    ? (value as FindingStatusFilter)
    : 'unresolved';
}

/**
 * `/audits/findings`: every audit finding with filters (status, type, mine,
 * overdue). Findings are raised from an audit, so the page says so and links to
 * the audits instead of offering a create button here.
 */
@Component({
  selector: 'app-audit-finding-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    Card,
    CoverageChip,
    EmptyState,
    HelpStrip,
    Icon,
    Pager,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    WhyItMatters,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      exportRegister="audit_findings"
      titleKey="audits.findings.title"
      descriptionKey="audits.findings.subtitle"
      scope="audits"
      page="findings"
      [breadcrumbs]="[
        { labelKey: 'modules.names.audits', link: '/audits' },
        { labelKey: 'audits.findings.title' },
      ]"
      searchPlaceholderKey="audits.findings.search"
      [query]="q()"
      [filters]="filterValues()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmpty()"
      (search)="q.set($event); offset.set(0)"
      (viewApplied)="applyView($event)"
    >
      <a
        secondary
        routerLink="/audits/plans"
        class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <app-icon name="audit" [size]="14" />
        {{ 'audits.findings.raiseFromAudit' | transloco }}
      </a>
      <app-audits-nav nav />
      <app-help-strip help scope="audits" page="findings" lesson="findings-and-capa" />

      <ng-container filters>
        <label class="sr-only" for="fd-status">{{ 'audits.filters.status' | transloco }}</label>
        <select
          id="fd-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="status.set($any($event.target).value); offset.set(0)"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'audits.filters.findingStatus.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="fd-type">{{ 'audits.filters.type' | transloco }}</label>
        <select
          id="fd-type"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="type.set($any($event.target).value); offset.set(0)"
        >
          <option value="" [selected]="!type()">{{ 'audits.filters.anyType' | transloco }}</option>
          @for (t of types; track t) {
            <option [value]="t" [selected]="type() === t">
              {{ 'audits.findingType.' + t | transloco }}
            </option>
          }
        </select>
      </ng-container>
      <div more-filters class="flex flex-col gap-3">
        <label class="inline-flex h-10 items-center gap-1.5 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="mine()"
            (change)="mine.set($any($event.target).checked); offset.set(0)"
          />
          {{ 'audits.filters.mine' | transloco }}
        </label>
        <div class="flex flex-col gap-1">
          <label class="text-meta font-semibold text-fg-muted" for="fd-sort">{{
            'audits.filters.sort' | transloco
          }}</label>
          <select
            id="fd-sort"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="sort.set($any($event.target).value); offset.set(0)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'audits.findings.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="overdue()"
            (change)="overdue.set($any($event.target).checked); offset.set(0)"
          />
          {{ 'audits.filters.overdue' | transloco }}
        </label>
      </div>

      <app-card [padded]="false">
        <app-audit-load-state [state]="data.state()" [rows]="5" (retry)="load()" />
        @if (data.state() === 'ready') {
          @if (rows().length) {
            <div role="list" [attr.aria-label]="'audits.findings.title' | transloco">
              <app-record-row-header dateKind="due" />
              @for (f of rows(); track f.id) {
                @let tb = typeBadge(f.finding_type);
                @let sb = statusBadge(f.status);
                <app-record-row
                  [code]="f.code"
                  [title]="f.title"
                  [subtitle]="subtitle(f)"
                  [link]="['/audits/findings', f.id]"
                  [owner]="f.owner?.name"
                  [date]="f.response_due_at"
                  dateKind="due"
                  [overdue]="f.overdue"
                >
                  <app-coverage-chip coverage entityType="audit_finding" [entityId]="f.id" />
                  <app-status-badge
                    badges
                    [meaning]="tb.meaning"
                    [value]="tb.value"
                    [labelKey]="tb.labelKey"
                  />
                  <app-status-badge
                    badges
                    [meaning]="sb.meaning"
                    [value]="sb.value"
                    [labelKey]="sb.labelKey"
                  />
                </app-record-row>
              }
            </div>
            <div class="px-4 py-2">
              <app-pager
                [offset]="offset()"
                [pageSize]="pageSize"
                [count]="rows().length"
                [total]="data.value()?.total ?? null"
                (pageChange)="offset.set($event)"
              />
            </div>
          } @else {
            <app-empty-state
              icon="search"
              titleKey="ui.empty.noResults"
              ctaKey="audits.filters.clear"
              ctaVariant="secondary"
              [compact]="true"
              (cta)="clearFilters()"
            />
          }
        }
      </app-card>

      <app-card empty>
        <app-teaching-empty scope="audits" page="findings" (action)="toAudits()" />
      </app-card>
      <app-why-it-matters below scope="audits" page="findings" />
    </app-record-list-page>
  `,
})
export class FindingList {
  private readonly api = inject(AuditsApi);
  private readonly language = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<ListResponse<Finding>>();

  protected readonly statusFilters = FINDING_STATUS_FILTERS;
  protected readonly types = FINDING_TYPES;
  protected readonly sorts = FINDING_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly typeBadge = findingTypeBadge;
  protected readonly statusBadge = findingStatusBadge;

  private readonly initial = this.route.snapshot.queryParamMap;
  protected readonly q = signal(this.initial.get('q') ?? '');
  protected readonly status = signal<FindingStatusFilter>(
    parseFindingStatusFilter(this.initial.get('status')),
  );
  protected readonly type = signal(
    (FINDING_TYPES as readonly string[]).includes(this.initial.get('type') ?? '')
      ? this.initial.get('type')!
      : '',
  );
  protected readonly sort = signal<FindingSort>('severity');
  protected readonly mine = signal(this.initial.get('mine') === '1');
  protected readonly overdue = signal(this.initial.get('overdue') === '1');
  protected readonly offset = signal(0);

  protected readonly rows = computed(() => this.data.value()?.items ?? []);
  protected readonly filterValues = computed(() => ({
    status: this.status(),
    type: this.type(),
    sort: this.sort(),
    mine: this.mine() ? '1' : '',
    overdue: this.overdue() ? '1' : '',
  }));
  protected readonly moreActive = computed(
    () => (this.mine() ? 1 : 0) + (this.sort() !== 'severity' ? 1 : 0) + (this.overdue() ? 1 : 0),
  );
  protected readonly isEmpty = computed(
    () =>
      this.data.state() === 'ready' &&
      (this.data.value()?.total ?? 0) === 0 &&
      !this.q() &&
      (this.status() === 'all' || this.status() === 'unresolved') &&
      !this.type() &&
      !this.mine() &&
      !this.overdue(),
  );

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_finding',
      view: 'list',
      title: this.language.translate('audits.findings.title'),
    }));
    effect(() => {
      this.access.orgId();
      this.filterValues();
      this.q();
      this.offset();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.data.load(
      this.api.listFindings(orgId, {
        q: this.q() || undefined,
        status: findingStatusParam(this.status()),
        finding_type: this.type() || undefined,
        owner: this.mine() ? (this.access.userId() ?? undefined) : undefined,
        overdue: this.overdue(),
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      }),
      true,
    );
  }

  protected subtitle(f: Finding): string {
    const plan = [f.plan.code, f.plan.title].filter(Boolean).join(' · ');
    return this.language.translate('audits.findings.fromAudit', { audit: plan });
  }

  protected clearFilters(): void {
    this.q.set('');
    this.status.set('unresolved');
    this.type.set('');
    this.sort.set('severity');
    this.mine.set(false);
    this.overdue.set(false);
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.status.set(parseFindingStatusFilter(view.filters['status']));
    this.type.set(view.filters['type'] ?? '');
    this.sort.set(
      ((FINDING_SORTS as readonly string[]).includes(view.filters['sort'] ?? '')
        ? view.filters['sort']
        : 'severity') as FindingSort,
    );
    this.mine.set(view.filters['mine'] === '1');
    this.overdue.set(view.filters['overdue'] === '1');
    this.offset.set(0);
  }

  protected toAudits(): void {
    void this.router.navigate(['/audits/plans']);
  }
}

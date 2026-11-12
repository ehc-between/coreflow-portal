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
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { Pager } from '../../shared/ui/pager/pager';
import { ObligationsApi } from './data/obligations-api';
import {
  COMPLIANCE_STATUSES,
  ComplianceStatus,
  FRAMEWORKS,
  OBLIGATION_SORTS,
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
  ObligationListItem,
  ObligationListQuery,
  ObligationSort,
  ObligationStatus,
  ObligationSummary,
  ObligationType,
  PERM_WRITE,
} from './data/obligation.models';
import {
  complianceKey,
  complianceTone,
  frameworkKey,
  obligationStatusKey,
  obligationStatusTone,
  obligationTypeKey,
} from './data/obligation-display';
import { ObligationLessonLink } from './lesson-link';

const PAGE_SIZE = 25;
/** The "expiring soon" window of the summary tile. */
export const SUMMARY_EXPIRY_DAYS = 60;

/** Status filter options: `current` = draft and active (everything not retired). */
export const STATUS_FILTERS = ['current', 'all', ...OBLIGATION_STATUSES] as const;
export const EXPIRY_FILTERS = ['', '30', '60', '90', '180', '365'] as const;

export function statusesForFilter(filter: string): readonly ObligationStatus[] {
  if (filter === 'current') {
    return ['draft', 'active'];
  }
  return (OBLIGATION_STATUSES as readonly string[]).includes(filter)
    ? [filter as ObligationStatus]
    : [];
}

/** Sort value -> i18n key suffix (`-title` -> `titleDesc`). */
export function sortKey(sort: string): string {
  return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
}

/**
 * The compliance obligations register (`/obligations`): headline figures, search,
 * filters on status, type, compliance, framework, owner, overdue evaluations and
 * validity end, sorting, saved views and paging. Each row shows the compliance
 * status and when the next evaluation is due (overdue highlighted).
 */
@Component({
  selector: 'app-obligations-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    GuideIntro,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    KpiTile,
    Pager,
    ObligationLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="obligations.list.title"
      scope="obligations"
      searchPlaceholderKey="obligations.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-3">
        <p class="text-[14px] text-fg-muted">{{ 'obligations.list.subtitle' | transloco }}</p>
        <app-guide-intro scope="obligations" page="list" />
        @if (summary(); as s) {
          <div
            class="grid grid-cols-2 gap-3 lg:grid-cols-5"
            appTourStep="obligations-summary"
            data-testid="obligation-summary"
          >
            <button type="button" class="text-left" (click)="resetFilters()">
              <app-kpi-tile
                [label]="'obligations.summary.total' | transloco"
                [value]="s.total"
                tone="accent"
              />
            </button>
            <button
              type="button"
              class="text-left"
              [attr.aria-pressed]="overdue()"
              (click)="toggleOverdue()"
              data-testid="tile-overdue"
            >
              <app-kpi-tile
                [label]="'obligations.summary.overdue' | transloco"
                [value]="s.evaluations_overdue"
                [tone]="s.evaluations_overdue ? 'fail' : 'neutral'"
              />
            </button>
            <button
              type="button"
              class="text-left"
              [attr.aria-pressed]="compliance() === 'non_compliant'"
              (click)="setCompliance(compliance() === 'non_compliant' ? '' : 'non_compliant')"
            >
              <app-kpi-tile
                [label]="'obligations.summary.nonCompliant' | transloco"
                [value]="nonCompliant()"
                [tone]="nonCompliant() ? 'warn' : 'neutral'"
              />
            </button>
            <button
              type="button"
              class="text-left"
              [attr.aria-pressed]="expiring() === expiryWindow"
              (click)="setExpiring(expiring() === expiryWindow ? '' : expiryWindow)"
            >
              <app-kpi-tile
                [label]="
                  'obligations.summary.expiring' | transloco: { days: s.expiring_within_days }
                "
                [value]="s.expiring_soon"
                [tone]="s.expiring_soon ? 'warn' : 'neutral'"
              />
            </button>
            <app-kpi-tile
              class="col-span-2 lg:col-span-1"
              [label]="'obligations.summary.openChanges' | transloco"
              [value]="s.open_changes"
              [tone]="s.open_changes ? 'info' : 'neutral'"
            />
          </div>
        }
      </div>

      <app-tour-button toolbar scope="obligations" tour="list" />
      @if (canWrite()) {
        <app-button
          toolbar
          size="sm"
          (click)="newObligation()"
          appTourStep="obligations-new"
          data-testid="new-obligation"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'obligations.list.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-ob-status">
        {{ 'obligations.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-ob-status"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setStatus($any($event.target).value)"
        appTourStep="obligations-filters"
        data-testid="filter-status"
      >
        @for (s of statusFilters; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ statusFilterKey(s) | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-ob-type">
        {{ 'obligations.filters.type' | transloco }}
      </label>
      <select
        filters
        id="cf-ob-type"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setType($any($event.target).value)"
        data-testid="filter-type"
      >
        <option value="" [selected]="!type()">
          {{ 'obligations.filters.allTypes' | transloco }}
        </option>
        @for (t of types; track t) {
          <option [value]="t" [selected]="type() === t">
            {{ 'obligations.types.' + t | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-ob-compliance">
        {{ 'obligations.filters.compliance' | transloco }}
      </label>
      <select
        filters
        id="cf-ob-compliance"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setCompliance($any($event.target).value)"
        data-testid="filter-compliance"
      >
        <option value="" [selected]="!compliance()">
          {{ 'obligations.filters.anyCompliance' | transloco }}
        </option>
        @for (c of complianceStatuses; track c) {
          <option [value]="c" [selected]="compliance() === c">
            {{ complianceKey(c) | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-ob-framework">
        {{ 'obligations.filters.framework' | transloco }}
      </label>
      <select
        filters
        id="cf-ob-framework"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setFramework($any($event.target).value)"
      >
        <option value="" [selected]="!framework()">
          {{ 'obligations.filters.anyFramework' | transloco }}
        </option>
        @for (f of frameworks; track f) {
          <option [value]="f" [selected]="framework() === f">
            {{ frameworkKey(f) | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-ob-owner">
        {{ 'obligations.filters.owner' | transloco }}
      </label>
      <select
        filters
        id="cf-ob-owner"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setOwner($any($event.target).value)"
      >
        <option value="" [selected]="!owner()">
          {{ 'obligations.filters.anyOwner' | transloco }}
        </option>
        <option value="me" [selected]="owner() === 'me'">
          {{ 'obligations.filters.mine' | transloco }}
        </option>
      </select>
      <label filters class="sr-only" for="cf-ob-expiry">
        {{ 'obligations.filters.expiring' | transloco }}
      </label>
      <select
        filters
        id="cf-ob-expiry"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setExpiring($any($event.target).value)"
      >
        @for (e of expiryFilters; track e) {
          <option [value]="e" [selected]="expiring() === e">
            {{
              e
                ? ('obligations.filters.expiringWithin' | transloco: { days: e })
                : ('obligations.filters.anyExpiry' | transloco)
            }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-ob-sort">
        {{ 'obligations.filters.sort' | transloco }}
      </label>
      <select
        filters
        id="cf-ob-sort"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setSort($any($event.target).value)"
      >
        @for (s of sorts; track s) {
          <option [value]="s" [selected]="sort() === s">
            {{ 'obligations.sorts.' + sortKey(s) | transloco }}
          </option>
        }
      </select>
      <label
        filters
        class="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
      >
        <input
          type="checkbox"
          class="h-4 w-4 accent-[var(--accent)]"
          [checked]="overdue()"
          (change)="setOverdue($any($event.target).checked)"
          data-testid="filter-overdue"
        />
        {{ 'obligations.filters.overdue' | transloco }}
      </label>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'obligations.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'obligations.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'obligations.list.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="obligation-rows">
                @for (o of rows(); track o.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/obligations', o.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                          o.code
                        }}</span>
                        <span class="truncate">{{ o.title }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{ typeKey(o.obligation_type) | transloco }}</span>
                        @if (o.jurisdiction) {
                          <span>{{ o.jurisdiction }}</span>
                        }
                        @if (o.issuer) {
                          <span class="truncate">{{ o.issuer }}</span>
                        }
                        @for (f of o.frameworks; track f) {
                          <span class="rounded-full bg-surface-2 px-1.5 text-[11px]">{{
                            frameworkKey(f) | transloco
                          }}</span>
                        }
                        @if (o.owner?.name; as ownerName) {
                          <span>{{
                            'obligations.list.owner' | transloco: { name: ownerName }
                          }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="statusTone(o.status)">{{
                        statusKey(o.status) | transloco
                      }}</app-badge>
                      <app-badge [tone]="complianceTone(o.compliance_status)">{{
                        complianceKey(o.compliance_status) | transloco
                      }}</app-badge>
                      <span
                        class="inline-flex min-w-[160px] items-center justify-end gap-1 text-right"
                        [class.text-fail]="o.next_evaluation?.overdue"
                        [class.font-semibold]="o.next_evaluation?.overdue"
                      >
                        @if (o.next_evaluation?.due_at; as due) {
                          @if (o.next_evaluation?.overdue) {
                            <app-icon name="alert" [size]="13" />
                            <span class="sr-only">{{
                              'obligations.common.overdue' | transloco
                            }}</span>
                          }
                          {{
                            'obligations.list.nextEvaluation'
                              | transloco: { date: (due | localDay) }
                          }}
                        } @else if (o.valid_until) {
                          {{
                            'obligations.list.validUntil'
                              | transloco: { date: (o.valid_until | localDay) }
                          }}
                        } @else {
                          {{ 'obligations.list.noSchedule' | transloco }}
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
                  [count]="rows().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="obligations" page="list" />
        <div class="flex flex-wrap gap-2">
          <app-obligation-lesson-link lesson="legal-register" />
          <app-obligation-lesson-link lesson="evaluating-compliance" />
        </div>
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="obligations"
            page="list"
            [showAction]="canWrite()"
            (action)="newObligation()"
          />
        </app-card>
        <app-why-it-matters scope="obligations" page="list" />
        <div class="flex flex-wrap gap-2">
          <app-obligation-lesson-link lesson="legal-register" />
          <app-obligation-lesson-link lesson="evaluating-compliance" />
        </div>
      </div>
    </app-record-list-page>
  `,
})
export class ObligationsList {
  private readonly api = inject(ObligationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly expiryFilters = EXPIRY_FILTERS;
  protected readonly expiryWindow = String(SUMMARY_EXPIRY_DAYS);
  protected readonly types = OBLIGATION_TYPES;
  protected readonly complianceStatuses = COMPLIANCE_STATUSES;
  protected readonly frameworks = FRAMEWORKS;
  protected readonly sorts = OBLIGATION_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = obligationStatusKey;
  protected readonly statusTone = obligationStatusTone;
  protected readonly typeKey = obligationTypeKey;
  protected readonly complianceKey = complianceKey;
  protected readonly complianceTone = complianceTone;
  protected readonly frameworkKey = frameworkKey;
  protected readonly sortKey = sortKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<string>('current');
  protected readonly type = signal<ObligationType | ''>('');
  protected readonly compliance = signal<ComplianceStatus | ''>('');
  protected readonly framework = signal<string>('');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly expiring = signal<string>('');
  protected readonly overdue = signal(false);
  protected readonly sort = signal<ObligationSort>('-updated_at');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly ObligationListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<ObligationSummary | null>(null);
  protected readonly nonCompliant = computed(
    () => this.summary()?.by_compliance_status?.['non_compliant'] ?? 0,
  );

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      this.status() !== 'current' ||
      !!this.type() ||
      !!this.compliance() ||
      !!this.framework() ||
      !!this.owner() ||
      !!this.expiring() ||
      this.overdue(),
  );
  /** The teaching empty state: the register itself is empty (not just this filter). */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    type: this.type(),
    compliance: this.compliance(),
    framework: this.framework(),
    owner: this.owner(),
    expiring: this.expiring(),
    overdue: this.overdue() ? '1' : '',
    sort: this.sort(),
  }));

  private request = new Subscription();
  private summaryRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.summaryRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'obligations',
      entityType: 'compliance_obligation',
      view: 'list',
      title: this.language.translate('obligations.list.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadSummary(orgId));
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const expiring = this.expiring();
      const query: ObligationListQuery = {
        q: this.q() || undefined,
        status: statusesForFilter(this.status()),
        type: this.type() ? [this.type() as ObligationType] : undefined,
        compliance: this.compliance() ? [this.compliance() as ComplianceStatus] : undefined,
        framework: this.framework() || undefined,
        owner: this.owner() || undefined,
        evaluation_overdue: this.overdue() ? true : undefined,
        expiring_within_days: expiring ? Number(expiring) : undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected statusFilterKey(filter: string): string {
    return filter === 'current' || filter === 'all'
      ? `obligations.filters.statusOptions.${filter}`
      : obligationStatusKey(filter);
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set((STATUS_FILTERS as readonly string[]).includes(value) ? value : 'current');
  }

  protected setType(value: string): void {
    this.offset.set(0);
    this.type.set(
      (OBLIGATION_TYPES as readonly string[]).includes(value) ? (value as ObligationType) : '',
    );
  }

  protected setCompliance(value: string): void {
    this.offset.set(0);
    this.compliance.set(
      (COMPLIANCE_STATUSES as readonly string[]).includes(value) ? (value as ComplianceStatus) : '',
    );
  }

  protected setFramework(value: string): void {
    this.offset.set(0);
    this.framework.set((FRAMEWORKS as readonly string[]).includes(value) ? value : '');
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setExpiring(value: string): void {
    this.offset.set(0);
    this.expiring.set((EXPIRY_FILTERS as readonly string[]).includes(value) ? value : '');
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected toggleOverdue(): void {
    this.setOverdue(!this.overdue());
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (OBLIGATION_SORTS as readonly string[]).includes(value)
        ? (value as ObligationSort)
        : '-updated_at',
    );
  }

  protected resetFilters(): void {
    this.applyFilters({});
  }

  protected applyView(view: SavedView): void {
    this.applyFilters(view.filters);
  }

  protected newObligation(): void {
    void this.router.navigate(['/obligations/new']);
  }

  private applyFilters(f: Readonly<Record<string, string>>): void {
    this.offset.set(0);
    this.setStatus(f['status'] ?? 'current');
    this.setType(f['type'] ?? '');
    this.setCompliance(f['compliance'] ?? '');
    this.setFramework(f['framework'] ?? '');
    this.setOwner(f['owner'] ?? '');
    this.setExpiring(f['expiring'] ?? '');
    this.setOverdue(f['overdue'] === '1');
    this.setSort(f['sort'] ?? '-updated_at');
  }

  private load(orgId: string | null, query: ObligationListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private loadSummary(orgId: string | null): void {
    this.summaryRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.summaryRequest = this.api.summary(orgId, SUMMARY_EXPIRY_DAYS).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => this.summary.set(null),
    });
  }
}

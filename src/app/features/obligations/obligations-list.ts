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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ObligationsApi } from './data/obligations-api';
import {
  COMPLIANCE_STATUSES,
  ENTITY_TYPE,
  EXPORT_FORMATS,
  ExportFormat,
  FRAMEWORKS,
  NOT_FULLY_COMPLIANT,
  OBLIGATION_SORTS,
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
  ComplianceStatus,
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
  exportFileName,
  frameworkKey,
  obligationStatusKey,
  obligationTypeKey,
  saveBlob,
} from './data/obligation-display';
import { obligationErrorKey } from './data/obligation-errors';

const PAGE_SIZE = 25;
/** The "expiring soon" window of the summary tile. */
export const SUMMARY_EXPIRY_DAYS = 60;

/** Status filter options: `current` = draft and active (everything not retired). */
export const STATUS_FILTERS = ['current', 'all', ...OBLIGATION_STATUSES] as const;
export const EXPIRY_FILTERS = ['', '30', '60', '90', '180', '365'] as const;
/**
 * Compliance filter options: one status, or `not_fully` (partially + non-compliant,
 * the "Not fully compliant" tile).
 */
export const COMPLIANCE_FILTERS = ['not_fully', ...COMPLIANCE_STATUSES] as const;

/** The toggles the summary tiles set. */
export type TileFilter =
  | 'notFully'
  | 'notEvaluated'
  | 'withoutSchedule'
  | 'overdue'
  | 'renewal'
  | 'expiring';

export function statusesForFilter(filter: string): readonly ObligationStatus[] {
  if (filter === 'current') {
    return ['draft', 'active'];
  }
  return (OBLIGATION_STATUSES as readonly string[]).includes(filter)
    ? [filter as ObligationStatus]
    : [];
}

export function compliancesForFilter(filter: string): readonly ComplianceStatus[] | undefined {
  if (filter === 'not_fully') {
    return NOT_FULLY_COMPLIANT;
  }
  return (COMPLIANCE_STATUSES as readonly string[]).includes(filter)
    ? [filter as ComplianceStatus]
    : undefined;
}

/** Sort value -> i18n key suffix (`-title` -> `titleDesc`). */
export function sortKey(sort: string): string {
  return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
}

function flag(value: string | null): boolean {
  return value === 'true' || value === '1';
}

/**
 * The register of laws, regulations, permits and other obligations (`/obligations`):
 * six clickable summary tiles (not fully compliant, not evaluated, without an
 * evaluation plan, evaluation overdue, renewal due, ending soon), search with status
 * and compliance filters (type, standard, owner, validity and sort under "More
 * filters"), saved views, rows with requirement coverage and the next evaluation,
 * and an export of the register (Excel, PDF, CSV). Filters can be set from the URL
 * (`?without_schedule=true&owner=me`, the home page's next steps).
 */
@Component({
  selector: 'app-obligations-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    MenuItem,
    OverflowMenu,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="modules.names.obligations"
      descriptionKey="obligations.list.subtitle"
      scope="obligations"
      searchPlaceholderKey="obligations.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (canWrite()) {
        <app-button
          primary
          (click)="newObligation()"
          appTourStep="obligations-new"
          data-testid="new-obligation"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'obligations.list.new' | transloco }}
        </app-button>
      }
      <app-overflow-menu secondary labelKey="obligations.export.button" data-testid="export-menu">
        @for (f of exportFormats; track f) {
          <button
            appMenuItem
            type="button"
            (click)="exportRegister(f)"
            [attr.data-testid]="'export-' + f"
          >
            {{ 'obligations.export.' + f | transloco }}
          </button>
        }
      </app-overflow-menu>

      <app-help-strip help scope="obligations" page="list" tour="list" lesson="legal-register" />

      <ng-container ngProjectAs="[kpis]">
        @if (summary(); as s) {
          <button
            type="button"
            class="text-left"
            [attr.aria-pressed]="tile() === 'notFully'"
            (click)="toggleTile('notFully')"
            appTourStep="obligations-summary"
            data-testid="tile-not-fully"
          >
            <app-kpi-tile
              [label]="'obligations.summary.notFullyCompliant' | transloco"
              [value]="s.not_fully_compliant"
              [tone]="tileEmphasis('notFully', s.not_fully_compliant, 'warn')"
            />
          </button>
          <button
            type="button"
            class="text-left"
            [attr.aria-pressed]="tile() === 'notEvaluated'"
            (click)="toggleTile('notEvaluated')"
            data-testid="tile-not-evaluated"
          >
            <app-kpi-tile
              [label]="'obligations.summary.notEvaluated' | transloco"
              [value]="s.not_evaluated"
              [tone]="tileEmphasis('notEvaluated', s.not_evaluated, 'info')"
            />
          </button>
          <button
            type="button"
            class="text-left"
            [attr.aria-pressed]="tile() === 'withoutSchedule'"
            (click)="toggleTile('withoutSchedule')"
            data-testid="tile-without-schedule"
          >
            <app-kpi-tile
              [label]="'obligations.summary.withoutSchedule' | transloco"
              [value]="s.without_schedule"
              [tone]="tileEmphasis('withoutSchedule', s.without_schedule, 'warn')"
            />
          </button>
          <button
            type="button"
            class="text-left"
            [attr.aria-pressed]="tile() === 'overdue'"
            (click)="toggleTile('overdue')"
            data-testid="tile-overdue"
          >
            <app-kpi-tile
              [label]="'obligations.summary.overdue' | transloco"
              [value]="s.evaluations_overdue"
              [tone]="tileEmphasis('overdue', s.evaluations_overdue, 'warn')"
            />
          </button>
          <button
            type="button"
            class="text-left"
            [attr.aria-pressed]="tile() === 'renewal'"
            (click)="toggleTile('renewal')"
            data-testid="tile-renewal"
          >
            <app-kpi-tile
              [label]="'obligations.summary.renewalDue' | transloco"
              [value]="s.renewal_due"
              [tone]="tileEmphasis('renewal', s.renewal_due, 'warn')"
            />
          </button>
          <button
            type="button"
            class="text-left"
            [attr.aria-pressed]="tile() === 'expiring'"
            (click)="toggleTile('expiring')"
            data-testid="tile-expiring"
          >
            <app-kpi-tile
              [label]="'obligations.summary.expiring' | transloco: { days: s.expiring_within_days }"
              [value]="s.expiring_soon"
              [tone]="tileEmphasis('expiring', s.expiring_soon, 'warn')"
            />
          </button>
        }
      </ng-container>

      <label filters class="sr-only" for="cf-ob-status">
        {{ 'obligations.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-ob-status"
        class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
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
      <label filters class="sr-only" for="cf-ob-compliance">
        {{ 'obligations.filters.compliance' | transloco }}
      </label>
      <select
        filters
        id="cf-ob-compliance"
        class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
        (change)="setCompliance($any($event.target).value)"
        data-testid="filter-compliance"
      >
        <option value="" [selected]="!compliance()">
          {{ 'obligations.filters.anyCompliance' | transloco }}
        </option>
        @for (c of complianceFilters; track c) {
          <option [value]="c" [selected]="compliance() === c">
            {{ complianceFilterKey(c) | transloco }}
          </option>
        }
      </select>

      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'obligations.filters.type' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
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
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'obligations.filters.framework' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setFramework($any($event.target).value)"
            data-testid="filter-framework"
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
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'obligations.filters.owner' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setOwner($any($event.target).value)"
          >
            <option value="" [selected]="!owner()">
              {{ 'obligations.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="owner() === 'me'">
              {{ 'obligations.filters.mine' | transloco }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'obligations.filters.expiring' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
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
        </label>
        <fieldset class="flex flex-col gap-1.5">
          <legend class="mb-1 text-meta font-semibold text-fg-muted">
            {{ 'obligations.filters.attention' | transloco }}
          </legend>
          <label class="flex items-center gap-2 text-ui text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="overdue()"
              (change)="setFlag('overdue', $any($event.target).checked)"
              data-testid="filter-overdue"
            />
            {{ 'obligations.filters.overdue' | transloco }}
          </label>
          <label class="flex items-center gap-2 text-ui text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="withoutSchedule()"
              (change)="setFlag('withoutSchedule', $any($event.target).checked)"
              data-testid="filter-without-schedule"
            />
            {{ 'obligations.filters.withoutSchedule' | transloco }}
          </label>
          <label class="flex items-center gap-2 text-ui text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="renewal()"
              (change)="setFlag('renewal', $any($event.target).checked)"
            />
            {{ 'obligations.filters.renewalDue' | transloco }}
          </label>
        </fieldset>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'obligations.filters.sort' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            (change)="setSort($any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'obligations.sorts.' + sortKey(s) | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (isFiltered()) {
        <p class="-mt-2 mb-3 flex flex-wrap items-center gap-x-3 text-meta text-fg-muted">
          @if (state() === 'ready') {
            <span>{{ 'obligations.list.showing' | transloco: { count: total() } }}</span>
          }
          <button
            type="button"
            class="font-semibold text-accent hover:underline"
            (click)="resetFilters()"
            data-testid="reset-filters"
          >
            {{ 'obligations.list.resetFilters' | transloco }}
          </button>
        </p>
      }

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (rows().length === 0) {
              <app-empty-state
                titleKey="obligations.list.noMatch"
                bodyKey="obligations.list.noMatchBody"
                ctaKey="obligations.list.resetFilters"
                ctaVariant="secondary"
                [compact]="true"
                (cta)="resetFilters()"
                data-testid="no-match"
              />
            } @else {
              <div role="list" data-testid="obligation-rows">
                <app-record-row-header dateKind="next" />
                @for (o of rows(); track o.id) {
                  <app-record-row
                    [code]="o.code"
                    [title]="o.title"
                    [subtitle]="subtitle(o)"
                    [link]="['/obligations', o.id]"
                    [owner]="o.owner?.name"
                    [date]="o.next_evaluation?.due_at ?? null"
                    dateKind="next"
                    [overdue]="!!o.next_evaluation?.overdue"
                  >
                    <app-coverage-chip coverage [entityType]="entityType" [entityId]="o.id" />
                    <app-status-badge
                      badges
                      meaning="compliance"
                      [value]="o.compliance_status"
                      [labelKey]="complianceKey(o.compliance_status)"
                    />
                    @if (o.status !== 'active') {
                      <app-status-badge
                        badges
                        meaning="lifecycle"
                        [value]="o.status"
                        [labelKey]="statusKey(o.status)"
                      />
                    }
                    @if (o.needs_schedule) {
                      <app-status-badge
                        badges
                        meaning="lifecycle"
                        value="due"
                        labelKey="obligations.list.noPlan"
                        data-testid="row-no-plan"
                      />
                    }
                    @if (o.renewal_due) {
                      <app-status-badge
                        badges
                        meaning="lifecycle"
                        value="due"
                        labelKey="obligations.list.renewalDue"
                      />
                    }
                  </app-record-row>
                }
              </div>
              @if (total() > pageSize) {
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
        }
      </app-card>

      <app-why-it-matters below scope="obligations" page="list" />

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
      </div>
    </app-record-list-page>
  `,
})
export class ObligationsList {
  private readonly api = inject(ObligationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly entityType = ENTITY_TYPE;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly complianceFilters = COMPLIANCE_FILTERS;
  protected readonly expiryFilters = EXPIRY_FILTERS;
  protected readonly types = OBLIGATION_TYPES;
  protected readonly frameworks = FRAMEWORKS;
  protected readonly sorts = OBLIGATION_SORTS;
  protected readonly exportFormats = EXPORT_FORMATS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = obligationStatusKey;
  protected readonly complianceKey = complianceKey;
  protected readonly frameworkKey = frameworkKey;
  protected readonly sortKey = sortKey;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<string>('current');
  protected readonly type = signal<ObligationType | ''>('');
  protected readonly compliance = signal<string>('');
  protected readonly framework = signal<string>('');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly expiring = signal<string>('');
  protected readonly overdue = signal(false);
  protected readonly withoutSchedule = signal(false);
  protected readonly renewal = signal(false);
  protected readonly sort = signal<ObligationSort>('-updated_at');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly ObligationListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly summary = signal<ObligationSummary | null>(null);
  private readonly exporting = signal(false);
  private readonly reloadTick = signal(0);

  /** The tile whose filter is the only one set (shown as pressed). */
  protected readonly tile = computed<TileFilter | null>(() => {
    const extra =
      !!this.q() ||
      this.status() !== 'current' ||
      !!this.type() ||
      !!this.framework() ||
      !!this.owner();
    if (extra) {
      return null;
    }
    const on: TileFilter[] = [];
    if (this.compliance() === 'not_fully') on.push('notFully');
    else if (this.compliance() === 'not_evaluated') on.push('notEvaluated');
    else if (this.compliance()) return null;
    if (this.withoutSchedule()) on.push('withoutSchedule');
    if (this.overdue()) on.push('overdue');
    if (this.renewal()) on.push('renewal');
    if (this.expiring() === String(SUMMARY_EXPIRY_DAYS)) on.push('expiring');
    else if (this.expiring()) return null;
    return on.length === 1 ? on[0] : null;
  });

  /** Filters inside "More filters" that are set (the button's count). */
  protected readonly moreActive = computed(
    () =>
      [
        !!this.type(),
        !!this.framework(),
        !!this.owner(),
        !!this.expiring(),
        this.overdue(),
        this.withoutSchedule(),
        this.renewal(),
        this.sort() !== '-updated_at',
      ].filter(Boolean).length,
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
      this.overdue() ||
      this.withoutSchedule() ||
      this.renewal(),
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
    without_schedule: this.withoutSchedule() ? '1' : '',
    renewal_due: this.renewal() ? '1' : '',
    sort: this.sort(),
  }));

  private readonly query = computed<ObligationListQuery>(() => {
    const expiring = this.expiring();
    return {
      q: this.q() || undefined,
      status: statusesForFilter(this.status()),
      type: this.type() ? [this.type() as ObligationType] : undefined,
      compliance: compliancesForFilter(this.compliance()),
      framework: this.framework() || undefined,
      owner: this.owner() || undefined,
      evaluation_overdue: this.overdue() ? true : undefined,
      without_schedule: this.withoutSchedule() ? true : undefined,
      renewal_due: this.renewal() ? true : undefined,
      expiring_within_days: expiring ? Number(expiring) : undefined,
      sort: this.sort(),
      limit: PAGE_SIZE,
      offset: this.offset(),
    };
  });

  private request = new Subscription();
  private summaryRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.summaryRequest.unsubscribe();
    });
    this.applyUrlFilters();
    providePageContext(() => ({
      module: 'obligations',
      entityType: ENTITY_TYPE,
      view: 'list',
      title: this.language.translate('modules.names.obligations'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reloadTick();
      untracked(() => this.loadSummary(orgId));
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = this.query();
      this.reloadTick();
      untracked(() => this.load(orgId, query));
    });
  }

  protected subtitle(o: ObligationListItem): string {
    const parts = [this.language.translate(obligationTypeKey(o.obligation_type))];
    if (o.issuer) {
      parts.push(o.issuer);
    }
    if (o.duty_count) {
      parts.push(this.language.translate('obligations.list.duties', { count: o.duty_count }));
    }
    return parts.join(' · ');
  }

  protected tileEmphasis(tile: TileFilter, value: number, tone: 'warn' | 'info') {
    if (this.tile() === tile) {
      return 'accent' as const;
    }
    return value ? tone : ('neutral' as const);
  }

  protected statusFilterKey(filter: string): string {
    return filter === 'current' || filter === 'all'
      ? `obligations.filters.statusOptions.${filter}`
      : obligationStatusKey(filter);
  }

  protected complianceFilterKey(filter: string): string {
    return filter === 'not_fully' ? 'obligations.filters.notFully' : complianceKey(filter);
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
    this.compliance.set((COMPLIANCE_FILTERS as readonly string[]).includes(value) ? value : '');
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

  protected setFlag(which: 'overdue' | 'withoutSchedule' | 'renewal', value: boolean): void {
    this.offset.set(0);
    this[which].set(value);
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set(
      (OBLIGATION_SORTS as readonly string[]).includes(value)
        ? (value as ObligationSort)
        : '-updated_at',
    );
  }

  /** A tile shows exactly its own slice; clicking the pressed tile shows everything again. */
  protected toggleTile(tile: TileFilter): void {
    const wasOn = this.tile() === tile;
    this.applyFilters({});
    if (wasOn) {
      return;
    }
    switch (tile) {
      case 'notFully':
        this.compliance.set('not_fully');
        break;
      case 'notEvaluated':
        this.compliance.set('not_evaluated');
        break;
      case 'withoutSchedule':
        this.withoutSchedule.set(true);
        break;
      case 'overdue':
        this.overdue.set(true);
        break;
      case 'renewal':
        this.renewal.set(true);
        break;
      case 'expiring':
        this.expiring.set(String(SUMMARY_EXPIRY_DAYS));
        break;
    }
  }

  protected resetFilters(): void {
    this.q.set('');
    this.applyFilters({});
  }

  protected applyView(view: SavedView): void {
    this.applyFilters(view.filters);
  }

  protected reload(): void {
    this.reloadTick.update((n) => n + 1);
  }

  protected newObligation(): void {
    void this.router.navigate(['/obligations/new']);
  }

  protected exportRegister(format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    const lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.exporting.set(true);
    this.notifications.info('obligations.export.started');
    this.api.export(orgId, format, lang, this.query()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, exportFileName(format, lang));
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  private applyFilters(f: Readonly<Record<string, string>>): void {
    this.offset.set(0);
    this.setStatus(f['status'] ?? 'current');
    this.setType(f['type'] ?? '');
    this.setCompliance(f['compliance'] ?? '');
    this.setFramework(f['framework'] ?? '');
    this.setOwner(f['owner'] ?? '');
    this.setExpiring(f['expiring'] ?? '');
    this.overdue.set(f['overdue'] === '1');
    this.withoutSchedule.set(f['without_schedule'] === '1');
    this.renewal.set(f['renewal_due'] === '1');
    this.setSort(f['sort'] ?? '-updated_at');
  }

  /** Deep links from the home page and the assistant (`?without_schedule=true&owner=me`). */
  private applyUrlFilters(): void {
    const p = this.route.snapshot.queryParamMap;
    if (p.keys.length === 0) {
      return;
    }
    const compliance = p.get('compliance') ?? '';
    this.applyFilters({
      status: p.get('status') ?? 'current',
      type: p.get('type') ?? '',
      compliance: compliance === 'partially_compliant,non_compliant' ? 'not_fully' : compliance,
      framework: p.get('framework') ?? '',
      owner: p.get('owner') ?? '',
      expiring: p.get('expiring_within_days') ?? '',
      overdue: flag(p.get('evaluation_overdue')) ? '1' : '',
      without_schedule: flag(p.get('without_schedule')) ? '1' : '',
      renewal_due: flag(p.get('renewal_due')) ? '1' : '',
      sort: p.get('sort') ?? '-updated_at',
    });
    this.q.set(p.get('q') ?? '');
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

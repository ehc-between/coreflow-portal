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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { formatLocalDay } from '../../shared/locale/locale-pipes';
import { locationName } from '../../shared/locale/countries';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { RequirementCoverageService } from '../../shared/requirement-links/requirement-coverage.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { Breadcrumb } from '../../shared/ui/page-header/page-header';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PrivacyApi } from './data/privacy-api';
import { PERM_MANAGE, PRIVACY_SORTS, PrivacyListQuery, PrivacyRecord } from './data/privacy.models';
import {
  RowFact,
  SubtitlePart,
  rowDate,
  rowFacts,
  rowSubtitle,
  statusKey,
  statusToneValue,
} from './data/privacy-display';
import { PrivacyRefsService } from './data/privacy-refs.service';
import {
  PRIVACY_CRUMB,
  PRIVACY_SETTINGS_LINK,
  REGISTERS,
  RegisterKey,
} from './data/privacy-registers';
import { PrivacyRegisterExport } from './privacy-register-export';
import { FulfilsRequirements } from '../../shared/requirement-locations/fulfils-requirements';
import { privacyNavItems, privacyPermissions } from './privacy-nav';
import { PrivacyGroupSwitch } from './privacy-group-switch';
import { CustomerFilter, customerIdFromRoute } from '../../shared/customers';

const PAGE_SIZE = 25;

/** U24: per register, the overview tile behind each `?attention=` key. */
const ATTENTION_TILES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ropa: { review_overdue: 'reviewsOverdue' },
  dpia: { open: 'dpiasOpen', required_undecided: 'dpiasRequiredUndecided' },
  dsr: { open: 'dsrOpen' },
  breach: {
    open: 'breachesOpen',
    active: 'breachesActive',
    awaiting_closure: 'breachesAwaitingClosure',
  },
  processor: { without_dpa: 'processorsWithoutDpa' },
  transfer: {
    missing_tia: 'transfersMissingTia',
    unsigned_safeguards: 'transfersUnsignedSafeguards',
  },
  retention: { execution_due: 'retentionExecutionsDue' },
};

/** The lesson offered on each register page (kept for callers; the register holds it). */
export const REGISTER_LESSONS: Readonly<Record<RegisterKey, string>> = Object.fromEntries(
  Object.values(REGISTERS).map((r) => [r.key, r.lesson]),
) as Record<RegisterKey, string>;

/** `open` = every status that is not closed; `all` = no status filter. */
export function statusesFor(register: RegisterKey, filter: string): readonly string[] {
  const def = REGISTERS[register];
  if (filter === 'open') {
    return def.statuses.filter((s) => !def.closedStatuses.includes(s));
  }
  return def.statuses.includes(filter) ? [filter] : [];
}

/**
 * A privacy register list (`/privacy/<segment>`), driven by the register descriptor,
 * on the shared list frame: page header (breadcrumbs, the register's export, the
 * gear), the module nav, the help strip, one toolbar row (search, status, the
 * register's first own filter; its other filters, owner, sort and "overdue" under
 * "Flere filtre"), and record
 * rows with the facts an auditor scans for, requirement coverage, status and the
 * register's deadline.
 */
@Component({
  selector: 'app-privacy-register-list',
  imports: [
    CustomerFilter,
    FulfilsRequirements,
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    PrivacyRegisterExport,
    RouterLink,
    PrivacyGroupSwitch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      [titleKey]="'privacy.registers.' + def().key + '.plural'"
      [descriptionKey]="'privacy.registers.' + def().key + '.description'"
      [breadcrumbs]="breadcrumbs"
      [settingsLink]="canManage() ? settingsLink : null"
      scope="privacy"
      [page]="def().key"
      searchPlaceholderKey="privacy.list.searchPlaceholder"
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
          size="sm"
          (click)="create()"
          appTourStep="privacy-new"
          data-testid="privacy-new"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'privacy.registers.' + def().key + '.new' | transloco }}
        </app-button>
      }
      <!-- U12: every privacy list exports what it shows (search + status). -->
      <app-privacy-register-export
        secondary
        [register]="def().key"
        [q]="q()"
        [statuses]="exportStatuses()"
      />

      <app-module-nav
        nav
        labelKey="modules.names.privacy"
        moreLabelKey="privacy.nav.more"
        [items]="nav()"
      />
      <app-privacy-group-switch nav [register]="def().key" />
      <app-fulfils-requirements help />
      <app-help-strip help scope="privacy" [page]="def().key" [lesson]="def().lesson" />
      @if (def().key === 'processor') {
        <!-- U25: a processor is a role of a supplier; the supplier register is its home. -->
        <p help class="text-meta text-fg-muted" data-testid="processors-are-suppliers">
          {{ 'privacy.list.processorsAreSuppliers' | transloco }}
          <a
            class="font-semibold text-accent hover:underline"
            routerLink="/suppliers"
            [queryParams]="{ flag: 'processes_personal_data' }"
            >{{ 'privacy.list.openSupplierRegister' | transloco }}</a
          >
        </p>
      }

      @if (def().customerFilter) {
        <app-customer-filter
          filters
          [value]="customerId()"
          (valueChange)="setCustomer($event)"
          data-testid="filter-customer"
        />
      }
      <label filters class="sr-only" [for]="id('status')">
        {{ 'privacy.list.status' | transloco }}
      </label>
      <select
        filters
        [id]="id('status')"
        class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
        (change)="setStatus($any($event.target).value)"
        data-testid="filter-status"
      >
        <option value="open" [selected]="status() === 'open'">
          {{ 'privacy.list.statusOpen.' + def().key | transloco }}
        </option>
        <option value="all" [selected]="status() === 'all'">
          {{ 'privacy.list.statusAll' | transloco }}
        </option>
        @for (s of def().statuses; track s) {
          <option [value]="s" [selected]="status() === s">{{ statusKey(s) | transloco }}</option>
        }
      </select>

      @if (attention()) {
        <button
          filters
          type="button"
          class="inline-flex h-10 items-center gap-1.5 rounded-tile border border-accent bg-accent-soft px-3 text-ui font-semibold text-accent"
          data-testid="filter-attention"
          (click)="attention.set(''); setStatus('open')"
        >
          {{ 'privacy.overview.tiles.' + attentionTile() | transloco }}
          <span aria-hidden="true">✕</span>
          <span class="sr-only">{{ 'privacy.list.clearAttention' | transloco }}</span>
        </button>
      }
      @for (f of inlineFilters(); track f.param) {
        <ng-container filters>
          <label class="sr-only" [for]="id(f.param)">
            {{ 'privacy.fields.' + f.param | transloco }}
          </label>
          <select
            [id]="id(f.param)"
            class="h-10 max-w-[220px] rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="setExtra(f.param, $any($event.target).value)"
            [attr.data-testid]="'filter-' + f.param"
          >
            <option value="" [selected]="!extra()[f.param]">
              {{ 'privacy.list.any.' + f.param | transloco }}
            </option>
            @for (o of f.options; track o) {
              <option [value]="o" [selected]="extra()[f.param] === o">
                {{ 'privacy.options.' + f.optionSet + '.' + o | transloco }}
              </option>
            }
          </select>
        </ng-container>
      }

      @for (f of moreDefFilters(); track f.param) {
        <div more-filters class="flex flex-col gap-1.5">
          <label class="text-meta font-semibold text-fg-muted" [for]="id(f.param)">
            {{ 'privacy.fields.' + f.param | transloco }}
          </label>
          <select
            [id]="id(f.param)"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="setExtra(f.param, $any($event.target).value)"
            [attr.data-testid]="'filter-' + f.param"
          >
            <option value="" [selected]="!extra()[f.param]">
              {{ 'privacy.list.any.' + f.param | transloco }}
            </option>
            @for (o of f.options; track o) {
              <option [value]="o" [selected]="extra()[f.param] === o">
                {{ 'privacy.options.' + f.optionSet + '.' + o | transloco }}
              </option>
            }
          </select>
        </div>
      }

      <div more-filters class="flex flex-col gap-1.5">
        <label class="text-meta font-semibold text-fg-muted" [for]="id('owner')">
          {{ 'privacy.fields.owner_user_id' | transloco }}
        </label>
        <select
          [id]="id('owner')"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setOwner($any($event.target).value)"
          data-testid="filter-owner"
        >
          <option value="" [selected]="!owner()">{{ 'privacy.list.anyOwner' | transloco }}</option>
          <option value="me" [selected]="owner() === 'me'">
            {{ 'privacy.list.mine' | transloco }}
          </option>
        </select>
      </div>
      <div more-filters class="flex flex-col gap-1.5">
        <label class="text-meta font-semibold text-fg-muted" [for]="id('sort')">
          {{ 'privacy.list.sort' | transloco }}
        </label>
        <select
          [id]="id('sort')"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setSort($any($event.target).value)"
          data-testid="filter-sort"
        >
          @for (s of sorts(); track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'privacy.sorts.' + sortKey(s) | transloco }}
            </option>
          }
        </select>
      </div>
      @if (def().overdue) {
        <label more-filters class="inline-flex items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="overdue()"
            (change)="setOverdue($any($event.target).checked)"
            data-testid="filter-overdue"
          />
          {{ 'privacy.list.overdue.' + def().key | transloco }}
        </label>
      }

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <div class="p-4"><app-loading-state [rows]="5" /></div>
          }
          @case ('error') {
            <div class="p-4"><app-error-state (retry)="reload()" /></div>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-body text-fg-muted" data-testid="no-match">
                {{ 'privacy.list.noMatch' | transloco }}
              </p>
            } @else {
              <div role="list" data-testid="privacy-rows">
                <app-record-row-header [dateKind]="dateKind()" />
                @for (r of rows(); track r.id) {
                  @let d = date(r);
                  <app-record-row
                    [code]="r.code"
                    [title]="r.title"
                    [subtitle]="subtitle(r)"
                    [link]="['/privacy', def().segment, r.id]"
                    [owner]="ownerName(r)"
                    [date]="d.date"
                    [dateKind]="d.kind"
                    [overdue]="d.overdue"
                  >
                    <app-coverage-chip
                      coverage
                      [counts]="coverage.counts(def().entityType, r.id)"
                      [entityType]="def().entityType"
                      [entityId]="r.id"
                    />
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="toneValue(r.status)"
                      [labelKey]="statusKey(r.status)"
                    />
                    @for (f of facts(r); track f.key) {
                      <app-status-badge
                        badges
                        [meaning]="f.meaning"
                        [value]="f.value"
                        [labelKey]="f.key"
                        [labelParams]="factParams(f)"
                      />
                    }
                  </app-record-row>
                }
              </div>
              @if (total() > pageSize) {
                <div class="px-4 py-2.5">
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

      <div below>
        <app-why-it-matters scope="privacy" [page]="def().key" />
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="privacy"
            [page]="def().key"
            [showAction]="canWrite()"
            (action)="create()"
          />
        </app-card>
      </div>
    </app-record-list-page>
  `,
})
export class PrivacyRegisterList {
  private readonly api = inject(PrivacyApi);
  private readonly refs = inject(PrivacyRefsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly perms = privacyPermissions();
  protected readonly coverage = inject(RequirementCoverageService);

  /** Route data: which register this page lists. */
  readonly register = input.required<RegisterKey>();
  protected readonly def = computed(() => REGISTERS[this.register()]);
  /** U30: search, status and the register's first own filter stay inline; the rest go under "Flere filtre". */
  protected readonly inlineFilters = computed(() => this.def().filters.slice(0, 1));
  protected readonly moreDefFilters = computed(() => this.def().filters.slice(1));

  protected readonly nav = privacyNavItems(this.perms);
  protected readonly settingsLink = PRIVACY_SETTINGS_LINK;
  protected readonly breadcrumbs: readonly Breadcrumb[] = [PRIVACY_CRUMB];
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = statusKey;
  protected readonly toneValue = statusToneValue;

  protected readonly canWrite = computed(() => this.perms().has(this.def().writePermission));
  protected readonly canManage = computed(() => this.perms().has(PERM_MANAGE));
  protected readonly sorts = computed(() =>
    PRIVACY_SORTS.filter((s) => this.def().hasDue || !s.endsWith('due')),
  );

  protected readonly q = signal('');
  /** The Kunde filter (`?customer_id=`, the customer card's "Se alle"). */
  protected readonly customerId = signal<string | null>(
    customerIdFromRoute(inject(ActivatedRoute)),
  );
  /** U24: `?attention=<key>`, the named filter behind an overview tile. */
  protected readonly attention = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('attention') ?? '',
  );
  // A tile counts across all statuses, so its list starts on "all".
  protected readonly status = signal(this.attention() ? 'all' : 'open');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly sort = signal<string>('-created_at');
  protected readonly overdue = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('overdue') === '1',
  );
  protected readonly extra = signal<Readonly<Record<string, string>>>({});
  protected readonly offset = signal(0);
  protected readonly exportStatuses = computed(() => statusesFor(this.def().key, this.status()));

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly PrivacyRecord[]>([]);
  protected readonly total = signal(0);

  protected readonly moreActive = computed(
    () =>
      this.moreDefFilters().filter((f) => !!this.extra()[f.param]).length +
      (this.owner() ? 1 : 0) +
      (this.overdue() ? 1 : 0) +
      (this.sort() !== '-created_at' ? 1 : 0),
  );
  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      !!this.customerId() ||
      this.status() !== 'open' ||
      !!this.owner() ||
      this.overdue() ||
      !!this.attention() ||
      Object.values(this.extra()).some(Boolean),
  );
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );
  protected readonly dateKind = computed(() =>
    this.def().key === 'dsr' ? 'due' : this.def().key === 'breach' ? 'date' : 'next',
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    owner: this.owner(),
    sort: this.sort(),
    overdue: this.overdue() ? '1' : '',
    ...this.extra(),
  }));

  private request = new Subscription();
  private lastQuery: { orgId: string | null; query: PrivacyListQuery } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.refs.ensureMembers();
    providePageContext(() => {
      const def = this.def();
      const t = (key: string) => this.language.translate(key);
      // The assistant sees what the user sees: the register, its filters and the count.
      const filters = [
        this.status() === 'open'
          ? t(`privacy.list.statusOpen.${def.key}`)
          : this.status() === 'all'
            ? t('privacy.list.statusAll')
            : t(statusKey(this.status())),
        ...def.filters
          .filter((f) => this.extra()[f.param])
          .map((f) => t(`privacy.options.${f.optionSet}.${this.extra()[f.param]}`)),
        ...(this.overdue() ? [t(`privacy.list.overdue.${def.key}`)] : []),
        ...(this.owner() === 'me' ? [t('privacy.list.mine')] : []),
        ...(this.q() ? [`"${this.q()}"`] : []),
      ];
      const title = t(`privacy.registers.${def.key}.plural`);
      return {
        module: 'privacy',
        entityType: def.entityType,
        view: 'list',
        title:
          this.state() === 'ready'
            ? this.language.translate('privacy.list.contextTitle', {
                title,
                filters: filters.join(', '),
                count: this.total(),
              })
            : title,
      };
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const def = this.def();
      const query: PrivacyListQuery = {
        q: this.q() || undefined,
        status: statusesFor(def.key, this.status()),
        owner: this.owner() || undefined,
        sort: this.sort(),
        overdue: def.overdue && this.overdue() ? true : undefined,
        extra: {
          ...this.extra(),
          attention: this.attention() || undefined,
          customer_id: (def.customerFilter && this.customerId()) || undefined,
        },
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  /** The overview tile an `?attention=` key comes from (for the chip label). */
  protected attentionTile(): string {
    return ATTENTION_TILES[this.def().key]?.[this.attention()] ?? 'attention';
  }

  protected id(name: string): string {
    return `cf-privacy-${this.def().key}-${name}`;
  }

  protected sortKey(sort: string): string {
    return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
  }

  protected ownerName(r: PrivacyRecord): string | null {
    return this.refs.userName(r.owner_user_id);
  }

  protected facts(r: PrivacyRecord): readonly RowFact[] {
    return rowFacts(this.def(), r);
  }

  protected date(r: PrivacyRecord) {
    return rowDate(this.def(), r);
  }

  /** Fact params with nested option keys translated and the date formatted. */
  protected factParams(f: RowFact): Record<string, unknown> {
    const params: Record<string, unknown> = { ...(f.params ?? {}) };
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && v.startsWith('privacy.')) {
        params[k] = this.language.translate(v);
      }
    }
    if (f.date) {
      params['date'] = formatLocalDay(f.date, 'mediumDate', this.language.locale());
    }
    return params;
  }

  /** "Behandlingsansvarlig · Avtale" — the facts an auditor scans for, in one line. */
  protected subtitle(r: PrivacyRecord): string {
    return rowSubtitle(this.def(), r)
      .map((p) => this.partText(p))
      .filter(Boolean)
      .join(' · ');
  }

  private partText(p: SubtitlePart): string {
    if (p.country) {
      return locationName(p.country, this.language);
    }
    if (p.text !== undefined) {
      return p.text;
    }
    if (!p.key) {
      return '';
    }
    const params: Record<string, unknown> = { ...(p.params ?? {}) };
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && v.startsWith('privacy.')) {
        params[k] = this.language.translate(v);
      }
    }
    if (p.date) {
      params['date'] = formatLocalDay(p.date, 'mediumDate', this.language.locale());
    }
    return this.language.translate(p.key, params);
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    const valid = value === 'open' || value === 'all' || this.def().statuses.includes(value);
    this.status.set(valid ? value : 'open');
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set((this.sorts() as readonly string[]).includes(value) ? value : '-created_at');
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected setCustomer(value: string | null): void {
    this.offset.set(0);
    this.customerId.set(value);
  }

  protected setExtra(param: string, value: string): void {
    const filter = this.def().filters.find((f) => f.param === param);
    if (!filter) {
      return;
    }
    this.offset.set(0);
    this.extra.update((e) => ({ ...e, [param]: filter.options.includes(value) ? value : '' }));
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.setStatus(f['status'] ?? 'open');
    this.setOwner(f['owner'] ?? '');
    this.setSort(f['sort'] ?? '-created_at');
    this.setOverdue(f['overdue'] === '1');
    const extra: Record<string, string> = {};
    for (const filter of this.def().filters) {
      const v = f[filter.param] ?? '';
      extra[filter.param] = filter.options.includes(v) ? v : '';
    }
    this.extra.set(extra);
  }

  protected create(): void {
    void this.router.navigate(['/privacy', this.def().segment, 'new']);
  }

  protected reload(): void {
    if (this.lastQuery) {
      this.load(this.lastQuery.orgId, this.lastQuery.query);
    }
  }

  private load(orgId: string | null, query: PrivacyListQuery): void {
    this.request.unsubscribe();
    this.lastQuery = { orgId, query };
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, this.def(), query).subscribe({
      next: (page) => {
        // Requirement coverage per row is fetched in one batch by the chips' `counts()`.
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

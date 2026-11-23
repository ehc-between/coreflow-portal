import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { FILTER_STYLES, pick } from '../components/filter-styles';
import {
  INSPECTIONS_NAV,
  INSPECTIONS_SETTINGS_LINK,
  dateInputToIso,
  dateInputToIsoEnd,
  findingStatusKey,
  saveBlob,
  severityKey,
} from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences } from '../data/inspection-references';
import {
  ExportFormat,
  FINDING_ENTITY_TYPE,
  FINDING_SORTS,
  FINDING_STATUSES,
  Finding,
  FindingListQuery,
  FindingSort,
  FindingStatus,
  INSPECTIONS_MODULE,
  Lang,
  SEVERITIES,
  Severity,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';
import { DateInput } from '../../../shared/ui/date-input/date-input';

const PAGE_SIZE = 25;

export const FINDING_SORT_KEYS: Readonly<Record<FindingSort, string>> = {
  '-created_at': 'createdDesc',
  due_at: 'dueAsc',
  severity: 'severity',
  code: 'code',
};

export interface FindingListFilters {
  readonly status: FindingStatus | '';
  readonly severity: Severity | '';
  readonly owner: '' | 'me';
  readonly deviation: '' | 'true' | 'false';
  /** Checklist template id, or ''. */
  readonly template: string;
  /** Registered from / to (`yyyy-mm-dd`), or ''. */
  readonly from: string;
  readonly to: string;
  readonly sort: FindingSort;
}

export const DEFAULT_FINDING_FILTERS: FindingListFilters = {
  status: 'open',
  severity: '',
  owner: '',
  deviation: '',
  template: '',
  from: '',
  to: '',
  sort: '-created_at',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseFindingFilters(
  raw: Readonly<Record<string, string | null | undefined>>,
): FindingListFilters {
  const day = (v: string | null | undefined) => (v && DAY.test(v) ? v : '');
  return {
    status: pick<FindingStatus | ''>(raw['status'], ['', ...FINDING_STATUSES], 'open'),
    severity: pick(raw['severity'], ['', ...SEVERITIES], ''),
    owner: pick(raw['owner'], ['', 'me'] as const, ''),
    deviation: pick(raw['deviation'], ['', 'true', 'false'] as const, ''),
    template: raw['template'] && UUID.test(raw['template']) ? raw['template'] : '',
    from: day(raw['from']),
    to: day(raw['to']),
    sort: pick(raw['sort'], FINDING_SORTS, '-created_at'),
  };
}

export function toFindingQuery(q: string, f: FindingListFilters, offset: number): FindingListQuery {
  // "high" in a KPI link means "high or critical": serious findings.
  const severity: readonly Severity[] | undefined =
    f.severity === 'high' ? ['high', 'critical'] : f.severity ? [f.severity] : undefined;
  return {
    q: q.trim() || undefined,
    status: f.status ? [f.status] : undefined,
    severity,
    owner: f.owner || undefined,
    has_deviation: f.deviation === '' ? undefined : f.deviation === 'true',
    template_id: f.template || undefined,
    created_from: dateInputToIso(f.from) ?? undefined,
    created_to: dateInputToIsoEnd(f.to) ?? undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * Findings (`/inspections/findings`, "Funn"): every finding raised by an inspection.
 * Filters: status (open by default), severity and whether it became a deviation;
 * owner, checklist, registration period and sort under "Flere filtre". Auditors
 * download the filtered register (Excel, CSV or PDF). A row opens the finding on
 * its inspection (`?finding=`), with its severity, status, deviation, the
 * requirements it is suggested against, owner and due date.
 */
@Component({
  selector: 'app-findings-list',
  imports: [
    DateInput,
    TranslocoPipe,
    TeachingEmpty,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="inspections.findings.title"
      descriptionKey="inspections.findings.subtitle"
      [breadcrumbs]="breadcrumbs"
      scope="inspections"
      page="findings"
      [settingsLink]="settingsLink"
      searchPlaceholderKey="inspections.findings.searchPlaceholder"
      [query]="query()"
      [filters]="viewFilters()"
      [moreFiltersActive]="moreActive()"
      [empty]="isEmptyRegister()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <app-button
        secondary
        variant="secondary"
        [loading]="exporting() === 'xlsx'"
        (click)="download('xlsx')"
        data-testid="export-xlsx"
      >
        <app-icon name="upload" [size]="15" class="rotate-180" />
        {{ 'inspections.findings.export.xlsx' | transloco }}
      </app-button>
      <button appMenuItem overflow type="button" (click)="download('csv')" data-testid="export-csv">
        {{ 'inspections.findings.export.csv' | transloco }}
      </button>
      <button appMenuItem overflow type="button" (click)="download('pdf')" data-testid="export-pdf">
        {{ 'inspections.findings.export.pdf' | transloco }}
      </button>

      <app-module-nav nav class="mb-4 block" labelKey="modules.names.inspections" [items]="nav" />
      <app-help-strip help scope="inspections" page="findings" lesson="inspection-basics" />

      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'inspections.filters.status' | transloco"
        (change)="setFilter('status', $any($event.target).value)"
        data-testid="finding-filter-status"
      >
        <option value="" [selected]="filters().status === ''">
          {{ 'inspections.filters.allStatuses' | transloco }}
        </option>
        @for (s of statuses; track s) {
          <option [value]="s" [selected]="s === filters().status">
            {{ findingStatusKey(s) | transloco }}
          </option>
        }
      </select>
      <select
        filters
        class="cf-filter"
        [attr.aria-label]="'inspections.filters.severity' | transloco"
        (change)="setFilter('severity', $any($event.target).value)"
        data-testid="finding-filter-severity"
      >
        <option value="" [selected]="filters().severity === ''">
          {{ 'inspections.filters.anySeverity' | transloco }}
        </option>
        @for (s of severities; track s) {
          <option [value]="s" [selected]="s === filters().severity">
            {{ (s === 'high' ? 'inspections.filters.highOrCritical' : severityKey(s)) | transloco }}
          </option>
        }
      </select>

      <div more-filters class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'inspections.filters.deviation' | transloco }}
          <select class="cf-filter" (change)="setFilter('deviation', $any($event.target).value)">
            <option value="" [selected]="filters().deviation === ''">
              {{ 'inspections.filters.deviationAny' | transloco }}
            </option>
            <option value="true" [selected]="filters().deviation === 'true'">
              {{ 'inspections.filters.deviationYes' | transloco }}
            </option>
            <option value="false" [selected]="filters().deviation === 'false'">
              {{ 'inspections.filters.deviationNo' | transloco }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'inspections.filters.owner' | transloco }}
          <select class="cf-filter" (change)="setFilter('owner', $any($event.target).value)">
            <option value="" [selected]="filters().owner === ''">
              {{ 'inspections.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="filters().owner === 'me'">
              {{ 'inspections.filters.ownedByMe' | transloco }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'inspections.filters.template' | transloco }}
          <select
            class="cf-filter"
            (change)="setFilter('template', $any($event.target).value)"
            data-testid="finding-filter-template"
          >
            <option value="" [selected]="!filters().template">
              {{ 'inspections.filters.anyTemplate' | transloco }}
            </option>
            @for (t of templates(); track t.id) {
              <option [value]="t.id" [selected]="t.id === filters().template">
                {{ t.title }}
              </option>
            }
          </select>
        </label>
        <fieldset class="flex flex-col gap-1">
          <legend class="mb-1 text-ui font-semibold text-fg-muted">
            {{ 'inspections.filters.registered' | transloco }}
          </legend>
          <div class="grid grid-cols-2 gap-2">
            <label for="ff-filter-from" class="flex flex-col gap-1 text-meta text-fg-muted">
              {{ 'inspections.filters.from' | transloco }}
              <app-date-input
                inputId="ff-filter-from"
                [value]="filters().from"
                data-testid="finding-filter-from"
                (valueChange)="setFilter('from', $event ?? '')"
              />
            </label>
            <label for="ff-filter-to" class="flex flex-col gap-1 text-meta text-fg-muted">
              {{ 'inspections.filters.to' | transloco }}
              <app-date-input
                inputId="ff-filter-to"
                [value]="filters().to"
                data-testid="finding-filter-to"
                (valueChange)="setFilter('to', $event ?? '')"
              />
            </label>
          </div>
        </fieldset>
        <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
          {{ 'inspections.filters.sort' | transloco }}
          <select class="cf-filter" (change)="setFilter('sort', $any($event.target).value)">
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="s === filters().sort">
                {{ 'inspections.sort.' + sortKeys[s] | transloco }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (loading() && items().length === 0) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-card>
          <app-empty-state
            icon="search"
            titleKey="inspections.list.noMatchesTitle"
            bodyKey="inspections.findings.noMatches"
            [compact]="true"
            data-testid="no-matches"
          />
          <div class="-mt-2 pb-4 text-center">
            <app-button variant="secondary" size="sm" (click)="clearFilters()">
              {{ 'inspections.list.clearFilters' | transloco }}
            </app-button>
          </div>
        </app-card>
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-busy]="loading()" data-testid="finding-rows">
            <app-record-row-header dateKind="due" />
            @for (f of items(); track f.id) {
              <app-record-row
                [code]="f.code"
                [title]="f.title"
                [subtitle]="subtitle(f)"
                [link]="findingLink(f)"
                [owner]="f.owner?.name ?? noOwner()"
                [date]="f.due_at"
                dateKind="due"
                [overdue]="f.is_overdue"
              >
                <app-coverage-chip coverage [entityType]="entityType" [entityId]="f.id" />
                <app-status-badge
                  badges
                  meaning="severity"
                  [value]="f.severity"
                  [labelKey]="severityKey(f.severity)"
                />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="f.status"
                  [labelKey]="findingStatusKey(f.status)"
                />
                @if (f.deviation; as dev) {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    value="submitted"
                    labelKey="inspections.findings.deviationBadge"
                    [labelParams]="{ code: dev.code }"
                  />
                }
              </app-record-row>
            }
          </div>
        </app-card>
        <div class="mt-3">
          <app-pager
            [offset]="offset()"
            [pageSize]="pageSize"
            [count]="items().length"
            [total]="total()"
            (pageChange)="offset.set($event)"
          />
        </div>
      }

      <div empty>
        <app-card>
          <app-teaching-empty scope="inspections" page="findings" [showAction]="false" />
        </app-card>
      </div>

      <app-why-it-matters below scope="inspections" page="findings" />
    </app-record-list-page>
  `,
  styles: [FILTER_STYLES],
})
export class FindingsList {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly references = inject(InspectionReferences);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly nav = INSPECTIONS_NAV;
  protected readonly settingsLink = INSPECTIONS_SETTINGS_LINK;
  protected readonly entityType = FINDING_ENTITY_TYPE;
  protected readonly breadcrumbs = [
    { labelKey: 'modules.names.inspections', link: '/inspections' },
    { labelKey: 'inspections.findings.title' },
  ];
  protected readonly statuses = FINDING_STATUSES;
  protected readonly severities = SEVERITIES;
  protected readonly sorts = FINDING_SORTS;
  protected readonly sortKeys = FINDING_SORT_KEYS;
  protected readonly severityKey = severityKey;
  protected readonly findingStatusKey = findingStatusKey;

  protected readonly query = signal('');
  protected readonly filters = signal<FindingListFilters>(
    parseFindingFilters({ ...this.route.snapshot.queryParams }),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Finding[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly exporting = signal<ExportFormat | null>(null);
  private readonly loaded = signal(false);

  protected readonly templates = this.references.activeTemplates;

  protected readonly viewFilters = computed<Record<string, string>>(() => ({ ...this.filters() }));
  protected readonly moreActive = computed(() => {
    const f = this.filters();
    return (
      (f.deviation ? 1 : 0) +
      (f.owner ? 1 : 0) +
      (f.template ? 1 : 0) +
      (f.from || f.to ? 1 : 0) +
      (f.sort !== DEFAULT_FINDING_FILTERS.sort ? 1 : 0)
    );
  });
  protected readonly noOwner = computed(() =>
    this.language.translate('inspections.findings.noOwner'),
  );

  protected readonly isEmptyRegister = computed(
    () =>
      this.loaded() &&
      !this.error() &&
      this.total() === 0 &&
      !this.query().trim() &&
      JSON.stringify(this.filters()) === JSON.stringify(DEFAULT_FINDING_FILTERS),
  );

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: FINDING_ENTITY_TYPE,
      view: 'list',
      title: this.language.translate('inspections.findings.title'),
    }));
    this.references.ensureTemplates();

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const q = this.query();
      const filters = this.filters();
      const offset = this.offset();
      if (orgId) {
        untracked(() => this.load(orgId, q, filters, offset));
      }
    });
  }

  private load(orgId: string, q: string, filters: FindingListFilters, offset: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.listFindings(orgId, toFindingQuery(q, filters, offset)).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.loaded.set(true);
        this.error.set(true);
      },
    });
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId, this.query(), this.filters(), this.offset());
    }
  }

  /** The finding on its inspection (`/inspections/<id>/findings/<finding>`). */
  protected findingLink(f: Finding): readonly string[] {
    return f.inspection
      ? ['/inspections', f.inspection.id, 'findings', f.id]
      : ['/inspections/findings'];
  }

  /** "INS-0001 Vernerunde – Lager · 2 åpne oppgaver". */
  protected subtitle(f: Finding): string {
    const parts: string[] = [];
    if (f.inspection) {
      parts.push(`${f.inspection.code} ${f.inspection.title}`);
    }
    if ((f.open_action_count ?? 0) > 0) {
      parts.push(
        this.language.translate('inspections.findings.openTasks', { count: f.open_action_count }),
      );
    }
    return parts.join(' · ');
  }

  protected onSearch(text: string): void {
    this.offset.set(0);
    this.query.set(text);
  }

  protected setFilter(key: keyof FindingListFilters, value: string): void {
    this.offset.set(0);
    this.filters.set(parseFindingFilters({ ...this.filters(), [key]: value }));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.filters.set({ ...DEFAULT_FINDING_FILTERS, status: '' });
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(parseFindingFilters(view.filters));
  }

  /** Download the filtered register (all pages) in the UI language. */
  protected download(format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    const lang: Lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.exporting.set(format);
    this.api
      .exportFindings(orgId, format, lang, toFindingQuery(this.query(), this.filters(), 0))
      .subscribe({
        next: (blob) => {
          this.exporting.set(null);
          const stamp = new Date().toISOString().slice(0, 10);
          saveBlob(
            blob,
            `${this.language.translate('inspections.findings.fileName')}-${stamp}.${format}`,
          );
        },
        error: (e: unknown) => {
          this.exporting.set(null);
          this.notifications.error(inspectionErrorKey(e));
        },
      });
  }
}

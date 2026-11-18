import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage as KitListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  exportFileName,
  recordBadge,
  saveBlob,
} from '../data/training-display';
import {
  RECORD_METHODS,
  RecordMethod,
  RecordQuery,
  RecordSort,
  TrainingRecord,
} from '../data/training.models';
import { FilterOption, FilterSelect } from '../shared/filter-select';
import { RecordForm } from './record-form';

const PAGE_SIZE = 50;
const SORTS: readonly RecordSort[] = ['-completed_at', 'completed_at', 'expires_at'];
export const VALIDITY_FILTERS = ['', 'valid', 'expiring', 'expired', 'failed'] as const;
export type ValidityFilter = (typeof VALIDITY_FILTERS)[number];

/** API filters for a validity filter value. */
export function validityQuery(filter: ValidityFilter): Partial<RecordQuery> {
  switch (filter) {
    case 'valid':
      return { passed: true, expired: false };
    case 'expiring':
      return { passed: true, expiring_within_days: 30 };
    case 'expired':
      return { expired: true };
    case 'failed':
      return { passed: false };
    default:
      return {};
  }
}

/** Text match on course code/title, person name and certificate number. */
export function matchesRecord(r: TrainingRecord, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return (
    !needle ||
    r.course.title.toLowerCase().includes(needle) ||
    r.course.code.toLowerCase().includes(needle) ||
    r.user.name.toLowerCase().includes(needle) ||
    (r.certificate_no ?? '').toLowerCase().includes(needle)
  );
}

/**
 * `/training/records` ("Gjennomført opplæring"): completion records and
 * certificates, the evidence of competence. Search covers every page (server
 * side). Training managers record external or classroom training; auditors
 * export the filtered list and find records that lack documentation
 * (`?evidence=missing`).
 */
@Component({
  selector: 'app-record-list',
  imports: [
    TranslocoPipe,
    Badge,
    Button,
    CoverageChip,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    WhyItMatters,
    KitListPage,
    FilterSelect,
    RecordForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="training.records.title"
      descriptionKey="training.records.subtitle"
      [breadcrumbs]="[
        { labelKey: 'modules.names.training', link: '/training' },
        { labelKey: 'training.records.title' },
      ]"
      scope="training"
      page="records"
      searchPlaceholderKey="training.records.search"
      [query]="q()"
      [filters]="filters()"
      [moreFiltersActive]="moreActive()"
      [empty]="loaded() && !failed() && items().length === 0 && !hasFilters()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (access.canManage()) {
        <app-button primary (click)="formOpen.set(true)" data-testid="record-new">
          <app-icon name="plus" [size]="15" />
          {{ 'training.records.new' | transloco }}
        </app-button>
      }
      @if (access.canOversee()) {
        <app-button
          secondary
          variant="secondary"
          [loading]="exporting()"
          (click)="exportCsv()"
          data-testid="records-export"
        >
          {{ 'training.export.csv' | transloco }}
        </app-button>
      }
      <app-module-nav nav [items]="access.navItems()" labelKey="training.nav.label" />
      <app-help-strip help scope="training" page="records" lesson="evaluating-effectiveness" />

      @if (access.canOversee()) {
        <app-training-filter
          filters
          [label]="'training.filters.scope' | transloco"
          [value]="scope()"
          [options]="scopeOptions()"
          (valueChange)="setScope($event)"
        />
      }
      <app-training-filter
        filters
        [label]="'training.filters.validity' | transloco"
        [value]="validity()"
        [options]="validityOptions()"
        testId="filter-validity"
        (valueChange)="setValidity($event)"
      />
      @if (access.canOversee()) {
        <app-training-filter
          filters
          [label]="'training.filters.evidence' | transloco"
          [value]="evidenceFilter()"
          [options]="evidenceOptions()"
          testId="filter-evidence"
          (valueChange)="setEvidence($event)"
        />
      }
      <div more-filters class="flex flex-col gap-3">
        <app-training-filter
          [label]="'training.filters.method' | transloco"
          [showLabel]="true"
          [value]="method()"
          [options]="methodOptions()"
          (valueChange)="setMethod($event)"
        />
        <app-training-filter
          [label]="'training.filters.sort' | transloco"
          [showLabel]="true"
          [value]="sort()"
          [options]="sortOptions()"
          (valueChange)="setSort($event)"
        />
      </div>

      @if (!loaded()) {
        <app-loading-state [rows]="6" />
      } @else if (failed()) {
        <app-error-state (retry)="reload()" />
      } @else if (items().length === 0) {
        <app-empty-state
          icon="search"
          titleKey="ui.empty.noResults"
          ctaKey="training.filters.clear"
          ctaVariant="secondary"
          (cta)="clearFilters()"
        />
      } @else {
        <div
          role="list"
          class="overflow-hidden rounded-card border border-border bg-surface"
          data-testid="record-table"
          [attr.aria-label]="'training.records.title' | transloco"
        >
          <app-record-row-header
            dateKind="date"
            codeKey="training.fields.code"
            titleKey="training.fields.course"
            [owner]="scope() === 'all'"
          />
          @for (r of items(); track r.id) {
            @let badge = validityOf(r);
            <app-record-row
              [code]="r.course.code"
              [title]="r.course.title"
              [subtitle]="subtitle(r)"
              [link]="['/training/records', r.id]"
              [owner]="scope() === 'all' ? r.user.name : null"
              [date]="r.completed_at"
              dateKind="date"
            >
              <app-coverage-chip coverage entityType="training_record" [entityId]="r.id" />
              <app-status-badge
                badges
                [meaning]="badge.meaning"
                [value]="badge.value"
                [labelKey]="badge.labelKey"
              />
              @if (r.missing_evidence) {
                <app-badge badges tone="warn" data-testid="missing-evidence">
                  {{ 'training.records.missingEvidence' | transloco }}
                </app-badge>
              }
            </app-record-row>
          }
        </div>
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <app-teaching-empty
        empty
        scope="training"
        page="records"
        (action)="router.navigate(['/training'])"
      />
      <app-why-it-matters below scope="training" page="records" />
    </app-record-list-page>

    <app-training-record-form
      [open]="formOpen()"
      (closed)="formOpen.set(false)"
      (created)="onCreated($event)"
    />
  `,
})
export class RecordListPage {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly access = inject(TrainingAccess);
  protected readonly router = inject(Router);

  /** `?evidence=missing` (from the home page's follow-up list). */
  readonly evidence = input<string | undefined>(undefined);
  /** `?validity=expiring|expired|…` (U24: the expiring/expired tiles). */
  private readonly validityParam = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('validity') ?? undefined,
  );

  protected readonly pageSize = PAGE_SIZE;
  protected readonly scope = linkedSignal<'mine' | 'all'>(() =>
    this.access.canOversee() ? 'all' : 'mine',
  );
  protected readonly validity = linkedSignal<ValidityFilter>(() => {
    const v = this.validityParam() ?? '';
    return (VALIDITY_FILTERS as readonly string[]).includes(v) ? (v as ValidityFilter) : '';
  });
  protected readonly evidenceFilter = linkedSignal<'' | 'missing'>(() =>
    this.evidence() === 'missing' ? 'missing' : '',
  );
  protected readonly method = signal<RecordMethod | ''>('');
  protected readonly sort = signal<RecordSort>('-completed_at');
  protected readonly q = signal('');
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly TrainingRecord[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly formOpen = signal(false);
  private readonly tick = signal(0);

  protected readonly filters = computed(() => ({
    scope: this.scope(),
    validity: this.validity(),
    evidence: this.evidenceFilter(),
    method: this.method(),
    sort: this.sort(),
  }));
  protected readonly moreActive = computed(
    () => (this.method() ? 1 : 0) + (this.sort() !== '-completed_at' ? 1 : 0),
  );
  protected readonly hasFilters = computed(
    () => !!this.q() || !!this.validity() || !!this.evidenceFilter() || !!this.method(),
  );
  private readonly query = computed<RecordQuery>(() => ({
    ...validityQuery(this.validity()),
    mine: this.scope() === 'mine',
    q: this.q() || undefined,
    method: this.method(),
    missing_evidence: this.evidenceFilter() === 'missing' ? true : undefined,
    sort: this.sort(),
  }));

  protected readonly scopeOptions = computed<FilterOption[]>(() => [
    { value: 'all', label: this.language.translate('training.filters.everyone') },
    { value: 'mine', label: this.language.translate('training.filters.mine') },
  ]);
  protected readonly validityOptions = computed<FilterOption[]>(() =>
    VALIDITY_FILTERS.map((v) => ({
      value: v,
      label: this.language.translate(`training.validity.${v || 'all'}`),
    })),
  );
  protected readonly evidenceOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.evidenceAll') },
    { value: 'missing', label: this.language.translate('training.filters.evidenceMissing') },
  ]);
  protected readonly methodOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allMethods') },
    ...RECORD_METHODS.map((m) => ({
      value: m,
      label: this.language.translate(`training.method.${m}`),
    })),
  ]);
  protected readonly sortOptions = computed<FilterOption[]>(() =>
    SORTS.map((s) => ({ value: s, label: this.language.translate(`training.sort.${s}`) })),
  );

  private sub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      entityType: 'training_record',
      view: 'list',
      title: this.language.translate('training.records.title'),
    }));
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.tick();
      const query: RecordQuery = { ...this.query(), limit: PAGE_SIZE, offset: this.offset() };
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.failed.set(false);
        this.sub = this.api.listRecords(orgId, query).subscribe({
          next: (res) => {
            this.items.set(res.items);
            this.total.set(res.total);
            this.loaded.set(true);
          },
          error: () => {
            this.failed.set(true);
            this.loaded.set(true);
          },
        });
      });
    });
  }

  protected reload(): void {
    this.tick.update((n) => n + 1);
  }

  protected validityOf(r: TrainingRecord) {
    return recordBadge(r);
  }

  /** "Kari Nordmann · Ekstern opplæring · Gyldig til 1. mar. 2027". */
  protected subtitle(r: TrainingRecord): string {
    const t = (key: string) => this.language.translate(key);
    const parts: string[] = [];
    if (this.scope() === 'mine') {
      parts.push(t(`training.method.${r.method}`));
    } else {
      parts.push(r.user.name, t(`training.method.${r.method}`));
    }
    if (r.certificate_no) {
      parts.push(r.certificate_no);
    }
    return parts.join(' · ');
  }

  protected setQuery(text: string): void {
    this.q.set(text);
    this.offset.set(0);
  }

  protected setScope(value: string): void {
    this.scope.set(value === 'all' ? 'all' : 'mine');
    this.offset.set(0);
  }

  protected setValidity(value: string): void {
    this.validity.set(
      (VALIDITY_FILTERS as readonly string[]).includes(value) ? (value as ValidityFilter) : '',
    );
    this.offset.set(0);
  }

  protected setEvidence(value: string): void {
    this.evidenceFilter.set(value === 'missing' ? 'missing' : '');
    this.offset.set(0);
  }

  protected setMethod(value: string): void {
    this.method.set(
      (RECORD_METHODS as readonly string[]).includes(value) ? (value as RecordMethod) : '',
    );
    this.offset.set(0);
  }

  protected setSort(value: string): void {
    this.sort.set(
      (SORTS as readonly string[]).includes(value) ? (value as RecordSort) : '-completed_at',
    );
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.q.set('');
    this.validity.set('');
    this.evidenceFilter.set('');
    this.method.set('');
    this.offset.set(0);
  }

  protected exportCsv(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api.exportCsv(orgId, 'records', this.query(), this.language.active()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, exportFileName('records'));
      },
      error: () => {
        this.exporting.set(false);
        this.notifications.error('training.export.failed');
      },
    });
  }

  protected applyView(view: SavedView): void {
    if (view.filters['scope']) {
      this.setScope(view.filters['scope']);
    }
    this.setValidity(view.filters['validity'] ?? '');
    this.setEvidence(view.filters['evidence'] ?? '');
    this.setMethod(view.filters['method'] ?? '');
    this.setSort(view.filters['sort'] ?? '-completed_at');
  }

  protected onCreated(record: TrainingRecord): void {
    this.formOpen.set(false);
    void this.router.navigate(['/training/records', record.id], {
      queryParams:
        record.method === 'external' || record.method === 'manual' ? { tab: 'attachments' } : {},
    });
  }
}

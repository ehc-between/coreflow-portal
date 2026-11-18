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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
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
import { ContinuityApi } from '../data/continuity-api';
import { badge, formatDuration } from '../data/continuity-display';
import {
  ICT_STATUSES,
  IctListItem,
  IctListQuery,
  IctStatus,
  READINESS_STATES,
  ReadinessState,
} from '../data/continuity.models';
import {
  CONTINUITY_NAV,
  ContinuityAskButton,
  ContinuityTargetsLegend,
  sectionCrumbs,
} from '../shared/continuity-page';

const PAGE_SIZE = 25;
/** Issue badges shown per row before "+N". */
const MAX_ISSUES = 2;

export interface IctFilters {
  readonly status: IctStatus | '';
  readonly readiness: ReadinessState | '';
}

const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : '';

export function ictFiltersFromView(values: Readonly<Record<string, string>>): IctFilters {
  return {
    status: pick(values['status'], ICT_STATUSES),
    readiness: pick(values['readiness'], READINESS_STATES),
  };
}

export function ictQuery(q: string, f: IctFilters, offset: number): IctListQuery {
  return {
    q: q || undefined,
    status: f.status || undefined,
    readiness: f.readiness ? [f.readiness] : undefined,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * "RTO: klarer 8 t · krav 4 t" plus the time measured in the last recovery test: what the service can do against what the
 * business needs, in plain words.
 */
export function ictCapabilityText(
  row: IctListItem,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const pair = (label: string, can: number | null, need: number | null) =>
    t('continuity.ict.capabilityPair', {
      label,
      can: formatDuration(can, t),
      need: need === null ? t('continuity.ict.noRequirement') : formatDuration(need, t),
    });
  // The RPO pair is on the detail page; the row keeps to what fits in one line.
  const parts = [
    pair(
      t('continuity.fields.rtoShort'),
      row.achievable_rto_minutes,
      row.readiness.required_rto_minutes,
    ),
  ];
  if (row.last_test_recovery_minutes !== null && row.last_test_recovery_minutes !== undefined) {
    parts.push(
      t('continuity.ict.lastTestTook', {
        duration: formatDuration(row.last_test_recovery_minutes, t),
      }),
    );
  }
  return parts.join(' · ');
}

const SELECT =
  'h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none';

/**
 * ICT readiness (`/continuity/ict-systems`, ISO 27001 A.5.30): each ICT service with
 * what it can recover in against what the BIAs that depend on it require, the
 * requirements it documents, its readiness and the issues found (a missed target in
 * the last test included).
 */
@Component({
  selector: 'app-ict-list',
  imports: [
    TranslocoPipe,
    Button,
    ContinuityAskButton,
    ContinuityTargetsLegend,
    CoverageChip,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="continuity.nav.ict"
      descriptionKey="continuity.ict.subtitle"
      scope="continuity"
      page="ict"
      [breadcrumbs]="crumbs"
      searchPlaceholderKey="continuity.ict.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <app-continuity-ask-button
        secondary
        labelKey="continuity.ai.readiness"
        promptKey="continuity.ai.prompts.readiness"
      />
      @if (canWrite()) {
        <app-button primary appTourStep="continuity-ict-new" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'continuity.ict.new' | transloco }}
        </app-button>
      }

      <app-module-nav nav labelKey="continuity.nav.label" [items]="nav" />
      <app-help-strip help scope="continuity" page="ict" tour="ict" lesson="ict-readiness" />

      <ng-container filters>
        <label class="sr-only" for="ict-f-readiness">{{
          'continuity.fields.readiness' | transloco
        }}</label>
        <select
          id="ict-f-readiness"
          appTourStep="continuity-ict-filters"
          [class]="select"
          (change)="setFilter('readiness', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().readiness">
            {{ 'continuity.filters.anyReadiness' | transloco }}
          </option>
          @for (r of readinessStates; track r) {
            <option [value]="r" [selected]="filters().readiness === r">
              {{ 'continuity.readiness.' + r | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ict-f-status">{{
          'continuity.fields.status' | transloco
        }}</label>
        <select
          id="ict-f-status"
          [class]="select"
          (change)="setFilter('status', $any($event.target).value)"
        >
          <option value="" [selected]="!filters().status">
            {{ 'continuity.filters.anyStatus' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="filters().status === s">
              {{ 'continuity.ictStatus.' + s | transloco }}
            </option>
          }
        </select>
      </ng-container>

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
              icon="search"
              titleKey="ui.empty.noResults"
              ctaKey="continuity.filters.clear"
              ctaVariant="secondary"
              (cta)="clearFilters()"
            />
          } @else {
            <app-continuity-targets-legend class="mb-2" [mtpd]="false" />
            <div
              role="list"
              class="overflow-hidden rounded-card border border-border bg-surface"
              data-testid="ict-rows"
            >
              <app-record-row-header dateKind="next" />
              @for (row of rows(); track row.id) {
                <app-record-row
                  [code]="row.code"
                  [title]="row.name"
                  [subtitle]="capability(row)"
                  [link]="['/continuity/ict-systems', row.id]"
                  [owner]="row.owner?.name"
                  [date]="row.readiness.next_test_due_on"
                  dateKind="next"
                  [overdue]="row.readiness.issues.includes('test_overdue')"
                >
                  <app-coverage-chip
                    coverage
                    entityType="continuity_ict_system"
                    [entityId]="row.id"
                  />
                  <app-status-badge
                    badges
                    [meaning]="readiness(row).meaning"
                    [value]="readiness(row).value"
                    [labelKey]="'continuity.readiness.' + row.readiness.state"
                  />
                  @for (issue of row.readiness.issues.slice(0, maxIssues); track issue) {
                    <span
                      badges
                      class="text-meta"
                      [class]="isGap(issue) ? 'font-semibold text-fail-ink' : 'text-warn-ink'"
                      >{{ 'continuity.readinessIssue.' + issue | transloco }}</span
                    >
                  }
                  @if (row.readiness.issues.length > maxIssues) {
                    <span badges class="text-meta text-fg-muted">{{
                      'continuity.common.more'
                        | transloco: { count: row.readiness.issues.length - maxIssues }
                    }}</span>
                  }
                </app-record-row>
              }
            </div>
            @if (total() > pageSize) {
              <div class="mt-3">
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

      <app-teaching-empty
        empty
        scope="continuity"
        page="ict"
        [showAction]="canWrite()"
        (action)="create()"
      />
      <app-why-it-matters below scope="continuity" page="ict" />
    </app-record-list-page>
  `,
})
export class IctList {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly nav = CONTINUITY_NAV;
  protected readonly crumbs = sectionCrumbs('ict');
  protected readonly select = SELECT;
  protected readonly statuses = ICT_STATUSES;
  protected readonly readinessStates = READINESS_STATES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly maxIssues = MAX_ISSUES;
  protected readonly readiness = (row: IctListItem) => badge.readiness(row.readiness.state);

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('continuity:write'),
  );

  protected readonly q = signal('');
  protected readonly filters = signal<IctFilters>({ status: '', readiness: '' });
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly IctListItem[]>([]);
  protected readonly total = signal(0);

  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  private readonly isFiltered = computed(
    () => !!this.q() || Object.values(this.filters()).some((v) => !!v),
  );
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'continuity_ict_system',
      view: 'list',
      title: this.language.translate('continuity.nav.ict'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = ictQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  protected capability(row: IctListItem): string {
    return ictCapabilityText(row, (key, params) => this.language.translate(key, params));
  }

  /** Issues that make the service miss the requirement (shown in red). */
  protected isGap(issue: string): boolean {
    return (
      issue === 'rto_gap' ||
      issue === 'rpo_gap' ||
      issue === 'tested_rto_missed' ||
      issue === 'last_test_failed'
    );
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof IctFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => ictFiltersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(ictFiltersFromView(view.filters));
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.filters.set({ status: '', readiness: '' });
  }

  protected create(): void {
    void this.router.navigate(['/continuity/ict-systems/new']);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), ictQuery(this.q(), this.filters(), this.offset()));
  }

  private load(orgId: string | null, query: IctListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listIct(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

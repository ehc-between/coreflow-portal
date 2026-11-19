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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import {
  checklistProgress,
  leadAuditorName,
  planStatusBadge,
  riskBadge,
} from '../data/audit-display';
import {
  ListResponse,
  PLAN_KINDS,
  PLAN_OPEN_STATUSES,
  PLAN_SORTS,
  PLAN_STATUS_FILTERS,
  Plan,
  PlanKind,
  PlanSort,
  PlanStatusFilter,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';
import { CustomerFilter, customerIdFromRoute } from '../../../shared/customers';

const PAGE_SIZE = 25;

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | '' {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

/** The `status` query value of a plan status filter (`unresolved` = every open status). */
export function planStatusParam(filter: string): string | undefined {
  if (filter === 'unresolved') {
    return PLAN_OPEN_STATUSES.join(',');
  }
  return filter && filter !== 'all' && filter !== 'signed' ? filter : undefined;
}

/** `/audits/plans`: every audit (internal and external) with filters, search, sort and paging. */
@Component({
  selector: 'app-audit-plan-list',
  imports: [
    FulfilsRequirements,
    TranslocoPipe,
    Button,
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
    TourStepDirective,
    WhyItMatters,
    AuditsNav,
    AuditLoadState,
    CustomerFilter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      exportRegister="audit_plans"
      titleKey="audits.plans.title"
      descriptionKey="audits.plans.subtitle"
      scope="audits"
      page="plans"
      [breadcrumbs]="[
        { labelKey: 'modules.names.audits', link: '/audits' },
        { labelKey: 'audits.plans.title' },
      ]"
      searchPlaceholderKey="audits.plans.search"
      [query]="q()"
      [filters]="filterValues()"
      [moreFiltersActive]="sort() === 'planned_start' ? 0 : 1"
      [empty]="isEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="audits.plans" />
      @if (access.canWrite()) {
        <app-button primary (click)="create()" [appTourStep]="'audits-new'">
          <app-icon name="plus" [size]="14" />
          {{ 'audits.plans.new' | transloco }}
        </app-button>
      }
      <app-audits-nav nav />
      <app-help-strip help scope="audits" page="plans" lesson="internal-audits" />

      <ng-container filters>
        <app-customer-filter
          [value]="customerId()"
          (valueChange)="customerId.set($event); offset.set(0)"
          data-testid="plan-customer-filter"
        />
        <label class="sr-only" for="plan-status">{{ 'audits.filters.status' | transloco }}</label>
        <select
          id="plan-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="status.set($any($event.target).value); offset.set(0)"
        >
          @for (s of statusFilters; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'audits.filters.planStatus.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="plan-kind">{{ 'audits.filters.kind' | transloco }}</label>
        <select
          id="plan-kind"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="kind.set($any($event.target).value); offset.set(0)"
        >
          <option value="" [selected]="!kind()">{{ 'audits.filters.anyKind' | transloco }}</option>
          @for (k of kinds; track k) {
            <option [value]="k" [selected]="kind() === k">
              {{ 'audits.kind.' + k | transloco }}
            </option>
          }
        </select>
      </ng-container>
      <div more-filters class="flex flex-col gap-1">
        <label class="text-meta font-semibold text-fg-muted" for="plan-sort">{{
          'audits.filters.sort' | transloco
        }}</label>
        <select
          id="plan-sort"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="sort.set($any($event.target).value); offset.set(0)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'audits.plans.sorts.' + s | transloco }}
            </option>
          }
        </select>
      </div>

      <app-card [padded]="false">
        <app-audit-load-state [state]="data.state()" [rows]="5" (retry)="load()" />
        @if (data.state() === 'ready') {
          @if (rows().length) {
            <div role="list" [attr.aria-label]="'audits.plans.title' | transloco">
              <app-record-row-header
                dateKind="date"
                [owner]="true"
                titleKey="audits.plans.columnTitle"
              />
              @for (p of rows(); track p.id) {
                @let sb = statusBadge(p.status);
                @let rb = risk(p.risk_level);
                <app-record-row
                  [code]="p.code"
                  [title]="p.title"
                  [subtitle]="subtitle(p)"
                  [link]="['/audits/plans', p.id]"
                  [owner]="lead(p)"
                  [date]="p.planned_start"
                  dateKind="date"
                >
                  <app-coverage-chip coverage entityType="audit_plan" [entityId]="p.id" />
                  <app-status-badge
                    badges
                    [meaning]="sb.meaning"
                    [value]="sb.value"
                    [labelKey]="sb.labelKey"
                  />
                  <app-status-badge
                    badges
                    [meaning]="rb.meaning"
                    [value]="rb.value"
                    [labelKey]="rb.labelKey"
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
        <app-teaching-empty
          scope="audits"
          page="plans"
          [showAction]="access.canWrite()"
          (action)="create()"
        />
      </app-card>
      <app-why-it-matters below scope="audits" page="plans" />
    </app-record-list-page>
  `,
})
export class PlanList {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<ListResponse<Plan>>();

  protected readonly statusFilters = PLAN_STATUS_FILTERS;
  protected readonly kinds = PLAN_KINDS;
  protected readonly sorts = PLAN_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusBadge = planStatusBadge;
  protected readonly risk = riskBadge;
  protected readonly lead = leadAuditorName;

  private readonly route = inject(ActivatedRoute);
  private readonly initial = this.route.snapshot.queryParamMap;
  protected readonly q = signal(this.initial.get('q') ?? '');
  /** The Kunde filter (`?customer_id=`, e.g. the customer card's "Se alle"). */
  protected readonly customerId = signal<string | null>(customerIdFromRoute(this.route));
  protected readonly status = signal<PlanStatusFilter>(
    pick(this.initial.get('status') === 'open' ? 'unresolved' : this.initial.get('status'), [
      ...PLAN_STATUS_FILTERS,
    ]) || 'all',
  );
  protected readonly kind = signal<PlanKind | ''>(pick(this.initial.get('kind'), PLAN_KINDS));
  protected readonly sort = signal<PlanSort>(
    pick(this.initial.get('sort'), PLAN_SORTS) || 'planned_start',
  );
  protected readonly offset = signal(0);

  protected readonly rows = computed(() => this.data.value()?.items ?? []);
  protected readonly filterValues = computed(() => ({
    status: this.status(),
    kind: this.kind(),
    sort: this.sort(),
  }));
  protected readonly isEmpty = computed(
    () =>
      this.data.state() === 'ready' &&
      (this.data.value()?.total ?? 0) === 0 &&
      !this.q() &&
      !this.customerId() &&
      this.status() === 'all' &&
      !this.kind(),
  );

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_plan',
      view: 'list',
      title: this.language.translate('audits.plans.title'),
    }));
    effect(() => {
      this.access.orgId();
      this.q();
      this.status();
      this.kind();
      this.customerId();
      this.sort();
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
      this.api.listPlans(orgId, {
        q: this.q() || undefined,
        status: planStatusParam(this.status()),
        signed: this.status() === 'signed' || undefined,
        kind: this.kind() || undefined,
        customer_id: this.customerId() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      }),
      true,
    );
  }

  protected subtitle(p: Plan): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(`audits.kind.${p.kind}`)];
    if (p.kind === 'external' && p.external_party_name) {
      parts.push(p.external_party_name);
    }
    if (p.checklist_total) {
      parts.push(
        t('audits.plans.progressValue', {
          percent: checklistProgress(p.checklist_answered, p.checklist_total),
          answered: p.checklist_answered,
          total: p.checklist_total,
        }),
      );
    }
    if (p.findings_total) {
      parts.push(
        t('audits.plans.findingsValue', { open: p.findings_open, total: p.findings_total }),
      );
    }
    return parts.join(' · ');
  }

  protected setQuery(q: string): void {
    this.q.set(q);
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.q.set('');
    this.customerId.set(null);
    this.status.set('all');
    this.kind.set('');
    this.sort.set('planned_start');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.status.set(pick(view.filters['status'], [...PLAN_STATUS_FILTERS]) || 'all');
    this.kind.set(pick(view.filters['kind'], PLAN_KINDS));
    this.sort.set(pick(view.filters['sort'], PLAN_SORTS) || 'planned_start');
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigate(['/audits/plans/new']);
  }
}

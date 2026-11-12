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
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Pager } from '../../../shared/ui/pager/pager';
import { AuditAccess } from '../data/audit-access';
import { checklistProgress, planStatusTone, riskTone } from '../data/audit-display';
import {
  ListResponse,
  PLAN_KINDS,
  PLAN_SORTS,
  PLAN_STATUSES,
  Plan,
  PlanKind,
  PlanSort,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

const PAGE_SIZE = 25;

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | '' {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

/** `/audits/plans`: every audit (internal and external) with filters, search, sort and paging. */
@Component({
  selector: 'app-audit-plan-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Pager,
    RecordListPage,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    TourStepDirective,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="audits.plans.title"
      scope="audits"
      page="plans"
      searchPlaceholderKey="audits.plans.search"
      [query]="q()"
      [filters]="filterValues()"
      [empty]="isEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <app-audits-nav />
        <div class="mt-4 flex flex-col gap-3">
          <app-guide-intro scope="audits" page="plans" />
          <app-why-it-matters scope="audits" page="plans" />
        </div>
      </div>
      @if (access.canWrite()) {
        <app-button toolbar size="sm" (click)="create()" [appTourStep]="'audits-new'">
          {{ 'audits.plans.new' | transloco }}
        </app-button>
      }
      <div filters class="flex flex-wrap gap-2">
        <label class="sr-only" for="plan-status">{{ 'audits.filters.status' | transloco }}</label>
        <select
          id="plan-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="status.set($any($event.target).value); offset.set(0)"
        >
          <option value="" [selected]="!status()">
            {{ 'audits.filters.anyStatus' | transloco }}
          </option>
          <option value="open" [selected]="status() === 'open'">
            {{ 'audits.filters.openAudits' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'audits.planStatus.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="plan-kind">{{ 'audits.filters.kind' | transloco }}</label>
        <select
          id="plan-kind"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="kind.set($any($event.target).value); offset.set(0)"
        >
          <option value="" [selected]="!kind()">{{ 'audits.filters.anyKind' | transloco }}</option>
          @for (k of kinds; track k) {
            <option [value]="k" [selected]="kind() === k">
              {{ 'audits.kind.' + k | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="plan-sort">{{ 'audits.filters.sort' | transloco }}</label>
        <select
          id="plan-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
        <app-audit-load-state [state]="data.state()" (retry)="load()" />
        @if (data.state() === 'ready') {
          @if (rows().length) {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[720px] text-left text-[13px]">
                <caption class="sr-only">
                  {{
                    'audits.plans.title' | transloco
                  }}
                </caption>
                <thead class="border-b border-border text-[12px] text-fg-muted">
                  <tr>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'audits.fields.title' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.kind' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.plannedStart' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.leadAuditor' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.progress' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.findings' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.status' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  @for (p of rows(); track p.id) {
                    <tr class="hover:bg-surface-2">
                      <td class="px-4 py-2.5">
                        <a
                          [routerLink]="['/audits/plans', p.id]"
                          class="font-semibold text-fg hover:text-accent"
                        >
                          <span class="block text-[11.5px] font-normal text-fg-subtle">{{
                            p.code
                          }}</span>
                          {{ p.title }}
                        </a>
                      </td>
                      <td class="px-3 py-2.5 text-fg-muted">
                        {{ 'audits.kind.' + p.kind | transloco }}
                        @if (p.external_party_type) {
                          <span class="block text-[11.5px] text-fg-subtle">
                            {{ 'audits.partyType.' + p.external_party_type | transloco }}
                          </span>
                        }
                      </td>
                      <td class="px-3 py-2.5 text-fg-muted">{{ p.planned_start | localDay }}</td>
                      <td class="px-3 py-2.5 text-fg-muted">{{ p.lead_auditor?.name || '–' }}</td>
                      <td class="px-3 py-2.5 text-fg-muted">
                        {{
                          'audits.plans.progressValue'
                            | transloco
                              : {
                                  percent: progress(p),
                                  answered: p.checklist_answered,
                                  total: p.checklist_total,
                                }
                        }}
                      </td>
                      <td class="px-3 py-2.5 text-fg-muted">
                        {{
                          'audits.plans.findingsValue'
                            | transloco: { open: p.findings_open, total: p.findings_total }
                        }}
                      </td>
                      <td class="px-3 py-2.5">
                        <div class="flex flex-wrap gap-1">
                          <app-badge [tone]="statusTone(p.status)">
                            {{ 'audits.planStatus.' + p.status | transloco }}
                          </app-badge>
                          <app-badge [tone]="riskTone(p.risk_level)">
                            {{ 'audits.risk.' + p.risk_level | transloco }}
                          </app-badge>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'audits.common.noMatches' | transloco }}
            </p>
          }
        }
      </app-card>
      <app-pager
        [offset]="offset()"
        [pageSize]="pageSize"
        [count]="rows().length"
        [total]="data.value()?.total ?? null"
        (pageChange)="offset.set($event)"
      />

      <app-teaching-empty
        empty
        scope="audits"
        page="plans"
        [showAction]="access.canWrite()"
        (action)="create()"
      />
    </app-record-list-page>
  `,
})
export class PlanList {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<ListResponse<Plan>>();

  protected readonly statuses = PLAN_STATUSES;
  protected readonly kinds = PLAN_KINDS;
  protected readonly sorts = PLAN_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusTone = planStatusTone;
  protected readonly riskTone = riskTone;

  private readonly initial = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly q = signal(this.initial.get('q') ?? '');
  protected readonly status = signal<string>(
    this.initial.get('status') === 'open'
      ? 'open'
      : pick(this.initial.get('status'), PLAN_STATUSES),
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
      !this.status() &&
      !this.kind(),
  );

  constructor() {
    providePageContext(() => ({ module: 'audits', entityType: 'audit_plan', view: 'list' }));
    effect(() => {
      this.access.orgId();
      this.q();
      this.status();
      this.kind();
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
    const status =
      this.status() === 'open' ? 'planned,in_progress,reporting,report_review' : this.status();
    this.data.load(
      this.api.listPlans(orgId, {
        q: this.q() || undefined,
        status: status || undefined,
        kind: this.kind() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      }),
      true,
    );
  }

  protected progress(p: Plan): number {
    return checklistProgress(p.checklist_answered, p.checklist_total);
  }

  protected setQuery(q: string): void {
    this.q.set(q);
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.status.set(view.filters['status'] ?? '');
    this.kind.set(pick(view.filters['kind'], PLAN_KINDS));
    this.sort.set(pick(view.filters['sort'], PLAN_SORTS) || 'planned_start');
    this.offset.set(0);
  }

  protected create(): void {
    void this.router.navigate(['/audits/plans/new']);
  }
}

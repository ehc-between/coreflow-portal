import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { Pager } from '../../../shared/ui/pager/pager';
import { AuditAccess } from '../data/audit-access';
import { findingStatusTone, findingTypeTone } from '../data/audit-display';
import {
  FINDING_OPEN_STATUSES,
  FINDING_SORTS,
  FINDING_STATUSES,
  FINDING_TYPES,
  Finding,
  FindingSort,
  ListResponse,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

const PAGE_SIZE = 25;

/** The `status` query value of a status filter ('open' = every open status). */
export function findingStatusParam(filter: string): string | undefined {
  if (filter === 'open') {
    return FINDING_OPEN_STATUSES.join(',');
  }
  return (FINDING_STATUSES as readonly string[]).includes(filter) ? filter : undefined;
}

/** `/audits/findings`: every audit finding with filters (status, type, mine, overdue). */
@Component({
  selector: 'app-audit-finding-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Card,
    Pager,
    RecordListPage,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="audits.findings.title"
      scope="audits"
      page="findings"
      searchPlaceholderKey="audits.findings.search"
      [query]="q()"
      [filters]="filterValues()"
      [empty]="isEmpty()"
      (search)="q.set($event); offset.set(0)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <app-audits-nav />
        <div class="mt-4 flex flex-col gap-3">
          <app-guide-intro scope="audits" page="findings" />
          <app-why-it-matters scope="audits" page="findings" />
        </div>
      </div>
      <div filters class="flex flex-wrap items-center gap-2">
        <label class="sr-only" for="fd-status">{{ 'audits.filters.status' | transloco }}</label>
        <select
          id="fd-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="status.set($any($event.target).value); offset.set(0)"
        >
          <option value="" [selected]="!status()">
            {{ 'audits.filters.anyStatus' | transloco }}
          </option>
          <option value="open" [selected]="status() === 'open'">
            {{ 'audits.filters.openFindings' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'audits.findingStatus.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="fd-type">{{ 'audits.filters.type' | transloco }}</label>
        <select
          id="fd-type"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="type.set($any($event.target).value); offset.set(0)"
        >
          <option value="" [selected]="!type()">{{ 'audits.filters.anyType' | transloco }}</option>
          @for (t of types; track t) {
            <option [value]="t" [selected]="type() === t">
              {{ 'audits.findingType.' + t | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="fd-sort">{{ 'audits.filters.sort' | transloco }}</label>
        <select
          id="fd-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="sort.set($any($event.target).value); offset.set(0)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'audits.findings.sorts.' + s | transloco }}
            </option>
          }
        </select>
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg">
          <input
            type="checkbox"
            [checked]="mine()"
            (change)="mine.set($any($event.target).checked); offset.set(0)"
          />
          {{ 'audits.filters.mine' | transloco }}
        </label>
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg">
          <input
            type="checkbox"
            [checked]="overdue()"
            (change)="overdue.set($any($event.target).checked); offset.set(0)"
          />
          {{ 'audits.filters.overdue' | transloco }}
        </label>
      </div>

      <app-card [padded]="false">
        <app-audit-load-state [state]="data.state()" (retry)="load()" />
        @if (data.state() === 'ready') {
          @if (rows().length) {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[680px] text-left text-[13px]">
                <caption class="sr-only">
                  {{
                    'audits.findings.title' | transloco
                  }}
                </caption>
                <thead class="border-b border-border text-[12px] text-fg-muted">
                  <tr>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'audits.fields.title' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.findingType' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.audit' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.findingOwner' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.responseDue' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2.5 font-semibold">
                      {{ 'audits.fields.status' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  @for (f of rows(); track f.id) {
                    <tr class="hover:bg-surface-2">
                      <td class="px-4 py-2.5">
                        <a
                          [routerLink]="['/audits/findings', f.id]"
                          class="font-semibold text-fg hover:text-accent"
                        >
                          <span class="block text-[11.5px] font-normal text-fg-subtle">{{
                            f.code
                          }}</span>
                          {{ f.title }}
                        </a>
                      </td>
                      <td class="px-3 py-2.5">
                        <app-badge [tone]="typeTone(f.finding_type)">{{
                          'audits.findingType.' + f.finding_type | transloco
                        }}</app-badge>
                      </td>
                      <td class="px-3 py-2.5 text-fg-muted">
                        <a [routerLink]="['/audits/plans', f.plan.id]" class="hover:text-accent">{{
                          f.plan.code
                        }}</a>
                      </td>
                      <td class="px-3 py-2.5 text-fg-muted">{{ f.owner?.name || '–' }}</td>
                      <td
                        class="px-3 py-2.5"
                        [class.text-fail]="f.overdue"
                        [class.text-fg-muted]="!f.overdue"
                      >
                        {{ f.response_due_at | localDay }}
                        @if (f.overdue) {
                          <span class="block text-[11.5px] font-semibold">{{
                            'audits.common.overdue' | transloco
                          }}</span>
                        }
                      </td>
                      <td class="px-3 py-2.5">
                        <app-badge [tone]="statusTone(f.status)">{{
                          'audits.findingStatus.' + f.status | transloco
                        }}</app-badge>
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

      <app-teaching-empty empty scope="audits" page="findings" [showAction]="false" />
    </app-record-list-page>
  `,
})
export class FindingList {
  private readonly api = inject(AuditsApi);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<ListResponse<Finding>>();

  protected readonly statuses = FINDING_STATUSES;
  protected readonly types = FINDING_TYPES;
  protected readonly sorts = FINDING_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly typeTone = findingTypeTone;
  protected readonly statusTone = findingStatusTone;

  private readonly initial = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly q = signal('');
  protected readonly status = signal(this.initial.get('status') ?? 'open');
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
  protected readonly isEmpty = computed(
    () =>
      this.data.state() === 'ready' &&
      (this.data.value()?.total ?? 0) === 0 &&
      !this.q() &&
      (!this.status() || this.status() === 'open') &&
      !this.type() &&
      !this.mine() &&
      !this.overdue(),
  );

  constructor() {
    providePageContext(() => ({ module: 'audits', entityType: 'audit_finding', view: 'list' }));
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

  protected applyView(view: SavedView): void {
    this.status.set(view.filters['status'] ?? '');
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
}

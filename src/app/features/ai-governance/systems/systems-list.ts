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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import {
  AI_ACT_ROLES,
  AiSystemSummary,
  RISK_CLASSES,
  SYSTEM_SORTS,
  SYSTEM_STATUSES,
  SystemSort,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  AI_SYSTEM_ENTITY,
  riskKey,
  riskTone,
  roleKey,
  statusKey,
  systemStatusTone,
} from '../data/ai-governance-display';
import { AiGovNav } from '../ui/ai-gov-nav';
import { AiLessonCard } from '../ui/ai-lesson-card';

const PAGE_SIZE = 25;

/**
 * `/ai-governance/systems`: the AI system inventory, with search, filters
 * (status, risk class, AI Act role), sorting, saved views and paging. Writers
 * can register a system or the platform's own AI features in one click.
 */
@Component({
  selector: 'app-ai-systems-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    AiLessonCard,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    AiGovNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="aiGovernance.systems.title"
      [scope]="scope"
      searchPlaceholderKey="aiGovernance.systems.searchPlaceholder"
      [query]="q()"
      [filters]="filters()"
      [empty]="state() === 'ready' && total() === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3 flex flex-col gap-3">
        <app-ai-gov-nav />
        <app-guide-intro [scope]="scope" page="systems" />
      </div>
      <div toolbar class="flex flex-wrap items-center gap-2">
        <app-tour-button [scope]="scope" tour="systems" />
        @if (store.canWrite()) {
          <app-button
            variant="secondary"
            size="sm"
            [loading]="registering()"
            (click)="registerPlatform()"
            appTourStep="ai-systems-register-platform"
          >
            <app-icon name="spark" [size]="14" />
            {{ 'aiGovernance.systems.registerPlatform' | transloco }}
          </app-button>
          <app-button
            size="sm"
            (click)="create()"
            appTourStep="ai-systems-new"
            data-testid="system-new"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'aiGovernance.systems.new' | transloco }}
          </app-button>
        }
      </div>

      <div filters class="flex flex-wrap items-center gap-2" appTourStep="ai-systems-filters">
        <label class="sr-only" for="ai-sys-status">{{
          'aiGovernance.filters.status' | transloco
        }}</label>
        <select
          id="ai-sys-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setFilter('status', $any($event.target).value)"
        >
          <option value="" [selected]="!status()">
            {{ 'aiGovernance.filters.anyStatus' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">{{ statusKey(s) | transloco }}</option>
          }
        </select>
        <label class="sr-only" for="ai-sys-risk">{{
          'aiGovernance.filters.risk' | transloco
        }}</label>
        <select
          id="ai-sys-risk"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setFilter('risk', $any($event.target).value)"
        >
          <option value="" [selected]="!riskFilter()">
            {{ 'aiGovernance.filters.anyRisk' | transloco }}
          </option>
          @for (r of risks; track r) {
            <option [value]="r" [selected]="riskFilter() === r">
              {{ riskKey(r) | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ai-sys-role">{{
          'aiGovernance.filters.role' | transloco
        }}</label>
        <select
          id="ai-sys-role"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setFilter('role', $any($event.target).value)"
        >
          <option value="" [selected]="!role()">
            {{ 'aiGovernance.filters.anyRole' | transloco }}
          </option>
          @for (r of roles; track r) {
            <option [value]="r" [selected]="role() === r">{{ roleKey(r) | transloco }}</option>
          }
        </select>
        <label class="sr-only" for="ai-sys-sort">{{
          'aiGovernance.filters.sort' | transloco
        }}</label>
        <select
          id="ai-sys-sort"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="setFilter('sort', $any($event.target).value)"
        >
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="sort() === s">
              {{ 'aiGovernance.systems.sorts.' + s | transloco }}
            </option>
          }
        </select>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'aiGovernance.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ errorKey() | transloco }}
            </p>
          }
          @default {
            @if (items().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'aiGovernance.filters.noMatch' | transloco }}
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table
                  class="w-full min-w-[640px] text-left text-[13px]"
                  data-testid="systems-table"
                >
                  <caption class="sr-only">
                    {{
                      'aiGovernance.systems.title' | transloco
                    }}
                  </caption>
                  <thead class="border-b border-border text-[12px] text-fg-muted">
                    <tr>
                      <th scope="col" class="px-4 py-2.5 font-semibold">
                        {{ 'aiGovernance.fields.name' | transloco }}
                      </th>
                      <th scope="col" class="px-3 py-2.5 font-semibold">
                        {{ 'aiGovernance.fields.riskClass' | transloco }}
                      </th>
                      <th scope="col" class="px-3 py-2.5 font-semibold">
                        {{ 'aiGovernance.fields.status' | transloco }}
                      </th>
                      <th scope="col" class="hidden px-3 py-2.5 font-semibold md:table-cell">
                        {{ 'aiGovernance.fields.role' | transloco }}
                      </th>
                      <th scope="col" class="hidden px-3 py-2.5 font-semibold md:table-cell">
                        {{ 'aiGovernance.fields.owner' | transloco }}
                      </th>
                      <th scope="col" class="px-3 py-2.5 font-semibold">
                        {{ 'aiGovernance.fields.nextReview' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (s of items(); track s.id) {
                      <tr class="hover:bg-surface-2">
                        <td class="px-4 py-2.5">
                          <a
                            [routerLink]="['/ai-governance/systems', s.id]"
                            class="font-semibold text-fg hover:underline"
                          >
                            <span class="mr-1.5 font-mono text-[12px] text-fg-subtle">{{
                              s.code
                            }}</span>
                            {{ s.name }}
                          </a>
                          <span class="mt-0.5 flex flex-wrap gap-1.5 text-[12px] text-fg-subtle">
                            @if (s.provider_name) {
                              <span>{{ s.provider_name }}</span>
                            }
                            @if (s.is_builtin) {
                              <app-badge tone="accent">{{
                                'aiGovernance.systems.builtin' | transloco
                              }}</app-badge>
                            }
                            @if (s.gpai) {
                              <app-badge tone="neutral">{{
                                'aiGovernance.result.gpai' | transloco
                              }}</app-badge>
                            }
                          </span>
                        </td>
                        <td class="px-3 py-2.5">
                          <app-badge [tone]="riskTone(s.risk_class)">{{
                            riskKey(s.risk_class) | transloco
                          }}</app-badge>
                        </td>
                        <td class="px-3 py-2.5">
                          <app-badge [tone]="statusTone(s.status)">{{
                            statusKey(s.status) | transloco
                          }}</app-badge>
                        </td>
                        <td class="hidden px-3 py-2.5 text-fg-muted md:table-cell">
                          {{ roleKey(s.ai_act_role) | transloco }}
                        </td>
                        <td class="hidden px-3 py-2.5 text-fg-muted md:table-cell">
                          {{ s.owner?.name ?? ('aiGovernance.common.nobody' | transloco) }}
                        </td>
                        <td class="px-3 py-2.5 text-fg-muted">
                          @if (s.next_review_at) {
                            {{ s.next_review_at | localDay }}
                          } @else {
                            {{ 'aiGovernance.common.notSet' | transloco }}
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="border-t border-border px-4 py-2.5">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="items().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <div empty>
        <app-card>
          <app-teaching-empty
            [scope]="scope"
            page="systems"
            [showAction]="store.canWrite()"
            (action)="create()"
          />
          @if (store.canWrite()) {
            <div class="flex justify-center pb-6">
              <app-button
                variant="secondary"
                size="sm"
                [loading]="registering()"
                (click)="registerPlatform()"
              >
                <app-icon name="spark" [size]="14" />
                {{ 'aiGovernance.systems.registerPlatform' | transloco }}
              </app-button>
            </div>
          }
        </app-card>
      </div>
    </app-record-list-page>
    <div class="mx-auto -mt-6 flex max-w-[1180px] flex-col gap-4 px-4 pb-12 sm:px-8">
      <app-ai-lesson-card lesson="ai-inventory-basics" />
      <app-why-it-matters [scope]="scope" page="systems" />
    </div>
  `,
})
export class AiSystemsList {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statuses = SYSTEM_STATUSES;
  protected readonly risks = RISK_CLASSES;
  protected readonly roles = AI_ACT_ROLES;
  protected readonly sorts = SYSTEM_SORTS;
  protected readonly riskKey = riskKey;
  protected readonly riskTone = riskTone;
  protected readonly statusKey = statusKey;
  protected readonly statusTone = systemStatusTone;
  protected readonly roleKey = roleKey;

  /** The `risk` query param presets the risk-class filter (links from the overview). */
  readonly risk = input<string | undefined>(undefined);

  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly riskFilter = signal('');
  protected readonly role = signal('');
  protected readonly sort = signal<SystemSort>('name');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('aiGovernance.common.loadFailed');
  protected readonly items = signal<readonly AiSystemSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly registering = signal(false);
  private readonly reload = signal(0);

  protected readonly filters = computed(() => ({
    status: this.status(),
    risk: this.riskFilter(),
    role: this.role(),
    sort: this.sort(),
  }));
  protected readonly isFiltered = computed(
    () => !!this.q() || !!this.status() || !!this.riskFilter() || !!this.role(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      view: 'list',
      title: this.language.translate('aiGovernance.systems.title'),
    }));
    effect(() => {
      const preset = this.risk();
      untracked(() => {
        if (preset && (RISK_CLASSES as readonly string[]).includes(preset)) {
          this.riskFilter.set(preset);
        }
      });
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reload();
      const query = {
        q: this.q() || undefined,
        status: this.status() || undefined,
        risk_class: this.riskFilter() || undefined,
        role: this.role() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.listSystems(orgId, query).subscribe({
          next: (page) => {
            this.items.set(page.items);
            this.total.set(page.total);
            this.state.set('ready');
          },
          error: (err: unknown) => {
            this.errorKey.set(aiGovernanceErrorKey(err));
            this.state.set('error');
          },
        });
      });
    });
  }

  protected setQuery(q: string): void {
    this.offset.set(0);
    this.q.set(q.trim());
  }

  protected setFilter(key: 'status' | 'risk' | 'role' | 'sort', value: string): void {
    this.offset.set(0);
    if (key === 'sort') {
      this.sort.set(
        (SYSTEM_SORTS as readonly string[]).includes(value) ? (value as SystemSort) : 'name',
      );
    } else if (key === 'risk') {
      this.riskFilter.set(value);
    } else {
      this[key].set(value);
    }
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.status.set(view.filters['status'] ?? '');
    this.riskFilter.set(view.filters['risk'] ?? '');
    this.role.set(view.filters['role'] ?? '');
    const sort = view.filters['sort'] ?? 'name';
    this.sort.set(
      (SYSTEM_SORTS as readonly string[]).includes(sort) ? (sort as SystemSort) : 'name',
    );
  }

  protected create(): void {
    void this.router.navigate(['/ai-governance/systems/new']);
  }

  protected registerPlatform(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.registering()) {
      return;
    }
    this.registering.set(true);
    this.api.registerPlatformFeatures(orgId, this.language.active()).subscribe({
      next: (result) => {
        this.registering.set(false);
        this.notifications.success(
          result.created > 0
            ? 'aiGovernance.systems.registered'
            : 'aiGovernance.systems.alreadyRegistered',
          { count: result.created },
        );
        this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => {
        this.registering.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}

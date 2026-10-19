import { DatePipe } from '@angular/common';
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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { DocumentsApi } from '../../core/documents/documents-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ActionListRow } from '../deviations/actions/action-list-row';
import { AgentBanner } from '../../shared/ui/agent-banner/agent-banner';
import { Badge } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { FAILED, HIDDEN, LOADING, Loadable, ready } from '../dashboard/dashboard-data';
import {
  severityLabelKey,
  severityTone,
  statusLabelKey,
  statusTone,
} from '../deviations/deviation-enums';
import {
  ApprovalItem,
  MyActions,
  OwnedDeviation,
  assembleApprovals,
  assembleMyActions,
  assembleOwnedDeviations,
} from './my-work-data';

/** Max deviations fetched for the "I own" list (the backend's page cap). */
const OWNED_LIMIT = 200;

/** Max actions shown in "My CAPA actions"; the rest are on the actions list. */
const ACTIONS_LIMIT = 50;

interface OwnedResult {
  readonly items: readonly OwnedDeviation[];
  /** True when the user owns more deviations than one page returned. */
  readonly truncated: boolean;
}

/**
 * Personal work queue for the current org: deviations the user owns (active
 * only, filtered server-side; soonest due first, overdue highlighted), the
 * user's open CAPA actions across all deviations (both `deviations:read`), and
 * items awaiting the user's approval — pending AI proposals plus documents in
 * review (`documents:approve`). The actions section is anchored at `#actions`.
 * Reloads on org switch.
 */
@Component({
  selector: 'app-my-work',
  imports: [DatePipe, RouterLink, TranslocoPipe, ActionListRow, AgentBanner, Badge, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-8 pt-7 pb-12">
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'myWork.title' | transloco }}
        </h1>
        <div class="mt-1.5 text-[14px] text-fg-muted">{{ 'myWork.subtitle' | transloco }}</div>
      </div>

      <div class="mb-[22px]">
        <app-agent-banner agentName="Iris" [agentRole]="'dashboard.agentRole' | transloco" />
      </div>

      @if (!showOwned() && !showApprovals()) {
        <app-card>
          <p class="py-12 text-center text-[14px] text-fg-muted">
            {{ 'myWork.noAccess' | transloco }}
          </p>
        </app-card>
      }

      <!-- Deviations I own -->
      @if (owned(); as o) {
        @if (o.state !== 'hidden') {
          <section class="mb-6">
            <div class="mb-2.5 flex items-center gap-2">
              <h2 class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg">
                {{ 'myWork.owned.title' | transloco }}
              </h2>
              @if (o.state === 'ready') {
                <app-badge tone="neutral">{{ o.value.items.length }}</app-badge>
                @if (overdueCount() > 0) {
                  <app-badge tone="fail">
                    {{ 'myWork.owned.overdueCount' | transloco: { count: overdueCount() } }}
                  </app-badge>
                }
              }
            </div>
            <app-card [padded]="false">
              @switch (o.state) {
                @case ('loading') {
                  <p class="py-8 text-center text-[14px] text-fg-muted">
                    {{ 'common.loading' | transloco }}
                  </p>
                }
                @case ('error') {
                  <p class="py-8 text-center text-[14px] text-fail">
                    {{ 'myWork.loadFailed' | transloco }}
                  </p>
                }
                @case ('ready') {
                  @if (o.value.items.length === 0) {
                    <p class="py-8 text-center text-[14px] text-fg-muted">
                      {{ 'myWork.owned.empty' | transloco }}
                    </p>
                  } @else {
                    <ul class="divide-y divide-border">
                      @for (row of o.value.items; track row.item.id) {
                        <li>
                          <a
                            [routerLink]="['/deviations', row.item.id]"
                            class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                            [class.bg-fail-soft]="row.overdue"
                          >
                            <span class="w-[86px] flex-none font-mono text-[12px] text-fg-subtle">
                              {{ row.item.code }}
                            </span>
                            <span
                              class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg"
                            >
                              {{ row.item.title }}
                            </span>
                            <app-badge [tone]="severityTone(row.item.severity)">
                              {{ severityLabelKey(row.item.severity) | transloco }}
                            </app-badge>
                            <app-badge [tone]="statusTone(row.item.status)">
                              {{ statusLabelKey(row.item.status) | transloco }}
                            </app-badge>
                            <span
                              class="flex w-[120px] flex-none items-center justify-end gap-1 text-[12.5px]"
                              [class.font-semibold]="row.overdue"
                              [class.text-fail]="row.overdue"
                              [class.text-fg-muted]="!row.overdue"
                            >
                              @if (row.overdue) {
                                <app-icon name="alert" [size]="13" />
                              }
                              @if (row.item.due_at) {
                                {{ row.item.due_at | date: 'mediumDate' }}
                              } @else {
                                {{ 'myWork.owned.noDueDate' | transloco }}
                              }
                            </span>
                          </a>
                        </li>
                      }
                    </ul>
                    @if (o.value.truncated) {
                      <p class="border-t border-border px-4 py-2.5 text-[12.5px] text-fg-subtle">
                        {{ 'myWork.owned.truncated' | transloco: { limit: ownedLimit } }}
                        <a
                          routerLink="/deviations"
                          [queryParams]="{
                            owner_user_id: userId(),
                            active: 'true',
                            sort: 'due_at',
                          }"
                          class="font-semibold text-accent hover:underline"
                        >
                          {{ 'myWork.owned.viewAll' | transloco }}
                        </a>
                      </p>
                    }
                  }
                }
              }
            </app-card>
          </section>
        }
      }

      <!-- Awaiting my approval -->
      @if (approvals(); as a) {
        @if (a.state !== 'hidden') {
          <section class="mb-6">
            <div class="mb-2.5 flex items-center gap-2">
              <h2 class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg">
                {{ 'myWork.approvals.title' | transloco }}
              </h2>
              @if (a.state === 'ready') {
                <app-badge [tone]="a.value.length > 0 ? 'warn' : 'neutral'">{{
                  a.value.length
                }}</app-badge>
              }
            </div>
            <app-card [padded]="false">
              @switch (a.state) {
                @case ('loading') {
                  <p class="py-8 text-center text-[14px] text-fg-muted">
                    {{ 'common.loading' | transloco }}
                  </p>
                }
                @case ('error') {
                  <p class="py-8 text-center text-[14px] text-fail">
                    {{ 'myWork.loadFailed' | transloco }}
                  </p>
                }
                @case ('ready') {
                  @if (a.value.length === 0) {
                    <p class="py-8 text-center text-[14px] text-fg-muted">
                      {{ 'myWork.approvals.empty' | transloco }}
                    </p>
                  } @else {
                    <ul class="divide-y divide-border">
                      @for (item of a.value; track item.kind + item.id) {
                        <li>
                          <a
                            [routerLink]="item.link"
                            class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                          >
                            <span
                              class="flex h-8 w-8 flex-none items-center justify-center rounded-tile bg-accent-soft text-accent"
                            >
                              <app-icon
                                [name]="item.kind === 'proposal' ? 'spark' : 'documents'"
                                [size]="16"
                              />
                            </span>
                            <span class="min-w-0 flex-1">
                              <span class="block truncate text-[13.5px] font-semibold text-fg">
                                {{ item.title }}
                              </span>
                              @if (item.detail) {
                                <span class="block truncate text-[12.5px] text-fg-muted">
                                  {{ item.detail }}
                                </span>
                              }
                            </span>
                            <app-badge [tone]="item.kind === 'proposal' ? 'accent' : 'warn'">
                              {{ approvalKindKey(item) | transloco }}
                            </app-badge>
                            <span
                              class="w-[110px] flex-none text-right text-[12.5px] text-fg-muted"
                            >
                              {{ item.since | date: 'mediumDate' }}
                            </span>
                          </a>
                        </li>
                      }
                    </ul>
                  }
                }
              }
            </app-card>
          </section>
        }
      }

      <!-- My CAPA actions (open + in progress, across all deviations) -->
      @if (actions(); as m) {
        @if (m.state !== 'hidden') {
          <section id="actions" class="mb-6 scroll-mt-6">
            <div class="mb-2.5 flex items-center gap-2">
              <h2 class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg">
                {{ 'myWork.actions.title' | transloco }}
              </h2>
              @if (m.state === 'ready') {
                <app-badge tone="neutral">{{ m.value.total }}</app-badge>
                @if (m.value.overdueCount > 0) {
                  <app-badge tone="fail">
                    {{ 'myWork.owned.overdueCount' | transloco: { count: m.value.overdueCount } }}
                  </app-badge>
                }
              }
            </div>
            <app-card [padded]="false">
              @switch (m.state) {
                @case ('loading') {
                  <p class="py-8 text-center text-[14px] text-fg-muted">
                    {{ 'common.loading' | transloco }}
                  </p>
                }
                @case ('error') {
                  <p class="py-8 text-center text-[14px] text-fail">
                    {{ 'myWork.loadFailed' | transloco }}
                  </p>
                }
                @case ('ready') {
                  @if (m.value.items.length === 0) {
                    <p class="py-8 text-center text-[14px] text-fg-muted">
                      {{ 'myWork.actions.empty' | transloco }}
                    </p>
                  } @else {
                    <ul class="divide-y divide-border">
                      @for (action of m.value.items; track action.id) {
                        <li><app-action-list-row [action]="action" /></li>
                      }
                    </ul>
                    @if (m.value.truncated) {
                      <p class="border-t border-border px-4 py-2.5 text-[12.5px] text-fg-subtle">
                        {{
                          'myWork.actions.truncated'
                            | transloco: { shown: m.value.items.length, total: m.value.total }
                        }}
                        <a
                          routerLink="/deviations/actions"
                          [queryParams]="{ owner_user_id: 'me' }"
                          class="font-semibold text-accent hover:underline"
                        >
                          {{ 'myWork.actions.viewAll' | transloco }}
                        </a>
                      </p>
                    }
                  }
                }
              }
            </app-card>
          </section>
        }
      }
    </div>
  `,
})
export class MyWork {
  private readonly auth = inject(AuthService);
  private readonly deviationsApi = inject(DeviationsApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly ownedLimit = OWNED_LIMIT;
  protected readonly severityTone = severityTone;
  protected readonly severityLabelKey = severityLabelKey;
  protected readonly statusTone = statusTone;
  protected readonly statusLabelKey = statusLabelKey;

  /**
   * The signed-in user's id, as a computed so the load effect only re-runs
   * when the id changes — not on every token refresh (which sets a new user
   * object with the same id).
   */
  protected readonly userId = computed(() => this.auth.user()?.id ?? null);
  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly showOwned = computed(() => this.permissions().includes('deviations:read'));
  protected readonly showApprovals = computed(() =>
    this.permissions().includes('documents:approve'),
  );

  protected readonly owned = signal<Loadable<OwnedResult>>(HIDDEN);
  protected readonly approvals = signal<Loadable<readonly ApprovalItem[]>>(HIDDEN);
  protected readonly actions = signal<Loadable<MyActions>>(HIDDEN);

  protected readonly overdueCount = computed(() => {
    const o = this.owned();
    return o.state === 'ready' ? o.value.items.filter((row) => row.overdue).length : 0;
  });

  private requests = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.requests.unsubscribe());

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const userId = this.userId();
      const showOwned = this.showOwned();
      const showApprovals = this.showApprovals();
      untracked(() => this.load(orgId, userId, showOwned, showApprovals));
    });
  }

  protected approvalKindKey(item: ApprovalItem): string {
    return item.kind === 'proposal' ? 'myWork.approvals.proposal' : 'myWork.approvals.document';
  }

  private load(
    orgId: string | null,
    userId: string | null,
    showOwned: boolean,
    showApprovals: boolean,
  ): void {
    // Drop any in-flight responses for the previous org before reloading.
    this.requests.unsubscribe();
    this.requests = new Subscription();

    const canLoad = orgId !== null && userId !== null;
    this.owned.set(canLoad && showOwned ? LOADING : HIDDEN);
    this.approvals.set(canLoad && showApprovals ? LOADING : HIDDEN);
    this.actions.set(canLoad && showOwned ? LOADING : HIDDEN);
    if (!canLoad) {
      return;
    }

    if (showOwned) {
      this.requests.add(
        this.deviationsApi
          .listDeviations(orgId, {
            owner_user_id: userId,
            active: true,
            sort: 'due_at',
            limit: OWNED_LIMIT,
          })
          .subscribe({
            next: (page) =>
              this.owned.set(
                ready({
                  items: assembleOwnedDeviations(page.items),
                  truncated: page.total > page.items.length,
                }),
              ),
            error: () => this.owned.set(FAILED),
          }),
      );
      this.requests.add(
        forkJoin({
          page: this.deviationsApi.listActions(orgId, {
            owner_user_id: 'me',
            sort: 'due_at',
            limit: ACTIONS_LIMIT,
          }),
          // Exact overdue count, even when the page above is capped.
          overdue: this.deviationsApi.listActions(orgId, {
            owner_user_id: 'me',
            overdue: true,
            limit: 1,
          }),
        }).subscribe({
          next: ({ page, overdue }) =>
            this.actions.set(ready(assembleMyActions(page, overdue.total))),
          error: () => this.actions.set(FAILED),
        }),
      );
    }
    if (showApprovals) {
      this.requests.add(
        forkJoin({
          proposals: this.documentsApi.listProposals(orgId),
          documents: this.documentsApi.list(orgId, { status: 'in_review' }),
        }).subscribe({
          next: ({ proposals, documents }) =>
            this.approvals.set(ready(assembleApprovals(proposals, documents))),
          error: () => this.approvals.set(FAILED),
        }),
      );
    }
  }
}

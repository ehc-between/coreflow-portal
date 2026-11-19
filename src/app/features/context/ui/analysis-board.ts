import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ContextApi } from '../data/context-api';
import {
  AnalysisItem,
  AnalysisMethod,
  ContextAnalysis,
  EntityRef,
  FollowUpType,
} from '../data/context.models';
import {
  FactorFollowUps,
  factorFlowKey,
  factorTargets,
  splitFactorTargets,
} from '../data/factor-follow-ups';
import {
  categoriesFor,
  contextErrorKey,
  isAdverse,
  isInternal,
  needsFollowUp,
  significanceTone,
} from '../context-kinds';

export interface BoardColumn {
  readonly category: string;
  readonly items: readonly AnalysisItem[];
}

/** Group items under the method's categories (unknown categories are dropped). */
export function boardColumns(
  method: AnalysisMethod,
  items: readonly AnalysisItem[],
): BoardColumn[] {
  return categoriesFor(method).map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  }));
}

/** Icon of a linked record, by type (falls back to a link). */
const TYPE_ICONS: Readonly<Record<string, string>> = {
  risk: 'risk',
  opportunity: 'flag',
  objective: 'target',
  task: 'checkcircle',
  deviation: 'alert',
};

/** The state of a factor card: handled, needs a decision, or simply not followed up. */
export type FactorState = 'handled' | 'open' | 'none';

export function factorState(method: AnalysisMethod, item: AnalysisItem): FactorState {
  if (item.follow_ups?.length) {
    return 'handled';
  }
  return needsFollowUp(method, item) ? 'open' : 'none';
}

/**
 * The SWOT (2 x 2) or PESTEL (3 x 2) board of an analysis. Each quadrant says
 * whether it is internal or external and helpful or harmful. Each factor card
 * shows its state at a glance: followed up (the linked records as chips with
 * type, code, title and status), needs a follow-up (a subtle warning and ONE
 * action: "Gjør til risiko" / "Gjør til mål"), or not followed up. Everything
 * else (other follow-ups, unlinking) is in small "⋯" menus (HS 4.1 -> 6.1 / 6.2).
 */
@Component({
  selector: 'app-context-analysis-board',
  imports: [TranslocoPipe, EntityChip, Badge, Button, Icon, MenuItem, OverflowMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (onlyOpen()) {
      <div
        class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-tile border border-warn/40 bg-warn-soft px-3 py-2 text-ui text-warn-ink"
        role="status"
        data-testid="board-filter"
      >
        <span class="flex items-center gap-1.5">
          <app-icon name="alert" [size]="14" />
          {{ 'context.analysis.filter.showing' | transloco: { count: openCount() } }}
        </span>
        <button
          type="button"
          class="rounded-md px-1 font-semibold underline hover:no-underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          data-testid="board-show-all"
          (click)="onlyOpen.set(false)"
        >
          {{ 'context.analysis.filter.showAll' | transloco }}
        </button>
      </div>
    }
    <div
      class="grid grid-cols-1 gap-4 md:grid-cols-2"
      [class.xl:grid-cols-3]="analysis().method === 'pestle'"
      data-testid="analysis-board"
    >
      @for (column of visibleColumns(); track column.category) {
        @let swot = analysis().method === 'swot';
        @let harmful = swot && adverse(column.category);
        <section
          class="flex flex-col rounded-card border border-border border-t-4 bg-surface p-4"
          [class.border-t-info]="swot && !harmful"
          [class.border-t-warn]="harmful"
          [class.border-t-border-strong]="!swot"
          [attr.aria-labelledby]="'cat-' + column.category"
          [attr.data-testid]="'quadrant-' + column.category"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3
              [id]="'cat-' + column.category"
              class="flex items-baseline gap-2 font-display text-card font-bold text-fg"
            >
              {{ 'context.categories.' + column.category | transloco }}
              <span
                class="rounded-full bg-surface-2 px-2 text-meta font-semibold text-fg-muted"
                [attr.aria-label]="
                  'context.analysis.factorCount' | transloco: { count: column.items.length }
                "
                >{{ column.items.length }}</span
              >
            </h3>
            @if (swot) {
              <span class="text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase">
                {{
                  'context.analysis.quadrant.' +
                    (internal(column.category) ? 'internal' : 'external') | transloco
                }}
                ·
                {{ 'context.analysis.quadrant.' + (harmful ? 'harmful' : 'helpful') | transloco }}
              </span>
            }
          </div>
          <p class="mt-0.5 mb-3 text-meta text-fg-subtle">
            {{
              (swot ? 'context.analysis.quadrantHints.' : 'context.categoryHints.') +
                column.category | transloco
            }}
          </p>
          @if (column.items.length) {
            <ul class="flex flex-col gap-2.5">
              @for (item of column.items; track item.id ?? $index) {
                @let state = stateOf(item);
                @let targets = split(column.category);
                <li
                  class="rounded-tile border p-3"
                  [class]="
                    state === 'open' ? 'border-warn/50 bg-warn-soft/40' : 'border-border bg-bg'
                  "
                  [attr.data-testid]="'factor-' + (item.id ?? $index)"
                  [attr.data-state]="state"
                >
                  <div class="flex items-start gap-2">
                    <p class="min-w-0 flex-1 text-ui font-medium break-words text-fg">
                      {{ item.text }}
                    </p>
                    <app-badge class="mt-0.5 flex-none" [tone]="tone(item)">{{
                      'context.analysis.impact.' + item.impact | transloco
                    }}</app-badge>
                    @if (
                      canWrite() &&
                      item.id &&
                      (state === 'handled' ? targets.all : targets.rest).length
                    ) {
                      <app-overflow-menu
                        class="-my-1.5 -mr-2 flex-none"
                        variant="ghost"
                        [iconOnly]="true"
                        labelKey="context.analysis.factorMenu"
                        [triggerTestId]="'follow-up-' + item.id"
                      >
                        @for (
                          target of state === 'handled' ? targets.all : targets.rest;
                          track target
                        ) {
                          <button
                            appMenuItem
                            type="button"
                            [disabled]="busy()"
                            (click)="start(item, target)"
                          >
                            <app-icon [name]="iconFor(target)" [size]="15" />
                            {{ 'context.analysis.followUp.' + target | transloco }}
                          </button>
                        }
                      </app-overflow-menu>
                    }
                  </div>

                  @switch (state) {
                    @case ('handled') {
                      <div class="mt-2.5">
                        <p
                          class="flex items-center gap-1 text-micro font-semibold text-pass-ink"
                          [id]="'fu-' + item.id"
                        >
                          <app-icon name="check" [size]="12" />
                          {{ 'context.analysis.state.handled' | transloco }}
                        </p>
                        <ul
                          class="mt-1.5 flex flex-col gap-1.5"
                          [attr.aria-labelledby]="'fu-' + item.id"
                        >
                          @for (ref of item.follow_ups; track ref.entity_type + ref.entity_id) {
                            <li
                              class="flex min-w-0 items-center gap-2 rounded-tile border border-border bg-surface py-1 pr-1 pl-2.5"
                              data-testid="follow-up-link"
                            >
                              <app-icon
                                class="flex-none text-fg-muted"
                                [name]="iconFor(ref.entity_type)"
                                [size]="15"
                              />
                              <app-entity-chip
                                class="min-w-0 flex-1 py-1"
                                [ref]="ref"
                                [statusText]="true"
                                [stacked]="true"
                              />
                              @if (canWrite() && item.id) {
                                <app-overflow-menu
                                  class="flex-none"
                                  variant="ghost"
                                  [iconOnly]="true"
                                  [label]="
                                    'context.analysis.linkMenu'
                                      | transloco: { name: ref.code || ref.title }
                                  "
                                  triggerTestId="follow-up-link-menu"
                                >
                                  @if (ref.url) {
                                    <button appMenuItem type="button" (click)="open(ref)">
                                      <app-icon name="arrow" [size]="15" />
                                      {{ 'context.analysis.openLink' | transloco }}
                                    </button>
                                  }
                                  <button
                                    appMenuItem
                                    type="button"
                                    [danger]="true"
                                    [disabled]="busy()"
                                    data-testid="follow-up-unlink"
                                    (click)="remove(item, ref)"
                                  >
                                    <app-icon name="x" [size]="15" />
                                    {{ 'context.analysis.unlink' | transloco }}
                                  </button>
                                </app-overflow-menu>
                              }
                            </li>
                          }
                        </ul>
                      </div>
                    }
                    @default {
                      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p
                          class="flex items-center gap-1 text-micro font-semibold"
                          [class.text-warn-ink]="state === 'open'"
                          [class.text-fg-subtle]="state !== 'open'"
                        >
                          @if (state === 'open') {
                            <app-icon name="alert" [size]="12" />
                          }
                          {{ 'context.analysis.state.' + state | transloco }}
                        </p>
                        @if (canWrite() && item.id && targets.primary; as target) {
                          <app-button
                            size="sm"
                            [variant]="state === 'open' ? 'primary' : 'secondary'"
                            [disabled]="busy()"
                            [attr.data-testid]="'make-' + target + '-' + item.id"
                            (click)="start(item, target)"
                          >
                            <app-icon [name]="iconFor(target)" [size]="14" />
                            {{ 'context.analysis.makeInto.' + target | transloco }}
                          </app-button>
                        }
                      </div>
                    }
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="text-meta text-fg-subtle">{{ 'context.analysis.noItems' | transloco }}</p>
          }
        </section>
      }
    </div>
  `,
})
export class AnalysisBoard {
  private readonly kit = inject(KitApi);
  private readonly api = inject(ContextApi);
  private readonly router = inject(Router);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly followUpService = inject(FactorFollowUps);

  readonly analysis = input.required<ContextAnalysis>();
  /** The user may add and remove follow-ups (`context:write`). */
  readonly canWrite = input(false);
  /** Show only the factors that still need a follow-up ("1 ikke fulgt opp"). */
  readonly onlyOpen = model(false);
  /** The analysis after a follow-up was removed. */
  readonly changed = output<ContextAnalysis>();

  protected readonly busy = signal(false);
  /** Flow keys the user can start from this analysis (module on + permission). */
  private readonly enabledFlows = signal<ReadonlySet<string>>(new Set());
  protected readonly columns = computed(() =>
    boardColumns(this.analysis().method, this.analysis().items),
  );
  protected readonly openCount = computed(
    () =>
      this.analysis().items.filter((item) => needsFollowUp(this.analysis().method, item)).length,
  );
  /** With the filter on: only the open factors, and only the quadrants that have one. */
  protected readonly visibleColumns = computed(() => {
    const columns = this.columns();
    if (!this.onlyOpen()) {
      return columns;
    }
    const method = this.analysis().method;
    return columns
      .map((column) => ({
        ...column,
        items: column.items.filter((item) => needsFollowUp(method, item)),
      }))
      .filter((column) => column.items.length);
  });

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.analysis().id;
      const canWrite = this.canWrite();
      untracked(() => this.loadFlows(orgId, id, canWrite));
    });
    // Nothing left to show: drop the filter so the board never looks empty.
    effect(() => {
      if (this.onlyOpen() && this.openCount() === 0) {
        untracked(() => this.onlyOpen.set(false));
      }
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected stateOf(item: AnalysisItem): FactorState {
    return factorState(this.analysis().method, item);
  }

  protected tone(item: AnalysisItem) {
    return significanceTone(item.impact);
  }

  protected adverse(category: string): boolean {
    return isAdverse(category);
  }

  protected internal(category: string): boolean {
    return isInternal(category);
  }

  protected iconFor(type: string): string {
    return TYPE_ICONS[type] ?? 'link';
  }

  /** The follow-up targets of a category the user can start: the primary one and the rest. */
  protected split(category: string): {
    primary: FollowUpType | null;
    rest: readonly FollowUpType[];
    all: readonly FollowUpType[];
  } {
    const enabled = this.enabledFlows();
    const all = factorTargets(category).filter((target) => enabled.has(factorFlowKey(target)));
    return { ...splitFactorTargets(category, all), all };
  }

  protected open(ref: EntityRef): void {
    if (ref.url) {
      void this.router.navigateByUrl(ref.url);
    }
  }

  protected start(item: AnalysisItem, target: FollowUpType): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    void this.followUpService
      .start(this.analysis(), item, target)
      .finally(() => this.busy.set(false));
  }

  protected remove(item: AnalysisItem, ref: EntityRef): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !item.id || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .removeFollowUp(orgId, this.analysis().id, item.id, ref.entity_type, ref.entity_id)
      .subscribe({
        next: (analysis) => {
          this.busy.set(false);
          this.changed.emit(analysis);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(contextErrorKey(error));
        },
      });
  }

  private loadFlows(orgId: string | null, id: string, canWrite: boolean): void {
    this.sub?.unsubscribe();
    this.enabledFlows.set(new Set());
    if (!orgId || !canWrite) {
      return;
    }
    this.sub = this.kit.createFlows(orgId, 'context_analysis', { entityId: id }).subscribe({
      next: (list) =>
        this.enabledFlows.set(
          new Set((list?.items ?? []).filter((flow) => flow.enabled).map((flow) => flow.key)),
        ),
      error: () => this.enabledFlows.set(new Set()),
    });
  }
}

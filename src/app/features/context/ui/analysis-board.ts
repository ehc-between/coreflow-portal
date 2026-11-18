import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContextApi } from '../data/context-api';
import {
  AnalysisItem,
  AnalysisMethod,
  ContextAnalysis,
  EntityRef,
  FollowUpType,
} from '../data/context.models';
import { FactorFollowUps, factorFlowKey, factorTargets } from '../data/factor-follow-ups';
import { categoriesFor, contextErrorKey, impactBadge, isAdverse } from '../context-kinds';

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

/**
 * The SWOT (2 x 2) or PESTEL (3 x 2) board of an analysis. Each factor shows
 * what it led to (risks, opportunities, objectives, tasks) and, for users who
 * may write, a "Følg opp" menu that creates the natural next record prefilled
 * with the factor and attaches it (HS 4.1 -> 6.1 / 6.2). Weaknesses and threats
 * without a follow-up are marked, so open issues are visible at a glance.
 */
@Component({
  selector: 'app-context-analysis-board',
  imports: [TranslocoPipe, EntityChip, Icon, MenuItem, OverflowMenu, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="grid grid-cols-1 gap-3 sm:grid-cols-2"
      [class.lg:grid-cols-3]="analysis().method === 'pestle'"
      data-testid="analysis-board"
    >
      @for (column of columns(); track column.category) {
        <section
          class="rounded-card border border-border bg-surface p-3"
          [attr.aria-labelledby]="'cat-' + column.category"
        >
          <h3 [id]="'cat-' + column.category" class="font-display text-card font-bold text-fg">
            {{ 'context.categories.' + column.category | transloco }}
            <span class="ml-1 text-meta font-semibold text-fg-subtle">{{
              column.items.length
            }}</span>
          </h3>
          <p class="mb-2 text-meta text-fg-muted">
            {{ 'context.categoryHints.' + column.category | transloco }}
          </p>
          @if (column.items.length) {
            <ul class="flex flex-col gap-2">
              @for (item of column.items; track item.id ?? $index) {
                <li
                  class="rounded-tile border border-border bg-bg p-2.5"
                  [attr.data-testid]="'factor-' + (item.id ?? $index)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <span class="min-w-0 text-ui break-words text-fg">{{ item.text }}</span>
                    @let impact = impactOf(column.category, item);
                    <app-status-badge
                      class="flex-none"
                      [meaning]="impact.meaning"
                      [value]="impact.value"
                      [labelKey]="impact.labelKey"
                    />
                  </div>
                  @if (followUps(item).length) {
                    <ul
                      class="mt-2 flex flex-col gap-1"
                      [attr.aria-label]="'context.analysis.followUps' | transloco"
                    >
                      @for (ref of followUps(item); track ref.entity_type + ref.entity_id) {
                        <li class="flex min-w-0 items-center gap-1">
                          <span class="flex-none text-fg-subtle" aria-hidden="true">→</span>
                          <app-entity-chip [ref]="ref" class="min-w-0" />
                          @if (canWrite() && item.id) {
                            <button
                              type="button"
                              class="ml-auto flex h-6 w-6 flex-none items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                              [attr.aria-label]="
                                'context.analysis.removeFollowUp'
                                  | transloco: { name: ref.code || ref.title }
                              "
                              [disabled]="busy()"
                              (click)="remove(item, ref)"
                            >
                              <app-icon name="x" [size]="12" />
                            </button>
                          }
                        </li>
                      }
                    </ul>
                  } @else if (adverse(column.category)) {
                    <p class="mt-1.5 text-meta text-warn-ink">
                      {{ 'context.analysis.noFollowUp' | transloco }}
                    </p>
                  }
                  @if (canWrite() && item.id && targetsFor(column.category).length) {
                    <div class="mt-2">
                      <app-overflow-menu
                        labelKey="context.analysis.followUpMenu"
                        align="start"
                        [attr.data-testid]="'follow-up-' + item.id"
                      >
                        @for (target of targetsFor(column.category); track target) {
                          <button
                            appMenuItem
                            type="button"
                            [disabled]="busy()"
                            (click)="start(item, target)"
                          >
                            {{ 'context.analysis.followUp.' + target | transloco }}
                          </button>
                        }
                      </app-overflow-menu>
                    </div>
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
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly followUpService = inject(FactorFollowUps);

  readonly analysis = input.required<ContextAnalysis>();
  /** The user may add and remove follow-ups (`context:write`). */
  readonly canWrite = input(false);
  /** The analysis after a follow-up was removed. */
  readonly changed = output<ContextAnalysis>();

  protected readonly busy = signal(false);
  /** Flow keys the user can start from this analysis (module on + permission). */
  private readonly enabledFlows = signal<ReadonlySet<string>>(new Set());
  protected readonly columns = computed(() =>
    boardColumns(this.analysis().method, this.analysis().items),
  );

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.analysis().id;
      const canWrite = this.canWrite();
      untracked(() => this.loadFlows(orgId, id, canWrite));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected impactOf(category: string, item: AnalysisItem) {
    return impactBadge(category, item.impact);
  }

  protected adverse(category: string): boolean {
    return isAdverse(category);
  }

  protected followUps(item: AnalysisItem): readonly EntityRef[] {
    return item.follow_ups ?? [];
  }

  /** The follow-up targets of a category the user can actually start. */
  protected targetsFor(category: string): readonly FollowUpType[] {
    const enabled = this.enabledFlows();
    return factorTargets(category).filter((target) => enabled.has(factorFlowKey(target)));
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

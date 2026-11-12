import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Badge } from '../../../shared/ui/badge/badge';
import { AnalysisItem, AnalysisMethod } from '../data/context.models';
import { categoriesFor, levelTone } from '../context-kinds';

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

/** Read-only SWOT (2 x 2) or PESTLE (3 x 2) board of an analysis. */
@Component({
  selector: 'app-context-analysis-board',
  imports: [TranslocoPipe, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="grid grid-cols-1 gap-3 sm:grid-cols-2"
      [class.lg:grid-cols-3]="method() === 'pestle'"
      data-testid="analysis-board"
    >
      @for (column of columns(); track column.category) {
        <section
          class="rounded-card border border-border bg-surface p-3"
          [attr.aria-labelledby]="'cat-' + column.category"
        >
          <h3
            [id]="'cat-' + column.category"
            class="mb-0.5 font-display text-[14px] font-bold text-fg"
          >
            {{ 'context.categories.' + column.category | transloco }}
            <span class="ml-1 text-[12px] font-semibold text-fg-subtle">{{
              column.items.length
            }}</span>
          </h3>
          <p class="mb-2 text-[12px] text-fg-subtle">
            {{ 'context.categoryHints.' + column.category | transloco }}
          </p>
          @if (column.items.length) {
            <ul class="flex flex-col gap-1.5">
              @for (item of column.items; track $index) {
                <li class="flex items-start justify-between gap-2 text-[13px] text-fg">
                  <span class="min-w-0 break-words">{{ item.text }}</span>
                  <app-badge [tone]="levelTone(item.impact)" class="flex-none">
                    {{ 'context.levels.' + item.impact | transloco }}
                  </app-badge>
                </li>
              }
            </ul>
          } @else {
            <p class="text-[12.5px] text-fg-subtle">{{ 'context.analysis.noItems' | transloco }}</p>
          }
        </section>
      }
    </div>
  `,
})
export class AnalysisBoard {
  readonly method = input.required<AnalysisMethod>();
  readonly items = input.required<readonly AnalysisItem[]>();

  protected readonly columns = computed(() => boardColumns(this.method(), this.items()));
  protected readonly levelTone = levelTone;
}

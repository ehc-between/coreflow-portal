import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import { AnalysisMethod, LEVELS, Level } from '../data/context.models';
import { categoriesFor } from '../context-kinds';
import { DraftItem, localItemId } from './context-draft';

/** Items whose category isn't part of `method` (dropped when the method changes). */
export function itemsOutside(method: AnalysisMethod, items: readonly DraftItem[]): DraftItem[] {
  const allowed = new Set(categoriesFor(method));
  return items.filter((item) => !allowed.has(item.category));
}

/**
 * Editor for the factors of a SWOT / PESTLE analysis: one column per category,
 * each factor with its text and impact, plus "add factor".
 */
@Component({
  selector: 'app-context-analysis-items-editor',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="grid grid-cols-1 gap-3 md:grid-cols-2"
      [class.xl:grid-cols-3]="method() === 'pestle'"
    >
      @for (category of categories(); track category) {
        <fieldset class="rounded-card border border-border bg-surface p-3">
          <legend class="px-1 font-display text-[14px] font-bold text-fg">
            {{ 'context.categories.' + category | transloco }}
          </legend>
          <p class="mb-2 text-[12px] text-fg-subtle">
            {{ 'context.categoryHints.' + category | transloco }}
          </p>
          <ul class="flex flex-col gap-2">
            @for (item of itemsOf(category); track item.id) {
              <li class="flex flex-col gap-1.5 rounded-tile border border-border p-2">
                <label class="sr-only" [attr.for]="'item-' + item.id">
                  {{
                    'context.analysis.factorLabel'
                      | transloco: { category: ('context.categories.' + category | transloco) }
                  }}
                </label>
                <textarea
                  [id]="'item-' + item.id"
                  rows="2"
                  maxlength="2000"
                  class="w-full rounded-[8px] border border-border bg-bg px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
                  [value]="item.text"
                  (input)="patch(item.id, { text: $any($event.target).value })"
                ></textarea>
                <div class="flex items-center justify-between gap-2">
                  <label class="flex items-center gap-1.5 text-[12px] text-fg-muted">
                    {{ 'context.fields.impact' | transloco }}
                    <select
                      class="h-7 rounded-[8px] border border-border bg-bg px-1.5 text-[12px] text-fg"
                      (change)="patch(item.id, { impact: $any($event.target).value })"
                    >
                      @for (level of levels; track level) {
                        <option [value]="level" [selected]="level === item.impact">
                          {{ 'context.levels.' + level | transloco }}
                        </option>
                      }
                    </select>
                  </label>
                  <button
                    type="button"
                    class="rounded-[6px] p-1 text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [attr.aria-label]="'context.analysis.removeFactor' | transloco"
                    (click)="remove(item.id)"
                  >
                    <app-icon name="trash" [size]="14" />
                  </button>
                </div>
              </li>
            }
          </ul>
          <button
            type="button"
            class="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            (click)="add(category)"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'context.analysis.addFactor' | transloco }}
          </button>
        </fieldset>
      }
    </div>
  `,
})
export class AnalysisItemsEditor {
  readonly method = input.required<AnalysisMethod>();
  readonly items = input.required<readonly DraftItem[]>();
  readonly itemsChange = output<readonly DraftItem[]>();

  protected readonly levels = LEVELS;
  protected readonly categories = computed(() => categoriesFor(this.method()));

  protected itemsOf(category: string): readonly DraftItem[] {
    return this.items().filter((item) => item.category === category);
  }

  protected add(category: string): void {
    this.itemsChange.emit([
      ...this.items(),
      { id: localItemId(), category, text: '', impact: 'medium' as Level },
    ]);
  }

  protected patch(id: string, change: Partial<DraftItem>): void {
    this.itemsChange.emit(
      this.items().map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }

  protected remove(id: string): void {
    this.itemsChange.emit(this.items().filter((item) => item.id !== id));
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import { AnalysisMethod, LEVELS, Level } from '../data/context.models';
import { categoriesFor, isAdverse, isInternal } from '../context-kinds';
import { DraftItem, localItemId } from './context-draft';

/** Items whose category isn't part of `method` (dropped when the method changes). */
export function itemsOutside(method: AnalysisMethod, items: readonly DraftItem[]): DraftItem[] {
  const allowed = new Set(categoriesFor(method));
  return items.filter((item) => !allowed.has(item.category));
}

/** Significance pill per level (same tones as the detail board's badges). */
const LEVEL_TONE: Readonly<Record<Level, string>> = {
  low: 'border-border bg-surface-2 text-fg-muted',
  medium: 'border-transparent bg-info-soft text-info-ink',
  high: 'border-accent-border bg-accent-soft text-accent',
};
const LEVEL_TEXT: Readonly<Record<Level, string>> = {
  low: 'text-fg-muted',
  medium: 'text-info-ink',
  high: 'text-accent',
};

/**
 * Editor for the factors of a SWOT / PESTLE analysis, laid out like the detail board:
 * one panel per category (coloured top edge, count, "Internt · Hjelper" tag, hint) and
 * the factors as compact rows: an auto-growing text field, a colour-coded Lav / Middels /
 * Høy significance pill and a remove button that appears on hover / focus (always on touch).
 * Enter in a row adds the next one; "+ Legg til …" adds a row and focuses it.
 */
@Component({
  selector: 'app-context-analysis-items-editor',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="grid grid-cols-1 gap-4 md:grid-cols-2"
      [class.xl:grid-cols-3]="method() === 'pestle'"
      data-testid="analysis-items-editor"
    >
      @for (category of categories(); track category) {
        @let swot = method() === 'swot';
        @let harmful = swot && adverse(category);
        @let list = itemsOf(category);
        <section
          class="flex flex-col rounded-card border border-t-4 border-border bg-surface p-4"
          [class.border-t-info]="swot && !harmful"
          [class.border-t-warn]="harmful"
          [class.border-t-border-strong]="!swot"
          [attr.aria-labelledby]="'edit-cat-' + category"
          [attr.data-testid]="'edit-quadrant-' + category"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3
              [id]="'edit-cat-' + category"
              class="flex items-baseline gap-2 font-display text-card font-bold text-fg"
            >
              {{ 'context.categories.' + category | transloco }}
              <span
                class="rounded-full bg-surface-2 px-2 text-meta font-semibold text-fg-muted"
                [attr.aria-label]="
                  'context.analysis.factorCount' | transloco: { count: list.length }
                "
                >{{ list.length }}</span
              >
            </h3>
            @if (swot) {
              <span class="text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase">
                {{
                  'context.analysis.quadrant.' + (internal(category) ? 'internal' : 'external')
                    | transloco
                }}
                ·
                {{ 'context.analysis.quadrant.' + (harmful ? 'harmful' : 'helpful') | transloco }}
              </span>
            }
          </div>
          <p class="mt-0.5 mb-2 text-meta text-fg-subtle">
            {{
              (swot ? 'context.analysis.quadrantHints.' : 'context.categoryHints.') + category
                | transloco
            }}
          </p>

          @if (list.length) {
            <ul class="-mx-1.5 flex flex-col">
              @for (item of list; track item.id) {
                <li
                  class="group flex items-start gap-1.5 rounded-lg px-1.5 py-1 focus-within:bg-surface-2 hover:bg-surface-2"
                  [attr.data-testid]="'edit-factor-' + item.id"
                >
                  <label class="sr-only" [attr.for]="'item-' + item.id">
                    {{
                      'context.analysis.factorLabel'
                        | transloco: { category: ('context.categories.' + category | transloco) }
                    }}
                  </label>
                  <textarea
                    [id]="'item-' + item.id"
                    rows="1"
                    maxlength="2000"
                    class="min-h-8 min-w-0 flex-1 resize-none [field-sizing:content] rounded-md border border-transparent bg-transparent px-2 py-1 text-ui text-fg outline-none placeholder:text-fg-subtle hover:border-border focus:border-accent focus:bg-surface"
                    [placeholder]="'context.analysis.factorPlaceholder' | transloco"
                    [value]="item.text"
                    (input)="onInput($event, item.id)"
                    (keydown.enter)="onEnter($event, item)"
                  ></textarea>
                  <span class="relative mt-1 flex flex-none">
                    <select
                      class="cursor-pointer appearance-none rounded-full border py-0.5 pr-6 pl-2.5 text-micro font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      [class]="levelTone[item.impact]"
                      [attr.aria-label]="'context.fields.impact' | transloco"
                      [title]="'context.analysis.impact.' + item.impact | transloco"
                      data-testid="impact-select"
                      (change)="patch(item.id, { impact: $any($event.target).value })"
                    >
                      @for (level of levels; track level) {
                        <option [value]="level" [selected]="level === item.impact">
                          {{ 'context.levels.' + level | transloco }}
                        </option>
                      }
                    </select>
                    <app-icon
                      class="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2"
                      [class]="levelText[item.impact]"
                      name="chevron"
                      [size]="12"
                    />
                  </span>
                  <button
                    type="button"
                    class="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-md text-fg-subtle opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fail focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [@media(hover:none)]:opacity-100"
                    [attr.aria-label]="'context.analysis.removeFactor' | transloco"
                    [title]="'context.analysis.removeFactor' | transloco"
                    (click)="remove(item.id)"
                  >
                    <app-icon name="trash" [size]="14" />
                  </button>
                </li>
              }
            </ul>
          }

          <button
            type="button"
            class="mt-1.5 inline-flex items-center gap-1 self-start rounded-md px-0.5 text-meta font-semibold text-fg-muted hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.data-testid]="'add-factor-' + category"
            (click)="add(category)"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'context.analysis.addTo.' + category | transloco }}
          </button>
        </section>
      }
    </div>
  `,
})
export class AnalysisItemsEditor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly method = input.required<AnalysisMethod>();
  readonly items = input.required<readonly DraftItem[]>();
  readonly itemsChange = output<readonly DraftItem[]>();

  protected readonly levels = LEVELS;
  protected readonly levelTone = LEVEL_TONE;
  protected readonly levelText = LEVEL_TEXT;
  protected readonly categories = computed(() => categoriesFor(this.method()));

  protected itemsOf(category: string): readonly DraftItem[] {
    return this.items().filter((item) => item.category === category);
  }

  protected adverse(category: string): boolean {
    return isAdverse(category);
  }

  protected internal(category: string): boolean {
    return isInternal(category);
  }

  /** Add an empty factor to `category` (after `afterId` when given) and focus it. */
  protected add(category: string, afterId?: string): void {
    const fresh: DraftItem = { id: localItemId(), category, text: '', impact: 'medium' as Level };
    const items = [...this.items()];
    const at = afterId ? items.findIndex((item) => item.id === afterId) : -1;
    items.splice(at === -1 ? items.length : at + 1, 0, fresh);
    this.itemsChange.emit(items);
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLTextAreaElement>(`#item-${fresh.id}`)?.focus(),
      { injector: this.injector },
    );
  }

  protected onInput(event: Event, id: string): void {
    const field = event.target as HTMLTextAreaElement;
    autoGrow(field);
    this.patch(id, { text: field.value });
  }

  /** Enter adds the next factor (Shift+Enter keeps a line break). */
  protected onEnter(event: Event, item: DraftItem): void {
    const key = event as KeyboardEvent;
    if (key.shiftKey || key.isComposing) {
      return;
    }
    event.preventDefault();
    this.add(item.category, item.id);
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

/** Fallback for browsers without `field-sizing: content`: fit the height to the text. */
function autoGrow(field: HTMLTextAreaElement): void {
  if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) {
    return;
  }
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

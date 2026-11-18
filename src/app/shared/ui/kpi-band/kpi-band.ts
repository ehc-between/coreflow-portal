import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterEveryRender,
  effect,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../icon/icon';

/** At most this many key-figure tiles show before "Vis alle" (U30). */
export const KPI_BAND_MAX = 4;

const STORAGE_PREFIX = 'coreflow.kpis.';
let nextId = 0;

/**
 * The key figures ("Nøkkeltall") band above a list or on a module overview: a
 * collapsible row of at most {@link KPI_BAND_MAX} tiles. Further tiles hide behind
 * "Vis alle (N)", so put the most useful first. With a `scope`, the collapsed state
 * is remembered per page in localStorage (`coreflow.kpis.<scope>`).
 *
 * A tile item is each projected element that is or contains an `app-kpi-tile`
 * (a link or button around the tile counts as one); `display: contents` wrappers
 * (`class="contents"`) are looked through. Other projected content (a planning card)
 * always shows and is not counted.
 *
 *   <app-kpi-band scope="risk.list">
 *     <a routerLink="/risk/risks" [queryParams]="{ level: 'high' }"><app-kpi-tile … /></a>
 *   </app-kpi-band>
 */
@Component({
  selector: 'app-kpi-band',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '[class.hidden]': '!hasContent()' },
  template: `
    <section class="mb-5" data-testid="kpi-band">
      @if (tileCount() > 0) {
        <div class="mb-2 flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md text-meta font-semibold text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
            [attr.aria-expanded]="!collapsed()"
            [attr.aria-controls]="gridId"
            (click)="toggle()"
            data-testid="kpi-band-toggle"
          >
            <app-icon
              name="chevron"
              [size]="14"
              class="transition-transform"
              [class.-rotate-90]="collapsed()"
            />
            {{ 'ui.kpiBand.title' | transloco }}
            @if (collapsed()) {
              <span class="font-normal">({{ tileCount() }})</span>
            }
          </button>
          @if (!collapsed() && tileCount() > max()) {
            <button
              type="button"
              class="ml-auto rounded-md text-meta font-semibold text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
              [attr.aria-expanded]="showAll()"
              [attr.aria-controls]="gridId"
              (click)="showAll.set(!showAll())"
              data-testid="kpi-band-all"
            >
              {{
                (showAll() ? 'ui.kpiBand.showFewer' : 'ui.kpiBand.showAll')
                  | transloco: { count: tileCount() }
              }}
            </button>
          }
        </div>
      }
      <div
        #grid
        [id]="gridId"
        [hidden]="collapsed()"
        role="group"
        [attr.aria-label]="'ui.list.kpis' | transloco"
        class="grid grid-cols-2 gap-3 lg:grid-cols-4 [&_[data-kpi-extra]]:hidden!"
      >
        <ng-content />
      </div>
    </section>
  `,
})
export class KpiBand {
  /** Remembers the collapsed state per page, e.g. `risk.list`. */
  readonly scope = input<string | null>(null);
  readonly max = input(KPI_BAND_MAX);

  private readonly grid = viewChild.required<ElementRef<HTMLElement>>('grid');
  protected readonly gridId = `cf-kpi-band-${++nextId}`;
  protected readonly collapsed = signal(false);
  protected readonly showAll = signal(false);
  protected readonly tileCount = signal(0);
  protected readonly hasContent = signal(false);

  constructor() {
    effect(() => {
      const scope = this.scope();
      untracked(() => this.collapsed.set(!!scope && readCollapsed(scope)));
    });
    afterEveryRender(() => this.sync());
  }

  protected toggle(): void {
    const collapsed = !this.collapsed();
    this.collapsed.set(collapsed);
    const scope = this.scope();
    if (scope) {
      writeCollapsed(scope, collapsed);
    }
  }

  /** Count the tiles and mark those past `max` (unless "Vis alle" is on). */
  private sync(): void {
    const grid = this.grid().nativeElement;
    const tiles = tileItems(grid);
    const limit = this.showAll() ? Infinity : this.max();
    tiles.forEach((el, index) => el.toggleAttribute('data-kpi-extra', index >= limit));
    if (tiles.length !== this.tileCount()) {
      this.tileCount.set(tiles.length);
    }
    const hasContent = hasRealContent(grid);
    if (hasContent !== this.hasContent()) {
      this.hasContent.set(hasContent);
    }
  }
}

function isContents(el: Element): boolean {
  return (
    el.classList.contains('contents') ||
    (typeof getComputedStyle === 'function' && getComputedStyle(el).display === 'contents')
  );
}

/** Whether anything but empty `display: contents` wrappers is projected. */
function hasRealContent(root: Element): boolean {
  return Array.from(root.children).some((child) => !isContents(child) || hasRealContent(child));
}

/** The grid items that hold a KPI tile, looking through `display: contents` wrappers. */
function tileItems(root: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (child.tagName !== 'APP-KPI-TILE' && isContents(child)) {
      out.push(...tileItems(child));
    } else if (child.tagName === 'APP-KPI-TILE' || child.querySelector('app-kpi-tile')) {
      out.push(child);
    }
  }
  return out;
}

function readCollapsed(scope: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + scope) === 'collapsed';
  } catch {
    return false;
  }
}

function writeCollapsed(scope: string, collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(STORAGE_PREFIX + scope, 'collapsed');
    } else {
      localStorage.removeItem(STORAGE_PREFIX + scope);
    }
  } catch {
    // Storage unavailable (private mode): the state just is not remembered.
  }
}

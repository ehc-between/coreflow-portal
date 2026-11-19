import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { IsActiveMatchOptions, Router, RouterLink, isActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** One sub-page of a module. `count` shows a small number after the label. */
export interface ModuleNavItem {
  readonly labelKey: string;
  readonly link: string | readonly unknown[];
  /** Only active on an exact URL match (use for the module root). */
  readonly exact?: boolean;
  readonly count?: number | null;
  readonly testId?: string;
  /**
   * The sub-page has no records at all. Beginners do not see empty tabs (U30); the
   * tab still shows while it is the current page. Leave unset when unknown.
   */
  readonly empty?: boolean | null;
}

const EXACT: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};
const SUBSET: IsActiveMatchOptions = { ...EXACT, paths: 'subset' };

/**
 * The module's sub-navigation, directly under the page header: underline tabs.
 * Replaces the per-module `*-nav` / `*-tabs` components.
 *
 * Every main page of the module is a visible tab, in the given order (overview first,
 * then the main registers). Pages are never hidden behind a "Mer" menu: when the row
 * does not fit (phones, narrow windows) it scrolls sideways with fade hints at the
 * edges, and the current tab is scrolled into view. Items marked `empty` are hidden
 * for beginners (unless current).
 *
 *   <app-module-nav labelKey="modules.names.risk" [items]="[
 *     { labelKey: 'risk.nav.register', link: '/risk', exact: true },
 *     { labelKey: 'risk.nav.soa', link: '/risk/soa' },
 *   ]" />
 */
@Component({
  selector: 'app-module-nav',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative mb-5 block' },
  template: `
    <nav
      [attr.aria-label]="labelKey() || 'ui.moduleNav.label' | transloco"
      class="relative border-b border-border"
    >
      <ul
        #scroller
        class="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        (scroll)="updateFades()"
      >
        @for (entry of visible(); track $index) {
          <li class="flex-none">
            <a
              [routerLink]="entry.item.link"
              [attr.aria-current]="entry.active ? 'page' : null"
              [attr.data-testid]="entry.item.testId || null"
              class="-mb-px flex min-h-10 items-center gap-1.5 border-b-2 px-3 py-2 text-ui font-semibold whitespace-nowrap outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              [class]="entry.active ? 'border-accent text-fg' : 'border-transparent text-fg-muted'"
            >
              {{ entry.item.labelKey | transloco }}
              @if (entry.item.count !== null && entry.item.count !== undefined) {
                <span
                  class="rounded-full bg-surface-2 px-1.5 py-px text-micro font-semibold text-fg-muted"
                  >{{ entry.item.count }}</span
                >
              }
            </a>
          </li>
        }
      </ul>
      @if (fadeStart()) {
        <span
          aria-hidden="true"
          data-testid="module-nav-fade-start"
          class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-bg to-transparent"
        ></span>
      }
      @if (fadeEnd()) {
        <span
          aria-hidden="true"
          data-testid="module-nav-fade-end"
          class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg to-transparent"
        ></span>
      }
    </nav>
  `,
})
export class ModuleNav {
  private readonly router = inject(Router);

  readonly items = input.required<readonly ModuleNavItem[]>();
  /** i18n key of the nav's accessible name (usually the module name). */
  readonly labelKey = input<string | null>(null);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  protected readonly fadeStart = signal(false);
  protected readonly fadeEnd = signal(false);

  /**
   * Every tab, in order: all of them are always shown — no "Mer" menu, and empty
   * registers are NOT hidden (not even for beginners): a new organisation needs
   * exactly those pages to get started.
   */
  protected readonly visible = computed(() =>
    this.items().map((item) => ({ item, active: this.isCurrent(item) })),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.scroller().nativeElement;
      this.scrollActiveIntoView();
      this.updateFades();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => this.updateFades());
        observer.observe(el);
        destroyRef.onDestroy(() => observer.disconnect());
      }
    });
  }

  private isCurrent(item: ModuleNavItem): boolean {
    const link = item.link;
    const tree =
      typeof link === 'string'
        ? this.router.parseUrl(link)
        : this.router.createUrlTree(link as unknown[]);
    return isActive(tree, this.router, item.exact ? EXACT : SUBSET)();
  }

  /** Scroll only the tab row (not the page) so the current tab is fully visible. */
  private scrollActiveIntoView(): void {
    const el = this.scroller().nativeElement;
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active || el.scrollWidth <= el.clientWidth) {
      return;
    }
    const left = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
    el.scrollLeft = Math.max(0, left);
  }

  protected updateFades(): void {
    const el = this.scroller().nativeElement;
    const max = el.scrollWidth - el.clientWidth;
    this.fadeStart.set(el.scrollLeft > 2);
    this.fadeEnd.set(max - el.scrollLeft > 2);
  }
}

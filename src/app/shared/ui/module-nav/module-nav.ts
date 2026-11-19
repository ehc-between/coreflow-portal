import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { IsActiveMatchOptions, Router, RouterLink, isActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import { Icon } from '../icon/icon';

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

/** At most this many tabs are visible; the rest sit under "Mer" (U30). */
export const MODULE_NAV_MAX_VISIBLE = 4;

let nextId = 0;

const EXACT: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};
const SUBSET: IsActiveMatchOptions = { ...EXACT, paths: 'subset' };

/**
 * The module's sub-navigation, directly under the page header: underline tabs that
 * scroll sideways on small screens, with fade hints when there is more to scroll.
 * Replaces the per-module `*-nav` / `*-tabs` components.
 *
 * At most {@link MODULE_NAV_MAX_VISIBLE} work tabs are shown, in the given order; the
 * rest sit under a "Mer" menu, whose button shows the current page's name when that
 * page is one of them. Put the daily work first. Items marked `empty` are hidden for
 * beginners (unless current).
 *
 *   <app-module-nav labelKey="modules.names.risk" [items]="[
 *     { labelKey: 'risk.nav.register', link: '/risk', exact: true },
 *     { labelKey: 'risk.nav.soa', link: '/risk/soa' },
 *   ]" />
 */
@Component({
  selector: 'app-module-nav',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative mb-5 block',
    '(document:keydown.escape)': 'moreOpen.set(false)',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <nav
      [attr.aria-label]="labelKey() || 'ui.moduleNav.label' | transloco"
      class="relative flex items-stretch border-b border-border"
    >
      <div class="relative min-w-0 flex-1">
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
                [class]="
                  entry.active ? 'border-accent text-fg' : 'border-transparent text-fg-muted'
                "
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
      </div>

      @if (overflow().length > 0) {
        <div class="relative flex-none" #moreHost>
          <button
            type="button"
            class="-mb-px flex h-full min-h-10 max-w-[14rem] items-center gap-1 border-b-2 px-3 py-2 text-ui font-semibold whitespace-nowrap outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            [class]="
              activeOverflow() ? 'border-accent text-fg' : 'border-transparent text-fg-muted'
            "
            [attr.aria-expanded]="moreOpen()"
            [attr.aria-controls]="moreId"
            [attr.aria-label]="
              activeOverflow()
                ? ('ui.moduleNav.moreCurrent'
                  | transloco: { name: (activeOverflow()!.labelKey | transloco) })
                : null
            "
            (click)="moreOpen.set(!moreOpen())"
            data-testid="module-nav-more"
          >
            <span class="truncate">{{
              activeOverflow()?.labelKey ?? 'ui.moduleNav.more' | transloco
            }}</span>
            <app-icon
              name="chevron"
              [size]="14"
              class="flex-none transition-transform"
              [class.rotate-180]="moreOpen()"
            />
          </button>
          <ul
            [id]="moreId"
            [hidden]="!moreOpen()"
            class="absolute top-full right-0 z-30 mt-1 flex min-w-[220px] flex-col rounded-card border border-border bg-surface p-1.5 shadow-pop"
            data-testid="module-nav-more-menu"
          >
            @for (entry of overflow(); track $index) {
              <li>
                <a
                  [routerLink]="entry.item.link"
                  [attr.aria-current]="entry.active ? 'page' : null"
                  [attr.data-testid]="entry.item.testId || null"
                  (click)="moreOpen.set(false)"
                  class="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-ui font-medium outline-none hover:bg-surface-2 focus-visible:bg-surface-2"
                  [class]="entry.active ? 'bg-surface-2 text-fg' : 'text-fg-muted'"
                >
                  <span class="flex-1">{{ entry.item.labelKey | transloco }}</span>
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
        </div>
      }
    </nav>
  `,
})
export class ModuleNav {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  readonly items = input.required<readonly ModuleNavItem[]>();
  /** i18n key of the nav's accessible name (usually the module name). */
  readonly labelKey = input<string | null>(null);
  /** How many tabs are visible before "Mer" (default {@link MODULE_NAV_MAX_VISIBLE}). */
  readonly maxVisible = input(MODULE_NAV_MAX_VISIBLE);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly moreHost = viewChild<ElementRef<HTMLElement>>('moreHost');
  protected readonly fadeStart = signal(false);
  protected readonly fadeEnd = signal(false);
  protected readonly moreOpen = signal(false);
  protected readonly moreId = `cf-module-nav-more-${++nextId}`;

  /** Whether empty tabs are hidden: only for beginners, and only if a tab says it is empty. */
  private readonly hideEmpty = computed(() => {
    if (!this.items().some((item) => item.empty)) {
      return false;
    }
    // Resolved lazily so modules that never mark tabs empty do not load guidance.
    const guidance = untracked(() => this.injector.get(GuidanceService, null));
    return guidance?.isBeginner() ?? false;
  });

  private readonly entries = computed(() => {
    const hideEmpty = this.hideEmpty();
    return this.items()
      .map((item) => ({ item, active: this.isCurrent(item) }))
      .filter((entry) => !hideEmpty || !entry.item.empty || entry.active);
  });

  protected readonly visible = computed(() => {
    const all = this.entries();
    return all.length > this.maxVisible() ? all.slice(0, this.maxVisible()) : all;
  });
  protected readonly overflow = computed(() => {
    const all = this.entries();
    return all.length > this.maxVisible() ? all.slice(this.maxVisible()) : [];
  });
  protected readonly activeOverflow = computed(
    () => this.overflow().find((entry) => entry.active)?.item ?? null,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.scroller().nativeElement;
      // Bring the active tab into view on phones.
      el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({
        block: 'nearest',
        inline: 'center',
      });
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

  protected onDocumentClick(event: MouseEvent): void {
    const host = this.moreHost()?.nativeElement;
    if (this.moreOpen() && host && !host.contains(event.target as Node)) {
      this.moreOpen.set(false);
    }
  }

  protected updateFades(): void {
    const el = this.scroller().nativeElement;
    const max = el.scrollWidth - el.clientWidth;
    this.fadeStart.set(el.scrollLeft > 2);
    this.fadeEnd.set(max - el.scrollLeft > 2);
  }
}

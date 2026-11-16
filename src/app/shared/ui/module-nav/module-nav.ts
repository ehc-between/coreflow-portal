import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** One sub-page of a module. `count` shows a small number after the label. */
export interface ModuleNavItem {
  readonly labelKey: string;
  readonly link: string | readonly unknown[];
  /** Only active on an exact URL match (use for the module root). */
  readonly exact?: boolean;
  readonly count?: number | null;
  readonly testId?: string;
}

/**
 * The module's sub-navigation, directly under the page header: underline tabs that
 * scroll sideways on small screens, with fade hints when there is more to scroll.
 * Replaces the per-module `*-nav` / `*-tabs` components.
 *
 *   <app-module-nav labelKey="modules.names.risk" [items]="[
 *     { labelKey: 'risk.nav.register', link: '/risk', exact: true },
 *     { labelKey: 'risk.nav.soa', link: '/risk/soa' },
 *   ]" />
 */
@Component({
  selector: 'app-module-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative mb-5 block' },
  template: `
    <nav [attr.aria-label]="labelKey() || 'ui.moduleNav.label' | transloco" class="relative">
      <ul
        #scroller
        class="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        (scroll)="updateFades()"
      >
        @for (item of items(); track $index) {
          <li class="flex-none">
            <a
              [routerLink]="item.link"
              routerLinkActive="!border-accent !text-fg"
              [routerLinkActiveOptions]="{ exact: !!item.exact }"
              ariaCurrentWhenActive="page"
              [attr.data-testid]="item.testId || null"
              class="-mb-px flex min-h-10 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-ui font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            >
              {{ item.labelKey | transloco }}
              @if (item.count !== null && item.count !== undefined) {
                <span
                  class="rounded-full bg-surface-2 px-1.5 py-px text-micro font-semibold text-fg-muted"
                  >{{ item.count }}</span
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
  readonly items = input.required<readonly ModuleNavItem[]>();
  /** i18n key of the nav's accessible name (usually the module name). */
  readonly labelKey = input<string | null>(null);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  protected readonly fadeStart = signal(false);
  protected readonly fadeEnd = signal(false);

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

  protected updateFades(): void {
    const el = this.scroller().nativeElement;
    const max = el.scrollWidth - el.clientWidth;
    this.fadeStart.set(el.scrollLeft > 2);
    this.fadeEnd.set(max - el.scrollLeft > 2);
  }
}

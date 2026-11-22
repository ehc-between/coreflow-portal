import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, UrlTree } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Icon } from '../../shared/ui/icon/icon';
import { AREAS, AreaDef, AreaKey, activeAreaKey, visibleAreas } from '../areas';
import { HandbookMenu } from './handbook-menu';

/** One row of an open dropdown: a translated item or a process (plain title). */
export interface DropdownRow {
  readonly key: string;
  readonly link: UrlTree;
  readonly labelKey?: string;
  readonly label?: string;
  readonly hintKey: string;
}

/** Delay before a hover-opened dropdown closes once the pointer leaves (prototype: 180 ms). */
const HOVER_CLOSE_MS = 180;
/** A click on ▾ this soon after hover opened the dropdown is the same intent: keep it open. */
const HOVER_GRACE_MS = 600;
/** Gap between the menu item and its dropdown, and the viewport margin. */
const GAP = 6;
const MARGIN = 16;
/** Below this width the area row collapses into the "Meny" button and its panel. */
const PANEL_MAX_WIDTH = 1180;

/**
 * The top menu (IA v2 §4.6, the approved prototype): nine areas in one horizontally
 * scrolling row. Clicking a label opens the area's overview; the ▾ button (click, tap,
 * Enter, Space, ArrowDown — and hover with a fine pointer) opens its dropdown, whose
 * rows go straight to the sub-areas, ending with "Se hele oversikten →". The dropdown
 * is fixed under its item and clamped to the viewport, so it works at every width.
 * Escape closes it and returns focus to ▾; arrow keys move between rows; scrolling the
 * row, resizing or clicking outside closes it. The current area is highlighted and
 * scrolled into view.
 */
@Component({
  selector: 'app-top-menu',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '(document:click)': 'onDocumentClick($event)',
    '(window:resize)': 'onResize()',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <button
      type="button"
      id="menu-panel-btn"
      data-testid="menu-panel-button"
      aria-haspopup="true"
      [attr.aria-expanded]="panelOpen()"
      [attr.aria-controls]="panelOpen() ? 'menu-panel' : null"
      [attr.aria-label]="'nav.areas.menu' | transloco"
      class="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-ui font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none min-[1180px]:hidden"
      [class]="
        panelOpen() ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
      "
      (click)="togglePanel($event)"
    >
      <app-icon [name]="panelOpen() ? 'x' : 'menu'" [size]="18" />
      <span class="hidden sm:inline">{{ 'nav.areas.menu' | transloco }}</span>
    </button>

    @if (panelOpen()) {
      <div
        class="fixed inset-x-0 bottom-0 z-30 bg-black/30 min-[1180px]:hidden"
        [style.top.px]="panelTop()"
        aria-hidden="true"
        data-testid="menu-panel-backdrop"
      ></div>
      <nav
        id="menu-panel"
        data-testid="menu-panel"
        [attr.aria-label]="'nav.areas.mainMenu' | transloco"
        class="fixed inset-x-0 z-40 overflow-y-auto border-t border-border bg-surface shadow-pop min-[1180px]:hidden"
        [style.top.px]="panelTop()"
        [style.max-height]="'calc(100dvh - ' + panelTop() + 'px)'"
      >
        <div
          class="mx-auto max-w-[1240px] columns-1 gap-x-6 px-[max(16px,env(safe-area-inset-left))] pt-4 pb-2 sm:columns-2 md:columns-3"
        >
          @for (group of panelGroups(); track group.area.key) {
            @let on = active() === group.area.key;
            <section
              class="mb-5 break-inside-avoid"
              [attr.data-testid]="'panel-area-' + group.area.key"
            >
              <a
                [routerLink]="group.area.path"
                [attr.aria-current]="on ? 'page' : null"
                data-panel-item
                class="flex items-center gap-1 rounded-lg px-2 py-1.5 font-display text-body font-bold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [class]="on ? 'bg-accent-soft text-accent' : 'text-fg hover:bg-surface-2'"
                (click)="closePanel(false)"
                >{{ group.area.labelKey | transloco }}</a
              >
              @if (group.rows.length) {
                <ul class="mt-0.5 flex flex-col">
                  @for (row of group.rows; track row.key) {
                    <li>
                      <a
                        [routerLink]="row.link"
                        data-panel-item
                        [attr.data-testid]="'panel-' + group.area.key + '-' + row.key"
                        class="block rounded-lg px-2 py-1.5 text-ui text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        (click)="closePanel(false)"
                        >{{ row.labelKey ? (row.labelKey | transloco) : row.label }}</a
                      >
                    </li>
                  }
                </ul>
              }
            </section>
          }
        </div>
      </nav>
    }

    <nav
      #row
      data-testid="top-menu"
      [attr.aria-label]="'nav.areas.mainMenu' | transloco"
      class="hidden min-w-0 gap-px overflow-x-auto [scrollbar-width:none] min-[1180px]:flex [&::-webkit-scrollbar]:hidden"
      (scroll)="close(false)"
    >
      @for (area of areas(); track area.key) {
        @let on = active() === area.key;
        @let isOpen = openKey() === area.key;
        <div
          class="flex flex-none items-center rounded-lg"
          [class]="on ? 'bg-accent-soft' : isOpen ? 'bg-surface-2' : 'hover:bg-surface-2'"
          [attr.data-area]="area.key"
          (mouseenter)="onHover(area)"
          (mouseleave)="scheduleClose()"
        >
          <a
            [routerLink]="area.path"
            [attr.aria-current]="on ? 'page' : null"
            [attr.data-testid]="'area-' + area.key"
            class="inline-flex items-center rounded-lg py-2 text-ui font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [class]="
              (area.items.length || area.dynamicItems ? 'rounded-r-none pr-0.5 pl-2' : 'px-2') +
              (on ? ' text-accent' : isOpen ? ' text-fg' : ' text-fg-muted hover:text-fg')
            "
            (click)="close(false)"
            >{{ area.labelKey | transloco }}</a
          >
          @if (area.items.length || area.dynamicItems) {
            <button
              type="button"
              [id]="'dd-btn-' + area.key"
              [attr.data-testid]="'area-toggle-' + area.key"
              aria-haspopup="menu"
              [attr.aria-expanded]="isOpen"
              [attr.aria-controls]="isOpen ? 'area-dropdown' : null"
              [attr.aria-label]="
                'nav.areas.openMenu' | transloco: { area: (area.labelKey | transloco) }
              "
              class="grid place-items-center rounded-lg rounded-l-none py-2 pr-1.5 pl-0.5 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [class]="on ? 'text-accent' : 'text-fg-muted hover:text-fg'"
              (click)="onToggleClick($event, area)"
              (keydown)="onToggleKeydown($event, area)"
            >
              <span
                class="flex transition-transform duration-150 motion-reduce:transition-none"
                [class.rotate-180]="isOpen"
                ><app-icon name="chevron" [size]="14"
              /></span>
            </button>
          }
        </div>
      }
    </nav>

    @if (openArea(); as area) {
      <div
        #dropdown
        id="area-dropdown"
        role="menu"
        tabindex="-1"
        data-testid="area-dropdown"
        [attr.aria-labelledby]="'dd-btn-' + area.key"
        class="fixed z-40 max-h-[calc(100vh-120px)] w-max max-w-[calc(100vw-32px)] min-w-[260px] overflow-y-auto rounded-card border border-border bg-surface p-1.5 shadow-pop"
        [style.top.px]="pos().top"
        [style.left.px]="pos().left"
        [style.visibility]="pos().measured ? 'visible' : 'hidden'"
        (mouseenter)="cancelClose()"
        (mouseleave)="scheduleClose()"
        (keydown)="onMenuKeydown($event)"
      >
        @for (row of rows(); track row.key) {
          <a
            role="menuitem"
            tabindex="-1"
            data-dd-item
            [attr.data-testid]="'dd-' + area.key + '-' + row.key"
            [routerLink]="row.link"
            (click)="close(false)"
            class="flex flex-col rounded-lg px-2.5 py-2 text-fg hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
          >
            <span class="text-ui font-medium">{{
              row.labelKey ? (row.labelKey | transloco) : row.label
            }}</span>
            <span class="text-meta text-fg-muted">{{ row.hintKey | transloco }}</span>
          </a>
        }
        <a
          role="menuitem"
          tabindex="-1"
          data-dd-item
          [attr.data-testid]="'dd-' + area.key + '-all'"
          [routerLink]="area.path"
          (click)="close(false)"
          class="mt-1 flex rounded-lg border-t border-border px-2.5 pt-2.5 pb-2 text-ui font-medium text-accent hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
          >{{ 'nav.areas.seeAll' | transloco }}</a
        >
      </div>
    }
  `,
})
export class TopMenu {
  private readonly router = inject(Router);
  private readonly modules = inject(ModuleService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly auth = inject(AuthService);
  private readonly handbook = inject(HandbookMenu);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  /** Hover opens dropdowns only with a mouse-like pointer (touch taps the ▾ instead). */
  private readonly finePointer =
    typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  /** When hover last opened a dropdown: a click on ▾ right after keeps it open instead of closing it. */
  private hoverOpenedAt = 0;

  protected readonly areas = computed(() =>
    visibleAreas(AREAS, {
      isEnabled: (m) => this.modules.isEnabled(m),
      permissions: this.selectedOrg.currentOrg()?.permissions ?? [],
      superuser: this.auth.isSuperuser(),
    }),
  );

  protected readonly active = signal<AreaKey | null>(activeAreaKey(this.router.url));
  protected readonly openKey = signal<AreaKey | null>(null);
  protected readonly openArea = computed(
    () => this.areas().find((a) => a.key === this.openKey()) ?? null,
  );
  protected readonly pos = signal({ top: 0, left: 0, measured: false });

  /** The open dropdown's rows; Håndbok adds one row per process after "Prosesskart". */
  protected readonly rows = computed<DropdownRow[]>(() => {
    const area = this.openArea();
    return area ? this.rowsFor(area) : [];
  });

  /** The "Meny" panel (below 1180 px): every area with its sub-items, in menu order. */
  protected readonly panelOpen = signal(false);
  protected readonly panelTop = signal(0);
  protected readonly panelGroups = computed(() =>
    this.panelOpen() ? this.areas().map((area) => ({ area, rows: this.rowsFor(area) })) : [],
  );

  private rowsFor(area: AreaDef): DropdownRow[] {
    const rows: DropdownRow[] = area.items.map((i) => ({
      key: i.key,
      link: this.router.parseUrl(i.path),
      labelKey: i.labelKey,
      hintKey: i.hintKey,
    }));
    if (area.dynamicItems === 'processes' && rows.length) {
      const processes: DropdownRow[] = this.handbook.items().map((p) => ({
        key: `process-${p.id}`,
        link: this.router.parseUrl(p.path),
        label: p.title,
        hintKey: p.hintKey,
      }));
      rows.splice(1, 0, ...processes);
    }
    return rows;
  }

  constructor() {
    const sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.active.set(activeAreaKey(e.urlAfterRedirects));
        this.close(false);
        this.closePanel(false);
        afterNextRender(() => this.scrollActiveIntoView(), { injector: this.injector });
      });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      this.cancelClose();
    });
  }

  open(area: AreaDef, focusFirst = false): void {
    this.cancelClose();
    if (area.dynamicItems === 'processes') {
      this.handbook.ensureLoaded();
    }
    this.pos.set({ top: 0, left: 0, measured: false });
    this.openKey.set(area.key);
    afterNextRender(
      () => {
        this.place(area.key);
        if (focusFirst) this.items()[0]?.focus();
      },
      { injector: this.injector },
    );
  }

  close(restoreFocus: boolean): void {
    this.cancelClose();
    const key = this.openKey();
    if (!key) return;
    this.openKey.set(null);
    if (restoreFocus) {
      this.root().querySelector<HTMLElement>(`#dd-btn-${key}`)?.focus();
    }
  }

  protected togglePanel(event: MouseEvent): void {
    event.stopPropagation();
    if (this.panelOpen()) {
      this.closePanel(false);
      return;
    }
    this.close(false);
    if (this.areas().some((a) => a.dynamicItems === 'processes')) {
      this.handbook.ensureLoaded();
    }
    const header = this.root().closest('header') ?? this.root();
    this.panelTop.set(Math.round(header.getBoundingClientRect().bottom));
    this.panelOpen.set(true);
    afterNextRender(
      () => this.root().querySelector<HTMLElement>('#menu-panel [data-panel-item]')?.focus(),
      { injector: this.injector },
    );
  }

  closePanel(restoreFocus: boolean): void {
    if (!this.panelOpen()) return;
    this.panelOpen.set(false);
    if (restoreFocus) {
      this.root().querySelector<HTMLElement>('#menu-panel-btn')?.focus();
    }
  }

  protected onResize(): void {
    this.close(false);
    if (window.innerWidth >= PANEL_MAX_WIDTH) this.closePanel(false);
  }

  protected onToggleClick(event: MouseEvent, area: AreaDef): void {
    event.stopPropagation();
    if (this.openKey() === area.key) {
      if (Date.now() - this.hoverOpenedAt < HOVER_GRACE_MS) return;
      this.close(false);
    } else {
      this.open(area);
    }
  }

  protected onToggleKeydown(event: KeyboardEvent, area: AreaDef): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open(area, true);
    }
  }

  protected onHover(area: AreaDef): void {
    if (!this.finePointer || (!area.items.length && !area.dynamicItems)) return;
    this.cancelClose();
    if (this.openKey() !== area.key) {
      this.open(area);
      this.hoverOpenedAt = Date.now();
    }
  }

  protected scheduleClose(): void {
    if (!this.finePointer || !this.openKey()) return;
    this.cancelClose();
    this.closeTimer = setTimeout(() => this.close(false), HOVER_CLOSE_MS);
  }

  protected cancelClose(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this.items();
    const at = items.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      case 'Tab':
        this.close(false);
        return;
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = at === -1 ? (step === 1 ? 0 : items.length - 1) : at + step;
        items[(next + items.length) % items.length]?.focus();
        return;
      }
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        return;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        return;
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.openKey() && !this.root().contains(event.target as Node)) {
      this.close(false);
    }
    // Outside the panel (the backdrop included) closes it; the Meny button toggles itself.
    const target = event.target as Element | null;
    if (this.panelOpen() && !target?.closest?.('#menu-panel, #menu-panel-btn')) {
      this.closePanel(false);
    }
  }

  /** Escape anywhere closes an open dropdown (the menu handler covers focus inside it). */
  onEscape(): void {
    if (this.panelOpen()) {
      this.closePanel(true);
      return;
    }
    this.close(true);
  }

  private root(): HTMLElement {
    return this.host.nativeElement as HTMLElement;
  }

  private items(): HTMLElement[] {
    return Array.from(this.root().querySelectorAll<HTMLElement>('[data-dd-item]'));
  }

  /** Put the dropdown under its item, clamped to the viewport with a 16 px margin. */
  private place(key: AreaKey): void {
    const item = this.root().querySelector<HTMLElement>(`[data-area="${key}"]`);
    const dropdown = this.root().querySelector<HTMLElement>('#area-dropdown');
    if (!item || !dropdown) return;
    const r = item.getBoundingClientRect();
    const width = dropdown.offsetWidth;
    const viewport = document.documentElement.clientWidth || window.innerWidth;
    const left = Math.max(MARGIN, Math.min(r.left, viewport - width - MARGIN));
    this.pos.set({ top: r.bottom + GAP, left, measured: true });
  }

  private scrollActiveIntoView(): void {
    const key = this.active();
    if (!key) return;
    const el = this.root().querySelector<HTMLElement>(`[data-area="${key}"]`);
    const row = el?.parentElement;
    if (!el || !row || row.scrollWidth <= row.clientWidth) return;
    const left = el.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + el.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo?.({ left: Math.max(0, left - 24) });
    }
  }
}

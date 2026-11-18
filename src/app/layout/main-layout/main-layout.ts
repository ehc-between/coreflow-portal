import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { loadSearchScope } from '../../core/search/search-scope';
import { ShellPreferencesService } from '../../core/shell/shell-preferences.service';
import { AskPanel } from '../../features/ask/ask-panel';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { CommandPalette } from '../../features/command-palette/command-palette';
import { CommandPaletteService } from '../../features/command-palette/command-palette.service';
import { Notifications } from '../../shared/notifications/notifications';
import { trapTabKey } from '../../shared/ui/focus-trap';
import { Icon } from '../../shared/ui/icon/icon';
import { NavDrawerService } from '../nav-drawer.service';
import { SideNav } from '../side-nav/side-nav';
import { SideNavV2 } from '../side-nav-v2/side-nav-v2';
import { TopBar } from '../top-bar/top-bar';

/**
 * Application shell: skip link, top bar, side nav and the routed content. All
 * authenticated feature routes render inside this.
 *
 * Below `lg` the side nav is an off-canvas drawer: the top-bar hamburger opens it,
 * focus is trapped inside, Escape / the backdrop / any navigation closes it and
 * focus returns to the hamburger.
 *
 * The assistant is reachable from every page: a floating Ask button (bottom
 * right, hidden while the panel is open) and the Ctrl/Cmd + J shortcut, which
 * toggles the panel (Ctrl/Cmd + K stays the command palette).
 *
 * Shell v2 (U03): when the org has `coreflow.nav.v2` on (and the user has not
 * switched back), the seven-destination nav and top bar replace the module list.
 */
@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    TranslocoPipe,
    TopBar,
    SideNav,
    SideNavV2,
    Notifications,
    AskPanel,
    CommandPalette,
    Icon,
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './main-layout.html',
})
export class MainLayout {
  protected readonly ask = inject(AskPanelService);
  protected readonly palette = inject(CommandPaletteService);
  protected readonly drawer = inject(NavDrawerService);
  protected readonly shell = inject(ShellPreferencesService);
  private readonly navPanel = viewChild.required<ElementRef<HTMLElement>>('navPanel');

  /** The shortcut as shown to the user (Cmd on Apple platforms). */
  protected readonly shortcut = isApplePlatform() ? '⌘J' : 'Ctrl+J';

  private readonly language = inject(LanguageService);
  protected readonly launcherLabel = computed(() =>
    this.language.translate('search.launcher.label'),
  );
  protected readonly launcherTitle = computed(() =>
    this.language.translate('search.launcher.title', { shortcut: this.shortcut }),
  );

  /** Element focused before the drawer opened (the hamburger), to return focus to. */
  private returnFocus: HTMLElement | null = null;

  constructor() {
    // The launcher's strings live in the search scope (not provided here, so the
    // routed pages below keep their own scopes).
    loadSearchScope();

    const sub = inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.drawer.close());
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());

    effect(() => {
      const open = this.drawer.open();
      untracked(() => {
        if (open) {
          this.returnFocus = document.activeElement as HTMLElement | null;
          queueMicrotask(() =>
            this.navPanel().nativeElement.querySelector<HTMLElement>('a[href], button')?.focus(),
          );
        } else if (this.returnFocus) {
          this.returnFocus.focus?.();
          this.returnFocus = null;
        }
      });
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'j') {
      event.preventDefault();
      this.ask.toggle();
    } else if (event.key === 'Escape' && this.drawer.open()) {
      this.drawer.close();
    }
  }

  protected onNavKeydown(event: KeyboardEvent): void {
    if (this.drawer.open()) {
      trapTabKey(this.navPanel().nativeElement, event);
    }
  }

  /** Move focus into <main> (the default anchor jump does not focus a scroll container). */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }
}

function isApplePlatform(): boolean {
  const nav = globalThis.navigator as
    | (Navigator & { userAgentData?: { platform?: string } })
    | undefined;
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? '';
  return /mac|iphone|ipad/i.test(platform);
}

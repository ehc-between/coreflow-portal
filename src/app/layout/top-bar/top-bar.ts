import { ChangeDetectionStrategy, Component, HostListener, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { ThemeService } from '../../core/theme/theme.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { CommandPaletteService } from '../../features/command-palette/command-palette.service';
import { LanguageSwitcher } from '../../shared/language-switcher/language-switcher';
import { Icon } from '../../shared/ui/icon/icon';
import { AccountMenu } from '../account-menu/account-menu';
import { HelpMenu } from '../help-menu/help-menu';
import { NavDrawerService } from '../nav-drawer.service';
import { NotificationBell } from '../notification-bell/notification-bell';

/**
 * Application top bar (58 px): menu button (below `lg`), brand, the search button
 * that opens the command palette (an icon below `md`), theme and language (from
 * `md`; on phones they live in the account menu), notifications and the account
 * menu. The assistant is opened from the floating Ask button or Ctrl/Cmd + J.
 *
 * With `v2` (shell v2, U03) the box reads "Finn eller spør", a "?" help menu sits
 * before the bell, and theme and language move into the account menu at every width.
 */
@Component({
  selector: 'app-top-bar',
  imports: [
    RouterLink,
    TranslocoPipe,
    Icon,
    LanguageSwitcher,
    AccountMenu,
    HelpMenu,
    NotificationBell,
  ],
  viewProviders: [provideSharedScope('shell')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="z-[6] flex h-[58px] flex-none items-center gap-2 border-b border-border bg-surface px-2 sm:gap-3.5 sm:px-4"
    >
      <div class="flex min-w-0 items-center gap-1.5 md:flex-1">
        <button
          type="button"
          data-testid="nav-toggle"
          class="flex h-10 w-10 flex-none items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none lg:hidden"
          [attr.aria-label]="
            (drawer.open() ? 'ui.shell.closeMenu' : 'ui.shell.openMenu') | transloco
          "
          [attr.aria-expanded]="drawer.open()"
          (click)="drawer.toggle()"
        >
          <app-icon [name]="drawer.open() ? 'x' : 'menu'" [size]="20" />
        </button>
        <a
          routerLink="/"
          class="flex items-center gap-2.5 rounded-tile focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-label]="'ui.shell.home' | transloco"
        >
          <span
            class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-tile bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_3px_10px_rgba(90,75,230,0.4)]"
          >
            <app-icon name="spark" [size]="18" />
          </span>
          <span
            class="hidden font-display text-section font-bold tracking-[-0.02em] text-fg sm:inline"
            >CoreFlow</span
          >
        </a>
      </div>

      <!-- Full search box from md; a search icon below. -->
      <button
        type="button"
        (click)="palette.show()"
        data-testid="search-box"
        [attr.aria-label]="
          ask.streaming()
            ? ('ask.working' | transloco)
            : ('ui.shell.searchShortcut' | transloco: { shortcut: shortcutLabel })
        "
        aria-keyshortcuts="Control+K Meta+K"
        class="hidden h-[38px] w-full max-w-[540px] min-w-0 flex-[0_1_540px] cursor-text items-center gap-2.5 rounded-tile border border-border bg-bg pr-2.5 pl-3 text-ui text-fg-subtle hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none md:flex"
        [class.border-accent-border]="ask.streaming()"
      >
        <span class="flex text-fg-subtle"><app-icon name="search" [size]="17" /></span>
        @if (ask.streaming()) {
          <span class="flex min-w-0 flex-1 items-center gap-2 text-left text-accent">
            <span class="relative flex h-[7px] w-[7px] flex-none">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70"
              ></span>
              <span class="relative inline-flex h-[7px] w-[7px] rounded-full bg-accent"></span>
            </span>
            <span class="truncate font-medium">{{ 'ask.working' | transloco }}</span>
          </span>
        } @else {
          <span class="min-w-0 flex-1 truncate text-left">{{
            (v2() ? 'shell.search.placeholder' : 'topbar.searchPlaceholder') | transloco
          }}</span>
        }
        <span class="flex flex-none items-center gap-[3px]" aria-hidden="true">
          @for (key of shortcutKeys; track key) {
            <kbd
              class="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-micro text-fg-muted"
              >{{ key }}</kbd
            >
          }
        </span>
      </button>

      <div class="flex flex-1 items-center justify-end gap-0.5 sm:gap-1.5">
        <button
          type="button"
          (click)="palette.show()"
          data-testid="search-icon"
          [attr.aria-label]="'ui.shell.search' | transloco"
          class="flex h-10 w-10 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none md:hidden"
        >
          <app-icon name="search" [size]="19" />
        </button>

        @if (v2()) {
          @defer (on immediate) {
            <app-help-menu />
          } @placeholder {
            <span class="block h-10 w-10"></span>
          }
        } @else {
          <button
            type="button"
            (click)="theme.toggle()"
            [attr.aria-label]="'theme.toggle' | transloco"
            class="hidden h-9 w-9 items-center justify-center rounded-tile border border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none md:flex"
          >
            <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="18" />
          </button>

          <app-language-switcher class="hidden md:block" />
        }

        <app-notification-bell />

        <app-account-menu [v2]="v2()" />
      </div>
    </header>
  `,
})
export class TopBar {
  protected readonly theme = inject(ThemeService);
  protected readonly ask = inject(AskPanelService);
  protected readonly palette = inject(CommandPaletteService);
  protected readonly drawer = inject(NavDrawerService);

  /** Shell v2 top bar (see the class comment). */
  readonly v2 = input(false);

  private readonly apple = isApplePlatform();
  /** "⌘ K" on Apple platforms, "Ctrl K" elsewhere. */
  protected readonly shortcutKeys = this.apple ? ['⌘', 'K'] : ['Ctrl', 'K'];
  protected readonly shortcutLabel = this.apple ? '⌘K' : 'Ctrl+K';

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.toggle();
    }
  }
}

function isApplePlatform(): boolean {
  const nav = globalThis.navigator as
    | (Navigator & { userAgentData?: { platform?: string } })
    | undefined;
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? '';
  return /mac|iphone|ipad/i.test(platform);
}

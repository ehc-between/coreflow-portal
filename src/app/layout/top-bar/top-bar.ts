import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { ThemeService } from '../../core/theme/theme.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { LanguageSwitcher } from '../../shared/language-switcher/language-switcher';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Application top bar (58px): brand, ⌘K search button that opens the Ask CoreFlow
 * panel, theme toggle, language switcher, notifications bell, Copilot button
 * (inert), and the current user's avatar.
 */
@Component({
  selector: 'app-top-bar',
  imports: [RouterLink, TranslocoPipe, Icon, Avatar, LanguageSwitcher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="z-[6] flex h-[58px] flex-none items-center gap-3.5 border-b border-border bg-surface px-4"
    >
      <div class="flex flex-1 items-center">
        <a routerLink="/" class="flex items-center gap-2.5">
          <span
            class="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_3px_10px_rgba(90,75,230,0.4)]"
          >
            <app-icon name="spark" [size]="18" />
          </span>
          <span class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg"
            >CoreFlow</span
          >
        </a>
      </div>

      <button
        type="button"
        (click)="ask.show()"
        [attr.aria-label]="ask.streaming() ? ('ask.working' | transloco) : null"
        class="flex h-[38px] w-[540px] max-w-full flex-none cursor-text items-center gap-2.5 rounded-[10px] border border-border bg-bg pr-2.5 pl-3 text-[13.5px] text-fg-subtle hover:border-border-strong"
        [class.border-accent-border]="ask.streaming()"
      >
        <span class="flex text-fg-subtle"><app-icon name="search" [size]="17" /></span>
        @if (ask.streaming()) {
          <span class="flex flex-1 items-center gap-2 text-left text-accent">
            <span class="relative flex h-[7px] w-[7px] flex-none">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70"
              ></span>
              <span class="relative inline-flex h-[7px] w-[7px] rounded-full bg-accent"></span>
            </span>
            <span class="truncate font-medium">{{ 'ask.working' | transloco }}</span>
          </span>
        } @else {
          <span class="flex-1 text-left">{{ 'topbar.searchPlaceholder' | transloco }}</span>
        }
        <span class="flex items-center gap-[3px]">
          <kbd
            class="rounded-[5px] border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted"
            >⌘</kbd
          >
          <kbd
            class="rounded-[5px] border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted"
            >K</kbd
          >
        </span>
      </button>

      <div class="flex flex-1 items-center justify-end gap-1.5">
        <button
          type="button"
          (click)="theme.toggle()"
          [attr.aria-label]="'theme.toggle' | transloco"
          class="flex h-9 w-9 items-center justify-center rounded-[9px] border border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="18" />
        </button>

        <app-language-switcher />

        <button
          type="button"
          (click)="comingSoon()"
          [attr.aria-label]="'topbar.notifications' | transloco"
          class="relative flex h-9 w-9 items-center justify-center rounded-[9px] border border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <app-icon name="bell" [size]="18" />
          <span
            class="absolute top-1.5 right-1.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-surface bg-fail"
          ></span>
        </button>

        <button
          type="button"
          (click)="comingSoon()"
          [attr.aria-label]="'topbar.copilot' | transloco"
          class="flex h-9 w-9 items-center justify-center rounded-[9px] border border-accent-border bg-accent-soft text-accent hover:bg-accent-soft/70"
        >
          <app-icon name="spark" [size]="18" />
        </button>

        <span class="ml-1">
          <app-avatar [name]="auth.displayName()" size="md" />
        </span>
      </div>
    </header>
  `,
})
export class TopBar {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly ask = inject(AskPanelService);
  private readonly notifications = inject(NotificationService);

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.ask.toggle();
    }
  }

  protected comingSoon(): void {
    this.notifications.info('topbar.comingSoon');
  }
}

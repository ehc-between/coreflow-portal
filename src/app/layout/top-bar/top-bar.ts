import { ChangeDetectionStrategy, Component, HostListener, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';
import { CommandPaletteService } from '../../features/command-palette/command-palette.service';
import { Icon } from '../../shared/ui/icon/icon';
import { AccountMenu } from '../account-menu/account-menu';
import { InboxButton } from '../inbox/inbox-button';
import { TopMenu } from '../top-menu/top-menu';

/**
 * The top bar (IA v2 §4.6, the approved prototype): ✦ CoreFlow (to Oversikt, with the
 * current company's name under it from `md`), the nine-area top menu, and on the right
 * the "Vis krav" switch, search (Ctrl/Cmd K), the inbox and the account menu.
 *
 * From `lg` everything sits on one row; below that the menu moves to a second,
 * full-width row (still horizontally scrollable), so the right cluster never collides.
 */
@Component({
  selector: 'app-top-bar',
  imports: [RouterLink, TranslocoPipe, Icon, AccountMenu, InboxButton, TopMenu],
  viewProviders: [provideSharedScope('shell')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block flex-none' },
  template: `
    <header class="sticky top-0 z-[6] border-b border-border bg-surface" data-testid="top-bar">
      <div
        class="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-0 pt-2 pr-[max(16px,env(safe-area-inset-right))] pl-[max(16px,env(safe-area-inset-left))] lg:flex-nowrap lg:py-2.5"
      >
        <a
          routerLink="/home"
          data-testid="brand"
          class="flex flex-none items-center gap-2 rounded-tile py-1 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-label]="'ui.shell.home' | transloco"
        >
          <span
            class="grid h-7 w-7 flex-none place-items-center rounded-lg bg-accent text-[15px] text-white"
            aria-hidden="true"
            >✦</span
          >
          <span class="flex min-w-0 flex-col leading-tight">
            <span class="font-display text-[18px] font-bold whitespace-nowrap text-fg"
              >CoreFlow</span
            >
            @if (orgName(); as name) {
              <span
                class="hidden max-w-[160px] truncate text-micro text-fg-subtle md:block"
                data-testid="brand-org"
                >{{ name }}</span
              >
            }
          </span>
        </a>

        <app-top-menu
          class="order-last -mx-1 w-full pb-1.5 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:pb-0"
        />

        <div class="ml-auto flex flex-none items-center gap-1 sm:gap-2.5">
          <span class="flex items-center gap-2 text-meta whitespace-nowrap text-fg-muted">
            <span class="hidden sm:inline" id="show-req-label">{{
              'shell.showRequirements.label' | transloco
            }}</span>
            <button
              type="button"
              role="switch"
              data-testid="show-req-switch"
              [attr.aria-checked]="req.on()"
              [attr.aria-label]="'shell.showRequirements.aria' | transloco"
              (click)="toggleRequirements()"
              class="relative h-5 w-[34px] flex-none rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
              [class]="req.on() ? 'bg-accent' : 'bg-border-strong'"
            >
              <span
                class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none"
                [class.translate-x-[14px]]="req.on()"
              ></span>
            </button>
          </span>

          <button
            type="button"
            (click)="palette.show()"
            data-testid="search-icon"
            [attr.aria-label]="'ui.shell.searchShortcut' | transloco: { shortcut: shortcutLabel }"
            [title]="'ui.shell.searchShortcut' | transloco: { shortcut: shortcutLabel }"
            aria-keyshortcuts="Control+K Meta+K"
            class="flex h-10 w-10 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-icon name="search" [size]="19" />
          </button>

          <app-inbox-button />
          <app-account-menu />
        </div>
      </div>
    </header>
  `,
})
export class TopBar {
  protected readonly palette = inject(CommandPaletteService);
  protected readonly req = inject(RequirementsVisibilityService);
  private readonly toasts = inject(NotificationService);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly orgName = computed(() => this.selectedOrg.currentOrg()?.name ?? null);

  private readonly apple = isApplePlatform();
  protected readonly shortcutLabel = this.apple ? '⌘K' : 'Ctrl+K';

  protected toggleRequirements(): void {
    this.req.toggle();
    this.toasts.info(this.req.on() ? 'ui.showRequirements.on' : 'ui.showRequirements.off');
  }

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

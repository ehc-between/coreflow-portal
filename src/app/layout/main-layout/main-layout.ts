import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LanguageService } from '../../core/i18n/language.service';
import { loadSearchScope } from '../../core/search/search-scope';
import { AskPanel } from '../../features/ask/ask-panel';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { CommandPalette } from '../../features/command-palette/command-palette';
import { Notifications } from '../../shared/notifications/notifications';
import { Icon } from '../../shared/ui/icon/icon';
import { SideNav } from '../side-nav/side-nav';
import { TopBar } from '../top-bar/top-bar';

/**
 * Application shell: top bar + sidebar nav + routed content outlet. All
 * authenticated feature routes render inside this.
 *
 * The assistant is reachable from every page: a floating Ask button (bottom
 * right, hidden while the panel is open) and the Ctrl/Cmd + J shortcut, which
 * toggles the panel (Ctrl/Cmd + K stays the command palette).
 */
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, TopBar, SideNav, Notifications, AskPanel, CommandPalette, Icon],
  host: { '(document:keydown)': 'onKeydown($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './main-layout.html',
})
export class MainLayout {
  protected readonly ask = inject(AskPanelService);

  /** The shortcut as shown to the user (Cmd on Apple platforms). */
  protected readonly shortcut = isApplePlatform() ? '⌘J' : 'Ctrl+J';

  private readonly language = inject(LanguageService);
  protected readonly launcherLabel = computed(() =>
    this.language.translate('search.launcher.label'),
  );
  protected readonly launcherTitle = computed(() =>
    this.language.translate('search.launcher.title', { shortcut: this.shortcut }),
  );

  constructor() {
    // The launcher's strings live in the search scope (not provided here, so the
    // routed pages below keep their own scopes).
    loadSearchScope();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'j') {
      event.preventDefault();
      this.ask.toggle();
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

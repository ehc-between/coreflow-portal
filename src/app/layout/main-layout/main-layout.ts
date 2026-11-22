import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { loadSearchScope } from '../../core/search/search-scope';
import { AskPanel } from '../../features/ask/ask-panel';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { CommandPalette } from '../../features/command-palette/command-palette';
import { CommandPaletteService } from '../../features/command-palette/command-palette.service';
import { Notifications } from '../../shared/notifications/notifications';
import { RegistrerComplete } from '../../shared/registrer/registrer-complete';
import { RegistrerDialog } from '../../shared/registrer/registrer-dialog';
import { isRegistrerShortcut } from '../../shared/registrer/registrer-data';
import { RegistrerService } from '../../shared/registrer/registrer.service';
import { TopBar } from '../top-bar/top-bar';

/**
 * Application shell (IA v2 §4.6): skip link, the top bar with the nine-area top menu,
 * and the routed content below it. No side nav: every area is in the top menu, which
 * scrolls sideways on small screens. All authenticated feature routes render here.
 *
 * The assistant is reachable from every page: the floating "✦ Spør CoreFlow" button
 * (bottom right, hidden while the panel is open; text from `sm`, icon below) and the
 * Ctrl/Cmd + J shortcut, which toggles the panel (Ctrl/Cmd + K is search). N opens the
 * quick "Registrer" dialog.
 */
@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    TranslocoPipe,
    TopBar,
    Notifications,
    AskPanel,
    CommandPalette,
    RegistrerDialog,
    RegistrerComplete,
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './main-layout.html',
})
export class MainLayout {
  protected readonly ask = inject(AskPanelService);
  protected readonly palette = inject(CommandPaletteService);
  protected readonly registrer = inject(RegistrerService);

  /** The shortcut as shown to the user (Cmd on Apple platforms). */
  protected readonly shortcut = isApplePlatform() ? '⌘J' : 'Ctrl+J';

  private readonly language = inject(LanguageService);
  protected readonly launcherLabel = computed(() => this.language.translate('ui.shell.ask'));
  protected readonly launcherTitle = computed(() =>
    this.language.translate('search.launcher.title', { shortcut: this.shortcut }),
  );

  constructor() {
    // The launcher's title lives in the search scope (not provided here, so the
    // routed pages below keep their own scopes).
    loadSearchScope();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'j') {
      event.preventDefault();
      this.ask.toggle();
    } else if (isRegistrerShortcut(event) && !this.registrer.open()) {
      // U05: N opens "Registrer" from any page (not while typing or in another dialog).
      event.preventDefault();
      this.registrer.show();
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

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { Icon } from '../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';

/**
 * Shell v2 "?" menu in the top bar (U03): help and learning in one place. "Mine
 * leksjoner" opens the learning centre (no longer a nav entry) and "Spør
 * assistenten" opens the assistant panel.
 */
@Component({
  selector: 'app-help-menu',
  imports: [RouterLink, TranslocoPipe, Icon, OverflowMenu, MenuItem],
  viewProviders: [provideSharedScope('shell')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overflow-menu
      variant="ghost"
      icon="help"
      [iconOnly]="true"
      labelKey="shell.help.label"
      triggerTestId="help-menu"
    >
      <div
        class="px-2.5 pt-1 pb-1.5 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
        aria-hidden="true"
      >
        {{ 'shell.help.label' | transloco }}
      </div>
      <a appMenuItem routerLink="/account/learning" data-testid="help-lessons">
        <span class="flex text-fg-subtle"><app-icon name="book" [size]="16" /></span>
        {{ 'shell.help.lessons' | transloco }}
      </a>
      <button appMenuItem type="button" data-testid="help-ask" (click)="ask.show()">
        <span class="flex text-fg-subtle"><app-icon name="spark" [size]="16" /></span>
        {{ 'shell.help.ask' | transloco }}
      </button>
    </app-overflow-menu>
  `,
})
export class HelpMenu {
  protected readonly ask = inject(AskPanelService);
}

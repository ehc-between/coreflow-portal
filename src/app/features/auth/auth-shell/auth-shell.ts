import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../../core/theme/theme.service';
import { LanguageSwitcher } from '../../../shared/language-switcher/language-switcher';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * Chrome shared by the public auth pages (login, invitation, forgot/reset
 * password): theme toggle + language switcher, the CoreFlow mark, and a card
 * that hosts the projected page content.
 */
@Component({
  selector: 'app-auth-shell',
  imports: [TranslocoPipe, Card, Icon, LanguageSwitcher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative flex min-h-screen items-center justify-center bg-bg px-4 text-fg">
      <div class="absolute top-4 right-4 flex items-center gap-1.5">
        <button
          type="button"
          (click)="theme.toggle()"
          [attr.aria-label]="'theme.toggle' | transloco"
          class="flex h-9 w-9 items-center justify-center rounded-[9px] border border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="18" />
        </button>
        <app-language-switcher />
      </div>

      <div class="w-full max-w-sm">
        <div class="mb-6 flex items-center gap-2.5">
          <span
            class="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_3px_10px_rgba(90,75,230,0.4)]"
          >
            <app-icon name="spark" [size]="20" />
          </span>
          <span class="font-display text-[22px] font-bold tracking-[-0.02em]">CoreFlow</span>
        </div>

        <app-card>
          <div class="p-2">
            <ng-content />
          </div>
        </app-card>
      </div>
    </div>
  `,
})
export class AuthShell {
  protected readonly theme = inject(ThemeService);
}

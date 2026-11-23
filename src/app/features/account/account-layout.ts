import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ModuleNav, ModuleNavItem } from '../../shared/ui/module-nav/module-nav';

/** The tabs of "My account", in order. */
export const ACCOUNT_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'account.nav.password', link: '/account/password', testId: 'account-nav-password' },
  { labelKey: 'account.nav.security', link: '/account/security', testId: 'account-nav-security' },
  { labelKey: 'account.nav.sessions', link: '/account/sessions', testId: 'account-nav-sessions' },
  {
    labelKey: 'account.nav.notifications',
    link: '/account/notifications',
    testId: 'account-nav-notifications',
  },
  { labelKey: 'account.nav.learning', link: '/account/learning', testId: 'account-nav-learning' },
];

/**
 * `/account/*`: one tab row over the signed-in user's own settings (password,
 * two-step sign-in, sessions, notifications and learning), so each page can be
 * reached from the others.
 */
@Component({
  selector: 'app-account-layout',
  imports: [RouterOutlet, TranslocoPipe, ModuleNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto w-full max-w-[808px] px-4 pt-6 sm:px-8 sm:pt-7">
      <p class="mb-1 text-meta font-semibold tracking-wide text-fg-subtle uppercase">
        {{ 'account.title' | transloco }}
      </p>
      <app-module-nav labelKey="account.title" [items]="items" />
    </div>
    <router-outlet />
  `,
})
export class AccountLayout {
  protected readonly items = ACCOUNT_NAV;
}

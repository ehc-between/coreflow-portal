import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { GUIDANCE_LEVELS, GuidanceLevel } from '../../core/guidance/guidance.models';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Top-bar avatar menu: shows the signed-in user (name + email) and offers
 * "Change password", "Two-step verification", "Signed-in devices", "Notification settings", the learning-mode level switch (three
 * levels plus "use organisation default") with a link to the learning centre,
 * "Sign out" and "Sign out of all devices". Closes on outside-click and Escape.
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink, TranslocoPipe, Avatar, Icon],
  viewProviders: [provideSharedScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative ml-1 block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @let user = auth.user();
    <button
      type="button"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="'auth.menu.label' | transloco"
      (click)="toggle()"
      class="flex rounded-tile focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <app-avatar [name]="auth.displayName()" size="md" />
    </button>

    @if (open()) {
      <div
        role="menu"
        [attr.aria-label]="'auth.menu.label' | transloco"
        class="absolute top-full right-0 z-20 mt-2 flex max-h-[calc(100dvh-80px)] w-64 max-w-[calc(100vw-16px)] flex-col overflow-y-auto rounded-card border border-border bg-surface p-1.5 shadow-pop"
      >
        <div class="flex items-center gap-2.5 px-2 pt-1.5 pb-2.5">
          <app-avatar [name]="auth.displayName()" size="sm" />
          <div class="min-w-0 flex-1">
            @if (user?.full_name) {
              <div class="truncate text-ui font-semibold text-fg">{{ user?.full_name }}</div>
            }
            <div class="truncate text-meta text-fg-muted">{{ user?.email }}</div>
          </div>
        </div>
        <div class="mb-1 border-t border-border"></div>

        <a
          role="menuitem"
          routerLink="/account/password"
          (click)="close()"
          class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-ui font-medium text-fg hover:bg-surface-2"
        >
          <span class="flex text-fg-subtle"><app-icon name="lock" [size]="16" /></span>
          {{ 'auth.menu.changePassword' | transloco }}
        </a>
        <a
          role="menuitem"
          routerLink="/account/security"
          (click)="close()"
          class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-ui font-medium text-fg hover:bg-surface-2"
        >
          <span class="flex text-fg-subtle"><app-icon name="shield" [size]="16" /></span>
          {{ 'auth.menu.security' | transloco }}
        </a>
        <a
          role="menuitem"
          routerLink="/account/sessions"
          (click)="close()"
          class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-ui font-medium text-fg hover:bg-surface-2"
        >
          <span class="flex text-fg-subtle"><app-icon name="devices" [size]="16" /></span>
          {{ 'auth.menu.sessions' | transloco }}
        </a>
        <a
          role="menuitem"
          routerLink="/account/notifications"
          (click)="close()"
          class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-ui font-medium text-fg hover:bg-surface-2"
        >
          <span class="flex text-fg-subtle"><app-icon name="bell" [size]="16" /></span>
          {{ 'auth.menu.notificationSettings' | transloco }}
        </a>

        <!-- On phones the theme and language controls live here (the top bar hides them). -->
        <div class="md:hidden" data-testid="account-menu-display">
          <div class="my-1 border-t border-border"></div>
          <div role="group" aria-labelledby="account-appearance-heading" class="flex flex-col">
            <div
              id="account-appearance-heading"
              class="px-2 pt-1.5 pb-1 text-micro font-semibold tracking-wide text-fg-subtle uppercase"
            >
              {{ 'ui.shell.appearance' | transloco }}
            </div>
            <button
              type="button"
              role="menuitem"
              data-testid="account-menu-theme"
              (click)="theme.toggle()"
              class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-left text-ui font-medium text-fg hover:bg-surface-2"
            >
              <span class="flex text-fg-subtle"
                ><app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="16"
              /></span>
              {{
                (theme.theme() === 'dark' ? 'ui.shell.lightTheme' : 'ui.shell.darkTheme')
                  | transloco
              }}
            </button>
          </div>
          <div role="group" aria-labelledby="account-language-heading" class="flex flex-col">
            <div
              id="account-language-heading"
              class="px-2 pt-1.5 pb-1 text-micro font-semibold tracking-wide text-fg-subtle uppercase"
            >
              {{ 'language.label' | transloco }}
            </div>
            @for (lang of language.available; track lang) {
              <button
                type="button"
                role="menuitemradio"
                [attr.aria-checked]="language.active() === lang"
                [attr.lang]="lang"
                [attr.data-testid]="'account-menu-lang-' + lang"
                (click)="language.use(lang)"
                class="flex items-center gap-2.5 rounded-tile px-2 py-1.5 text-left text-ui font-medium text-fg hover:bg-surface-2"
              >
                <span class="flex w-4 text-accent" aria-hidden="true">
                  @if (language.active() === lang) {
                    <app-icon name="check" [size]="15" />
                  }
                </span>
                {{ 'language.' + lang | transloco }}
              </button>
            }
          </div>
        </div>

        <div class="my-1 border-t border-border"></div>
        <div
          role="group"
          data-testid="guidance-level-menu"
          aria-labelledby="guidance-level-heading"
          class="flex flex-col"
        >
          <div
            id="guidance-level-heading"
            class="px-2 pt-1.5 pb-1 text-meta font-semibold tracking-wide text-fg-subtle uppercase"
          >
            {{ 'guidance.menu.levelLabel' | transloco }}
          </div>
          <button
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="guidance.personalLevel() === null"
            [disabled]="guidance.saving()"
            (click)="setLevel(null)"
            class="flex items-center gap-2.5 rounded-tile px-2 py-1.5 text-left text-ui font-medium text-fg hover:bg-surface-2 disabled:opacity-60"
          >
            <span class="flex w-4 text-accent" aria-hidden="true">
              @if (guidance.personalLevel() === null) {
                <app-icon name="check" [size]="15" />
              }
            </span>
            {{
              'guidance.menu.useOrgDefault'
                | transloco
                  : { level: 'guidance.levels.' + guidance.orgDefault() + '.name' | transloco }
            }}
          </button>
          @for (level of levels; track level) {
            <button
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="guidance.personalLevel() === level"
              [disabled]="guidance.saving()"
              (click)="setLevel(level)"
              class="flex items-center gap-2.5 rounded-tile px-2 py-1.5 text-left text-ui font-medium text-fg hover:bg-surface-2 disabled:opacity-60"
            >
              <span class="flex w-4 text-accent" aria-hidden="true">
                @if (guidance.personalLevel() === level) {
                  <app-icon name="check" [size]="15" />
                }
              </span>
              {{ 'guidance.levels.' + level + '.name' | transloco }}
            </button>
          }
          <a
            role="menuitem"
            routerLink="/account/learning"
            (click)="close()"
            class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-ui font-medium text-fg hover:bg-surface-2"
          >
            <span class="flex text-fg-subtle"><app-icon name="training" [size]="16" /></span>
            {{ 'guidance.menu.learningCentre' | transloco }}
          </a>
        </div>
        <div class="my-1 border-t border-border"></div>
        <button
          type="button"
          role="menuitem"
          (click)="signOut()"
          class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-left text-ui font-medium text-fg hover:bg-surface-2"
        >
          <span class="flex text-fg-subtle"><app-icon name="logout" [size]="16" /></span>
          {{ 'auth.logout' | transloco }}
        </button>
        <button
          type="button"
          role="menuitem"
          [disabled]="signingOutAll()"
          (click)="signOutAll()"
          class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-left text-ui font-medium text-fail hover:bg-fail-soft disabled:opacity-60"
        >
          <span class="flex"><app-icon name="devices" [size]="16" /></span>
          {{ 'auth.menu.logoutAll' | transloco }}
        </button>
      </div>
    }
  `,
})
export class AccountMenu {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly language = inject(LanguageService);
  protected readonly guidance = inject(GuidanceService);
  protected readonly levels = GUIDANCE_LEVELS;
  private readonly notifications = inject(NotificationService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly signingOutAll = signal(false);

  protected toggle(): void {
    this.open.update((o) => !o);
  }

  protected close(): void {
    this.open.set(false);
  }

  /** Switch the learning-mode level (`null` follows the org default); the menu stays open. */
  protected setLevel(level: GuidanceLevel | null): void {
    this.guidance.setLevel(level);
  }

  protected signOut(): void {
    this.close();
    this.auth.logout();
  }

  protected signOutAll(): void {
    if (this.signingOutAll()) {
      return;
    }
    this.signingOutAll.set(true);
    this.auth.logoutAll().subscribe({
      next: () => {
        this.signingOutAll.set(false);
        this.close();
      },
      error: () => {
        this.signingOutAll.set(false);
        this.notifications.error('auth.menu.logoutAllFailed');
      },
    });
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}

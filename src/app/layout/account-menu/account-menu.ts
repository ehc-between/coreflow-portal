import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Top-bar avatar menu: shows the signed-in user (name + email) and offers
 * "Change password", "Notification settings", "Sign out" and "Sign out of all devices". Closes on
 * outside-click and Escape.
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink, TranslocoPipe, Avatar, Icon],
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
        class="absolute top-full right-0 z-20 mt-2 flex w-64 flex-col rounded-card border border-border bg-surface p-1.5 shadow-pop"
      >
        <div class="flex items-center gap-2.5 px-2 pt-1.5 pb-2.5">
          <app-avatar [name]="auth.displayName()" size="sm" />
          <div class="min-w-0 flex-1">
            @if (user?.full_name) {
              <div class="truncate text-[13px] font-semibold text-fg">{{ user?.full_name }}</div>
            }
            <div class="truncate text-[12.5px] text-fg-muted">{{ user?.email }}</div>
          </div>
        </div>
        <div class="mb-1 border-t border-border"></div>

        <a
          role="menuitem"
          routerLink="/account/password"
          (click)="close()"
          class="flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-[13px] font-medium text-fg hover:bg-surface-2"
        >
          <span class="flex text-fg-subtle"><app-icon name="lock" [size]="16" /></span>
          {{ 'auth.menu.changePassword' | transloco }}
        </a>
        <a
          role="menuitem"
          routerLink="/account/notifications"
          (click)="close()"
          class="flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-[13px] font-medium text-fg hover:bg-surface-2"
        >
          <span class="flex text-fg-subtle"><app-icon name="bell" [size]="16" /></span>
          {{ 'auth.menu.notificationSettings' | transloco }}
        </a>
        <button
          type="button"
          role="menuitem"
          (click)="signOut()"
          class="flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-left text-[13px] font-medium text-fg hover:bg-surface-2"
        >
          <span class="flex text-fg-subtle"><app-icon name="logout" [size]="16" /></span>
          {{ 'auth.logout' | transloco }}
        </button>
        <button
          type="button"
          role="menuitem"
          [disabled]="signingOutAll()"
          (click)="signOutAll()"
          class="flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-left text-[13px] font-medium text-fail hover:bg-fail-soft disabled:opacity-60"
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

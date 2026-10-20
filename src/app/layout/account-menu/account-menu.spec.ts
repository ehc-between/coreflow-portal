import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { AccountMenu } from './account-menu';

function setup() {
  const logoutAll$ = new Subject<void>();
  const auth = {
    user: signal({ id: 'u-1', email: 'ada@example.com', full_name: 'Ada Lovelace' }).asReadonly(),
    displayName: signal('Ada Lovelace').asReadonly(),
    logout: vi.fn(),
    logoutAll: vi.fn(() => logoutAll$),
  };
  const notifications = { error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [AccountMenu, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: NotificationService, useValue: notifications },
    ],
  });
  const fixture = TestBed.createComponent(AccountMenu);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  function openMenu(): void {
    el.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    fixture.detectChanges();
  }

  function item(label: string): HTMLElement {
    const found = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((n) =>
      n.textContent?.includes(label),
    );
    if (!found) throw new Error(`menu item ${label} not found`);
    return found;
  }

  return { fixture, el, auth, notifications, logoutAll$, openMenu, item };
}

describe('AccountMenu', () => {
  it('shows the user and the account actions when opened', () => {
    const { el, openMenu, item } = setup();
    expect(el.querySelector('[role="menu"]')).toBeNull();
    openMenu();
    expect(el.textContent).toContain('Ada Lovelace');
    expect(el.textContent).toContain('ada@example.com');
    expect(item('auth.menu.changePassword').getAttribute('href')).toBe('/account/password');
    expect(item('auth.logout')).toBeTruthy();
    expect(item('auth.menu.logoutAll')).toBeTruthy();
  });

  it('signs out', () => {
    const { auth, openMenu, item } = setup();
    openMenu();
    item('auth.logout').click();
    expect(auth.logout).toHaveBeenCalled();
  });

  it('signs out of all devices and reports a failure', () => {
    const { auth, notifications, logoutAll$, openMenu, item } = setup();
    openMenu();
    item('auth.menu.logoutAll').click();
    expect(auth.logoutAll).toHaveBeenCalled();
    logoutAll$.error(new Error('nope'));
    expect(notifications.error).toHaveBeenCalledWith('auth.menu.logoutAllFailed');
  });
});

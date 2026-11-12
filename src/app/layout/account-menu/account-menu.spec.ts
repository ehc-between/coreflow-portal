import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { GuidanceLevel } from '../../core/guidance/guidance.models';
import { GuidanceService } from '../../core/guidance/guidance.service';
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
  const personalLevel = signal<GuidanceLevel | null>(null);
  const guidance = {
    personalLevel,
    orgDefault: signal<GuidanceLevel>('standard'),
    saving: signal(false),
    setLevel: vi.fn((level: GuidanceLevel | null) => personalLevel.set(level)),
  };
  TestBed.configureTestingModule({
    imports: [
      AccountMenu,
      TranslocoTestingModule.forRoot({ langs: { en: {}, 'guidance/en': {} } }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: NotificationService, useValue: notifications },
      { provide: GuidanceService, useValue: guidance },
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

  return { fixture, el, auth, notifications, guidance, logoutAll$, openMenu, item };
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

  it('switches the learning level and links to the learning centre', () => {
    const { el, fixture, guidance, openMenu, item } = setup();
    openMenu();
    const radios = () =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    radios()[1].click();
    fixture.detectChanges();
    expect(guidance.setLevel).toHaveBeenCalledWith('beginner');
    expect(radios()[1].getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('[role="menu"]')).not.toBeNull();
    radios()[0].click();
    expect(guidance.setLevel).toHaveBeenLastCalledWith(null);
    expect(item('guidance.menu.learningCentre').getAttribute('href')).toBe('/account/learning');
  });
});

import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { GuidanceLevel } from '../../core/guidance/guidance.models';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { ShellPreferencesService } from '../../core/shell/shell-preferences.service';
import { AccountMenu } from './account-menu';

function fakeShell(opts: { orgNavV2?: boolean; userNavV2?: boolean | null } = {}) {
  const orgNavV2 = signal(opts.orgNavV2 ?? false);
  const userNavV2 = signal<boolean | null>(opts.userNavV2 ?? null);
  const showAll = signal(false);
  return {
    orgNavV2,
    userNavV2,
    navV2: computed(() => userNavV2() ?? orgNavV2()),
    canSwitch: computed(() => orgNavV2() || userNavV2() !== null),
    showAll,
    saving: signal(false),
    setShowAll: vi.fn((v: boolean) => showAll.set(v)),
    setNavV2: vi.fn((v: boolean | null) => userNavV2.set(v)),
  };
}

function setup(shell = fakeShell(), v2 = false) {
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
      TranslocoTestingModule.forRoot({ langs: { en: {}, 'guidance/en': {}, 'shell/en': {} } }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: NotificationService, useValue: notifications },
      { provide: GuidanceService, useValue: guidance },
      { provide: ShellPreferencesService, useValue: shell },
    ],
  });
  const fixture = TestBed.createComponent(AccountMenu);
  fixture.componentRef.setInput('v2', v2);
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

  return { fixture, el, auth, notifications, guidance, shell, logoutAll$, openMenu, item };
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
      Array.from(
        el.querySelectorAll<HTMLButtonElement>(
          '[data-testid="guidance-level-menu"] [role="menuitemradio"]',
        ),
      );
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

describe('AccountMenu, shell v2 (U03)', () => {
  it('offers nothing about the menu while the org uses the old one', () => {
    const { el, openMenu } = setup();
    openMenu();
    expect(el.querySelector('[data-testid="account-menu-shell"]')).toBeNull();
    expect(el.querySelector('[data-testid="account-menu-display"]')!.className).toContain(
      'md:hidden',
    );
  });

  it('shows theme and language at every width, "Vis alt" and the switch back', () => {
    const shell = fakeShell({ orgNavV2: true });
    const { el, fixture, openMenu } = setup(shell, true);
    openMenu();
    expect(el.querySelector('[data-testid="account-menu-display"]')!.className).not.toContain(
      'md:hidden',
    );
    const showAll = el.querySelector<HTMLButtonElement>('[data-testid="account-menu-show-all"]')!;
    expect(showAll.getAttribute('aria-checked')).toBe('false');
    showAll.click();
    fixture.detectChanges();
    expect(shell.setShowAll).toHaveBeenCalledWith(true);

    const toggle = el.querySelector<HTMLButtonElement>('[data-testid="account-menu-nav-v2"]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    // Off differs from the org default (on): stored as the user's own choice.
    expect(shell.setNavV2).toHaveBeenCalledWith(false);
  });

  it('follows the org again when switching back to its default', () => {
    const shell = fakeShell({ orgNavV2: true, userNavV2: false });
    const { el, openMenu } = setup(shell, false);
    openMenu();
    expect(el.querySelector('[data-testid="account-menu-show-all"]')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid="account-menu-nav-v2"]')!.click();
    expect(shell.setNavV2).toHaveBeenCalledWith(null);
  });
});

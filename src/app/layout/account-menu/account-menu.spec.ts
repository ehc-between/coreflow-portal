import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { GuidanceLevel } from '../../core/guidance/guidance.models';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { InboxService } from '../../core/notifications/inbox.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { AccountMenu } from './account-menu';

interface Opts {
  readonly permissions?: string[];
  readonly superuser?: boolean;
  readonly orgs?: { id: string; name: string }[];
}

function setup(opts: Opts = {}) {
  const logoutAll$ = new Subject<void>();
  const auth = {
    user: signal({ id: 'u-1', email: 'ada@example.com', full_name: 'Ada Lovelace' }).asReadonly(),
    displayName: signal('Ada Lovelace').asReadonly(),
    isSuperuser: signal(opts.superuser ?? false).asReadonly(),
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
  const orgs = opts.orgs ?? [{ id: 'org-1', name: 'Demo AS' }];
  const currentOrgId = signal('org-1');
  const selectedOrg = {
    currentOrgId: currentOrgId.asReadonly(),
    currentOrg: signal({
      id: 'org-1',
      name: 'Demo AS',
      roles: [],
      permissions: opts.permissions ?? [],
    }).asReadonly(),
    orgs: signal(orgs).asReadonly(),
    setCurrentOrg: vi.fn((id: string) => currentOrgId.set(id)),
  };
  const inbox = {
    unreadByOrg: signal(new Map<string, number>([['org-2', 3]])).asReadonly(),
    unreadElsewhere: signal(0).asReadonly(),
    refreshByOrg: vi.fn(),
  };
  const ask = { show: vi.fn() };
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
      { provide: SelectedOrgService, useValue: selectedOrg },
      { provide: InboxService, useValue: inbox },
      { provide: AskPanelService, useValue: ask },
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

  const byTestId = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  return {
    fixture,
    el,
    auth,
    notifications,
    guidance,
    selectedOrg,
    ask,
    logoutAll$,
    openMenu,
    item,
    byTestId,
  };
}

describe('AccountMenu (IA v2 §4.5)', () => {
  it('shows the user, the company and the "Meg" group when opened', () => {
    const { el, openMenu, item, byTestId } = setup();
    expect(el.querySelector('[role="menu"]')).toBeNull();
    openMenu();
    expect(el.textContent).toContain('Ada Lovelace');
    expect(el.textContent).toContain('ada@example.com');
    expect(byTestId('account-menu-org')?.textContent).toContain('Demo AS');
    expect(item('shell.account.profile').getAttribute('href')).toBe('/account/password');
    expect(item('auth.menu.security').getAttribute('href')).toBe('/account/security');
    expect(item('auth.menu.sessions').getAttribute('href')).toBe('/account/sessions');
    expect(item('shell.account.myNotifications').getAttribute('href')).toBe(
      '/account/notifications',
    );
    // One company: no switcher.
    expect(byTestId('account-menu-orgs')).toBeNull();
  });

  it('switches company when the user belongs to more than one', () => {
    const { openMenu, byTestId, selectedOrg } = setup({
      orgs: [
        { id: 'org-1', name: 'Demo AS' },
        { id: 'org-2', name: 'Annen AS' },
      ],
    });
    openMenu();
    expect(byTestId('account-menu-orgs')).not.toBeNull();
    expect(byTestId('account-menu-org-org-1')?.getAttribute('aria-checked')).toBe('true');
    byTestId('account-menu-org-org-2')!.click();
    expect(selectedOrg.setCurrentOrg).toHaveBeenCalledWith('org-2');
  });

  it('has help and learning: the learning centre and the assistant', () => {
    const { openMenu, byTestId, ask } = setup();
    openMenu();
    expect(byTestId('account-menu-learning')?.getAttribute('href')).toBe('/account/learning');
    byTestId('account-menu-ask')!.click();
    expect(ask.show).toHaveBeenCalled();
  });

  it('hides administration without the permissions', () => {
    const { openMenu, byTestId } = setup({ permissions: ['documents:read'] });
    openMenu();
    expect(byTestId('account-menu-admin')).toBeNull();
  });

  it('shows settings, modules and setup to an org manager, all orgs to a superuser', () => {
    const { openMenu, byTestId } = setup({ permissions: ['org:manage'], superuser: true });
    openMenu();
    expect(byTestId('account-menu-settings')?.getAttribute('href')).toBe('/settings');
    expect(byTestId('account-menu-modules')?.getAttribute('href')).toBe('/settings/modules');
    expect(byTestId('account-menu-setup')?.getAttribute('href')).toBe('/setup');
    expect(byTestId('account-menu-organizations')?.getAttribute('href')).toBe(
      '/admin/organizations',
    );
  });

  it('shows settings but not setup to an inviter', () => {
    const { openMenu, byTestId } = setup({ permissions: ['users:invite'] });
    openMenu();
    expect(byTestId('account-menu-settings')).not.toBeNull();
    expect(byTestId('account-menu-setup')).toBeNull();
    expect(byTestId('account-menu-organizations')).toBeNull();
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

  it('switches the learning level and keeps the menu open', () => {
    const { el, fixture, guidance, openMenu } = setup();
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
  });
});

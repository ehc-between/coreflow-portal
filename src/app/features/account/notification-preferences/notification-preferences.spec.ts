import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { NotificationPreferencesResponse } from '../../../core/notifications/user-notification.models';
import { UserNotificationsApi } from '../../../core/notifications/user-notifications-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { NotificationPreferences } from './notification-preferences';

const PREFS: NotificationPreferencesResponse = {
  items: [
    { org_id: 'org-1', org_name: 'Acme', email_digest: true },
    { org_id: 'org-2', org_name: 'Globex', email_digest: false },
  ],
};

function setup(
  initial: () => ReturnType<UserNotificationsApi['getPreferences']> = () => of(PREFS),
) {
  const update$ = new Subject<NotificationPreferencesResponse>();
  const api = {
    getPreferences: vi.fn(initial),
    updatePreference: vi.fn(() => update$),
    getCategories: vi.fn(() => of([{ category: 'assignments', in_app: true, email: 'digest' }])),
    updateCategories: vi.fn(),
    getSchedule: vi.fn(() => of({ quiet_start: null, quiet_end: null, timezone: 'Europe/Oslo' })),
    updateSchedule: vi.fn(),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [NotificationPreferences, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      { provide: UserNotificationsApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          orgs: signal([{ id: 'org-1', name: 'Acme', roles: [], permissions: [] }]),
        },
      },
      { provide: AskPanelService, useValue: { showWith: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(NotificationPreferences);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  // The org digest switches (the page also hosts category and quiet-hours switches).
  const switches = () =>
    Array.from(
      el.querySelectorAll<HTMLButtonElement>('[data-testid="digest-card"] [role="switch"]'),
    );
  return { fixture, el, api, toasts, update$, switches, render: () => fixture.detectChanges() };
}

describe('NotificationPreferences', () => {
  it('renders a switch per org', () => {
    const { el, switches } = setup();
    expect(el.textContent).toContain('Acme');
    expect(el.textContent).toContain('Globex');
    expect(switches().map((s) => s.getAttribute('aria-checked'))).toEqual(['true', 'false']);
  });

  it('saves a toggle optimistically', () => {
    const { api, switches, render, update$, toasts } = setup();
    switches()[1].click();
    render();
    expect(api.updatePreference).toHaveBeenCalledWith({ org_id: 'org-2', email_digest: true });
    expect(switches()[1].getAttribute('aria-checked')).toBe('true');
    expect(switches()[1].disabled).toBe(true);

    update$.next({
      items: [PREFS.items[0], { ...PREFS.items[1], email_digest: true }],
    });
    render();
    expect(switches()[1].disabled).toBe(false);
    expect(toasts.success).toHaveBeenCalledWith('notifications.preferences.saved');
  });

  it('reverts a failed save', () => {
    const { switches, render, update$, toasts } = setup();
    switches()[0].click();
    render();
    expect(switches()[0].getAttribute('aria-checked')).toBe('false');
    update$.error(new Error('boom'));
    render();
    expect(switches()[0].getAttribute('aria-checked')).toBe('true');
    expect(toasts.error).toHaveBeenCalledWith('notifications.preferences.saveFailed');
  });

  it('shows the empty and error states', () => {
    const empty = setup(() => of({ items: [] }));
    expect(empty.el.querySelector('[data-testid="preferences-empty"]')).not.toBeNull();
    TestBed.resetTestingModule();

    const failed = setup(() => throwError(() => new Error('boom')));
    expect(failed.el.textContent).toContain('notifications.preferences.loadError');
  });
});

describe('NotificationPreferences sections', () => {
  it('hosts the guidance, category and quiet-hours sections', () => {
    const { el, api } = setup();
    expect(el.querySelector('[data-testid="activity-guide"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="category-row"]').length).toBe(1);
    expect(el.querySelector('[data-testid="quiet-hours"]')).not.toBeNull();
    expect(api.getCategories).toHaveBeenCalledWith('org-1');
  });
});

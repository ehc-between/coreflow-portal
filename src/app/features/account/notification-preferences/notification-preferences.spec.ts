import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { NotificationPreferencesResponse } from '../../../core/notifications/user-notification.models';
import { UserNotificationsApi } from '../../../core/notifications/user-notifications-api';
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
  const api = { getPreferences: vi.fn(initial), updatePreference: vi.fn(() => update$) };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [NotificationPreferences, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      { provide: UserNotificationsApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
    ],
  });
  const fixture = TestBed.createComponent(NotificationPreferences);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const switches = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="switch"]'));
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

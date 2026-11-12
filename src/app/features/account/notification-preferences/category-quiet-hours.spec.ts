import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { CategoryPref, NotificationSchedule } from '../../../core/notifications/activity.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { UserNotificationsApi } from '../../../core/notifications/user-notifications-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { CategoryPreferences, sortCategories } from './category-preferences';
import { QuietHours, toApiTime, toInputTime, timezoneOptions } from './quiet-hours';

const PREFS: CategoryPref[] = [
  { category: 'risk', in_app: true, email: 'digest' },
  { category: 'reminders', in_app: true, email: 'immediate' },
  { category: 'assignments', in_app: false, email: 'off' },
];
const SCHEDULE: NotificationSchedule = {
  quiet_start: '22:00:00',
  quiet_end: '07:00:00',
  timezone: 'Europe/Oslo',
};

function configure(api: Partial<Record<keyof UserNotificationsApi, unknown>>) {
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
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
    ],
  });
  return toasts;
}

describe('CategoryPreferences', () => {
  function setup(update$ = new Subject<CategoryPref[]>()) {
    const api = { getCategories: vi.fn(() => of(PREFS)), updateCategories: vi.fn(() => update$) };
    const toasts = configure(api);
    const fixture = TestBed.createComponent(CategoryPreferences);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, api, toasts, update$, render: () => fixture.detectChanges() };
  }

  it('sorts built-in categories first, then module categories', () => {
    expect(sortCategories(PREFS).map((p) => p.category)).toEqual([
      'assignments',
      'reminders',
      'risk',
    ]);
  });

  it('lists the categories for the selected org', () => {
    const { el, api } = setup();
    expect(api.getCategories).toHaveBeenCalledWith('org-1');
    expect(el.querySelectorAll('[data-testid="category-row"]')).toHaveLength(3);
  });

  it('saves an email mode change with the full list', () => {
    const { el, api, render, update$, toasts } = setup();
    const select = el.querySelectorAll<HTMLSelectElement>('[data-testid="email-mode"]')[1];
    select.value = 'off';
    select.dispatchEvent(new Event('change'));
    render();
    expect(api.updateCategories).toHaveBeenCalledWith('org-1', [
      { category: 'assignments', in_app: false, email: 'off' },
      { category: 'reminders', in_app: true, email: 'off' },
      { category: 'risk', in_app: true, email: 'digest' },
    ]);
    update$.next(PREFS.map((p) => (p.category === 'reminders' ? { ...p, email: 'off' } : p)));
    render();
    expect(toasts.success).toHaveBeenCalledWith('activity.categoriesPage.saved');
  });

  it('reverts an in-app toggle the server rejects', () => {
    const { el, render, update$, toasts } = setup();
    const toggle = () => el.querySelectorAll<HTMLButtonElement>('[role="switch"]')[0];
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    toggle().click();
    render();
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    update$.error(
      new HttpErrorResponse({ status: 422, error: { detail: { code: 'unknown_category' } } }),
    );
    render();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(toasts.error).toHaveBeenCalledWith('activity.errors.unknown_category');
  });
});

describe('QuietHours', () => {
  function setup(get: () => ReturnType<UserNotificationsApi['getSchedule']> = () => of(SCHEDULE)) {
    const api = {
      getSchedule: vi.fn(get),
      updateSchedule: vi.fn((body: NotificationSchedule) => of(body)),
    };
    const toasts = configure(api);
    const fixture = TestBed.createComponent(QuietHours);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
    return { fixture, el, api, toasts, q, render: () => fixture.detectChanges() };
  }

  it('converts between API and input times', () => {
    expect(toInputTime('22:00:00')).toBe('22:00');
    expect(toInputTime(null)).toBe('');
    expect(toApiTime('07:30')).toBe('07:30:00');
    expect(toApiTime('')).toBeNull();
    expect(timezoneOptions('America/New_York')).toContain('America/New_York');
    expect(timezoneOptions('Europe/Oslo')).toContain('Europe/Oslo');
  });

  it('shows the saved window and saves changes', () => {
    const { q, render, api, toasts } = setup();
    expect(q<HTMLInputElement>('quiet-start')!.value).toBe('22:00');
    const end = q<HTMLInputElement>('quiet-end')!;
    end.value = '06:30';
    end.dispatchEvent(new Event('input'));
    q<HTMLFormElement>('quiet-hours')!.dispatchEvent(new Event('submit'));
    render();
    expect(api.updateSchedule).toHaveBeenCalledWith({
      quiet_start: '22:00:00',
      quiet_end: '06:30:00',
      timezone: 'Europe/Oslo',
    });
    expect(toasts.success).toHaveBeenCalledWith('activity.quietHours.saved');
  });

  it('requires both ends while quiet hours are on', () => {
    const { q, render, api } = setup(() =>
      of({ quiet_start: null, quiet_end: null, timezone: 'Europe/Oslo' }),
    );
    q<HTMLButtonElement>('quiet-hours')!
      .querySelector<HTMLButtonElement>('[role="switch"]')!
      .click();
    render();
    const start = q<HTMLInputElement>('quiet-start')!;
    start.value = '21:00';
    start.dispatchEvent(new Event('input'));
    q<HTMLFormElement>('quiet-hours')!.dispatchEvent(new Event('submit'));
    render();
    expect(api.updateSchedule).not.toHaveBeenCalled();
    expect(q('quiet-error')?.textContent).toContain('activity.errors.quiet_hours_incomplete');
  });

  it('clears quiet hours when switched off', () => {
    const { q, render, api } = setup();
    q<HTMLButtonElement>('quiet-hours')!
      .querySelector<HTMLButtonElement>('[role="switch"]')!
      .click();
    render();
    q<HTMLFormElement>('quiet-hours')!.dispatchEvent(new Event('submit'));
    expect(api.updateSchedule).toHaveBeenCalledWith({
      quiet_start: null,
      quiet_end: null,
      timezone: 'Europe/Oslo',
    });
  });

  it('shows a load error', () => {
    const { el } = setup(() => throwError(() => new Error('boom')));
    expect(el.textContent).toContain('activity.quietHours.loadError');
  });
});

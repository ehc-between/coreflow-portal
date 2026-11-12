import { HttpErrorResponse } from '@angular/common/http';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { WatchersRead } from '../../core/notifications/activity.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { WatchersApi } from '../../core/notifications/watchers-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from './watch-button';

@Component({
  imports: [WatchButton],
  template: `<app-watch-button entityType="deviation" [entityId]="id()" />`,
})
class Host {
  readonly id = signal('d-1');
}

const NOT_WATCHING: WatchersRead = { watching: false, count: 1, users: [{ id: 'u2', name: 'Bo' }] };
const WATCHING: WatchersRead = {
  watching: true,
  count: 2,
  users: [
    { id: 'u1', name: 'Ada' },
    { id: 'u2', name: 'Bo' },
  ],
};

function setup(get: () => ReturnType<WatchersApi['get']> = () => of(NOT_WATCHING)) {
  const watch$ = new Subject<WatchersRead>();
  const api = {
    get: vi.fn(get),
    watch: vi.fn(() => watch$),
    unwatch: vi.fn(() => of({ ...NOT_WATCHING, count: 1 })),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [Host, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      { provide: WatchersApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal('org-1') } },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = () => el.querySelector<HTMLButtonElement>('[data-testid="watch-button"]');
  return { fixture, el, api, toasts, watch$, button, render: () => fixture.detectChanges() };
}

describe('WatchButton', () => {
  it('loads the watcher state for the record', () => {
    const { api, button } = setup();
    expect(api.get).toHaveBeenCalledWith('org-1', 'deviation', 'd-1');
    expect(button()?.getAttribute('aria-pressed')).toBe('false');
    expect(button()?.textContent).toContain('notifications.watch.follow');
  });

  it('follows and reflects the new state', () => {
    const { api, button, render, watch$, toasts } = setup();
    button()!.click();
    render();
    expect(api.watch).toHaveBeenCalledWith('org-1', 'deviation', 'd-1');
    expect(button()!.disabled).toBe(true);
    watch$.next(WATCHING);
    render();
    expect(button()!.getAttribute('aria-pressed')).toBe('true');
    expect(button()!.textContent).toContain('2');
    expect(toasts.success).toHaveBeenCalledWith('notifications.watch.followed');
  });

  it('unfollows when already following', () => {
    const { api, button, render } = setup(() => of(WATCHING));
    button()!.click();
    render();
    expect(api.unwatch).toHaveBeenCalled();
    expect(button()!.getAttribute('aria-pressed')).toBe('false');
  });

  it('hides itself for records that cannot be followed', () => {
    const { button } = setup(() =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { detail: { code: 'unsupported_entity_type' } },
          }),
      ),
    );
    expect(button()).toBeNull();
  });

  it('reloads when the record changes', () => {
    const { fixture, api, render } = setup();
    fixture.componentInstance.id.set('d-2');
    render();
    expect(api.get).toHaveBeenLastCalledWith('org-1', 'deviation', 'd-2');
  });
});

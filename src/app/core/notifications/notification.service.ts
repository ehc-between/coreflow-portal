import { Injectable, signal } from '@angular/core';

export type NotificationLevel = 'success' | 'info' | 'warning' | 'error';

export interface AppNotification {
  readonly id: number;
  readonly level: NotificationLevel;
  /** i18n key (preferred) or literal text to display. */
  readonly message: string;
  /** Optional interpolation params for the i18n key. */
  readonly params?: Record<string, unknown>;
}

/**
 * Tiny signal-based notification store. Components (e.g. a toast container in
 * the layout) read `notifications()` and render them; anything in the app can
 * push messages. Messages are i18n keys by convention so the UI translates them.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _notifications = signal<readonly AppNotification[]>([]);
  /** Read-only view of the current notifications. */
  readonly notifications = this._notifications.asReadonly();

  private nextId = 1;

  success(message: string, params?: Record<string, unknown>): void {
    this.push('success', message, params);
  }

  info(message: string, params?: Record<string, unknown>): void {
    this.push('info', message, params);
  }

  warning(message: string, params?: Record<string, unknown>): void {
    this.push('warning', message, params);
  }

  error(message: string, params?: Record<string, unknown>): void {
    this.push('error', message, params);
  }

  dismiss(id: number): void {
    this._notifications.update((list) => list.filter((n) => n.id !== id));
  }

  clear(): void {
    this._notifications.set([]);
  }

  private push(level: NotificationLevel, message: string, params?: Record<string, unknown>): void {
    const notification: AppNotification = { id: this.nextId++, level, message, params };
    this._notifications.update((list) => [...list, notification]);
  }
}

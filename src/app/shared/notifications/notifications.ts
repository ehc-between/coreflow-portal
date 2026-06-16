import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  NotificationLevel,
  NotificationService,
} from '../../core/notifications/notification.service';

/**
 * Toast container. Renders the NotificationService's signal-backed list and
 * translates each message key. Drop it once near the app root.
 */
@Component({
  selector: 'app-notifications',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      @for (n of notifications.notifications(); track n.id) {
        <div
          role="alert"
          class="animate-cf-pop pointer-events-auto flex items-start justify-between gap-3 rounded-card border px-3.5 py-2.5 shadow-pop"
          [class]="levelClasses[n.level]"
        >
          <span class="text-[13.5px] font-medium">{{ n.message | transloco: n.params }}</span>
          <button
            type="button"
            class="text-[11px] font-semibold tracking-wide uppercase opacity-70 hover:opacity-100"
            (click)="notifications.dismiss(n.id)"
          >
            {{ 'common.dismiss' | transloco }}
          </button>
        </div>
      }
    </div>
  `,
})
export class Notifications {
  protected readonly notifications = inject(NotificationService);

  protected readonly levelClasses: Record<NotificationLevel, string> = {
    success: 'border-pass/30 bg-pass-soft text-pass',
    info: 'border-info/30 bg-info-soft text-info',
    warning: 'border-warn/30 bg-warn-soft text-warn',
    error: 'border-fail/30 bg-fail-soft text-fail',
  };
}

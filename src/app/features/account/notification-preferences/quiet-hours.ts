import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DEFAULT_TIMEZONE,
  NotificationSchedule,
} from '../../../core/notifications/activity.models';
import { activityErrorKey } from '../../../core/notifications/activity-errors';
import { NotificationService } from '../../../core/notifications/notification.service';
import { UserNotificationsApi } from '../../../core/notifications/user-notifications-api';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Switch } from '../../../shared/ui/switch/switch';

/** `HH:MM:SS` (API) -> `HH:MM` (time input). */
export function toInputTime(value: string | null): string {
  return value ? value.slice(0, 5) : '';
}

/** `HH:MM` (time input) -> `HH:MM:00` (API), or null when empty. */
export function toApiTime(value: string): string | null {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : null;
}

/** IANA zones the browser knows, always including the saved and default zone. */
export function timezoneOptions(current: string): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  const set = new Set([...zones, DEFAULT_TIMEZONE, current].filter(Boolean));
  return [...set].sort();
}

/**
 * Quiet hours: during this local time window immediate emails wait for the
 * daily digest instead. In-app notifications are never held back.
 */
@Component({
  selector: 'app-quiet-hours',
  imports: [TranslocoPipe, Card, FormField, Switch, Button, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <h2 class="text-[14.5px] font-semibold text-fg">
        {{ 'activity.quietHours.title' | transloco }}
      </h2>
      <p class="mt-0.5 text-[12.5px] text-fg-muted">
        {{ 'activity.quietHours.subtitle' | transloco }}
      </p>

      @if (loading()) {
        <p class="mt-4 text-[13px] text-fg-muted">{{ 'activity.page.loading' | transloco }}</p>
      } @else if (loadError()) {
        <div class="mt-4">
          <app-alert>{{ 'activity.quietHours.loadError' | transloco }}</app-alert>
        </div>
      } @else {
        <form class="mt-4 flex flex-col gap-4" (submit)="save($event)" data-testid="quiet-hours">
          <app-switch [checked]="enabled()" (checkedChange)="enabled.set($event)">
            {{ 'activity.quietHours.enable' | transloco }}
          </app-switch>

          @if (enabled()) {
            <div class="grid gap-4 sm:grid-cols-2">
              <app-form-field
                inputId="quiet-start"
                [label]="'activity.quietHours.from' | transloco"
              >
                <input
                  id="quiet-start"
                  type="time"
                  data-testid="quiet-start"
                  [value]="start()"
                  (input)="start.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field inputId="quiet-end" [label]="'activity.quietHours.to' | transloco">
                <input
                  id="quiet-end"
                  type="time"
                  data-testid="quiet-end"
                  [value]="end()"
                  (input)="end.set($any($event.target).value)"
                />
              </app-form-field>
            </div>
          }

          <app-form-field inputId="quiet-zone" [label]="'activity.quietHours.timezone' | transloco">
            <select
              id="quiet-zone"
              data-testid="quiet-zone"
              (change)="timezone.set($any($event.target).value)"
            >
              @for (zone of zones(); track zone) {
                <option [value]="zone" [selected]="zone === timezone()">{{ zone }}</option>
              }
            </select>
          </app-form-field>

          @if (problemKey(); as p) {
            <app-alert data-testid="quiet-error">{{ p | transloco }}</app-alert>
          }

          <div class="flex justify-end">
            <app-button type="submit" [loading]="saving()" data-testid="quiet-save">
              {{ 'activity.quietHours.save' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-card>
  `,
})
export class QuietHours implements OnInit {
  private readonly api = inject(UserNotificationsApi);
  private readonly toasts = inject(NotificationService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly enabled = signal(false);
  protected readonly start = signal('');
  protected readonly end = signal('');
  protected readonly timezone = signal(DEFAULT_TIMEZONE);
  protected readonly zones = signal<readonly string[]>(timezoneOptions(DEFAULT_TIMEZONE));
  protected readonly problemKey = signal<string | null>(null);

  ngOnInit(): void {
    this.api.getSchedule().subscribe({
      next: (schedule) => {
        this.apply(schedule);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  private apply(schedule: NotificationSchedule): void {
    this.enabled.set(schedule.quiet_start !== null && schedule.quiet_end !== null);
    this.start.set(toInputTime(schedule.quiet_start));
    this.end.set(toInputTime(schedule.quiet_end));
    const zone = schedule.timezone || DEFAULT_TIMEZONE;
    this.timezone.set(zone);
    this.zones.set(timezoneOptions(zone));
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (this.saving()) return;
    this.problemKey.set(null);
    const start = this.enabled() ? toApiTime(this.start()) : null;
    const end = this.enabled() ? toApiTime(this.end()) : null;
    if (this.enabled() && (start === null || end === null)) {
      this.problemKey.set('activity.errors.quiet_hours_incomplete');
      return;
    }
    if (start !== null && start === end) {
      this.problemKey.set('activity.quietHours.sameTimes');
      return;
    }
    this.saving.set(true);
    this.api
      .updateSchedule({ quiet_start: start, quiet_end: end, timezone: this.timezone() })
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.apply(saved);
          this.toasts.success('activity.quietHours.saved');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.problemKey.set(activityErrorKey(error));
        },
      });
  }
}

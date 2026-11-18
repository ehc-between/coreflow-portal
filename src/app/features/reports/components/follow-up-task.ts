import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { TaskForm, TaskFormResult, TaskFormValue } from '../../../shared/tasks/task-form';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { CalendarItem } from '../data/reports.models';

/**
 * "Lag oppgave" from an overdue or upcoming item of the overview or the calendar:
 * the shared task form in a side panel, with the new task linked to the record the
 * item belongs to (so it shows on that record's Tasks tab and in My Work).
 */
@Component({
  selector: 'app-follow-up-task',
  imports: [TranslocoPipe, SlideOver, TaskForm],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="!!item()"
      [title]="'reports.followUp.title' | transloco"
      [subtitle]="subtitle()"
      [closeLabel]="'reports.common.close' | transloco"
      [width]="560"
      (closed)="closed.emit()"
    >
      @if (value(); as v) {
        <app-task-form [value]="v" (saved)="onSaved($event)" (cancelled)="closed.emit()" />
      }
    </app-slide-over>
  `,
})
export class FollowUpTask {
  private readonly notifications = inject(NotificationService);

  /** The item to follow up (null: closed). */
  readonly item = input<CalendarItem | null>(null);
  readonly closed = output<void>();

  protected readonly subtitle = computed(() => {
    const item = this.item();
    return item ? [item.code, item.title].filter(Boolean).join(' · ') : '';
  });

  protected readonly value = computed<TaskFormValue | null>(() => {
    const item = this.item();
    return item
      ? {
          entityType: item.entity_type,
          entityId: item.entity_id,
          entityLabel: this.subtitle(),
        }
      : null;
  });

  protected onSaved(result: TaskFormResult): void {
    if (result.task) {
      this.notifications.success('reports.followUp.created');
    }
    this.closed.emit();
  }
}

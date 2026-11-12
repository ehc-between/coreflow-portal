import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TaskGuideIntro } from '../../../shared/tasks/guidance/task-guide-intro';
import { TaskWhyItMatters } from '../../../shared/tasks/guidance/task-why-it-matters';
import { TaskForm, TaskFormResult, TaskFormValue } from '../../../shared/tasks/task-form';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { provideTasksPageContext } from '../tasks-page-context';

/**
 * New task page (`/tasks/new`). Query params prefill the form: `entity_type` +
 * `entity_id` link it to a record, `recurring=1` starts it as a recurring series,
 * `title` and `due` (`YYYY-MM-DD`) prefill those fields.
 */
@Component({
  selector: 'app-task-new',
  imports: [RouterLink, TranslocoPipe, Card, Icon, TaskForm, TaskGuideIntro, TaskWhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/tasks"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'tasks.common.backToTasks' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
        {{ (value().recurring ? 'tasks.new.recurringTitle' : 'tasks.new.title') | transloco }}
      </h1>
      <div class="mb-4"><app-task-guide-intro page="form" /></div>
      <app-card>
        <app-task-form [value]="value()" (saved)="onSaved($event)" (cancelled)="back()" />
      </app-card>
      <div class="mt-6"><app-task-why-it-matters page="form" /></div>
    </div>
  `,
})
export class TaskNew {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly value = computed<TaskFormValue>(() => {
    const p = this.params();
    const due = p.get('due');
    return {
      entityType: p.get('entity_type'),
      entityId: p.get('entity_id'),
      recurring: p.get('recurring') === '1',
      title: p.get('title') ?? undefined,
      dueDay: due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined,
    };
  });

  constructor() {
    provideTasksPageContext(() => ({
      module: 'tasks',
      entityType: 'task',
      view: 'new',
      title: this.language.translate('tasks.new.title'),
    }));
  }

  protected onSaved(result: TaskFormResult): void {
    this.notifications.success('tasks.notices.created');
    if (result.task) {
      void this.router.navigate(['/tasks', result.task.id]);
    } else {
      this.back();
    }
  }

  protected back(): void {
    void this.router.navigate(['/tasks']);
  }
}

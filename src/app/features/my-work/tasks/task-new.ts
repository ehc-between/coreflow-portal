import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TaskGuideIntro } from '../../../shared/tasks/guidance/task-guide-intro';
import { TaskWhyItMatters } from '../../../shared/tasks/guidance/task-why-it-matters';
import { TaskForm, TaskFormResult, TaskFormValue } from '../../../shared/tasks/task-form';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { goBack } from '../go-back';
import { provideTasksPageContext } from '../tasks-page-context';

/**
 * New task page (`/tasks/new`). Query params prefill the form: `entity_type` +
 * `entity_id` link it to a record, `recurring=1` starts it as a recurring series,
 * `title` and `due` (`YYYY-MM-DD`) prefill those fields.
 */
@Component({
  selector: 'app-task-new',
  imports: [PageHeader, TaskForm, TaskGuideIntro, TaskWhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="value().recurring ? 'tasks.new.recurringTitle' : 'tasks.new.title'"
        [breadcrumbs]="[
          { labelKey: 'nav.myWork', link: '/my-work' },
          { labelKey: 'tasks.list.title', link: '/tasks' },
          { labelKey: value().recurring ? 'tasks.new.recurringTitle' : 'tasks.new.title' },
        ]"
        backLink="/tasks"
        backLabelKey="tasks.common.backToTasks"
      />
      <div class="mb-5"><app-task-guide-intro page="form" /></div>
      <app-task-form
        layout="page"
        [value]="value()"
        (saved)="onSaved($event)"
        (cancelled)="back()"
      />
      <div class="mt-6"><app-task-why-it-matters page="form" /></div>
    </div>
  `,
})
export class TaskNew {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
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

  /** Cancel returns to where the user came from (U08); a direct visit lands in My Work. */
  protected back(): void {
    goBack(this.router, this.location, ['/my-work']);
  }
}

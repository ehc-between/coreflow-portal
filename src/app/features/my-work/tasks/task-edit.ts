import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TaskDetail } from '../../../core/tasks/task.models';
import { TasksApi } from '../../../core/tasks/tasks-api';
import { TaskGuideIntro } from '../../../shared/tasks/guidance/task-guide-intro';
import { isClosedStatus } from '../../../shared/tasks/task-display';
import { TaskForm, TaskFormResult, TaskFormValue } from '../../../shared/tasks/task-form';
import { Alert } from '../../../shared/ui/alert/alert';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { goBack } from '../go-back';
import { provideTasksPageContext } from '../tasks-page-context';

/**
 * Edit a task (`/tasks/:id/edit`): title, description, assignee, priority and
 * dates. Closed tasks and tasks the caller may not edit are shown read-only with a
 * hint; the checklist and status are changed on the detail page.
 */
@Component({
  selector: 'app-task-edit',
  imports: [TranslocoPipe, Alert, LoadingState, PageHeader, TaskForm, TaskGuideIntro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="tasks.edit.title"
        [breadcrumbs]="[
          { labelKey: 'nav.myWork', link: '/my-work' },
          { labelKey: 'tasks.list.title', link: '/tasks' },
          { label: task()?.title ?? '', link: ['/tasks', id()] },
          { labelKey: 'tasks.edit.title' },
        ]"
        [backLink]="['/tasks', id()]"
        backLabelKey="tasks.common.backToTask"
      />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-alert tone="error">{{ 'tasks.detail.notFound' | transloco }}</app-alert>
        }
        @case ('ready') {
          @if (task(); as task) {
            @if (!task.can_edit) {
              <app-alert tone="info">{{ 'tasks.edit.noRights' | transloco }}</app-alert>
            } @else if (closed()) {
              <app-alert tone="info">{{ 'tasks.errors.task_closed' | transloco }}</app-alert>
            } @else {
              <div class="mb-5"><app-task-guide-intro page="form" /></div>
              <app-task-form
                layout="page"
                [value]="formValue()"
                (saved)="onSaved($event)"
                (cancelled)="back()"
              />
            }
          }
        }
      }
    </div>
  `,
})
export class TaskEdit {
  private readonly api = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notifications = inject(NotificationService);

  /** Route param (component input binding). */
  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly task = signal<TaskDetail | null>(null);
  protected readonly closed = computed(() => isClosedStatus(this.task()?.status));
  protected readonly formValue = computed<TaskFormValue>(() => ({ task: this.task() }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    provideTasksPageContext(() => ({
      module: 'tasks',
      entityType: 'task',
      entityId: this.id(),
      view: 'edit',
      title: this.task()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected onSaved(result: TaskFormResult): void {
    this.notifications.success('tasks.notices.saved');
    void this.router.navigate(['/tasks', result.task?.id ?? this.id()]);
  }

  /** Cancel returns to where the user came from (U08); a direct visit lands on the task. */
  protected back(): void {
    goBack(this.router, this.location, ['/tasks', this.id()]);
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (task) => {
        this.task.set(task);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

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
import { Router, RouterLink } from '@angular/router';
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
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { provideTasksPageContext } from '../tasks-page-context';

/**
 * Edit a task (`/tasks/:id/edit`): title, description, assignee, priority and
 * dates. Closed tasks and tasks the caller may not edit are shown read-only with a
 * hint; the checklist and status are changed on the detail page.
 */
@Component({
  selector: 'app-task-edit',
  imports: [RouterLink, TranslocoPipe, Alert, Card, Icon, TaskForm, TaskGuideIntro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-7 pb-12 sm:px-8">
      <a
        [routerLink]="['/tasks', id()]"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ 'tasks.common.backToTask' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
        {{ 'tasks.edit.title' | transloco }}
      </h1>
      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'tasks.common.loading' | transloco }}</p>
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
              <div class="mb-4"><app-task-guide-intro page="form" /></div>
              <app-card>
                <app-task-form
                  [value]="formValue()"
                  (saved)="onSaved($event)"
                  (cancelled)="back()"
                />
              </app-card>
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

  protected back(): void {
    void this.router.navigate(['/tasks', this.id()]);
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

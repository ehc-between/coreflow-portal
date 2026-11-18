import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HelpStrip } from '../../ui/help-strip/help-strip';

/** The lesson each task page offers behind its "?" (`lessons.<key>` of the tasks file). */
export const TASK_PAGE_LESSONS: Readonly<Record<string, string>> = {
  list: 'assigning-work',
  recurring: 'recurring-controls',
  detail: 'working-with-tasks',
};

/**
 * Learning-mode intro of a task page (`pages.<page>` of the tasks guidance file).
 * U38: the task pages now use the one shared help entry point, `<app-help-strip>`
 * (a single line and a "?"), with the page's lesson behind the "?". The inline
 * `<app-task-lesson>` and `<app-task-why-it-matters>` hand over to it.
 */
@Component({
  selector: 'app-task-guide-intro',
  imports: [HelpStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<app-help-strip scope="tasks" [page]="page()" [lesson]="lesson()" />`,
})
export class TaskGuideIntro {
  /** Page key in the guidance file (`myWork`, `list`, `detail`, `form`, `recurring`). */
  readonly page = input.required<string>();

  protected readonly lesson = computed(() => TASK_PAGE_LESSONS[this.page()] ?? null);
}

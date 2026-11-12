import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TasksGuidance } from '../../../core/tasks/tasks-guidance';
import { MarkdownPipe } from '../../markdown/markdown.pipe';
import { Button } from '../../ui/button/button';
import { Icon } from '../../ui/icon/icon';

/**
 * Teaching empty state (`pages.<page>.empty`): explains what belongs here and why,
 * with an optional call to action. Falls back to the projected content while the
 * guidance loads. Interim for F6's `<app-teaching-empty>`.
 */
@Component({
  selector: 'app-task-teaching-empty',
  imports: [MarkdownPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span
        class="flex h-11 w-11 items-center justify-center rounded-card border border-accent-border bg-accent-soft text-accent"
      >
        <app-icon [name]="icon()" [size]="20" />
      </span>
      @if (empty(); as empty) {
        <h3 class="font-display text-[16px] font-bold text-fg">{{ empty.title }}</h3>
        <div
          class="cf-prose max-w-md text-[13.5px] leading-relaxed text-fg-muted"
          [innerHTML]="empty.body | appMarkdown"
        ></div>
        @if (empty.cta && showAction()) {
          <app-button size="sm" (click)="action.emit()">{{ empty.cta }}</app-button>
        }
      } @else {
        <ng-content />
      }
    </div>
  `,
})
export class TaskTeachingEmpty {
  private readonly guidance = inject(TasksGuidance);

  readonly page = input.required<string>();
  readonly icon = input('checkcircle');
  /** Hide the call to action (e.g. when the user may not create tasks). */
  readonly showAction = input(true);
  readonly action = output<void>();

  protected readonly empty = computed(() => this.guidance.file()?.pages[this.page()]?.empty);
}

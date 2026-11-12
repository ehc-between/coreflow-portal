import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { TasksGuidance } from '../../../core/tasks/tasks-guidance';

let nextId = 0;

/**
 * Inline field help for a task form field (`pages.<page>.fields.<field>`): a small
 * `?` toggle that reveals the help text and an example. Interim for F6's
 * `<app-field-help>`.
 */
@Component({
  selector: 'app-task-field-help',
  imports: [TranslocoPipe],
  providers: [provideTranslocoScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (help(); as help) {
      <span class="inline-flex flex-col">
        <button
          type="button"
          class="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border text-[11px] font-bold text-fg-subtle hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          [attr.aria-label]="'tasks.guide.fieldHelp' | transloco"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="id"
          (click)="open.set(!open())"
        >
          ?
        </button>
      </span>
      @if (open()) {
        <span [id]="id" class="mt-1 block text-[12.5px] leading-relaxed font-normal text-fg-muted">
          {{ help.help }}
          @if (help.example) {
            <span class="mt-0.5 block text-fg-subtle italic">
              {{ 'tasks.guide.example' | transloco: { example: help.example } }}
            </span>
          }
        </span>
      }
    }
  `,
})
export class TaskFieldHelp {
  private readonly guidance = inject(TasksGuidance);

  readonly page = input.required<string>();
  readonly field = input.required<string>();

  protected readonly id = `task-field-help-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly help = computed(
    () => this.guidance.file()?.pages[this.page()]?.fields?.[this.field()] ?? null,
  );
}

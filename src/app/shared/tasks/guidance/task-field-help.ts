import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { TasksGuidance } from '../../../core/tasks/tasks-guidance';

let nextId = 0;

/**
 * Field help for a task form field (`pages.<page>.fields.<field>`): a `?` toggletip
 * that goes in the `app-form-field` label row (`label-suffix`) and opens the help text
 * and an example in a small popover, like `<app-field-help>` (docs/ux-guide.md §2.4
 * rule 2). Closes on Escape and on a click outside.
 *
 *   <app-form-field [label]="…" inputId="…">
 *     <app-task-field-help label-suffix page="form" field="title" />
 *     <input … />
 *   </app-form-field>
 */
@Component({
  selector: 'app-task-field-help',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-flex empty:hidden',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'open.set(false)',
  },
  template: `
    @if (help(); as help) {
      <button
        type="button"
        data-testid="task-field-help-toggle"
        class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-micro leading-none font-bold text-fg-muted hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        [attr.aria-label]="'tasks.guide.fieldHelp' | transloco"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="id"
        (click)="open.set(!open())"
      >
        ?
      </button>
      <div [id]="id" role="status" aria-live="polite">
        @if (open()) {
          <div
            data-testid="task-field-help-popover"
            class="absolute top-full left-0 z-30 mt-1.5 w-64 max-w-[80vw] rounded-tile border border-border bg-surface p-3 text-meta leading-snug font-normal text-fg shadow-pop"
          >
            {{ help.help }}
            @if (help.example) {
              <span class="mt-1 block text-fg-muted">
                {{ 'tasks.guide.example' | transloco: { example: help.example } }}
              </span>
            }
          </div>
        }
      </div>
    }
  `,
})
export class TaskFieldHelp {
  private readonly guidance = inject(TasksGuidance);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly page = input.required<string>();
  readonly field = input.required<string>();

  protected readonly id = `task-field-help-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly help = computed(
    () => this.guidance.file()?.pages[this.page()]?.fields?.[this.field()] ?? null,
  );

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}

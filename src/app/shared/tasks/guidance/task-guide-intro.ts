import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { TasksGuidance } from '../../../core/tasks/tasks-guidance';
import { MarkdownPipe } from '../../markdown/markdown.pipe';
import { Icon } from '../../ui/icon/icon';

const STORAGE_KEY = 'coreflow.tasks.guide.collapsed';

function readCollapsed(): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(pages: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...pages]));
  } catch {
    // Best-effort preference.
  }
}

/**
 * Learning-mode page intro for a task page (`pages.<page>.intro` of the tasks
 * guidance file): a short explanation plus guided steps. Expanded until the user
 * collapses it; the choice is remembered per page. Interim for F6's `<app-guide-intro>`.
 */
@Component({
  selector: 'app-task-guide-intro',
  imports: [TranslocoPipe, MarkdownPipe, Icon],
  providers: [provideTranslocoScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (intro(); as intro) {
      <section
        class="rounded-card border border-accent-border bg-accent-soft/60 px-4 py-3"
        [attr.aria-label]="'tasks.guide.introLabel' | transloco"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 text-left"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="bodyId()"
          (click)="toggle()"
        >
          <app-icon name="spark" [size]="15" class="flex-none text-accent" />
          <span class="min-w-0 flex-1 text-[13.5px] font-semibold text-fg">{{ intro.title }}</span>
          <span class="text-[12px] font-semibold text-accent">
            {{ (open() ? 'tasks.guide.hide' : 'tasks.guide.show') | transloco }}
          </span>
        </button>
        @if (open()) {
          <div [id]="bodyId()" class="mt-2 text-[13px] leading-relaxed text-fg-muted">
            <div class="cf-prose" [innerHTML]="intro.body | appMarkdown"></div>
            @if (intro.steps?.length) {
              <ol class="mt-2 list-decimal space-y-1 pl-5">
                @for (step of intro.steps; track $index) {
                  <li>{{ step }}</li>
                }
              </ol>
            }
          </div>
        }
      </section>
    }
  `,
})
export class TaskGuideIntro {
  private readonly guidance = inject(TasksGuidance);

  /** Page key in the guidance file (`myWork`, `list`, `detail`, `form`, `recurring`). */
  readonly page = input.required<string>();

  protected readonly intro = computed(() => this.guidance.file()?.pages[this.page()]?.intro);
  protected readonly bodyId = computed(() => `task-guide-${this.page()}`);

  private readonly collapsed = signal(readCollapsed());
  protected readonly open = computed(() => !this.collapsed().has(this.page()));

  protected toggle(): void {
    const next = new Set(this.collapsed());
    if (next.has(this.page())) {
      next.delete(this.page());
    } else {
      next.add(this.page());
    }
    this.collapsed.set(next);
    writeCollapsed(next);
  }
}

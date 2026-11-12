import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../../core/guidance/guidance-content.service';
import { LessonView } from '../../../shared/guidance/lesson';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';

/**
 * A launcher for one of the module's micro-lessons (`context` guidance file):
 * a chip button that opens `<app-lesson>` (which records learning progress) in a
 * side panel. Hidden until the lesson content has loaded.
 */
@Component({
  selector: 'app-context-lesson-button',
  imports: [TranslocoPipe, Icon, LessonView, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as lesson) {
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-semibold text-fg-muted hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        (click)="open.set(true)"
        [attr.data-testid]="'lesson-' + lessonKey()"
      >
        <app-icon name="training" [size]="14" />
        {{ 'context.lessons.button' | transloco: { title: lesson.title, minutes: lesson.minutes } }}
      </button>
      <app-slide-over
        [open]="open()"
        [title]="lesson.title"
        [subtitle]="'context.lessons.minutes' | transloco: { minutes: lesson.minutes }"
        [closeLabel]="'context.common.close' | transloco"
        [width]="560"
        (closed)="open.set(false)"
      >
        @if (open()) {
          <app-lesson scope="context" [lesson]="lessonKey()" />
        }
      </app-slide-over>
    }
  `,
})
export class ContextLessonButton {
  private readonly guidance = inject(GuidanceContentService);

  readonly lessonKey = input.required<string>();

  protected readonly open = signal(false);
  protected readonly content = computed(() =>
    this.guidance.readLesson('context', this.lessonKey()),
  );
}

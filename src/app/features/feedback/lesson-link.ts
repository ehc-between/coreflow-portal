import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * A compact link to one of the feedback micro-lessons (played on the learning
 * page, `/account/learning/feedback/<lesson>`, which records progress).
 */
@Component({
  selector: 'app-feedback-lesson-link',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lessonContent(); as l) {
      <a
        [routerLink]="['/account/learning', 'feedback', lesson()]"
        class="inline-flex items-center gap-1.5 rounded-tile px-2 py-1 text-[12.5px] font-semibold text-accent hover:bg-accent-soft"
        [attr.data-testid]="'lesson-link-' + lesson()"
      >
        <app-icon name="training" [size]="14" />
        {{ 'feedback.lessons.link' | transloco: { title: l.title, minutes: l.minutes } }}
      </a>
    }
  `,
})
export class FeedbackLessonLink {
  private readonly content = inject(GuidanceContentService);
  readonly lesson = input.required<string>();
  protected readonly lessonContent = computed(() =>
    this.content.readLesson('feedback', this.lesson()),
  );
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../../core/guidance/guidance-content.service';
import { LessonView } from '../../../shared/guidance/lesson';
import { AI_GOVERNANCE_SCOPE } from '../data/ai-governance-display';

/**
 * A module micro-lesson behind a disclosure ("Lesson: <title> · n min"), so the
 * full lesson player only takes space once opened. Hidden when the guidance
 * file has no such lesson.
 */
@Component({
  selector: 'app-ai-lesson-card',
  imports: [TranslocoPipe, LessonView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (meta(); as m) {
      <details class="group rounded-card border border-border bg-surface" data-testid="ai-lesson">
        <summary
          class="flex cursor-pointer list-none items-center gap-2 rounded-card px-4 py-3 text-[13.5px] font-semibold text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <span
            class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-soft text-[12px] text-accent"
            aria-hidden="true"
            >&#9654;</span
          >
          <span class="min-w-0 flex-1">
            {{ 'aiGovernance.lesson.label' | transloco: { title: m.title, minutes: m.minutes } }}
          </span>
        </summary>
        <div class="border-t border-border px-4 py-4">
          <app-lesson [scope]="scope" [lesson]="lesson()" />
        </div>
      </details>
    }
  `,
})
export class AiLessonCard {
  private readonly content = inject(GuidanceContentService);

  readonly lesson = input.required<string>();

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly meta = computed(() => this.content.readLesson(this.scope, this.lesson()));
}

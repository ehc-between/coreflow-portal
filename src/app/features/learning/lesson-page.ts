import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { LessonResult } from '../../core/guidance/guidance.models';
import { LessonView } from '../../shared/guidance/lesson';
import { TeachMe } from '../../shared/guidance/teach-me';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';

/** `/account/learning/:scope/:lesson`: plays one micro-lesson and records progress. */
@Component({
  selector: 'app-lesson-page',
  imports: [RouterLink, TranslocoPipe, LessonView, TeachMe, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-7 pb-12 sm:px-8">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <a
          routerLink="/account/learning"
          class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="15" />
          {{ 'guidance.centre.backToCentre' | transloco }}
        </a>
        <app-teach-me [topic]="scope() + '.' + lesson()" [subject]="title()" />
      </div>
      <app-card>
        <div class="p-1 sm:p-2">
          <app-lesson [scope]="scope()" [lesson]="lesson()" (finished)="onFinished($event)" />
        </div>
      </app-card>
      @if (done()) {
        <div
          data-testid="lesson-done"
          role="status"
          class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-pass/30 bg-pass-soft px-4 py-3 text-[13.5px] font-semibold text-pass"
        >
          {{ 'guidance.lesson.recorded' | transloco }}
          <a routerLink="/account/learning" class="text-accent hover:underline">
            {{ 'guidance.centre.backToCentre' | transloco }}
          </a>
        </div>
      }
    </div>
  `,
})
export class LessonPage {
  private readonly content = inject(GuidanceContentService);

  /** Route params (component input binding). */
  readonly scope = input.required<string>();
  readonly lesson = input.required<string>();

  protected readonly done = signal(false);
  protected readonly title = computed(
    () => this.content.readLesson(this.scope(), this.lesson())?.title ?? null,
  );

  protected onFinished(result: LessonResult): void {
    this.done.set(result.passed !== false);
  }
}

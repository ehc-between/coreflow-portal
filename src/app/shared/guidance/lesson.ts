import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { LessonResult, progressLessonKey } from '../../core/guidance/guidance.models';
import { LearningProgressService } from '../../core/guidance/learning-progress.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { Badge } from '../ui/badge/badge';
import { LessonPlayer } from './lesson-player';

/**
 * A micro-lesson from the guidance file (`lessons.<lesson>`), played with
 * `<app-lesson-player>` and recorded as learning progress (`"<scope>.<lesson>"`):
 * "seen" when it opens, "completed" at the end, or the quiz result.
 */
@Component({
  selector: 'app-lesson',
  imports: [TranslocoPipe, Badge, LessonPlayer],
  providers: [provideTranslocoScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (content(); as lesson) {
      @if (progress(); as p) {
        <div class="mb-3 flex flex-wrap gap-2" data-testid="lesson-status">
          @if (p.completed_at) {
            <app-badge tone="pass">{{ 'guidance.lesson.completed' | transloco }}</app-badge>
          }
          @if (p.quiz_passed) {
            <app-badge tone="pass">
              {{ 'guidance.quiz.passedBadge' | transloco: { score: p.quiz_score } }}
            </app-badge>
          } @else if (p.attempts > 0) {
            <app-badge tone="warn">
              {{ 'guidance.quiz.attempts' | transloco: { count: p.attempts, score: p.quiz_score } }}
            </app-badge>
          }
        </div>
      }
      <app-lesson-player [lesson]="lesson" (completed)="onCompleted($event)" />
    } @else if (loaded()) {
      <p data-testid="lesson-missing" class="text-[13.5px] text-fg-muted">
        {{ 'guidance.lesson.missing' | transloco }}
      </p>
    } @else {
      <p class="text-[13.5px] text-fg-muted">{{ 'guidance.loading' | transloco }}</p>
    }
  `,
})
export class LessonView {
  private readonly guidanceContent = inject(GuidanceContentService);
  private readonly progressService = inject(LearningProgressService);
  private readonly toasts = inject(NotificationService);

  readonly scope = input.required<string>();
  readonly lesson = input.required<string>();
  /** Re-emits the player's result once it has been recorded. */
  readonly finished = output<LessonResult>();

  protected readonly content = computed(() =>
    this.guidanceContent.readLesson(this.scope(), this.lesson()),
  );
  protected readonly loaded = computed(() => this.guidanceContent.readLoaded(this.scope()));
  protected readonly lessonKey = computed(() => progressLessonKey(this.scope(), this.lesson()));
  protected readonly progress = computed(
    () => this.progressService.byKey().get(this.lessonKey()) ?? null,
  );

  /** Lesson keys this view already marked as seen. */
  private readonly seen = new Set<string>();

  constructor() {
    this.progressService.ensureLoaded();
    effect(() => {
      const ready = this.content() !== null;
      const key = this.lessonKey();
      const scope = this.scope();
      if (ready && !this.seen.has(key)) {
        this.seen.add(key);
        untracked(() =>
          this.progressService.record(scope, key, 'seen').subscribe({ error: () => undefined }),
        );
      }
    });
  }

  protected onCompleted(result: LessonResult): void {
    const scope = this.scope();
    const key = this.lessonKey();
    const request =
      result.score !== null && result.passed !== null
        ? this.progressService.record(scope, key, 'quiz', {
            score: result.score,
            passed: result.passed,
          })
        : this.progressService.record(scope, key, 'completed');
    request.subscribe({
      next: () => this.finished.emit(result),
      error: () => this.toasts.error('guidance.lesson.saveFailed'),
    });
  }
}

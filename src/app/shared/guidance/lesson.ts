import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { LessonResult, progressLessonKey } from '../../core/guidance/guidance.models';
import { LearningProgressService } from '../../core/guidance/learning-progress.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { Badge } from '../ui/badge/badge';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LessonPlayer } from './lesson-player';

/**
 * A micro-lesson from the guidance file (`lessons.<lesson>`), played with
 * `<app-lesson-player>` and recorded as learning progress (`"<scope>.<lesson>"`):
 * "seen" once the learner moves past the first page (U38: showing a lesson, e.g. on a
 * page visit, does not count it as started), "completed" at the end, or the quiz result.
 */
@Component({
  selector: 'app-lesson',
  imports: [TranslocoPipe, Badge, LessonPlayer],
  viewProviders: [provideSharedScope('guidance')],
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
      <app-lesson-player
        [lesson]="lesson"
        (started)="onStarted()"
        (completed)="onCompleted($event)"
      />
    } @else if (loaded()) {
      <p data-testid="lesson-missing" class="text-ui text-fg-muted">
        {{ 'guidance.lesson.missing' | transloco }}
      </p>
    } @else {
      <p class="text-ui text-fg-muted">{{ 'guidance.loading' | transloco }}</p>
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
  }

  protected onStarted(): void {
    const key = this.lessonKey();
    if (this.seen.has(key) || this.progress()) {
      return; // already counted
    }
    this.seen.add(key);
    this.progressService.record(this.scope(), key, 'seen').subscribe({ error: () => undefined });
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

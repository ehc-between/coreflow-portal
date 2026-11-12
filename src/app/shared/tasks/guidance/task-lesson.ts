import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { Lesson, TasksGuidance } from '../../../core/tasks/tasks-guidance';
import { MarkdownPipe } from '../../markdown/markdown.pipe';
import { Button } from '../../ui/button/button';
import { Icon } from '../../ui/icon/icon';
import { SlideOver } from '../../ui/slide-over/slide-over';

/** Share of quiz answers that were right (0..1); 1 for a lesson without a quiz. */
export function quizScore(lesson: Lesson, answers: Readonly<Record<number, number>>): number {
  const quiz = lesson.quiz ?? [];
  if (quiz.length === 0) {
    return 1;
  }
  const right = quiz.filter((q, i) => answers[i] === q.answer).length;
  return right / quiz.length;
}

/**
 * A micro-lesson from the tasks guidance file (`lessons.<key>`): a launcher button
 * that opens the lesson in a side panel, with sections and an optional quiz scored
 * against its pass mark. Interim for F6's `<app-lesson>` (which also records
 * learning progress).
 */
@Component({
  selector: 'app-task-lesson',
  imports: [TranslocoPipe, MarkdownPipe, Button, Icon, SlideOver],
  providers: [provideTranslocoScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as entry) {
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-semibold text-fg-muted hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        (click)="openLesson()"
      >
        <app-icon name="training" [size]="14" />
        {{ 'tasks.guide.lessonButton' | transloco: { title: entry.title, minutes: entry.minutes } }}
      </button>

      <app-slide-over
        [open]="open()"
        [title]="entry.title"
        [subtitle]="'tasks.guide.lessonMinutes' | transloco: { minutes: entry.minutes }"
        [closeLabel]="'tasks.common.close' | transloco"
        [width]="560"
        (closed)="open.set(false)"
      >
        <div class="flex flex-col gap-5">
          @for (section of entry.sections; track $index) {
            <section>
              <h3 class="mb-1 font-display text-[15px] font-bold text-fg">{{ section.heading }}</h3>
              <div
                class="cf-prose text-[13.5px] leading-relaxed text-fg-muted"
                [innerHTML]="section.body | appMarkdown"
              ></div>
            </section>
          }

          @if (entry.quiz?.length) {
            <section class="rounded-card border border-border bg-surface-2 p-4">
              <h3 class="mb-3 font-display text-[15px] font-bold text-fg">
                {{ 'tasks.guide.quizTitle' | transloco }}
              </h3>
              @for (q of entry.quiz; track qi; let qi = $index) {
                <fieldset class="mb-4">
                  <legend class="mb-1.5 text-[13.5px] font-semibold text-fg">
                    {{ q.question }}
                  </legend>
                  @for (option of q.options; track oi; let oi = $index) {
                    <label class="flex items-center gap-2 py-0.5 text-[13px] text-fg-muted">
                      <input
                        type="radio"
                        [name]="'task-lesson-' + lesson() + '-' + qi"
                        [checked]="answers()[qi] === oi"
                        [disabled]="submitted()"
                        (change)="answer(qi, oi)"
                      />
                      {{ option }}
                    </label>
                  }
                  @if (submitted() && q.explanation) {
                    <p
                      class="mt-1 text-[12.5px]"
                      [class.text-pass]="answers()[qi] === q.answer"
                      [class.text-fail]="answers()[qi] !== q.answer"
                    >
                      {{ q.explanation }}
                    </p>
                  }
                </fieldset>
              }
              @if (submitted()) {
                <p
                  class="text-[13.5px] font-semibold"
                  [class.text-pass]="passed()"
                  [class.text-fail]="!passed()"
                  role="status"
                >
                  {{
                    (passed() ? 'tasks.guide.quizPassed' : 'tasks.guide.quizFailed')
                      | transloco: { score: scorePercent() }
                  }}
                </p>
                <div class="mt-2">
                  <app-button variant="secondary" size="sm" (click)="retry()">
                    {{ 'tasks.guide.quizRetry' | transloco }}
                  </app-button>
                </div>
              } @else {
                <app-button size="sm" [disabled]="!allAnswered()" (click)="submitted.set(true)">
                  {{ 'tasks.guide.quizCheck' | transloco }}
                </app-button>
              }
            </section>
          }
        </div>
      </app-slide-over>
    }
  `,
})
export class TaskLesson {
  private readonly guidance = inject(TasksGuidance);

  /** Lesson key in the tasks guidance file. */
  readonly lesson = input.required<string>();

  protected readonly content = computed(() => this.guidance.file()?.lessons?.[this.lesson()]);
  protected readonly open = signal(false);
  protected readonly answers = signal<Readonly<Record<number, number>>>({});
  protected readonly submitted = signal(false);

  protected readonly allAnswered = computed(() => {
    const quiz = this.content()?.quiz ?? [];
    return quiz.every((_, i) => this.answers()[i] !== undefined);
  });
  private readonly score = computed(() => {
    const lesson = this.content();
    return lesson ? quizScore(lesson, this.answers()) : 0;
  });
  protected readonly scorePercent = computed(() => Math.round(this.score() * 100));
  protected readonly passed = computed(
    () => this.score() >= (this.content()?.pass_mark ?? 0.8) - 1e-9,
  );

  protected openLesson(): void {
    this.retry();
    this.open.set(true);
  }

  protected answer(question: number, option: number): void {
    this.answers.update((a) => ({ ...a, [question]: option }));
  }

  protected retry(): void {
    this.answers.set({});
    this.submitted.set(false);
  }
}

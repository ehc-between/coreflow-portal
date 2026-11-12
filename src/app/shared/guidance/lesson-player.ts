import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DEFAULT_PASS_MARK, Lesson, LessonResult } from '../../core/guidance/guidance.models';
import { MarkdownPipe } from '../markdown/markdown.pipe';
import { Button } from '../ui/button/button';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { ProgressBar } from '../ui/progress-bar/progress-bar';

let nextId = 0;

type Stage = { readonly kind: 'section'; readonly index: number } | { readonly kind: 'quiz' };

/** Score a quiz: percentage of correct answers (0-100) and whether it meets the pass mark. */
export function scoreQuiz(
  lesson: Lesson,
  answers: readonly (number | null)[],
): { readonly score: number; readonly passed: boolean; readonly correct: number } {
  const quiz = lesson.quiz ?? [];
  if (quiz.length === 0) {
    return { score: 100, passed: true, correct: 0 };
  }
  const correct = quiz.filter((q, i) => answers[i] === q.answer).length;
  const fraction = correct / quiz.length;
  const passMark = lesson.pass_mark ?? DEFAULT_PASS_MARK;
  return { score: Math.round(fraction * 100), passed: fraction >= passMark - 1e-9, correct };
}

/**
 * Pure micro-lesson player: steps through the lesson's sections, then its optional
 * quiz, and emits `completed` with the result (score/passed are null without a quiz).
 * A failed quiz can be retried; each attempt emits again. M11 feeds course content of
 * the same `Lesson` shape.
 */
@Component({
  selector: 'app-lesson-player',
  imports: [TranslocoPipe, MarkdownPipe, Button, ProgressBar],
  viewProviders: [provideSharedScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let l = lesson();
    @let s = stage();
    <article class="flex flex-col gap-4" [attr.aria-labelledby]="titleId">
      <header>
        <h2 [id]="titleId" class="font-display text-[20px] font-bold tracking-[-0.02em] text-fg">
          {{ l.title }}
        </h2>
        <div class="mt-1 flex flex-wrap items-center gap-3 text-[12.5px] text-fg-muted">
          @if (l.minutes) {
            <span>{{ 'guidance.lesson.minutes' | transloco: { minutes: l.minutes } }}</span>
          }
          <span data-testid="lesson-step" aria-live="polite">
            {{ 'guidance.lesson.step' | transloco: { current: position(), total: totalSteps() } }}
          </span>
        </div>
        <div class="mt-2">
          <app-progress-bar
            [value]="progressPct()"
            [label]="'guidance.lesson.progress' | transloco"
          />
        </div>
      </header>

      @if (s.kind === 'section') {
        @let section = l.sections[s.index];
        <section data-testid="lesson-section">
          <h3 class="text-[15px] font-semibold text-fg">{{ section.heading }}</h3>
          <div class="cf-prose mt-1.5" [innerHTML]="section.body | appMarkdown"></div>
        </section>
        <div class="flex flex-wrap items-center gap-2">
          @if (s.index > 0) {
            <app-button variant="secondary" (click)="back()">
              {{ 'guidance.lesson.back' | transloco }}
            </app-button>
          }
          @if (s.index < l.sections.length - 1) {
            <app-button data-testid="lesson-next" (click)="next()">
              {{ 'guidance.lesson.next' | transloco }}
            </app-button>
          } @else if (hasQuiz()) {
            <app-button data-testid="lesson-start-quiz" (click)="startQuiz()">
              {{ 'guidance.lesson.startQuiz' | transloco }}
            </app-button>
          } @else {
            <app-button data-testid="lesson-finish" [disabled]="finished()" (click)="finish()">
              {{
                (finished() ? 'guidance.lesson.completed' : 'guidance.lesson.finish') | transloco
              }}
            </app-button>
          }
        </div>
      } @else {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submitQuiz()">
          @for (q of l.quiz ?? []; track $index; let qi = $index) {
            <fieldset
              data-testid="quiz-question"
              class="rounded-card border border-border bg-surface p-4"
              [disabled]="submitted()"
            >
              <legend class="px-1 text-[14px] font-semibold text-fg">
                {{ 'guidance.quiz.question' | transloco: { n: qi + 1 } }} {{ q.question }}
              </legend>
              <div class="mt-2 flex flex-col gap-1.5">
                @for (option of q.options; track $index; let oi = $index) {
                  <label
                    class="flex cursor-pointer items-start gap-2.5 rounded-tile px-2 py-1.5 text-[13.5px] text-fg hover:bg-surface-2"
                    [class.bg-pass-soft]="submitted() && oi === q.answer"
                    [class.bg-fail-soft]="submitted() && answers()[qi] === oi && oi !== q.answer"
                  >
                    <input
                      type="radio"
                      class="mt-0.5 accent-accent"
                      [name]="titleId + '-q' + qi"
                      [checked]="answers()[qi] === oi"
                      (change)="choose(qi, oi)"
                    />
                    <span>{{ option }}</span>
                  </label>
                }
              </div>
              @if (submitted()) {
                <p
                  class="mt-2 text-[12.5px] font-medium"
                  [class.text-pass]="answers()[qi] === q.answer"
                  [class.text-fail]="answers()[qi] !== q.answer"
                >
                  {{
                    (answers()[qi] === q.answer ? 'guidance.quiz.correct' : 'guidance.quiz.wrong')
                      | transloco
                  }}
                  @if (q.explanation) {
                    <span class="font-normal text-fg-muted">{{ q.explanation }}</span>
                  }
                </p>
              }
            </fieldset>
          }

          @if (result(); as r) {
            <div
              data-testid="quiz-result"
              role="status"
              class="rounded-card px-4 py-3 text-[13.5px] font-semibold"
              [class.bg-pass-soft]="r.passed"
              [class.text-pass]="r.passed"
              [class.bg-warn-soft]="!r.passed"
              [class.text-warn]="!r.passed"
            >
              {{
                (r.passed ? 'guidance.quiz.passed' : 'guidance.quiz.failed')
                  | transloco: { score: r.score, correct: r.correct, total: (l.quiz ?? []).length }
              }}
            </div>
          }

          <div class="flex flex-wrap items-center gap-2">
            @if (!submitted()) {
              <app-button variant="secondary" (click)="backFromQuiz()">
                {{ 'guidance.lesson.back' | transloco }}
              </app-button>
              <app-button data-testid="quiz-submit" type="submit" [disabled]="!allAnswered()">
                {{ 'guidance.quiz.submit' | transloco }}
              </app-button>
            } @else if (!result()?.passed) {
              <app-button data-testid="quiz-retry" (click)="retry()">
                {{ 'guidance.quiz.retry' | transloco }}
              </app-button>
            }
          </div>
        </form>
      }
    </article>
  `,
})
export class LessonPlayer {
  readonly lesson = input.required<Lesson>();
  readonly completed = output<LessonResult>();

  protected readonly titleId = `lesson-${nextId++}`;

  protected readonly stage = linkedSignal<Lesson, Stage>({
    source: this.lesson,
    computation: () => ({ kind: 'section', index: 0 }),
  });
  protected readonly answers = linkedSignal<Lesson, readonly (number | null)[]>({
    source: this.lesson,
    computation: (lesson) => (lesson.quiz ?? []).map(() => null),
  });
  protected readonly submitted = linkedSignal<Lesson, boolean>({
    source: this.lesson,
    computation: () => false,
  });
  protected readonly finished = linkedSignal<Lesson, boolean>({
    source: this.lesson,
    computation: () => false,
  });

  protected readonly hasQuiz = computed(() => (this.lesson().quiz ?? []).length > 0);
  protected readonly totalSteps = computed(
    () => this.lesson().sections.length + (this.hasQuiz() ? 1 : 0),
  );
  protected readonly position = computed(() => {
    const s = this.stage();
    return s.kind === 'section' ? s.index + 1 : this.totalSteps();
  });
  protected readonly progressPct = computed(() => {
    const done = this.finished() || (this.submitted() && this.result()?.passed);
    return done ? 100 : Math.round(((this.position() - 1) / this.totalSteps()) * 100);
  });
  protected readonly allAnswered = computed(() => this.answers().every((a) => a !== null));
  protected readonly result = computed(() =>
    this.submitted() ? scoreQuiz(this.lesson(), this.answers()) : null,
  );

  protected next(): void {
    const s = this.stage();
    if (s.kind === 'section' && s.index < this.lesson().sections.length - 1) {
      this.stage.set({ kind: 'section', index: s.index + 1 });
    }
  }

  protected back(): void {
    const s = this.stage();
    if (s.kind === 'section' && s.index > 0) {
      this.stage.set({ kind: 'section', index: s.index - 1 });
    }
  }

  protected startQuiz(): void {
    this.stage.set({ kind: 'quiz' });
  }

  protected backFromQuiz(): void {
    this.stage.set({ kind: 'section', index: this.lesson().sections.length - 1 });
  }

  protected choose(question: number, option: number): void {
    this.answers.update((list) => list.map((a, i) => (i === question ? option : a)));
  }

  protected submitQuiz(): void {
    if (this.submitted() || !this.allAnswered()) {
      return;
    }
    this.submitted.set(true);
    const r = scoreQuiz(this.lesson(), this.answers());
    this.completed.emit({ score: r.score, passed: r.passed });
  }

  protected retry(): void {
    this.answers.set((this.lesson().quiz ?? []).map(() => null));
    this.submitted.set(false);
  }

  protected finish(): void {
    if (this.finished()) {
      return;
    }
    this.finished.set(true);
    this.completed.emit({ score: null, passed: null });
  }
}

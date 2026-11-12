import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';

/** One quiz question of the lesson: its i18n id, option ids and the right one. */
interface QuizQuestion {
  readonly id: string;
  readonly options: readonly string[];
  readonly answer: string;
}

const LESSON = 'modules.guide.lessons.modulesBasics';
const SECTIONS = ['s1', 's2', 's3'] as const;
const QUIZ: readonly QuizQuestion[] = [
  { id: 'q1', options: ['a', 'b', 'c'], answer: 'b' },
  { id: 'q2', options: ['a', 'b', 'c'], answer: 'c' },
];

/**
 * Micro-lesson "Frameworks, modules and your management system": three short
 * sections and a two-question check. Collapsed by default; answers are checked
 * locally (F6 records learning progress once it lands).
 */
@Component({
  selector: 'app-modules-lesson',
  imports: [TranslocoPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-card border border-border bg-surface shadow-card"
      data-testid="modules-lesson"
    >
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-card px-4 py-3.5 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
        [attr.aria-expanded]="open()"
        aria-controls="modules-lesson-body"
        (click)="open.set(!open())"
      >
        <span class="flex text-accent" aria-hidden="true"
          ><app-icon name="training" [size]="18"
        /></span>
        <span class="min-w-0 flex-1">
          <span class="block text-[11.5px] font-bold tracking-[0.04em] text-fg-subtle uppercase">
            {{ 'modules.guide.lessonLabel' | transloco: { minutes: 4 } }}
          </span>
          <span class="block text-[14px] font-bold text-fg">{{
            lesson + '.title' | transloco
          }}</span>
        </span>
        <span class="text-[12.5px] font-semibold text-accent">
          {{ (open() ? 'modules.guide.hide' : 'modules.guide.start') | transloco }}
        </span>
      </button>

      @if (open()) {
        <div id="modules-lesson-body" class="border-t border-border px-4 pt-3 pb-4">
          @for (section of sections; track section) {
            <h3 class="mt-3 text-[13.5px] font-bold text-fg first:mt-0">
              {{ lesson + '.sections.' + section + '.heading' | transloco }}
            </h3>
            <p class="mt-1 text-[13.5px] leading-relaxed text-fg-muted">
              {{ lesson + '.sections.' + section + '.body' | transloco }}
            </p>
          }

          <h3 class="mt-5 text-[13.5px] font-bold text-fg">
            {{ 'modules.guide.quizTitle' | transloco }}
          </h3>
          @for (q of quiz; track q.id) {
            <fieldset class="mt-3">
              <legend class="text-[13.5px] font-semibold text-fg">
                {{ lesson + '.quiz.' + q.id + '.question' | transloco }}
              </legend>
              <div class="mt-1.5 flex flex-col gap-1">
                @for (option of q.options; track option) {
                  <label
                    class="flex cursor-pointer items-start gap-2 rounded-tile px-2 py-1.5 text-[13px] text-fg hover:bg-surface-2"
                  >
                    <input
                      type="radio"
                      class="mt-0.5 accent-[var(--accent)]"
                      [name]="'modules-lesson-' + q.id"
                      [value]="option"
                      [checked]="answers()[q.id] === option"
                      (change)="choose(q.id, option)"
                    />
                    <span>{{ lesson + '.quiz.' + q.id + '.options.' + option | transloco }}</span>
                  </label>
                }
              </div>
              @if (checked()) {
                <p
                  class="mt-1 rounded-tile px-2.5 py-1.5 text-[12.5px]"
                  [class]="
                    answers()[q.id] === q.answer
                      ? 'bg-pass-soft text-pass'
                      : 'bg-fail-soft text-fail'
                  "
                  role="status"
                >
                  {{
                    (answers()[q.id] === q.answer
                      ? 'modules.guide.correct'
                      : 'modules.guide.incorrect'
                    ) | transloco
                  }}
                  {{ lesson + '.quiz.' + q.id + '.explanation' | transloco }}
                </p>
              }
            </fieldset>
          }

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <app-button size="sm" [disabled]="!allAnswered()" (click)="checked.set(true)">
              {{ 'modules.guide.check' | transloco }}
            </app-button>
            @if (checked()) {
              <span class="text-[13px] font-semibold text-fg" role="status">
                {{ 'modules.guide.score' | transloco: { score: score(), total: quiz.length } }}
              </span>
              <app-button size="sm" variant="ghost" (click)="reset()">
                {{ 'modules.guide.retry' | transloco }}
              </app-button>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class ModulesLesson {
  protected readonly lesson = LESSON;
  protected readonly sections = SECTIONS;
  protected readonly quiz = QUIZ;

  protected readonly open = signal(false);
  protected readonly answers = signal<Readonly<Record<string, string>>>({});
  protected readonly checked = signal(false);

  protected readonly allAnswered = computed(() => QUIZ.every((q) => !!this.answers()[q.id]));
  protected readonly score = computed(
    () => QUIZ.filter((q) => this.answers()[q.id] === q.answer).length,
  );

  protected choose(id: string, option: string): void {
    this.answers.update((answers) => ({ ...answers, [id]: option }));
    this.checked.set(false);
  }

  protected reset(): void {
    this.answers.set({});
    this.checked.set(false);
  }
}

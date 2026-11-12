import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';

/** Shape of a standards micro-lesson under `standards.lesson.<key>.*`. */
export interface StandardsLessonDef {
  readonly key: string;
  readonly minutes: number;
  readonly sections: readonly string[];
  readonly options: readonly string[];
  /** Index into `options` of the right answer. */
  readonly answer: number;
}

/** The lessons of the standards area. */
export const STANDARDS_LESSONS = {
  readiness: {
    key: 'readiness',
    minutes: 3,
    sections: ['s1', 's2', 's3'],
    options: ['option1', 'option2', 'option3'],
    answer: 1,
  },
} as const satisfies Record<string, StandardsLessonDef>;

export type StandardsLessonKey = keyof typeof STANDARDS_LESSONS;

/**
 * A short micro-lesson with one check question. Collapsed to a single "start"
 * row; opening it shows the sections and the quiz. Keyboard friendly: the
 * options are a native radio group.
 */
@Component({
  selector: 'app-standards-lesson',
  imports: [TranslocoPipe, Badge, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let def = lesson();
    @let base = 'standards.lesson.' + def.key;
    <section
      class="rounded-card border border-border bg-surface p-4"
      [attr.aria-labelledby]="id() + '-title'"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="flex text-accent"><app-icon name="training" [size]="16" /></span>
        <h2 [id]="id() + '-title'" class="min-w-0 flex-1 text-[14px] font-semibold text-fg">
          {{ base + '.title' | transloco }}
        </h2>
        <app-badge tone="accent">{{ 'standards.lesson.badge' | transloco }}</app-badge>
        <app-badge>{{ 'standards.lesson.minutes' | transloco: { count: def.minutes } }}</app-badge>
        <button
          type="button"
          class="inline-flex h-8 items-center rounded-tile border border-border bg-surface px-3 text-[13px] font-semibold text-fg transition-colors hover:border-border-strong hover:bg-surface-2"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="id() + '-body'"
          (click)="open.set(!open())"
        >
          {{ (open() ? 'standards.lesson.close' : 'standards.lesson.start') | transloco }}
        </button>
      </div>

      @if (open()) {
        <div [id]="id() + '-body'" class="mt-4 flex flex-col gap-3">
          @for (section of def.sections; track section) {
            <div>
              <h3 class="text-[13.5px] font-semibold text-fg">
                {{ base + '.' + section + 'Heading' | transloco }}
              </h3>
              <p class="mt-1 text-[13px] leading-[1.6] text-fg-muted">
                {{ base + '.' + section + 'Body' | transloco }}
              </p>
            </div>
          }

          <fieldset class="mt-1 rounded-tile border border-border bg-surface-2/60 p-3">
            <legend class="px-1 text-[11.5px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
              {{ 'standards.lesson.questionLabel' | transloco }}
            </legend>
            <p class="text-[13.5px] font-medium text-fg">{{ base + '.question' | transloco }}</p>
            <div class="mt-2 flex flex-col gap-1.5">
              @for (option of def.options; track option; let i = $index) {
                <label class="flex cursor-pointer items-center gap-2 text-[13px] text-fg">
                  <input
                    type="radio"
                    [name]="id() + '-quiz'"
                    [value]="i"
                    [checked]="picked() === i"
                    (change)="pick(i)"
                  />
                  {{ base + '.' + option | transloco }}
                </label>
              }
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <app-button size="sm" [disabled]="picked() === null" (click)="checked.set(true)">
                {{ 'standards.lesson.check' | transloco }}
              </app-button>
              @if (checked()) {
                <p
                  class="text-[13px] font-semibold"
                  [class]="correct() ? 'text-pass' : 'text-fail'"
                  role="status"
                >
                  {{
                    (correct() ? 'standards.lesson.correct' : 'standards.lesson.incorrect')
                      | transloco
                  }}
                </p>
              }
            </div>
            @if (checked()) {
              <p class="mt-2 text-[13px] leading-[1.6] text-fg-muted">
                {{ base + '.explanation' | transloco }}
              </p>
            }
          </fieldset>
        </div>
      }
    </section>
  `,
})
export class StandardsLesson {
  readonly lessonKey = input.required<StandardsLessonKey>();

  protected readonly lesson = computed<StandardsLessonDef>(
    () => STANDARDS_LESSONS[this.lessonKey()],
  );
  protected readonly id = computed(() => `std-lesson-${this.lessonKey()}`);

  protected readonly open = signal(false);
  protected readonly picked = signal<number | null>(null);
  protected readonly checked = signal(false);
  protected readonly correct = computed(() => this.picked() === this.lesson().answer);

  protected pick(index: number): void {
    this.picked.set(index);
    this.checked.set(false);
  }
}

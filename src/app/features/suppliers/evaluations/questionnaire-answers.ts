import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import { answerValue } from '../data/supplier-display';
import { AnswerValue, Question } from '../data/supplier.models';

export interface DraftAnswer {
  readonly value: AnswerValue;
  readonly comment: string;
}

export interface AnswerChange {
  readonly id: string;
  readonly answer: DraftAnswer;
}

interface Group {
  readonly category: string;
  readonly questions: readonly { readonly q: Question; readonly n: number }[];
}

/** Questions grouped by category, numbered in their original order. */
export function groupQuestions(questions: readonly Question[]): readonly Group[] {
  const groups = new Map<string, { q: Question; n: number }[]>();
  questions.forEach((q, i) => {
    const key = q.category || 'general';
    const list = groups.get(key) ?? [];
    list.push({ q, n: i + 1 });
    groups.set(key, list);
  });
  return [...groups.entries()].map(([category, qs]) => ({ category, questions: qs }));
}

/**
 * The questionnaire of an evaluation: one control per question (yes / no / not
 * applicable, a score from 0 to the maximum, or free text) plus a comment. Critical
 * questions are marked; `highlight` marks required questions still unanswered.
 * Read-only unless `editable`. Stateless: emits each change.
 */
@Component({
  selector: 'app-questionnaire-answers',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (group of groups(); track group.category) {
      <section class="mb-5" [attr.aria-label]="group.category">
        <h3 class="mb-2 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
          {{ group.category }}
        </h3>
        <ol class="flex flex-col gap-3">
          @for (item of group.questions; track item.q.id) {
            <li
              class="rounded-tile border px-3 py-3"
              [class.border-fail]="isHighlighted(item.q.id)"
              [class.border-border]="!isHighlighted(item.q.id)"
              [attr.data-question]="item.q.id"
            >
              <fieldset [disabled]="!editable()">
                <legend
                  class="mb-1 flex flex-wrap items-start gap-x-2 text-[13.5px] font-semibold text-fg"
                >
                  <span class="text-fg-subtle">{{ item.n }}.</span>
                  <span class="min-w-0 flex-1">{{ item.q.text }}</span>
                  @if (item.q.critical) {
                    <span
                      class="inline-flex items-center gap-1 text-[11.5px] font-semibold text-fail"
                    >
                      <app-icon name="alert" [size]="12" />
                      {{ 'suppliers.questions.critical' | transloco }}
                    </span>
                  }
                  @if (!item.q.required) {
                    <span class="text-[11.5px] font-normal text-fg-subtle">
                      {{ 'suppliers.questions.optional' | transloco }}
                    </span>
                  }
                </legend>
                @if (item.q.help) {
                  <p class="mb-2 text-[12.5px] text-fg-muted">{{ item.q.help }}</p>
                }
                @switch (item.q.type) {
                  @case ('yes_no') {
                    <div class="flex flex-wrap gap-3 text-[13px] text-fg">
                      @for (opt of yesNo; track opt) {
                        <label class="inline-flex items-center gap-1.5">
                          <input
                            type="radio"
                            class="h-4 w-4"
                            [name]="'q-' + item.q.id"
                            [value]="opt"
                            [checked]="valueOf(item.q.id) === opt"
                            (change)="setValue(item.q, opt)"
                          />
                          {{ 'suppliers.answers.' + opt | transloco }}
                        </label>
                      }
                    </div>
                  }
                  @case ('score') {
                    <label class="flex items-center gap-2 text-[13px] text-fg-muted">
                      {{ 'suppliers.answers.score' | transloco: { max: item.q.max_score } }}
                      <select
                        class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
                        (change)="setValue(item.q, $any($event.target).value)"
                      >
                        <option value="" [selected]="valueOf(item.q.id) === null">
                          {{ 'suppliers.answers.choose' | transloco }}
                        </option>
                        @for (s of scale(item.q.max_score); track s) {
                          <option [value]="s" [selected]="valueOf(item.q.id) === s">{{ s }}</option>
                        }
                        <option value="na" [selected]="valueOf(item.q.id) === 'na'">
                          {{ 'suppliers.answers.na' | transloco }}
                        </option>
                      </select>
                    </label>
                  }
                  @default {
                    <label class="sr-only" [attr.for]="'qa-' + item.q.id">
                      {{ 'suppliers.answers.text' | transloco }}
                    </label>
                    <textarea
                      [id]="'qa-' + item.q.id"
                      rows="3"
                      maxlength="4000"
                      class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-[13.5px] text-fg"
                      [value]="valueOf(item.q.id) ?? ''"
                      (change)="setValue(item.q, $any($event.target).value)"
                    ></textarea>
                  }
                }
                @if (item.q.type !== 'text') {
                  <label class="mt-2 block">
                    <span class="sr-only">{{ 'suppliers.answers.comment' | transloco }}</span>
                    <input
                      type="text"
                      maxlength="4000"
                      class="h-9 w-full rounded-tile border border-border bg-bg px-3 text-[13px] text-fg"
                      [placeholder]="'suppliers.answers.commentPlaceholder' | transloco"
                      [value]="answers()[item.q.id]?.comment ?? ''"
                      (change)="setComment(item.q, $any($event.target).value)"
                    />
                  </label>
                }
              </fieldset>
            </li>
          }
        </ol>
      </section>
    } @empty {
      <p class="text-[13.5px] text-fg-muted">{{ 'suppliers.questions.empty' | transloco }}</p>
    }
  `,
})
export class QuestionnaireAnswers {
  readonly questions = input.required<readonly Question[]>();
  readonly answers = input.required<Readonly<Record<string, DraftAnswer>>>();
  readonly editable = input(false);
  readonly highlight = input<readonly string[]>([]);
  readonly answerChange = output<AnswerChange>();

  protected readonly yesNo = ['yes', 'no', 'na'] as const;
  protected readonly groups = computed(() => groupQuestions(this.questions()));

  protected valueOf(id: string): AnswerValue {
    return this.answers()[id]?.value ?? null;
  }

  protected isHighlighted(id: string): boolean {
    return this.highlight().includes(id) && this.valueOf(id) === null;
  }

  protected scale(max: number): number[] {
    return Array.from({ length: max + 1 }, (_, i) => i);
  }

  protected setValue(q: Question, raw: string): void {
    const current = this.answers()[q.id];
    this.answerChange.emit({
      id: q.id,
      answer: { value: answerValue(q, raw), comment: current?.comment ?? '' },
    });
  }

  protected setComment(q: Question, comment: string): void {
    const current = this.answers()[q.id];
    this.answerChange.emit({
      id: q.id,
      answer: { value: current?.value ?? null, comment },
    });
  }
}

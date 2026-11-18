import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { Icon } from '../../../shared/ui/icon/icon';
import { answerValue } from '../data/supplier-display';
import { AnswerValue, QUESTION_CATEGORIES, Question } from '../data/supplier.models';

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

/**
 * i18n key of a known section (`general`, `security`, `other` …), or null for a custom
 * section name, which is shown as typed.
 */
export function categoryKey(category: string): string | null {
  const key = category.trim().toLowerCase();
  return (QUESTION_CATEGORIES as readonly string[]).includes(key) || key === 'other'
    ? `suppliers.questionCategory.${key}`
    : null;
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
  imports: [TranslocoPipe, ClauseChips, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (group of groups(); track group.category) {
      @let label = groupLabel(group.category);
      <section class="mb-5" [attr.aria-label]="label">
        <h3 class="mb-2 text-ui font-semibold text-fg-muted" data-testid="question-section">
          {{ label }}
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
                  class="mb-1 flex flex-wrap items-start gap-x-2 text-body font-semibold text-fg"
                >
                  <span class="text-fg-subtle">{{ item.n }}.</span>
                  <span class="min-w-0 flex-1">{{ item.q.text }}</span>
                  @if (item.q.critical) {
                    <span
                      class="inline-flex items-center gap-1 text-meta font-semibold text-fail-ink"
                      [title]="'suppliers.questions.criticalHint' | transloco"
                    >
                      <app-icon name="alert" [size]="12" />
                      {{ 'suppliers.questions.critical' | transloco }}
                    </span>
                  }
                  @if (!item.q.required) {
                    <span class="text-meta font-normal text-fg-subtle">
                      {{ 'suppliers.questions.optional' | transloco }}
                    </span>
                  }
                </legend>
                @if (item.q.help) {
                  <p class="mb-2 text-ui text-fg-muted">{{ item.q.help }}</p>
                }
                @if (item.q.requirement_refs?.length) {
                  <p
                    class="mb-2 flex flex-wrap items-baseline gap-x-1 text-meta"
                    data-testid="question-refs"
                  >
                    <span class="text-fg-subtle">{{
                      'suppliers.questions.checks' | transloco
                    }}</span>
                    <app-clause-chips [clauses]="item.q.requirement_refs ?? []" />
                  </p>
                }
                @switch (item.q.type) {
                  @case ('yes_no') {
                    <div class="flex flex-wrap gap-3 text-ui text-fg">
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
                    <label class="flex items-center gap-2 text-ui text-fg-muted">
                      {{ 'suppliers.answers.score' | transloco: { max: item.q.max_score } }}
                      <select
                        class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
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
                      class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg"
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
                      class="h-9 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg"
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
      <p class="text-body text-fg-muted">{{ 'suppliers.questions.empty' | transloco }}</p>
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
  private readonly language = inject(LanguageService);
  protected readonly groups = computed(() => groupQuestions(this.questions()));

  /** A known section in the UI language; a custom one as typed. */
  protected groupLabel(category: string): string {
    const key = categoryKey(category);
    return key ? this.language.translate(key) : category;
  }

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

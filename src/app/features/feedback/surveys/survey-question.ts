import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AnswerValue, Question } from '../data/feedback.models';
import { MAX_TEXT_ANSWER, scaleValues } from '../data/survey-form-model';

let nextId = 0;

/**
 * One survey question with its answer control: a scale of buttons for rating and
 * NPS, radios for single choice and yes/no, checkboxes for multiple choice and a
 * text area for free text. Used by the public survey page and the preview.
 */
@Component({
  selector: 'app-survey-question',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let q = question();
    <fieldset
      class="flex flex-col gap-2"
      [attr.aria-describedby]="q.help ? helpId : null"
      [attr.aria-invalid]="invalid() || null"
      [attr.data-testid]="'question-' + q.id"
    >
      <legend class="mb-1 text-[14.5px] font-semibold text-fg">
        <span class="mr-1 text-fg-subtle">{{ position() }}.</span>{{ q.label }}
        @if (q.required) {
          <span class="text-fail" aria-hidden="true">*</span>
          <span class="sr-only">{{ 'feedback.answer.required' | transloco }}</span>
        }
      </legend>
      @if (q.help) {
        <p [id]="helpId" class="-mt-1 text-[12.5px] text-fg-muted">{{ q.help }}</p>
      }

      @switch (q.type) {
        @case ('rating') {
          <div class="flex flex-wrap gap-1.5" role="radiogroup" [attr.aria-label]="q.label">
            @for (n of scale(); track n) {
              <label [class]="scaleClass(value() === n)">
                <input
                  type="radio"
                  class="sr-only"
                  [name]="name"
                  [value]="n"
                  [checked]="value() === n"
                  [disabled]="disabled()"
                  (change)="emit(n)"
                />
                {{ n }}
              </label>
            }
          </div>
          <p class="flex justify-between text-[11.5px] text-fg-subtle" aria-hidden="true">
            <span>{{ 'feedback.answer.ratingLow' | transloco }}</span>
            <span>{{ 'feedback.answer.ratingHigh' | transloco }}</span>
          </p>
        }
        @case ('nps') {
          <div class="flex flex-wrap gap-1" role="radiogroup" [attr.aria-label]="q.label">
            @for (n of scale(); track n) {
              <label [class]="scaleClass(value() === n, true)">
                <input
                  type="radio"
                  class="sr-only"
                  [name]="name"
                  [value]="n"
                  [checked]="value() === n"
                  [disabled]="disabled()"
                  (change)="emit(n)"
                />
                {{ n }}
              </label>
            }
          </div>
          <p class="flex justify-between text-[11.5px] text-fg-subtle" aria-hidden="true">
            <span>{{ 'feedback.answer.npsLow' | transloco }}</span>
            <span>{{ 'feedback.answer.npsHigh' | transloco }}</span>
          </p>
        }
        @case ('yes_no') {
          <div class="flex flex-wrap gap-2" role="radiogroup" [attr.aria-label]="q.label">
            @for (opt of yesNo; track opt.value) {
              <label [class]="scaleClass(value() === opt.value)">
                <input
                  type="radio"
                  class="sr-only"
                  [name]="name"
                  [checked]="value() === opt.value"
                  [disabled]="disabled()"
                  (change)="emit(opt.value)"
                />
                {{ opt.key | transloco }}
              </label>
            }
          </div>
        }
        @case ('single_choice') {
          <div class="flex flex-col gap-1.5">
            @for (o of q.options ?? []; track o) {
              <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
                <input
                  type="radio"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [name]="name"
                  [checked]="value() === o"
                  [disabled]="disabled()"
                  (change)="emit(o)"
                />
                {{ o }}
              </label>
            }
          </div>
        }
        @case ('multi_choice') {
          <div class="flex flex-col gap-1.5">
            @for (o of q.options ?? []; track o) {
              <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="selected().includes(o)"
                  [disabled]="disabled()"
                  (change)="toggle(o, $any($event.target).checked)"
                />
                {{ o }}
              </label>
            }
          </div>
        }
        @default {
          <label [for]="name" class="sr-only">{{ q.label }}</label>
          <textarea
            [id]="name"
            rows="4"
            [maxLength]="maxText"
            class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent"
            [value]="textValue()"
            [disabled]="disabled()"
            (input)="emit($any($event.target).value)"
          ></textarea>
        }
      }
      @if (invalid()) {
        <p class="text-[12px] text-fail" role="alert">
          {{ 'feedback.answer.missing' | transloco }}
        </p>
      }
    </fieldset>
  `,
})
export class SurveyQuestion {
  readonly question = input.required<Question>();
  readonly position = input(1);
  readonly value = input<AnswerValue | null | undefined>(null);
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly valueChange = output<AnswerValue | null>();

  private readonly uid = nextId++;
  protected readonly name = `cf-sq-${this.uid}`;
  protected readonly helpId = `cf-sq-help-${this.uid}`;
  protected readonly maxText = MAX_TEXT_ANSWER;
  protected readonly yesNo = [
    { value: true, key: 'feedback.answer.yes' },
    { value: false, key: 'feedback.answer.no' },
  ] as const;

  protected readonly scale = computed(() => scaleValues(this.question()));
  protected readonly selected = computed<readonly string[]>(() => {
    const v = this.value();
    return Array.isArray(v) ? (v as readonly string[]) : [];
  });
  protected readonly textValue = computed(() => {
    const v = this.value();
    return typeof v === 'string' ? v : '';
  });

  protected scaleClass(active: boolean, compact = false): string {
    const size = compact ? 'h-9 min-w-9 px-2' : 'h-10 min-w-10 px-3';
    const tone = active
      ? 'border-accent bg-accent text-white'
      : 'border-border bg-bg text-fg hover:border-accent';
    return `inline-flex cursor-pointer items-center justify-center rounded-tile border text-[13.5px] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${size} ${tone}`;
  }

  protected emit(value: AnswerValue): void {
    this.valueChange.emit(value);
  }

  protected toggle(option: string, checked: boolean): void {
    const current = this.selected().filter((o) => o !== option);
    const next = checked ? [...current, option] : current;
    // Keep the question's option order.
    const ordered = (this.question().options ?? []).filter((o) => next.includes(o));
    this.valueChange.emit(ordered.length ? ordered : null);
  }
}

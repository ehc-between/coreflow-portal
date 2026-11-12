import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { questionTypeKey } from '../data/feedback-display';
import { AnswerValue, QUESTION_TYPES, Question, QuestionType } from '../data/feedback.models';
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  QuestionDraft,
  SurveyFormValue,
  emptyQuestion,
  isChoice,
  starterQuestions,
  toQuestionIn,
  validateQuestions,
  validateSurveyForm,
  withType,
} from '../data/survey-form-model';
import { SurveyQuestion } from './survey-question';

export interface SurveyFormSubmit {
  readonly value: SurveyFormValue;
  readonly changeReason: string;
}

const INPUT =
  'h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent';
const TEXTAREA =
  'w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent';

/**
 * The survey form with its question builder (create and edit). Questions can be
 * added, reordered, changed and previewed while the survey is a draft; once it is
 * published they are locked (`questionsLocked`) and only the other settings change.
 */
@Component({
  selector: 'app-survey-form',
  imports: [TranslocoPipe, FieldHelp, Alert, Button, Card, FormField, Icon, SurveyQuestion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
          {{ 'feedback.surveyForm.sections.basics' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'feedback.surveyFields.title' | transloco"
              inputId="cf-sv-title"
            >
              <input
                id="cf-sv-title"
                type="text"
                maxlength="255"
                required
                [value]="form().title"
                (input)="set('title', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['title']"
                data-testid="survey-title"
              />
            </app-form-field>
            @if (shownErrors()['title']; as e) {
              <p class="mt-1 text-[12px] text-fail">{{ e | transloco }}</p>
            }
          </div>
          <div class="sm:col-span-2">
            <label for="cf-sv-desc" class="mb-1.5 block text-[13px] font-semibold text-fg-muted">
              {{ 'feedback.surveyFields.description' | transloco }}
            </label>
            <textarea
              id="cf-sv-desc"
              rows="3"
              maxlength="5000"
              [class]="textarea"
              [value]="form().description"
              (input)="set('description', $any($event.target).value)"
            ></textarea>
            <p class="mt-1 text-[12px] text-fg-subtle">
              {{ 'feedback.surveyForm.descriptionHint' | transloco }}
            </p>
          </div>
          <app-form-field
            [label]="'feedback.surveyFields.opensOn' | transloco"
            inputId="cf-sv-opens"
          >
            <input
              id="cf-sv-opens"
              type="date"
              [value]="form().opens_on"
              (change)="set('opens_on', $any($event.target).value)"
            />
          </app-form-field>
          <div>
            <app-form-field
              [label]="'feedback.surveyFields.closesOn' | transloco"
              inputId="cf-sv-closes"
            >
              <input
                id="cf-sv-closes"
                type="date"
                [value]="form().closes_on"
                (change)="set('closes_on', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['closes_on']"
              />
            </app-form-field>
            @if (shownErrors()['closes_on']; as e) {
              <p class="mt-1 text-[12px] text-fail">{{ e | transloco }}</p>
            }
          </div>
          <div>
            <label class="inline-flex items-center gap-2 text-[13px] text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="form().anonymous"
                (change)="set('anonymous', $any($event.target).checked)"
                data-testid="survey-anonymous"
              />
              {{ 'feedback.surveyFields.anonymous' | transloco }}
              <app-field-help scope="feedback" page="surveyForm" field="anonymous" />
            </label>
          </div>
          <div>
            <label
              for="cf-sv-threshold"
              class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-fg-muted"
            >
              {{ 'feedback.surveyFields.lowScoreThreshold' | transloco }}
              <app-field-help scope="feedback" page="surveyForm" field="low_score_threshold" />
            </label>
            <input
              id="cf-sv-threshold"
              type="number"
              min="0"
              max="100"
              step="1"
              [class]="input"
              [value]="form().low_score_threshold"
              (input)="set('low_score_threshold', $any($event.target).value)"
              [attr.aria-invalid]="!!shownErrors()['low_score_threshold']"
            />
            @if (shownErrors()['low_score_threshold']; as e) {
              <p class="mt-1 text-[12px] text-fail">{{ e | transloco }}</p>
            }
          </div>
          <app-form-field [label]="'feedback.fields.owner' | transloco" inputId="cf-sv-owner">
            <select id="cf-sv-owner" (change)="set('owner_user_id', $any($event.target).value)">
              <option value="" [selected]="!form().owner_user_id">
                {{
                  (mode() === 'create' ? 'feedback.form.ownerMe' : 'feedback.form.ownerKeep')
                    | transloco
                }}
              </option>
              @if (ownerOrphan()) {
                <option [value]="form().owner_user_id" selected>
                  {{ ownerName() || ('feedback.form.currentOwner' | transloco) }}
                </option>
              }
              @for (u of users(); track u.id) {
                <option [value]="u.id" [selected]="form().owner_user_id === u.id">
                  {{ u.label }}
                </option>
              }
            </select>
          </app-form-field>
          <div class="sm:col-span-2">
            <label for="cf-sv-thanks" class="mb-1.5 block text-[13px] font-semibold text-fg-muted">
              {{ 'feedback.surveyFields.thankYouMessage' | transloco }}
            </label>
            <textarea
              id="cf-sv-thanks"
              rows="2"
              maxlength="2000"
              [class]="textarea"
              [value]="form().thank_you_message"
              (input)="set('thank_you_message', $any($event.target).value)"
            ></textarea>
          </div>
        </div>
      </app-card>

      <app-card>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="flex items-center gap-1 font-display text-[16px] font-bold text-fg">
            {{ 'feedback.surveyForm.sections.questions' | transloco }}
            <app-field-help scope="feedback" page="surveyForm" field="questions" />
          </h2>
          @if (!questionsLocked() && form().questions.length) {
            <app-button
              size="sm"
              variant="ghost"
              [attr.aria-pressed]="preview()"
              (click)="preview.set(!preview())"
              data-testid="survey-preview-toggle"
            >
              {{
                (preview() ? 'feedback.surveyForm.editQuestions' : 'feedback.surveyForm.preview')
                  | transloco
              }}
            </app-button>
          }
        </div>

        @if (questionsLocked()) {
          <app-alert tone="info">{{ 'feedback.surveyForm.locked' | transloco }}</app-alert>
          <ol class="mt-3 flex flex-col gap-1 text-[13.5px] text-fg">
            @for (q of form().questions; track q.key; let i = $index) {
              <li>
                <span class="text-fg-subtle">{{ i + 1 }}.</span> {{ q.label }}
                <span class="text-[12px] text-fg-subtle">({{ typeKey(q.type) | transloco }})</span>
              </li>
            }
          </ol>
        } @else if (preview()) {
          <div class="flex flex-col gap-5" data-testid="survey-preview">
            @for (q of previewQuestions(); track q.id; let i = $index) {
              <app-survey-question
                [question]="q"
                [position]="i + 1"
                [value]="previewAnswers()[q.id] ?? null"
                (valueChange)="setPreviewAnswer(q.id, $event)"
              />
            }
          </div>
        } @else {
          @if (form().questions.length === 0) {
            <div class="rounded-tile border border-dashed border-border p-4 text-center">
              <p class="text-[13px] text-fg-muted">
                {{ 'feedback.surveyForm.noQuestions' | transloco }}
              </p>
              <app-button
                class="mt-2 inline-block"
                size="sm"
                variant="secondary"
                (click)="addStarter()"
                data-testid="add-starter"
              >
                {{ 'feedback.surveyForm.addStarter' | transloco }}
              </app-button>
            </div>
          }
          <ol class="flex flex-col gap-4" data-testid="question-list">
            @for (q of form().questions; track q.key; let i = $index; let last = $last) {
              <li class="rounded-tile border border-border p-3">
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span class="text-[12.5px] font-semibold text-fg-subtle">
                    {{ 'feedback.surveyForm.questionN' | transloco: { n: i + 1 } }}
                  </span>
                  <span class="flex gap-1">
                    <button
                      type="button"
                      [class]="iconButton"
                      [disabled]="i === 0"
                      [attr.aria-label]="'feedback.surveyForm.moveUp' | transloco: { n: i + 1 }"
                      (click)="move(i, -1)"
                    >
                      <app-icon name="chevron" [size]="14" class="rotate-180" />
                    </button>
                    <button
                      type="button"
                      [class]="iconButton"
                      [disabled]="last"
                      [attr.aria-label]="'feedback.surveyForm.moveDown' | transloco: { n: i + 1 }"
                      (click)="move(i, 1)"
                    >
                      <app-icon name="chevron" [size]="14" />
                    </button>
                    <button
                      type="button"
                      [class]="iconButton"
                      [attr.aria-label]="'feedback.surveyForm.remove' | transloco: { n: i + 1 }"
                      (click)="remove(i)"
                      [attr.data-testid]="'remove-question-' + i"
                    >
                      <app-icon name="trash" [size]="14" />
                    </button>
                  </span>
                </div>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
                  <div>
                    <label [for]="'cf-sq-label-' + q.key" class="sr-only">
                      {{ 'feedback.surveyFields.questionLabel' | transloco }}
                    </label>
                    <input
                      [id]="'cf-sq-label-' + q.key"
                      type="text"
                      maxlength="500"
                      [class]="input"
                      [placeholder]="'feedback.surveyFields.questionLabel' | transloco"
                      [value]="q.label"
                      (input)="patch(i, { label: $any($event.target).value })"
                      [attr.data-testid]="'question-label-' + i"
                    />
                  </div>
                  <div>
                    <label [for]="'cf-sq-type-' + q.key" class="sr-only">
                      {{ 'feedback.surveyFields.questionType' | transloco }}
                    </label>
                    <select
                      [id]="'cf-sq-type-' + q.key"
                      [class]="input"
                      (change)="setType(i, $any($event.target).value)"
                    >
                      @for (t of types; track t) {
                        <option [value]="t" [selected]="q.type === t">
                          {{ typeKey(t) | transloco }}
                        </option>
                      }
                    </select>
                  </div>
                  <div class="sm:col-span-2">
                    <label [for]="'cf-sq-help-' + q.key" class="sr-only">
                      {{ 'feedback.surveyFields.questionHelp' | transloco }}
                    </label>
                    <input
                      [id]="'cf-sq-help-' + q.key"
                      type="text"
                      maxlength="1000"
                      [class]="input"
                      [placeholder]="'feedback.surveyFields.questionHelp' | transloco"
                      [value]="q.help"
                      (input)="patch(i, { help: $any($event.target).value })"
                    />
                  </div>
                </div>

                @if (isChoice(q.type)) {
                  <fieldset class="mt-3">
                    <legend class="mb-1 text-[12.5px] font-semibold text-fg-muted">
                      {{ 'feedback.surveyFields.options' | transloco }}
                    </legend>
                    <div class="flex flex-col gap-1.5">
                      @for (o of q.options; track $index; let j = $index) {
                        <div class="flex items-center gap-2">
                          <label [for]="'cf-sq-opt-' + q.key + '-' + j" class="sr-only">
                            {{ 'feedback.surveyForm.optionN' | transloco: { n: j + 1 } }}
                          </label>
                          <input
                            [id]="'cf-sq-opt-' + q.key + '-' + j"
                            type="text"
                            maxlength="200"
                            [class]="input"
                            [placeholder]="'feedback.surveyForm.optionN' | transloco: { n: j + 1 }"
                            [value]="o"
                            (input)="setOption(i, j, $any($event.target).value)"
                          />
                          <button
                            type="button"
                            [class]="iconButton"
                            [disabled]="q.options.length <= 2"
                            [attr.aria-label]="
                              'feedback.surveyForm.removeOption' | transloco: { n: j + 1 }
                            "
                            (click)="removeOption(i, j)"
                          >
                            <app-icon name="x" [size]="14" />
                          </button>
                        </div>
                      }
                    </div>
                    @if (q.options.length < maxOptions) {
                      <app-button
                        class="mt-2 inline-block"
                        size="sm"
                        variant="ghost"
                        (click)="addOption(i)"
                      >
                        <app-icon name="plus" [size]="13" />
                        {{ 'feedback.surveyForm.addOption' | transloco }}
                      </app-button>
                    }
                  </fieldset>
                }

                <div class="mt-3 flex flex-wrap items-center gap-4">
                  <label class="inline-flex items-center gap-2 text-[13px] text-fg">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="q.required"
                      (change)="patch(i, { required: $any($event.target).checked })"
                    />
                    {{ 'feedback.surveyFields.required' | transloco }}
                  </label>
                  @if (q.type === 'rating') {
                    <label class="inline-flex items-center gap-2 text-[13px] text-fg">
                      {{ 'feedback.surveyFields.scale' | transloco }}
                      <select
                        class="h-8 rounded-[8px] border border-border bg-bg px-2 text-[13px]"
                        (change)="patch(i, { scale: +$any($event.target).value })"
                      >
                        @for (n of scales; track n) {
                          <option [value]="n" [selected]="q.scale === n">{{ n }}</option>
                        }
                      </select>
                    </label>
                  }
                </div>
                @for (p of problemsFor(i + 1); track p) {
                  <p class="mt-2 text-[12px] text-fail">{{ p | transloco }}</p>
                }
              </li>
            }
          </ol>
          @if (form().questions.length < maxQuestions) {
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <label for="cf-sv-add-type" class="text-[13px] font-semibold text-fg-muted">
                {{ 'feedback.surveyForm.addLabel' | transloco }}
              </label>
              <select
                id="cf-sv-add-type"
                class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
                (change)="newType.set($any($event.target).value)"
              >
                @for (t of types; track t) {
                  <option [value]="t" [selected]="newType() === t">
                    {{ typeKey(t) | transloco }}
                  </option>
                }
              </select>
              <app-button size="sm" variant="secondary" (click)="add()" data-testid="add-question">
                <app-icon name="plus" [size]="13" />
                {{ 'feedback.surveyForm.addQuestion' | transloco }}
              </app-button>
            </div>
          }
        }
      </app-card>

      @if (mode() === 'edit') {
        <app-card>
          <app-form-field [label]="'feedback.form.changeReason' | transloco" inputId="cf-sv-reason">
            <input
              id="cf-sv-reason"
              type="text"
              maxlength="1000"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            />
          </app-form-field>
        </app-card>
      }

      @if (attempted() && hasProblems()) {
        <app-alert tone="error">{{ 'feedback.surveyForm.fixProblems' | transloco }}</app-alert>
      }

      <div class="flex flex-wrap justify-end gap-2">
        <app-button variant="ghost" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()" [disabled]="busy()" data-testid="survey-save">
          {{
            (mode() === 'create' ? 'feedback.surveyForm.create' : 'feedback.form.save') | transloco
          }}
        </app-button>
      </div>
    </form>
  `,
})
export class SurveyForm {
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly language = inject(LanguageService);

  readonly value = input.required<SurveyFormValue>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly busy = input(false);
  readonly questionsLocked = input(false);
  readonly ownerName = input<string | null>(null);

  readonly submitted = output<SurveyFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly input = INPUT;
  protected readonly textarea = TEXTAREA;
  protected readonly iconButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-subtle outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40';
  protected readonly types = QUESTION_TYPES;
  protected readonly scales = [3, 4, 5, 6, 7, 8, 9, 10];
  protected readonly maxOptions = MAX_OPTIONS;
  protected readonly maxQuestions = MAX_QUESTIONS;
  protected readonly typeKey = questionTypeKey;
  protected readonly isChoice = isChoice;

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = signal('');
  protected readonly attempted = signal(false);
  protected readonly preview = signal(false);
  protected readonly previewAnswers = signal<Readonly<Record<string, AnswerValue | null>>>({});
  protected readonly newType = signal<QuestionType>('rating');

  protected readonly errors = computed(() => validateSurveyForm(this.form()));
  protected readonly questionProblems = computed(() =>
    this.questionsLocked() ? [] : validateQuestions(this.form().questions),
  );
  protected readonly hasProblems = computed(
    () => Object.keys(this.errors()).length > 0 || this.questionProblems().length > 0,
  );
  protected readonly shownErrors = computed(() => {
    const errors = this.errors();
    if (this.attempted()) {
      return errors;
    }
    return Object.fromEntries(Object.entries(errors).filter(([k]) => k !== 'title'));
  });
  protected readonly previewQuestions = computed<Question[]>(() =>
    this.form().questions.map((q, i) => ({ ...toQuestionIn(q), id: q.id ?? `preview-${i}` })),
  );

  protected readonly users = computed(() =>
    this.assignees.options().users.map((o) => ({ id: o.value.slice(5), label: o.label })),
  );
  protected readonly ownerOrphan = computed(() => {
    const id = this.form().owner_user_id;
    return !!id && !this.users().some((u) => u.id === id);
  });

  constructor() {
    this.assignees.ensureLoaded();
  }

  protected problemsFor(position: number): string[] {
    if (!this.attempted()) {
      return [];
    }
    return this.questionProblems()
      .filter((p) => p.position === position)
      .map((p) => p.key);
  }

  protected set<K extends keyof SurveyFormValue>(key: K, value: SurveyFormValue[K]): void {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected setQuestions(questions: readonly QuestionDraft[]): void {
    this.form.set({ ...this.form(), questions });
  }

  protected patch(index: number, patch: Partial<QuestionDraft>): void {
    this.setQuestions(this.form().questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  protected setType(index: number, type: string): void {
    if ((QUESTION_TYPES as readonly string[]).includes(type)) {
      this.setQuestions(
        this.form().questions.map((q, i) => (i === index ? withType(q, type as QuestionType) : q)),
      );
    }
  }

  protected add(): void {
    this.setQuestions([...this.form().questions, emptyQuestion(this.newType())]);
  }

  protected addStarter(): void {
    this.setQuestions(
      starterQuestions({
        rating: this.language.translate('feedback.surveyForm.starter.rating'),
        nps: this.language.translate('feedback.surveyForm.starter.nps'),
        text: this.language.translate('feedback.surveyForm.starter.text'),
      }),
    );
  }

  protected remove(index: number): void {
    this.setQuestions(this.form().questions.filter((_, i) => i !== index));
  }

  protected move(index: number, delta: number): void {
    const list = [...this.form().questions];
    const target = index + delta;
    if (target < 0 || target >= list.length) {
      return;
    }
    [list[index], list[target]] = [list[target], list[index]];
    this.setQuestions(list);
  }

  protected setOption(index: number, option: number, value: string): void {
    const q = this.form().questions[index];
    this.patch(index, { options: q.options.map((o, j) => (j === option ? value : o)) });
  }

  protected addOption(index: number): void {
    const q = this.form().questions[index];
    if (q.options.length < MAX_OPTIONS) {
      this.patch(index, { options: [...q.options, ''] });
    }
  }

  protected removeOption(index: number, option: number): void {
    const q = this.form().questions[index];
    this.patch(index, { options: q.options.filter((_, j) => j !== option) });
  }

  protected setPreviewAnswer(id: string, value: AnswerValue | null): void {
    this.previewAnswers.update((a) => ({ ...a, [id]: value }));
  }

  protected submit(): void {
    this.attempted.set(true);
    this.preview.set(false);
    if (this.hasProblems() || this.busy()) {
      return;
    }
    this.submitted.emit({ value: this.form(), changeReason: this.changeReason() });
  }
}

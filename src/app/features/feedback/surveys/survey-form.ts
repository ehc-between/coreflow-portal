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
import { CustomerPicker, CustomersAvailability } from '../../../shared/customers';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { questionTypeKey, thresholdOnFive } from '../data/feedback-display';
import {
  AnswerValue,
  QUESTION_TYPES,
  Question,
  QuestionType,
  SURVEY_LANGUAGES,
} from '../data/feedback.models';
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
  'h-10 w-full rounded-tile border border-border bg-bg px-3 text-body text-fg outline-none focus:border-accent';
/**
 * The survey form with its question builder (create and edit). Questions can be
 * added, reordered, changed and previewed while the survey is a draft; once it is
 * published they are locked (`questionsLocked`) and only the other settings change.
 */
@Component({
  selector: 'app-survey-form',
  imports: [
    TranslocoPipe,
    FieldHelp,
    Alert,
    Button,
    DateInput,
    FormActions,
    FormField,
    FormSection,
    Icon,
    SurveyQuestion,
    CustomerPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-form-section
        [title]="'feedback.surveyForm.sections.basics' | transloco"
        [description]="'feedback.surveyForm.sections.basicsHint' | transloco"
      >
        <app-form-field
          span="full"
          [label]="'feedback.surveyFields.title' | transloco"
          inputId="cf-sv-title"
          [required]="true"
          [error]="shownErrors()['title'] ?? '' | transloco"
        >
          <input
            id="cf-sv-title"
            type="text"
            maxlength="255"
            required
            [value]="form().title"
            (input)="set('title', $any($event.target).value)"
            data-testid="survey-title"
          />
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'feedback.surveyFields.description' | transloco"
          inputId="cf-sv-desc"
          [hint]="'feedback.surveyForm.descriptionHint' | transloco"
        >
          <textarea
            id="cf-sv-desc"
            rows="3"
            maxlength="5000"
            [value]="form().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-form-field>
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
        @if (customers.enabled()) {
          <app-form-field [label]="'feedback.fields.customer' | transloco" inputId="cf-sv-customer">
            <app-customer-picker
              inputId="cf-sv-customer"
              [value]="form().customer_id || null"
              [current]="form().customer"
              (valueChange)="set('customer_id', $event ?? '')"
              (refChange)="set('customer', $event)"
              data-testid="survey-customer"
            />
          </app-form-field>
        }
      </app-form-section>

      <app-form-section
        [title]="'feedback.surveyForm.sections.settings' | transloco"
        [description]="'feedback.surveyForm.sections.settingsHint' | transloco"
      >
        <app-form-field [label]="'feedback.surveyFields.opensOn' | transloco" inputId="cf-sv-opens">
          <app-date-input
            inputId="cf-sv-opens"
            [value]="form().opens_on"
            (changed)="set('opens_on', $event)"
          />
        </app-form-field>
        <app-form-field
          [label]="'feedback.surveyFields.closesOn' | transloco"
          inputId="cf-sv-closes"
          [error]="shownErrors()['closes_on'] ?? '' | transloco"
        >
          <app-date-input
            inputId="cf-sv-closes"
            [value]="form().closes_on"
            [invalid]="!!shownErrors()['closes_on']"
            (changed)="set('closes_on', $event)"
          />
        </app-form-field>
        <app-form-field
          [label]="'feedback.surveyFields.language' | transloco"
          inputId="cf-sv-language"
          [hint]="'feedback.surveyForm.languageHint' | transloco"
        >
          <app-field-help
            label-suffix
            scope="feedback"
            page="surveyForm"
            field="language"
            [label]="'feedback.surveyFields.language' | transloco"
          />
          <select
            id="cf-sv-language"
            (change)="set('language', $any($event.target).value)"
            data-testid="survey-language"
          >
            @for (l of languages; track l) {
              <option [value]="l" [selected]="form().language === l">
                {{ 'feedback.surveyLanguages.' + l | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field
          [label]="'feedback.surveyFields.lowScoreThreshold' | transloco"
          inputId="cf-sv-threshold"
          [error]="shownErrors()['low_score_threshold'] ?? '' | transloco"
        >
          <app-field-help
            label-suffix
            scope="feedback"
            page="surveyForm"
            field="low_score_threshold"
            [label]="'feedback.surveyFields.lowScoreThreshold' | transloco"
          />
          <input
            id="cf-sv-threshold"
            type="number"
            min="0"
            max="100"
            step="1"
            [value]="form().low_score_threshold"
            (input)="set('low_score_threshold', $any($event.target).value)"
            data-testid="survey-threshold"
          />
          <p hint class="text-meta leading-snug text-fg-subtle">
            @if (thresholdFive(); as five) {
              {{ 'feedback.surveyForm.thresholdHint' | transloco: { five } }}
            } @else {
              {{ 'feedback.surveyForm.thresholdOff' | transloco }}
            }
          </p>
        </app-form-field>
        <div class="flex items-center gap-1.5 sm:col-span-2">
          <label
            class="flex h-10 flex-1 cursor-pointer items-center gap-2.5 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
          >
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="form().anonymous"
              (change)="set('anonymous', $any($event.target).checked)"
              data-testid="survey-anonymous"
            />
            {{ 'feedback.surveyFields.anonymous' | transloco }}
          </label>
          <app-field-help
            scope="feedback"
            page="surveyForm"
            field="anonymous"
            [label]="'feedback.surveyFields.anonymous' | transloco"
          />
        </div>
        <app-form-field
          span="full"
          [label]="'feedback.surveyFields.thankYouMessage' | transloco"
          inputId="cf-sv-thanks"
        >
          <textarea
            id="cf-sv-thanks"
            rows="2"
            maxlength="2000"
            [value]="form().thank_you_message"
            (input)="set('thank_you_message', $any($event.target).value)"
          ></textarea>
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'feedback.surveyForm.sections.questions' | transloco"
        [description]="'feedback.surveyForm.sections.questionsHint' | transloco"
        [columns]="1"
      >
        <app-field-help
          title-suffix
          scope="feedback"
          page="surveyForm"
          field="questions"
          [label]="'feedback.surveyForm.sections.questions' | transloco"
        />
        @if (!questionsLocked() && form().questions.length) {
          <app-button
            section-actions
            size="sm"
            variant="secondary"
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

        @if (questionsLocked()) {
          <div>
            <app-alert tone="info">{{ 'feedback.surveyForm.locked' | transloco }}</app-alert>
            <ol class="mt-3 flex flex-col gap-1 text-body text-fg">
              @for (q of form().questions; track q.key; let i = $index) {
                <li>
                  <span class="text-fg-subtle">{{ i + 1 }}.</span> {{ q.label }}
                  <span class="text-meta text-fg-subtle">({{ typeKey(q.type) | transloco }})</span>
                </li>
              }
            </ol>
          </div>
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
            <div class="rounded-tile border border-dashed border-border p-5 text-center">
              <p class="text-ui text-fg-muted">
                {{ 'feedback.surveyForm.noQuestions' | transloco }}
              </p>
              <app-button
                class="mt-3 inline-block"
                size="sm"
                variant="secondary"
                (click)="addStarter()"
                data-testid="add-starter"
              >
                {{ 'feedback.surveyForm.addStarter' | transloco }}
              </app-button>
            </div>
          }
          <ol class="flex flex-col gap-3 empty:hidden" data-testid="question-list">
            @for (q of form().questions; track q.key; let i = $index; let last = $last) {
              <li class="rounded-tile border border-border bg-bg p-4">
                <div class="mb-3 flex items-center justify-between gap-2">
                  <span
                    class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-soft px-1.5 text-meta font-bold text-accent"
                    [attr.aria-label]="'feedback.surveyForm.questionN' | transloco: { n: i + 1 }"
                  >
                    {{ i + 1 }}
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
                <div class="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2">
                  <app-form-field
                    span="full"
                    [label]="'feedback.surveyFields.questionLabel' | transloco"
                    [inputId]="'cf-sq-label-' + q.key"
                  >
                    <input
                      [id]="'cf-sq-label-' + q.key"
                      type="text"
                      maxlength="500"
                      [value]="q.label"
                      (input)="patch(i, { label: $any($event.target).value })"
                      [attr.data-testid]="'question-label-' + i"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'feedback.surveyFields.questionType' | transloco"
                    [inputId]="'cf-sq-type-' + q.key"
                  >
                    <select
                      [id]="'cf-sq-type-' + q.key"
                      (change)="setType(i, $any($event.target).value)"
                    >
                      @for (t of types; track t) {
                        <option [value]="t" [selected]="q.type === t">
                          {{ typeKey(t) | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  @if (q.type === 'rating') {
                    <app-form-field
                      [label]="'feedback.surveyFields.scale' | transloco"
                      [inputId]="'cf-sq-scale-' + q.key"
                    >
                      <select
                        [id]="'cf-sq-scale-' + q.key"
                        (change)="patch(i, { scale: +$any($event.target).value })"
                      >
                        @for (n of scales; track n) {
                          <option [value]="n" [selected]="q.scale === n">{{ n }}</option>
                        }
                      </select>
                    </app-form-field>
                  } @else {
                    <div class="hidden sm:block" aria-hidden="true"></div>
                  }
                  <app-form-field
                    span="full"
                    [label]="'feedback.surveyFields.questionHelp' | transloco"
                    [inputId]="'cf-sq-help-' + q.key"
                  >
                    <input
                      [id]="'cf-sq-help-' + q.key"
                      type="text"
                      maxlength="1000"
                      [value]="q.help"
                      (input)="patch(i, { help: $any($event.target).value })"
                    />
                  </app-form-field>

                  @if (isChoice(q.type)) {
                    <fieldset class="sm:col-span-2">
                      <legend
                        class="mb-1.5 flex min-h-6 items-center text-ui font-semibold text-fg-muted"
                      >
                        {{ 'feedback.surveyFields.options' | transloco }}
                      </legend>
                      <div class="flex flex-col gap-2">
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
                              [placeholder]="
                                'feedback.surveyForm.optionN' | transloco: { n: j + 1 }
                              "
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

                  <label
                    class="flex h-10 cursor-pointer items-center gap-2.5 rounded-tile border border-border bg-surface px-3 text-ui text-fg sm:col-span-2"
                  >
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="q.required"
                      (change)="patch(i, { required: $any($event.target).checked })"
                    />
                    {{ 'feedback.surveyFields.required' | transloco }}
                  </label>
                </div>
                @for (p of problemsFor(i + 1); track p) {
                  <p class="mt-2 text-meta font-medium text-fail-ink">{{ p | transloco }}</p>
                }
              </li>
            }
          </ol>
          @if (form().questions.length < maxQuestions) {
            <div class="flex flex-wrap items-center gap-2">
              <label for="cf-sv-add-type" class="text-ui font-semibold text-fg-muted">
                {{ 'feedback.surveyForm.addLabel' | transloco }}
              </label>
              <select
                id="cf-sv-add-type"
                [class]="input + ' w-auto! min-w-48'"
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
      </app-form-section>

      @if (mode() === 'edit') {
        <app-form-section [columns]="1">
          <app-form-field [label]="'feedback.form.changeReason' | transloco" inputId="cf-sv-reason">
            <input
              id="cf-sv-reason"
              type="text"
              maxlength="1000"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            />
          </app-form-field>
        </app-form-section>
      }

      <app-form-actions
        [message]="
          attempted() && hasProblems() ? ('feedback.surveyForm.fixProblems' | transloco) : ''
        "
      >
        <app-button variant="secondary" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()" [disabled]="busy()" data-testid="survey-save">
          {{
            (mode() === 'create' ? 'feedback.surveyForm.create' : 'feedback.form.save') | transloco
          }}
        </app-button>
      </app-form-actions>
    </form>
  `,
})
export class SurveyForm {
  private readonly assignees = inject(AssigneeOptionsService);
  protected readonly customers = inject(CustomersAvailability);
  private readonly language = inject(LanguageService);

  readonly value = input.required<SurveyFormValue>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly busy = input(false);
  readonly questionsLocked = input(false);
  readonly ownerName = input<string | null>(null);

  readonly submitted = output<SurveyFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly input = INPUT;
  protected readonly iconButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-subtle outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40';
  protected readonly types = QUESTION_TYPES;
  protected readonly languages = SURVEY_LANGUAGES;
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
  /** The follow-up threshold on a 1–5 rating ("2 av 5"), or null when it is off. */
  protected readonly thresholdFive = computed(() => {
    const raw = this.form().low_score_threshold;
    return raw === '' || this.errors()['low_score_threshold'] ? null : thresholdOnFive(Number(raw));
  });
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

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, switchMap } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { DocumentSummary } from '../../../core/documents/document.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  CourseForm,
  FormIssue,
  LessonForm,
  MAX_OPTIONS,
  QuestionForm,
  appendQuiz,
  applyGeneratedCourse,
  courseFormFrom,
  createPayload,
  emptyCourseForm,
  emptyLesson,
  emptyQuestion,
  isGeneratedCourse,
  isGeneratedQuiz,
  lessonsPayload,
  moveItem,
  removeOption,
  updatePayload,
  validateCourseForm,
} from '../data/course-form';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, trainingErrorKey } from '../data/training-display';
import { COURSE_CATEGORIES, COURSE_KINDS, CourseDetail } from '../data/training.models';
import { TrainingPeople } from '../shared/people';
import { TrainingNav } from '../training-nav';

/**
 * `/training/courses/new` and `/training/courses/:id/edit`: the course builder.
 * Course facts, lessons (markdown, video link, document, minutes) with quizzes,
 * plus AI drafting of a whole course or of a lesson's quiz. Saving a published
 * course creates a new version; the change reason goes into the revision history.
 */
@Component({
  selector: 'app-course-editor',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    TrainingNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-nav />
    <div class="mx-auto max-w-[980px] px-4 pt-6 pb-16 sm:px-8">
      <a
        [routerLink]="id() ? ['/training/courses', id()] : '/training/courses'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'training.form.backToCourse' : 'training.courses.back') | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'training.form.editTitle' : 'training.form.newTitle') | transloco }}
      </h1>

      <div class="mb-5 grid gap-4 lg:grid-cols-[1fr_300px]">
        <app-guide-intro scope="training" page="form" />
        <app-why-it-matters scope="training" page="form" />
      </div>

      @if (loading()) {
        <p class="text-[13.5px] text-fg-muted" role="status">
          {{ 'training.common.loading' | transloco }}
        </p>
      } @else if (loadError(); as key) {
        <app-alert>{{ key | transloco }}</app-alert>
      } @else {
        @if (!id() || original()?.status === 'draft') {
          <app-card class="mb-5">
            <h2 class="mb-1 flex items-center gap-1.5 text-[15px] font-semibold text-fg">
              <app-icon name="spark" [size]="16" />
              {{ 'training.ai.draftTitle' | transloco }}
            </h2>
            <p class="mb-3 text-[13px] text-fg-muted">{{ 'training.ai.draftIntro' | transloco }}</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <app-form-field [label]="'training.ai.topic' | transloco" inputId="ai-topic">
                <textarea
                  id="ai-topic"
                  rows="2"
                  [ngModel]="aiTopic()"
                  (ngModelChange)="aiTopic.set($event)"
                  [placeholder]="'training.ai.topicPlaceholder' | transloco"
                ></textarea>
              </app-form-field>
              <app-form-field [label]="'training.ai.source' | transloco" inputId="ai-doc">
                <select
                  id="ai-doc"
                  [ngModel]="aiDocument()"
                  (ngModelChange)="aiDocument.set($event)"
                >
                  <option value="">{{ 'training.ai.noSource' | transloco }}</option>
                  @for (doc of documents(); track doc.id) {
                    <option [value]="doc.id">{{ doc.doc_code }} · {{ doc.title }}</option>
                  }
                </select>
              </app-form-field>
              <app-form-field [label]="'training.ai.audience' | transloco" inputId="ai-audience">
                <input
                  id="ai-audience"
                  [ngModel]="aiAudience()"
                  (ngModelChange)="aiAudience.set($event)"
                  [placeholder]="'training.ai.audiencePlaceholder' | transloco"
                />
              </app-form-field>
              <div class="grid grid-cols-2 gap-3">
                <app-form-field [label]="'training.ai.lessons' | transloco" inputId="ai-lessons">
                  <input
                    id="ai-lessons"
                    type="number"
                    min="1"
                    max="8"
                    [ngModel]="aiLessons()"
                    (ngModelChange)="aiLessons.set(+$event)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'training.ai.questions' | transloco"
                  inputId="ai-questions"
                >
                  <input
                    id="ai-questions"
                    type="number"
                    min="0"
                    max="5"
                    [ngModel]="aiQuestions()"
                    (ngModelChange)="aiQuestions.set(+$event)"
                  />
                </app-form-field>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <app-ai-assist-button
                assist="training.generate_course"
                labelKey="training.ai.generate"
                variant="primary"
                [input]="aiInput()"
                [disabled]="!aiTopic().trim() && !aiDocument()"
                (result)="onGenerated($event)"
              />
              <span class="text-[12.5px] text-fg-muted">{{
                'training.ai.reviewNote' | transloco
              }}</span>
            </div>
          </app-card>
        }

        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-card>
            <h2 class="mb-3 text-[15px] font-semibold text-fg">
              {{ 'training.form.basics' | transloco }}
            </h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'training.fields.title' | transloco"
                  inputId="course-title"
                >
                  <input
                    id="course-title"
                    name="title"
                    required
                    maxlength="255"
                    [(ngModel)]="form.title"
                  />
                </app-form-field>
              </div>
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'training.fields.description' | transloco"
                  inputId="course-description"
                >
                  <textarea
                    id="course-description"
                    name="description"
                    rows="3"
                    [(ngModel)]="form.description"
                  ></textarea>
                </app-form-field>
                <app-field-help scope="training" page="form" field="description" />
              </div>
              <div>
                <app-form-field [label]="'training.fields.kind' | transloco" inputId="course-kind">
                  <select id="course-kind" name="kind" [(ngModel)]="form.kind">
                    @for (k of kinds; track k) {
                      <option [value]="k">{{ 'training.kind.' + k | transloco }}</option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="training" page="form" field="kind" />
              </div>
              <app-form-field
                [label]="'training.fields.category' | transloco"
                inputId="course-category"
              >
                <select id="course-category" name="category" [(ngModel)]="form.category">
                  @for (c of categories; track c) {
                    <option [value]="c">{{ 'training.category.' + c | transloco }}</option>
                  }
                </select>
              </app-form-field>
              <app-form-field [label]="'training.fields.owner' | transloco" inputId="course-owner">
                <select id="course-owner" name="owner" [(ngModel)]="form.ownerUserId">
                  <option value="">{{ 'training.common.none' | transloco }}</option>
                  @for (p of directory.people(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
              </app-form-field>
              <div>
                <app-form-field
                  [label]="'training.fields.document' | transloco"
                  inputId="course-document"
                >
                  <select id="course-document" name="document" [(ngModel)]="form.documentId">
                    <option value="">{{ 'training.common.none' | transloco }}</option>
                    @for (doc of documents(); track doc.id) {
                      <option [value]="doc.id">{{ doc.doc_code }} · {{ doc.title }}</option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="training" page="form" field="document" />
              </div>
              <div>
                <app-form-field
                  [label]="'training.form.passMarkPct' | transloco"
                  inputId="course-pass"
                >
                  <input
                    id="course-pass"
                    name="pass"
                    type="number"
                    min="0"
                    max="100"
                    [(ngModel)]="form.passMarkPct"
                  />
                </app-form-field>
                <div class="flex items-start gap-1">
                  <app-field-help scope="training" page="form" field="passMark" />
                  <app-ask-about field="pass_mark" [prompt]="'training.ask.passMark' | transloco" />
                </div>
              </div>
              <div>
                <app-form-field
                  [label]="'training.form.validityMonths' | transloco"
                  inputId="course-validity"
                >
                  <input
                    id="course-validity"
                    name="validity"
                    type="number"
                    min="1"
                    max="120"
                    [(ngModel)]="form.validityMonths"
                  />
                </app-form-field>
                <app-field-help scope="training" page="form" field="validity" />
              </div>
              <app-form-field
                [label]="'training.form.estimatedMinutes' | transloco"
                inputId="course-minutes"
              >
                <input
                  id="course-minutes"
                  name="minutes"
                  type="number"
                  min="0"
                  max="10000"
                  [(ngModel)]="form.estimatedMinutes"
                />
              </app-form-field>
            </div>
          </app-card>

          <section [attr.aria-labelledby]="'lessons-heading'">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="lessons-heading" class="text-[17px] font-bold text-fg">
                {{ 'training.form.lessonsTitle' | transloco: { count: form.lessons.length } }}
              </h2>
              <app-button
                variant="secondary"
                size="sm"
                (click)="addLesson()"
                data-testid="lesson-add"
              >
                <app-icon name="plus" [size]="14" />
                {{ 'training.form.addLesson' | transloco }}
              </app-button>
            </div>
            @if (form.kind === 'read_and_understood') {
              <p class="mb-3 text-[13px] text-fg-muted">
                {{ 'training.form.readAckHint' | transloco }}
              </p>
            }
            <div class="flex flex-col gap-4">
              @for (
                lesson of form.lessons;
                track lesson.key;
                let li = $index;
                let first = $first;
                let last = $last
              ) {
                <app-card>
                  <fieldset class="flex flex-col gap-3" [attr.data-testid]="'lesson-' + li">
                    <legend class="sr-only">
                      {{ 'training.form.lessonN' | transloco: { n: li + 1 } }}
                    </legend>
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <h3 class="text-[14px] font-semibold text-fg" aria-hidden="true">
                        {{ 'training.form.lessonN' | transloco: { n: li + 1 } }}
                      </h3>
                      <div class="flex flex-wrap gap-1">
                        <app-button
                          size="sm"
                          variant="ghost"
                          [disabled]="first"
                          (click)="moveLesson(li, -1)"
                        >
                          {{ 'training.form.moveUp' | transloco }}
                        </app-button>
                        <app-button
                          size="sm"
                          variant="ghost"
                          [disabled]="last"
                          (click)="moveLesson(li, 1)"
                        >
                          {{ 'training.form.moveDown' | transloco }}
                        </app-button>
                        <app-button size="sm" variant="ghost" (click)="removeLesson(li)">
                          {{ 'training.common.remove' | transloco }}
                        </app-button>
                      </div>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-[1fr_120px]">
                      <app-form-field
                        [label]="'training.form.lessonTitle' | transloco"
                        [inputId]="'l-title-' + lesson.key"
                      >
                        <input
                          [id]="'l-title-' + lesson.key"
                          [name]="'l-title-' + lesson.key"
                          maxlength="255"
                          [(ngModel)]="lesson.title"
                        />
                      </app-form-field>
                      <app-form-field
                        [label]="'training.form.lessonMinutes' | transloco"
                        [inputId]="'l-min-' + lesson.key"
                      >
                        <input
                          [id]="'l-min-' + lesson.key"
                          [name]="'l-min-' + lesson.key"
                          type="number"
                          min="0"
                          max="600"
                          [(ngModel)]="lesson.minutes"
                        />
                      </app-form-field>
                    </div>
                    <app-form-field
                      [label]="'training.form.lessonBody' | transloco"
                      [inputId]="'l-body-' + lesson.key"
                    >
                      <textarea
                        [id]="'l-body-' + lesson.key"
                        [name]="'l-body-' + lesson.key"
                        rows="7"
                        class="font-mono"
                        [(ngModel)]="lesson.body"
                      ></textarea>
                    </app-form-field>
                    <app-field-help scope="training" page="form" field="lessonBody" />
                    <div class="grid gap-3 sm:grid-cols-2">
                      <app-form-field
                        [label]="'training.form.videoUrl' | transloco"
                        [inputId]="'l-video-' + lesson.key"
                      >
                        <input
                          [id]="'l-video-' + lesson.key"
                          [name]="'l-video-' + lesson.key"
                          type="url"
                          placeholder="https://"
                          [(ngModel)]="lesson.videoUrl"
                        />
                      </app-form-field>
                      <app-form-field
                        [label]="'training.form.lessonDocument' | transloco"
                        [inputId]="'l-doc-' + lesson.key"
                      >
                        <select
                          [id]="'l-doc-' + lesson.key"
                          [name]="'l-doc-' + lesson.key"
                          [(ngModel)]="lesson.documentId"
                        >
                          <option value="">{{ 'training.common.none' | transloco }}</option>
                          @for (doc of documents(); track doc.id) {
                            <option [value]="doc.id">{{ doc.doc_code }} · {{ doc.title }}</option>
                          }
                        </select>
                      </app-form-field>
                    </div>

                    <div class="rounded-tile border border-border bg-surface-2/40 p-3">
                      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h4 class="text-[13px] font-semibold text-fg">
                          {{ 'training.form.quizTitle' | transloco: { count: lesson.quiz.length } }}
                        </h4>
                        <div class="flex flex-wrap gap-2">
                          <app-ai-assist-button
                            assist="training.generate_quiz"
                            labelKey="training.ai.generateQuiz"
                            [input]="{ title: lesson.title, body: lesson.body, questions: 3 }"
                            [disabled]="!lesson.title.trim() || !lesson.body.trim()"
                            (result)="onQuiz(lesson, $event)"
                          />
                          <app-button size="sm" variant="secondary" (click)="addQuestion(lesson)">
                            <app-icon name="plus" [size]="14" />
                            {{ 'training.form.addQuestion' | transloco }}
                          </app-button>
                        </div>
                      </div>
                      @for (q of lesson.quiz; track $index; let qi = $index) {
                        <fieldset
                          class="mb-3 rounded-tile border border-border bg-surface p-3 last:mb-0"
                        >
                          <legend class="px-1 text-[12.5px] font-semibold text-fg-muted">
                            {{ 'training.form.questionN' | transloco: { n: qi + 1 } }}
                          </legend>
                          <app-form-field
                            [label]="'training.form.question' | transloco"
                            [inputId]="'q-' + lesson.key + '-' + qi"
                          >
                            <input
                              [id]="'q-' + lesson.key + '-' + qi"
                              [name]="'q-' + lesson.key + '-' + qi"
                              [(ngModel)]="q.question"
                            />
                          </app-form-field>
                          <p class="mt-2 mb-1 text-[12.5px] text-fg-muted">
                            {{ 'training.form.optionsHint' | transloco }}
                          </p>
                          <div class="flex flex-col gap-1.5">
                            @for (opt of q.options; track $index; let oi = $index) {
                              <div class="flex items-center gap-2">
                                <input
                                  type="radio"
                                  class="accent-accent"
                                  [name]="'a-' + lesson.key + '-' + qi"
                                  [checked]="q.answer === oi"
                                  (change)="q.answer = oi"
                                  [attr.aria-label]="
                                    'training.form.markCorrect' | transloco: { n: oi + 1 }
                                  "
                                />
                                <label
                                  class="sr-only"
                                  [attr.for]="'o-' + lesson.key + '-' + qi + '-' + oi"
                                >
                                  {{ 'training.form.optionN' | transloco: { n: oi + 1 } }}
                                </label>
                                <input
                                  [id]="'o-' + lesson.key + '-' + qi + '-' + oi"
                                  [name]="'o-' + lesson.key + '-' + qi + '-' + oi"
                                  class="h-9 flex-1 rounded-[8px] border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
                                  [ngModel]="opt"
                                  (ngModelChange)="q.options[oi] = $event"
                                />
                                <button
                                  type="button"
                                  class="rounded-[6px] p-1 text-fg-subtle hover:text-fail disabled:opacity-40"
                                  [disabled]="q.options.length <= 2"
                                  [attr.aria-label]="
                                    'training.form.removeOption' | transloco: { n: oi + 1 }
                                  "
                                  (click)="dropOption(q, oi)"
                                >
                                  <app-icon name="x" [size]="13" />
                                </button>
                              </div>
                            }
                          </div>
                          <div class="mt-2 flex flex-wrap items-center gap-2">
                            <app-button
                              size="sm"
                              variant="ghost"
                              [disabled]="q.options.length >= maxOptions"
                              (click)="q.options.push('')"
                            >
                              {{ 'training.form.addOption' | transloco }}
                            </app-button>
                            <app-button
                              size="sm"
                              variant="ghost"
                              (click)="lesson.quiz.splice(qi, 1)"
                            >
                              {{ 'training.form.removeQuestion' | transloco }}
                            </app-button>
                          </div>
                          <div class="mt-2">
                            <app-form-field
                              [label]="'training.form.explanation' | transloco"
                              [inputId]="'e-' + lesson.key + '-' + qi"
                            >
                              <input
                                [id]="'e-' + lesson.key + '-' + qi"
                                [name]="'e-' + lesson.key + '-' + qi"
                                [(ngModel)]="q.explanation"
                              />
                            </app-form-field>
                          </div>
                        </fieldset>
                      } @empty {
                        <p class="text-[12.5px] text-fg-muted">
                          {{ 'training.form.noQuiz' | transloco }}
                        </p>
                      }
                    </div>
                  </fieldset>
                </app-card>
              } @empty {
                <p class="text-[13px] text-fg-muted">{{ 'training.form.noLessons' | transloco }}</p>
              }
            </div>
          </section>

          @if (id()) {
            <app-card>
              @if (original()?.status === 'published') {
                <p class="mb-3 text-[13px] text-warn">
                  {{ 'training.form.publishedNote' | transloco }}
                </p>
              }
              <app-form-field
                [label]="'training.form.changeReason' | transloco"
                inputId="course-reason"
              >
                <input
                  id="course-reason"
                  name="reason"
                  maxlength="1000"
                  [(ngModel)]="changeReason"
                  [placeholder]="'training.form.changeReasonPlaceholder' | transloco"
                />
              </app-form-field>
            </app-card>
          }

          @if (issues().length) {
            <app-alert>
              <ul class="list-disc pl-4" data-testid="form-issues">
                @for (issue of issues(); track $index) {
                  <li>{{ issue.key | transloco: issue.params }}</li>
                }
              </ul>
            </app-alert>
          }
          @if (saveError(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }

          <div class="flex flex-wrap justify-end gap-2">
            <a [routerLink]="id() ? ['/training/courses', id()] : '/training/courses'">
              <app-button variant="secondary">{{
                'training.common.cancel' | transloco
              }}</app-button>
            </a>
            <app-button type="submit" [loading]="saving()" data-testid="course-save">
              {{ (id() ? 'training.form.save' : 'training.form.create') | transloco }}
            </app-button>
          </div>
        </form>
      }
    </div>
  `,
})
export class CourseEditor {
  private readonly api = inject(TrainingApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly directory = inject(TrainingPeople);

  /** Route param (absent on `/new`). */
  readonly id = input<string | undefined>(undefined);

  protected readonly kinds = COURSE_KINDS;
  protected readonly categories = COURSE_CATEGORIES;
  protected readonly maxOptions = MAX_OPTIONS;

  protected form: CourseForm = emptyCourseForm();
  protected changeReason = '';
  protected readonly original = signal<CourseDetail | null>(null);
  protected readonly documents = signal<readonly DocumentSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly issues = signal<readonly FormIssue[]>([]);

  protected readonly aiTopic = signal('');
  protected readonly aiDocument = signal('');
  protected readonly aiAudience = signal('');
  protected readonly aiLessons = signal(3);
  protected readonly aiQuestions = signal(3);
  protected readonly aiInput = computed(() => {
    const input: Record<string, unknown> = {
      lessons: Math.min(8, Math.max(1, this.aiLessons() || 3)),
      questions_per_lesson: Math.min(5, Math.max(0, this.aiQuestions() || 0)),
    };
    if (this.aiTopic().trim()) {
      input['topic'] = this.aiTopic().trim();
    }
    if (this.aiDocument()) {
      input['document_id'] = this.aiDocument();
    }
    if (this.aiAudience().trim()) {
      input['audience'] = this.aiAudience().trim();
    }
    return input;
  });

  private sub = new Subscription();

  constructor() {
    providePageContext(() => {
      const id = this.id();
      return {
        module: TRAINING_MODULE,
        entityType: 'course',
        entityId: id ?? null,
        view: id ? 'edit' : 'new',
        title: this.original()?.title ?? null,
      };
    });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected addLesson(): void {
    this.form.lessons = [...this.form.lessons, emptyLesson()];
  }

  protected removeLesson(index: number): void {
    this.form.lessons = this.form.lessons.filter((_, i) => i !== index);
  }

  protected moveLesson(index: number, delta: number): void {
    this.form.lessons = moveItem(this.form.lessons, index, index + delta);
  }

  protected addQuestion(lesson: LessonForm): void {
    lesson.quiz = [...lesson.quiz, emptyQuestion()];
  }

  protected dropOption(question: QuestionForm, index: number): void {
    removeOption(question, index);
  }

  protected onGenerated(value: unknown): void {
    if (!isGeneratedCourse(value)) {
      return;
    }
    applyGeneratedCourse(this.form, value);
    if (this.aiDocument() && !this.form.documentId) {
      this.form.documentId = this.aiDocument();
    }
    this.issues.set([]);
    this.notifications.info('training.ai.generated');
  }

  protected onQuiz(lesson: LessonForm, value: unknown): void {
    if (isGeneratedQuiz(value)) {
      appendQuiz(lesson, value.quiz);
      this.notifications.info('training.ai.quizGenerated', { count: value.quiz.length });
    }
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    const issues = validateCourseForm(this.form);
    this.issues.set(issues);
    if (issues.length) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const id = this.id();
    const request = id
      ? this.api
          .updateCourse(orgId, id, updatePayload(this.form, this.changeReason))
          .pipe(
            switchMap(() =>
              this.api.replaceLessons(orgId, id, lessonsPayload(this.form), this.changeReason),
            ),
          )
      : this.api.createCourse(orgId, createPayload(this.form));
    request.subscribe({
      next: (course) => {
        this.saving.set(false);
        this.notifications.success(id ? 'training.form.savedToast' : 'training.form.createdToast');
        void this.router.navigate(['/training/courses', course.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(trainingErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.directory.ensureLoaded();
    const canReadDocuments = (this.selectedOrg.currentOrg()?.permissions ?? []).includes(
      'documents:read',
    );
    if (canReadDocuments) {
      this.sub.add(
        this.documentsApi.list(orgId).subscribe({
          next: (docs) =>
            this.documents.set([...docs].sort((a, b) => a.doc_code.localeCompare(b.doc_code))),
          error: () => this.documents.set([]),
        }),
      );
    }
    if (!id) {
      this.form = emptyCourseForm();
      this.original.set(null);
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.sub.add(
      this.api.getCourse(orgId, id).subscribe({
        next: (course) => {
          this.original.set(course);
          this.form = courseFormFrom(course);
          this.loading.set(false);
          if (course.status === 'archived') {
            this.loadError.set('training.errors.course_archived');
          }
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.loadError.set(trainingErrorKey(err));
        },
      }),
    );
  }
}

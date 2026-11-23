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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, switchMap } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { DocumentSummary } from '../../../core/documents/document.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
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
import { clauseLabel } from '../data/clause-label';
import { TRAINING_MODULE, TrainingAccess, trainingErrorKey } from '../data/training-display';
import {
  COURSE_CATEGORIES,
  COURSE_KINDS,
  CourseCategory,
  CourseDetail,
  NamedOption,
} from '../data/training.models';
import { TrainingPeople } from '../shared/people';

/**
 * Clauses a course in this category usually documents (portal fallback for older
 * backends without `suggested_clause_refs`; the backend list wins). Suggestions only.
 */
export const CATEGORY_CLAUSES: Readonly<Record<string, readonly string[]>> = {
  general: ['hs:7.2', 'hs:7.3'],
  onboarding: ['hs:7.2', 'hs:7.3'],
  quality: ['hs:7.2', 'hs:7.3', 'iso9001:7.2'],
  information_security: ['hs:7.3', 'iso27001:A.6.3', 'nis2:21.2.g'],
  privacy: ['hs:7.3', 'gdpr:39', 'iso27001:A.6.3'],
  ai_literacy: ['eu_ai_act:4', 'iso42001:7.2', 'iso42001:7.3'],
  hse: ['hs:7.2', 'iso45001:7.2', 'iso45001:7.3'],
  environment: ['hs:7.2', 'iso14001:7.2', 'iso14001:7.3'],
  compliance: ['hs:7.2', 'hs:7.3'],
  other: ['hs:7.2'],
};

/** Suggested clauses not yet picked. */
export function clauseSuggestions(
  category: string,
  fromBackend: readonly string[] | undefined,
  picked: readonly string[],
): string[] {
  const list = fromBackend?.length ? fromBackend : (CATEGORY_CLAUSES[category] ?? []);
  const have = new Set(picked);
  return list.filter((ref) => !have.has(ref));
}

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
    TranslocoPipe,
    ClausePicker,
    FlowBanner,
    HelpStrip,
    LoadingState,
    PageHeader,
    Alert,
    Button,
    FormActions,
    FormSection,
    FormField,
    Icon,
    AiAssistButton,
    AskAbout,
    FieldHelp,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'training.form.editTitle' : 'training.form.newTitle'"
        [backLink]="id() ? ['/training/courses', id()] : '/training/courses'"
        [breadcrumbs]="
          id()
            ? [
                { labelKey: 'modules.names.training', link: '/training' },
                { labelKey: 'training.courses.title', link: '/training/courses' },
                { label: original()?.title ?? '', link: ['/training/courses', id()] },
                { labelKey: 'training.form.editTitle' },
              ]
            : [
                { labelKey: 'modules.names.training', link: '/training' },
                { labelKey: 'training.courses.title', link: '/training/courses' },
                { labelKey: 'training.form.newTitle' },
              ]
        "
      />
      <app-help-strip class="mb-5 block" scope="training" page="form" />

      @if (loading()) {
        <app-loading-state [rows]="6" />
      } @else if (loadError(); as key) {
        <app-alert>{{ key | transloco }}</app-alert>
      } @else {
        <div class="flex flex-col gap-5">
          @if (flow()) {
            <app-flow-banner [flow]="flow()" />
          }
          @if (!id() || original()?.status === 'draft') {
            <app-form-section
              [title]="'training.ai.draftTitle' | transloco"
              [description]="'training.ai.draftIntro' | transloco"
            >
              <app-icon title-suffix name="spark" [size]="16" class="text-accent" />
              <app-form-field
                span="full"
                [label]="'training.ai.topic' | transloco"
                inputId="ai-topic"
              >
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
              <app-form-field [label]="'training.ai.questions' | transloco" inputId="ai-questions">
                <input
                  id="ai-questions"
                  type="number"
                  min="0"
                  max="5"
                  [ngModel]="aiQuestions()"
                  (ngModelChange)="aiQuestions.set(+$event)"
                />
              </app-form-field>
              <div class="flex flex-wrap items-center gap-3 sm:col-span-2">
                <app-ai-assist-button
                  assist="training.generate_course"
                  labelKey="training.ai.generate"
                  variant="primary"
                  [input]="aiInput()"
                  [disabled]="!aiTopic().trim() && !aiDocument()"
                  (result)="onGenerated($event)"
                />
                <span class="text-meta text-fg-muted">{{
                  'training.ai.reviewNote' | transloco
                }}</span>
              </div>
            </app-form-section>
          }

          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
            <app-form-section
              [title]="'training.form.basics' | transloco"
              [description]="'training.form.basicsHint' | transloco"
            >
              <app-form-field
                span="full"
                [label]="'training.fields.title' | transloco"
                inputId="course-title"
                [required]="true"
              >
                <input
                  id="course-title"
                  name="title"
                  required
                  maxlength="255"
                  [(ngModel)]="form.title"
                />
              </app-form-field>
              <app-form-field
                [label]="'training.fields.kind' | transloco"
                inputId="course-kind"
                [hint]="'training.form.kindHelp.' + form.kind | transloco"
              >
                <app-field-help
                  label-suffix
                  scope="training"
                  page="form"
                  field="kind"
                  [label]="'training.fields.kind' | transloco"
                />
                <select id="course-kind" name="kind" [(ngModel)]="form.kind">
                  @for (k of kinds; track k) {
                    <option [value]="k">{{ 'training.kind.' + k | transloco }}</option>
                  }
                </select>
              </app-form-field>
              <app-form-field
                [label]="'training.fields.category' | transloco"
                inputId="course-category"
              >
                <select
                  id="course-category"
                  name="category"
                  [ngModel]="form.category"
                  (ngModelChange)="form.category = $event; category.set($event)"
                >
                  @for (c of categories; track c) {
                    <option [value]="c">{{ 'training.category.' + c | transloco }}</option>
                  }
                </select>
              </app-form-field>
              <app-form-field [label]="'training.fields.owner' | transloco" inputId="course-owner">
                <app-field-help
                  label-suffix
                  scope="training"
                  page="form"
                  field="owner"
                  [label]="'training.fields.owner' | transloco"
                />
                <select id="course-owner" name="owner" [(ngModel)]="form.ownerUserId">
                  <option value="">{{ 'training.form.noOwner' | transloco }}</option>
                  @for (p of directory.people(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
              </app-form-field>
              <app-form-field
                [label]="'training.fields.document' | transloco"
                inputId="course-document"
              >
                <app-field-help
                  label-suffix
                  scope="training"
                  page="form"
                  field="document"
                  [label]="'training.fields.document' | transloco"
                />
                <select id="course-document" name="document" [(ngModel)]="form.documentId">
                  <option value="">{{ 'training.form.noDocument' | transloco }}</option>
                  @for (doc of documents(); track doc.id) {
                    <option [value]="doc.id">{{ doc.doc_code }} · {{ doc.title }}</option>
                  }
                </select>
              </app-form-field>
              <app-form-field
                span="full"
                [label]="'training.fields.description' | transloco"
                inputId="course-description"
              >
                <app-field-help
                  label-suffix
                  scope="training"
                  page="form"
                  field="description"
                  [label]="'training.fields.description' | transloco"
                />
                <textarea
                  id="course-description"
                  name="description"
                  rows="3"
                  [(ngModel)]="form.description"
                ></textarea>
              </app-form-field>
              <app-form-field
                span="full"
                [label]="'training.fields.learningObjectives' | transloco"
                inputId="course-objectives"
              >
                <app-field-help
                  label-suffix
                  scope="training"
                  page="form"
                  field="learningObjectives"
                  [label]="'training.fields.learningObjectives' | transloco"
                />
                <textarea
                  id="course-objectives"
                  name="objectives"
                  rows="3"
                  maxlength="5000"
                  [placeholder]="'training.form.objectivesPlaceholder' | transloco"
                  [(ngModel)]="form.learningObjectives"
                ></textarea>
              </app-form-field>
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
            </app-form-section>

            <app-form-section
              [title]="'training.form.requirementsTitle' | transloco"
              [description]="'training.form.requirementsIntro' | transloco"
            >
              <app-form-field
                span="full"
                [label]="'training.fields.clauseRefs' | transloco"
                inputId="course-clauses"
              >
                <app-field-help
                  label-suffix
                  scope="training"
                  page="form"
                  field="clauseRefs"
                  [label]="'training.fields.clauseRefs' | transloco"
                />
                <app-ask-about
                  label-suffix
                  field="clause_refs"
                  [prompt]="'training.ask.clauses' | transloco"
                />
                <app-clause-picker
                  inputId="course-clauses"
                  name="clauses"
                  [ngModel]="form.clauseRefs"
                  (ngModelChange)="form.clauseRefs = $event; picked.set($event)"
                />
                @if (suggestedClauses().length) {
                  <div
                    class="flex flex-wrap items-center gap-1.5 text-meta"
                    data-testid="clause-suggestions"
                  >
                    <span class="text-fg-muted">{{
                      'training.form.suggestedClauses' | transloco
                    }}</span>
                    @for (ref of suggestedClauses(); track ref) {
                      <button
                        type="button"
                        class="inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 font-semibold text-fg-muted hover:border-accent hover:text-accent"
                        [attr.aria-label]="
                          'training.form.addClause' | transloco: { clause: clauseText(ref) }
                        "
                        (click)="addClause(ref)"
                      >
                        <app-icon name="plus" [size]="12" />
                        {{ clauseText(ref) }}
                      </button>
                    }
                  </div>
                }
              </app-form-field>
              <app-form-field
                span="full"
                [label]="'training.fields.competences' | transloco"
                [hint]="
                  competenceOptions().length === 0
                    ? ('training.form.noCompetences' | transloco)
                    : ''
                "
              >
                <app-field-help
                  label-suffix
                  scope="training"
                  page="form"
                  field="competences"
                  [label]="'training.fields.competences' | transloco"
                />
                @if (competenceOptions().length) {
                  @if (form.competences.length) {
                    <ul class="flex flex-col gap-2">
                      @for (grant of form.competences; track $index; let gi = $index) {
                        <li
                          class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_200px_auto]"
                        >
                          <label class="sr-only" [attr.for]="'comp-' + gi">{{
                            'training.fields.competence' | transloco
                          }}</label>
                          <select
                            [id]="'comp-' + gi"
                            [name]="'comp-' + gi"
                            class="col-span-2 sm:col-span-1"
                            [(ngModel)]="grant.competenceId"
                          >
                            <option value="">
                              {{ 'training.form.pickCompetence' | transloco }}
                            </option>
                            @for (c of competenceOptions(); track c.id) {
                              <option [value]="c.id">{{ c.name }}</option>
                            }
                          </select>
                          <label class="sr-only" [attr.for]="'level-' + gi">{{
                            'training.fields.level' | transloco
                          }}</label>
                          <select
                            [id]="'level-' + gi"
                            [name]="'level-' + gi"
                            [(ngModel)]="grant.level"
                          >
                            @for (level of levels; track level) {
                              <option [ngValue]="level">
                                {{ 'training.competenceLevel.' + level | transloco }}
                              </option>
                            }
                          </select>
                          <app-button
                            size="sm"
                            variant="ghost"
                            class="self-center"
                            [attr.aria-label]="'training.common.remove' | transloco"
                            (click)="form.competences.splice(gi, 1)"
                          >
                            <app-icon name="trash" [size]="14" />
                          </app-button>
                        </li>
                      }
                    </ul>
                  }
                  <div>
                    <app-button
                      size="sm"
                      variant="secondary"
                      (click)="form.competences.push({ competenceId: '', level: 2 })"
                    >
                      <app-icon name="plus" [size]="14" />
                      {{ 'training.form.addCompetence' | transloco }}
                    </app-button>
                  </div>
                }
              </app-form-field>
              <app-form-field
                span="full"
                [label]="'training.fields.effectivenessCriteria' | transloco"
                inputId="course-criteria"
              >
                <app-field-help
                  label-suffix
                  scope="training"
                  page="form"
                  field="effectivenessCriteria"
                  [label]="'training.fields.effectivenessCriteria' | transloco"
                />
                <textarea
                  id="course-criteria"
                  name="criteria"
                  rows="2"
                  maxlength="5000"
                  [placeholder]="'training.form.criteriaPlaceholder' | transloco"
                  [(ngModel)]="form.effectivenessCriteria"
                ></textarea>
              </app-form-field>
              @if (form.kind === 'course') {
                <app-form-field
                  [label]="'training.form.passMarkPct' | transloco"
                  inputId="course-pass"
                  [hint]="quizCount() === 0 ? ('training.form.passMarkNoQuiz' | transloco) : ''"
                >
                  <app-field-help
                    label-suffix
                    scope="training"
                    page="form"
                    field="passMark"
                    [label]="'training.form.passMarkPct' | transloco"
                  />
                  <app-ask-about
                    label-suffix
                    field="pass_mark"
                    [prompt]="'training.ask.passMark' | transloco"
                  />
                  <input
                    id="course-pass"
                    name="pass"
                    type="number"
                    min="0"
                    max="100"
                    [(ngModel)]="form.passMarkPct"
                  />
                </app-form-field>
              }
              <app-form-field
                [label]="'training.form.validityMonths' | transloco"
                inputId="course-validity"
                [hint]="
                  (form.validityMonths
                    ? 'training.form.validityHelpSet'
                    : 'training.form.validityHelpEmpty'
                  ) | transloco: { months: form.validityMonths }
                "
              >
                <app-field-help
                  label-suffix
                  scope="training"
                  page="form"
                  field="validity"
                  [label]="'training.form.validityMonths' | transloco"
                />
                <app-ask-about
                  label-suffix
                  field="validity_months"
                  [prompt]="'training.ask.validity' | transloco"
                />
                <input
                  id="course-validity"
                  name="validity"
                  type="number"
                  min="1"
                  max="120"
                  [placeholder]="'training.form.validityPlaceholder' | transloco"
                  [(ngModel)]="form.validityMonths"
                />
              </app-form-field>
            </app-form-section>

            <app-form-section
              [title]="'training.form.lessonsTitle' | transloco: { count: form.lessons.length }"
              [description]="
                (form.kind === 'read_and_understood'
                  ? 'training.form.readAckHint'
                  : form.kind === 'external'
                    ? 'training.form.externalHint'
                    : 'training.form.lessonsHint'
                ) | transloco
              "
              [columns]="1"
            >
              <app-button
                section-actions
                variant="secondary"
                size="sm"
                (click)="addLesson()"
                data-testid="lesson-add"
              >
                <app-icon name="plus" [size]="14" />
                {{ 'training.form.addLesson' | transloco }}
              </app-button>
              @if (form.lessons.length) {
                <ol class="flex flex-col gap-4">
                  @for (
                    lesson of form.lessons;
                    track lesson.key;
                    let li = $index;
                    let first = $first;
                    let last = $last
                  ) {
                    <li class="rounded-tile border border-border bg-bg p-4">
                      <fieldset
                        class="flex min-w-0 flex-col gap-5"
                        [attr.data-testid]="'lesson-' + li"
                      >
                        <legend class="sr-only">
                          {{ 'training.form.lessonN' | transloco: { n: li + 1 } }}
                        </legend>
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <h3
                            class="flex items-center gap-2 text-body font-semibold text-fg"
                            aria-hidden="true"
                          >
                            <span
                              class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-soft px-1.5 text-meta font-bold text-accent"
                              >{{ li + 1 }}</span
                            >
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
                              <app-icon name="trash" [size]="14" />
                              {{ 'training.common.remove' | transloco }}
                            </app-button>
                          </div>
                        </div>
                        <div
                          class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_160px]"
                        >
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
                          [hint]="'training.form.lessonBodyHint' | transloco"
                        >
                          <app-field-help
                            label-suffix
                            scope="training"
                            page="form"
                            field="lessonBody"
                            [label]="'training.form.lessonBody' | transloco"
                          />
                          <textarea
                            [id]="'l-body-' + lesson.key"
                            [name]="'l-body-' + lesson.key"
                            rows="7"
                            [(ngModel)]="lesson.body"
                          ></textarea>
                        </app-form-field>
                        <div class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
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
                                <option [value]="doc.id">
                                  {{ doc.doc_code }} · {{ doc.title }}
                                </option>
                              }
                            </select>
                          </app-form-field>
                        </div>

                        <div class="rounded-tile border border-border bg-surface-2/40 p-3">
                          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h4 class="text-ui font-semibold text-fg">
                              {{
                                'training.form.quizTitle' | transloco: { count: lesson.quiz.length }
                              }}
                            </h4>
                            <div class="flex flex-wrap gap-2">
                              <app-ai-assist-button
                                assist="training.generate_quiz"
                                labelKey="training.ai.generateQuiz"
                                [input]="{ title: lesson.title, body: lesson.body, questions: 3 }"
                                [disabled]="!lesson.title.trim() || !lesson.body.trim()"
                                (result)="onQuiz(lesson, $event)"
                              />
                              <app-button
                                size="sm"
                                variant="secondary"
                                (click)="addQuestion(lesson)"
                              >
                                <app-icon name="plus" [size]="14" />
                                {{ 'training.form.addQuestion' | transloco }}
                              </app-button>
                            </div>
                          </div>
                          @for (q of lesson.quiz; track $index; let qi = $index) {
                            <fieldset
                              class="mb-3 flex min-w-0 flex-col gap-4 rounded-tile border border-border bg-surface p-3 last:mb-0"
                            >
                              <legend class="px-1 text-meta font-semibold text-fg-muted">
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
                              <div class="flex flex-col gap-1.5">
                                <p class="text-meta text-fg-subtle">
                                  {{ 'training.form.optionsHint' | transloco }}
                                </p>
                                @for (opt of q.options; track $index; let oi = $index) {
                                  <div class="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      class="h-4 w-4 accent-accent"
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
                                      class="h-10 min-w-0 flex-1 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                                      [ngModel]="opt"
                                      (ngModelChange)="q.options[oi] = $event"
                                    />
                                    <button
                                      type="button"
                                      class="rounded-tile p-1.5 text-fg-subtle hover:text-fail disabled:opacity-40"
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
                                <div class="flex flex-wrap items-center gap-2">
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
                              </div>
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
                            </fieldset>
                          } @empty {
                            <p class="text-meta text-fg-muted">
                              {{ 'training.form.noQuiz' | transloco }}
                            </p>
                          }
                        </div>
                      </fieldset>
                    </li>
                  }
                </ol>
              } @else {
                <p class="text-ui text-fg-muted">{{ 'training.form.noLessons' | transloco }}</p>
              }
            </app-form-section>

            @if (id()) {
              <app-form-section [columns]="1">
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
                  @if (original()?.status === 'published') {
                    <p class="text-meta leading-snug text-warn-ink">
                      {{ 'training.form.publishedNote' | transloco }}
                    </p>
                  }
                </app-form-field>
              </app-form-section>
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

            <app-form-actions [message]="saveError() ? (saveError()! | transloco) : ''">
              <app-button
                variant="secondary"
                (click)="
                  router.navigate(id() ? ['/training/courses', id()] : ['/training/courses'])
                "
              >
                {{ 'training.common.cancel' | transloco }}
              </app-button>
              <app-button type="submit" [loading]="saving()" data-testid="course-save">
                {{ (id() ? 'training.form.save' : 'training.form.create') | transloco }}
              </app-button>
            </app-form-actions>
          </form>
        </div>
      }
    </div>
  `,
})
export class CourseEditor {
  private readonly api = inject(TrainingApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly flows = inject(CreateFlowService);
  protected readonly router = inject(Router);
  protected readonly access = inject(TrainingAccess);
  protected readonly directory = inject(TrainingPeople);

  /** Route param (absent on `/new`). */
  readonly id = input<string | undefined>(undefined);

  protected readonly kinds = COURSE_KINDS;
  protected readonly categories = COURSE_CATEGORIES;
  protected readonly maxOptions = MAX_OPTIONS;
  protected readonly levels = [0, 1, 2, 3, 4];

  /** `?flow=` / `?fromRequirement=` on a new course (create-from-here, P4). */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), { targetType: 'course' });
  /** The picked category, as a signal (clause suggestions follow it). */
  protected readonly category = signal<CourseCategory>('general');
  protected readonly picked = signal<readonly string[]>([]);
  protected readonly competenceOptions = signal<readonly NamedOption[]>([]);
  protected readonly suggestedClauses = computed(() =>
    clauseSuggestions(this.category(), this.original()?.suggested_clause_refs, this.picked()),
  );

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
        requirements: this.original()?.clause_refs?.length
          ? [...(this.original()?.clause_refs ?? [])]
          : undefined,
      };
    });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  /** Questions in the form (a course without any is completed by opening every lesson). */
  protected quizCount(): number {
    return this.form.lessons.reduce((n, lesson) => n + lesson.quiz.length, 0);
  }

  protected clauseText(ref: string): string {
    return clauseLabel(ref, (key) => this.language.translate(key));
  }

  protected addClause(ref: string): void {
    if (!this.form.clauseRefs.includes(ref)) {
      this.form.clauseRefs = [...this.form.clauseRefs, ref];
    }
    this.picked.set(this.form.clauseRefs);
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
        if (!id) {
          this.flows.complete(course.id, 'course').subscribe();
        }
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
    this.sub.add(
      this.api.competences(orgId).subscribe({
        next: (res) =>
          this.competenceOptions.set(res.items.map((c) => ({ id: c.id, name: c.name }))),
        error: () => this.competenceOptions.set([]),
      }),
    );
    if (!id) {
      this.form = emptyCourseForm();
      const prefill = this.flow()?.prefill as Record<string, unknown> | undefined;
      if (prefill && typeof prefill['title'] === 'string') {
        this.form.title = prefill['title'];
      }
      if (prefill && typeof prefill['description'] === 'string') {
        this.form.description = prefill['description'];
      }
      this.category.set(this.form.category);
      this.picked.set(this.form.clauseRefs);
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
          this.category.set(this.form.category);
          this.picked.set(this.form.clauseRefs);
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

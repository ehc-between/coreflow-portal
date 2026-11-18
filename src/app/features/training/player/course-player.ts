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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LearningProgressService } from '../../../core/guidance/learning-progress.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { roleNameKey } from '../../../core/org/roles';
import { AskAbout } from '../../../shared/ask/ask-about';
import { LessonPlayer } from '../../../shared/guidance/lesson-player';
import { LocalDayPipe, LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  assignmentBadge,
  completionRuleOf,
  trainingErrorKey,
} from '../data/training-display';
import { AttemptOut, PlayerItem, PlayerOut } from '../data/training.models';
import { RatingInput } from '../shared/rating-input';
import {
  Answers,
  allAnswered,
  attemptBody,
  emptyAnswers,
  lessonState,
  questionCount,
  readingLesson,
  setAnswer,
} from './player-model';

type Stage =
  | { readonly kind: 'overview' }
  | { readonly kind: 'lesson'; readonly index: number }
  | { readonly kind: 'assessment' };

/**
 * `/training/courses/:id/learn`: take a course. Lessons play in the shared F6
 * lesson player (progress is stored as F6 learning progress); the final
 * assessment collects every quiz answer, the read-and-understood confirmation
 * and optional feedback, and the server scores it and issues the record.
 */
@Component({
  selector: 'app-course-player',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalPercentPipe,
    MarkdownPipe,
    Alert,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    ProgressBar,
    StatusBadge,
    AskAbout,
    LessonPlayer,
    RatingInput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-16 sm:px-8 sm:pt-7">
      @if (data(); as d) {
        @let badge = d.assignment ? assignmentBadgeOf(d.assignment) : null;
        <app-page-header
          [title]="d.course.title"
          [breadcrumbs]="[
            { labelKey: 'modules.names.training', link: '/training' },
            { labelKey: 'training.courses.title', link: '/training/courses' },
            { label: d.course.title, link: ['/training/courses', d.course.id] },
            { labelKey: 'training.player.crumb' },
          ]"
        >
          <ng-container ngProjectAs="[meta]">
            <span class="font-mono">{{ d.course.code }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ 'training.kind.' + d.course.kind | transloco }}</span>
            @if (badge) {
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="badge.meaning"
                [value]="badge.value"
                [labelKey]="badge.labelKey"
              />
            }
            @if (d.assignment?.due_at; as due) {
              <span>{{ 'training.home.dueOn' | transloco: { date: (due | localDay) } }}</span>
            }
          </ng-container>
        </app-page-header>
        <app-module-nav [items]="access.navItems()" labelKey="training.nav.label" />
        <app-help-strip scope="training" page="player" />
        <div class="mb-4">
          <app-progress-bar
            [value]="progressPct()"
            [label]="'training.player.progress' | transloco"
          />
        </div>

        @if (d.latest_record; as r) {
          @if (r.passed && !r.expired) {
            <app-alert tone="success">
              {{
                'training.player.alreadyCompleted'
                  | transloco: { date: (r.completed_at | localDay) }
              }}
              <a [routerLink]="['/training/records', r.id]" class="ml-1 font-semibold underline">
                {{ 'training.player.viewRecord' | transloco }}
              </a>
            </app-alert>
          }
        }

        @if (d.course.status !== 'published') {
          <app-alert>{{ 'training.errors.course_not_published' | transloco }}</app-alert>
        } @else if (d.course.kind === 'external') {
          <app-alert tone="info">{{ 'training.player.external' | transloco }}</app-alert>
        } @else {
          <div class="mt-4 grid gap-6 lg:grid-cols-[260px_1fr]">
            <nav [attr.aria-label]="'training.player.outline' | transloco">
              <ol class="flex flex-col gap-1" data-testid="player-outline">
                <li>
                  <button
                    type="button"
                    class="w-full rounded-tile px-3 py-2 text-left text-ui font-semibold"
                    [class]="
                      stage().kind === 'overview'
                        ? 'bg-accent-soft text-accent'
                        : 'text-fg-muted hover:bg-surface-2'
                    "
                    [attr.aria-current]="stage().kind === 'overview' ? 'step' : null"
                    (click)="stage.set({ kind: 'overview' })"
                  >
                    {{ 'training.player.overview' | transloco }}
                  </button>
                </li>
                @for (item of d.items; track item.id; let i = $index) {
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-ui"
                      [class]="
                        isLesson(i)
                          ? 'bg-accent-soft font-semibold text-accent'
                          : 'text-fg hover:bg-surface-2'
                      "
                      [attr.aria-current]="isLesson(i) ? 'step' : null"
                      (click)="openLesson(i)"
                    >
                      <span
                        class="flex h-5 w-5 flex-none items-center justify-center rounded-full text-micro"
                        [class]="
                          state(item) === 'done'
                            ? 'bg-pass text-white'
                            : 'bg-surface-2 text-fg-muted'
                        "
                        aria-hidden="true"
                      >
                        @if (state(item) === 'done') {
                          <app-icon name="check" [size]="12" />
                        } @else {
                          {{ i + 1 }}
                        }
                      </span>
                      <span class="min-w-0 flex-1 truncate">{{ item.lesson.title }}</span>
                      <span class="sr-only">{{
                        'training.player.state.' + state(item) | transloco
                      }}</span>
                    </button>
                  </li>
                }
                <li>
                  <button
                    type="button"
                    class="w-full rounded-tile px-3 py-2 text-left text-ui font-semibold"
                    [class]="
                      stage().kind === 'assessment'
                        ? 'bg-accent-soft text-accent'
                        : 'text-fg-muted hover:bg-surface-2'
                    "
                    [attr.aria-current]="stage().kind === 'assessment' ? 'step' : null"
                    (click)="openAssessment()"
                    data-testid="player-assessment-link"
                  >
                    {{ assessmentLabelKey() | transloco }}
                  </button>
                </li>
              </ol>
            </nav>

            <div class="min-w-0">
              @switch (stage().kind) {
                @case ('overview') {
                  <div class="flex flex-col gap-4">
                    @if (d.course.description) {
                      <div class="cf-prose" [innerHTML]="d.course.description | appMarkdown"></div>
                    }
                    <ul class="flex flex-col gap-1.5 text-ui text-fg" data-testid="player-facts">
                      <li>
                        {{
                          (d.items.length === 1
                            ? 'training.player.lessonsOne'
                            : 'training.player.lessons'
                          ) | transloco: { count: d.items.length }
                        }}
                        @if (d.course.estimated_minutes) {
                          ·
                          {{
                            'training.player.minutes'
                              | transloco: { count: d.course.estimated_minutes }
                          }}
                        }
                      </li>
                      <li class="text-fg-muted">
                        {{
                          'training.completion.' + completionRule()
                            | transloco: { pass: (d.course.pass_mark * 100 | localPercent) }
                        }}
                      </li>
                    </ul>
                    @if (d.course.learning_objectives) {
                      <section>
                        <h2 class="mb-1 text-card font-semibold text-fg">
                          {{ 'training.fields.learningObjectives' | transloco }}
                        </h2>
                        <div
                          class="cf-prose text-ui"
                          [innerHTML]="d.course.learning_objectives | appMarkdown"
                        ></div>
                      </section>
                    }
                    @if (d.assignment; as a) {
                      <p
                        class="rounded-tile border border-info/25 bg-info-soft/60 px-3 py-2 text-ui text-fg"
                        data-testid="player-why"
                      >
                        {{ whyAssigned() }}
                      </p>
                    }
                    <div class="flex flex-wrap gap-2">
                      <app-button
                        (click)="begin()"
                        [loading]="starting()"
                        data-testid="player-begin"
                      >
                        {{ 'training.player.begin' | transloco }}
                      </app-button>
                    </div>
                    @if (error(); as key) {
                      <app-alert>{{ key | transloco }}</app-alert>
                    }
                  </div>
                }
                @case ('lesson') {
                  @if (currentItem(); as item) {
                    <div class="flex flex-col gap-4">
                      @if (item.video_url || item.document) {
                        <div class="flex flex-wrap gap-2">
                          @if (item.video_url) {
                            <a [href]="item.video_url" target="_blank" rel="noopener noreferrer">
                              <app-button variant="secondary" size="sm">
                                {{ 'training.player.watchVideo' | transloco }}
                              </app-button>
                            </a>
                          }
                          @if (item.document; as doc) {
                            <a [routerLink]="doc.url" target="_blank">
                              <app-button variant="secondary" size="sm">
                                {{
                                  'training.player.openDocument' | transloco: { title: doc.title }
                                }}
                              </app-button>
                            </a>
                          }
                        </div>
                      }
                      <app-card>
                        @if (reading(); as lesson) {
                          <app-lesson-player [lesson]="lesson" (completed)="lessonFinished(item)" />
                        }
                      </app-card>
                      <div class="flex flex-wrap justify-end gap-2">
                        @if (lessonIndex() < d.items.length - 1) {
                          <app-button variant="secondary" (click)="openLesson(lessonIndex() + 1)">
                            {{ 'training.player.nextLesson' | transloco }}
                          </app-button>
                        } @else {
                          <app-button (click)="openAssessment()">
                            {{ assessmentLabelKey() | transloco }}
                          </app-button>
                        }
                      </div>
                    </div>
                  }
                }
                @case ('assessment') {
                  @if (result(); as r) {
                    <div class="flex flex-col gap-4" data-testid="attempt-result">
                      <app-alert [tone]="r.passed ? 'success' : 'error'">
                        @if (r.passed) {
                          @if (r.score !== null) {
                            {{ 'training.player.passedScore' | transloco: { score: r.score } }}
                          } @else {
                            {{ 'training.player.passed' | transloco }}
                          }
                        } @else {
                          {{
                            'training.player.failed'
                              | transloco
                                : { score: r.score ?? 0, pass: (r.pass_mark * 100 | localPercent) }
                          }}
                        }
                      </app-alert>
                      @if (r.results.length) {
                        <ul class="flex flex-col gap-1 text-ui">
                          @for (lr of r.results; track lr.lesson_id) {
                            @if (lr.total) {
                              <li
                                class="flex justify-between gap-2 rounded-tile bg-surface-2 px-3 py-1.5"
                              >
                                <span>{{ lessonTitle(lr.lesson_id) }}</span>
                                <span class="font-semibold">
                                  {{
                                    'training.player.lessonScore'
                                      | transloco: { correct: lr.correct, total: lr.total }
                                  }}
                                </span>
                              </li>
                            }
                          }
                        </ul>
                      }
                      <div class="flex flex-wrap gap-2">
                        @if (r.record; as rec) {
                          <app-button (click)="router.navigate(['/training/records', rec.id])">
                            {{ 'training.player.viewRecord' | transloco }}
                          </app-button>
                          @if (rec.certificate_no) {
                            <app-button
                              variant="secondary"
                              (click)="
                                router.navigate(['/training/records', rec.id, 'certificate'])
                              "
                            >
                              {{ 'training.player.certificate' | transloco }}
                            </app-button>
                          }
                        } @else {
                          <app-button (click)="retry()" data-testid="attempt-retry">
                            {{ 'training.player.retry' | transloco }}
                          </app-button>
                          <app-button variant="secondary" (click)="openLesson(0)">
                            {{ 'training.player.review' | transloco }}
                          </app-button>
                        }
                      </div>
                    </div>
                  } @else {
                    <form
                      class="flex flex-col gap-4"
                      (submit)="$event.preventDefault(); submit()"
                      data-testid="assessment-form"
                    >
                      <p class="text-ui text-fg-muted">
                        {{ 'training.player.assessmentIntro' | transloco }}
                      </p>
                      @for (item of quizItems(); track item.id) {
                        <section class="flex flex-col gap-3">
                          <h2 class="text-card font-semibold text-fg">{{ item.lesson.title }}</h2>
                          @for (q of item.lesson.quiz; track $index; let qi = $index) {
                            <fieldset
                              class="rounded-card border border-border bg-surface p-4"
                              data-testid="assessment-question"
                            >
                              <legend class="px-1 text-body font-semibold text-fg">
                                {{ 'training.player.questionN' | transloco: { n: qi + 1 } }}
                                {{ q.question }}
                              </legend>
                              <div class="mt-2 flex flex-col gap-1.5">
                                @for (option of q.options; track $index; let oi = $index) {
                                  <label
                                    class="flex cursor-pointer items-start gap-2.5 rounded-tile px-2 py-1.5 text-ui text-fg hover:bg-surface-2"
                                  >
                                    <input
                                      type="radio"
                                      class="mt-0.5 accent-accent"
                                      [name]="item.id + '-' + qi"
                                      [checked]="answers()[item.id]?.[qi] === oi"
                                      (change)="choose(item.id, qi, oi)"
                                    />
                                    <span>{{ option }}</span>
                                  </label>
                                }
                              </div>
                            </fieldset>
                          }
                        </section>
                      }

                      @if (d.course.kind === 'read_and_understood') {
                        <app-card>
                          @if (d.document; as doc) {
                            <p class="mb-2 text-ui text-fg">
                              <a
                                [routerLink]="doc.url"
                                target="_blank"
                                class="font-semibold text-accent hover:underline"
                              >
                                {{ doc.code ? doc.code + ' · ' : '' }}{{ doc.title }}
                                @if (doc.rev) {
                                  ({{ 'training.player.revision' | transloco: { rev: doc.rev } }})
                                }
                              </a>
                            </p>
                          }
                          <label class="flex items-start gap-2.5 text-ui text-fg">
                            <input
                              type="checkbox"
                              class="mt-0.5 accent-accent"
                              name="ack"
                              [(ngModel)]="acknowledged"
                              data-testid="assessment-ack"
                            />
                            <span>{{ 'training.player.acknowledge' | transloco }}</span>
                          </label>
                        </app-card>
                      }

                      <app-card>
                        <h2 class="mb-2 flex items-center gap-1 text-body font-semibold text-fg">
                          {{ 'training.player.feedbackTitle' | transloco }}
                          <app-ask-about
                            field="feedback"
                            [prompt]="'training.ask.feedback' | transloco"
                          />
                        </h2>
                        <app-training-rating
                          [label]="'training.player.rating' | transloco"
                          [value]="rating()"
                          (valueChange)="rating.set($event)"
                        />
                        <label
                          for="attempt-comment"
                          class="mt-3 mb-1 block text-ui font-semibold text-fg-muted"
                        >
                          {{ 'training.player.comment' | transloco }}
                        </label>
                        <textarea
                          id="attempt-comment"
                          name="comment"
                          rows="2"
                          maxlength="2000"
                          class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                          [(ngModel)]="comment"
                        ></textarea>
                      </app-card>

                      @if (error(); as key) {
                        <app-alert>{{ key | transloco }}</app-alert>
                      }
                      <div class="flex flex-wrap justify-end gap-2">
                        <app-button
                          type="submit"
                          [loading]="submitting()"
                          [disabled]="!canSubmit()"
                          data-testid="assessment-submit"
                        >
                          {{ 'training.player.submit' | transloco }}
                        </app-button>
                      </div>
                    </form>
                  }
                }
              }
            </div>
          </div>
        }
      } @else if (loadError(); as key) {
        <app-error-state
          titleKey="training.errors.notFoundTitle"
          [bodyKey]="key"
          (retry)="reload()"
        />
      } @else {
        <app-loading-state [rows]="6" />
      }
    </div>
  `,
})
export class CoursePlayer {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly progress = inject(LearningProgressService);
  private readonly language = inject(LanguageService);
  protected readonly router = inject(Router);
  protected readonly access = inject(TrainingAccess);
  protected readonly assignmentBadgeOf = assignmentBadge;

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly data = signal<PlayerOut | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly stage = signal<Stage>({ kind: 'overview' });
  protected readonly answers = signal<Answers>({});
  protected readonly result = signal<AttemptOut | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly submitting = signal(false);
  protected readonly rating = signal<number | null>(null);
  protected acknowledged = false;
  protected comment = '';

  protected readonly lessonIndex = computed(() => {
    const s = this.stage();
    return s.kind === 'lesson' ? s.index : -1;
  });
  protected readonly currentItem = computed(() => this.data()?.items[this.lessonIndex()] ?? null);
  /** The lesson content only (stable while progress updates), so the player keeps its place. */
  private readonly currentLesson = computed(() => this.currentItem()?.lesson ?? null);
  protected readonly reading = computed(() => {
    const lesson = this.currentLesson();
    return lesson ? readingLesson(lesson) : null;
  });
  protected readonly quizItems = computed(() =>
    (this.data()?.items ?? []).filter((i) => i.lesson.quiz.length > 0),
  );
  protected readonly totalQuestions = computed(() => questionCount(this.data()?.items ?? []));
  protected readonly progressPct = computed(() => {
    const items = this.data()?.items ?? [];
    if (this.result()?.passed) {
      return 100;
    }
    if (!items.length) {
      return 0;
    }
    return Math.round((items.filter((i) => lessonState(i) === 'done').length / items.length) * 100);
  });
  protected readonly assessmentLabelKey = computed(() =>
    this.data()?.course.kind === 'read_and_understood'
      ? 'training.player.confirmStep'
      : this.totalQuestions() > 0
        ? 'training.player.assessment'
        : 'training.player.finishStep',
  );

  private sub = new Subscription();

  constructor() {
    providePageContext(() => {
      const d = this.data();
      return {
        module: TRAINING_MODULE,
        entityType: 'course',
        entityId: this.id(),
        view: 'other',
        title: d ? `${d.course.code} ${d.course.title}` : null,
      };
    });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected readonly completionRule = computed(() => {
    const course = this.data()?.course;
    return course ? completionRuleOf(course) : 'quiz';
  });

  /** "Du har fått kurset fordi det gjelder Avdeling: Drift. Frist 1. des. 2026." */
  protected readonly whyAssigned = computed(() => {
    const a = this.data()?.assignment;
    if (!a) {
      return '';
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    let reason: string;
    if (a.reason === 'rule' && a.rule) {
      const kind = t(`training.ruleTarget.${a.rule.target_type}`);
      const value =
        a.rule.target_type === 'role' && a.rule.target_value
          ? t(roleNameKey(a.rule.target_value))
          : a.rule.target_label;
      reason = t('training.player.whyRule', { target: value ? `${kind}: ${value}` : kind });
    } else if (a.reason === 'manual' && a.assigned_by) {
      reason = t('training.player.whyManual', { name: a.assigned_by.name });
    } else {
      reason = t(`training.player.why.${a.reason}`);
    }
    return reason;
  });

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected state(item: PlayerItem) {
    return lessonState(item);
  }

  protected isLesson(index: number): boolean {
    return this.lessonIndex() === index;
  }

  protected lessonTitle(lessonId: string): string {
    return this.data()?.items.find((i) => i.id === lessonId)?.lesson.title ?? '';
  }

  protected canSubmit(): boolean {
    const d = this.data();
    if (!d || this.submitting()) {
      return false;
    }
    if (d.course.kind === 'read_and_understood' && !this.acknowledged) {
      return false;
    }
    return allAnswered(d.items, this.answers());
  }

  protected begin(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.data();
    if (!orgId || !d) {
      return;
    }
    if (d.assignment?.status !== 'assigned') {
      this.openLessonOrAssessment();
      return;
    }
    this.starting.set(true);
    this.error.set(null);
    this.api.start(orgId, d.course.id).subscribe({
      next: (fresh) => {
        this.starting.set(false);
        this.data.set(fresh);
        this.openLessonOrAssessment();
      },
      error: (err: unknown) => {
        this.starting.set(false);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  protected openLesson(index: number): void {
    const item = this.data()?.items[index];
    if (!item) {
      return;
    }
    this.stage.set({ kind: 'lesson', index });
    if (!item.progress?.seen_at) {
      this.progress.record(TRAINING_MODULE, item.lesson_key, 'seen').subscribe({
        next: (p) => p && this.patchProgress(item.id, p),
        error: () => undefined,
      });
    }
  }

  protected openAssessment(): void {
    this.stage.set({ kind: 'assessment' });
  }

  protected lessonFinished(item: PlayerItem): void {
    if (item.lesson.quiz.length || item.progress?.completed_at) {
      return; // quiz lessons are completed by the server-scored assessment
    }
    this.progress.record(TRAINING_MODULE, item.lesson_key, 'completed').subscribe({
      next: (p) => p && this.patchProgress(item.id, p),
      error: () => undefined,
    });
  }

  protected choose(lessonId: string, question: number, option: number): void {
    this.answers.update((a) => setAnswer(a, lessonId, question, option));
  }

  protected submit(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.data();
    if (!orgId || !d || !this.canSubmit()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.api
      .submitAttempt(
        orgId,
        d.course.id,
        attemptBody(this.answers(), {
          acknowledged: this.acknowledged,
          rating: this.rating(),
          comment: this.comment,
        }),
      )
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.result.set(res);
          this.data.update((cur) =>
            cur
              ? {
                  ...cur,
                  assignment: res.assignment ?? cur.assignment,
                  latest_record: res.record ?? cur.latest_record,
                }
              : cur,
          );
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.error.set(trainingErrorKey(err));
        },
      });
  }

  protected retry(): void {
    this.result.set(null);
    this.answers.set(emptyAnswers(this.data()?.items ?? []));
  }

  private openLessonOrAssessment(): void {
    if ((this.data()?.items.length ?? 0) > 0) {
      this.openLesson(0);
    } else {
      this.openAssessment();
    }
  }

  private patchProgress(
    itemId: string,
    p: {
      seen_at: string | null;
      completed_at: string | null;
      quiz_score: number | null;
      quiz_passed: boolean | null;
      attempts: number;
    },
  ): void {
    this.data.update((d) =>
      d
        ? {
            ...d,
            items: d.items.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    progress: {
                      seen_at: p.seen_at,
                      completed_at: p.completed_at,
                      quiz_score: p.quiz_score,
                      quiz_passed: p.quiz_passed,
                      attempts: p.attempts,
                    },
                  }
                : i,
            ),
          }
        : d,
    );
  }

  private load(orgId: string | null, id: string): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.loadError.set(null);
    this.sub.add(
      this.api.player(orgId, id).subscribe({
        next: (d) => {
          this.data.set(d);
          this.answers.set(emptyAnswers(d.items));
          this.result.set(null);
          this.stage.set({ kind: 'overview' });
        },
        error: (err: unknown) => this.loadError.set(trainingErrorKey(err)),
      }),
    );
  }
}

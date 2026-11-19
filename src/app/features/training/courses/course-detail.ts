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
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
} from '../../../shared/kit/record-sections';
import {
  LocalDatePipe,
  LocalPercentPipe,
  formatLocalDate,
} from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  completionRuleOf,
  courseBadge,
  trainingErrorKey,
} from '../data/training-display';
import { courseMissing, courseStatusSentence } from '../data/training-anatomy';
import { Assignment, CourseDetail } from '../data/training.models';
import { AssignDialog } from '../shared/assign-dialog';
import { AssignmentTable } from '../shared/assignment-table';
import { CourseEffectiveness } from './course-effectiveness';
import { CourseRules } from './course-rules';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Snapshot field -> label key for the revisions tab. */
export const COURSE_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'training.fields.title',
  description: 'training.fields.description',
  category: 'training.fields.category',
  kind: 'training.fields.kind',
  status: 'training.fields.status',
  pass_mark: 'training.fields.passMark',
  validity_months: 'training.fields.validity',
  estimated_minutes: 'training.fields.minutes',
  document_id: 'training.fields.document',
  owner_user_id: 'training.fields.owner',
  version: 'training.fields.version',
  lessons: 'training.fields.lessons',
  learning_objectives: 'training.fields.learningObjectives',
  effectiveness_criteria: 'training.fields.effectivenessCriteria',
  clause_refs: 'training.fields.clauseRefs',
  competences: 'training.fields.competences',
};

type StateAction = 'publish' | 'archive';

/** The publish dialog text: a course without a knowledge test says how it is completed. */
export function publishMessageKey(course: Pick<CourseDetail, 'kind' | 'quiz_count'>): string {
  return course.kind === 'course' && course.quiz_count === 0
    ? 'training.detail.publishMessageNoQuiz'
    : 'training.detail.publishMessage';
}

/**
 * `/training/courses/:id`, on the detail-page anatomy (docs/ux-guide.md §2.7):
 * "Hovedinformasjon" says whether the course can be taken, what it is about, how it
 * is completed, what participants learn (or which document they read) and how many
 * have done it; the Details tab holds the other facts, the lessons, who must take it
 * (rules), open assignments and effectiveness; one "Oppfølging" card lists what is
 * missing, the requirements, the connections and the owner / version / dates.
 * Assistant actions sit in "Spør KI".
 */
@Component({
  selector: 'app-course-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalPercentPipe,
    MarkdownPipe,
    Alert,
    Badge,
    Button,
    ConfirmDialog,
    EntityChip,
    EntityTasks,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    PromptDialog,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    StatusBadge,
    WhyItMatters,
    AssignDialog,
    AssignmentTable,
    CourseEffectiveness,
    CourseRules,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (course(); as c) {
      @let badge = statusBadge(c.status);
      @let sentence = statusSentence();
      <app-record-detail-layout
        [anatomy]="true"
        entityType="course"
        [entityId]="c.id"
        [title]="c.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.training', link: '/training' },
          { labelKey: 'training.courses.title', link: '/training/courses' },
          { label: c.title },
        ]"
        [tabs]="tabs"
        [requirementsPanel]="true"
        [canEdit]="c.can_edit"
        [includeAudit]="access.canSeeAudit()"
        [fieldLabels]="fieldLabels"
        [missing]="missing()"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono">{{ c.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'training.kind.' + c.kind | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            [meaning]="badge.meaning"
            [value]="badge.value"
            [labelKey]="badge.labelKey"
          />
        </ng-container>

        @if (c.status === 'published' && c.kind !== 'external') {
          <app-button
            primary
            (click)="router.navigate(['/training/courses', c.id, 'learn'])"
            data-testid="course-learn"
          >
            {{ 'training.detail.learn' | transloco }}
          </app-button>
        } @else if (c.can_edit && c.status === 'draft') {
          <app-button primary (click)="stateAction.set('publish')" data-testid="course-publish">
            {{ 'training.detail.publish' | transloco }}
          </app-button>
        }
        @if (c.status === 'published' && access.canAssign()) {
          <app-button
            secondary
            variant="secondary"
            (click)="assignOpen.set(true)"
            data-testid="course-assign"
          >
            {{ 'training.detail.assign' | transloco }}
          </app-button>
        } @else if (c.can_edit && c.status === 'draft') {
          <app-button
            secondary
            variant="secondary"
            (click)="router.navigate(editLink())"
            data-testid="course-edit"
          >
            {{ 'training.common.edit' | transloco }}
          </app-button>
        }
        @if (c.can_edit && c.status === 'published') {
          <ng-container ngProjectAs="[overflow]">
            <button
              appMenuItem
              overflow
              type="button"
              (click)="router.navigate(editLink())"
              data-testid="course-edit"
            >
              {{ 'training.common.edit' | transloco }}
            </button>
            <button appMenuItem overflow type="button" (click)="stateAction.set('archive')">
              {{ 'training.detail.archive' | transloco }}
            </button>
          </ng-container>
        }
        @if (canDelete()) {
          <button
            appMenuItem
            overflow
            type="button"
            [danger]="true"
            (click)="deleteOpen.set(true)"
            data-testid="course-delete"
          >
            {{ 'training.common.delete' | transloco }}
          </button>
        }

        @if (showEffectiveness()) {
          <button
            appMenuItem
            ask
            type="button"
            data-testid="course-ask-effect"
            (click)="summariseEffect()"
          >
            <app-icon name="spark" [size]="15" />
            {{ 'training.ai.summarise' | transloco }}
          </button>
        }
        @if (completionRule() === 'quiz') {
          <button appMenuItem ask type="button" (click)="askAi('training.ask.passMark')">
            <app-icon name="spark" [size]="15" />
            {{ 'training.ask.passMark' | transloco }}
          </button>
        }
        <button appMenuItem ask type="button" (click)="askAi('training.ask.validity')">
          <app-icon name="spark" [size]="15" />
          {{ 'training.ask.validity' | transloco }}
        </button>

        <app-module-nav nav [items]="access.navItems()" labelKey="training.nav.label" />
        <app-help-strip help scope="training" page="detail" lesson="competence-and-awareness" />

        <app-record-lead record-lead [fillLink]="fillLink()">
          <app-record-status-line status [tone]="sentence.tone">
            {{ sentence.key | transloco }}
          </app-record-status-line>
          <app-field-item size="lead" labelKey="training.detail.lead.about">
            @if (c.description) {
              <div class="cf-prose" [innerHTML]="c.description | appMarkdown"></div>
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="training.detail.lead.howToComplete">
            <span data-testid="course-completion">{{
              'training.completion.' + completionRule()
                | transloco: { pass: (c.pass_mark * 100 | localPercent) }
            }}</span>
          </app-field-item>
          @if (c.kind === 'read_and_understood') {
            <app-field-item size="lead" labelKey="training.detail.lead.document">
              @if (c.document; as doc) {
                <app-entity-chip
                  [ref]="{
                    entity_type: 'document',
                    entity_id: doc.id,
                    code: doc.code,
                    title: doc.title,
                    url: doc.url,
                  }"
                />
              }
            </app-field-item>
          } @else {
            <app-field-item size="lead" labelKey="training.detail.lead.objectives">
              @if (c.learning_objectives) {
                <div class="cf-prose" [innerHTML]="c.learning_objectives | appMarkdown"></div>
              }
            </app-field-item>
          }
          @if (access.canOversee() && c.status !== 'draft') {
            <app-field-item size="lead" labelKey="training.detail.lead.participants">
              <a
                [routerLink]="['/training/assignments']"
                [queryParams]="{ course: c.id }"
                class="flex flex-wrap gap-x-4 gap-y-1 hover:text-accent"
                data-testid="course-counts"
              >
                <span
                  ><span class="font-bold">{{ c.counts.assigned }}</span>
                  {{ 'training.detail.countOpen' | transloco }}</span
                >
                @if (c.counts.overdue) {
                  <span class="text-warn-ink"
                    ><span class="font-bold">{{ c.counts.overdue }}</span>
                    {{ 'training.detail.countLate' | transloco }}</span
                  >
                }
                <span
                  ><span class="font-bold">{{ c.counts.completed }}</span>
                  {{ 'training.detail.countDone' | transloco }}</span
                >
              </a>
            </app-field-item>
          }
        </app-record-lead>

        <div class="flex flex-col gap-6">
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }

          <app-record-details [columns]="3" [fillLink]="fillLink()">
            <app-field-item labelKey="training.detail.validFor">
              @if (c.validity_months) {
                {{
                  (c.validity_months === 1
                    ? 'training.detail.validityOne'
                    : 'training.detail.validity'
                  ) | transloco: { count: c.validity_months }
                }}
              } @else {
                {{ 'training.detail.noExpiry' | transloco }}
              }
            </app-field-item>
            @if (c.kind !== 'external') {
              <app-field-item
                labelKey="training.detail.timeNeeded"
                [value]="
                  c.estimated_minutes
                    ? ('training.detail.minutes' | transloco: { count: c.estimated_minutes })
                    : null
                "
              />
            }
            <app-field-item
              labelKey="training.fields.category"
              [value]="'training.category.' + c.category | transloco"
            />
            @if (c.kind !== 'read_and_understood') {
              <app-field-item labelKey="training.detail.relatedDocument">
                @if (c.document; as doc) {
                  <app-entity-chip
                    [ref]="{
                      entity_type: 'document',
                      entity_id: doc.id,
                      code: doc.code,
                      title: doc.title,
                      url: doc.url,
                    }"
                  />
                }
              </app-field-item>
            }
            <app-field-item labelKey="training.fields.competences" [wide]="true">
              @if (c.competences?.length) {
                <ul class="flex flex-wrap gap-1.5" data-testid="course-competences">
                  @for (comp of c.competences; track comp.id) {
                    <li>
                      <a
                        [routerLink]="comp.url"
                        class="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-meta font-semibold text-fg hover:border-accent hover:text-accent"
                      >
                        {{ comp.name }}
                        <span class="font-normal text-fg-muted">
                          · {{ 'training.competenceLevel.' + comp.level | transloco }}
                        </span>
                      </a>
                    </li>
                  }
                </ul>
              }
            </app-field-item>
          </app-record-details>

          @if (c.kind !== 'external') {
            <section aria-labelledby="course-lessons-title">
              <h2 id="course-lessons-title" class="mb-2 font-display text-card font-bold text-fg">
                {{
                  (c.lessons.length === 1
                    ? 'training.detail.lessonsOne'
                    : 'training.detail.lessons'
                  ) | transloco: { count: c.lessons.length }
                }}
              </h2>
              @if (c.lessons.length === 0) {
                <p class="text-ui text-fg-muted">{{ 'training.detail.noLessons' | transloco }}</p>
              } @else {
                <ol class="flex flex-col gap-1.5" data-testid="course-lessons">
                  @for (lesson of c.lessons; track lesson.id; let i = $index) {
                    <li
                      class="flex flex-wrap items-center gap-2 rounded-tile border border-border bg-surface px-3 py-2 text-ui"
                    >
                      <span class="w-6 text-fg-subtle">{{ i + 1 }}.</span>
                      <span class="min-w-0 flex-1 font-medium text-fg">{{ lesson.title }}</span>
                      @if (lesson.video_url) {
                        <app-badge tone="info">{{ 'training.detail.video' | transloco }}</app-badge>
                      }
                      @if (lesson.quiz.length) {
                        <app-badge tone="accent">
                          {{
                            (lesson.quiz.length === 1
                              ? 'training.detail.questionsOne'
                              : 'training.detail.questions'
                            ) | transloco: { count: lesson.quiz.length }
                          }}
                        </app-badge>
                      }
                      @if (lesson.minutes) {
                        <span class="text-fg-muted">
                          {{ 'training.detail.minutes' | transloco: { count: lesson.minutes } }}
                        </span>
                      }
                    </li>
                  }
                </ol>
              }
            </section>
          }

          @if (access.canOversee() || access.canWrite()) {
            <div id="course-rules" class="scroll-mt-6">
              <app-training-course-rules
                [courseId]="c.id"
                [canManage]="access.canManage()"
                [published]="c.status === 'published'"
                (changed)="reload()"
              />
            </div>
          }

          @if (access.canOversee() && c.status !== 'draft') {
            <section aria-labelledby="course-open-title">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 id="course-open-title" class="font-display text-card font-bold text-fg">
                  {{ 'training.detail.assignments' | transloco }}
                </h2>
                <a
                  [routerLink]="['/training/assignments']"
                  [queryParams]="{ course: c.id }"
                  class="text-meta font-semibold text-accent hover:underline"
                >
                  {{ 'training.detail.allAssignments' | transloco }}
                </a>
              </div>
              @if (assignments().length) {
                <app-training-assignment-table [assignments]="assignments()" [showCourse]="false" />
              } @else {
                <p class="text-ui text-fg-muted">
                  {{ 'training.detail.noAssignments' | transloco }}
                </p>
              }
            </section>
          }

          @if (showEffectiveness()) {
            <app-training-course-effectiveness
              [course]="c"
              [canManage]="access.canManage()"
              [showRecords]="access.canOversee()"
              [assistInMenu]="true"
            />
          }
        </div>

        <app-entity-tasks
          tasks
          entityType="course"
          [entityId]="c.id"
          [canCreate]="access.canWriteTasks() && (c.can_edit || access.canOversee())"
          [entityLabel]="c.code + ' ' + c.title"
        />

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="training.fields.owner"
            [value]="c.owner?.name"
          />
          <app-field-item layout="inline" labelKey="training.fields.version" [value]="c.version" />
          <app-field-item
            layout="inline"
            labelKey="training.fields.published"
            [value]="publishedText()"
          />
          <app-field-item
            layout="inline"
            labelKey="training.detail.updated"
            [value]="c.updated_at | localDate: 'mediumDate'"
          />
        </app-record-meta>

        <div aside-learn>
          <app-why-it-matters scope="training" page="detail" />
        </div>
      </app-record-detail-layout>

      <app-training-assign-dialog
        [open]="assignOpen()"
        [course]="c"
        (closed)="assignOpen.set(false)"
        (assigned)="reload()"
      />

      <app-prompt-dialog
        [open]="stateAction() !== null"
        [title]="
          (stateAction() === 'archive'
            ? 'training.detail.archiveTitle'
            : 'training.detail.publishTitle'
          ) | transloco
        "
        [message]="
          (stateAction() === 'archive' ? 'training.detail.archiveMessage' : publishKey())
            | transloco
        "
        [label]="'training.form.changeReason' | transloco"
        [placeholder]="'training.form.changeReasonPlaceholder' | transloco"
        [confirmVariant]="stateAction() === 'archive' ? 'danger' : 'primary'"
        [confirmLabel]="
          (stateAction() === 'archive' ? 'training.detail.archive' : 'training.detail.publish')
            | transloco
        "
        [cancelLabel]="'training.common.cancel' | transloco"
        [busy]="busy()"
        [maxLength]="1000"
        (confirmed)="changeState($event)"
        (cancelled)="stateAction.set(null)"
      />

      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'training.detail.deleteTitle' | transloco"
        [message]="'training.detail.deleteMessage' | transloco: { title: c.title }"
        [confirmLabel]="'training.common.delete' | transloco"
        [cancelLabel]="'training.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else if (notFound()) {
      <div class="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
        <app-error-state
          titleKey="training.errors.notFoundTitle"
          bodyKey="training.errors.notFound"
          (retry)="reload()"
        />
      </div>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    }
  `,
})
export class CourseDetailPage {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  protected readonly router = inject(Router);
  protected readonly access = inject(TrainingAccess);

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = COURSE_FIELD_LABELS;
  protected readonly statusBadge = courseBadge;
  protected readonly course = signal<CourseDetail | null>(null);
  protected readonly assignments = signal<readonly Assignment[]>([]);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly assignOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly stateAction = signal<StateAction | null>(null);

  protected readonly completionRule = computed(() => {
    const c = this.course();
    return c ? completionRuleOf(c) : 'quiz';
  });
  protected readonly publishKey = computed(() => {
    const c = this.course();
    return c ? publishMessageKey(c) : 'training.detail.publishMessage';
  });
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/training/courses',
    this.id(),
    'edit',
  ]);
  /** "Fyll ut" links only for people who may edit (archived courses are read-only). */
  protected readonly fillLink = computed(() => {
    const c = this.course();
    return c?.can_edit && c.status !== 'archived' ? this.editLink() : null;
  });
  protected readonly statusSentence = computed(() => {
    const c = this.course();
    return c ? courseStatusSentence(c) : { key: '', tone: 'neutral' as const };
  });
  /** "Virker opplæringen?" (and its "Oppsummer effekt" in "Spør KI"). */
  protected readonly showEffectiveness = computed(() => {
    const c = this.course();
    return !!c && c.status !== 'draft' && (this.access.canReport() || this.access.canManage());
  });
  /** "19. okt. 2026 av Ola Hansen". */
  protected readonly publishedText = computed(() => {
    const c = this.course();
    if (!c?.published_at) {
      return null;
    }
    const date = formatLocalDate(c.published_at, 'mediumDate', this.language.locale());
    return c.published_by
      ? this.language.translate('training.detail.publishedBy', { date, name: c.published_by.name })
      : date;
  });
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const c = this.course();
    if (!c) {
      return [];
    }
    return courseMissing(c, {
      editLink: this.editLink(),
      publish: c.can_edit && c.status === 'draft' ? () => this.stateAction.set('publish') : null,
      rules: this.access.canManage() ? () => this.scrollToRules() : null,
      oversee: this.access.canOversee(),
    });
  });
  private readonly effectiveness = viewChild(CourseEffectiveness);

  protected readonly canDelete = computed(() => {
    const c = this.course();
    return !!c && c.can_edit && (c.status === 'draft' || this.access.canManage());
  });

  private sub = new Subscription();

  constructor() {
    providePageContext(() => {
      const c = this.course();
      return {
        module: TRAINING_MODULE,
        entityType: 'course',
        entityId: c?.id ?? this.id(),
        view: 'detail',
        title: c ? `${c.code} ${c.title}` : null,
        requirements: c?.clause_refs?.length ? [...c.clause_refs] : undefined,
      };
    });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      // Text fields (category labels) follow the language; the record does not.
      this.language.active();
      untracked(() => this.load(orgId, id));
    });
  }

  protected askAi(promptKey: string): void {
    const c = this.course();
    this.ask.askAbout(this.language.translate(promptKey), undefined, {
      requirements: c?.clause_refs ?? [],
    });
  }

  protected summariseEffect(): void {
    this.effectiveness()?.summarise();
  }

  private scrollToRules(): void {
    document
      .getElementById('course-rules')
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected changeState(reason: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const action = this.stateAction();
    const c = this.course();
    if (!orgId || !action || !c) {
      return;
    }
    const call: Observable<CourseDetail> =
      action === 'publish'
        ? this.api.publishCourse(orgId, c.id, reason)
        : this.api.archiveCourse(orgId, c.id, reason);
    this.busy.set(true);
    this.error.set(null);
    call.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.stateAction.set(null);
        this.course.set(updated);
        this.notifications.success(
          action === 'publish' ? 'training.detail.publishedToast' : 'training.detail.archivedToast',
        );
        this.loadAssignments(orgId, updated.id);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.stateAction.set(null);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.course();
    if (!orgId || !c) {
      return;
    }
    this.busy.set(true);
    this.api.deleteCourse(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('training.detail.deletedToast');
        void this.router.navigate(['/training/courses']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.notFound.set(false);
    this.sub.add(
      this.api.getCourse(orgId, id).subscribe({
        next: (c) => {
          this.course.set(c);
          this.loadAssignments(orgId, c.id);
        },
        error: () => {
          this.course.set(null);
          this.notFound.set(true);
        },
      }),
    );
  }

  private loadAssignments(orgId: string, courseId: string): void {
    if (!this.access.canOversee()) {
      return;
    }
    this.sub.add(
      this.api
        .listAssignments(orgId, {
          course_id: courseId,
          status: ['assigned', 'in_progress'],
          limit: 20,
        })
        .subscribe({
          next: (res) => this.assignments.set(res.items),
          error: () => this.assignments.set([]),
        }),
    );
  }
}

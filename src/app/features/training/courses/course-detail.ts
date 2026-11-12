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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  courseStatusTone,
  trainingErrorKey,
} from '../data/training-display';
import { Assignment, CourseDetail } from '../data/training.models';
import { AssignDialog } from '../shared/assign-dialog';
import { AssignmentTable } from '../shared/assignment-table';
import { TrainingNav } from '../training-nav';
import { CourseRules } from './course-rules';

const TABS: readonly RecordTab[] = [
  'details',
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
};

type StateAction = 'publish' | 'archive';

/**
 * `/training/courses/:id`: a course with its lessons, rules, assignments and the
 * shared record kit (related items, activity, comments, attachments, revisions).
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
    Card,
    ConfirmDialog,
    Icon,
    PromptDialog,
    RecordDetailLayout,
    WatchButton,
    AiAssistButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    SupportsRequirements,
    AssignDialog,
    AssignmentTable,
    CourseRules,
    TrainingNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-nav />
    @if (course(); as c) {
      <app-record-detail-layout
        entityType="course"
        [entityId]="c.id"
        [tabs]="tabs"
        [canEdit]="c.can_edit"
        [includeAudit]="access.canSeeAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/training/courses"
        backLabelKey="training.courses.back"
      >
        <div header>
          <div class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
            <span class="font-mono">{{ c.code }}</span>
            <app-badge [tone]="statusTone(c.status)">
              {{ 'training.status.' + c.status | transloco }}
            </app-badge>
            <app-badge tone="neutral">{{ 'training.kind.' + c.kind | transloco }}</app-badge>
            <span>{{ 'training.detail.version' | transloco: { version: c.version } }}</span>
            @if (c.source === 'ai') {
              <app-badge tone="accent">{{ 'training.courses.aiDraft' | transloco }}</app-badge>
            }
          </div>
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            data-testid="course-title"
          >
            {{ c.title }}
          </h1>
        </div>

        <ng-container actions>
          <app-watch-button entityType="course" [entityId]="c.id" />
          @if (c.status === 'published' && c.kind !== 'external') {
            <a [routerLink]="['/training/courses', c.id, 'learn']">
              <app-button data-testid="course-learn">
                {{ 'training.detail.learn' | transloco }}
              </app-button>
            </a>
          }
          @if (c.status === 'published' && access.canAssign()) {
            <app-button
              variant="secondary"
              (click)="assignOpen.set(true)"
              data-testid="course-assign"
            >
              {{ 'training.detail.assign' | transloco }}
            </app-button>
          }
          @if (c.can_edit && c.status !== 'archived') {
            <a [routerLink]="['/training/courses', c.id, 'edit']">
              <app-button variant="secondary">{{ 'training.common.edit' | transloco }}</app-button>
            </a>
          }
          @if (c.can_edit && c.status === 'draft') {
            <app-button (click)="stateAction.set('publish')" data-testid="course-publish">
              {{ 'training.detail.publish' | transloco }}
            </app-button>
          }
          @if (c.can_edit && c.status === 'published') {
            <app-button variant="ghost" (click)="stateAction.set('archive')">
              {{ 'training.detail.archive' | transloco }}
            </app-button>
          }
          @if (canDelete()) {
            <app-button variant="ghost" (click)="deleteOpen.set(true)">
              <app-icon name="trash" [size]="15" />
              <span class="sr-only sm:not-sr-only">{{ 'training.common.delete' | transloco }}</span>
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-5">
          <app-guide-intro scope="training" page="detail" />
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }

          @if (c.description) {
            <div class="cf-prose" [innerHTML]="c.description | appMarkdown"></div>
          }

          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.category' | transloco }}</dt>
              <dd class="font-medium text-fg">
                {{ 'training.category.' + c.category | transloco }}
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.owner' | transloco }}</dt>
              <dd class="font-medium text-fg">
                {{ c.owner?.name ?? ('training.common.none' | transloco) }}
              </dd>
            </div>
            <div>
              <dt class="flex items-center gap-1 text-fg-muted">
                {{ 'training.fields.passMark' | transloco }}
                <app-ask-about field="pass_mark" [prompt]="'training.ask.passMark' | transloco" />
              </dt>
              <dd class="font-medium text-fg">{{ c.pass_mark * 100 | localPercent }}</dd>
            </div>
            <div>
              <dt class="flex items-center gap-1 text-fg-muted">
                {{ 'training.fields.validity' | transloco }}
                <app-ask-about
                  field="validity_months"
                  [prompt]="'training.ask.validity' | transloco"
                />
              </dt>
              <dd class="font-medium text-fg">
                @if (c.validity_months) {
                  {{ 'training.detail.months' | transloco: { count: c.validity_months } }}
                } @else {
                  {{ 'training.detail.noExpiry' | transloco }}
                }
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.minutes' | transloco }}</dt>
              <dd class="font-medium text-fg">
                @if (c.estimated_minutes) {
                  {{ 'training.detail.minutes' | transloco: { count: c.estimated_minutes } }}
                } @else {
                  {{ 'training.common.none' | transloco }}
                }
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.published' | transloco }}</dt>
              <dd class="font-medium text-fg">
                {{
                  c.published_at
                    ? (c.published_at | localDate)
                    : ('training.common.none' | transloco)
                }}
              </dd>
            </div>
            @if (c.document; as doc) {
              <div class="col-span-2 sm:col-span-3">
                <dt class="text-fg-muted">{{ 'training.fields.document' | transloco }}</dt>
                <dd>
                  <a [routerLink]="doc.url" class="font-medium text-accent hover:underline">
                    {{ doc.code ? doc.code + ' · ' : '' }}{{ doc.title }}
                  </a>
                </dd>
              </div>
            }
          </dl>

          <section>
            <h2 class="mb-2 text-[15px] font-semibold text-fg">
              {{ 'training.detail.lessons' | transloco: { count: c.lessons.length } }}
            </h2>
            @if (c.lessons.length === 0) {
              <p class="text-[13px] text-fg-muted">{{ 'training.detail.noLessons' | transloco }}</p>
            } @else {
              <ol class="flex flex-col gap-1.5" data-testid="course-lessons">
                @for (lesson of c.lessons; track lesson.id; let i = $index) {
                  <li
                    class="flex flex-wrap items-center gap-2 rounded-tile border border-border bg-surface px-3 py-2 text-[13px]"
                  >
                    <span class="w-6 text-fg-subtle">{{ i + 1 }}.</span>
                    <span class="min-w-0 flex-1 font-medium text-fg">{{ lesson.title }}</span>
                    @if (lesson.video_url) {
                      <app-badge tone="info">{{ 'training.detail.video' | transloco }}</app-badge>
                    }
                    @if (lesson.quiz.length) {
                      <app-badge tone="accent">
                        {{ 'training.detail.questions' | transloco: { count: lesson.quiz.length } }}
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

          @if (access.canOversee() || access.canWrite()) {
            <app-training-course-rules
              [courseId]="c.id"
              [canManage]="access.canManage()"
              (changed)="reload()"
            />
          }

          @if (access.canOversee()) {
            <section>
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-[15px] font-semibold text-fg">
                  {{ 'training.detail.assignments' | transloco }}
                </h2>
                <a
                  [routerLink]="['/training/assignments']"
                  [queryParams]="{ course: c.id }"
                  class="text-[12.5px] font-semibold text-accent hover:underline"
                >
                  {{ 'training.detail.allAssignments' | transloco }}
                </a>
              </div>
              @if (assignments().length) {
                <app-training-assignment-table [assignments]="assignments()" [showCourse]="false" />
              } @else {
                <p class="text-[13px] text-fg-muted">
                  {{ 'training.detail.noAssignments' | transloco }}
                </p>
              }
            </section>
          }

          @if (access.canReport() && c.status !== 'draft') {
            <app-card>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-[15px] font-semibold text-fg">
                  {{ 'training.detail.effectivenessTitle' | transloco }}
                </h2>
                <app-ai-assist-button
                  assist="training.summarise_effectiveness"
                  labelKey="training.ai.summarise"
                  entityType="course"
                  [entityId]="c.id"
                  [input]="{ course_id: c.id }"
                  (text)="summary.set($event)"
                />
              </div>
              @if (summary()) {
                <div
                  class="cf-prose mt-3"
                  aria-live="polite"
                  [innerHTML]="summary() | appMarkdown"
                ></div>
              } @else {
                <p class="mt-2 text-[13px] text-fg-muted">
                  {{ 'training.detail.effectivenessHint' | transloco }}
                </p>
              }
            </app-card>
          }
        </div>

        <ng-container aside>
          <app-card>
            <h2 class="mb-2 text-[13px] font-semibold text-fg-muted">
              {{ 'training.detail.progress' | transloco }}
            </h2>
            <dl class="grid grid-cols-3 gap-2 text-center" data-testid="course-counts">
              <div>
                <dd class="text-[20px] font-bold text-fg">{{ c.counts.assigned }}</dd>
                <dt class="text-[11.5px] text-fg-muted">
                  {{ 'training.detail.countAssigned' | transloco }}
                </dt>
              </div>
              <div>
                <dd
                  class="text-[20px] font-bold"
                  [class.text-fail]="c.counts.overdue"
                  [class.text-fg]="!c.counts.overdue"
                >
                  {{ c.counts.overdue }}
                </dd>
                <dt class="text-[11.5px] text-fg-muted">
                  {{ 'training.detail.countOverdue' | transloco }}
                </dt>
              </div>
              <div>
                <dd class="text-[20px] font-bold text-pass">{{ c.counts.completed }}</dd>
                <dt class="text-[11.5px] text-fg-muted">
                  {{ 'training.detail.countCompleted' | transloco }}
                </dt>
              </div>
            </dl>
          </app-card>
          <app-why-it-matters scope="training" page="detail" />
          <app-supports-requirements entityType="course" [entityId]="c.id" />
        </ng-container>
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
          (stateAction() === 'archive'
            ? 'training.detail.archiveMessage'
            : 'training.detail.publishMessage'
          ) | transloco
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
        <app-alert>{{ 'training.errors.notFound' | transloco }}</app-alert>
      </div>
    } @else {
      <p
        class="mx-auto max-w-[1180px] px-4 py-10 text-[13.5px] text-fg-muted sm:px-8"
        role="status"
      >
        {{ 'training.common.loading' | transloco }}
      </p>
    }
  `,
})
export class CourseDetailPage {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly access = inject(TrainingAccess);

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = COURSE_FIELD_LABELS;
  protected readonly course = signal<CourseDetail | null>(null);
  protected readonly assignments = signal<readonly Assignment[]>([]);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly summary = signal('');
  protected readonly assignOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly stateAction = signal<StateAction | null>(null);

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
      };
    });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected statusTone(status: string) {
    return courseStatusTone(status);
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

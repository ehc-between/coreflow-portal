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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachMe } from '../../shared/guidance/teach-me';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { planRows } from './data/gantt';
import {
  PERM_WRITE,
  ProjectDetail,
  ProjectPlan,
  ProjectSummary,
  isClosedStatus,
} from './data/project.models';
import {
  PROJECT_FIELD_LABELS,
  healthTone,
  priorityTone,
  projectStatusKey,
  projectStatusTone,
} from './data/project-display';
import { projectErrorKey } from './data/project-errors';
import { ProjectsApi } from './data/projects-api';
import { GanttChart } from './gantt-chart';
import { ProjectLessonLink } from './lesson-link';
import { ProjectAiPanel } from './project-ai-panel';
import { ProjectBoard } from './project-board';
import { ProjectCloseout } from './project-closeout';
import { ProjectLessons } from './project-lessons';
import { ProjectMilestones } from './project-milestones';
import { ProjectReviews } from './project-reviews';
import { ProjectTeam } from './project-team';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const PLAN_VIEWS = ['gantt', 'board'] as const;
export type PlanView = (typeof PLAN_VIEWS)[number];

/** Who may reopen a closed project: `projects:manage`, or the owner with `projects:write`. */
export function canReopen(
  project: Pick<ProjectDetail, 'status' | 'can_manage' | 'owner'>,
  userId: string | null | undefined,
  permissions: readonly string[],
): boolean {
  if (!isClosedStatus(project.status)) {
    return false;
  }
  return (
    project.can_manage ||
    (!!userId && project.owner?.id === userId && permissions.includes(PERM_WRITE))
  );
}

/**
 * A project (`/projects/:id`): purpose and plan, progress, the plan as a Gantt
 * chart or a task board, phases and milestones, design reviews, lessons learned,
 * the team, close-out and reopening, and AI help. Tasks, related records (risks,
 * change requests, documents), activity, comments, attachments and revisions come
 * from the shared record kit. `?milestone=` and `?review=` open that record.
 */
@Component({
  selector: 'app-project-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    TeachMe,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    ProgressBar,
    PromptDialog,
    GanttChart,
    ProjectLessonLink,
    ProjectAiPanel,
    ProjectBoard,
    ProjectCloseout,
    ProjectLessons,
    ProjectMilestones,
    ProjectReviews,
    ProjectTeam,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'projects.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a routerLink="/projects" class="mt-4 inline-block text-[13px] font-semibold text-accent">
            {{ 'projects.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (project(); as p) {
          <app-record-detail-layout
            entityType="project"
            [entityId]="p.id"
            [tabs]="tabs"
            [canEdit]="p.can_contribute && !closed()"
            [fieldLabels]="fieldLabels"
            backLink="/projects"
            backLabelKey="projects.common.backToList"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ p.code }}</span>
                <span>{{ 'projects.kinds.' + p.kind | transloco }}</span>
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="project-heading"
              >
                {{ p.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(p.status)" data-testid="project-status">{{
                  statusKey(p.status) | transloco
                }}</app-badge>
                <app-badge [tone]="priorityTone(p.priority)">{{
                  'projects.priorities.' + p.priority | transloco
                }}</app-badge>
                @if (p.health) {
                  <app-badge [tone]="healthTone(p.health)">{{
                    'projects.healths.' + p.health | transloco
                  }}</app-badge>
                }
                @if (p.security_relevant) {
                  <app-badge tone="info">
                    <app-icon name="lock" [size]="12" />
                    {{ 'projects.fields.securityRelevant' | transloco }}
                  </app-badge>
                }
                @if (p.is_overdue) {
                  <app-badge tone="fail">{{ 'projects.common.overdue' | transloco }}</app-badge>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button entityType="project" [entityId]="p.id" />
              <app-ask-about [prompt]="'projects.ask.summarise' | transloco" />
              @if (p.can_edit && !closed()) {
                <a
                  [routerLink]="['/projects', p.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="project-edit"
                >
                  {{ 'projects.common.edit' | transloco }}
                </a>
                <app-button
                  variant="secondary"
                  size="sm"
                  (click)="closing.set(true)"
                  data-testid="project-close"
                >
                  <app-icon name="checkcircle" [size]="14" />
                  {{ 'projects.closeout.open' | transloco }}
                </app-button>
              }
              @if (reopenAllowed()) {
                <app-button
                  variant="secondary"
                  size="sm"
                  (click)="reopening.set(true)"
                  data-testid="project-reopen"
                >
                  {{ 'projects.reopen.action' | transloco }}
                </app-button>
              }
              @if (p.can_delete) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'projects.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="projects" page="detail" />

              @if (closed()) {
                <app-alert tone="info" data-testid="closed-notice">
                  {{
                    'projects.detail.closedNotice'
                      | transloco
                        : {
                            status: (statusKey(p.status) | transloco),
                            date: (p.closed_at | localDay),
                            name: p.closed_by?.name ?? '',
                          }
                  }}
                </app-alert>
                @if (p.closeout_summary) {
                  <app-card>
                    <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                      {{ 'projects.fields.closeoutSummary' | transloco }}
                    </h2>
                    <p class="text-[13.5px] whitespace-pre-line text-fg">
                      {{ p.closeout_summary }}
                    </p>
                  </app-card>
                }
              }

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'projects.detail.purpose' | transloco }}
                </h2>
                <dl class="flex flex-col gap-3 text-[13.5px]">
                  <div>
                    <dt class="flex items-center gap-1 text-[12.5px] text-fg-subtle">
                      {{ 'projects.fields.objective' | transloco }}
                      <app-ask-about
                        [prompt]="'projects.ask.objectiveReview' | transloco"
                        field="objective"
                      />
                    </dt>
                    <dd class="whitespace-pre-line text-fg">
                      {{ p.objective || ('projects.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12.5px] text-fg-subtle">
                      {{ 'projects.fields.scope' | transloco }}
                    </dt>
                    <dd class="whitespace-pre-line text-fg">
                      {{ p.scope || ('projects.common.none' | transloco) }}
                    </dd>
                  </div>
                  @if (p.description) {
                    <div>
                      <dt class="text-[12.5px] text-fg-subtle">
                        {{ 'projects.fields.description' | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg">{{ p.description }}</dd>
                    </div>
                  }
                  @if (p.security_relevant) {
                    <div>
                      <dt class="text-[12.5px] text-fg-subtle">
                        {{ 'projects.fields.securityRequirements' | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg" data-testid="security-requirements">
                        {{
                          p.security_requirements || ('projects.detail.noSecurityReqs' | transloco)
                        }}
                      </dd>
                    </div>
                  }
                </dl>
                <dl
                  class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4"
                >
                  <div>
                    <dt class="text-fg-subtle">{{ 'projects.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ p.owner?.name ?? ('projects.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'projects.fields.startDate' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        p.start_date
                          ? (p.start_date | localDay)
                          : ('projects.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'projects.fields.dueDate' | transloco }}</dt>
                    <dd class="text-fg" [class.text-fail]="p.is_overdue">
                      {{
                        p.due_date ? (p.due_date | localDay) : ('projects.common.none' | transloco)
                      }}
                      @if (daysToDue(); as text) {
                        <span class="block text-[12px] text-fg-subtle">{{ text }}</span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'projects.fields.team' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ 'projects.list.members' | transloco: { count: p.member_count } }}
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'projects.progress.title' | transloco }}
                  </h2>
                  <span class="text-[15px] font-bold text-fg" data-testid="progress-percent">
                    {{ 'projects.progress.percent' | transloco: { percent: p.progress.percent } }}
                  </span>
                </div>
                <app-progress-bar
                  [value]="p.progress.percent"
                  [label]="'projects.progress.title' | transloco"
                />
                <dl class="mt-4 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
                  <div>
                    <dt class="text-fg-subtle">{{ 'projects.progress.milestones' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        'projects.progress.doneOf'
                          | transloco
                            : {
                                done: p.progress.milestones_done,
                                total: p.progress.milestones_total,
                              }
                      }}
                      @if (p.progress.milestones_overdue) {
                        <span class="text-fail">
                          ·
                          {{
                            'projects.progress.overdueCount'
                              | transloco: { count: p.progress.milestones_overdue }
                          }}
                        </span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'projects.progress.tasks' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        'projects.progress.doneOf'
                          | transloco
                            : { done: p.progress.tasks_done, total: p.progress.tasks_total }
                      }}
                      @if (p.progress.tasks_overdue) {
                        <span class="text-fail">
                          ·
                          {{
                            'projects.progress.overdueCount'
                              | transloco: { count: p.progress.tasks_overdue }
                          }}
                        </span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'projects.progress.reviews' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        'projects.progress.pendingOf'
                          | transloco
                            : {
                                pending: p.progress.design_reviews_pending,
                                total: p.progress.design_reviews_total,
                              }
                      }}
                    </dd>
                  </div>
                </dl>
                @if (summary(); as s) {
                  @if (s.next_milestone; as next) {
                    <p class="mt-3 text-[13px] text-fg-muted" data-testid="next-milestone">
                      {{
                        'projects.progress.nextMilestone'
                          | transloco: { title: next.title, date: (next.due_date | localDay) }
                      }}
                    </p>
                  }
                }
              </app-card>

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'projects.plan.title' | transloco }}
                  </h2>
                  <div
                    class="inline-flex rounded-tile border border-border p-0.5"
                    role="group"
                    [attr.aria-label]="'projects.plan.viewLabel' | transloco"
                  >
                    @for (v of planViews; track v) {
                      <button
                        type="button"
                        class="h-8 rounded-[8px] px-3 text-[12.5px] font-semibold"
                        [class.bg-accent-soft]="planView() === v"
                        [class.text-accent]="planView() === v"
                        [class.text-fg-muted]="planView() !== v"
                        [attr.aria-pressed]="planView() === v"
                        (click)="planView.set(v)"
                        [attr.data-testid]="'plan-view-' + v"
                      >
                        {{ 'projects.plan.views.' + v | transloco }}
                      </button>
                    }
                  </div>
                </div>
                @if (plan(); as pl) {
                  @if (planView() === 'gantt') {
                    <app-gantt-chart [rows]="planRows()" [start]="pl.start" [end]="pl.end" />
                  } @else {
                    <app-project-board
                      [items]="pl.items"
                      [canMove]="p.can_contribute && !closed()"
                      (changed)="changed()"
                    />
                  }
                } @else {
                  <p class="py-4 text-[13px] text-fg-muted" role="status">
                    {{ 'projects.common.loading' | transloco }}
                  </p>
                }
              </app-card>

              <app-card>
                <app-project-milestones
                  [projectId]="p.id"
                  [canContribute]="p.can_contribute && !closed()"
                  [refresh]="childVersion()"
                  [focusId]="milestone() ?? null"
                  (changed)="milestonesChanged()"
                />
              </app-card>

              <app-card>
                <app-project-reviews
                  [projectId]="p.id"
                  [canContribute]="p.can_contribute && !closed()"
                  [canEdit]="p.can_edit && !closed()"
                  [refresh]="reviewsVersion()"
                  [focusId]="review() ?? null"
                  (changed)="changed()"
                />
              </app-card>

              <app-card>
                <app-project-lessons
                  [projectId]="p.id"
                  [canContribute]="p.can_contribute"
                  [refresh]="childVersion()"
                  (changed)="changed()"
                />
              </app-card>

              <app-project-ai-panel
                [projectId]="p.id"
                [canContribute]="p.can_contribute && !closed()"
                (taskAdded)="changed()"
              />
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="project"
                [entityId]="p.id"
                [canCreate]="p.can_contribute && !closed()"
                [entityLabel]="p.code + ' ' + p.title"
              />
            </div>

            <ng-container aside>
              <app-card>
                <app-project-team
                  [projectId]="p.id"
                  [members]="p.members"
                  [canEdit]="p.can_edit && !closed()"
                  (changed)="changed()"
                />
              </app-card>
              <app-supports-requirements entityType="project" [entityId]="p.id" />
              <app-why-it-matters scope="projects" page="detail" />
              <div class="flex flex-col items-start gap-1">
                <app-teach-me
                  topic="projects.detail"
                  [subject]="'projects.list.title' | transloco"
                />
                <app-project-lesson-link lesson="project-basics" />
                @if (p.kind === 'design_development') {
                  <app-project-lesson-link lesson="design-control" />
                }
                @if (p.security_relevant) {
                  <app-project-lesson-link lesson="security-in-projects" />
                }
                <app-project-lesson-link lesson="closing-a-project" />
              </div>
            </ng-container>
          </app-record-detail-layout>

          <app-project-closeout
            [project]="p"
            [open]="closing()"
            (closed)="onClosed($event)"
            (cancelled)="closing.set(false)"
          />

          <app-prompt-dialog
            [open]="reopening()"
            [title]="'projects.reopen.title' | transloco: { code: p.code }"
            [message]="'projects.reopen.message' | transloco"
            [label]="'projects.reopen.reason' | transloco"
            [confirmLabel]="'projects.reopen.action' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="reopen($event)"
            (cancelled)="reopening.set(false)"
          />

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'projects.detail.deleteTitle' | transloco"
            [message]="'projects.detail.deleteMessage' | transloco: { code: p.code }"
            [confirmLabel]="'projects.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
        }
      }
    }
  `,
})
export class ProjectDetailPage {
  private readonly api = inject(ProjectsApi);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  /** `?milestone=<id>` deep link (search results, notifications, My Work). */
  readonly milestone = input<string | undefined>(undefined);
  /** `?review=<id>` deep link. */
  readonly review = input<string | undefined>(undefined);

  protected readonly tabs = TABS;
  protected readonly planViews = PLAN_VIEWS;
  protected readonly fieldLabels = PROJECT_FIELD_LABELS;
  protected readonly statusKey = projectStatusKey;
  protected readonly statusTone = projectStatusTone;
  protected readonly healthTone = healthTone;
  protected readonly priorityTone = priorityTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('projects.common.loadFailed');
  protected readonly project = signal<ProjectDetail | null>(null);
  protected readonly plan = signal<ProjectPlan | null>(null);
  protected readonly summary = signal<ProjectSummary | null>(null);
  protected readonly planView = signal<PlanView>('gantt');
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly closing = signal(false);
  protected readonly reopening = signal(false);
  /** Bumped when children must re-fetch (close-out, reopen). */
  protected readonly childVersion = signal(0);
  /** Bumped when the design reviews' milestone list may be stale. */
  protected readonly reviewsVersion = signal(0);

  protected readonly closed = computed(() => isClosedStatus(this.project()?.status));
  protected readonly planRows = computed(() => planRows(this.plan()?.items ?? []));
  protected readonly reopenAllowed = computed(() => {
    const p = this.project();
    return (
      !!p && canReopen(p, this.auth.user()?.id, this.selectedOrg.currentOrg()?.permissions ?? [])
    );
  });
  protected readonly daysToDue = computed(() => {
    const s = this.summary();
    if (!s || s.days_to_due === null || this.closed()) {
      return null;
    }
    const d = s.days_to_due;
    if (d === 0) {
      return this.language.translate('projects.detail.dueToday');
    }
    return d > 0
      ? this.language.translate('projects.detail.daysLeft', { count: d })
      : this.language.translate('projects.detail.daysOverdue', { count: -d });
  });

  private request = new Subscription();
  private side = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.side.unsubscribe();
    });
    providePageContext(() => {
      const p = this.project();
      return {
        module: 'projects',
        entityType: 'project',
        entityId: this.id(),
        view: 'detail',
        title: p ? `${p.code} ${p.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.load(orgId, id, true);
        this.loadSide(orgId, id);
      });
    });
  }

  /** Something on the page changed: refresh the project (progress), the plan and the summary. */
  protected changed(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.load(orgId, this.id(), false);
    this.loadSide(orgId, this.id());
  }

  protected milestonesChanged(): void {
    this.reviewsVersion.update((v) => v + 1);
    this.changed();
  }

  protected onClosed(project: ProjectDetail): void {
    this.closing.set(false);
    this.project.set(project);
    this.childVersion.update((v) => v + 1);
    this.loadSide(this.selectedOrg.currentOrgId(), project.id);
  }

  protected reopen(reason: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.reopen(orgId, this.id(), { reason: reason.trim() || null }).subscribe({
      next: (project) => {
        this.acting.set(false);
        this.reopening.set(false);
        this.project.set(project);
        this.childVersion.update((v) => v + 1);
        this.loadSide(orgId, project.id);
        this.notifications.success('projects.notices.reopened', { code: project.code });
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.project();
    if (!orgId || !p) {
      return;
    }
    this.acting.set(true);
    this.api.delete(orgId, p.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('projects.notices.deleted', { code: p.code });
        void this.router.navigate(['/projects']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string, initial: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (initial) {
      this.state.set('loading');
    }
    this.request = this.api.get(orgId, id).subscribe({
      next: (project) => {
        this.project.set(project);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (initial) {
          this.errorKey.set(projectErrorKey(error));
          this.state.set('error');
        } else {
          this.notifications.error(projectErrorKey(error));
        }
      },
    });
  }

  /** The plan (Gantt / board) and the summary (next milestone, days to due). */
  private loadSide(orgId: string | null, id: string): void {
    this.side.unsubscribe();
    if (!orgId) {
      return;
    }
    const side = new Subscription();
    side.add(
      this.api.plan(orgId, id).subscribe({
        next: (plan) => this.plan.set(plan),
        error: () => this.plan.set({ project_id: id, start: null, end: null, items: [] }),
      }),
    );
    side.add(
      this.api.summary(orgId, id).subscribe({
        next: (summary) => this.summary.set(summary),
        error: () => this.summary.set(null),
      }),
    );
    this.side = side;
  }
}

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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { KitApi } from '../../core/kit/kit-api';
import { LinkItem } from '../../core/kit/kit.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { RequirementLink } from '../../core/standards/standards.models';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ProjectAskButton } from './ask-button';
import { GanttRow, planRows } from './data/gantt';
import {
  EntityRef,
  PERM_WRITE,
  ProjectDetail,
  ProjectPlan,
  ProjectProgress,
  ProjectSummary,
  isClosedStatus,
  isOneOf,
} from './data/project.models';
import {
  PROJECT_FIELD_LABELS,
  healthBadge,
  objectiveMetBadge,
  priorityBadge,
  projectStatusBadge,
} from './data/project-display';
import { projectErrorKey } from './data/project-errors';
import { ProjectsApi } from './data/projects-api';
import { GanttChart } from './gantt-chart';
import { ProjectAiPanel } from './project-ai-panel';
import { ProjectBoard } from './project-board';
import { ProjectCloseout } from './project-closeout';
import { ProjectLessons } from './project-lessons';
import { ProjectMilestones } from './project-milestones';
import { ProjectReviews } from './project-reviews';
import { ProjectTeam } from './project-team';
import { AFFECTED_TYPES, OBJECTIVE_TYPES } from './project-form';
import { ProjectRecordPicker } from './record-picker';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** The sub-sections of the Details tab (one shown at a time). */
export const SECTIONS = ['overview', 'plan', 'reviews', 'lessons'] as const;
export type Section = (typeof SECTIONS)[number];

export const PLAN_VIEWS = ['gantt', 'board', 'list'] as const;
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

/** i18n key + params of the progress line ("3 av 6 milepæler ferdig") and how % is computed. */
export function percentExplanation(p: ProjectProgress): string {
  switch (p.percent_basis) {
    case 'completed':
      return 'projects.progress.basis.completed';
    case 'tasks':
      return 'projects.progress.basis.tasks';
    case 'none':
      return 'projects.progress.basis.none';
    default:
      return 'projects.progress.basis.milestones';
  }
}

/** The related records shown in the purpose card, by role. */
export function purposeLinks(links: readonly LinkItem[]): {
  readonly affected: EntityRef[];
  readonly objectives: EntityRef[];
} {
  const seen = new Set<string>();
  const affected: EntityRef[] = [];
  const objectives: EntityRef[] = [];
  for (const l of links) {
    const o = l.other;
    const key = `${o.entity_type}:${o.entity_id}`;
    if (seen.has(key)) {
      continue;
    }
    if (OBJECTIVE_TYPES.includes(o.entity_type)) {
      seen.add(key);
      objectives.push(o);
    } else if (AFFECTED_TYPES.includes(o.entity_type) && l.link_type !== 'derived_from') {
      seen.add(key);
      affected.push(o);
    }
  }
  return { affected, objectives };
}

/**
 * A project (`/projects/:id`). The Details tab is split into four sections
 * (Oversikt · Plan · Gjennomganger · Erfaringer) so the page stays short:
 * the overview has purpose and change planning (with the processes, documents
 * and objectives it touches), progress with how it is computed, the A.5.8
 * security checklist and the design outputs; the plan is one card with a Gantt
 * chart, a task board or a list of phases and milestones. Requirements,
 * connections, create-from-here, tasks, related records, activity, comments,
 * attachments and revisions come from the shared record kit. `?milestone=` and
 * `?review=` open that record.
 */
@Component({
  selector: 'app-project-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    WatchButton,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    CoverageChip,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ProgressBar,
    PromptDialog,
    SlideOver,
    StatusBadge,
    ProjectAskButton,
    GanttChart,
    ProjectAiPanel,
    ProjectBoard,
    ProjectCloseout,
    ProjectLessons,
    ProjectMilestones,
    ProjectReviews,
    ProjectTeam,
    ProjectRecordPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          @if (
            errorKey() === 'projects.errors.notFound' || errorKey() === 'projects.errors.forbidden'
          ) {
            <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          } @else {
            <app-error-state (retry)="retry()" />
          }
          <a routerLink="/projects" class="mt-4 inline-block text-ui font-semibold text-accent">
            {{ 'projects.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (project(); as p) {
          <app-record-detail-layout
            entityType="project"
            [entityId]="p.id"
            [title]="p.title"
            [breadcrumbs]="[
              { labelKey: 'modules.names.projects', link: '/projects' },
              { label: p.code + ' ' + p.title },
            ]"
            [tabs]="tabs"
            [counts]="{ tasks: p.progress.tasks_open }"
            [requirementsPanel]="false"
            [canEdit]="p.can_contribute && !closed()"
            [fieldLabels]="fieldLabels"
            backLink="/projects"
            backLabelKey="projects.common.backToList"
          >
            <ng-container meta>
              <span class="font-mono font-semibold" data-testid="project-code">{{ p.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'projects.kinds.' + p.kind | transloco }}</span>
              <app-status-badge
                [meaning]="statusBadge(p.status).meaning"
                [value]="statusBadge(p.status).value"
                [labelKey]="statusBadge(p.status).labelKey"
                data-testid="project-status"
              />
              @if (p.priority === 'high' || p.priority === 'urgent') {
                <app-status-badge
                  [meaning]="priority(p.priority).meaning"
                  [value]="priority(p.priority).value"
                  [labelKey]="priority(p.priority).labelKey"
                />
              }
              @if (p.health && !closed()) {
                <app-status-badge
                  [meaning]="health(p.health).meaning"
                  [value]="health(p.health).value"
                  [labelKey]="health(p.health).labelKey"
                  [attr.title]="'projects.fields.healthHint' | transloco"
                />
              }
              @if (p.security_relevant) {
                <span class="inline-flex items-center gap-1 text-meta text-info-ink">
                  <app-icon name="lock" [size]="12" />
                  {{ 'projects.fields.securityShort' | transloco }}
                </span>
              }
              @if (p.is_overdue) {
                <app-status-badge meaning="lifecycle" value="overdue" />
              }
            </ng-container>

            @if (p.can_edit && !closed()) {
              <a
                primary
                [routerLink]="['/projects', p.id, 'edit']"
                class="inline-flex h-9 items-center gap-1.5 rounded-tile bg-accent px-3.5 text-ui font-semibold text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
                data-testid="project-edit"
              >
                {{ 'projects.common.edit' | transloco }}
              </a>
            } @else if (reopenAllowed()) {
              <app-button primary (click)="reopening.set(true)" data-testid="project-reopen">
                {{ 'projects.reopen.action' | transloco }}
              </app-button>
            }
            @if (p.can_edit && !closed()) {
              <app-button
                secondary
                class="hidden sm:inline-flex"
                variant="secondary"
                (click)="closing.set(true)"
                data-testid="project-close"
              >
                <app-icon name="checkcircle" [size]="14" />
                {{ 'projects.closeout.open' | transloco }}
              </app-button>
            }
            <app-project-ask-button
              secondary
              promptKey="projects.ask.summarise"
              labelKey="projects.ask.label"
              [requirements]="confirmedRefs()"
              testId="project-ask"
            />
            <app-watch-button secondary entityType="project" [entityId]="p.id" />

            @if (p.can_edit && !closed()) {
              <button
                appMenuItem
                overflow
                class="sm:hidden"
                type="button"
                (click)="closing.set(true)"
              >
                {{ 'projects.closeout.open' | transloco }}
              </button>
            }
            <button
              appMenuItem
              overflow
              type="button"
              (click)="aiOpen.set(true)"
              data-testid="open-ai"
            >
              {{ 'projects.ai.menu' | transloco }}
            </button>
            @if (p.can_delete) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleting.set(true)"
                data-testid="project-delete"
              >
                {{ 'projects.common.delete' | transloco }}
              </button>
            }

            <app-help-strip
              help
              scope="projects"
              page="detail"
              [lesson]="p.kind === 'design_development' ? 'design-control' : 'project-basics'"
            />

            <div class="flex flex-col gap-5">
              <nav
                class="-mx-1 flex gap-1 overflow-x-auto px-1"
                [attr.aria-label]="'projects.sections.label' | transloco"
                data-testid="project-sections"
              >
                @for (s of sections; track s) {
                  <button
                    type="button"
                    class="inline-flex h-9 flex-none items-center gap-1.5 rounded-full border px-3.5 text-ui font-semibold whitespace-nowrap focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [class]="
                      section() === s
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border bg-surface text-fg-muted hover:text-fg'
                    "
                    [attr.aria-current]="section() === s ? 'true' : null"
                    (click)="setSection(s)"
                    [attr.data-testid]="'section-' + s"
                  >
                    {{ 'projects.sections.' + s | transloco }}
                    @if (sectionCount(s); as n) {
                      <span class="rounded-full bg-surface-2 px-1.5 text-micro text-fg-muted">{{
                        n
                      }}</span>
                    }
                  </button>
                }
              </nav>

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
              }

              @switch (section()) {
                @case ('overview') {
                  <div class="flex flex-col gap-5" data-testid="section-overview-body">
                    <div
                      class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-border bg-surface px-4 py-3 text-ui lg:hidden"
                      data-testid="mobile-summary"
                    >
                      <span class="inline-flex items-center gap-1.5 text-fg-muted">
                        <app-icon name="people" [size]="14" />
                        {{ p.owner?.name ?? ('projects.common.none' | transloco) }}
                        · {{ 'projects.list.members' | transloco: { count: p.member_count } }}
                      </span>
                      <app-coverage-chip entityType="project" [entityId]="p.id" />
                    </div>

                    @if (closed()) {
                      <app-card data-testid="closeout-card">
                        <h2 class="mb-3 font-display text-card font-bold text-fg">
                          {{ 'projects.detail.closeoutTitle' | transloco }}
                        </h2>
                        <app-field-list>
                          <app-field-item labelKey="projects.fields.objectiveMet">
                            @if (p.objective_met) {
                              <app-status-badge
                                [meaning]="metBadge(p.objective_met).meaning"
                                [value]="metBadge(p.objective_met).value"
                                [labelKey]="metBadge(p.objective_met).labelKey"
                              />
                            }
                          </app-field-item>
                          <app-field-item labelKey="projects.fields.closeoutApprovedBy">
                            @if (p.closeout_approved_by) {
                              {{
                                'projects.detail.approvedBy'
                                  | transloco
                                    : {
                                        name: p.closeout_approved_by.name,
                                        date: (p.closeout_approved_at | localDate: 'mediumDate'),
                                      }
                              }}
                            }
                          </app-field-item>
                          <app-field-item
                            labelKey="projects.fields.objectiveEvidence"
                            [value]="p.objective_evidence"
                            [wide]="true"
                            [multiline]="true"
                          />
                          <app-field-item
                            labelKey="projects.fields.closeoutSummary"
                            [value]="p.closeout_summary"
                            [wide]="true"
                            [multiline]="true"
                          />
                        </app-field-list>
                      </app-card>
                    }

                    <app-card>
                      <h2 class="mb-3 font-display text-card font-bold text-fg">
                        {{ 'projects.detail.purpose' | transloco }}
                      </h2>
                      <app-field-list>
                        <app-field-item
                          labelKey="projects.fields.objective"
                          [value]="p.objective"
                          [wide]="true"
                          [multiline]="true"
                        />
                        <app-field-item
                          labelKey="projects.fields.scope"
                          [value]="p.scope"
                          [wide]="true"
                          [multiline]="true"
                        />
                        @if (p.description) {
                          <app-field-item
                            labelKey="projects.fields.description"
                            [value]="p.description"
                            [wide]="true"
                            [multiline]="true"
                          />
                        }
                        <app-field-item labelKey="projects.fields.owner" [value]="p.owner?.name" />
                        <app-field-item
                          labelKey="projects.fields.department"
                          [value]="departmentName()"
                        />
                        <app-field-item
                          labelKey="projects.fields.startDate"
                          [value]="p.start_date ? (p.start_date | localDay) : null"
                        />
                        <app-field-item labelKey="projects.fields.dueDate">
                          @if (p.due_date) {
                            <span [class.text-warn-ink]="p.is_overdue">{{
                              p.due_date | localDay
                            }}</span>
                            @if (daysToDue(); as text) {
                              <span class="block text-meta text-fg-subtle">{{ text }}</span>
                            }
                          }
                        </app-field-item>
                      </app-field-list>

                      <div class="mt-5 border-t border-border pt-4" data-testid="change-card">
                        <h3
                          class="mb-3 flex flex-wrap items-center gap-1.5 text-body font-semibold text-fg"
                        >
                          {{ 'projects.form.sections.change' | transloco }}
                        </h3>
                        <app-field-list>
                          <app-field-item
                            labelKey="projects.fields.changeConsequences"
                            [value]="p.change_consequences"
                            [wide]="true"
                            [multiline]="true"
                          />
                          <app-field-item
                            labelKey="projects.fields.changeResources"
                            [value]="p.change_resources"
                            [wide]="true"
                            [multiline]="true"
                          />
                          <app-field-item
                            labelKey="projects.form.affected"
                            [wide]="true"
                            empty="none"
                          >
                            @if (purpose().affected.length || canLink()) {
                              <div class="flex flex-col gap-2">
                                @if (purpose().affected.length) {
                                  <div class="flex flex-wrap gap-1.5" data-testid="affected">
                                    @for (r of purpose().affected; track r.entity_id) {
                                      <app-entity-chip [ref]="r" />
                                    }
                                  </div>
                                }
                                @if (canLink()) {
                                  <app-project-record-picker
                                    [types]="affectedTypes"
                                    [picked]="purpose().affected"
                                    [label]="'projects.form.affected' | transloco"
                                    [placeholder]="'projects.form.affectedPlaceholder' | transloco"
                                    testId="detail-pick-affected"
                                    (selected)="link($event, 'relates_to')"
                                  />
                                }
                              </div>
                            }
                          </app-field-item>
                          <app-field-item
                            labelKey="projects.form.objectives"
                            [wide]="true"
                            empty="none"
                          >
                            @if (purpose().objectives.length || canLink()) {
                              <div class="flex flex-col gap-2">
                                @if (purpose().objectives.length) {
                                  <div class="flex flex-wrap gap-1.5" data-testid="objectives">
                                    @for (r of purpose().objectives; track r.entity_id) {
                                      <app-entity-chip [ref]="r" />
                                    }
                                  </div>
                                }
                                @if (canLink()) {
                                  <app-project-record-picker
                                    [types]="objectiveTypes"
                                    [picked]="purpose().objectives"
                                    [label]="'projects.form.objectives' | transloco"
                                    [placeholder]="
                                      'projects.form.objectivesPlaceholder' | transloco
                                    "
                                    testId="detail-pick-objectives"
                                    (selected)="link($event, 'implements')"
                                  />
                                }
                              </div>
                            }
                          </app-field-item>
                        </app-field-list>
                      </div>
                    </app-card>

                    <app-card data-testid="progress-card">
                      <div class="mb-3 flex items-center justify-between gap-2">
                        <h2 class="font-display text-card font-bold text-fg">
                          {{ 'projects.progress.title' | transloco }}
                        </h2>
                        <span class="text-card font-bold text-fg" data-testid="progress-percent">
                          {{
                            'projects.progress.percent' | transloco: { percent: p.progress.percent }
                          }}
                        </span>
                      </div>
                      <app-progress-bar
                        [value]="p.progress.percent"
                        [label]="'projects.progress.title' | transloco"
                      />
                      <p class="mt-2 text-meta text-fg-subtle" data-testid="progress-basis">
                        {{ basisKey() | transloco }}
                      </p>
                      <ul class="mt-4 grid grid-cols-1 gap-3 text-ui sm:grid-cols-3">
                        <li>
                          <p class="text-meta font-semibold text-fg-muted">
                            {{ 'projects.progress.milestones' | transloco }}
                          </p>
                          <p class="text-fg" data-testid="progress-milestones">
                            {{ progressLine('milestones') }}
                          </p>
                        </li>
                        <li>
                          <p class="text-meta font-semibold text-fg-muted">
                            {{ 'projects.progress.tasks' | transloco }}
                          </p>
                          <p class="text-fg" data-testid="progress-tasks">
                            {{ progressLine('tasks') }}
                          </p>
                        </li>
                        <li>
                          <p class="text-meta font-semibold text-fg-muted">
                            {{ 'projects.progress.reviews' | transloco }}
                          </p>
                          <p class="text-fg" data-testid="progress-reviews">
                            {{ progressLine('reviews') }}
                          </p>
                        </li>
                      </ul>
                      @if (summary(); as s) {
                        @if (s.next_milestone; as next) {
                          <p class="mt-3 text-ui text-fg-muted" data-testid="next-milestone">
                            {{
                              'projects.progress.nextMilestone'
                                | transloco: { title: next.title, date: (next.due_date | localDay) }
                            }}
                          </p>
                        }
                      }
                    </app-card>

                    @if (p.security_relevant) {
                      <app-card data-testid="security-card">
                        <h2 class="mb-1 font-display text-card font-bold text-fg">
                          {{ 'projects.security.title' | transloco }}
                        </h2>
                        <p class="mb-3 text-meta text-fg-muted">
                          {{ 'projects.security.intro' | transloco }}
                        </p>
                        <app-field-list [columns]="1">
                          <app-field-item
                            labelKey="projects.fields.securityRequirements"
                            [value]="p.security_requirements"
                            [multiline]="true"
                          />
                        </app-field-list>
                        @if ((p.security_checklist ?? []).length) {
                          <ul class="mt-4 flex flex-col gap-2" data-testid="security-checklist">
                            @for (c of p.security_checklist; track c.key) {
                              <li
                                class="flex flex-wrap items-start gap-2 rounded-tile border border-border p-2.5"
                              >
                                <app-icon
                                  [name]="c.done ? 'checkcircle' : 'clock'"
                                  [size]="16"
                                  [class]="c.done ? 'text-pass' : 'text-fg-subtle'"
                                />
                                <div class="min-w-0 flex-1">
                                  <p class="text-ui font-semibold text-fg">
                                    {{ 'projects.security.checks.' + c.key | transloco }}
                                    <span class="sr-only"
                                      >:
                                      {{
                                        (c.done
                                          ? 'projects.security.done'
                                          : 'projects.security.todo'
                                        ) | transloco
                                      }}</span
                                    >
                                  </p>
                                  @if (c.items.length) {
                                    <div class="mt-1 flex flex-wrap gap-1.5">
                                      @for (i of c.items; track i.entity_type + i.entity_id) {
                                        <app-entity-chip [ref]="i" />
                                      }
                                    </div>
                                  } @else {
                                    <p class="text-meta text-fg-subtle">
                                      {{ 'projects.security.hints.' + c.key | transloco }}
                                    </p>
                                  }
                                </div>
                                @if (!c.done && canFlow()) {
                                  @if (checkFlow(c.key); as flow) {
                                    <app-button
                                      variant="secondary"
                                      size="sm"
                                      [disabled]="flows.starting() !== null"
                                      (click)="startFlow(flow)"
                                      [attr.data-testid]="'security-do-' + c.key"
                                    >
                                      {{ 'projects.security.actions.' + c.key | transloco }}
                                    </app-button>
                                  }
                                }
                              </li>
                            }
                          </ul>
                        }
                      </app-card>
                    }

                    @if (p.kind === 'design_development') {
                      <app-card data-testid="design-outputs">
                        <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <h2 class="font-display text-card font-bold text-fg">
                            {{ 'projects.outputs.title' | transloco }}
                          </h2>
                          @if (canFlow()) {
                            <app-button
                              variant="secondary"
                              size="sm"
                              [disabled]="flows.starting() !== null"
                              (click)="startFlow('project.to_document')"
                              data-testid="add-output"
                            >
                              <app-icon name="plus" [size]="14" />
                              {{ 'projects.outputs.add' | transloco }}
                            </app-button>
                          }
                        </div>
                        <p class="mb-3 text-meta text-fg-muted">
                          {{ 'projects.outputs.intro' | transloco }}
                        </p>
                        @if ((p.design_outputs ?? []).length) {
                          <div class="flex flex-wrap gap-1.5">
                            @for (d of p.design_outputs; track d.entity_id) {
                              <app-entity-chip [ref]="d" />
                            }
                          </div>
                        } @else {
                          <p class="text-ui text-fg-subtle">
                            {{ 'projects.outputs.empty' | transloco }}
                          </p>
                        }
                        <p class="mt-3 text-meta text-fg-subtle">
                          {{ 'projects.outputs.changesHint' | transloco }}
                          <button
                            type="button"
                            class="font-semibold text-accent hover:underline"
                            (click)="setSection('reviews')"
                          >
                            {{ 'projects.outputs.toReviews' | transloco }}
                          </button>
                        </p>
                      </app-card>
                    }

                    <app-why-it-matters scope="projects" page="detail" />
                  </div>
                }
                @case ('plan') {
                  <app-card data-testid="plan-card">
                    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <h2 class="font-display text-card font-bold text-fg">
                          {{ 'projects.plan.title' | transloco }}
                        </h2>
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <div
                          class="inline-flex rounded-tile border border-border p-0.5"
                          role="group"
                          [attr.aria-label]="'projects.plan.viewLabel' | transloco"
                        >
                          @for (v of planViews; track v) {
                            <button
                              type="button"
                              class="h-8 rounded-tile px-3 text-ui font-semibold"
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
                        @if (p.can_contribute && !closed()) {
                          <app-button
                            size="sm"
                            variant="secondary"
                            (click)="milestonesCmp()?.openNew('phase')"
                            data-testid="add-phase"
                          >
                            <app-icon name="plus" [size]="14" />
                            {{ 'projects.milestones.addPhase' | transloco }}
                          </app-button>
                          <app-button
                            size="sm"
                            (click)="milestonesCmp()?.openNew('milestone')"
                            data-testid="add-milestone"
                          >
                            <app-icon name="flag" [size]="14" />
                            {{ 'projects.milestones.addMilestone' | transloco }}
                          </app-button>
                        }
                      </div>
                    </div>
                    @if (planView() === 'gantt') {
                      @if (plan(); as pl) {
                        <app-gantt-chart
                          [rows]="planRows()"
                          [start]="pl.start"
                          [end]="pl.end"
                          [selectKinds]="['phase', 'milestone']"
                          (selected)="openPlanRow($event)"
                        />
                      } @else {
                        <app-loading-state [rows]="4" />
                      }
                    } @else if (planView() === 'board') {
                      @if (plan(); as pl) {
                        <app-project-board
                          [items]="pl.items"
                          [canMove]="p.can_contribute && !closed()"
                          (changed)="changed()"
                          (createTask)="startFlow('project.to_task')"
                        />
                      } @else {
                        <app-loading-state [rows]="4" />
                      }
                    }
                    <app-project-milestones
                      [projectId]="p.id"
                      [canContribute]="p.can_contribute && !closed()"
                      [refresh]="childVersion()"
                      [focusId]="milestone() ?? null"
                      [showHeader]="false"
                      [listVisible]="planView() === 'list'"
                      (changed)="milestonesChanged()"
                    />
                  </app-card>
                }
                @case ('reviews') {
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
                }
                @case ('lessons') {
                  <app-card>
                    <app-project-lessons
                      [projectId]="p.id"
                      [canContribute]="p.can_contribute"
                      [canFollowUp]="p.can_contribute"
                      [refresh]="childVersion()"
                      (changed)="changed()"
                    />
                  </app-card>
                }
              }
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="project"
                [entityId]="p.id"
                [canCreate]="p.can_contribute && !closed()"
                [entityLabel]="p.code + ' ' + p.title"
              />
            </div>

            <ng-container aside-requirements>
              <app-supports-requirements
                entityType="project"
                [entityId]="p.id"
                [canEdit]="p.can_contribute && !closed()"
                (linksChange)="reqLinks.set($event)"
              />
            </ng-container>

            <ng-container aside>
              <app-card>
                <app-project-team
                  [projectId]="p.id"
                  [members]="p.members"
                  [canEdit]="p.can_edit && !closed()"
                  (changed)="changed()"
                />
              </app-card>
            </ng-container>
          </app-record-detail-layout>

          <app-project-closeout
            [project]="p"
            [open]="closing()"
            (closed)="onClosed($event)"
            (cancelled)="closing.set(false)"
            (showOpenWork)="showOpenWork()"
          />

          <app-slide-over
            [open]="aiOpen()"
            [title]="'projects.ai.title' | transloco"
            [closeLabel]="'projects.common.close' | transloco"
            [width]="560"
            (closed)="aiOpen.set(false)"
          >
            @if (aiOpen()) {
              <app-project-ai-panel
                [projectId]="p.id"
                [canContribute]="p.can_contribute && !closed()"
                (taskAdded)="changed()"
              />
            }
          </app-slide-over>

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
  private readonly kit = inject(KitApi);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly flows = inject(CreateFlowService);

  readonly id = input.required<string>();
  /** `?milestone=<id>` deep link (search results, notifications, My Work). */
  readonly milestone = input<string | undefined>(undefined);
  /** `?review=<id>` deep link. */
  readonly review = input<string | undefined>(undefined);

  protected readonly milestonesCmp = viewChild(ProjectMilestones);

  protected readonly tabs = TABS;
  protected readonly sections = SECTIONS;
  protected readonly planViews = PLAN_VIEWS;
  protected readonly fieldLabels = PROJECT_FIELD_LABELS;
  protected readonly affectedTypes = AFFECTED_TYPES;
  protected readonly objectiveTypes = OBJECTIVE_TYPES;
  protected readonly statusBadge = projectStatusBadge;
  protected readonly priority = priorityBadge;
  protected readonly health = healthBadge;
  protected readonly metBadge = objectiveMetBadge;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('projects.common.loadFailed');
  protected readonly project = signal<ProjectDetail | null>(null);
  protected readonly plan = signal<ProjectPlan | null>(null);
  protected readonly summary = signal<ProjectSummary | null>(null);
  protected readonly links = signal<readonly LinkItem[]>([]);
  protected readonly reqLinks = signal<readonly RequirementLink[]>([]);
  protected readonly section = signal<Section>(this.initialSection());
  /** Phones start on the list: a Gantt chart needs width. */
  protected readonly planView = signal<PlanView>(
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'gantt',
  );
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly closing = signal(false);
  protected readonly reopening = signal(false);
  protected readonly aiOpen = signal(false);
  /** Bumped when children must re-fetch (close-out, reopen). */
  protected readonly childVersion = signal(0);
  /** Bumped when the design reviews' milestone list may be stale. */
  protected readonly reviewsVersion = signal(0);

  protected readonly closed = computed(() => isClosedStatus(this.project()?.status));
  protected readonly planRows = computed(() => planRows(this.plan()?.items ?? []));
  protected readonly purpose = computed(() => purposeLinks(this.links()));
  protected readonly canLink = computed(() => {
    const p = this.project();
    return !!p && p.can_edit && !this.closed();
  });
  protected readonly canFlow = computed(() => {
    const p = this.project();
    return !!p && p.can_contribute && !this.closed();
  });
  protected readonly basisKey = computed(() => {
    const p = this.project();
    return p ? percentExplanation(p.progress) : '';
  });
  /** Confirmed requirement refs of the project (assistant context). */
  protected readonly confirmedRefs = computed(() =>
    this.reqLinks()
      .filter((l) => l.status === 'confirmed')
      .map((l) => l.requirement_ref)
      .filter((r): r is string => !!r),
  );
  private readonly assignees = inject(AssigneeOptionsService);
  protected readonly departmentName = computed(() => {
    const id = this.project()?.department_id;
    return id
      ? (this.assignees.options().departments.find((d) => d.value === `department:${id}`)?.label ??
          null)
      : null;
  });

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
    this.assignees.ensureLoaded();
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
        requirements: this.confirmedRefs(),
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
    // Deep links open the section that holds the record.
    effect(() => {
      if (this.milestone()) {
        untracked(() => {
          this.section.set('plan');
          this.planView.set('list');
        });
      } else if (this.review()) {
        untracked(() => this.section.set('reviews'));
      }
    });
  }

  protected sectionCount(s: Section): number | null {
    const p = this.project();
    if (!p) {
      return null;
    }
    if (s === 'reviews') {
      return p.progress.design_reviews_total || null;
    }
    if (s === 'plan') {
      return p.progress.milestones_total || null;
    }
    return null;
  }

  protected setSection(s: Section): void {
    this.section.set(s);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section: s === 'overview' ? null : s },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** One-line, human progress per kind ("Ingen oppgaver ennå", "1 gjennomgang, ingen venter"). */
  protected progressLine(kind: 'milestones' | 'tasks' | 'reviews'): string {
    const p = this.project()?.progress;
    if (!p) {
      return '';
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    if (kind === 'milestones') {
      if (!p.milestones_total) {
        return t('projects.progress.noMilestones');
      }
      const base = t('projects.progress.doneOf', {
        done: p.milestones_done,
        total: p.milestones_total,
      });
      return p.milestones_overdue
        ? `${base} · ${t('projects.progress.overdueCount', { count: p.milestones_overdue })}`
        : base;
    }
    if (kind === 'tasks') {
      if (!p.tasks_total) {
        return t('projects.progress.noTasks');
      }
      const base = t('projects.progress.doneOf', { done: p.tasks_done, total: p.tasks_total });
      return p.tasks_overdue
        ? `${base} · ${t('projects.progress.overdueCount', { count: p.tasks_overdue })}`
        : base;
    }
    if (!p.design_reviews_total) {
      return t('projects.progress.noReviews');
    }
    const reviews =
      p.design_reviews_pending > 0
        ? t('projects.progress.reviewsPending', {
            total: p.design_reviews_total,
            pending: p.design_reviews_pending,
          })
        : t('projects.progress.reviewsNonePending', { total: p.design_reviews_total });
    const actionsOpen = p.review_actions_open ?? 0;
    return actionsOpen > 0
      ? `${reviews} · ${t('projects.progress.reviewActionsOpen', { count: actionsOpen })}`
      : reviews;
  }

  /** The create-from-here flow that fulfils a security check. */
  protected checkFlow(key: string): string | null {
    switch (key) {
      case 'risk_assessment':
        return 'project.to_risk';
      case 'dpia':
        return 'project.to_dpia';
      case 'security_test':
        return 'project.to_task';
      default:
        return null;
    }
  }

  protected startFlow(key: string): void {
    const p = this.project();
    if (p) {
      void this.flows.start(key, 'project', p.id);
    }
  }

  protected openPlanRow(row: GanttRow): void {
    this.milestonesCmp()?.openById(row.id);
  }

  protected showOpenWork(): void {
    this.closing.set(false);
    this.setSection('plan');
    this.planView.set('list');
  }

  protected link(ref: EntityRef, linkType: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.project();
    if (!orgId || !p) {
      return;
    }
    this.kit
      .createLink(orgId, {
        source_type: 'project',
        source_id: p.id,
        target_type: ref.entity_type,
        target_id: ref.entity_id,
        link_type: linkType,
      })
      .subscribe({
        next: () => {
          this.notifications.success('projects.notices.linked', {
            name: ref.code || ref.title,
          });
          this.loadLinks(orgId, p.id);
        },
        error: () => this.notifications.error('projects.errors.linkFailed'),
      });
  }

  protected retry(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.load(orgId, this.id(), true);
    this.loadSide(orgId, this.id());
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
    this.setSection('overview');
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

  protected statusKey(status: string): string {
    return `projects.status.${status}`;
  }

  private initialSection(): Section {
    const s = this.route.snapshot.queryParamMap.get('section');
    return isOneOf(SECTIONS, s) ? s : 'overview';
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

  private loadLinks(orgId: string, id: string): void {
    this.side.add(
      this.kit.links(orgId, 'project', id).subscribe({
        next: (res) => this.links.set(res?.items ?? []),
        error: () => this.links.set([]),
      }),
    );
  }

  /** The plan (Gantt / board), the summary (next milestone, days to due) and the links. */
  private loadSide(orgId: string | null, id: string): void {
    this.side.unsubscribe();
    if (!orgId) {
      return;
    }
    const side = new Subscription();
    this.side = side;
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
    this.loadLinks(orgId, id);
  }
}

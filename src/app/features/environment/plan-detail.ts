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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementLink } from '../../core/standards/standards.models';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { Term } from '../../shared/guidance/term';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { RuleSummary } from '../../shared/tasks/rule-summary';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { EnvironmentApi } from './data/environment-api';
import {
  Drill,
  DrillCreate,
  ENTITY_DRILL,
  ENTITY_PLAN,
  EmergencyPlan,
  FLOWS,
  ReviewIn,
} from './data/environment.models';
import { outcomeBadgeValue } from './data/environment-display';
import { environmentErrorKey } from './data/environment-errors';
import { chipRef } from './aspect-detail';
import { EnvDrillDialog } from './drill-dialog';
import {
  ENV_CRUMBS,
  ENV_MODULE,
  ENV_PLAN_FRAMEWORKS,
  ENV_ROOT_CRUMB,
  EnvAskButton,
  departmentName,
  injectEnvPermissions,
} from './environment-shared';
import { EnvFlowButtons } from './flow-buttons';
import { EnvReviewDialog } from './review-dialog';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const PLAN_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'environment.fields.code',
  title: 'environment.fields.title',
  scenario: 'environment.fields.scenario',
  potential_impact: 'environment.fields.potentialImpact',
  response_procedure: 'environment.fields.responseProcedure',
  resources: 'environment.fields.resources',
  contacts: 'environment.fields.contacts',
  site: 'environment.fields.site',
  status: 'environment.fields.status',
  owner_user_id: 'environment.fields.owner',
  department_id: 'environment.fields.department',
  drill_rrule: 'environment.fields.drillSchedule',
  review_due_at: 'environment.fields.reviewDue',
  last_reviewed_at: 'environment.fields.lastReviewed',
};

/** The flows offered on each recorded drill or real event. */
export const DRILL_FLOWS: readonly string[] = [FLOWS.drillToDeviation, FLOWS.drillToTask];

export type PlanNotice = 'drill' | 'revision' | 'review' | 'noAspects';

export function planNotices(p: EmergencyPlan): PlanNotice[] {
  const out: PlanNotice[] = [];
  if (p.drill_overdue) {
    out.push('drill');
  }
  if ((p.open_revision_tasks ?? 0) > 0) {
    out.push('revision');
  }
  if (p.review_overdue) {
    out.push('review');
  }
  if (p.aspects && p.aspects.length === 0 && p.status !== 'retired') {
    out.push('noAspects');
  }
  return out;
}

/** "Kari Nordmann, Ola Hansen og 3 andre" style participant line parts. */
export function participantNames(d: Drill): { names: string; others: number } {
  const people = d.participant_list ?? [];
  const others = Math.max(0, (d.participants ?? 0) - people.length);
  return { names: people.map((p) => p.name).join(', '), others };
}

/**
 * An emergency preparedness and response plan (`/environment/emergency-plans/:id`).
 * Header: code, status, overdue drill; "Registrer øvelse" is the primary action,
 * Edit and "Lag ny fra denne" are secondary, review and delete sit under "Mer".
 * Body: what needs attention, the scenario, the aspects the plan covers, the
 * response procedure and resources, contacts (members or external), and the drills
 * and real events with outcome, participants, findings and "Opprett avvik" /
 * "Opprett oppgave" per drill. `?drill=<id>` highlights one drill; `?recordDrill=1`
 * opens the recording dialog (from the home page's "do this now").
 */
@Component({
  selector: 'app-env-plan-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    WatchButton,
    AskAbout,
    Term,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    RuleSummary,
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
    ModuleNav,
    StatusBadge,
    EnvAskButton,
    EnvDrillDialog,
    EnvFlowButtons,
    EnvReviewDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-error-state
            titleKey="environment.common.notFoundTitle"
            [bodyKey]="errorKey()"
            (retry)="reload()"
          />
          <p class="mt-3 text-center">
            <a
              routerLink="/environment/emergency-plans"
              class="text-ui font-semibold text-accent hover:underline"
              >{{ 'environment.plans.back' | transloco }}</a
            >
          </p>
        </div>
      }
      @default {
        @if (plan(); as p) {
          <app-record-detail-layout
            [entityType]="entityType"
            [entityId]="p.id"
            [title]="p.title"
            [breadcrumbs]="breadcrumbs()"
            [settingsLink]="perms.settingsLink()"
            [tabs]="tabs"
            [canEdit]="perms.write()"
            [fieldLabels]="fieldLabels"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ p.code }}</span>
              <span aria-hidden="true">·</span>
              <app-term key="emergency-preparedness" scope="environment">{{
                'environment.plan.one' | transloco
              }}</app-term>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="p.status"
                [labelKey]="'environment.status.' + p.status"
                data-testid="plan-status"
              />
              @if (p.drill_overdue) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="environment.plan.drillOverdue"
                  data-testid="plan-drill-overdue"
                />
              }
            </ng-container>

            @if (perms.record()) {
              <app-button primary (click)="recording.set(true)" data-testid="record-drill">
                <app-icon name="plus" [size]="15" />
                {{ 'environment.drill.record' | transloco }}
              </app-button>
            }
            @if (perms.write()) {
              <a
                secondary
                [routerLink]="['/environment/emergency-plans', p.id, 'edit']"
                tabindex="-1"
                data-testid="plan-edit"
              >
                <app-button variant="secondary">{{
                  'environment.common.edit' | transloco
                }}</app-button>
              </a>
            }
            @if (perms.write()) {
              <button
                appMenuItem
                overflow
                type="button"
                (click)="reviewing.set(true)"
                data-testid="plan-review"
              >
                {{ 'environment.review.action' | transloco }}
              </button>
            }
            @if (perms.manage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleting.set(true)"
                data-testid="plan-delete"
              >
                {{ 'environment.common.delete' | transloco }}
              </button>
            }

            <app-module-nav
              nav
              class="mb-4 block"
              [items]="perms.nav()"
              labelKey="modules.names.environment"
            />
            <app-help-strip
              help
              scope="environment"
              page="planDetail"
              lesson="emergency-preparedness"
              [subject]="p.title"
            />

            <div class="flex flex-col gap-5">
              @if (notices().length) {
                <ul class="flex flex-col gap-2" role="status" data-testid="plan-notices">
                  @for (n of notices(); track n) {
                    <li
                      class="flex flex-col gap-2 rounded-tile border border-warn/40 bg-warn-soft px-4 py-3 text-ui text-warn-ink sm:flex-row sm:items-center"
                    >
                      <span class="flex min-w-0 flex-1 gap-2">
                        <app-icon name="alert" [size]="15" class="mt-0.5 flex-none" />
                        <span>{{
                          'environment.plan.notices.' + n
                            | transloco
                              : {
                                  count: p.open_revision_tasks ?? 0,
                                  date: (p.review_due_at | localDay),
                                }
                        }}</span>
                      </span>
                      <span class="flex flex-none flex-wrap gap-2">
                        @switch (n) {
                          @case ('drill') {
                            @if (perms.record()) {
                              <app-button
                                variant="secondary"
                                size="sm"
                                (click)="recording.set(true)"
                              >
                                {{ 'environment.drill.record' | transloco }}
                              </app-button>
                            }
                          }
                          @case ('revision') {
                            <a
                              [routerLink]="[]"
                              [queryParams]="{ tab: 'tasks' }"
                              class="text-ui font-semibold text-accent hover:underline"
                              >{{ 'environment.plan.openTasks' | transloco }}</a
                            >
                          }
                          @case ('review') {
                            @if (perms.write()) {
                              <app-button
                                variant="secondary"
                                size="sm"
                                (click)="reviewing.set(true)"
                              >
                                {{ 'environment.review.action' | transloco }}
                              </app-button>
                            }
                          }
                          @case ('noAspects') {
                            @if (perms.write()) {
                              <a
                                [routerLink]="['/environment/emergency-plans', p.id, 'edit']"
                                fragment="aspects"
                                class="text-ui font-semibold text-accent hover:underline"
                                >{{ 'environment.plan.linkAspects' | transloco }}</a
                              >
                            }
                          }
                        }
                      </span>
                    </li>
                  }
                </ul>
              }

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'environment.plan.sections.scenario' | transloco }}
                </h2>
                <app-field-list>
                  <app-field-item
                    labelKey="environment.fields.scenario"
                    [value]="p.scenario"
                    [wide]="true"
                    [multiline]="true"
                  />
                  <app-field-item
                    labelKey="environment.fields.potentialImpact"
                    [value]="p.potential_impact"
                    [wide]="true"
                    [multiline]="true"
                  />
                  <app-field-item labelKey="environment.fields.site" [value]="p.site" />
                </app-field-list>
              </app-card>

              <app-card data-testid="plan-aspects">
                <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'environment.plan.sections.aspects' | transloco }}
                  </h2>
                  @if (perms.write()) {
                    <a
                      [routerLink]="['/environment/emergency-plans', p.id, 'edit']"
                      fragment="aspects"
                      class="text-ui font-semibold text-accent hover:underline"
                      >{{ 'environment.plan.editAspects' | transloco }}</a
                    >
                  }
                </div>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'environment.plan.aspectsHint' | transloco }}
                </p>
                @if (aspects().length) {
                  <ul class="flex flex-col gap-2">
                    @for (a of aspects(); track a.id) {
                      <li><app-entity-chip [ref]="ref(a)" [statusText]="true" /></li>
                    }
                  </ul>
                } @else {
                  <p class="text-ui text-fg-muted">
                    {{ 'environment.plan.noAspects' | transloco }}
                  </p>
                }
              </app-card>

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'environment.fields.responseProcedure' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'environment.ask.procedure' | transloco"
                    field="response_procedure"
                    [fieldLabel]="'environment.fields.responseProcedure' | transloco"
                    [requirements]="confirmedRefs()"
                  />
                </div>
                @if (p.response_procedure) {
                  <div
                    class="cf-prose text-body text-fg"
                    data-testid="plan-procedure"
                    [innerHTML]="p.response_procedure | appMarkdown"
                  ></div>
                } @else {
                  <p class="text-ui text-fg-muted">
                    {{ 'environment.plan.noProcedure' | transloco }}
                  </p>
                }
                @if (p.resources) {
                  <h3 class="mt-4 mb-1 text-meta font-semibold text-fg-muted">
                    {{ 'environment.fields.resources' | transloco }}
                  </h3>
                  <p class="text-body whitespace-pre-line text-fg">{{ p.resources }}</p>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'environment.fields.contacts' | transloco }}
                </h2>
                @if (p.contacts.length) {
                  <ul class="flex flex-col divide-y divide-border" data-testid="plan-contacts">
                    @for (c of p.contacts; track $index) {
                      <li class="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-4">
                        <span class="min-w-0 flex-1">
                          <span class="block text-ui font-semibold text-fg">
                            {{ c.name }}
                            <span class="ml-1 text-meta font-normal text-fg-subtle">{{
                              (c.user_id
                                ? 'environment.plan.contactMember'
                                : 'environment.plan.contactExternal'
                              ) | transloco
                            }}</span>
                          </span>
                          @if (c.role) {
                            <span class="block text-meta text-fg-muted">{{ c.role }}</span>
                          }
                        </span>
                        <span class="flex flex-wrap gap-x-4 text-ui">
                          @if (c.phone) {
                            <a [href]="'tel:' + c.phone" class="text-accent hover:underline">{{
                              c.phone
                            }}</a>
                          }
                          @if (c.email) {
                            <a
                              [href]="'mailto:' + c.email"
                              class="break-all text-accent hover:underline"
                              >{{ c.email }}</a
                            >
                          }
                        </span>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-ui text-fg-muted">
                    {{ 'environment.plan.noContacts' | transloco }}
                  </p>
                }
              </app-card>

              <app-card data-testid="plan-drills">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'environment.drill.listTitle' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'environment.ask.drillLessons' | transloco"
                    field="drills"
                    [fieldLabel]="'environment.drill.listTitle' | transloco"
                    [requirements]="confirmedRefs()"
                  />
                </div>
                @switch (drillsState()) {
                  @case ('loading') {
                    <app-loading-state [rows]="2" />
                  }
                  @case ('error') {
                    <app-error-state (retry)="loadDrills(p.id)" />
                  }
                  @default {
                    @if (drills().length) {
                      <ul class="flex flex-col gap-3" data-testid="drill-rows">
                        @for (d of drills(); track d.id) {
                          @let who = people(d);
                          <li
                            [id]="'drill-' + d.id"
                            class="rounded-tile border p-3"
                            [class.border-accent]="d.id === highlightDrill()"
                            [class.bg-accent-soft]="d.id === highlightDrill()"
                            [class.border-border]="d.id !== highlightDrill()"
                          >
                            <div class="flex flex-wrap items-center justify-between gap-2">
                              <div class="flex flex-wrap items-center gap-2 text-ui">
                                <span class="font-semibold text-fg">{{
                                  d.held_at | localDate
                                }}</span>
                                <span class="text-fg-muted">{{
                                  'environment.drillKinds.' + d.kind | transloco
                                }}</span>
                                <app-status-badge
                                  meaning="compliance"
                                  [value]="outcomeValue(d.outcome)"
                                  [labelKey]="'environment.outcomes.' + d.outcome"
                                />
                                @if (d.plan_revision_needed) {
                                  <app-status-badge
                                    meaning="lifecycle"
                                    value="due"
                                    labelKey="environment.drill.revisionNeeded"
                                  />
                                }
                              </div>
                              @if (perms.manage()) {
                                <button
                                  type="button"
                                  class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                                  [attr.aria-label]="'environment.drill.delete' | transloco"
                                  [title]="'environment.drill.delete' | transloco"
                                  (click)="deletingDrill.set(d)"
                                >
                                  <app-icon name="trash" [size]="14" />
                                </button>
                              }
                            </div>
                            <p class="mt-1 text-meta text-fg-muted">
                              @if (who.names) {
                                {{
                                  (who.others
                                    ? 'environment.drill.participantsWithOthers'
                                    : 'environment.drill.participantsNamed'
                                  ) | transloco: { names: who.names, count: who.others }
                                }}
                                ·
                              } @else if (d.participants !== null) {
                                {{
                                  'environment.drill.participants'
                                    | transloco: { count: d.participants }
                                }}
                                ·
                              }
                              {{
                                'environment.drill.recordedBy'
                                  | transloco
                                    : {
                                        name:
                                          d.recorded_by_name ??
                                          ('environment.common.unknown' | transloco),
                                      }
                              }}
                            </p>
                            @if (d.findings) {
                              <p class="mt-2 text-ui whitespace-pre-line text-fg">
                                <span class="font-semibold"
                                  >{{ 'environment.fields.findings' | transloco }}:</span
                                >
                                {{ d.findings }}
                              </p>
                            }
                            @if (d.lessons_learned) {
                              <p class="mt-1 text-ui whitespace-pre-line text-fg">
                                <span class="font-semibold"
                                  >{{ 'environment.fields.lessonsLearned' | transloco }}:</span
                                >
                                {{ d.lessons_learned }}
                              </p>
                            }
                            <div class="mt-2 flex flex-wrap items-center gap-2">
                              @if (d.revision_task_id) {
                                <a
                                  [routerLink]="['/tasks', d.revision_task_id]"
                                  class="mr-2 text-meta font-semibold text-accent hover:underline"
                                  >{{ 'environment.drill.openRevisionTask' | transloco }}</a
                                >
                              }
                              <app-env-flow-buttons
                                [entityType]="drillType"
                                [entityId]="d.id"
                                [keys]="drillFlows"
                              />
                            </div>
                          </li>
                        }
                      </ul>
                    } @else {
                      <p class="text-ui text-fg-muted" data-testid="no-drills">
                        {{ 'environment.drill.none' | transloco }}
                      </p>
                    }
                  }
                }
              </app-card>
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="p.id"
                [canCreate]="perms.write()"
                [entityLabel]="p.code + ' ' + p.title"
              />
            </div>

            <app-supports-requirements
              aside-requirements
              [entityType]="entityType"
              [entityId]="p.id"
              [canEdit]="perms.write()"
              [frameworks]="frameworks"
              (linksChange)="onLinks($event)"
            />

            <div aside class="flex flex-col gap-4">
              <app-card data-testid="plan-drill-summary">
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'environment.plan.sections.drillsAndReview' | transloco }}
                  </h2>
                  <app-watch-button [entityType]="entityType" [entityId]="p.id" />
                </div>
                <app-field-list [columns]="1">
                  <app-field-item labelKey="environment.fields.drillSchedule">
                    @if (p.drill_rrule) {
                      <app-rule-summary [rrule]="p.drill_rrule" />
                    } @else {
                      <span class="text-fg-muted">{{ 'common.empty.notSet' | transloco }}</span>
                      @if (perms.write()) {
                        ·
                        <a
                          [routerLink]="['/environment/emergency-plans', p.id, 'edit']"
                          fragment="drills"
                          class="font-semibold text-accent hover:underline"
                          >{{ 'environment.plan.setSchedule' | transloco }}</a
                        >
                      }
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="environment.plan.nextDrill"
                    [value]="p.next_drill_due_at ? (p.next_drill_due_at | localDay) : null"
                  />
                  <app-field-item labelKey="environment.plan.lastDrillLabel">
                    @if (p.last_drill_at) {
                      <span
                        [class.font-semibold]="p.drill_overdue"
                        [class.text-warn-ink]="p.drill_overdue"
                      >
                        {{ p.last_drill_at | localDay }}
                      </span>
                    } @else {
                      <span class="text-fg-muted">{{
                        'environment.common.never' | transloco
                      }}</span>
                    }
                  </app-field-item>
                  <app-field-item labelKey="environment.fields.owner" [value]="p.owner_name" />
                  <app-field-item labelKey="environment.fields.department" [value]="department()" />
                  <app-field-item labelKey="environment.fields.reviewDue">
                    @if (p.review_due_at) {
                      <span
                        [class.font-semibold]="p.review_overdue"
                        [class.text-warn-ink]="p.review_overdue"
                      >
                        {{ p.review_due_at | localDay }}
                        @if (p.review_overdue) {
                          · {{ 'common.status.overdue' | transloco }}
                        }
                      </span>
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="environment.fields.lastReviewed"
                    [value]="p.last_reviewed_at ? (p.last_reviewed_at | localDate) : null"
                    empty="none"
                  />
                </app-field-list>
                <div
                  class="mt-4 flex flex-wrap gap-1"
                  role="group"
                  [attr.aria-label]="'environment.ask.group' | transloco"
                >
                  <app-env-ask-button
                    labelKey="environment.ask.checkPlanLabel"
                    promptKey="environment.ask.summarisePlan"
                    [requirements]="confirmedRefs()"
                  />
                </div>
              </app-card>
            </div>

            <div aside-learn>
              <app-why-it-matters scope="environment" page="planDetail" />
            </div>
          </app-record-detail-layout>

          <app-env-drill-dialog
            [open]="recording()"
            [busy]="acting()"
            [planTitle]="p.code + ' ' + p.title"
            (saved)="recordDrill($event)"
            (cancelled)="recording.set(false)"
          />
          <app-env-review-dialog
            [open]="reviewing()"
            [busy]="acting()"
            (confirmed)="review($event)"
            (cancelled)="reviewing.set(false)"
          />
          <app-confirm-dialog
            [open]="!!deviationFor()"
            [title]="'environment.drill.deviationPromptTitle' | transloco"
            [message]="'environment.drill.deviationPromptMessage' | transloco"
            [confirmLabel]="'environment.drill.deviationPromptConfirm' | transloco"
            [cancelLabel]="'environment.drill.deviationPromptLater' | transloco"
            confirmVariant="primary"
            (confirmed)="startDeviation()"
            (cancelled)="deviationFor.set(null)"
          />
          <app-confirm-dialog
            [open]="deleting()"
            [title]="'environment.plan.deleteTitle' | transloco"
            [message]="'environment.plan.deleteMessage' | transloco: { code: p.code }"
            [confirmLabel]="'environment.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
          <app-confirm-dialog
            [open]="!!deletingDrill()"
            [title]="'environment.drill.deleteTitle' | transloco"
            [message]="'environment.drill.deleteMessage' | transloco"
            [confirmLabel]="'environment.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="removeDrill()"
            (cancelled)="deletingDrill.set(null)"
          />
        }
      }
    }
  `,
})
export class PlanDetail {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly directory = inject(AssigneeOptionsService);
  private readonly flows = inject(CreateFlowService);

  /** Route param (component input binding): follows navigation between plans. */
  readonly id = input.required<string>();

  protected readonly perms = injectEnvPermissions();
  protected readonly entityType = ENTITY_PLAN;
  protected readonly drillType = ENTITY_DRILL;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = PLAN_FIELD_LABELS;
  protected readonly frameworks = ENV_PLAN_FRAMEWORKS;
  protected readonly drillFlows = DRILL_FLOWS;
  protected readonly outcomeValue = outcomeBadgeValue;
  protected readonly ref = chipRef;
  protected readonly people = participantNames;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.errors.notFound');
  protected readonly plan = signal<EmergencyPlan | null>(null);
  protected readonly drills = signal<readonly Drill[]>([]);
  protected readonly drillsState = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly reviewing = signal(false);
  protected readonly recording = signal(false);
  protected readonly deletingDrill = signal<Drill | null>(null);
  /** A just-recorded real event that may need a deviation. */
  protected readonly deviationFor = signal<Drill | null>(null);
  protected readonly confirmedRefs = signal<readonly string[]>([]);

  /** `?drill=<id>` (the backend's link to one drill) highlights it. */
  protected readonly highlightDrill = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('drill'))),
    { initialValue: null },
  );

  protected readonly breadcrumbs = computed(() => [
    ENV_ROOT_CRUMB,
    ENV_CRUMBS.plans,
    { label: this.plan()?.code ?? '' },
  ]);
  protected readonly notices = computed(() => {
    const p = this.plan();
    return p ? planNotices(p) : [];
  });
  protected readonly aspects = computed(() => this.plan()?.aspects ?? []);
  protected readonly department = computed(() =>
    departmentName(this.directory, this.plan()?.department_id),
  );

  private request = new Subscription();
  private drillsRequest = new Subscription();
  private openedFromLink = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.drillsRequest.unsubscribe();
    });
    providePageContext(() => {
      const p = this.plan();
      return {
        module: ENV_MODULE,
        entityType: ENTITY_PLAN,
        entityId: this.id(),
        view: 'detail',
        title: p ? `${p.code} ${p.title}` : null,
        requirements: this.confirmedRefs().length ? this.confirmedRefs() : null,
      };
    });
    this.directory.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.load(orgId, id, true);
        this.loadDrills(id);
      });
    });
    // "?recordDrill=1" (home "do this now"): open the dialog once the plan is shown.
    effect(() => {
      const ready = this.state() === 'ready';
      const canRecord = this.perms.record();
      untracked(() => {
        if (
          ready &&
          canRecord &&
          !this.openedFromLink &&
          this.route.snapshot.queryParamMap.get('recordDrill') === '1'
        ) {
          this.openedFromLink = true;
          this.recording.set(true);
        }
      });
    });
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.confirmedRefs.set(
      links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
    );
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), true);
    this.loadDrills(this.id());
  }

  protected recordDrill(body: DrillCreate): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.recordDrill(orgId, this.id(), body).subscribe({
      next: (drill) => {
        this.acting.set(false);
        this.recording.set(false);
        this.notifications.success(
          drill.plan_revision_needed
            ? 'environment.notices.drillRecordedWithTask'
            : 'environment.notices.drillRecorded',
        );
        this.refresh();
        if (drill.kind === 'real_event' && this.perms.has('deviations:write')()) {
          this.deviationFor.set(drill);
        }
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected startDeviation(): void {
    const drill = this.deviationFor();
    this.deviationFor.set(null);
    if (drill) {
      void this.flows.start(FLOWS.drillToDeviation, ENTITY_DRILL, drill.id);
    }
  }

  protected review(body: ReviewIn): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.reviewPlan(orgId, this.id(), body).subscribe({
      next: (p) => {
        this.acting.set(false);
        this.reviewing.set(false);
        this.plan.set(p);
        this.notifications.success('environment.notices.reviewed', { code: p.code });
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected removeDrill(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const drill = this.deletingDrill();
    if (!orgId || !drill) {
      return;
    }
    this.acting.set(true);
    this.api.deleteDrill(orgId, this.id(), drill.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deletingDrill.set(null);
        this.notifications.success('environment.notices.drillDeleted');
        this.refresh();
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.plan();
    if (!orgId || !p) {
      return;
    }
    this.acting.set(true);
    this.api.deletePlan(orgId, p.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('environment.notices.deleted', { code: p.code });
        void this.router.navigate(['/environment/emergency-plans']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected loadDrills(id: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.drillsRequest.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    this.drillsState.set('loading');
    this.drillsRequest = this.api.listDrills(orgId, id).subscribe({
      next: (page) => {
        this.drills.set(page.items);
        this.drillsState.set('ready');
      },
      error: () => this.drillsState.set('error'),
    });
  }

  private refresh(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
    this.loadDrills(this.id());
  }

  private load(orgId: string | null, id: string, initial: boolean): void {
    this.request.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    if (initial && this.plan()?.id !== id) {
      this.plan.set(null);
      this.drills.set([]);
      this.confirmedRefs.set([]);
      this.state.set('loading');
    }
    this.request = this.api.getPlan(orgId, id).subscribe({
      next: (p) => {
        this.plan.set(p);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (initial) {
          this.errorKey.set(environmentErrorKey(error));
          this.state.set('error');
        } else {
          this.notifications.error(environmentErrorKey(error));
        }
      },
    });
  }
}

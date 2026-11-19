import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { pluralKey } from '../../../shared/i18n/plural';
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
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContinuityApi } from '../data/continuity-api';
import {
  ControlledHeaderAction,
  controlledStatusLine,
  placeControlledActions,
  planIctGaps,
  planMissing,
} from '../data/continuity-anatomy';
import { badge } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { PlanDetail, PlanIct, STEP_PHASES } from '../data/continuity.models';
import { ContinuityContactsPanel } from '../shared/contacts-panel';
import { ContinuityLearnMore, fileSlug, recordCrumbs, saveFile } from '../shared/continuity-page';
import { ContinuityControlledDialog, ControlledActionRequest } from '../shared/controlled-panel';
import { ContinuityDuration } from '../shared/duration';
import { ContinuityLinkedRecord } from '../shared/linked-record';
import { confirmedRequirementRefs } from '../shared/page-requirements';
import { ContinuityRecoveryTargets, hasTargets } from '../shared/recovery-targets';
import { PlanExerciseSchedule } from './exercise-schedule';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key (the plan's controlled fields). */
export const PLAN_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'continuity.fields.code',
  status: 'continuity.fields.status',
  version: 'continuity.fields.version',
  last_reviewed_on: 'continuity.fields.lastReviewed',
  next_review_on: 'continuity.fields.nextReview',
  title: 'continuity.fields.title',
  plan_type: 'continuity.fields.planType',
  owner_user_id: 'continuity.fields.owner',
  department_id: 'continuity.fields.department',
  location: 'continuity.fields.location',
  scope: 'continuity.planText.scope',
  objectives: 'continuity.planText.objectives',
  activation_criteria: 'continuity.planText.activation_criteria',
  roles_responsibilities: 'continuity.planText.roles_responsibilities',
  recovery_strategy: 'continuity.planText.recovery_strategy',
  communication_plan: 'continuity.planText.communication_plan',
  resources: 'continuity.planText.resources',
  steps: 'continuity.form.sections.steps',
  review_interval_months: 'continuity.fields.reviewInterval',
  bia_ids: 'continuity.form.sections.coverage',
};

/** The plan sections shown under "Flere detaljer" (scope and activation lead the page). */
const DETAIL_TEXT_FIELDS = [
  'objectives',
  'roles_responsibilities',
  'recovery_strategy',
  'communication_plan',
  'resources',
] as const;

/**
 * A continuity plan (`/continuity/plans/:id`) on the detail-page anatomy
 * (docs/ux-guide.md §2.7): the header holds the next approval step and the PDF;
 * "Hovedinformasjon" says where the plan stands, what it covers, when it is used, how
 * fast things must be back up and which activities (BIAs) it protects. The details
 * hold how to use it in an incident (activate, register the incident), the steps, the
 * crisis contacts, the other plan sections, the ICT services it relies on (and whether
 * each can recover in time) and its exercises. One "Oppfølging" card lists what is
 * missing, the requirements, the connections and owner · version · approval · reviews.
 * `?tab=contacts` scrolls to the contact list.
 */
@Component({
  selector: 'app-plan-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ContinuityContactsPanel,
    ContinuityControlledDialog,
    ContinuityDuration,
    ContinuityLearnMore,
    ContinuityLinkedRecord,
    ContinuityRecoveryTargets,
    EntityTasks,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PlanExerciseSchedule,
    PromptDialog,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    StatusBadge,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8"><app-loading-state [rows]="6" /></div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/continuity/plans"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'continuity.plans.back' | transloco }}
          </a>
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (plan(); as p) {
          @let line = statusLine();
          @let open = canWrite() && p.status !== 'retired';
          <app-record-detail-layout
            [anatomy]="true"
            entityType="continuity_plan"
            [entityId]="p.id"
            [title]="p.title"
            [breadcrumbs]="crumbs()"
            [tabs]="tabs"
            [canEdit]="p.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            [requirementsPanel]="true"
            [missing]="missing()"
            backLink="/continuity/plans"
            backLabelKey="continuity.plans.back"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ p.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'continuity.planType.' + p.plan_type | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="p.status"
                [labelKey]="'continuity.status.' + p.status"
              />
              @if (p.review_state === 'overdue' && p.status !== 'retired') {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="continuity.reviewState.overdue"
                />
              }
            </ng-container>

            @if (placed().primary; as action) {
              <app-button
                primary
                [disabled]="busy()"
                (click)="run(p, action)"
                [attr.data-testid]="'plan-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </app-button>
            }
            @for (action of placed().secondary; track action) {
              <app-button
                secondary
                variant="secondary"
                [disabled]="busy()"
                (click)="run(p, action)"
                [attr.data-testid]="'plan-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </app-button>
            }
            <app-button
              secondary
              variant="secondary"
              [loading]="exporting()"
              (click)="exportPdf(p)"
              data-testid="plan-pdf"
            >
              <app-icon name="download" [size]="14" />
              {{ 'continuity.plans.exportPdf' | transloco }}
            </app-button>
            @for (action of placed().overflow; track action) {
              <button appMenuItem overflow type="button" (click)="run(p, action)">
                {{ actionLabel(action) | transloco }}
              </button>
            }
            @if (open) {
              <button appMenuItem overflow type="button" (click)="planExercise(p)">
                {{ 'continuity.plans.planExercise' | transloco }}
              </button>
            }
            @if (p.allowed_actions.includes('retire')) {
              <button appMenuItem overflow type="button" (click)="dialog()?.open('retire')">
                {{ 'continuity.actions.retire' | transloco }}
              </button>
            }
            @if (p.can_delete) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="confirmDelete.set(true)"
              >
                {{ 'continuity.common.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('summarisePlan')">
              <app-icon name="spark" [size]="15" />
              {{ 'continuity.ai.summarise' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('nextStep')">
              <app-icon name="spark" [size]="15" />
              {{ 'continuity.detail.ask.nextStep' | transloco }}
            </button>

            <app-help-strip
              help
              scope="continuity"
              page="planDetail"
              lesson="writing-a-plan"
              [subject]="p.title"
            />

            <app-record-lead record-lead [fillLink]="p.can_edit ? editLink() : null">
              <app-record-status-line status [tone]="line.tone">
                {{
                  line.key
                    | transloco
                      : {
                          date: (line.date | localDay),
                          name: line.name || ('continuity.common.unknownPerson' | transloco),
                          version: line.version,
                        }
                }}
              </app-record-status-line>
              <app-field-item size="lead" labelKey="continuity.detail.plan.scope">
                @if (p.scope) {
                  <div
                    class="cf-prose text-body leading-relaxed"
                    [innerHTML]="p.scope | appMarkdown"
                  ></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="continuity.detail.plan.activation">
                @if (p.activation_criteria) {
                  <div
                    class="cf-prose text-body leading-relaxed"
                    [innerHTML]="p.activation_criteria | appMarkdown"
                  ></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="continuity.detail.plan.targets" [wide]="true">
                @if (targetsSet(p)) {
                  <app-continuity-recovery-targets
                    [rto]="p.recovery_targets.rto_minutes"
                    [rpo]="p.recovery_targets.rpo_minutes"
                    [mtpd]="p.recovery_targets.mtpd_minutes"
                  />
                  <p class="mt-1 text-meta text-fg-muted">
                    {{ 'continuity.detail.plan.targetsFrom' | transloco }}
                  </p>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="continuity.detail.plan.bias" [wide]="true">
                @if (p.bias.length) {
                  <div role="list" class="flex flex-col gap-2" data-testid="plan-bias">
                    @for (b of p.bias; track b.id) {
                      <app-continuity-linked-record
                        icon="scale"
                        typeKey="continuity.detail.type.bia"
                        [code]="b.code"
                        [title]="b.title"
                        [link]="['/continuity/bias', b.id]"
                      >
                        @if (b.criticality) {
                          <app-status-badge
                            meaning="severity"
                            [value]="b.criticality"
                            [labelKey]="'continuity.criticality.' + b.criticality"
                          />
                        }
                        @if (b.rto_minutes !== null) {
                          <span>
                            {{ 'continuity.detail.targets.rto' | transloco }}
                            <app-continuity-duration [minutes]="b.rto_minutes" />
                          </span>
                        }
                      </app-continuity-linked-record>
                    }
                  </div>
                }
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-5">
              <app-card data-testid="plan-use">
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'continuity.plans.useTitle' | transloco }}
                </h2>
                <p class="text-ui text-fg-muted">
                  @if (p.last_activated_at) {
                    {{
                      activationKey(p)
                        | transloco
                          : {
                              date: (p.last_activated_at | localDate),
                              count: p.activation_count ?? 1,
                            }
                    }}
                  } @else {
                    {{ 'continuity.plans.neverActivated' | transloco }}
                  }
                </p>
                <p
                  class="mt-1 text-ui"
                  [class]="p.distribution_current ? 'text-fg-muted' : 'text-warn-ink'"
                  data-testid="plan-distribution"
                >
                  @if (p.distributed_version) {
                    {{
                      (p.distribution_current
                        ? 'continuity.plans.distributedCurrent'
                        : 'continuity.plans.distributedOld'
                      )
                        | transloco
                          : {
                              version: p.distributed_version,
                              date: (p.distributed_at | localDay),
                              name:
                                p.distributed_by?.name ||
                                ('continuity.common.unknownPerson' | transloco),
                            }
                    }}
                  } @else {
                    {{ 'continuity.plans.neverDistributed' | transloco }}
                  }
                </p>
                @if (open) {
                  <div class="mt-3 flex flex-wrap gap-2">
                    <app-button
                      size="sm"
                      variant="danger"
                      (click)="activateOpen.set(true)"
                      data-testid="plan-activate"
                    >
                      {{ 'continuity.plans.activate' | transloco }}
                    </app-button>
                    <app-button size="sm" variant="secondary" (click)="registerIncident(p)">
                      {{ 'continuity.plans.registerIncident' | transloco }}
                    </app-button>
                  </div>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.detail.plan.steps' | transloco }}
                </h2>
                @if (p.steps.length === 0) {
                  <p class="text-ui text-fg-muted">{{ 'continuity.form.noSteps' | transloco }}</p>
                } @else {
                  <div class="flex flex-col gap-4">
                    @for (phase of phases; track phase) {
                      @if (stepsIn(phase).length) {
                        <section>
                          <h3 class="mb-1.5 text-ui font-semibold text-fg-muted">
                            {{ 'continuity.phase.' + phase | transloco }}
                          </h3>
                          <ol class="flex flex-col gap-1.5">
                            @for (s of stepsIn(phase); track $index) {
                              <li class="rounded-tile border border-border px-3 py-2 text-ui">
                                <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span class="font-semibold text-fg">{{ s.title }}</span>
                                  @if (s.owner_role) {
                                    <span class="text-fg-muted">{{ s.owner_role }}</span>
                                  }
                                  @if (s.target_minutes !== null) {
                                    <span class="text-fg-subtle">
                                      {{ 'continuity.fields.targetTime' | transloco }}:
                                      <app-continuity-duration [minutes]="s.target_minutes" />
                                    </span>
                                  }
                                </span>
                                @if (s.description) {
                                  <span class="mt-1 block whitespace-pre-line text-fg-muted">{{
                                    s.description
                                  }}</span>
                                }
                              </li>
                            }
                          </ol>
                        </section>
                      }
                    }
                  </div>
                }
              </app-card>

              <div id="contacts" #contacts tabindex="-1" class="outline-none">
                <app-continuity-contacts-panel [planId]="p.id" [canEdit]="open" />
              </div>

              <app-card>
                <app-record-details
                  [columns]="2"
                  titleKey="continuity.detail.plan.more"
                  [fillLink]="p.can_edit ? editLink() : null"
                >
                  @for (f of detailFields; track f) {
                    <app-field-item [labelKey]="'continuity.planText.' + f" [wide]="true">
                      @if (p[f]; as text) {
                        <div
                          class="cf-prose text-body leading-relaxed"
                          [innerHTML]="text | appMarkdown"
                        ></div>
                      }
                    </app-field-item>
                  }
                  <app-field-item labelKey="continuity.fields.location" [value]="p.location" />
                </app-record-details>
              </app-card>

              <app-card>
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'continuity.plans.ictServices' | transloco }}
                </h2>
                @if (ictGaps().length) {
                  <div class="my-3" data-testid="plan-ict-gap">
                    <app-alert tone="error">
                      {{
                        'continuity.plans.ictGapWarning' | transloco: { services: ictGapNames() }
                      }}
                    </app-alert>
                  </div>
                }
                @if ((p.ict_dependencies ?? []).length === 0) {
                  <p class="text-ui text-fg-muted">{{ 'continuity.plans.noIct' | transloco }}</p>
                } @else {
                  <div role="list" class="mt-3 flex flex-col gap-2" data-testid="plan-ict">
                    @for (s of p.ict_dependencies; track s.id) {
                      <app-continuity-linked-record
                        icon="devices"
                        typeKey="continuity.detail.type.ict"
                        [code]="s.code"
                        [title]="s.name"
                        [link]="['/continuity/ict-systems', s.id]"
                      >
                        <app-status-badge
                          meaning="compliance"
                          [value]="planGap(s) ? 'not_met' : readinessBadge(s).value"
                          [labelKey]="
                            planGap(s)
                              ? 'continuity.plans.ictCannotMeet'
                              : 'continuity.readiness.' + s.readiness
                          "
                        />
                        <span>
                          {{ 'continuity.plans.ictCan' | transloco }}
                          <app-continuity-duration [minutes]="s.achievable_rto_minutes" />
                          @if (s.last_test_recovery_minutes !== null) {
                            · {{ 'continuity.plans.ictTested' | transloco }}
                            <app-continuity-duration [minutes]="s.last_test_recovery_minutes" />
                          }
                        </span>
                      </app-continuity-linked-record>
                    }
                  </div>
                }
              </app-card>

              <app-card>
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'continuity.plans.exercises' | transloco }}
                </h2>
                <p class="mb-3 text-ui text-fg-muted">
                  @if (p.last_exercised_on) {
                    {{
                      'continuity.plans.lastExercised'
                        | transloco: { date: (p.last_exercised_on | localDay) }
                    }}
                  } @else {
                    {{ 'continuity.plans.neverExercised' | transloco }}
                  }
                  @if (p.next_exercise_on) {
                    ·
                    {{
                      'continuity.plans.nextExercise'
                        | transloco: { date: (p.next_exercise_on | localDay) }
                    }}
                  }
                </p>
                @if (p.exercises.length) {
                  <div role="list" class="flex flex-col gap-2" data-testid="plan-exercises">
                    @for (e of p.exercises; track e.id) {
                      <app-continuity-linked-record
                        icon="target"
                        [typeKey]="'continuity.exerciseType.' + e.exercise_type"
                        [code]="e.code"
                        [title]="e.title"
                        [link]="['/continuity/exercises', e.id]"
                      >
                        @if (e.outcome) {
                          <app-status-badge
                            [meaning]="outcomeBadge(e.outcome).meaning"
                            [value]="outcomeBadge(e.outcome).value"
                            [labelKey]="'continuity.outcome.' + e.outcome"
                          />
                        } @else {
                          <app-status-badge
                            meaning="lifecycle"
                            [value]="e.status"
                            [labelKey]="'continuity.exerciseStatus.' + e.status"
                          />
                        }
                        @if (e.conducted_on ?? e.scheduled_on; as day) {
                          <span>{{ day | localDay }}</span>
                        }
                      </app-continuity-linked-record>
                    }
                  </div>
                }
                @if (open) {
                  <div class="mt-3">
                    <app-button size="sm" variant="secondary" (click)="planExercise(p)">
                      <app-icon name="plus" [size]="14" />
                      {{ 'continuity.plans.planExercise' | transloco }}
                    </app-button>
                  </div>
                }
              </app-card>

              <app-plan-exercise-schedule [plan]="p" [canEdit]="open" (scheduled)="reload()" />

              <app-why-it-matters scope="continuity" page="planDetail" />
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="continuity_plan"
                [entityId]="p.id"
                [canCreate]="p.can_edit"
                [entityLabel]="p.code + ' ' + p.title"
              />
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="continuity.fields.owner"
                [value]="p.owner?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="continuity.fields.version"
                [value]="p.version || null"
              />
              <app-field-item layout="inline" labelKey="continuity.detail.meta.approved">
                @if (p.approved_at) {
                  {{ p.approved_at | localDay }}
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="continuity.fields.lastReviewed"
                [value]="p.last_reviewed_on | localDay"
              />
              <app-field-item
                layout="inline"
                labelKey="continuity.detail.meta.reviewEvery"
                [value]="
                  'continuity.detail.meta.everyMonths'
                    | transloco: { count: p.review_interval_months }
                "
              />
              <app-field-item
                layout="inline"
                labelKey="continuity.fields.nextReview"
                [keepEmpty]="p.status !== 'retired'"
                [emptyKey]="
                  p.status === 'approved'
                    ? 'kit.detail.meta.notPlanned'
                    : 'continuity.detail.meta.afterApproval'
                "
              >
                @if (p.next_review_on) {
                  <span [class.text-warn-ink]="p.review_state === 'overdue'">{{
                    p.next_review_on | localDay
                  }}</span>
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="continuity.detail.meta.lastExercised"
                [value]="p.last_exercised_on | localDay"
              />
              <app-field-item
                layout="inline"
                labelKey="continuity.detail.meta.updated"
                [value]="p.updated_at | localDate"
              />
            </app-record-meta>

            <app-continuity-learn-more
              aside-learn
              [lessons]="['exercising-plans', 'crisis-contacts']"
            />
          </app-record-detail-layout>

          <app-continuity-controlled-dialog [busy]="busy()" (acted)="act(p, $event)" />

          <app-prompt-dialog
            [open]="activateOpen()"
            [title]="'continuity.plans.activateTitle' | transloco: { code: p.code }"
            [message]="'continuity.plans.activateMessage' | transloco"
            [label]="'continuity.plans.activateReason' | transloco"
            [confirmLabel]="'continuity.plans.activate' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="danger"
            [busy]="busy()"
            (confirmed)="activate(p, $event)"
            (cancelled)="activateOpen.set(false)"
          />

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'continuity.plans.deleteTitle' | transloco"
            [message]="
              'continuity.plans.deleteMessage' | transloco: { code: p.code, title: p.title }
            "
            [confirmLabel]="'continuity.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(p)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class PlanDetailPage {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly flows = inject(CreateFlowService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);

  readonly id = input.required<string>();

  protected readonly dialog = viewChild(ContinuityControlledDialog);
  private readonly contactsAnchor = viewChild<ElementRef<HTMLElement>>('contacts');

  protected readonly tabs = TABS;
  protected readonly fieldLabels = PLAN_FIELD_LABELS;
  protected readonly detailFields = DETAIL_TEXT_FIELDS;
  protected readonly phases = STEP_PHASES;
  protected readonly outcomeBadge = badge.outcome;
  protected readonly readinessBadge = (s: PlanIct) => badge.readiness(s.readiness);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly plan = signal<PlanDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly exporting = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly activateOpen = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));
  protected readonly canWrite = computed(() => this.permissions().includes('continuity:write'));
  protected readonly crumbs = computed(() => recordCrumbs('plans', this.plan()?.code ?? ''));
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/continuity/plans',
    this.id(),
    'edit',
  ]);

  protected readonly statusLine = computed(() => {
    const p = this.plan();
    return p ? controlledStatusLine(p) : { key: '', tone: 'neutral' as const };
  });

  protected readonly placed = computed(() => {
    const p = this.plan();
    return p ? placeControlledActions(p) : { primary: null, secondary: [], overflow: [] };
  });

  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const p = this.plan();
    if (!p) {
      return [];
    }
    const write = this.canWrite();
    return planMissing(p, {
      editLink: this.editLink(),
      review: p.allowed_actions.includes('review') ? () => this.dialog()?.open('review') : null,
      planExercise: write ? () => this.planExercise(p) : null,
      print: write ? () => this.exportPdf(p) : null,
    });
  });

  /** ICT services that cannot recover within this plan's targets. */
  protected readonly ictGaps = computed(() => {
    const p = this.plan();
    return p ? planIctGaps(p) : [];
  });
  protected readonly ictGapNames = computed(() =>
    this.ictGaps()
      .map((s) => `${s.code} ${s.name}`)
      .join(', '),
  );

  /** Requirements the record documents, for the assistant's page context. */
  private readonly requirements = confirmedRequirementRefs('continuity_plan', () => this.id());

  private request = new Subscription();
  private scrolled = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const p = this.plan();
      return {
        module: 'continuity',
        entityType: 'continuity_plan',
        entityId: this.id(),
        view: 'detail',
        requirements: this.requirements(),
        title: p ? `${p.code} ${p.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
    // Contact links (`?tab=contacts`) land on the plan's contact list.
    effect(() => {
      const anchor = this.contactsAnchor();
      if (!anchor || this.scrolled) {
        return;
      }
      if (this.route.snapshot.queryParamMap.get('tab') === 'contacts') {
        this.scrolled = true;
        afterNextRender(
          () => {
            anchor.nativeElement.scrollIntoView?.({ block: 'start' });
            anchor.nativeElement.focus({ preventScroll: true });
          },
          { injector: this.injector },
        );
      }
    });
  }

  protected actionLabel(action: ControlledHeaderAction): string {
    return action === 'edit' ? 'continuity.common.edit' : `continuity.actions.${action}`;
  }

  protected targetsSet(p: PlanDetail): boolean {
    const t = p.recovery_targets;
    return hasTargets(t.rto_minutes, t.rpo_minutes, t.mtpd_minutes);
  }

  protected planGap(s: PlanIct): boolean {
    return this.ictGaps().some((g) => g.id === s.id);
  }

  protected activationKey(p: PlanDetail): string {
    return pluralKey('continuity.plans.lastActivated', p.activation_count ?? 1);
  }

  protected stepsIn(phase: string) {
    return (this.plan()?.steps ?? []).filter((s) => s.phase === phase);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected run(p: PlanDetail, action: ControlledHeaderAction): void {
    if (action === 'edit') {
      void this.router.navigate(this.editLink());
    } else {
      this.dialog()?.open(action);
    }
  }

  protected planExercise(p: PlanDetail): void {
    void this.router.navigate(['/continuity/exercises/new'], { queryParams: { plan: p.id } });
  }

  protected askAi(kind: 'summarisePlan' | 'nextStep'): void {
    this.ask.showWith(this.language.translate(`continuity.ai.prompts.${kind}`));
  }

  /** Register the incident as a deviation, prefilled and linked back (P4 flow). */
  protected registerIncident(p: PlanDetail): void {
    void this.flows.start('continuity_plan.to_deviation', 'continuity_plan', p.id);
  }

  /** Download the plan as a PDF and record that this version was distributed. */
  protected exportPdf(p: PlanDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api.exportPlanPdf(orgId, p.id, this.language.active()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveFile(blob, `${p.code.toLowerCase()}-${fileSlug(p.title)}-v${p.version}.pdf`);
        if (this.canWrite() && !p.distribution_current) {
          this.api.recordDistribution(orgId, p.id).subscribe({
            next: (updated) => this.plan.set(updated),
            error: () => undefined,
          });
        }
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  protected activate(p: PlanDetail, reason: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.activatePlan(orgId, p.id, { reason: reason.trim() || null }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.activateOpen.set(false);
        this.plan.set(updated);
        this.notifications.success('continuity.plans.activated', { code: p.code });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.activateOpen.set(false);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  protected act(p: PlanDetail, request: ControlledActionRequest): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.planAction(orgId, p.id, request.action, request.note).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.dialog()?.close();
        this.plan.set(updated);
        this.notifications.success('continuity.actionDone.' + request.action, { code: p.code });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.dialog()?.close();
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  protected remove(p: PlanDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deletePlan(orgId, p.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('continuity.common.deleted', { code: p.code });
        void this.router.navigate(['/continuity/plans']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, id: string, showLoading: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (showLoading && this.plan()?.id !== id) {
      this.state.set('loading');
    }
    this.request = this.api.getPlan(orgId, id).subscribe({
      next: (p) => {
        this.plan.set(p);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

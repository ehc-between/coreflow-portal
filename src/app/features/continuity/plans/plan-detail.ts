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
import { WatchButton } from '../../../shared/activity/watch-button';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { pluralKey } from '../../../shared/i18n/plural';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContinuityApi } from '../data/continuity-api';
import { badge } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { PLAN_TEXT_FIELDS, PlanDetail, PlanIct, STEP_PHASES } from '../data/continuity.models';
import { ContinuityContactsPanel } from '../shared/contacts-panel';
import {
  CONTINUITY_NAV,
  ContinuityLearnMore,
  fileSlug,
  recordCrumbs,
  saveFile,
} from '../shared/continuity-page';
import { ContinuityControlledPanel, ControlledActionRequest } from '../shared/controlled-panel';
import { ContinuityDuration } from '../shared/duration';
import { confirmedRequirementRefs } from '../shared/page-requirements';
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

/** Issues that mean an ICT service cannot recover within the plan's targets. */
const PLAN_GAP_ISSUES = ['plan_rto_gap', 'plan_rpo_gap'];

/**
 * A continuity plan (`/continuity/plans/:id`): how to use it in an incident
 * (activate, print or download, register the incident), the approval card, the
 * recovery targets inherited from the covered BIAs with the ICT services they rely on
 * (and whether each can recover in time), the steps, the plan's crisis contacts, the
 * plan sections, its exercises and recurring exercise schedule, and the shared record
 * tabs. On phones the steps and contacts come first. `?tab=contacts` scrolls to the
 * contact list.
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
    ContinuityControlledPanel,
    ContinuityDuration,
    ContinuityLearnMore,
    EntityTasks,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    PlanExerciseSchedule,
    PromptDialog,
    RecordDetailLayout,
    StatusBadge,
    Term,
    WatchButton,
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
          <app-record-detail-layout
            entityType="continuity_plan"
            [entityId]="p.id"
            [title]="p.title"
            [breadcrumbs]="crumbs()"
            [tabs]="tabs"
            [canEdit]="p.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            [requirementsPanel]="true"
            backLink="/continuity/plans"
            backLabelKey="continuity.plans.back"
          >
            <ng-container meta>
              <span class="font-mono">{{ p.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'continuity.planType.' + p.plan_type | transloco }}</span>
              <app-status-badge
                [meaning]="statusBadge(p).meaning"
                [value]="statusBadge(p).value"
                [labelKey]="'continuity.status.' + p.status"
              />
              @if (ictGaps().length) {
                <app-status-badge
                  meaning="compliance"
                  value="not_met"
                  labelKey="continuity.plans.ictGapBadge"
                />
              }
              @if (!p.last_exercised_on && p.status !== 'retired') {
                <app-status-badge
                  meaning="lifecycle"
                  value="due"
                  labelKey="continuity.plans.neverExercised"
                />
              }
            </ng-container>

            <app-watch-button secondary entityType="continuity_plan" [entityId]="p.id" />
            <app-button
              secondary
              variant="secondary"
              [loading]="exporting()"
              (click)="exportPdf(p)"
              data-testid="plan-pdf"
            >
              <app-icon name="documents" [size]="14" />
              {{ 'continuity.plans.exportPdf' | transloco }}
            </app-button>
            @if (p.can_edit) {
              <app-button primary (click)="edit(p)">
                {{ 'continuity.common.edit' | transloco }}
              </app-button>
            }
            <button appMenuItem overflow (click)="askSummary()">
              {{ 'continuity.ai.summarise' | transloco }}
            </button>
            @if (canWrite() && p.status !== 'retired') {
              <button appMenuItem overflow (click)="planExercise(p)">
                {{ 'continuity.plans.planExercise' | transloco }}
              </button>
            }
            @if (p.allowed_actions.includes('retire')) {
              <button appMenuItem overflow (click)="panel()?.open('retire')">
                {{ 'continuity.actions.retire' | transloco }}
              </button>
            }
            @if (p.can_delete) {
              <button appMenuItem overflow [danger]="true" (click)="confirmDelete.set(true)">
                {{ 'continuity.common.delete' | transloco }}
              </button>
            }

            <app-module-nav nav labelKey="continuity.nav.label" [items]="nav" />
            <app-help-strip
              help
              scope="continuity"
              page="planDetail"
              lesson="writing-a-plan"
              [subject]="p.title"
            />

            <div class="flex flex-col gap-5">
              <app-card class="max-md:-order-1" data-testid="plan-use">
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
                @if (canWrite() && p.status !== 'retired') {
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

              <div class="max-md:order-1">
                <app-continuity-controlled-panel
                  [record]="p"
                  [busy]="busy()"
                  [error]="actionError()"
                  (acted)="act(p, $event)"
                />
              </div>

              <app-card class="max-md:order-1">
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.plans.targets' | transloco }}
                </h2>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-3">
                  <div>
                    <dt class="text-meta text-fg-muted">
                      <app-term key="rto" scope="continuity">{{
                        'continuity.fields.rto' | transloco
                      }}</app-term>
                    </dt>
                    <dd class="text-card font-semibold text-fg">
                      <app-continuity-duration [minutes]="p.recovery_targets.rto_minutes" />
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-muted">
                      <app-term key="rpo" scope="continuity">{{
                        'continuity.fields.rpo' | transloco
                      }}</app-term>
                    </dt>
                    <dd class="text-card font-semibold text-fg">
                      <app-continuity-duration [minutes]="p.recovery_targets.rpo_minutes" />
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-muted">
                      <app-term key="mtpd" scope="continuity">{{
                        'continuity.fields.mtpd' | transloco
                      }}</app-term>
                    </dt>
                    <dd class="text-card font-semibold text-fg">
                      <app-continuity-duration [minutes]="p.recovery_targets.mtpd_minutes" />
                    </dd>
                  </div>
                </dl>
                <p class="mt-2 text-meta text-fg-subtle">
                  {{ 'continuity.plans.targetsHint' | transloco }}
                </p>

                @if (ictGaps().length) {
                  <div class="mt-3" data-testid="plan-ict-gap">
                    <app-alert tone="error">
                      {{
                        'continuity.plans.ictGapWarning' | transloco: { services: ictGapNames() }
                      }}
                    </app-alert>
                  </div>
                }

                <h3 class="mt-4 mb-2 text-ui font-semibold text-fg-muted">
                  {{ 'continuity.plans.ictServices' | transloco }}
                </h3>
                @if ((p.ict_dependencies ?? []).length === 0) {
                  <p class="text-ui text-fg-muted">{{ 'continuity.plans.noIct' | transloco }}</p>
                } @else {
                  <ul class="flex flex-col gap-1.5" data-testid="plan-ict">
                    @for (s of p.ict_dependencies; track s.id) {
                      <li class="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui">
                        <a
                          [routerLink]="['/continuity/ict-systems', s.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-muted">{{ s.code }}</span>
                          {{ s.name }}
                        </a>
                        <app-status-badge
                          meaning="compliance"
                          [value]="planGap(s) ? 'not_met' : readinessBadge(s).value"
                          [labelKey]="
                            planGap(s)
                              ? 'continuity.plans.ictCannotMeet'
                              : 'continuity.readiness.' + s.readiness
                          "
                        />
                        <span class="text-meta text-fg-subtle">
                          {{ 'continuity.plans.ictCan' | transloco }}
                          <app-continuity-duration [minutes]="s.achievable_rto_minutes" />
                          @if (s.last_test_recovery_minutes !== null) {
                            · {{ 'continuity.plans.ictTested' | transloco }}
                            <app-continuity-duration [minutes]="s.last_test_recovery_minutes" />
                          }
                        </span>
                      </li>
                    }
                  </ul>
                }

                <h3 class="mt-4 mb-2 text-ui font-semibold text-fg-muted">
                  {{ 'continuity.form.sections.coverage' | transloco }}
                </h3>
                @if (p.bias.length === 0) {
                  <p class="text-ui text-fg-muted">{{ 'continuity.plans.noBias' | transloco }}</p>
                } @else {
                  <ul class="flex flex-col gap-1.5" data-testid="plan-bias">
                    @for (b of p.bias; track b.id) {
                      <li class="flex flex-wrap items-center gap-2 text-ui">
                        <a
                          [routerLink]="['/continuity/bias', b.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-muted">{{ b.code }}</span>
                          {{ b.title }}
                        </a>
                        @if (b.criticality) {
                          <app-status-badge
                            meaning="severity"
                            [value]="b.criticality"
                            [labelKey]="'continuity.criticality.' + b.criticality"
                          />
                        }
                        <span class="text-meta text-fg-subtle">
                          {{ 'continuity.fields.rtoShort' | transloco }}
                          <app-continuity-duration [minutes]="b.rto_minutes" />
                        </span>
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-card class="max-md:-order-1">
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.form.sections.steps' | transloco }}
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

              <div id="contacts" #contacts tabindex="-1" class="outline-none max-md:-order-1">
                <app-continuity-contacts-panel
                  [planId]="p.id"
                  [canEdit]="canWrite() && p.status !== 'retired'"
                />
              </div>

              @for (f of textFields; track f) {
                @if (p[f]; as text) {
                  <app-card class="max-md:order-1">
                    <h2 class="mb-2 font-display text-card font-bold text-fg">
                      {{ 'continuity.planText.' + f | transloco }}
                    </h2>
                    <div
                      class="cf-prose text-body leading-relaxed text-fg"
                      [innerHTML]="text | appMarkdown"
                    ></div>
                  </app-card>
                }
              }

              <app-card class="max-md:order-1">
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.plans.exercises' | transloco }}
                </h2>
                <p class="mb-2 text-ui text-fg-muted">
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
                @if (p.exercises.length === 0) {
                  <p class="text-ui text-fg-muted">
                    {{ 'continuity.plans.noExercises' | transloco }}
                  </p>
                } @else {
                  <ul class="flex flex-col gap-1.5">
                    @for (e of p.exercises; track e.id) {
                      <li class="flex flex-wrap items-center gap-2 text-ui">
                        <a
                          [routerLink]="['/continuity/exercises', e.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-muted">{{ e.code }}</span>
                          {{ e.title }}
                        </a>
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
                          <span class="text-meta text-fg-subtle">{{ day | localDay }}</span>
                        }
                      </li>
                    }
                  </ul>
                }
                @if (canWrite() && p.status !== 'retired') {
                  <div class="mt-3">
                    <app-button size="sm" variant="secondary" (click)="planExercise(p)">
                      <app-icon name="plus" [size]="14" />
                      {{ 'continuity.plans.planExercise' | transloco }}
                    </app-button>
                  </div>
                }
              </app-card>

              <div class="max-md:order-1">
                <app-plan-exercise-schedule
                  [plan]="p"
                  [canEdit]="canWrite() && p.status !== 'retired'"
                  (scheduled)="reload()"
                />
              </div>

              <app-why-it-matters class="max-md:order-1" scope="continuity" page="planDetail" />
            </div>

            <app-continuity-learn-more
              aside-learn
              [lessons]="['exercising-plans', 'crisis-contacts']"
            />

            <div tasks>
              <app-entity-tasks
                entityType="continuity_plan"
                [entityId]="p.id"
                [canCreate]="p.can_edit"
                [entityLabel]="p.code + ' ' + p.title"
              />
            </div>
          </app-record-detail-layout>

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

  protected readonly panel = viewChild(ContinuityControlledPanel);
  private readonly contactsAnchor = viewChild<ElementRef<HTMLElement>>('contacts');

  protected readonly nav = CONTINUITY_NAV;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = PLAN_FIELD_LABELS;
  protected readonly textFields = PLAN_TEXT_FIELDS;
  protected readonly phases = STEP_PHASES;
  protected readonly statusBadge = (p: PlanDetail) => badge.controlled(p.status);
  protected readonly outcomeBadge = badge.outcome;
  protected readonly readinessBadge = (s: PlanIct) => badge.readiness(s.readiness);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly plan = signal<PlanDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly exporting = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly activateOpen = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));
  protected readonly canWrite = computed(() => this.permissions().includes('continuity:write'));
  protected readonly crumbs = computed(() => recordCrumbs('plans', this.plan()?.code ?? ''));

  /** ICT services that cannot recover within this plan's targets. */
  protected readonly ictGaps = computed(() =>
    (this.plan()?.ict_dependencies ?? []).filter((s) => this.planGap(s)),
  );
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

  protected planGap(s: PlanIct): boolean {
    return s.issues.some((i) => PLAN_GAP_ISSUES.includes(i));
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

  protected edit(p: PlanDetail): void {
    void this.router.navigate(['/continuity/plans', p.id, 'edit']);
  }

  protected planExercise(p: PlanDetail): void {
    void this.router.navigate(['/continuity/exercises/new'], { queryParams: { plan: p.id } });
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.summarisePlan'));
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
    this.actionError.set(null);
    this.api.planAction(orgId, p.id, request.action, request.note).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.panel()?.close();
        this.plan.set(updated);
        this.notifications.success('continuity.actionDone.' + request.action, { code: p.code });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.panel()?.close();
        this.actionError.set(continuityErrorKey(err));
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
    if (showLoading) {
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

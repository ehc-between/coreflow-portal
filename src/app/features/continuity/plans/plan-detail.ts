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
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachMe } from '../../../shared/guidance/teach-me';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import {
  controlledStatusTone,
  criticalityTone,
  exerciseStatusTone,
  outcomeTone,
} from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { PLAN_TEXT_FIELDS, PlanDetail, STEP_PHASES } from '../data/continuity.models';
import { ContinuityContactsPanel } from '../shared/contacts-panel';
import { ContinuityControlledPanel, ControlledActionRequest } from '../shared/controlled-panel';
import { ContinuityDuration } from '../shared/duration';
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

/**
 * A continuity plan (`/continuity/plans/:id`): the approval card, the recovery
 * targets inherited from the covered BIAs, the plan sections, the phased steps, the
 * plan's crisis contacts, its exercises and recurring exercise schedule, and the
 * shared record tabs. `?tab=contacts` scrolls to the contact list.
 */
@Component({
  selector: 'app-plan-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    MarkdownPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ContinuityContactsPanel,
    ContinuityControlledPanel,
    ContinuityDuration,
    EntityTasks,
    GuideIntro,
    HasPermissionDirective,
    Icon,
    LessonView,
    PlanExerciseSchedule,
    RecordDetailLayout,
    SupportsRequirements,
    TeachMe,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="mx-auto max-w-[1180px] px-4 pt-7 text-[14px] text-fg-muted sm:px-8">
          {{ 'continuity.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/continuity/plans"
            class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
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
            [tabs]="tabs"
            [canEdit]="p.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            backLink="/continuity/plans"
            backLabelKey="continuity.plans.back"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <span class="font-mono text-[12.5px] text-fg-muted">{{ p.code }}</span>
                <app-badge [tone]="statusTone(p.status)">
                  {{ 'continuity.status.' + p.status | transloco }}
                </app-badge>
                <app-badge>{{ 'continuity.planType.' + p.plan_type | transloco }}</app-badge>
                @if (!p.last_exercised_on) {
                  <app-badge tone="warn">{{
                    'continuity.plans.neverExercised' | transloco
                  }}</app-badge>
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ p.title }}
              </h1>
            </div>

            <ng-container actions>
              <app-watch-button entityType="continuity_plan" [entityId]="p.id" />
              <app-button variant="ghost" size="sm" (click)="askSummary()">
                <app-icon name="spark" [size]="14" />
                {{ 'continuity.ai.summarise' | transloco }}
              </app-button>
              @if (p.can_edit) {
                <a
                  [routerLink]="['/continuity/plans', p.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'continuity.common.edit' | transloco }}
                </a>
              }
              @if (canWrite() && p.status !== 'retired') {
                <a
                  routerLink="/continuity/exercises/new"
                  [queryParams]="{ plan: p.id }"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'continuity.plans.planExercise' | transloco }}
                </a>
              }
              @if (p.can_delete) {
                <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'continuity.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="continuity" page="planDetail" />

              <app-continuity-controlled-panel
                [record]="p"
                [busy]="busy()"
                [error]="actionError()"
                (acted)="act(p, $event)"
              />

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.plans.targets' | transloco }}
                </h2>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.rto' | transloco }}
                    </dt>
                    <dd class="text-[15px] font-semibold text-fg">
                      <app-continuity-duration [minutes]="p.recovery_targets.rto_minutes" />
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.rpo' | transloco }}
                    </dt>
                    <dd class="text-[15px] font-semibold text-fg">
                      <app-continuity-duration [minutes]="p.recovery_targets.rpo_minutes" />
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.mtpd' | transloco }}
                    </dt>
                    <dd class="text-[15px] font-semibold text-fg">
                      <app-continuity-duration [minutes]="p.recovery_targets.mtpd_minutes" />
                    </dd>
                  </div>
                </dl>
                <p class="mt-2 text-[12.5px] text-fg-subtle">
                  {{ 'continuity.plans.targetsHint' | transloco }}
                </p>
                <h3 class="mt-4 mb-2 text-[13px] font-semibold text-fg-muted">
                  {{ 'continuity.form.sections.coverage' | transloco }}
                </h3>
                @if (p.bias.length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'continuity.plans.noBias' | transloco }}
                  </p>
                } @else {
                  <ul class="flex flex-col gap-1.5" data-testid="plan-bias">
                    @for (b of p.bias; track b.id) {
                      <li class="flex flex-wrap items-center gap-2 text-[13px]">
                        <a
                          [routerLink]="['/continuity/bias', b.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-[12px] text-fg-muted">{{ b.code }}</span>
                          {{ b.title }}
                        </a>
                        @if (b.criticality) {
                          <app-badge [tone]="critTone(b.criticality)">
                            {{ 'continuity.criticality.' + b.criticality | transloco }}
                          </app-badge>
                        }
                        <span class="text-fg-subtle">
                          {{ 'continuity.fields.rtoShort' | transloco }}:
                          <app-continuity-duration [minutes]="b.rto_minutes" />
                        </span>
                      </li>
                    }
                  </ul>
                }
              </app-card>

              @for (f of textFields; track f) {
                @if (p[f]; as text) {
                  <app-card>
                    <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                      {{ 'continuity.planText.' + f | transloco }}
                    </h2>
                    <div
                      class="cf-prose text-[13.5px] leading-relaxed text-fg"
                      [innerHTML]="text | appMarkdown"
                    ></div>
                  </app-card>
                }
              }

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.form.sections.steps' | transloco }}
                </h2>
                @if (p.steps.length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'continuity.form.noSteps' | transloco }}
                  </p>
                } @else {
                  <div class="flex flex-col gap-4">
                    @for (phase of phases; track phase) {
                      @if (stepsIn(phase).length) {
                        <section>
                          <h3 class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                            {{ 'continuity.phase.' + phase | transloco }}
                          </h3>
                          <ol class="flex flex-col gap-1.5">
                            @for (s of stepsIn(phase); track $index) {
                              <li class="rounded-tile border border-border px-3 py-2 text-[13px]">
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
                <app-continuity-contacts-panel
                  [planId]="p.id"
                  [canEdit]="canWrite() && p.status !== 'retired'"
                />
              </div>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.plans.exercises' | transloco }}
                </h2>
                <p class="mb-2 text-[13px] text-fg-muted">
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
                  <p class="text-[13px] text-fg-muted">
                    {{ 'continuity.plans.noExercises' | transloco }}
                  </p>
                } @else {
                  <ul class="flex flex-col gap-1.5">
                    @for (e of p.exercises; track e.id) {
                      <li class="flex flex-wrap items-center gap-2 text-[13px]">
                        <a
                          [routerLink]="['/continuity/exercises', e.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-[12px] text-fg-muted">{{ e.code }}</span>
                          {{ e.title }}
                        </a>
                        <app-badge [tone]="exerciseTone(e.status)">
                          {{ 'continuity.exerciseStatus.' + e.status | transloco }}
                        </app-badge>
                        @if (e.outcome) {
                          <app-badge [tone]="outcomeTone(e.outcome)">
                            {{ 'continuity.outcome.' + e.outcome | transloco }}
                          </app-badge>
                        }
                        <span class="text-fg-subtle">
                          {{
                            (e.conducted_on ?? e.scheduled_on)
                              ? (e.conducted_on ?? e.scheduled_on | localDay)
                              : ''
                          }}
                        </span>
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-plan-exercise-schedule
                [plan]="p"
                [canEdit]="canWrite() && p.status !== 'retired'"
                (scheduled)="reload()"
              />

              <app-why-it-matters scope="continuity" page="planDetail" />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 font-display text-[14px] font-bold text-fg">
                  {{ 'continuity.common.learn' | transloco }}
                </h2>
                <div class="flex flex-col items-start gap-2">
                  <app-lesson scope="continuity" lesson="writing-a-plan" />
                  <app-lesson scope="continuity" lesson="exercising-plans" />
                  <app-teach-me topic="continuity.plan" [subject]="p.title" />
                </div>
              </app-card>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="continuity_plan" [entityId]="p.id" />
              </app-card>
            </ng-container>

            <div tasks>
              <app-entity-tasks
                entityType="continuity_plan"
                [entityId]="p.id"
                [canCreate]="p.can_edit"
                [entityLabel]="p.code + ' ' + p.title"
              />
            </div>
          </app-record-detail-layout>

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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);

  readonly id = input.required<string>();

  private readonly panel = viewChild(ContinuityControlledPanel);
  private readonly contactsAnchor = viewChild<ElementRef<HTMLElement>>('contacts');

  protected readonly tabs = TABS;
  protected readonly fieldLabels = PLAN_FIELD_LABELS;
  protected readonly textFields = PLAN_TEXT_FIELDS;
  protected readonly phases = STEP_PHASES;
  protected readonly statusTone = controlledStatusTone;
  protected readonly critTone = criticalityTone;
  protected readonly exerciseTone = exerciseStatusTone;
  protected readonly outcomeTone = outcomeTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly plan = signal<PlanDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));
  protected readonly canWrite = computed(() => this.permissions().includes('continuity:write'));

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

  protected stepsIn(phase: string) {
    return (this.plan()?.steps ?? []).filter((s) => s.phase === phase);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.summarisePlan'));
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

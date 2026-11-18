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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
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
import { ExerciseCompleteRequest, ExerciseDetail } from '../data/continuity.models';
import { CONTINUITY_NAV, ContinuityLearnMore, recordCrumbs } from '../shared/continuity-page';
import { ContinuityDuration } from '../shared/duration';
import { confirmedRequirementRefs } from '../shared/page-requirements';
import { ExerciseCompleteDialog } from './complete-dialog';
import { ExerciseFollowUps } from './follow-ups-panel';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key. */
export const EXERCISE_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'continuity.fields.code',
  status: 'continuity.fields.status',
  title: 'continuity.fields.title',
  exercise_type: 'continuity.fields.exerciseType',
  plan_id: 'continuity.fields.plan',
  ict_system_id: 'continuity.fields.ictSystem',
  owner_user_id: 'continuity.fields.owner',
  scheduled_on: 'continuity.fields.scheduledOn',
  scenario: 'continuity.fields.scenario',
  objectives: 'continuity.fields.objectives',
  participants: 'continuity.fields.participants',
  participant_user_ids: 'continuity.fields.participantMembers',
  target_recovery_minutes: 'continuity.fields.targetRecovery',
  success_criteria: 'continuity.fields.successCriteria',
  conducted_on: 'continuity.fields.conductedOn',
  outcome: 'continuity.fields.outcome',
  achieved_recovery_minutes: 'continuity.fields.achievedRecovery',
  results: 'continuity.fields.results',
  lessons_learned: 'continuity.fields.lessonsLearned',
};

/**
 * An exercise or test (`/continuity/exercises/:id`): what is exercised and who takes
 * part, the scenario, objectives and success criteria, the result (outcome and the
 * recovery time achieved against the target, flagged when they disagree), the lessons
 * learned and their follow-up (tasks, deviations, risks), plus the shared record tabs.
 */
@Component({
  selector: 'app-exercise-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ContinuityDuration,
    ContinuityLearnMore,
    ExerciseCompleteDialog,
    ExerciseFollowUps,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
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
            routerLink="/continuity/exercises"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'continuity.exercises.back' | transloco }}
          </a>
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (exercise(); as e) {
          <app-record-detail-layout
            entityType="continuity_exercise"
            [entityId]="e.id"
            [title]="e.title"
            [breadcrumbs]="crumbs()"
            [tabs]="tabs"
            [canEdit]="e.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            [requirementsPanel]="true"
            backLink="/continuity/exercises"
            backLabelKey="continuity.exercises.back"
          >
            <ng-container meta>
              <span class="font-mono">{{ e.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'continuity.exerciseType.' + e.exercise_type | transloco }}</span>
              @if (e.outcome) {
                <app-status-badge
                  [meaning]="outcomeBadge(e).meaning"
                  [value]="outcomeBadge(e).value"
                  [labelKey]="'continuity.outcome.' + e.outcome"
                />
              } @else {
                <app-status-badge
                  meaning="lifecycle"
                  [value]="e.status"
                  [labelKey]="'continuity.exerciseStatus.' + e.status"
                />
              }
              @if (e.overdue) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="continuity.common.overdue"
                />
              }
            </ng-container>

            <app-watch-button secondary entityType="continuity_exercise" [entityId]="e.id" />
            @if (allowed(e, 'complete') && e.can_edit) {
              <app-button secondary variant="secondary" (click)="edit(e)">
                {{ 'continuity.common.edit' | transloco }}
              </app-button>
            }
            @if (allowed(e, 'complete')) {
              <app-button primary (click)="openComplete()" data-testid="exercise-complete">
                {{ 'continuity.exercises.complete' | transloco }}
              </app-button>
            } @else if (e.can_edit && e.status !== 'cancelled') {
              <app-button primary (click)="edit(e)">
                {{ 'continuity.common.edit' | transloco }}
              </app-button>
            }
            <button appMenuItem overflow (click)="askSummary()">
              {{ 'continuity.ai.summarise' | transloco }}
            </button>
            @if (allowed(e, 'reopen')) {
              <button appMenuItem overflow [disabled]="busy()" (click)="reopen(e)">
                {{ 'continuity.exercises.reopen' | transloco }}
              </button>
            }
            @if (allowed(e, 'cancel')) {
              <button appMenuItem overflow (click)="cancelOpen.set(true)">
                {{ 'continuity.exercises.cancel' | transloco }}
              </button>
            }
            @if (e.can_delete) {
              <button appMenuItem overflow [danger]="true" (click)="confirmDelete.set(true)">
                {{ 'continuity.common.delete' | transloco }}
              </button>
            }

            <app-module-nav nav labelKey="continuity.nav.label" [items]="nav" />
            <app-help-strip
              help
              scope="continuity"
              page="exerciseDetail"
              lesson="exercising-plans"
              [subject]="e.title"
            />

            <div class="flex flex-col gap-5">
              @if (actionError(); as key) {
                <app-alert>{{ key | transloco }}</app-alert>
              }

              @if (e.status === 'completed') {
                <app-card>
                  <h2 class="mb-3 font-display text-card font-bold text-fg">
                    {{ 'continuity.exercises.results' | transloco }}
                  </h2>
                  @if (outcomeConflict(e)) {
                    <div class="mb-3" data-testid="outcome-conflict">
                      <app-alert>{{
                        'continuity.exercises.outcomeConflict' | transloco
                      }}</app-alert>
                    </div>
                  }
                  <dl
                    class="grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-3"
                    data-testid="exercise-results"
                  >
                    <div>
                      <dt class="text-meta text-fg-muted">
                        {{ 'continuity.fields.conductedOn' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{
                          e.conducted_on
                            ? (e.conducted_on | localDay)
                            : ('continuity.common.notSet' | transloco)
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-meta text-fg-muted">
                        {{ 'continuity.fields.achievedRecovery' | transloco }}
                      </dt>
                      <dd
                        class="text-card font-semibold"
                        [class]="e.rto_met === false ? 'text-fail-ink' : 'text-fg'"
                      >
                        <app-continuity-duration [minutes]="e.achieved_recovery_minutes" />
                      </dd>
                    </div>
                    <div>
                      <dt class="text-meta text-fg-muted">
                        <app-term key="rto" scope="continuity">{{
                          'continuity.exercises.targetRto' | transloco
                        }}</app-term>
                      </dt>
                      <dd class="flex flex-wrap items-center gap-2 text-fg">
                        <span class="text-card font-semibold"
                          ><app-continuity-duration [minutes]="e.target_rto_minutes"
                        /></span>
                        @if (e.rto_met === true) {
                          <app-status-badge
                            meaning="compliance"
                            value="met"
                            labelKey="continuity.exercises.rtoMet"
                          />
                        } @else if (e.rto_met === false) {
                          <app-status-badge
                            meaning="compliance"
                            value="not_met"
                            labelKey="continuity.exercises.rtoMissed"
                          />
                        }
                      </dd>
                      @if (e.target_source) {
                        <dd class="mt-0.5 text-meta text-fg-subtle">
                          {{ 'continuity.exercises.targetSource.' + e.target_source | transloco }}
                        </dd>
                      }
                    </div>
                    @if (e.results) {
                      <div class="sm:col-span-3">
                        <dt class="text-meta text-fg-muted">
                          {{ 'continuity.fields.results' | transloco }}
                        </dt>
                        <dd class="whitespace-pre-line text-fg">{{ e.results }}</dd>
                      </div>
                    }
                    <div class="sm:col-span-3">
                      <dt class="text-meta text-fg-muted">
                        {{ 'continuity.fields.lessonsLearned' | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg">
                        {{ e.lessons_learned || ('continuity.exercises.noLessons' | transloco) }}
                      </dd>
                    </div>
                    @if (e.completed_at) {
                      <div class="text-meta text-fg-subtle sm:col-span-3">
                        {{
                          'continuity.exercises.completedBy'
                            | transloco
                              : {
                                  date: (e.completed_at | localDay),
                                  name:
                                    e.completed_by?.name ||
                                    ('continuity.common.unknownPerson' | transloco),
                                }
                        }}
                      </div>
                    }
                  </dl>
                </app-card>

                <app-exercise-follow-ups
                  [exerciseId]="e.id"
                  [tasks]="e.actions"
                  [canAdd]="e.can_edit"
                  [canFlow]="e.can_edit"
                  [nudge]="!!e.lessons_need_follow_up"
                  [linkedCount]="linkedFollowUps(e)"
                  (added)="reload()"
                />
              }

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.form.sections.exercise' | transloco }}
                </h2>
                <app-field-list>
                  <app-field-item labelKey="continuity.fields.plan">
                    @if (e.plan; as plan) {
                      <a
                        [routerLink]="['/continuity/plans', plan.id]"
                        class="text-accent hover:underline"
                      >
                        <span class="font-mono text-meta">{{ plan.code }}</span> {{ plan.title }}
                      </a>
                    }
                  </app-field-item>
                  <app-field-item labelKey="continuity.fields.ictSystem">
                    @if (e.ict_system; as system) {
                      <a
                        [routerLink]="['/continuity/ict-systems', system.id]"
                        class="text-accent hover:underline"
                      >
                        <span class="font-mono text-meta">{{ system.code }}</span> {{ system.name }}
                      </a>
                    }
                  </app-field-item>
                  <app-field-item labelKey="continuity.fields.owner" [value]="e.owner?.name" />
                  <app-field-item labelKey="continuity.fields.scheduledOn">
                    @if (e.scheduled_on) {
                      <span [class.text-warn-ink]="e.overdue">{{ e.scheduled_on | localDay }}</span>
                    }
                  </app-field-item>
                  @if (e.status !== 'completed') {
                    <app-field-item labelKey="continuity.fields.targetRecovery">
                      @if (e.target_rto_minutes !== null) {
                        <app-continuity-duration [minutes]="e.target_rto_minutes" />
                        @if (e.target_source) {
                          <span class="block text-meta text-fg-subtle">{{
                            'continuity.exercises.targetSource.' + e.target_source | transloco
                          }}</span>
                        }
                      }
                    </app-field-item>
                  }
                  <app-field-item
                    labelKey="continuity.fields.participants"
                    [wide]="true"
                    empty="none"
                  >
                    @if ((e.participant_members ?? []).length || e.participants) {
                      <span class="flex flex-wrap gap-1.5">
                        @for (m of e.participant_members ?? []; track m.id) {
                          <span
                            class="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-meta text-fg"
                            >{{ m.name || ('continuity.common.unknownPerson' | transloco) }}</span
                          >
                        }
                      </span>
                      @if (e.participants) {
                        <span class="mt-1 block text-ui text-fg-muted">{{ e.participants }}</span>
                      }
                    }
                  </app-field-item>
                  @for (field of textFields; track field.key) {
                    @if (e[field.key]; as text) {
                      <app-field-item
                        [labelKey]="field.label"
                        [value]="text"
                        [wide]="true"
                        [multiline]="true"
                      />
                    }
                  }
                </app-field-list>
              </app-card>

              <app-why-it-matters scope="continuity" page="exerciseDetail" />
            </div>

            <app-continuity-learn-more
              aside-learn
              [lessons]="['writing-a-plan', 'ict-readiness']"
            />
          </app-record-detail-layout>

          <app-exercise-complete-dialog
            [open]="completeOpen()"
            [busy]="busy()"
            [error]="completeError()"
            [targetRto]="e.target_rto_minutes"
            [successCriteria]="e.success_criteria ?? null"
            (confirmed)="complete(e, $event)"
            (cancelled)="completeOpen.set(false)"
          />

          <app-prompt-dialog
            [open]="cancelOpen()"
            [title]="'continuity.exercises.cancelTitle' | transloco"
            [message]="'continuity.exercises.cancelMessage' | transloco"
            [label]="'continuity.control.note' | transloco"
            [confirmLabel]="'continuity.exercises.cancel' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="danger"
            [busy]="busy()"
            (confirmed)="cancel(e, $event)"
            (cancelled)="cancelOpen.set(false)"
          />

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'continuity.exercises.deleteTitle' | transloco"
            [message]="
              'continuity.common.deleteMessage' | transloco: { code: e.code, title: e.title }
            "
            [confirmLabel]="'continuity.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(e)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class ExerciseDetailPage {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly nav = CONTINUITY_NAV;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = EXERCISE_FIELD_LABELS;
  protected readonly outcomeBadge = (e: ExerciseDetail) => badge.outcome(e.outcome);
  protected readonly textFields = [
    { key: 'scenario', label: 'continuity.fields.scenario' },
    { key: 'objectives', label: 'continuity.fields.objectives' },
    { key: 'success_criteria', label: 'continuity.fields.successCriteria' },
  ] as const;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly exercise = signal<ExerciseDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly completeOpen = signal(false);
  protected readonly completeError = signal<string | null>(null);
  protected readonly cancelOpen = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);

  protected readonly canAudit = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('audit:read'),
  );
  protected readonly crumbs = computed(() =>
    recordCrumbs('exercises', this.exercise()?.code ?? ''),
  );

  /** Requirements the record documents, for the assistant's page context. */
  private readonly requirements = confirmedRequirementRefs('continuity_exercise', () => this.id());

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const e = this.exercise();
      return {
        module: 'continuity',
        entityType: 'continuity_exercise',
        entityId: this.id(),
        view: 'detail',
        requirements: this.requirements(),
        title: e ? `${e.code} ${e.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
  }

  protected allowed(e: ExerciseDetail, action: string): boolean {
    return e.allowed_actions.includes(action);
  }

  /** Marked successful although the recovery target was missed. */
  protected outcomeConflict(e: ExerciseDetail): boolean {
    return e.outcome === 'successful' && e.rto_met === false;
  }

  /** Follow-ups that are linked records (deviations, risks…), not tasks listed here. */
  protected linkedFollowUps(e: ExerciseDetail): number {
    return Math.max((e.follow_up_count ?? 0) - e.actions.length, 0);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected edit(e: ExerciseDetail): void {
    void this.router.navigate(['/continuity/exercises', e.id, 'edit']);
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.summariseExercise'));
  }

  protected openComplete(): void {
    this.completeError.set(null);
    this.completeOpen.set(true);
  }

  protected complete(e: ExerciseDetail, body: ExerciseCompleteRequest): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.completeError.set(null);
    this.api.completeExercise(orgId, e.id, body).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.completeOpen.set(false);
        this.exercise.set(updated);
        this.notifications.success('continuity.exercises.done.complete', { code: e.code });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.completeError.set(continuityErrorKey(err));
      },
    });
  }

  protected cancel(e: ExerciseDetail, note: string): void {
    this.runAction(e, 'cancel', note || null, () => this.cancelOpen.set(false));
  }

  protected reopen(e: ExerciseDetail): void {
    this.runAction(e, 'reopen', null);
  }

  protected remove(e: ExerciseDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteExercise(orgId, e.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('continuity.common.deleted', { code: e.code });
        void this.router.navigate(['/continuity/exercises']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  private runAction(
    e: ExerciseDetail,
    action: 'cancel' | 'reopen',
    note: string | null,
    done?: () => void,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    this.api.exerciseAction(orgId, e.id, action, note).subscribe({
      next: (updated) => {
        this.busy.set(false);
        done?.();
        this.exercise.set(updated);
        this.notifications.success(`continuity.exercises.done.${action}`, { code: e.code });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        done?.();
        this.actionError.set(continuityErrorKey(err));
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
    this.request = this.api.getExercise(orgId, id).subscribe({
      next: (e) => {
        this.exercise.set(e);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

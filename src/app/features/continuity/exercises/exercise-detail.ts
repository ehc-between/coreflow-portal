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
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { ContinuityApi } from '../data/continuity-api';
import { exerciseStatusTone, outcomeTone } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { ExerciseCompleteRequest, ExerciseDetail } from '../data/continuity.models';
import { ContinuityDuration } from '../shared/duration';
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
  conducted_on: 'continuity.fields.conductedOn',
  outcome: 'continuity.fields.outcome',
  achieved_recovery_minutes: 'continuity.fields.achievedRecovery',
  results: 'continuity.fields.results',
  lessons_learned: 'continuity.fields.lessonsLearned',
};

/**
 * An exercise or test (`/continuity/exercises/:id`): what is exercised, the
 * scenario and objectives, the result (outcome, achieved recovery time against the
 * target RTO, lessons learned), the follow-up actions, and complete / cancel /
 * reopen actions, plus the shared record tabs.
 */
@Component({
  selector: 'app-exercise-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ContinuityDuration,
    ExerciseCompleteDialog,
    ExerciseFollowUps,
    GuideIntro,
    HasPermissionDirective,
    Icon,
    LessonView,
    PromptDialog,
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
            routerLink="/continuity/exercises"
            class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
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
            [tabs]="tabs"
            [canEdit]="e.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            backLink="/continuity/exercises"
            backLabelKey="continuity.exercises.back"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <span class="font-mono text-[12.5px] text-fg-muted">{{ e.code }}</span>
                <app-badge [tone]="statusTone(e.status)">
                  {{ 'continuity.exerciseStatus.' + e.status | transloco }}
                </app-badge>
                <app-badge>{{
                  'continuity.exerciseType.' + e.exercise_type | transloco
                }}</app-badge>
                @if (e.outcome) {
                  <app-badge [tone]="resultTone(e.outcome)">
                    {{ 'continuity.outcome.' + e.outcome | transloco }}
                  </app-badge>
                }
                @if (e.overdue) {
                  <app-badge tone="fail">{{ 'continuity.common.overdue' | transloco }}</app-badge>
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ e.title }}
              </h1>
            </div>

            <ng-container actions>
              <app-watch-button entityType="continuity_exercise" [entityId]="e.id" />
              <app-button variant="ghost" size="sm" (click)="askSummary()">
                <app-icon name="spark" [size]="14" />
                {{ 'continuity.ai.summarise' | transloco }}
              </app-button>
              @if (e.can_edit && e.status !== 'cancelled') {
                <a
                  [routerLink]="['/continuity/exercises', e.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'continuity.common.edit' | transloco }}
                </a>
              }
              @if (allowed(e, 'complete')) {
                <app-button size="sm" (click)="openComplete()">
                  {{ 'continuity.exercises.complete' | transloco }}
                </app-button>
              }
              @if (allowed(e, 'cancel')) {
                <app-button size="sm" variant="secondary" (click)="cancelOpen.set(true)">
                  {{ 'continuity.exercises.cancel' | transloco }}
                </app-button>
              }
              @if (allowed(e, 'reopen')) {
                <app-button size="sm" variant="secondary" [disabled]="busy()" (click)="reopen(e)">
                  {{ 'continuity.exercises.reopen' | transloco }}
                </app-button>
              }
              @if (e.can_delete) {
                <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'continuity.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="continuity" page="exerciseDetail" />

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.form.sections.exercise' | transloco }}
                </h2>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.plan' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (e.plan; as plan) {
                        <a
                          [routerLink]="['/continuity/plans', plan.id]"
                          class="text-accent hover:underline"
                        >
                          {{ plan.code }} {{ plan.title }}
                        </a>
                      } @else {
                        –
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.ictSystem' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (e.ict_system; as system) {
                        <a
                          [routerLink]="['/continuity/ict-systems', system.id]"
                          class="text-accent hover:underline"
                        >
                          {{ system.code }} {{ system.name }}
                        </a>
                      } @else {
                        –
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ e.owner?.name ?? ('continuity.common.nobody' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.scheduledOn' | transloco }}
                    </dt>
                    <dd class="text-fg" [class.text-fail]="e.overdue">
                      {{
                        e.scheduled_on
                          ? (e.scheduled_on | localDay)
                          : ('continuity.exercises.notScheduled' | transloco)
                      }}
                    </dd>
                  </div>
                  @if (e.participants) {
                    <div class="sm:col-span-2">
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'continuity.fields.participants' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ e.participants }}</dd>
                    </div>
                  }
                  @if (e.scenario) {
                    <div class="sm:col-span-2">
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'continuity.fields.scenario' | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg">{{ e.scenario }}</dd>
                    </div>
                  }
                  @if (e.objectives) {
                    <div class="sm:col-span-2">
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'continuity.fields.objectives' | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg">{{ e.objectives }}</dd>
                    </div>
                  }
                </dl>
              </app-card>

              @if (e.status === 'completed') {
                <app-card>
                  <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                    {{ 'continuity.exercises.results' | transloco }}
                  </h2>
                  <dl
                    class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3"
                    data-testid="exercise-results"
                  >
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'continuity.fields.conductedOn' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{ e.conducted_on ? (e.conducted_on | localDay) : '–' }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'continuity.fields.achievedRecovery' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        <app-continuity-duration [minutes]="e.achieved_recovery_minutes" />
                      </dd>
                    </div>
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'continuity.exercises.targetRto' | transloco }}
                      </dt>
                      <dd class="flex flex-wrap items-center gap-2 text-fg">
                        <app-continuity-duration [minutes]="e.target_rto_minutes" />
                        @if (e.rto_met === true) {
                          <app-badge tone="pass">{{
                            'continuity.exercises.rtoMet' | transloco
                          }}</app-badge>
                        } @else if (e.rto_met === false) {
                          <app-badge tone="fail">{{
                            'continuity.exercises.rtoMissed' | transloco
                          }}</app-badge>
                        }
                      </dd>
                    </div>
                    @if (e.results) {
                      <div class="sm:col-span-3">
                        <dt class="text-[12px] text-fg-muted">
                          {{ 'continuity.fields.results' | transloco }}
                        </dt>
                        <dd class="whitespace-pre-line text-fg">{{ e.results }}</dd>
                      </div>
                    }
                    <div class="sm:col-span-3">
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'continuity.fields.lessonsLearned' | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg">
                        {{ e.lessons_learned || ('continuity.exercises.noLessons' | transloco) }}
                      </dd>
                    </div>
                    @if (e.completed_at) {
                      <div class="sm:col-span-3 text-[12px] text-fg-subtle">
                        {{
                          'continuity.exercises.completedBy'
                            | transloco
                              : {
                                  date: (e.completed_at | localDay),
                                  name: e.completed_by?.name ?? '–',
                                }
                        }}
                      </div>
                    }
                  </dl>
                </app-card>
              }

              <app-exercise-follow-ups
                [exerciseId]="e.id"
                [tasks]="e.actions"
                [canAdd]="e.can_edit && e.status !== 'cancelled'"
                (added)="reload()"
              />

              @if (actionError(); as key) {
                <app-alert>{{ key | transloco }}</app-alert>
              }

              <app-why-it-matters scope="continuity" page="exerciseDetail" />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 font-display text-[14px] font-bold text-fg">
                  {{ 'continuity.common.learn' | transloco }}
                </h2>
                <div class="flex flex-col items-start gap-2">
                  <app-lesson scope="continuity" lesson="exercising-plans" />
                  <app-teach-me topic="continuity.exercise" [subject]="e.title" />
                </div>
              </app-card>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="continuity_exercise" [entityId]="e.id" />
              </app-card>
            </ng-container>
          </app-record-detail-layout>

          <app-exercise-complete-dialog
            [open]="completeOpen()"
            [busy]="busy()"
            [error]="completeError()"
            [targetRto]="e.target_rto_minutes"
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

  protected readonly tabs = TABS;
  protected readonly fieldLabels = EXERCISE_FIELD_LABELS;
  protected readonly statusTone = exerciseStatusTone;
  protected readonly resultTone = outcomeTone;

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

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
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

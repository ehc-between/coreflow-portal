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
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  effectivenessTone,
  recordValidityTone,
  trainingErrorKey,
} from '../data/training-display';
import { EFFECTIVENESS, Effectiveness, TrainingRecord } from '../data/training.models';
import { RatingInput } from '../shared/rating-input';
import { TrainingNav } from '../training-nav';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments', 'attachments'];

/**
 * `/training/records/:id`: a completion record (evidence of competence) with the
 * certificate, the learner's feedback and the training manager's effectiveness
 * evaluation.
 */
@Component({
  selector: 'app-record-detail',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    AskAbout,
    FieldHelp,
    GuideIntro,
    LessonView,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    RatingInput,
    TrainingNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-nav />
    @if (record(); as r) {
      <app-record-detail-layout
        entityType="training_record"
        [entityId]="r.id"
        [tabs]="tabs"
        [canEdit]="access.canManage()"
        [includeAudit]="access.canSeeAudit()"
        backLink="/training/records"
        backLabelKey="training.records.back"
      >
        <div header>
          <div class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
            <span class="font-mono">{{ r.course.code }}</span>
            <app-badge [tone]="validityTone(r)">
              @if (!r.passed) {
                {{ 'training.records.notPassed' | transloco }}
              } @else if (r.expired) {
                {{ 'training.records.expired' | transloco }}
              } @else {
                {{ 'training.records.valid' | transloco }}
              }
            </app-badge>
            <span>{{ 'training.method.' + r.method | transloco }}</span>
          </div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{
              'training.recordDetail.title'
                | transloco: { course: r.course.title, person: r.user.name }
            }}
          </h1>
        </div>

        <ng-container actions>
          @if (r.certificate_no && r.passed) {
            <a [routerLink]="['/training/records', r.id, 'certificate']">
              <app-button data-testid="record-certificate">
                {{ 'training.recordDetail.certificate' | transloco }}
              </app-button>
            </a>
          }
          @if (access.canManage()) {
            <app-button variant="ghost" (click)="deleteOpen.set(true)">
              <app-icon name="trash" [size]="15" />
              <span class="sr-only sm:not-sr-only">{{ 'training.common.delete' | transloco }}</span>
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-5">
          <app-guide-intro scope="training" page="record" />
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.course' | transloco }}</dt>
              <dd>
                <a
                  [routerLink]="['/training/courses', r.course.id]"
                  class="font-medium text-accent hover:underline"
                >
                  {{ r.course.title }}
                </a>
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.version' | transloco }}</dt>
              <dd class="font-medium text-fg">{{ r.course_version }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.person' | transloco }}</dt>
              <dd class="font-medium text-fg">{{ r.user.name }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.completed' | transloco }}</dt>
              <dd class="font-medium text-fg">{{ r.completed_at | localDay }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.expires' | transloco }}</dt>
              <dd class="font-medium" [class.text-fail]="r.expired" [class.text-fg]="!r.expired">
                {{
                  r.expires_at
                    ? (r.expires_at | localDay)
                    : ('training.records.noExpiry' | transloco)
                }}
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.score' | transloco }}</dt>
              <dd class="font-medium text-fg">
                {{
                  r.score !== null
                    ? ('training.stats.pct' | transloco: { value: r.score })
                    : ('training.common.none' | transloco)
                }}
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.certificate' | transloco }}</dt>
              <dd class="font-mono text-[12.5px] text-fg">{{ r.certificate_no ?? '–' }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.recordedBy' | transloco }}</dt>
              <dd class="font-medium text-fg">{{ r.recorded_by?.name ?? r.user.name }}</dd>
            </div>
            @if (r.acknowledged_revision_id) {
              <div>
                <dt class="text-fg-muted">{{ 'training.fields.acknowledged' | transloco }}</dt>
                <dd class="font-medium text-fg">
                  {{ 'training.recordDetail.acknowledged' | transloco }}
                </dd>
              </div>
            }
            @if (r.notes) {
              <div class="col-span-2 sm:col-span-3">
                <dt class="text-fg-muted">{{ 'training.fields.notes' | transloco }}</dt>
                <dd class="whitespace-pre-line text-fg">{{ r.notes }}</dd>
              </div>
            }
          </dl>

          <app-card>
            <h2 class="mb-2 text-[15px] font-semibold text-fg">
              {{ 'training.recordDetail.feedbackTitle' | transloco }}
            </h2>
            @if (r.feedback_rating) {
              <p class="text-[13px] text-fg" data-testid="record-feedback">
                {{ 'training.recordDetail.rating' | transloco: { rating: r.feedback_rating } }}
              </p>
              @if (r.feedback_comment) {
                <p class="mt-1 text-[13px] whitespace-pre-line text-fg-muted">
                  {{ r.feedback_comment }}
                </p>
              }
            } @else if (isMine()) {
              <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); sendFeedback()">
                <app-training-rating
                  [label]="'training.player.rating' | transloco"
                  [value]="rating()"
                  (valueChange)="rating.set($event)"
                />
                <app-form-field
                  [label]="'training.player.comment' | transloco"
                  inputId="feedback-comment"
                >
                  <textarea
                    id="feedback-comment"
                    name="comment"
                    rows="2"
                    maxlength="2000"
                    [(ngModel)]="feedbackComment"
                  ></textarea>
                </app-form-field>
                <div>
                  <app-button type="submit" size="sm" [disabled]="!rating()" [loading]="busy()">
                    {{ 'training.recordDetail.sendFeedback' | transloco }}
                  </app-button>
                </div>
              </form>
            } @else {
              <p class="text-[13px] text-fg-muted">
                {{ 'training.recordDetail.noFeedback' | transloco }}
              </p>
            }
          </app-card>

          <app-card>
            <h2 class="mb-2 flex items-center gap-1 text-[15px] font-semibold text-fg">
              {{ 'training.recordDetail.effectivenessTitle' | transloco }}
              <app-ask-about
                field="effectiveness"
                [prompt]="'training.ask.effectiveness' | transloco"
              />
            </h2>
            @if (r.effectiveness) {
              <p class="flex flex-wrap items-center gap-2 text-[13px] text-fg">
                <app-badge [tone]="effTone(r.effectiveness)">
                  {{ 'training.effectiveness.' + r.effectiveness | transloco }}
                </app-badge>
                @if (r.evaluated_by) {
                  <span class="text-fg-muted">
                    {{
                      'training.recordDetail.evaluatedBy'
                        | transloco
                          : { name: r.evaluated_by.name, date: (r.evaluated_at | localDate) }
                    }}
                  </span>
                }
              </p>
              @if (r.effectiveness_notes) {
                <p class="mt-1 text-[13px] whitespace-pre-line text-fg-muted">
                  {{ r.effectiveness_notes }}
                </p>
              }
            } @else if (!access.canManage()) {
              <p class="text-[13px] text-fg-muted">
                {{ 'training.recordDetail.notEvaluated' | transloco }}
              </p>
            }
            @if (access.canManage()) {
              <form
                class="mt-3 flex flex-col gap-3"
                (submit)="$event.preventDefault(); evaluate()"
                data-testid="evaluation-form"
              >
                <fieldset>
                  <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                    {{ 'training.recordDetail.evaluate' | transloco }}
                  </legend>
                  <div class="flex flex-wrap gap-3">
                    @for (e of effectivenessOptions; track e) {
                      <label class="flex items-center gap-1.5 text-[13px] text-fg">
                        <input
                          type="radio"
                          class="accent-accent"
                          name="effectiveness"
                          [value]="e"
                          [(ngModel)]="effectiveness"
                        />
                        {{ 'training.effectiveness.' + e | transloco }}
                      </label>
                    }
                  </div>
                </fieldset>
                <app-field-help scope="training" page="record" field="effectiveness" />
                <app-form-field
                  [label]="'training.fields.notes' | transloco"
                  inputId="evaluation-notes"
                >
                  <textarea
                    id="evaluation-notes"
                    name="notes"
                    rows="2"
                    maxlength="5000"
                    [(ngModel)]="evaluationNotes"
                  ></textarea>
                </app-form-field>
                <div>
                  <app-button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    [disabled]="!effectiveness"
                    [loading]="busy()"
                  >
                    {{ 'training.recordDetail.saveEvaluation' | transloco }}
                  </app-button>
                </div>
              </form>
            }
          </app-card>
        </div>

        <ng-container aside>
          <app-why-it-matters scope="training" page="record" />
          <app-supports-requirements entityType="training_record" [entityId]="r.id" />
          <app-card>
            <h2 class="mb-2 text-[14px] font-semibold text-fg">
              {{ 'training.recordDetail.lessonTitle' | transloco }}
            </h2>
            @if (lessonOpen()) {
              <app-lesson scope="training" lesson="evaluating-effectiveness" />
            } @else {
              <app-button size="sm" variant="secondary" (click)="lessonOpen.set(true)">
                {{ 'training.recordDetail.lessonStart' | transloco }}
              </app-button>
            }
          </app-card>
        </ng-container>
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'training.recordDetail.deleteTitle' | transloco"
        [message]="'training.recordDetail.deleteMessage' | transloco"
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
export class RecordDetail {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly access = inject(TrainingAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly effectivenessOptions = EFFECTIVENESS;
  protected readonly record = signal<TrainingRecord | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly lessonOpen = signal(false);
  protected readonly rating = signal<number | null>(null);
  protected feedbackComment = '';
  protected effectiveness: Effectiveness | '' = '';
  protected evaluationNotes = '';

  protected readonly isMine = computed(() => this.record()?.user.id === this.auth.user()?.id);

  private sub = new Subscription();

  constructor() {
    providePageContext(() => {
      const r = this.record();
      return {
        module: TRAINING_MODULE,
        entityType: 'training_record',
        entityId: this.id(),
        view: 'detail',
        title: r ? `${r.course.code} ${r.course.title} · ${r.user.name}` : null,
      };
    });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected validityTone(r: TrainingRecord) {
    return recordValidityTone(r);
  }

  protected effTone(value: string) {
    return effectivenessTone(value);
  }

  protected sendFeedback(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    const rating = this.rating();
    if (!orgId || !r || !rating) {
      return;
    }
    this.run(
      this.api.feedback(orgId, r.id, rating, this.feedbackComment),
      'training.recordDetail.feedbackSaved',
    );
  }

  protected evaluate(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r || !this.effectiveness) {
      return;
    }
    this.run(
      this.api.evaluate(orgId, r.id, this.effectiveness, this.evaluationNotes),
      'training.recordDetail.evaluationSaved',
    );
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r) {
      return;
    }
    this.busy.set(true);
    this.api.deleteRecord(orgId, r.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('training.recordDetail.deleted');
        void this.router.navigate(['/training/records']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  private run(call: ReturnType<TrainingApi['feedback']>, toast: string): void {
    this.busy.set(true);
    this.error.set(null);
    call.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.setRecord(updated);
        this.notifications.success(toast);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  private setRecord(r: TrainingRecord): void {
    this.record.set(r);
    this.effectiveness = r.effectiveness ?? '';
    this.evaluationNotes = r.effectiveness_notes ?? '';
  }

  private load(orgId: string | null, id: string): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.notFound.set(false);
    this.sub.add(
      this.api.getRecord(orgId, id).subscribe({
        next: (r) => this.setRecord(r),
        error: () => {
          this.record.set(null);
          this.notFound.set(true);
        },
      }),
    );
  }
}

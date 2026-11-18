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
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  effectivenessBadge,
  recordBadge,
  trainingErrorKey,
} from '../data/training-display';
import { EFFECTIVENESS, Effectiveness, TrainingRecord } from '../data/training.models';
import { RatingInput } from '../shared/rating-input';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
];

/**
 * `/training/records/:id`: one completion record, the evidence that a person
 * was trained — with its provider, documentation, certificate, feedback and
 * effectiveness, plus the follow-ups (assign again, create a deviation or task
 * from it via "Lag ny fra denne").
 */
@Component({
  selector: 'app-record-detail',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EntityChip,
    EntityTasks,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    LoadingState,
    MenuItem,
    ModuleNav,
    StatusBadge,
    AskAbout,
    FieldHelp,
    WhyItMatters,
    RecordDetailLayout,
    RatingInput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (record(); as r) {
      @let badge = validity(r);
      <app-record-detail-layout
        entityType="training_record"
        [entityId]="r.id"
        [title]="
          'training.recordDetail.title' | transloco: { course: r.course.title, person: r.user.name }
        "
        [breadcrumbs]="[
          { labelKey: 'modules.names.training', link: '/training' },
          { labelKey: 'training.records.title', link: '/training/records' },
          { label: r.course.code + ' · ' + r.user.name },
        ]"
        [tabs]="tabs"
        [counts]="
          r.attachment_count !== undefined ? { attachments: r.attachment_count } : undefined
        "
        [requirementsPanel]="true"
        [canEdit]="access.canManage()"
        [includeAudit]="access.canSeeAudit()"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono">{{ r.course.code }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            [meaning]="badge.meaning"
            [value]="badge.value"
            [labelKey]="badge.labelKey"
          />
          <span aria-hidden="true">·</span>
          <span>{{ 'training.method.' + r.method | transloco }}</span>
          @if (r.missing_evidence) {
            <app-badge tone="warn">{{ 'training.records.missingEvidence' | transloco }}</app-badge>
          }
        </ng-container>

        @if (r.certificate_no && r.passed) {
          <app-button
            primary
            (click)="router.navigate(['/training/records', r.id, 'certificate'])"
            data-testid="record-certificate"
          >
            {{ 'training.recordDetail.certificate' | transloco }}
          </app-button>
        }
        @if (access.canAssign()) {
          <app-button
            secondary
            variant="secondary"
            [loading]="reassigning()"
            (click)="reassign()"
            data-testid="record-reassign"
          >
            {{ 'training.recordDetail.reassign' | transloco }}
          </app-button>
        }
        @if (access.canManage()) {
          <button appMenuItem overflow type="button" [danger]="true" (click)="deleteOpen.set(true)">
            {{ 'training.common.delete' | transloco }}
          </button>
        }

        <app-module-nav nav [items]="access.navItems()" labelKey="training.nav.label" />
        <app-help-strip help scope="training" page="record" lesson="evaluating-effectiveness" />

        <div class="flex flex-col gap-6">
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          @if (r.missing_evidence && access.canManage()) {
            <app-alert tone="info">
              {{ 'training.recordDetail.missingEvidenceHelp' | transloco }}
              <button
                type="button"
                class="ml-1 font-semibold underline"
                (click)="openTab('attachments')"
              >
                {{ 'training.recordDetail.attach' | transloco }}
              </button>
            </app-alert>
          }

          <app-field-list [columns]="3">
            <app-field-item labelKey="training.fields.course">
              <a
                [routerLink]="['/training/courses', r.course.id]"
                class="font-medium text-accent hover:underline"
              >
                {{ r.course.code }} · {{ r.course.title }}
              </a>
            </app-field-item>
            <app-field-item labelKey="training.fields.person">
              <a
                [routerLink]="['/training/people', r.user.id]"
                class="font-medium text-accent hover:underline"
                >{{ r.user.name }}</a
              >
            </app-field-item>
            <app-field-item labelKey="training.fields.version" [value]="r.course_version" />
            <app-field-item
              labelKey="training.fields.completed"
              [value]="r.completed_at | localDay"
            />
            <app-field-item labelKey="training.fields.expires">
              @if (r.expires_at) {
                <span [class.font-semibold]="r.expired" [class.text-fail-ink]="r.expired">
                  {{ r.expires_at | localDay }}
                </span>
              } @else {
                {{ 'training.records.noExpiry' | transloco }}
              }
            </app-field-item>
            <app-field-item
              labelKey="training.fields.score"
              [value]="
                r.score !== null ? ('training.stats.pct' | transloco: { value: r.score }) : null
              "
              empty="none"
            />
            <app-field-item labelKey="training.fields.certificate">
              @if (r.certificate_no) {
                <span class="font-mono text-meta">{{ r.certificate_no }}</span>
              }
            </app-field-item>
            <app-field-item
              labelKey="training.fields.recordedBy"
              [value]="r.recorded_by?.name ?? r.user.name"
            />
            @if (r.acknowledged_revision_id) {
              <app-field-item
                labelKey="training.fields.acknowledged"
                [value]="'training.recordDetail.acknowledged' | transloco"
              />
            }
            @if (r.method === 'external' || r.method === 'manual') {
              <app-field-item labelKey="training.fields.provider">
                @if (r.provider_supplier; as s) {
                  <app-entity-chip
                    [ref]="{
                      entity_type: 'supplier',
                      entity_id: s.id,
                      code: s.code,
                      title: s.name,
                      url: s.url,
                    }"
                  />
                } @else if (r.provider_name) {
                  {{ r.provider_name }}
                }
              </app-field-item>
              <app-field-item labelKey="training.fields.instructor" [value]="r.instructor" />
              <app-field-item
                labelKey="training.fields.hours"
                [value]="
                  r.hours !== null && r.hours !== undefined
                    ? (r.hours | localNumber: '1.0-1')
                    : null
                "
              />
              <app-field-item labelKey="training.fields.location" [value]="r.location" />
            }
            @if (r.notes) {
              <app-field-item
                labelKey="training.fields.notes"
                [value]="r.notes"
                [wide]="true"
                [multiline]="true"
              />
            }
          </app-field-list>

          <app-card>
            <h2 class="mb-2 flex items-center gap-1.5 text-card font-semibold text-fg">
              {{ 'training.recordDetail.effectivenessTitle' | transloco }}
              <app-field-help scope="training" page="record" field="effectiveness" />
              <app-ask-about
                field="effectiveness"
                [prompt]="'training.ask.effectiveness' | transloco"
              />
            </h2>
            @if (r.effectiveness) {
              @let eff = effBadge(r.effectiveness);
              <p class="flex flex-wrap items-center gap-2 text-ui text-fg">
                <app-status-badge
                  [meaning]="eff.meaning"
                  [value]="eff.value"
                  [labelKey]="eff.labelKey"
                />
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
                <p class="mt-1 text-ui whitespace-pre-line text-fg-muted">
                  {{ r.effectiveness_notes }}
                </p>
              }
              @if (
                r.effectiveness === 'not_effective' || r.effectiveness === 'partially_effective'
              ) {
                <p
                  class="mt-2 rounded-tile bg-warn-soft px-3 py-2 text-meta text-warn-ink"
                  data-testid="record-follow-up-hint"
                >
                  {{ 'training.recordDetail.followUpHint' | transloco }}
                </p>
              }
            } @else if (!access.canManage()) {
              <p class="text-ui text-fg-muted">
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
                  <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
                    {{ 'training.recordDetail.evaluate' | transloco }}
                  </legend>
                  <div class="flex flex-wrap gap-3">
                    @for (e of effectivenessOptions; track e) {
                      <label class="flex min-h-8 items-center gap-1.5 text-ui text-fg">
                        <input
                          type="radio"
                          class="h-4 w-4 accent-accent"
                          name="effectiveness"
                          [value]="e"
                          [(ngModel)]="effectiveness"
                        />
                        {{ 'training.effectiveness.' + e | transloco }}
                      </label>
                    }
                  </div>
                </fieldset>
                <div class="flex flex-col gap-1.5">
                  <label for="evaluation-notes" class="text-ui font-semibold text-fg-muted">
                    {{ 'training.fields.evaluationNotes' | transloco }}
                  </label>
                  <textarea
                    id="evaluation-notes"
                    name="notes"
                    rows="2"
                    maxlength="5000"
                    class="w-full min-w-0 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                    [(ngModel)]="evaluationNotes"
                  ></textarea>
                </div>
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

          <app-card>
            <h2 class="mb-2 text-card font-semibold text-fg">
              {{ 'training.recordDetail.feedbackTitle' | transloco }}
            </h2>
            @if (r.feedback_rating) {
              <p class="text-ui text-fg" data-testid="record-feedback">
                {{ 'training.recordDetail.rating' | transloco: { rating: r.feedback_rating } }}
              </p>
              @if (r.feedback_comment) {
                <p class="mt-1 text-ui whitespace-pre-line text-fg-muted">
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
                <div class="flex flex-col gap-1.5">
                  <label for="feedback-comment" class="text-ui font-semibold text-fg-muted">
                    {{ 'training.player.comment' | transloco }}
                  </label>
                  <textarea
                    id="feedback-comment"
                    name="comment"
                    rows="2"
                    maxlength="2000"
                    class="w-full min-w-0 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                    [(ngModel)]="feedbackComment"
                  ></textarea>
                </div>
                <div>
                  <app-button type="submit" size="sm" [disabled]="!rating()" [loading]="busy()">
                    {{ 'training.recordDetail.sendFeedback' | transloco }}
                  </app-button>
                </div>
              </form>
            } @else {
              <p class="text-ui text-fg-muted">
                {{ 'training.recordDetail.noFeedback' | transloco }}
              </p>
            }
          </app-card>
          <app-why-it-matters scope="training" page="record" />
        </div>

        <app-entity-tasks
          tasks
          entityType="training_record"
          [entityId]="r.id"
          [canCreate]="access.canWriteTasks() && access.canOversee()"
          [entityLabel]="r.course.code + ' · ' + r.user.name"
        />
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
        <app-error-state
          titleKey="training.errors.notFoundTitle"
          bodyKey="training.errors.notFound"
          (retry)="reload()"
        />
      </div>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
        <app-loading-state [rows]="5" />
      </div>
    }
  `,
})
export class RecordDetail {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  protected readonly access = inject(TrainingAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly effectivenessOptions = EFFECTIVENESS;
  protected readonly effBadge = effectivenessBadge;
  protected readonly record = signal<TrainingRecord | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly reassigning = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deleteOpen = signal(false);
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

  protected validity(r: TrainingRecord) {
    return recordBadge(r);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected openTab(tab: RecordTab): void {
    void this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
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

  /** "Tildel på nytt": a new assignment of the same course to the same person. */
  protected reassign(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r || this.reassigning()) {
      return;
    }
    this.reassigning.set(true);
    this.error.set(null);
    this.api.reassign(orgId, r.id).subscribe({
      next: (assignment) => {
        this.reassigning.set(false);
        this.notifications.success('training.recordDetail.reassigned', { person: r.user.name });
        void this.router.navigate(['/training/assignments', assignment.id]);
      },
      error: (err: unknown) => {
        this.reassigning.set(false);
        this.error.set(
          err && (err as { status?: number }).status === 409
            ? 'training.recordDetail.alreadyAssigned'
            : trainingErrorKey(err),
        );
      },
    });
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
    this.effectiveness = (r.effectiveness as Effectiveness | null) ?? '';
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

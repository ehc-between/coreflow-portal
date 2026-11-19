import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import { effectivenessBadge, todayInput, trainingErrorKey } from '../data/training-display';
import {
  CourseDetail,
  CourseEvaluation,
  EFFECTIVENESS,
  EVALUATION_METHODS,
  Effectiveness,
  EvaluationMethod,
} from '../data/training.models';

/**
 * "Virker opplæringen?" on a course (ISO 7.2 d: evaluate the effectiveness of
 * the actions taken): the course's effectiveness criteria, the per-record
 * results added up, and course-level evaluations (date, method, result,
 * follow-up). Training managers add and delete evaluations; the assistant can
 * summarise the feedback.
 */
@Component({
  selector: 'app-training-course-effectiveness',
  imports: [
    FormsModule,
    TranslocoPipe,
    LocalDayPipe,
    MarkdownPipe,
    AiAssistButton,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    FieldHelp,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = course();
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-1.5 text-card font-semibold text-fg">
          {{ 'training.effect.title' | transloco }}
          <app-field-help scope="training" page="detail" field="effectiveness" />
        </h2>
        <app-ai-assist-button
          #assist
          [class.hidden]="assistInMenu()"
          assist="training.summarise_effectiveness"
          labelKey="training.ai.summarise"
          entityType="course"
          [entityId]="c.id"
          [input]="{ course_id: c.id }"
          (text)="summary.set($event); running.set(false)"
          (failed)="running.set(false)"
        />
      </div>

      <h3 class="mt-2 text-meta font-semibold text-fg-muted">
        {{ 'training.fields.effectivenessCriteria' | transloco }}
      </h3>
      @if (criteria(); as text) {
        <div class="cf-prose mt-1 text-ui" [innerHTML]="text | appMarkdown"></div>
      } @else {
        <p class="mt-1 text-ui text-fg-muted">{{ 'training.effect.noCriteria' | transloco }}</p>
      }

      @if (records(); as r) {
        <h3 class="mt-4 text-meta font-semibold text-fg-muted">
          {{ 'training.effect.recordsTitle' | transloco }}
        </h3>
        <ul class="mt-1.5 flex flex-wrap gap-2" data-testid="effect-records">
          @for (key of resultKeys; track key) {
            @let badge = badgeOf(key);
            <li class="flex items-center gap-1.5 text-ui">
              <app-status-badge
                [meaning]="badge.meaning"
                [value]="badge.value"
                [labelKey]="badge.labelKey"
              />
              <span class="font-semibold text-fg">{{ r[key] }}</span>
            </li>
          }
          <li class="flex items-center gap-1.5 text-ui text-fg-muted">
            {{ 'training.effectiveness.pending' | transloco }}:
            <span class="font-semibold text-fg">{{ r.not_evaluated }}</span>
          </li>
        </ul>
      }

      <h3 class="mt-4 text-meta font-semibold text-fg-muted">
        {{ 'training.effect.evaluationsTitle' | transloco }}
      </h3>
      @if (evaluations().length === 0) {
        <p class="mt-1 text-ui text-fg-muted">{{ 'training.effect.noEvaluations' | transloco }}</p>
      } @else {
        <ul class="mt-1.5 flex flex-col divide-y divide-border" data-testid="course-evaluations">
          @for (e of evaluations(); track e.id) {
            @let badge = badgeOf(e.result);
            <li class="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-ui">
              <div class="min-w-0 flex-1 basis-[240px]">
                <p class="flex flex-wrap items-center gap-2">
                  <app-status-badge
                    [meaning]="badge.meaning"
                    [value]="badge.value"
                    [labelKey]="badge.labelKey"
                  />
                  <span class="text-fg">{{ e.evaluated_on | localDay }}</span>
                  <span class="text-fg-muted">
                    · {{ 'training.evaluationMethod.' + e.method | transloco }}
                    @if (e.evaluated_by) {
                      · {{ e.evaluated_by.name }}
                    }
                  </span>
                </p>
                @if (e.notes) {
                  <p class="mt-1 whitespace-pre-line text-fg-muted">{{ e.notes }}</p>
                }
                @if (e.follow_up) {
                  <p class="mt-1 whitespace-pre-line text-fg">
                    <span class="font-semibold">{{ 'training.fields.followUp' | transloco }}:</span>
                    {{ e.follow_up }}
                  </p>
                }
              </div>
              @if (canManage()) {
                <app-button size="sm" variant="ghost" (click)="deleteTarget.set(e)">
                  {{ 'training.common.delete' | transloco }}
                </app-button>
              }
            </li>
          }
        </ul>
      }

      @if (canManage()) {
        @if (formOpen()) {
          <form
            class="mt-3 flex flex-col gap-3 border-t border-border pt-3"
            (submit)="$event.preventDefault(); save()"
            data-testid="course-evaluation-form"
          >
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="flex flex-col gap-1.5">
                <label for="eval-date" class="text-ui font-semibold text-fg-muted">
                  {{ 'training.fields.evaluatedOn' | transloco }}
                </label>
                <input
                  id="eval-date"
                  name="date"
                  type="date"
                  [max]="today"
                  class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                  [(ngModel)]="evaluatedOn"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="eval-method" class="text-ui font-semibold text-fg-muted">
                  {{ 'training.fields.evaluationMethod' | transloco }}
                </label>
                <select
                  id="eval-method"
                  name="method"
                  class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                  [(ngModel)]="method"
                >
                  @for (m of methods; track m) {
                    <option [value]="m">{{ 'training.evaluationMethod.' + m | transloco }}</option>
                  }
                </select>
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="eval-result" class="text-ui font-semibold text-fg-muted">
                  {{ 'training.fields.result' | transloco }}
                </label>
                <select
                  id="eval-result"
                  name="result"
                  class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                  [(ngModel)]="result"
                >
                  <option value="">{{ 'training.rules.pick' | transloco }}</option>
                  @for (r of results; track r) {
                    <option [value]="r">{{ 'training.effectiveness.' + r | transloco }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="eval-notes" class="text-ui font-semibold text-fg-muted">
                {{ 'training.fields.evaluationNotes' | transloco }}
              </label>
              <textarea
                id="eval-notes"
                name="notes"
                rows="2"
                maxlength="5000"
                class="w-full min-w-0 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                [(ngModel)]="notes"
              ></textarea>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="eval-follow" class="text-ui font-semibold text-fg-muted">
                {{ 'training.fields.followUp' | transloco }}
              </label>
              <textarea
                id="eval-follow"
                name="follow"
                rows="2"
                maxlength="5000"
                class="w-full min-w-0 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                [placeholder]="'training.effect.followUpPlaceholder' | transloco"
                [(ngModel)]="followUp"
              ></textarea>
            </div>
            @if (error(); as key) {
              <app-alert>{{ key | transloco }}</app-alert>
            }
            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="secondary" (click)="formOpen.set(false)">
                {{ 'training.common.cancel' | transloco }}
              </app-button>
              <app-button type="submit" [loading]="busy()" [disabled]="!result || !evaluatedOn">
                {{ 'training.effect.save' | transloco }}
              </app-button>
            </div>
          </form>
        } @else {
          <div class="mt-3">
            <app-button
              size="sm"
              variant="secondary"
              (click)="openForm()"
              data-testid="evaluation-open"
            >
              {{ 'training.effect.add' | transloco }}
            </app-button>
          </div>
        }
      }

      @if (running() && !summary()) {
        <p class="mt-4 border-t border-border pt-3 text-ui text-fg-muted" aria-live="polite">
          {{ 'training.effect.summarising' | transloco }}
        </p>
      }
      @if (summary()) {
        <div
          class="cf-prose mt-4 border-t border-border pt-3"
          aria-live="polite"
          [innerHTML]="summary() | appMarkdown"
        ></div>
      }
    </app-card>

    <app-confirm-dialog
      [open]="deleteTarget() !== null"
      [title]="'training.effect.deleteTitle' | transloco"
      [message]="'training.effect.deleteMessage' | transloco"
      [confirmLabel]="'training.common.delete' | transloco"
      [cancelLabel]="'training.common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="deleteTarget.set(null)"
    />
  `,
})
export class CourseEffectiveness {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly course = input.required<CourseDetail>();
  readonly canManage = input(false);
  /** Whether the per-record counts may be shown (people who oversee training). */
  readonly showRecords = input(false);
  /** The page offers "Oppsummer effekt" in its "Spør KI" menu (§2.7): no button here. */
  readonly assistInMenu = input(false);

  private readonly assist = viewChild<AiAssistButton>('assist');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** A summary was asked for from the menu and has not started streaming yet. */
  protected readonly running = signal(false);

  protected readonly today = todayInput();
  protected readonly methods = EVALUATION_METHODS;
  protected readonly results = EFFECTIVENESS;
  protected readonly resultKeys = EFFECTIVENESS;
  protected readonly badgeOf = effectivenessBadge;
  protected readonly summary = signal('');
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deleteTarget = signal<CourseEvaluation | null>(null);
  protected readonly added = signal<readonly CourseEvaluation[]>([]);
  protected readonly removed = signal<ReadonlySet<string>>(new Set());

  /** Run "Oppsummer effekt" from the page's "Spør KI" menu; the answer shows in this card. */
  summarise(): void {
    const assist = this.assist();
    if (!assist) {
      return;
    }
    this.running.set(true);
    assist.run();
    this.host.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  protected evaluatedOn = todayInput();
  protected method: EvaluationMethod = 'survey';
  protected result: Effectiveness | '' = '';
  protected notes = '';
  protected followUp = '';

  protected readonly criteria = computed(
    () => this.course().effectiveness?.criteria ?? this.course().effectiveness_criteria ?? null,
  );
  protected readonly records = computed(() =>
    this.showRecords() ? (this.course().effectiveness?.records ?? null) : null,
  );
  protected readonly evaluations = computed(() => {
    const gone = this.removed();
    const all = [...this.added(), ...(this.course().effectiveness?.evaluations ?? [])];
    return all
      .filter((e) => !gone.has(e.id))
      .sort((a, b) => b.evaluated_on.localeCompare(a.evaluated_on));
  });

  protected openForm(): void {
    this.evaluatedOn = todayInput();
    this.method = 'survey';
    this.result = '';
    this.notes = '';
    this.followUp = '';
    this.error.set(null);
    this.formOpen.set(true);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.result || !this.evaluatedOn || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .addEvaluation(orgId, this.course().id, {
        evaluated_on: this.evaluatedOn,
        method: this.method,
        result: this.result,
        notes: this.notes.trim() || null,
        follow_up: this.followUp.trim() || null,
      })
      .subscribe({
        next: (evaluation) => {
          this.busy.set(false);
          this.formOpen.set(false);
          this.added.update((list) => [evaluation, ...list]);
          this.notifications.success('training.effect.saved');
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(trainingErrorKey(err));
        },
      });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = this.deleteTarget();
    if (!orgId || !target) {
      return;
    }
    this.busy.set(true);
    this.api.deleteEvaluation(orgId, target.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteTarget.set(null);
        this.removed.update((set) => new Set([...set, target.id]));
        this.notifications.success('training.effect.deleted');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.deleteTarget.set(null);
        this.error.set(trainingErrorKey(err));
      },
    });
  }
}

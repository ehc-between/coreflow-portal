import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Attachment } from '../../core/attachments/attachment.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TASK_PRIORITIES, TaskPriority } from '../../core/tasks/task.models';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AssigneeSelect } from '../../shared/tasks/assignee-select';
import { decodeAssignee, dueAtFromDay, taskPriorityKey } from '../../shared/tasks/task-display';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { ObligationsApi } from './data/obligations-api';
import {
  EVALUATION_RESULTS,
  Evaluation,
  EvaluationCreate,
  EvaluationResult,
  MAX_EVIDENCE_ATTACHMENTS,
  NON_COMPLIANT_RESULTS,
  Obligation,
} from './data/obligation.models';
import { complianceTone, resultKey, todayIso } from './data/obligation-display';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { obligationErrorKey } from './data/obligation-errors';

/** Whether an evaluation result calls for a follow-up action. */
export function needsFollowUp(result: string): boolean {
  return (NON_COMPLIANT_RESULTS as readonly string[]).includes(result);
}

/**
 * Periodic compliance evaluations of an obligation: the history (result, date,
 * evaluator, notes, evidence) and the form to record a new one. Recording completes
 * the open evaluation task (which plans the next one) and sets the compliance status;
 * a partially or non-compliant result can create a follow-up action.
 */
@Component({
  selector: 'app-obligation-evaluations',
  imports: [
    TranslocoPipe,
    FieldHelp,
    LocalDayPipe,
    AssigneeSelect,
    Badge,
    Button,
    ConfirmDialog,
    FormField,
    Icon,
  ],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-ob-eval-h">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-ob-eval-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'obligations.evaluations.title' | transloco }}
        </h2>
        @if (canRecord() && !adding()) {
          <app-button size="sm" (click)="open()" data-testid="evaluation-add">
            <app-icon name="checkcircle" [size]="14" />
            {{ 'obligations.evaluations.record' | transloco }}
          </app-button>
        }
      </div>
      <app-field-help scope="obligations" page="detail" field="evaluations" />
      @if (obligation().status === 'retired') {
        <p class="mt-2 text-[12.5px] text-fg-muted">
          {{ 'obligations.evaluations.retired' | transloco }}
        </p>
      }

      @if (adding()) {
        <form
          class="my-3 grid grid-cols-1 gap-3 rounded-tile border border-border p-3 sm:grid-cols-2"
          (submit)="$event.preventDefault(); save()"
          data-testid="evaluation-form"
        >
          <app-form-field
            [label]="'obligations.evaluations.result' | transloco"
            inputId="cf-ev-result"
          >
            <select
              id="cf-ev-result"
              (change)="result.set($any($event.target).value)"
              data-testid="evaluation-result"
            >
              @for (r of results; track r) {
                <option [value]="r" [selected]="result() === r">
                  {{ resultKey(r) | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field
            [label]="'obligations.evaluations.evaluatedOn' | transloco"
            inputId="cf-ev-date"
          >
            <input
              id="cf-ev-date"
              type="date"
              [max]="today"
              [value]="evaluatedOn()"
              (change)="evaluatedOn.set($any($event.target).value)"
            />
          </app-form-field>
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'obligations.evaluations.notes' | transloco"
              inputId="cf-ev-notes"
            >
              <textarea
                id="cf-ev-notes"
                rows="3"
                maxlength="20000"
                [value]="notes()"
                (input)="notes.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'obligations.evaluations.evidenceSummary' | transloco"
              inputId="cf-ev-evidence"
            >
              <textarea
                id="cf-ev-evidence"
                rows="2"
                maxlength="20000"
                [value]="evidenceSummary()"
                (input)="evidenceSummary.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
            <app-field-help scope="obligations" page="detail" field="evidence" />
          </div>
          <fieldset class="sm:col-span-2">
            <legend class="mb-1 text-[13px] font-semibold text-fg-muted">
              {{ 'obligations.evaluations.evidenceFiles' | transloco }}
            </legend>
            @if (available().length === 0) {
              <p class="text-[12.5px] text-fg-muted">
                {{ 'obligations.evaluations.noFiles' | transloco }}
              </p>
            } @else {
              <ul class="flex flex-col gap-1">
                @for (a of available(); track a.id) {
                  <li>
                    <label class="flex items-center gap-2 text-[13px] text-fg">
                      <input
                        type="checkbox"
                        class="h-4 w-4 accent-[var(--accent)]"
                        [checked]="files().has(a.id)"
                        [disabled]="!files().has(a.id) && files().size >= maxFiles"
                        (change)="toggleFile(a.id, $any($event.target).checked)"
                      />
                      <span class="truncate">{{ a.filename }}</span>
                    </label>
                  </li>
                }
              </ul>
            }
          </fieldset>

          @if (followUpRelevant()) {
            <fieldset
              class="grid grid-cols-1 gap-3 rounded-tile border border-border bg-surface-2 p-3 sm:col-span-2 sm:grid-cols-2"
            >
              <legend class="px-1 text-[13px] font-semibold text-fg">
                {{ 'obligations.evaluations.followUp' | transloco }}
              </legend>
              <label class="flex items-center gap-2 text-[13px] text-fg sm:col-span-2">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="withFollowUp()"
                  (change)="withFollowUp.set($any($event.target).checked)"
                  data-testid="evaluation-followup"
                />
                {{ 'obligations.evaluations.createFollowUp' | transloco }}
              </label>
              @if (withFollowUp()) {
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'obligations.actions.titleLabel' | transloco"
                    inputId="cf-ev-fu-title"
                  >
                    <input
                      id="cf-ev-fu-title"
                      type="text"
                      maxlength="255"
                      [value]="fuTitle()"
                      (input)="fuTitle.set($any($event.target).value)"
                      data-testid="evaluation-followup-title"
                    />
                  </app-form-field>
                </div>
                <app-form-field
                  [label]="'obligations.actions.assignee' | transloco"
                  inputId="cf-ev-fu-assignee"
                >
                  <app-assignee-select
                    inputId="cf-ev-fu-assignee"
                    [value]="fuAssignee()"
                    (valueChange)="fuAssignee.set($event)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'obligations.actions.dueDate' | transloco"
                  inputId="cf-ev-fu-due"
                >
                  <input
                    id="cf-ev-fu-due"
                    type="date"
                    [value]="fuDue()"
                    (change)="fuDue.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'obligations.actions.priority' | transloco"
                  inputId="cf-ev-fu-priority"
                >
                  <select
                    id="cf-ev-fu-priority"
                    (change)="fuPriority.set($any($event.target).value)"
                  >
                    @for (p of priorities; track p) {
                      <option [value]="p" [selected]="fuPriority() === p">
                        {{ priorityKey(p) | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
              }
            </fieldset>
          }

          <div class="flex justify-end gap-2 sm:col-span-2">
            <app-button variant="ghost" size="sm" (click)="reset()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              size="sm"
              [disabled]="!canSave() || busy()"
              [loading]="busy()"
              data-testid="evaluation-save"
            >
              {{ 'obligations.evaluations.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @switch (state()) {
        @case ('loading') {
          <p class="mt-2 text-[13px] text-fg-muted" role="status">
            {{ 'obligations.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="mt-2 text-[13px] text-fail" role="alert">
            {{ 'obligations.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (items().length === 0) {
            <p class="mt-2 text-[13px] text-fg-muted" data-testid="evaluations-empty">
              {{ 'obligations.evaluations.none' | transloco }}
            </p>
          } @else {
            <ol class="mt-3 flex flex-col gap-3" data-testid="evaluation-rows">
              @for (e of items(); track e.id) {
                <li class="rounded-tile border border-border p-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <app-badge [tone]="tone(e.result)">{{
                      resultKey(e.result) | transloco
                    }}</app-badge>
                    <span class="text-[13px] font-semibold text-fg">{{
                      e.evaluated_on | localDay
                    }}</span>
                    @if (e.evaluated_by?.name; as name) {
                      <span class="text-[12.5px] text-fg-muted">
                        {{ 'obligations.evaluations.by' | transloco: { name } }}
                      </span>
                    }
                    @if (canRemove()) {
                      <app-button
                        class="ml-auto"
                        variant="ghost"
                        size="sm"
                        [attr.aria-label]="'obligations.evaluations.remove' | transloco"
                        (click)="removing.set(e)"
                      >
                        <app-icon name="trash" [size]="14" />
                      </app-button>
                    }
                  </div>
                  @if (e.notes) {
                    <p class="mt-2 text-[13px] whitespace-pre-line text-fg">{{ e.notes }}</p>
                  }
                  @if (e.evidence_summary) {
                    <p class="mt-2 text-[12.5px] whitespace-pre-line text-fg-muted">
                      <span class="font-semibold text-fg"
                        >{{ 'obligations.evaluations.evidenceSummary' | transloco }}:</span
                      >
                      {{ e.evidence_summary }}
                    </p>
                  }
                  @if (e.attachment_ids.length) {
                    <ul class="mt-2 flex flex-wrap gap-2 text-[12px]">
                      @for (id of e.attachment_ids; track id) {
                        <li
                          class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-fg-muted"
                        >
                          <app-icon name="documents" [size]="12" />
                          {{ fileName(id) }}
                        </li>
                      }
                    </ul>
                  }
                </li>
              }
            </ol>
          }
        }
      }

      <app-confirm-dialog
        [open]="!!removing()"
        [title]="'obligations.evaluations.removeTitle' | transloco"
        [message]="'obligations.evaluations.removeMessage' | transloco"
        [confirmLabel]="'obligations.evaluations.remove' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="removing.set(null)"
      />
    </section>
  `,
})
export class ObligationEvaluations {
  private readonly api = inject(ObligationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly obligation = input.required<Obligation>();
  /** Files attached to the obligation (evidence can only be chosen from these). */
  readonly attachments = input<readonly Attachment[]>([]);
  /** Bump to reload. */
  readonly refresh = input(0);
  /** The updated obligation after an evaluation was recorded or removed. */
  readonly changed = output<Obligation | null>();
  /** A follow-up action task was created. */
  readonly actionAdded = output<void>();

  protected readonly results = EVALUATION_RESULTS;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly resultKey = resultKey;
  protected readonly tone = complianceTone;
  protected readonly maxFiles = MAX_EVIDENCE_ATTACHMENTS;
  protected readonly today = todayIso();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Evaluation[]>([]);
  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly removing = signal<Evaluation | null>(null);

  protected readonly result = signal<EvaluationResult>('compliant');
  protected readonly evaluatedOn = signal(todayIso());
  protected readonly notes = signal('');
  protected readonly evidenceSummary = signal('');
  protected readonly files = signal<ReadonlySet<string>>(new Set());
  protected readonly withFollowUp = signal(true);
  protected readonly fuTitle = signal('');
  protected readonly fuAssignee = signal('');
  protected readonly fuDue = signal('');
  protected readonly fuPriority = signal<TaskPriority>('normal');

  protected readonly canRecord = computed(
    () => this.obligation().can_evaluate && this.obligation().status !== 'retired',
  );
  protected readonly canRemove = computed(() => this.obligation().can_delete);
  protected readonly available = computed(() =>
    this.attachments().filter((a) => a.status === 'available'),
  );
  protected readonly followUpRelevant = computed(() => needsFollowUp(this.result()));
  protected readonly canSave = computed(
    () =>
      !!this.evaluatedOn() &&
      this.evaluatedOn() <= this.today &&
      (!this.followUpRelevant() || !this.withFollowUp() || !!this.fuTitle().trim()),
  );

  /** The id alone, so a refreshed obligation object does not reload the history. */
  private readonly obligationId = computed(() => this.obligation().id);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.obligationId();
      this.refresh();
      untracked(() => this.load(orgId, id));
    });
  }

  protected fileName(id: string): string {
    return this.attachments().find((a) => a.id === id)?.filename ?? id.slice(0, 8);
  }

  protected open(): void {
    this.reset();
    this.fuTitle.set(this.obligation().title.slice(0, 200));
    this.adding.set(true);
  }

  protected toggleFile(id: string, on: boolean): void {
    const next = new Set(this.files());
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.files.set(next);
  }

  protected reset(): void {
    this.adding.set(false);
    this.result.set('compliant');
    this.evaluatedOn.set(todayIso());
    this.notes.set('');
    this.evidenceSummary.set('');
    this.files.set(new Set());
    this.withFollowUp.set(true);
    this.fuTitle.set('');
    this.fuAssignee.set('');
    this.fuDue.set('');
    this.fuPriority.set('normal');
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canSave() || this.busy()) {
      return;
    }
    const followUp = this.followUpRelevant() && this.withFollowUp() && this.fuTitle().trim();
    const body: EvaluationCreate = {
      result: this.result(),
      evaluated_on: this.evaluatedOn(),
      notes: this.notes().trim() || null,
      evidence_summary: this.evidenceSummary().trim() || null,
      attachment_ids: [...this.files()],
      follow_up: followUp
        ? {
            title: this.fuTitle().trim(),
            assignee: decodeAssignee(this.fuAssignee()),
            due_at: dueAtFromDay(this.fuDue()),
            priority: this.fuPriority(),
          }
        : null,
    };
    this.busy.set(true);
    this.api.evaluate(orgId, this.obligation().id, body).subscribe({
      next: (created) => {
        this.busy.set(false);
        this.reset();
        this.notifications.success('obligations.notices.evaluated', {
          code: created.obligation.code,
        });
        this.items.set([created.evaluation, ...this.items()]);
        this.changed.emit(created.obligation);
        if (created.follow_up_task_id) {
          this.actionAdded.emit();
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = this.removing();
    if (!orgId || !target || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.removeEvaluation(orgId, this.obligation().id, target.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.items.set(this.items().filter((e) => e.id !== target.id));
        this.notifications.success('obligations.notices.evaluationRemoved');
        this.changed.emit(null);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.evaluations(orgId, id).subscribe({
      next: (items) => {
        this.items.set(items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}

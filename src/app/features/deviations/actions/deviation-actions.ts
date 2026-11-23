import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Action,
  ActionEffectiveness,
  ActionInput,
  ActionKind,
  ActionStatus,
} from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import {
  isDeviationClosedError,
  notifyDeviationError,
} from '../../../core/deviations/deviation-errors';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { Attachments } from '../../../shared/attachments/attachments';
import { Icon } from '../../../shared/ui/icon/icon';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormField } from '../../../shared/ui/form-field/form-field';
import {
  ACTION_KIND_OPTIONS,
  ACTION_STATUS_OPTIONS,
  EFFECTIVENESS_OPTIONS,
  actionKindLabelKey,
  actionStatusLabelKey,
  actionStatusToneValue,
  canJudgeEffect,
  effectivenessLabelKey,
  effectivenessToneValue,
  isActionOverdue,
} from '../deviation-enums';

/** An org user pickable as an action owner. */
interface OwnerOption {
  readonly id: string;
  readonly name: string;
}

/**
 * CAPA actions panel for a deviation: lists containment / corrective /
 * preventive actions with status, owner, due (overdue) and effectiveness, and —
 * when `canEdit` — lets the user add an action, advance its status, mark it
 * verified with an effectiveness outcome, edit notes and delete it. Every change
 * persists via {@link DeviationsApi}; the updated list is emitted via
 * `actionsChange` and a `changed` signal asks the host to re-fetch the audit
 * trail (the backend records an event per action change).
 */
@Component({
  selector: 'app-deviation-actions',
  imports: [
    DateInput,
    FormField,
    LocalDayPipe,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    Button,
    ConfirmDialog,
    Icon,
    Attachments,
    FieldHelp,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 class="font-display text-section font-bold text-fg">
            {{ titleKey() | transloco }}
          </h2>
          <p class="mt-0.5 text-meta text-fg-muted">{{ introKey() | transloco }}</p>
        </div>
        @if (canEdit() && !adding()) {
          <app-button variant="secondary" size="sm" (click)="startAdd()">
            <app-icon name="plus" [size]="15" />
            {{ 'deviations.actions.add' | transloco }}
          </app-button>
        }
      </div>

      @if (adding()) {
        <div
          class="mb-3 grid grid-cols-1 items-start gap-x-4 gap-y-4 rounded-tile border border-border bg-surface-2 p-4 sm:grid-cols-2"
        >
          <app-form-field
            [label]="'deviations.actions.fields.kind' | transloco"
            inputId="new-action-kind"
          >
            <select
              id="new-action-kind"
              [ngModel]="newKind()"
              (ngModelChange)="newKind.set($event)"
            >
              @for (option of kindOptions; track option) {
                <option [value]="option">{{ actionKindLabelKey(option) | transloco }}</option>
              }
            </select>
            <p hint class="text-meta leading-snug text-fg-subtle" data-testid="kind-help">
              {{ 'deviations.capa.kindHelp.' + newKind() | transloco }}
            </p>
          </app-form-field>
          <app-form-field
            [label]="'deviations.actions.fields.owner' | transloco"
            inputId="new-action-owner"
          >
            <select
              id="new-action-owner"
              [ngModel]="newOwner()"
              (ngModelChange)="newOwner.set($event)"
            >
              <option value="">{{ 'deviations.actions.unassigned' | transloco }}</option>
              @for (user of owners(); track user.id) {
                <option [value]="user.id">{{ user.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field
            span="full"
            [label]="'deviations.actions.fields.description' | transloco"
            inputId="new-action-desc"
            [required]="true"
          >
            <textarea
              id="new-action-desc"
              [ngModel]="newDescription()"
              (ngModelChange)="newDescription.set($event)"
              rows="2"
            ></textarea>
          </app-form-field>
          <app-form-field
            [label]="'deviations.actions.fields.due' | transloco"
            inputId="new-action-due"
          >
            <app-date-input
              inputId="new-action-due"
              [value]="newDue()"
              (valueChange)="newDue.set($event ?? '')"
            />
          </app-form-field>
          <app-form-field
            [label]="'deviations.capa.reviewDue' | transloco"
            [hint]="newKind() === 'containment' ? ('deviations.capa.optionalHint' | transloco) : ''"
            inputId="new-action-review"
          >
            <app-field-help
              label-suffix
              scope="deviations"
              page="detail"
              field="effectiveness_review"
              [label]="'deviations.capa.reviewDue' | transloco"
            />
            <app-date-input
              inputId="new-action-review"
              [value]="newReviewDue()"
              (valueChange)="newReviewDue.set($event ?? '')"
            />
          </app-form-field>
          <div class="flex items-center justify-end gap-2 sm:col-span-2">
            <app-button variant="secondary" size="sm" (click)="cancelAdd()">
              {{ 'deviations.actions.cancel' | transloco }}
            </app-button>
            <app-button size="sm" [loading]="saving()" (click)="submitAdd()">
              {{ 'deviations.actions.save' | transloco }}
            </app-button>
          </div>
        </div>
      }

      @if (actions().length === 0 && !adding()) {
        <p class="py-4 text-center text-ui text-fg-muted">
          {{ 'deviations.actions.empty' | transloco }}
        </p>
      } @else {
        <ul class="flex flex-col gap-2.5">
          @for (action of actions(); track action.id) {
            <li
              class="rounded-tile border bg-surface p-3.5"
              [class.border-border]="!highlighted().includes(action.id)"
              [class.border-fail]="highlighted().includes(action.id)"
              [class.ring-2]="highlighted().includes(action.id)"
              [class.ring-fail-soft]="highlighted().includes(action.id)"
              [attr.data-blocking]="highlighted().includes(action.id) ? 'true' : null"
            >
              <div class="flex items-start gap-2.5">
                <span class="min-w-0 flex-1">
                  <span
                    class="block text-ui font-semibold whitespace-pre-line text-fg"
                    data-testid="action-description"
                    >{{ action.description }}</span
                  >
                  <span class="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span class="text-meta font-semibold text-fg-muted">{{
                      actionKindLabelKey(action.kind) | transloco
                    }}</span>
                    <app-status-badge
                      meaning="lifecycle"
                      [value]="actionStatusToneValue(action.status)"
                      [labelKey]="actionStatusLabelKey(action.status)"
                    />
                    @if (action.effectiveness && canJudge(action)) {
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="effectivenessToneValue(action.effectiveness)"
                        [labelKey]="effectivenessLabelKey(action.effectiveness)"
                      />
                    }
                  </span>
                  <span
                    class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-meta text-fg-subtle"
                  >
                    @if (action.owner_name) {
                      <span class="inline-flex items-center gap-1">
                        <app-icon name="people" [size]="13" />{{ action.owner_name }}
                      </span>
                    }
                    @if (action.due_at) {
                      <span
                        class="inline-flex items-center gap-1"
                        [class.text-warn-ink]="overdue(action)"
                        [class.font-semibold]="overdue(action)"
                      >
                        <app-icon name="calendar" [size]="13" />{{
                          'deviations.actions.dueLabel'
                            | transloco: { date: (action.due_at | localDay) }
                        }}
                      </span>
                    }
                    @if (action.effectiveness_review_due_at) {
                      <span class="inline-flex items-center gap-1" data-testid="review-due">
                        <app-icon name="checkcircle" [size]="13" />
                        @if (action.effectiveness_review_task_id) {
                          <a
                            [routerLink]="['/tasks', action.effectiveness_review_task_id]"
                            class="hover:text-fg hover:underline"
                            >{{
                              'deviations.capa.reviewDueLabel'
                                | transloco
                                  : { date: (action.effectiveness_review_due_at | localDay) }
                            }}</a
                          >
                        } @else {
                          {{
                            'deviations.capa.reviewDueLabel'
                              | transloco: { date: (action.effectiveness_review_due_at | localDay) }
                          }}
                        }
                      </span>
                    }
                  </span>
                </span>

                @if (canEdit()) {
                  <span class="flex flex-none items-center gap-1">
                    <app-button
                      variant="secondary"
                      size="sm"
                      [attr.aria-expanded]="isOpen(action)"
                      (click)="toggleOpen(action.id)"
                      data-testid="action-update"
                    >
                      {{
                        (isOpen(action)
                          ? 'deviations.page.capa.done'
                          : 'deviations.page.capa.update'
                        ) | transloco
                      }}
                    </app-button>
                    <button
                      type="button"
                      [attr.aria-label]="
                        'deviations.actions.deleteNamed' | transloco: { action: action.description }
                      "
                      [title]="'deviations.actions.delete' | transloco"
                      [disabled]="busyId() === action.id"
                      (click)="confirmRemove.set(action)"
                      class="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-fail-soft hover:text-fail-ink disabled:opacity-60"
                    >
                      <app-icon name="trash" [size]="14" />
                    </button>
                  </span>
                }
              </div>

              @if (action.notes) {
                <p
                  class="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-meta whitespace-pre-line text-fg-muted"
                >
                  {{ action.notes }}
                </p>
              }

              <app-attachments
                entityType="deviation_action"
                [entityId]="action.id"
                [canEdit]="canEdit()"
                [compact]="true"
              />

              @if (canEdit() && isOpen(action)) {
                <div
                  class="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3"
                  data-testid="action-controls"
                >
                  <div class="flex flex-col gap-1">
                    <span class="text-micro font-semibold text-fg-subtle">{{
                      'deviations.actions.fields.status' | transloco
                    }}</span>
                    <div class="cf-select">
                      <select
                        [ngModel]="action.status"
                        (ngModelChange)="changeStatus(action, $event)"
                        [disabled]="busyId() === action.id"
                        [attr.aria-label]="'deviations.actions.fields.status' | transloco"
                      >
                        @for (option of statusOptions; track option) {
                          <option [value]="option">
                            {{ actionStatusLabelKey(option) | transloco }}
                          </option>
                        }
                      </select>
                    </div>
                  </div>

                  @if (canJudge(action)) {
                    <div class="flex flex-col gap-1">
                      <span class="text-meta font-semibold text-fg-muted">{{
                        'deviations.actions.fields.effectiveness' | transloco
                      }}</span>
                      <div class="cf-select">
                        <select
                          [ngModel]="action.effectiveness ?? 'pending'"
                          (ngModelChange)="changeEffectiveness(action, $event)"
                          [disabled]="busyId() === action.id"
                          [attr.aria-label]="'deviations.actions.fields.effectiveness' | transloco"
                        >
                          @for (option of effectivenessOptions; track option) {
                            <option [value]="option">
                              {{ effectivenessLabelKey(option) | transloco }}
                            </option>
                          }
                        </select>
                      </div>
                    </div>
                  }

                  @if (canJudge(action) || action.effectiveness_review_due_at) {
                    <div class="flex flex-col gap-1">
                      <label
                        [for]="'review-' + action.id"
                        class="text-micro font-semibold text-fg-subtle"
                        >{{ 'deviations.capa.reviewDue' | transloco }}</label
                      >
                      <input
                        [id]="'review-' + action.id"
                        type="date"
                        [ngModel]="dayOf(action.effectiveness_review_due_at)"
                        (ngModelChange)="changeReviewDue(action, $event)"
                        [disabled]="busyId() === action.id"
                        class="h-9 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                      />
                    </div>
                  }

                  @if (action.status === 'done') {
                    <app-button
                      variant="secondary"
                      size="sm"
                      [disabled]="busyId() === action.id"
                      (click)="markVerified(action)"
                    >
                      <app-icon name="checkcircle" [size]="15" />
                      {{ 'deviations.actions.markVerified' | transloco }}
                    </app-button>
                  }

                  <button
                    type="button"
                    (click)="toggleNotes(action.id)"
                    [attr.aria-expanded]="notesOpenId() === action.id"
                    class="inline-flex h-9 items-center text-ui font-semibold text-accent hover:underline"
                  >
                    {{ 'deviations.actions.editNotes' | transloco }}
                  </button>
                </div>

                @if (notesOpenId() === action.id) {
                  <div class="mt-2 flex flex-col gap-2">
                    <textarea
                      [ngModel]="notesDraft()"
                      (ngModelChange)="notesDraft.set($event)"
                      rows="2"
                      [placeholder]="'deviations.actions.notesPlaceholder' | transloco"
                      class="w-full rounded-tile border border-border bg-bg px-3 py-2.5 text-ui text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                    ></textarea>
                    <div class="flex items-center gap-2">
                      <app-button
                        size="sm"
                        [disabled]="busyId() === action.id"
                        (click)="saveNotes(action)"
                      >
                        {{ 'deviations.actions.save' | transloco }}
                      </app-button>
                      <app-button variant="ghost" size="sm" (click)="notesOpenId.set(null)">
                        {{ 'deviations.actions.cancel' | transloco }}
                      </app-button>
                    </div>
                  </div>
                }
              }
            </li>
          }
        </ul>
      }
    </div>

    <app-confirm-dialog
      [open]="confirmRemove() !== null"
      [busy]="busyId() !== null"
      [title]="'deviations.actions.deleteTitle' | transloco"
      [message]="'deviations.actions.deleteConfirm' | transloco"
      [confirmLabel]="'deviations.actions.delete' | transloco"
      [cancelLabel]="'deviations.actions.cancel' | transloco"
      (confirmed)="removeConfirmed()"
      (cancelled)="confirmRemove.set(null)"
    />
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 36px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class DeviationActions {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly deviationId = input.required<string>();
  /** U33: the heading (the deviation page asks "Hva gjør vi?"). */
  readonly titleKey = input('deviations.actions.title');
  readonly introKey = input('deviations.capa.intro');
  readonly actions = input.required<readonly Action[]>();
  readonly owners = input<readonly OwnerOption[]>([]);
  readonly canEdit = input(false);
  /** Action ids to highlight (e.g. the ones blocking a status change). */
  readonly highlighted = input<readonly string[]>([]);
  /** The action whose update controls (status, effect, notes) are open. */
  protected readonly openId = signal<string | null>(null);

  /** Emits the new full actions list whenever one is added / changed / removed. */
  readonly actionsChange = output<readonly Action[]>();
  /** Fires after any change so the host can re-fetch the audit trail. */
  readonly changed = output<void>();
  /**
   * Fires when the server rejected a change because the deviation is now
   * closed (someone else closed it meanwhile): the host reloads it so the page
   * switches to its locked state.
   */
  readonly stale = output<void>();

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly kindOptions = ACTION_KIND_OPTIONS;
  protected readonly statusOptions = ACTION_STATUS_OPTIONS;
  protected readonly effectivenessOptions = EFFECTIVENESS_OPTIONS;
  protected readonly actionKindLabelKey = actionKindLabelKey;
  protected readonly actionStatusLabelKey = actionStatusLabelKey;
  protected readonly actionStatusToneValue = actionStatusToneValue;
  protected readonly effectivenessLabelKey = effectivenessLabelKey;
  protected readonly effectivenessToneValue = effectivenessToneValue;
  /** The action waiting for the delete confirmation. */
  protected readonly confirmRemove = signal<Action | null>(null);

  protected readonly adding = signal(false);
  protected readonly saving = signal(false);
  protected readonly busyId = signal<string | null>(null);

  protected readonly newKind = signal<ActionKind>('corrective');
  protected readonly newDescription = signal('');
  protected readonly newOwner = signal('');
  protected readonly newDue = signal('');
  protected readonly newReviewDue = signal('');

  protected readonly notesOpenId = signal<string | null>(null);
  protected readonly notesDraft = signal('');

  /** Effect is judged once the action is done (finding 21). */
  protected canJudge(action: Action): boolean {
    return canJudgeEffect(action.status);
  }

  protected removeConfirmed(): void {
    const action = this.confirmRemove();
    this.confirmRemove.set(null);
    if (action) {
      this.remove(action);
    }
  }

  /** Update controls are shown for the opened action and for actions blocking a status change. */
  protected isOpen(action: Action): boolean {
    return this.openId() === action.id || this.highlighted().includes(action.id);
  }

  protected toggleOpen(id: string): void {
    this.openId.update((open) => (open === id ? null : id));
  }

  protected overdue(action: Action): boolean {
    return isActionOverdue(action.due_at, action.status);
  }

  protected startAdd(): void {
    this.newKind.set('corrective');
    this.newDescription.set('');
    this.newOwner.set('');
    this.newDue.set('');
    this.newReviewDue.set('');
    this.adding.set(true);
  }

  protected cancelAdd(): void {
    this.adding.set(false);
  }

  protected submitAdd(): void {
    const orgId = this.orgId();
    const description = this.newDescription().trim();
    if (!orgId || !description || this.saving()) {
      return;
    }
    const body: ActionInput = {
      kind: this.newKind(),
      description,
      owner_user_id: this.newOwner() || undefined,
      due_at: this.newDue() || undefined,
      effectiveness_review_due_at: this.newReviewDue() || undefined,
    };
    this.saving.set(true);
    this.api.addAction(orgId, this.deviationId(), body).subscribe({
      next: (action) => {
        this.saving.set(false);
        this.adding.set(false);
        this.actionsChange.emit([...this.actions(), action]);
        this.changed.emit();
        this.notifications.success('deviations.actions.addedToast');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.onError(error);
      },
    });
  }

  protected changeStatus(action: Action, status: ActionStatus): void {
    if (status === action.status) {
      return;
    }
    this.patch(action, { status });
  }

  protected changeEffectiveness(action: Action, value: string): void {
    const effectiveness = (value || undefined) as ActionEffectiveness | undefined;
    if (effectiveness === action.effectiveness) {
      return;
    }
    this.patch(action, { effectiveness });
  }

  /** The `YYYY-MM-DD` part of a stored datetime, for a date input. */
  protected dayOf(value: string | null | undefined): string {
    return value ? value.slice(0, 10) : '';
  }

  /** Schedule, move or (when cleared) cancel the action's effectiveness review task. */
  protected changeReviewDue(action: Action, value: string): void {
    if ((value || '') === this.dayOf(action.effectiveness_review_due_at)) {
      return;
    }
    this.patch(action, { effectiveness_review_due_at: value || null });
  }

  protected markVerified(action: Action): void {
    this.patch(action, {
      status: 'verified',
      effectiveness: action.effectiveness ?? 'pending',
    });
  }

  protected toggleNotes(id: string): void {
    if (this.notesOpenId() === id) {
      this.notesOpenId.set(null);
      return;
    }
    const action = this.actions().find((a) => a.id === id);
    this.notesDraft.set(action?.notes ?? '');
    this.notesOpenId.set(id);
  }

  protected saveNotes(action: Action): void {
    this.patch(action, { notes: this.notesDraft().trim() }, () => this.notesOpenId.set(null));
  }

  protected remove(action: Action): void {
    const orgId = this.orgId();
    if (!orgId || this.busyId()) {
      return;
    }
    this.busyId.set(action.id);
    this.api.deleteAction(orgId, this.deviationId(), action.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.actionsChange.emit(this.actions().filter((a) => a.id !== action.id));
        this.changed.emit();
        this.notifications.info('deviations.actions.removedToast');
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.onError(error);
      },
    });
  }

  private patch(action: Action, body: ActionInput, onSuccess?: () => void): void {
    const orgId = this.orgId();
    if (!orgId || this.busyId()) {
      return;
    }
    this.busyId.set(action.id);
    this.api.updateAction(orgId, this.deviationId(), action.id, body).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.actionsChange.emit(this.actions().map((a) => (a.id === updated.id ? updated : a)));
        this.changed.emit();
        onSuccess?.();
        this.notifications.success('deviations.actions.savedToast');
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.onError(error);
      },
    });
  }

  /** Explain a failed change; a now-closed deviation also asks the host to reload. */
  private onError(error: unknown): void {
    notifyDeviationError(this.notifications, error);
    if (isDeviationClosedError(error)) {
      this.stale.emit();
    }
  }
}

import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { PeopleApi } from '../data/people-api';
import { gapActionLook, textOrNull, todayIso } from '../data/people-display';
import { peopleErrorKey } from '../data/people-errors';
import { GapAction, GapActionStatus } from '../data/people.models';
import { PeopleField } from './people-field';
import { DateInput } from '../../../shared/ui/date-input/date-input';

/** How an action can be closed by hand (re-assessment closes it automatically). */
type Evaluation = 'effective' | 'not_effective';

/**
 * The open actions on one competence gap (HS 7.2 c): what was planned, the linked
 * task or course assignment, the due date and status. Writers mark an action done,
 * record whether it worked ("Vurder effekt") or cancel it.
 */
@Component({
  selector: 'app-people-gap-actions',
  imports: [
    DateInput,
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    ConfirmDialog,
    MenuItem,
    OverflowMenu,
    StatusBadge,
    PeopleField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (actions().length) {
      <ul class="mt-1.5 flex flex-col gap-1" data-testid="gap-actions">
        @for (a of actions(); track a.id) {
          <li
            class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-tile bg-surface-2 px-2 py-1 text-meta"
          >
            <span class="font-semibold text-fg">{{
              'people.gapActions.kinds.' + a.kind | transloco
            }}</span>
            @if (a.training_assignment; as ta) {
              <a [routerLink]="ta.url" class="text-accent hover:underline">
                {{ ta.course.code ?? '' }} {{ ta.course.title ?? '' }}
              </a>
            } @else if (a.task; as task) {
              <a [routerLink]="task.url" class="text-accent hover:underline">
                {{ task.title ?? ('people.gapActions.openTask' | transloco) }}
              </a>
            } @else if (a.description) {
              <span class="min-w-0 truncate text-fg-muted">{{ a.description }}</span>
            }
            @if (a.due_date) {
              <span class="text-fg-muted">{{
                'people.checklists.due' | transloco: { date: (a.due_date | localDay) }
              }}</span>
            }
            <app-status-badge
              [meaning]="look(a.status).meaning"
              [value]="look(a.status).value"
              [labelKey]="'people.gapActionStatus.' + a.status"
            />
            @if (canEdit()) {
              <app-overflow-menu
                class="ml-auto"
                [iconOnly]="true"
                labelKey="people.gapActions.menu"
              >
                @if (a.status === 'open') {
                  <button appMenuItem type="button" (click)="setStatus(a, 'done')">
                    {{ 'people.gapActions.markDone' | transloco }}
                  </button>
                }
                <button appMenuItem type="button" (click)="evaluate(a)">
                  {{ 'people.gapActions.evaluate' | transloco }}
                </button>
                <button
                  appMenuItem
                  type="button"
                  [danger]="true"
                  (click)="setStatus(a, 'cancelled')"
                >
                  {{ 'people.gapActions.cancel' | transloco }}
                </button>
              </app-overflow-menu>
            }
          </li>
        }
      </ul>
    }

    <app-confirm-dialog
      [open]="evaluating() !== null"
      [title]="'people.gapActions.evaluateTitle' | transloco"
      [message]="'people.gapActions.evaluateMessage' | transloco"
      [confirmLabel]="'common.save' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      initialFocus="#cf-eval-effective"
      (confirmed)="saveEvaluation()"
      (cancelled)="evaluating.set(null)"
    >
      <div class="mt-4 flex flex-col gap-3">
        <fieldset class="flex flex-col gap-1.5">
          <legend class="sr-only">{{ 'people.gapActions.evaluate' | transloco }}</legend>
          @for (r of results; track r) {
            <label class="flex items-center gap-2 text-ui text-fg">
              <input
                type="radio"
                name="cf-eval"
                class="accent-[var(--accent)]"
                [id]="'cf-eval-' + r.replace('_', '-')"
                [checked]="result() === r"
                (change)="result.set(r)"
              />
              {{ 'people.gapActionStatus.' + r | transloco }}
            </label>
          }
        </fieldset>
        <app-people-field labelKey="people.gapActions.evaluatedOn" inputId="cf-eval-date">
          <app-date-input
            inputId="cf-eval-date"
            [value]="evaluatedOn()"
            (valueChange)="evaluatedOn.set($event ?? '')"
          />
        </app-people-field>
        <app-people-field labelKey="people.gapActions.evaluationNote" inputId="cf-eval-note">
          <textarea
            id="cf-eval-note"
            rows="2"
            maxlength="5000"
            [value]="note()"
            (input)="note.set($any($event.target).value)"
          ></textarea>
        </app-people-field>
      </div>
    </app-confirm-dialog>
  `,
})
export class GapActions {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly actions = input<readonly GapAction[]>([]);
  readonly canEdit = input(false);
  readonly changed = output<void>();

  protected readonly look = gapActionLook;
  protected readonly results: readonly Evaluation[] = ['effective', 'not_effective'];
  protected readonly evaluating = signal<GapAction | null>(null);
  protected readonly result = signal<Evaluation>('effective');
  protected readonly evaluatedOn = signal(todayIso());
  protected readonly note = signal('');
  protected readonly busy = signal(false);

  protected evaluate(action: GapAction): void {
    this.result.set('effective');
    this.evaluatedOn.set(todayIso());
    this.note.set('');
    this.evaluating.set(action);
  }

  protected saveEvaluation(): void {
    const action = this.evaluating();
    if (!action) {
      return;
    }
    this.update(action, {
      status: this.result(),
      evaluated_on: this.evaluatedOn() || null,
      evaluation_note: textOrNull(this.note()),
    });
  }

  protected setStatus(action: GapAction, status: GapActionStatus): void {
    this.update(action, { status });
  }

  private update(
    action: GapAction,
    body: {
      status: GapActionStatus;
      evaluated_on?: string | null;
      evaluation_note?: string | null;
    },
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateGapAction(orgId, action.id, body).subscribe({
      next: () => {
        this.busy.set(false);
        this.evaluating.set(null);
        this.notifications.success('people.notices.gapActionUpdated');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }
}

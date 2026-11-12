import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Task } from '../../../core/tasks/task.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { decodeAssignee, dueAtFromDay, taskStatusTone } from '../../../shared/tasks/task-display';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import { blankToNull } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';

/**
 * Follow-up actions of an exercise (platform tasks of kind `continuity_action`):
 * the list with status, assignee and due date, and a quick form to add one from the
 * lessons learned (`POST exercises/{id}/follow-ups`).
 */
@Component({
  selector: 'app-exercise-follow-ups',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Alert,
    AssigneeSelect,
    Badge,
    Button,
    Card,
    FieldHelp,
    FormField,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-1">
          <h2 class="font-display text-[15px] font-bold text-fg">
            {{ 'continuity.followUps.title' | transloco }}
          </h2>
          <app-field-help scope="continuity" page="exerciseDetail" field="follow_ups" />
        </div>
        @if (canAdd() && !formOpen()) {
          <app-button size="sm" variant="secondary" (click)="openForm()">
            <app-icon name="plus" [size]="14" />
            {{ 'continuity.followUps.add' | transloco }}
          </app-button>
        }
      </div>
      @if (tasks().length === 0) {
        <p class="text-[13px] text-fg-muted">{{ 'continuity.followUps.empty' | transloco }}</p>
      } @else {
        <ul class="flex flex-col gap-1.5" data-testid="follow-ups">
          @for (t of tasks(); track t.id) {
            <li
              class="flex flex-wrap items-center gap-2 rounded-tile border border-border px-3 py-2 text-[13px]"
            >
              <a [routerLink]="['/tasks', t.id]" class="min-w-0 flex-1 text-fg hover:underline">
                {{ t.title }}
              </a>
              <app-badge [tone]="statusTone(t.status)">
                {{ 'continuity.taskStatus.' + t.status | transloco }}
              </app-badge>
              @if (t.assignee?.name; as who) {
                <span class="text-fg-muted">{{ who }}</span>
              }
              @if (t.due_at) {
                <span [class.text-fail]="t.overdue" class="text-fg-subtle">
                  {{ 'continuity.followUps.due' | transloco: { date: (t.due_at | localDay) } }}
                </span>
              }
            </li>
          }
        </ul>
      }
      @if (formOpen()) {
        <form
          class="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2"
          (submit)="$event.preventDefault(); save()"
          novalidate
        >
          <div class="sm:col-span-2">
            <app-form-field [label]="'continuity.followUps.what' | transloco" inputId="fu-title">
              <input
                id="fu-title"
                type="text"
                maxlength="255"
                required
                [value]="title()"
                (input)="title.set($any($event.target).value)"
              />
            </app-form-field>
          </div>
          <app-form-field
            [label]="'continuity.followUps.assignee' | transloco"
            inputId="fu-assignee"
          >
            <app-assignee-select
              inputId="fu-assignee"
              [value]="assignee()"
              (valueChange)="assignee.set($event)"
            />
          </app-form-field>
          <app-form-field [label]="'continuity.followUps.dueOn' | transloco" inputId="fu-due">
            <input
              id="fu-due"
              type="date"
              [value]="due()"
              (input)="due.set($any($event.target).value)"
            />
          </app-form-field>
          <div class="sm:col-span-2">
            <app-form-field [label]="'continuity.followUps.details' | transloco" inputId="fu-desc">
              <textarea
                id="fu-desc"
                rows="2"
                maxlength="20000"
                [value]="description()"
                (input)="description.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
          @if (error(); as key) {
            <div class="sm:col-span-2">
              <app-alert>{{ key | transloco }}</app-alert>
            </div>
          }
          <div class="flex justify-end gap-2 sm:col-span-2">
            <app-button variant="ghost" (click)="formOpen.set(false)">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button type="submit" [loading]="busy()" [disabled]="!title().trim()">
              {{ 'continuity.followUps.add' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-card>
  `,
})
export class ExerciseFollowUps {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly exerciseId = input.required<string>();
  readonly tasks = input<readonly Task[]>([]);
  readonly canAdd = input(false);
  readonly added = output<void>();

  protected readonly statusTone = taskStatusTone;
  protected readonly formOpen = signal(false);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly assignee = signal('');
  protected readonly due = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected openForm(): void {
    this.title.set('');
    this.description.set('');
    this.assignee.set('');
    this.due.set('');
    this.error.set(null);
    this.formOpen.set(true);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const title = this.title().trim();
    if (!orgId || !title || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .addFollowUp(orgId, this.exerciseId(), {
        title,
        description: blankToNull(this.description()),
        assignee: decodeAssignee(this.assignee()),
        due_at: dueAtFromDay(this.due()),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.formOpen.set(false);
          this.notifications.success('continuity.followUps.added');
          this.added.emit();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(continuityErrorKey(err));
        },
      });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { Observable, map } from 'rxjs';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { taskErrorKey } from '../../core/tasks/task-errors';
import {
  AssigneeIn,
  CreateTaskRequest,
  Recurrence,
  TASK_PRIORITIES,
  TaskDetail,
  TaskPriority,
  UpdateRecurrenceRequest,
  UpdateTaskRequest,
} from '../../core/tasks/task.models';
import { TasksApi } from '../../core/tasks/tasks-api';
import { Alert } from '../ui/alert/alert';
import { Button } from '../ui/button/button';
import { FormField } from '../ui/form-field/form-field';
import { Icon } from '../ui/icon/icon';
import { AssigneeSelect } from './assignee-select';
import { TaskFieldHelp } from './guidance/task-field-help';
import { RecurrencePicker } from './recurrence-picker';
import { parseRrule } from './rrule';
import {
  dayOf,
  decodeAssignee,
  dueAtFromDay,
  encodeAssignee,
  startOfDay,
  todayDay,
} from './task-display';

/** What the form starts from. All fields optional: an empty value is a blank new task. */
export interface TaskFormValue {
  /** Edit this task (no recurrence fields). */
  readonly task?: TaskDetail | null;
  /** Edit this recurring series. */
  readonly recurrence?: Recurrence | null;
  /** New task: link it to this record. */
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  /** Shown as "Linked to …" for a new linked task. */
  readonly entityLabel?: string | null;
  /** New task: preselected assignee. */
  readonly assignee?: AssigneeIn | null;
  /** New task: start with "Repeat" switched on. */
  readonly recurring?: boolean;
  /** New task: a prefilled title / due day (`YYYY-MM-DD`). */
  readonly title?: string;
  readonly dueDay?: string;
}

export interface TaskFormResult {
  /** The created / updated task (for a new recurring task: its first occurrence). */
  readonly task?: TaskDetail;
  /** The updated series (when editing a series). */
  readonly recurrence?: Recurrence;
}

let nextId = 0;

/**
 * Create or edit a task (title, description, assignee, priority, start and due
 * dates, checklist), optionally as a recurring series with `<app-recurrence-picker>`,
 * or edit an existing series. Saves through `TasksApi` and emits the result; error
 * codes are shown inline in the active language.
 *
 *   <app-task-form [value]="{ entityType: 'deviation', entityId: id }"
 *     (saved)="onSaved($event)" (cancelled)="close()" />
 */
@Component({
  selector: 'app-task-form',
  imports: [
    TranslocoPipe,
    Alert,
    Button,
    FormField,
    Icon,
    AssigneeSelect,
    RecurrencePicker,
    TaskFieldHelp,
  ],
  providers: [provideTranslocoScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
      @if (errorKey(); as key) {
        <app-alert tone="error">{{ key | transloco }}</app-alert>
      }

      @if (linkedLabel(); as label) {
        <p class="flex items-center gap-1.5 text-[13px] text-fg-muted">
          <app-icon name="link" [size]="14" />
          {{ 'tasks.form.linkedTo' | transloco: { record: label } }}
        </p>
      }

      <div>
        <app-form-field [label]="'tasks.form.title' | transloco" [inputId]="id('title')">
          <input
            [id]="id('title')"
            type="text"
            maxlength="255"
            required
            autocomplete="off"
            [attr.aria-invalid]="titleMissing() || null"
            [value]="title()"
            (input)="title.set($any($event.target).value)"
          />
        </app-form-field>
        <app-task-field-help page="form" field="title" />
        @if (titleMissing()) {
          <p class="mt-1 text-[12.5px] text-fail">
            {{ 'tasks.errors.title_required' | transloco }}
          </p>
        }
      </div>

      <div>
        <app-form-field
          [label]="'tasks.form.description' | transloco"
          [inputId]="id('description')"
        >
          <textarea
            [id]="id('description')"
            rows="4"
            maxlength="20000"
            [value]="description()"
            (input)="description.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-task-field-help page="form" field="description" />
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <app-form-field [label]="'tasks.form.assignee' | transloco" [inputId]="id('assignee')">
            <app-assignee-select
              [inputId]="id('assignee')"
              [value]="assignee()"
              [currentName]="currentAssigneeName()"
              (valueChange)="assignee.set($event)"
            />
          </app-form-field>
          <app-task-field-help page="form" field="assignee" />
        </div>
        <div>
          <app-form-field [label]="'tasks.form.priority' | transloco" [inputId]="id('priority')">
            <select [id]="id('priority')" (change)="priority.set($any($event.target).value)">
              @for (p of priorities; track p) {
                <option [value]="p" [selected]="p === priority()">
                  {{ 'tasks.priority.' + p | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-task-field-help page="form" field="priority" />
        </div>
      </div>

      @if (!isSeries()) {
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <app-form-field
              [label]="(repeat() ? 'tasks.form.firstDue' : 'tasks.form.due') | transloco"
              [inputId]="id('due')"
            >
              <input
                [id]="id('due')"
                type="date"
                [attr.aria-invalid]="dueMissing() || null"
                [value]="dueDay()"
                (change)="dueDay.set($any($event.target).value)"
              />
            </app-form-field>
            <app-task-field-help page="form" field="due" />
            @if (dueMissing()) {
              <p class="mt-1 text-[12.5px] text-fail">
                {{ 'tasks.form.firstDueRequired' | transloco }}
              </p>
            }
          </div>
          @if (!repeat()) {
            <div>
              <app-form-field [label]="'tasks.form.start' | transloco" [inputId]="id('start')">
                <input
                  [id]="id('start')"
                  type="date"
                  [value]="startDay()"
                  (change)="startDay.set($any($event.target).value)"
                />
              </app-form-field>
              <app-task-field-help page="form" field="start" />
            </div>
          }
        </div>
      } @else {
        <div>
          <app-form-field [label]="'tasks.form.seriesStart' | transloco" [inputId]="id('due')">
            <input
              [id]="id('due')"
              type="date"
              [value]="dueDay()"
              (change)="dueDay.set($any($event.target).value)"
            />
          </app-form-field>
        </div>
      }

      @if (showChecklist()) {
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-[13px] font-semibold text-fg-muted">
            {{ 'tasks.form.checklist' | transloco }}
          </legend>
          @for (item of checklist(); track $index; let i = $index) {
            <div class="flex items-center gap-2">
              <input
                type="text"
                maxlength="500"
                class="h-9 min-w-0 flex-1 rounded-tile border border-border bg-bg px-3 text-[13.5px]"
                [attr.aria-label]="'tasks.form.checklistItem' | transloco: { n: i + 1 }"
                [value]="item"
                (input)="setChecklistItem(i, $any($event.target).value)"
              />
              <button
                type="button"
                class="rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail"
                [attr.aria-label]="'tasks.form.removeChecklistItem' | transloco: { n: i + 1 }"
                (click)="removeChecklistItem(i)"
              >
                <app-icon name="x" [size]="14" />
              </button>
            </div>
          }
          <div>
            <app-button variant="ghost" size="sm" (click)="addChecklistItem()">
              <app-icon name="plus" [size]="14" />
              {{ 'tasks.form.addChecklistItem' | transloco }}
            </app-button>
          </div>
        </fieldset>
      }

      @if (canRepeat()) {
        <label class="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
          <input
            type="checkbox"
            [checked]="repeat()"
            (change)="repeat.set($any($event.target).checked)"
          />
          {{ 'tasks.form.repeat' | transloco }}
        </label>
        <app-task-field-help page="form" field="repeat" />
      }

      @if (repeat() || isSeries()) {
        <app-recurrence-picker [idPrefix]="id('rrule')" [(rrule)]="rrule" />
        <div class="max-w-[220px]">
          <app-form-field [label]="'tasks.form.leadDays' | transloco" [inputId]="id('lead')">
            <input
              [id]="id('lead')"
              type="number"
              min="0"
              max="366"
              [value]="leadDays()"
              (change)="setLeadDays($any($event.target).value)"
            />
          </app-form-field>
          <app-task-field-help page="form" field="leadDays" />
        </div>
      }

      <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <app-button variant="secondary" [disabled]="saving()" (click)="cancelled.emit()">
          {{ 'tasks.common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="saving()" [disabled]="saving()">
          {{ submitKey() | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class TaskForm {
  private readonly api = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly value = input<TaskFormValue | null>(null);
  readonly saved = output<TaskFormResult>();
  readonly cancelled = output<void>();

  protected readonly priorities = TASK_PRIORITIES;
  private readonly uid = `task-form-${nextId++}`;

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly assignee = signal('');
  protected readonly priority = signal<TaskPriority>('normal');
  protected readonly dueDay = signal('');
  protected readonly startDay = signal('');
  protected readonly checklist = signal<readonly string[]>([]);
  protected readonly repeat = signal(false);
  protected readonly rrule = signal('FREQ=MONTHLY');
  protected readonly leadDays = signal(7);

  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly isEdit = computed(() => !!this.value()?.task);
  protected readonly isSeries = computed(() => !!this.value()?.recurrence);
  protected readonly canRepeat = computed(() => !this.isEdit() && !this.isSeries());
  /** The checklist is edited here for new tasks and series; a task's own checklist lives on its page. */
  protected readonly showChecklist = computed(() => !this.isEdit());
  protected readonly linkedLabel = computed(() => {
    const v = this.value();
    if (v?.task) {
      return null;
    }
    return v?.entityLabel ?? v?.recurrence?.entity?.title ?? null;
  });
  protected readonly currentAssigneeName = computed(
    () => this.value()?.task?.assignee?.name ?? this.value()?.recurrence?.assignee?.name ?? null,
  );

  protected readonly titleMissing = computed(() => this.submitted() && !this.title().trim());
  protected readonly dueMissing = computed(
    () => this.submitted() && this.repeat() && !this.isSeries() && !this.dueDay(),
  );
  protected readonly submitKey = computed(() =>
    this.isEdit() || this.isSeries() ? 'tasks.form.saveChanges' : 'tasks.form.create',
  );

  constructor() {
    effect(() => {
      const value = this.value();
      untracked(() => this.reset(value));
    });
  }

  protected id(part: string): string {
    return `${this.uid}-${part}`;
  }

  protected setChecklistItem(index: number, text: string): void {
    this.checklist.update((items) => items.map((item, i) => (i === index ? text : item)));
  }

  protected addChecklistItem(): void {
    this.checklist.update((items) => [...items, '']);
  }

  protected removeChecklistItem(index: number): void {
    this.checklist.update((items) => items.filter((_, i) => i !== index));
  }

  protected setLeadDays(value: string): void {
    const n = Math.floor(Number(value));
    this.leadDays.set(Number.isFinite(n) ? Math.min(366, Math.max(0, n)) : 7);
  }

  protected save(): void {
    this.submitted.set(true);
    this.errorKey.set(null);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || this.titleMissing() || this.dueMissing()) {
      return;
    }
    if ((this.repeat() || this.isSeries()) && !parseRrule(this.rrule())) {
      this.errorKey.set('tasks.errors.invalid_rrule');
      return;
    }
    const request = this.request(orgId);
    if (!request) {
      // Nothing changed: treat as saved without a round trip.
      const v = this.value();
      this.saved.emit({ task: v?.task ?? undefined, recurrence: v?.recurrence ?? undefined });
      return;
    }
    this.saving.set(true);
    request.subscribe({
      next: (result) => {
        this.saving.set(false);
        this.saved.emit(result);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorKey.set(taskErrorKey(error));
      },
    });
  }

  private request(orgId: string): Observable<TaskFormResult> | null {
    const v = this.value();
    const title = this.title().trim();
    const description = this.description().trim() || null;
    const assignee = decodeAssignee(this.assignee());
    const checklist = this.checklist()
      .map((item) => item.trim())
      .filter(Boolean);

    if (v?.recurrence) {
      const rec = v.recurrence;
      const body: Record<string, unknown> = {};
      if (title !== rec.title) body['title'] = title;
      if (description !== (rec.description ?? null)) body['description'] = description;
      if (this.assignee() !== encodeAssignee(rec.assignee)) body['assignee'] = assignee;
      if (this.priority() !== rec.priority) body['priority'] = this.priority();
      if (JSON.stringify(checklist) !== JSON.stringify(rec.checklist))
        body['checklist'] = checklist;
      if (this.rrule() !== rec.rrule) body['rrule'] = this.rrule();
      const dtstart = dueAtFromDay(this.dueDay());
      if (dtstart && this.dueDay() !== dayOf(rec.dtstart)) body['dtstart'] = dtstart;
      if (this.leadDays() !== rec.lead_days) body['lead_days'] = this.leadDays();
      if (Object.keys(body).length === 0) {
        return null;
      }
      return this.api
        .updateRecurrence(orgId, rec.id, body as UpdateRecurrenceRequest)
        .pipe(map((recurrence) => ({ recurrence })));
    }

    if (v?.task) {
      const task = v.task;
      const body: Record<string, unknown> = {};
      if (title !== task.title) body['title'] = title;
      if (description !== (task.description ?? null)) body['description'] = description;
      if (this.assignee() !== encodeAssignee(task.assignee)) body['assignee'] = assignee;
      if (this.priority() !== task.priority) body['priority'] = this.priority();
      if (this.dueDay() !== dayOf(task.due_at)) body['due_at'] = dueAtFromDay(this.dueDay());
      if (this.startDay() !== dayOf(task.start_at)) {
        body['start_at'] = this.startDay() ? startOfDay(this.startDay()) : null;
      }
      if (Object.keys(body).length === 0) {
        return null;
      }
      return this.api
        .update(orgId, task.id, body as UpdateTaskRequest)
        .pipe(map((updated) => ({ task: updated })));
    }

    const body: CreateTaskRequest = {
      title,
      description,
      entity_type: v?.entityType ?? null,
      entity_id: v?.entityId ?? null,
      assignee,
      priority: this.priority(),
      due_at: dueAtFromDay(this.dueDay()),
      start_at: !this.repeat() && this.startDay() ? startOfDay(this.startDay()) : null,
      checklist,
      recurrence: this.repeat()
        ? {
            rrule: this.rrule(),
            dtstart: dueAtFromDay(this.dueDay() || todayDay()) ?? `${todayDay()}T23:59:59`,
            lead_days: this.leadDays(),
          }
        : null,
    };
    return this.api.create(orgId, body).pipe(map((task) => ({ task })));
  }

  private reset(value: TaskFormValue | null): void {
    this.submitted.set(false);
    this.errorKey.set(null);
    const task = value?.task;
    const rec = value?.recurrence;
    const source = task ?? rec;
    this.title.set(source?.title ?? value?.title ?? '');
    this.description.set(source?.description ?? '');
    this.assignee.set(encodeAssignee(source ? source.assignee : (value?.assignee ?? null)));
    this.priority.set(source?.priority ?? 'normal');
    this.dueDay.set(task ? dayOf(task.due_at) : rec ? dayOf(rec.dtstart) : (value?.dueDay ?? ''));
    this.startDay.set(task ? dayOf(task.start_at) : '');
    this.checklist.set(rec ? [...rec.checklist] : []);
    this.repeat.set(!task && !rec && !!value?.recurring);
    this.rrule.set(rec?.rrule ?? 'FREQ=MONTHLY');
    this.leadDays.set(rec?.lead_days ?? 7);
  }
}

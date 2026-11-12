import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { localize } from '../../../core/records/localized';
import {
  APPROVAL_MODES,
  ASSIGNEE_TYPES,
  ApprovalDef,
  LocalizedText,
  NOTIFY_TYPES,
  NotifyDef,
  StateDef,
  TASK_PRIORITIES,
  TaskTemplateDef,
  TransitionDef,
} from '../../../core/records/record.models';
import { Badge } from '../../../shared/ui/badge/badge';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { GUARD_OPTIONS, ROLE_OPTIONS } from '../designer-model';
import { parseList } from '../draft-store';
import { RecordsFieldHelp } from '../guidance/records-guidance';
import { LocalizedInput } from './localized-input';

let nextId = 0;

/**
 * One transition in the workflow designer: from / to states, label, who may
 * run it (roles, permissions, owner), required fields, comment, guards, an
 * approval step (single / all / quorum, segregation of duties), automatic
 * tasks and notifications (contracts 7.2). Emits a whole new `TransitionDef`.
 * List inputs (fields, permissions, guards) are comma-separated and commit on
 * change, so typing a comma never fights the model.
 */
@Component({
  selector: 'app-transition-editor',
  imports: [FormsModule, TranslocoPipe, Badge, FormField, Icon, LocalizedInput, RecordsFieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = transition();
    <div
      class="rounded-tile border bg-surface"
      [class]="issues().length ? 'border-fail/50' : 'border-border'"
    >
      <div class="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 text-left"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="id + '-body'"
          (click)="toggled.emit()"
        >
          <span class="flex text-fg-subtle transition-transform" [class.rotate-90]="expanded()">
            <app-icon name="chevron" [size]="14" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13.5px] font-semibold text-fg">
              {{ label(t.label) || t.key }}
            </span>
            <span class="block truncate text-[11.5px] text-fg-subtle">
              {{ fromNames() }} → {{ stateName(t.to) }}
            </span>
          </span>
          @if (t.approval) {
            <app-badge tone="accent">{{
              'records.transitions.approvalBadge' | transloco
            }}</app-badge>
          }
        </button>
        @if (!readonly()) {
          <button
            type="button"
            class="flex rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail"
            [attr.aria-label]="
              'records.transitions.remove' | transloco: { name: label(t.label) || t.key }
            "
            (click)="remove.emit()"
          >
            <app-icon name="trash" [size]="14" />
          </button>
        }
      </div>

      @if (issues().length) {
        <ul class="px-3 pb-2 text-[12px] font-medium text-fail">
          @for (code of issues(); track code) {
            <li>{{ 'records.issues.' + code | transloco }}</li>
          }
        </ul>
      }

      @if (expanded()) {
        <div [id]="id + '-body'" class="border-t border-border px-3 py-4">
          <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2" [disabled]="readonly()">
            <div class="sm:col-span-2">
              <app-localized-input
                [label]="'records.transitions.label' | transloco"
                [required]="true"
                [value]="t.label"
                (valueChange)="patch({ label: $event ?? '' })"
              />
            </div>
            <app-form-field [label]="'records.transitions.key' | transloco" [inputId]="id + '-key'">
              <input
                [id]="id + '-key'"
                type="text"
                autocomplete="off"
                maxlength="64"
                class="font-mono"
                [ngModel]="t.key"
                (ngModelChange)="patch({ key: $event })"
              />
            </app-form-field>
            <app-form-field [label]="'records.transitions.to' | transloco" [inputId]="id + '-to'">
              <select [id]="id + '-to'" [ngModel]="t.to" (ngModelChange)="patch({ to: $event })">
                @for (state of states(); track state.key) {
                  <option [value]="state.key">{{ stateName(state.key) }}</option>
                }
              </select>
            </app-form-field>

            <fieldset class="sm:col-span-2">
              <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                {{ 'records.transitions.from' | transloco }}
              </legend>
              <div class="flex flex-wrap gap-x-4 gap-y-2">
                @for (state of states(); track state.key) {
                  <label class="flex items-center gap-2 text-[13px] text-fg">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="t.from.includes(state.key)"
                      (change)="toggleFrom(state.key)"
                    />
                    {{ stateName(state.key) }}
                  </label>
                }
              </div>
            </fieldset>

            <app-form-field
              [label]="'records.transitions.requiredFields' | transloco"
              [inputId]="id + '-req'"
            >
              <input
                [id]="id + '-req'"
                type="text"
                autocomplete="off"
                class="font-mono"
                [attr.list]="id + '-fields'"
                [value]="(t.required_fields ?? []).join(', ')"
                (change)="patchList('required_fields', $event)"
              />
              <datalist [id]="id + '-fields'">
                @for (key of fieldKeys(); track key) {
                  <option [value]="key"></option>
                }
              </datalist>
              <app-records-field-help page="workflow" field="required_fields" />
            </app-form-field>

            <app-form-field
              [label]="'records.transitions.guards' | transloco"
              [inputId]="id + '-guards'"
            >
              <input
                [id]="id + '-guards'"
                type="text"
                autocomplete="off"
                class="font-mono"
                [attr.list]="id + '-guard-list'"
                [value]="(t.guards ?? []).join(', ')"
                (change)="patchList('guards', $event)"
              />
              <datalist [id]="id + '-guard-list'">
                @for (guard of guardOptions; track guard) {
                  <option [value]="guard"></option>
                }
              </datalist>
              <app-records-field-help page="workflow" field="guards" />
            </app-form-field>

            <label class="flex items-center gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [ngModel]="!!t.require_comment"
                (ngModelChange)="patch({ require_comment: $event })"
              />
              {{ 'records.transitions.requireComment' | transloco }}
            </label>
            <label class="flex items-center gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [ngModel]="!!t.allow_owner"
                (ngModelChange)="patch({ allow_owner: $event })"
              />
              {{ 'records.transitions.allowOwner' | transloco }}
            </label>

            <fieldset class="sm:col-span-2">
              <legend class="mb-1 text-[13px] font-semibold text-fg-muted">
                {{ 'records.transitions.allowedRoles' | transloco }}
              </legend>
              <p class="mb-1.5 text-[11.5px] text-fg-subtle">
                {{ 'records.transitions.allowedHelp' | transloco }}
              </p>
              <div class="flex flex-wrap gap-x-4 gap-y-2">
                @for (role of roles; track role) {
                  <label class="flex items-center gap-2 text-[13px] text-fg">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="(t.allowed_roles ?? []).includes(role)"
                      (change)="toggleRole('allowed_roles', role)"
                    />
                    {{ roleKey(role) | transloco }}
                  </label>
                }
              </div>
            </fieldset>

            <div class="sm:col-span-2">
              <app-form-field
                [label]="'records.transitions.allowedPermissions' | transloco"
                [inputId]="id + '-perms'"
              >
                <input
                  [id]="id + '-perms'"
                  type="text"
                  autocomplete="off"
                  class="font-mono"
                  placeholder="deviations:write"
                  [value]="(t.allowed_permissions ?? []).join(', ')"
                  (change)="patchList('allowed_permissions', $event)"
                />
              </app-form-field>
            </div>

            <!-- Approval -->
            <div class="rounded-tile border border-border p-3 sm:col-span-2">
              <label class="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="!!t.approval"
                  (change)="toggleApproval()"
                />
                {{ 'records.transitions.approval' | transloco }}
              </label>
              <app-records-field-help page="workflow" field="approval" />
              @if (t.approval; as approval) {
                <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <app-form-field
                    [label]="'records.transitions.approvalMode' | transloco"
                    [inputId]="id + '-mode'"
                  >
                    <select
                      [id]="id + '-mode'"
                      [ngModel]="approval.mode"
                      (ngModelChange)="
                        patchApproval({
                          mode: $event,
                          quorum: $event === 'quorum' ? (approval.quorum ?? 2) : null,
                        })
                      "
                    >
                      @for (mode of approvalModes; track mode) {
                        <option [value]="mode">
                          {{ 'records.approvalModes.' + mode | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  @if (approval.mode === 'quorum') {
                    <app-form-field
                      [label]="'records.transitions.quorum' | transloco"
                      [inputId]="id + '-quorum'"
                    >
                      <input
                        [id]="id + '-quorum'"
                        type="number"
                        min="1"
                        max="20"
                        [ngModel]="approval.quorum ?? 2"
                        (ngModelChange)="patchApproval({ quorum: toInt($event) })"
                      />
                    </app-form-field>
                  }
                  <fieldset class="sm:col-span-2">
                    <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                      {{ 'records.transitions.approverRoles' | transloco }}
                    </legend>
                    <div class="flex flex-wrap gap-x-4 gap-y-2">
                      @for (role of roles; track role) {
                        <label class="flex items-center gap-2 text-[13px] text-fg">
                          <input
                            type="checkbox"
                            class="h-4 w-4 accent-[var(--accent)]"
                            [checked]="approval.approver_roles.includes(role)"
                            (change)="toggleApproverRole(role)"
                          />
                          {{ roleKey(role) | transloco }}
                        </label>
                      }
                    </div>
                  </fieldset>
                  <app-form-field
                    [label]="'records.transitions.approverField' | transloco"
                    [inputId]="id + '-approver-field'"
                  >
                    <input
                      [id]="id + '-approver-field'"
                      type="text"
                      autocomplete="off"
                      class="font-mono"
                      [attr.list]="id + '-user-fields'"
                      [ngModel]="approval.approver_user_field ?? ''"
                      (ngModelChange)="patchApproval({ approver_user_field: $event || null })"
                    />
                    <datalist [id]="id + '-user-fields'">
                      @for (key of userFieldKeys(); track key) {
                        <option [value]="key"></option>
                      }
                    </datalist>
                  </app-form-field>
                  <label class="flex items-center gap-2 self-end pb-2.5 text-[13.5px] text-fg">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [ngModel]="approval.segregation_of_duties"
                      (ngModelChange)="patchApproval({ segregation_of_duties: $event })"
                    />
                    {{ 'records.transitions.sod' | transloco }}
                  </label>
                </div>
              }
            </div>

            <!-- Automatic tasks -->
            <div class="rounded-tile border border-border p-3 sm:col-span-2">
              <p class="text-[13.5px] font-semibold text-fg">
                {{ 'records.transitions.tasks' | transloco }}
              </p>
              <app-records-field-help page="workflow" field="create_tasks" />
              <ul class="mt-2 flex flex-col gap-3">
                @for (task of t.create_tasks ?? []; track $index; let i = $index) {
                  <li class="grid grid-cols-1 gap-2 rounded-tile bg-surface-2 p-2 sm:grid-cols-2">
                    <div class="sm:col-span-2">
                      <app-localized-input
                        [label]="'records.transitions.taskTitle' | transloco"
                        [required]="true"
                        [value]="task.title"
                        (valueChange)="patchTask(i, { title: $event ?? '' })"
                      />
                    </div>
                    <app-form-field
                      [label]="'records.transitions.dueInDays' | transloco"
                      [inputId]="id + '-due-' + i"
                    >
                      <input
                        [id]="id + '-due-' + i"
                        type="number"
                        min="0"
                        max="3650"
                        [ngModel]="task.due_in_days ?? null"
                        (ngModelChange)="patchTask(i, { due_in_days: toInt($event) })"
                      />
                    </app-form-field>
                    <app-form-field
                      [label]="'records.transitions.priority' | transloco"
                      [inputId]="id + '-prio-' + i"
                    >
                      <select
                        [id]="id + '-prio-' + i"
                        [ngModel]="task.priority ?? 'normal'"
                        (ngModelChange)="patchTask(i, { priority: $event })"
                      >
                        @for (p of priorities; track p) {
                          <option [value]="p">{{ 'records.priorities.' + p | transloco }}</option>
                        }
                      </select>
                    </app-form-field>
                    <app-form-field
                      [label]="'records.transitions.assignee' | transloco"
                      [inputId]="id + '-asg-' + i"
                    >
                      <select
                        [id]="id + '-asg-' + i"
                        [ngModel]="task.assignee?.type ?? ''"
                        (ngModelChange)="
                          patchTask(i, { assignee: $event ? { type: $event, value: null } : null })
                        "
                      >
                        <option value="">{{ 'records.transitions.unassigned' | transloco }}</option>
                        @for (type of assigneeTypes; track type) {
                          <option [value]="type">
                            {{ 'records.assigneeTypes.' + type | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                    @if (task.assignee && task.assignee.type !== 'owner') {
                      <app-form-field
                        [label]="'records.transitions.assigneeValue' | transloco"
                        [inputId]="id + '-asv-' + i"
                      >
                        <input
                          [id]="id + '-asv-' + i"
                          type="text"
                          autocomplete="off"
                          class="font-mono"
                          [attr.list]="
                            task.assignee.type === 'role' ? id + '-roles' : id + '-user-fields'
                          "
                          [ngModel]="task.assignee.value ?? ''"
                          (ngModelChange)="
                            patchTask(i, { assignee: { type: task.assignee.type, value: $event } })
                          "
                        />
                      </app-form-field>
                    }
                    @if (!readonly()) {
                      <div class="sm:col-span-2">
                        <button
                          type="button"
                          class="text-[12.5px] font-semibold text-fail hover:underline"
                          (click)="removeTask(i)"
                        >
                          {{ 'records.transitions.removeTask' | transloco }}
                        </button>
                      </div>
                    }
                  </li>
                }
              </ul>
              @if (!readonly()) {
                <button
                  type="button"
                  class="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
                  (click)="addTask()"
                >
                  <app-icon name="plus" [size]="14" />
                  {{ 'records.transitions.addTask' | transloco }}
                </button>
              }
            </div>

            <!-- Notifications -->
            <div class="rounded-tile border border-border p-3 sm:col-span-2">
              <p class="text-[13.5px] font-semibold text-fg">
                {{ 'records.transitions.notify' | transloco }}
              </p>
              <ul class="mt-2 flex flex-col gap-2">
                @for (n of t.notify ?? []; track $index; let i = $index) {
                  <li class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <app-form-field
                      [label]="'records.transitions.notifyType' | transloco"
                      [inputId]="id + '-nt-' + i"
                    >
                      <select
                        [id]="id + '-nt-' + i"
                        [ngModel]="n.type"
                        (ngModelChange)="patchNotify(i, { type: $event, value: null })"
                      >
                        @for (type of notifyTypes; track type) {
                          <option [value]="type">
                            {{ 'records.notifyTypes.' + type | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                    @if (n.type === 'role' || n.type === 'user_field' || n.type === 'user') {
                      <app-form-field
                        [label]="'records.transitions.notifyValue' | transloco"
                        [inputId]="id + '-nv-' + i"
                      >
                        <input
                          [id]="id + '-nv-' + i"
                          type="text"
                          autocomplete="off"
                          class="font-mono"
                          [attr.list]="
                            n.type === 'role'
                              ? id + '-roles'
                              : n.type === 'user_field'
                                ? id + '-user-fields'
                                : null
                          "
                          [ngModel]="n.value ?? ''"
                          (ngModelChange)="patchNotify(i, { type: n.type, value: $event })"
                        />
                      </app-form-field>
                    } @else {
                      <span></span>
                    }
                    @if (!readonly()) {
                      <button
                        type="button"
                        class="flex self-end rounded-[8px] p-2 text-fg-subtle hover:bg-surface-2 hover:text-fail"
                        [attr.aria-label]="'records.transitions.removeNotify' | transloco"
                        (click)="removeNotify(i)"
                      >
                        <app-icon name="x" [size]="14" />
                      </button>
                    }
                  </li>
                }
              </ul>
              <datalist [id]="id + '-roles'">
                @for (role of roles; track role) {
                  <option [value]="role"></option>
                }
              </datalist>
              @if (!readonly()) {
                <button
                  type="button"
                  class="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
                  (click)="addNotify()"
                >
                  <app-icon name="plus" [size]="14" />
                  {{ 'records.transitions.addNotify' | transloco }}
                </button>
              }
            </div>
          </fieldset>
        </div>
      }
    </div>
  `,
})
export class TransitionEditor {
  private readonly language = inject(LanguageService);

  readonly transition = input.required<TransitionDef>();
  readonly states = input<readonly StateDef[]>([]);
  /** Field keys of the bound record type (suggestions for required fields). */
  readonly fieldKeys = input<readonly string[]>([]);
  /** Keys of `user` fields (suggestions for approver / assignee fields). */
  readonly userFieldKeys = input<readonly string[]>([]);
  readonly issues = input<readonly string[]>([]);
  readonly expanded = input(false);
  readonly readonly = input(false);

  readonly transitionChange = output<TransitionDef>();
  readonly remove = output<void>();
  readonly toggled = output<void>();

  protected readonly id = `transition-editor-${nextId++}`;
  protected readonly roles = ROLE_OPTIONS;
  protected readonly guardOptions = GUARD_OPTIONS;
  protected readonly approvalModes = APPROVAL_MODES;
  protected readonly assigneeTypes = ASSIGNEE_TYPES;
  protected readonly notifyTypes = NOTIFY_TYPES;
  protected readonly priorities = TASK_PRIORITIES;
  protected roleKey(role: string): string {
    return `records.roles.${role}`;
  }

  private readonly lang = this.language.active;

  protected readonly fromNames = computed(() =>
    this.transition()
      .from.map((key) => this.stateName(key))
      .join(', '),
  );

  protected label(value: LocalizedText | null | undefined): string {
    return localize(value, this.lang());
  }

  protected stateName(key: string): string {
    const state = this.states().find((s) => s.key === key);
    return localize(state?.label, this.lang()) || key;
  }

  protected patch(changes: Partial<TransitionDef>): void {
    this.transitionChange.emit({ ...this.transition(), ...changes });
  }

  protected patchList(
    key: 'required_fields' | 'guards' | 'allowed_permissions',
    event: Event,
  ): void {
    this.patch({ [key]: parseList((event.target as HTMLInputElement).value) });
  }

  protected toInt(raw: unknown): number | null {
    if (raw === '' || raw === null || raw === undefined) {
      return null;
    }
    const n = Math.trunc(Number(raw));
    return Number.isFinite(n) ? n : null;
  }

  protected toggleFrom(state: string): void {
    const from = this.transition().from;
    this.patch({ from: from.includes(state) ? from.filter((k) => k !== state) : [...from, state] });
  }

  protected toggleRole(key: 'allowed_roles', role: string): void {
    const roles = this.transition()[key] ?? [];
    this.patch({
      [key]: roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role],
    });
  }

  protected toggleApproval(): void {
    this.patch({
      approval: this.transition().approval
        ? null
        : { mode: 'single', approver_roles: ['quality_manager'], segregation_of_duties: true },
    });
  }

  protected patchApproval(changes: Partial<ApprovalDef>): void {
    const approval = this.transition().approval;
    if (approval) {
      this.patch({ approval: { ...approval, ...changes } });
    }
  }

  protected toggleApproverRole(role: string): void {
    const roles = this.transition().approval?.approver_roles ?? [];
    this.patchApproval({
      approver_roles: roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role],
    });
  }

  protected addTask(): void {
    this.patch({
      create_tasks: [
        ...(this.transition().create_tasks ?? []),
        { title: '', due_in_days: 7, priority: 'normal', assignee: { type: 'owner' } },
      ],
    });
  }

  protected patchTask(index: number, changes: Partial<TaskTemplateDef>): void {
    this.patch({
      create_tasks: (this.transition().create_tasks ?? []).map((task, i) =>
        i === index ? { ...task, ...changes } : task,
      ),
    });
  }

  protected removeTask(index: number): void {
    this.patch({
      create_tasks: (this.transition().create_tasks ?? []).filter((_, i) => i !== index),
    });
  }

  protected addNotify(): void {
    this.patch({ notify: [...(this.transition().notify ?? []), { type: 'owner' }] });
  }

  protected patchNotify(index: number, next: NotifyDef): void {
    this.patch({
      notify: (this.transition().notify ?? []).map((n, i) => (i === index ? next : n)),
    });
  }

  protected removeNotify(index: number): void {
    this.patch({ notify: (this.transition().notify ?? []).filter((_, i) => i !== index) });
  }
}

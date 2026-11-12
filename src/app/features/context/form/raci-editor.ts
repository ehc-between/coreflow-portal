import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { RACI_ROLES, Raci, RaciAssignment } from '../data/context.models';
import { decodeAssignee } from '../detail/communicate-panel';

/** Warnings for a draft assignment list (same rules as the server's). */
export function draftRaciWarnings(assignments: readonly RaciAssignment[]): string[] {
  const warnings: string[] = [];
  if (!assignments.some((a) => a.raci === 'A')) {
    warnings.push('no_accountable');
  }
  if (!assignments.some((a) => a.raci === 'R')) {
    warnings.push('no_responsible');
  }
  return warnings;
}

/**
 * Editor for a responsibility's RACI assignments: each row is a person, role or
 * department with one letter. Exactly one A is allowed (checked on save).
 */
@Component({
  selector: 'app-context-raci-editor',
  imports: [TranslocoPipe, AssigneeSelect, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
        {{ 'context.fields.assignments' | transloco }}
      </legend>
      <p class="mb-2 text-[12.5px] text-fg-muted">{{ 'context.raci.legend' | transloco }}</p>
      <ul class="flex flex-col gap-2">
        @for (a of assignments(); track $index; let i = $index) {
          <li class="flex flex-wrap items-center gap-2 rounded-tile border border-border p-2">
            <label class="sr-only" [attr.for]="'raci-who-' + i">{{
              'context.raci.who' | transloco
            }}</label>
            <app-form-field class="min-w-[180px] flex-1">
              <app-assignee-select
                [inputId]="'raci-who-' + i"
                [value]="a.type + ':' + a.value"
                [currentName]="a.name"
                (valueChange)="setWho(i, $event)"
              />
            </app-form-field>
            <label class="sr-only" [attr.for]="'raci-role-' + i">{{
              'context.raci.letter' | transloco
            }}</label>
            <app-form-field class="w-[170px]">
              <select [id]="'raci-role-' + i" (change)="setRaci(i, $any($event.target).value)">
                @for (r of roles; track r) {
                  <option [value]="r" [selected]="r === a.raci">
                    {{ r }} · {{ 'context.raci.roles.' + r | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <button
              type="button"
              class="rounded-[6px] p-1.5 text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="'context.raci.remove' | transloco"
              (click)="remove(i)"
            >
              <app-icon name="trash" [size]="14" />
            </button>
          </li>
        }
      </ul>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <label class="sr-only" for="raci-add">{{ 'context.raci.add' | transloco }}</label>
        @for (k of [addKey()]; track k) {
          <app-form-field class="min-w-[220px]">
            <app-assignee-select inputId="raci-add" value="" (valueChange)="add($event)" />
          </app-form-field>
        }
        <span class="text-[12px] text-fg-subtle">{{ 'context.raci.addHint' | transloco }}</span>
      </div>
      @for (warning of warnings(); track warning) {
        <p class="mt-2 text-[12.5px] text-warn" role="status">
          {{ 'context.raci.warningText.' + warning | transloco }}
        </p>
      }
    </fieldset>
  `,
})
export class RaciEditor {
  readonly assignments = input.required<readonly RaciAssignment[]>();
  readonly assignmentsChange = output<readonly RaciAssignment[]>();

  protected readonly roles = RACI_ROLES;
  /** Bumped after each add so the "add" select resets to empty. */
  protected readonly addKey = signal(0);
  protected readonly warnings = computed(() => draftRaciWarnings(this.assignments()));

  protected setWho(index: number, encoded: string): void {
    const who = decodeAssignee(encoded);
    if (!who) {
      this.remove(index);
      return;
    }
    this.emit(this.assignments().map((a, i) => (i === index ? { ...a, ...who, name: null } : a)));
  }

  protected setRaci(index: number, raci: Raci): void {
    this.emit(this.assignments().map((a, i) => (i === index ? { ...a, raci } : a)));
  }

  protected remove(index: number): void {
    this.emit(this.assignments().filter((_, i) => i !== index));
  }

  protected add(encoded: string): void {
    const who = decodeAssignee(encoded);
    if (!who) {
      return;
    }
    const raci: Raci = this.assignments().some((a) => a.raci === 'R') ? 'C' : 'R';
    this.emit([...this.assignments(), { ...who, raci, name: null }]);
    this.addKey.update((k) => k + 1);
  }

  private emit(next: readonly RaciAssignment[]): void {
    this.assignmentsChange.emit(next);
  }
}

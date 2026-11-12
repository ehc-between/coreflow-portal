import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { optionId } from '../objectives-display';

/**
 * A plain `<select>` of the org's people (`kind="user"`) or departments
 * (`kind="department"`), from the shared assignee options. Emits the raw id
 * (or null for "none"). A current value that is not in the list (e.g. the caller
 * cannot list members) stays selectable under `currentName`.
 */
@Component({
  selector: 'app-objectives-owner-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [attr.aria-describedby]="describedBy() || null"
      (change)="emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">
        {{
          (kind() === 'user' ? 'objectives.form.noOwner' : 'objectives.form.noDepartment')
            | transloco
        }}
      </option>
      @if (orphan()) {
        <option [value]="value()" selected>{{ currentName() || value() }}</option>
      }
      @for (o of choices(); track o.id) {
        <option [value]="o.id" [selected]="o.id === value()">{{ o.label }}</option>
      }
    </select>
  `,
})
export class OwnerSelect {
  private readonly options = inject(AssigneeOptionsService);

  readonly kind = input<'user' | 'department'>('user');
  readonly inputId = input('');
  readonly describedBy = input('');
  readonly value = input<string | null>(null);
  readonly currentName = input<string | null>(null);
  readonly valueChange = output<string | null>();

  protected readonly choices = computed(() => {
    const all = this.options.options();
    const list = this.kind() === 'user' ? all.users : all.departments;
    return list
      .map((o) => ({ id: optionId(o.value, this.kind()), label: o.label }))
      .filter((o): o is { id: string; label: string } => !!o.id);
  });

  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.choices().some((c) => c.id === value);
  });

  constructor() {
    this.options.ensureLoaded();
  }

  protected emit(value: string): void {
    this.valueChange.emit(value || null);
  }
}

/** Display name of a department id from the shared options (null when unknown). */
export function departmentName(
  options: AssigneeOptionsService,
  departmentId: string | null,
): string | null {
  if (!departmentId) {
    return null;
  }
  const match = options.options().departments.find((d) => d.value === `department:${departmentId}`);
  return match?.label ?? null;
}

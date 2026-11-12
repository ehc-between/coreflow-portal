import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

/**
 * Native `<select>` of the org's people (`kind="user"`, value = user id) or
 * departments (`kind="department"`, value = department id); '' = nobody. Reuses the
 * shared assignee options (people need `documents:read`, otherwise only the signed-in
 * user is offered). A current value not in the list stays selectable by name.
 */
@Component({
  selector: 'app-person-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">
        {{ (kind() === 'user' ? 'risk.common.nobody' : 'risk.common.noDepartment') | transloco }}
      </option>
      @if (orphan()) {
        <option [value]="value()" selected>{{ currentName() || value() }}</option>
      }
      @for (o of options(); track o.id) {
        <option [value]="o.id" [selected]="o.id === value()">{{ o.label }}</option>
      }
    </select>
  `,
})
export class PersonSelect {
  private readonly service = inject(AssigneeOptionsService);

  readonly kind = input<'user' | 'department'>('user');
  readonly inputId = input('');
  readonly value = input('');
  readonly currentName = input<string | null>(null);
  readonly disabled = input(false);
  readonly describedBy = input('');
  readonly valueChange = output<string>();

  protected readonly options = computed(() => {
    const all = this.service.options();
    const prefix = this.kind() === 'user' ? 'user:' : 'department:';
    const list = this.kind() === 'user' ? all.users : all.departments;
    return list.map((o) => ({ id: o.value.slice(prefix.length), label: o.label }));
  });

  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.options().some((o) => o.id === value);
  });

  constructor() {
    this.service.ensureLoaded();
  }
}

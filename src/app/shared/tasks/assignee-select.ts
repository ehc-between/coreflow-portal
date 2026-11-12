import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { AssigneeOptionsService } from './assignee-options';

/**
 * Native `<select>` of task assignees: people, roles and departments of the current
 * org, as encoded values (`user:<id>`, `role:<key>`, `department:<id>`; '' = nobody).
 * A current value missing from the options (e.g. a former member) stays selectable
 * under its known name.
 */
@Component({
  selector: 'app-assignee-select',
  imports: [TranslocoPipe],
  providers: [provideTranslocoScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [value]="value()"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="">{{ 'tasks.assignee.none' | transloco }}</option>
      @if (orphan(); as orphan) {
        <option [value]="orphan">{{ currentName() || orphan }}</option>
      }
      <optgroup [label]="'tasks.assignee.groups.users' | transloco">
        @for (o of options().users; track o.value) {
          <option [value]="o.value" [selected]="o.value === value()">{{ o.label }}</option>
        }
      </optgroup>
      <optgroup [label]="'tasks.assignee.groups.roles' | transloco">
        @for (o of options().roles; track o.value) {
          <option [value]="o.value" [selected]="o.value === value()">
            {{ o.label | transloco }}
          </option>
        }
      </optgroup>
      @if (options().departments.length) {
        <optgroup [label]="'tasks.assignee.groups.departments' | transloco">
          @for (o of options().departments; track o.value) {
            <option [value]="o.value" [selected]="o.value === value()">{{ o.label }}</option>
          }
        </optgroup>
      }
    </select>
  `,
})
export class AssigneeSelect {
  private readonly service = inject(AssigneeOptionsService);

  readonly inputId = input('');
  readonly value = input('');
  /** Display name of the current assignee, for a value not in the option list. */
  readonly currentName = input<string | null>(null);
  readonly disabled = input(false);
  readonly describedBy = input('');
  readonly valueChange = output<string>();

  protected readonly options = this.service.options;

  /** The current value when it isn't among the options. */
  protected readonly orphan = computed(() => {
    const value = this.value();
    if (!value) {
      return null;
    }
    const { users, roles, departments } = this.options();
    const known = [...users, ...roles, ...departments].some((o) => o.value === value);
    return known ? null : value;
  });

  constructor() {
    this.service.ensureLoaded();
  }
}

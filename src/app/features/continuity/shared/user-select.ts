import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

const strip = (value: string, prefix: string) =>
  value.startsWith(prefix) ? value.slice(prefix.length) : value;

/**
 * Native `<select>` of the current org's people (an owner or a linked member),
 * valued by user id ('' = nobody). Reuses the task assignee options; a current
 * user missing from the list stays selectable under `currentName`.
 */
@Component({
  selector: 'app-continuity-user-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">{{ 'continuity.common.nobody' | transloco }}</option>
      @if (orphan()) {
        <option [value]="value()" selected>{{ currentName() || value() }}</option>
      }
      @for (user of users(); track user.id) {
        <option [value]="user.id" [selected]="user.id === value()">{{ user.label }}</option>
      }
    </select>
  `,
})
export class ContinuityUserSelect {
  private readonly options = inject(AssigneeOptionsService);

  readonly inputId = input('');
  /** Selected user id ('' = nobody). */
  readonly value = input('');
  readonly currentName = input<string | null>(null);
  readonly disabled = input(false);
  readonly describedBy = input('');
  readonly valueChange = output<string>();

  protected readonly users = computed(() =>
    this.options.options().users.map((u) => ({ id: strip(u.value, 'user:'), label: u.label })),
  );
  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.users().some((u) => u.id === value);
  });

  constructor() {
    this.options.ensureLoaded();
  }
}

/** Native `<select>` of the current org's departments, valued by id ('' = none). */
@Component({
  selector: 'app-continuity-department-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [disabled]="disabled()"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">
        {{ 'continuity.common.noDepartment' | transloco }}
      </option>
      @if (orphan()) {
        <option [value]="value()" selected>
          {{ 'continuity.common.otherDepartment' | transloco }}
        </option>
      }
      @for (dept of departments(); track dept.id) {
        <option [value]="dept.id" [selected]="dept.id === value()">{{ dept.label }}</option>
      }
    </select>
  `,
})
export class ContinuityDepartmentSelect {
  private readonly options = inject(AssigneeOptionsService);

  readonly inputId = input('');
  readonly value = input('');
  readonly disabled = input(false);
  readonly valueChange = output<string>();

  protected readonly departments = computed(() =>
    this.options
      .options()
      .departments.map((d) => ({ id: strip(d.value, 'department:'), label: d.label })),
  );
  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.departments().some((d) => d.id === value);
  });

  constructor() {
    this.options.ensureLoaded();
  }
}

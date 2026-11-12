import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

const USER_PREFIX = 'user:';

/**
 * Native `<select>` of the current org's people (value = user id, '' = nobody).
 * Reuses the shared assignee options (people come from the org's access subjects;
 * without `documents:read` only the signed-in user is listed). A current value
 * missing from the list stays selectable under its known name.
 */
@Component({
  selector: 'app-audit-user-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [value]="value()"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-required]="required() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="">{{ noneLabelKey() | transloco }}</option>
      @if (orphan(); as id) {
        <option [value]="id" selected>{{ currentName() || id }}</option>
      }
      @for (u of users(); track u.id) {
        <option [value]="u.id" [selected]="u.id === value()">{{ u.label }}</option>
      }
    </select>
  `,
})
export class AuditUserSelect {
  private readonly options = inject(AssigneeOptionsService);

  readonly inputId = input('');
  readonly value = input('');
  readonly currentName = input<string | null>(null);
  readonly disabled = input(false);
  readonly required = input(false);
  readonly describedBy = input('');
  readonly noneLabelKey = input('audits.common.nobody');
  readonly valueChange = output<string>();

  protected readonly users = computed(() =>
    this.options
      .options()
      .users.filter((o) => o.value.startsWith(USER_PREFIX))
      .map((o) => ({ id: o.value.slice(USER_PREFIX.length), label: o.label })),
  );

  protected readonly orphan = computed(() => {
    const value = this.value();
    return value && !this.users().some((u) => u.id === value) ? value : null;
  });

  constructor() {
    this.options.ensureLoaded();
  }
}

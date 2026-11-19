import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

/**
 * Native `<select>` of the org's people (Kundeansvarlig), valued by user id
 * ('' = nobody, or "Alle" with `allKey` in a filter). Reuses the task assignee
 * options; a current user missing from the list stays selectable under `currentName`.
 */
@Component({
  selector: 'app-customer-owner-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [class]="selectClass()"
      [attr.aria-label]="ariaLabel() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">{{ emptyKey() | transloco }}</option>
      @if (orphan()) {
        <option [value]="value()" selected>{{ currentName() || value() }}</option>
      }
      @for (user of users(); track user.id) {
        <option [value]="user.id" [selected]="user.id === value()">{{ user.label }}</option>
      }
    </select>
  `,
})
export class CustomerOwnerSelect {
  private readonly options = inject(AssigneeOptionsService);

  readonly inputId = input('');
  readonly value = input<string | null | undefined>('');
  readonly currentName = input<string | null | undefined>(null);
  readonly emptyKey = input('customers.common.nobody');
  readonly ariaLabel = input<string | null>(null);
  readonly selectClass = input('');
  readonly valueChange = output<string>();

  protected readonly users = computed(() =>
    this.options
      .options()
      .users.map((u) => ({ id: u.value.replace(/^user:/, ''), label: u.label })),
  );
  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.users().some((u) => u.id === value);
  });

  constructor() {
    this.options.ensureLoaded();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

/**
 * `<select>` of org members for a record owner (value = user id, '' = nobody).
 * Reuses the task assignee options (people of the current org). An owner who is
 * not in the list (e.g. a former member) stays selectable under their name.
 */
@Component({
  selector: 'app-context-owner-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">{{ 'context.fields.noOwner' | transloco }}</option>
      @if (orphan()) {
        <option [value]="value()" selected>{{ currentName() || value() }}</option>
      }
      @for (user of users(); track user.id) {
        <option [value]="user.id" [selected]="user.id === value()">{{ user.name }}</option>
      }
    </select>
  `,
})
export class OwnerSelect {
  private readonly options = inject(AssigneeOptionsService);

  readonly inputId = input('');
  readonly value = input('');
  readonly currentName = input<string | null>(null);
  readonly disabled = input(false);
  readonly describedBy = input('');
  readonly valueChange = output<string>();

  protected readonly users = computed(() =>
    this.options
      .options()
      .users.map((option) => ({ id: option.value.replace(/^user:/, ''), name: option.label })),
  );

  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.users().some((user) => user.id === value);
  });

  constructor() {
    this.options.ensureLoaded();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { FormField } from '../../shared/ui/form-field/form-field';

/**
 * Owner and department selects shared by the aspect, plan and metric forms. Create
 * pages seed the owner with the signed-in user.
 */
@Component({
  selector: 'app-env-owner-fields',
  imports: [TranslocoPipe, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div>
      <app-form-field
        [label]="'environment.fields.owner' | transloco"
        [inputId]="idPrefix() + '-owner'"
      >
        <select [id]="idPrefix() + '-owner'" (change)="ownerChange.emit($any($event.target).value)">
          <option value="" [selected]="!ownerId()">
            {{ 'environment.form.noOwner' | transloco }}
          </option>
          @if (ownerOrphan()) {
            <option [value]="ownerId()" selected>
              {{ ownerName() || ('environment.form.currentOwner' | transloco) }}
            </option>
          }
          @for (u of users(); track u.id) {
            <option [value]="u.id" [selected]="ownerId() === u.id">{{ u.label }}</option>
          }
        </select>
      </app-form-field>
    </div>
    <div>
      <app-form-field
        [label]="'environment.fields.department' | transloco"
        [inputId]="idPrefix() + '-dept'"
      >
        <select
          [id]="idPrefix() + '-dept'"
          (change)="departmentChange.emit($any($event.target).value)"
        >
          <option value="" [selected]="!departmentId()">
            {{ 'environment.form.noDepartment' | transloco }}
          </option>
          @for (d of departments(); track d.id) {
            <option [value]="d.id" [selected]="departmentId() === d.id">{{ d.label }}</option>
          }
        </select>
      </app-form-field>
    </div>
  `,
})
export class EnvOwnerFields {
  private readonly assignees = inject(AssigneeOptionsService);

  readonly ownerId = input('');
  readonly departmentId = input('');
  readonly ownerName = input<string | null>(null);
  readonly idPrefix = input('cf-env');

  readonly ownerChange = output<string>();
  readonly departmentChange = output<string>();

  protected readonly users = computed(() =>
    this.assignees.options().users.map((o) => ({ id: o.value.slice(5), label: o.label })),
  );
  protected readonly departments = computed(() =>
    this.assignees.options().departments.map((o) => ({ id: o.value.slice(11), label: o.label })),
  );
  protected readonly ownerOrphan = computed(() => {
    const id = this.ownerId();
    return !!id && !this.users().some((u) => u.id === id);
  });

  constructor() {
    this.assignees.ensureLoaded();
  }
}

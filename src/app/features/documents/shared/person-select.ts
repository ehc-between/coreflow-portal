import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

/**
 * Native `<select>` of the org's people (value = user id, '' = nobody), reusing
 * the shared assignee options. A current value not in the list stays selectable.
 */
@Component({
  selector: 'app-documents-person-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [disabled]="disabled()"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">
        {{ 'documents.control.common.nobody' | transloco }}
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
export class DocumentsPersonSelect {
  private readonly service = inject(AssigneeOptionsService);

  readonly inputId = input('');
  readonly value = input('');
  readonly currentName = input<string | null>(null);
  readonly disabled = input(false);
  readonly valueChange = output<string>();

  protected readonly options = computed(() =>
    this.service
      .options()
      .users.map((o) => ({ id: o.value.slice('user:'.length), label: o.label })),
  );

  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.options().some((o) => o.id === value);
  });

  constructor() {
    this.service.ensureLoaded();
  }
}

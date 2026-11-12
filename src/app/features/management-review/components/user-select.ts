import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

/** The user id of an encoded assignee option (`user:<id>`), or null. */
export function userIdOf(value: string): string | null {
  return value.startsWith('user:') ? value.slice(5) : null;
}

/**
 * A plain `<select>` of the org's people, from the shared assignee options.
 * Emits the user id (or null for "none"). A current value that is not in the
 * list (e.g. the caller cannot list members) stays selectable under `currentName`.
 */
@Component({
  selector: 'app-mr-user-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() || null"
      [class]="selectClass()"
      (change)="emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">
        {{ noneKey() || 'managementReview.common.nobody' | transloco }}
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
export class UserSelect {
  private readonly options = inject(AssigneeOptionsService);

  readonly inputId = input('');
  readonly value = input<string | null>(null);
  readonly currentName = input<string | null>(null);
  readonly noneKey = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly disabled = input(false);
  /** Classes for a select used outside `app-form-field`. */
  readonly selectClass = input('');
  /** Ids to leave out (e.g. people who already attend). */
  readonly exclude = input<readonly string[]>([]);
  readonly valueChange = output<string | null>();

  protected readonly choices = computed(() => {
    const skip = new Set(this.exclude());
    return this.options
      .options()
      .users.map((o) => ({ id: userIdOf(o.value), label: o.label }))
      .filter((o): o is { id: string; label: string } => !!o.id && !skip.has(o.id));
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

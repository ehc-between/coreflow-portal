import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

/**
 * Native `<select>` of org members (owner, AI officer, literacy record holder),
 * reusing the task assignee options (people of the current org). `value` is a
 * user id or '' for none. A current value not in the list is kept, labelled
 * with `currentName`.
 */
@Component({
  selector: 'app-ai-user-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: [
    `
      select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13.5px;
        padding: 0 10px;
      }
      select:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
  template: `
    <select
      [id]="selectId()"
      [disabled]="disabled()"
      [required]="required()"
      [attr.aria-describedby]="describedBy() || null"
      (change)="value.set($any($event.target).value)"
    >
      @if (!required() || !value()) {
        <option value="" [selected]="!value()">{{ noneKey() | transloco }}</option>
      }
      @if (orphan(); as o) {
        <option [value]="o.id" selected>{{ o.label }}</option>
      }
      @for (user of users(); track user.id) {
        <option [value]="user.id" [selected]="user.id === value()">{{ user.label }}</option>
      }
    </select>
  `,
})
export class AiUserSelect {
  private readonly options = inject(AssigneeOptionsService);

  readonly value = model<string>('');
  readonly selectId = input('');
  readonly currentName = input<string | null>(null);
  readonly noneKey = input('aiGovernance.common.nobody');
  readonly disabled = input(false);
  readonly required = input(false);
  readonly describedBy = input('');

  protected readonly users = computed(() =>
    this.options
      .options()
      .users.filter((u) => u.value.startsWith('user:'))
      .map((u) => ({ id: u.value.slice(5), label: u.label })),
  );

  protected readonly orphan = computed(() => {
    const id = this.value();
    if (!id || this.users().some((u) => u.id === id)) {
      return null;
    }
    return { id, label: this.currentName() || id };
  });

  constructor() {
    this.options.ensureLoaded();
  }
}

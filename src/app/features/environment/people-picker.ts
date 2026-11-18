import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Icon } from '../../shared/ui/icon/icon';
import { PersonRef } from './data/environment.models';
import { directoryOptions } from './environment-shared';

let nextId = 0;

/**
 * Pick members of the organisation (drill participants): chips for the picked
 * people with a remove button, and a select of everyone not yet picked. `known`
 * names people already on the record who may have left the directory.
 */
@Component({
  selector: 'app-env-people-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-2" data-testid="people-picker">
      @if (chips().length) {
        <ul
          class="flex flex-wrap gap-1.5"
          [attr.aria-label]="'environment.people.picked' | transloco"
        >
          @for (chip of chips(); track chip.id) {
            <li
              class="inline-flex max-w-full items-center gap-1 rounded-full border border-accent-border bg-accent-soft py-0.5 pr-1 pl-2.5 text-meta font-semibold text-accent"
            >
              <span class="truncate">{{ chip.label }}</span>
              <button
                type="button"
                class="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-fg-subtle hover:bg-surface hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="'environment.people.remove' | transloco: { name: chip.label }"
                (click)="remove(chip.id)"
              >
                <app-icon name="x" [size]="12" />
              </button>
            </li>
          }
        </ul>
      }
      <select
        [id]="inputId()"
        [attr.aria-label]="'environment.people.add' | transloco"
        [attr.aria-describedby]="describedBy() || null"
        (change)="add($any($event.target))"
        data-testid="people-add"
      >
        <option value="" selected>{{ 'environment.people.add' | transloco }}</option>
        @for (o of available(); track o.value) {
          <option [value]="o.value">{{ o.label }}</option>
        }
      </select>
    </div>
  `,
})
export class EnvPeoplePicker {
  private readonly directory = inject(AssigneeOptionsService);

  readonly value = input<readonly string[]>([]);
  readonly known = input<readonly PersonRef[]>([]);
  readonly inputId = input(`cf-env-people-${++nextId}`);
  readonly describedBy = input('');
  readonly valueChange = output<readonly string[]>();

  private readonly members = computed(() => directoryOptions(this.directory, 'user'));

  protected readonly available = computed(() => {
    const picked = new Set(this.value());
    return this.members().filter((m) => !picked.has(m.value));
  });

  protected readonly chips = computed(() => {
    const names = new Map<string, string>();
    for (const p of this.known()) {
      names.set(p.id, p.name);
    }
    for (const m of this.members()) {
      names.set(m.value, m.label);
    }
    return this.value().map((id) => ({ id, label: names.get(id) ?? id }));
  });

  constructor() {
    this.directory.ensureLoaded();
  }

  protected add(select: HTMLSelectElement): void {
    const id = select.value;
    select.value = '';
    if (id && !this.value().includes(id)) {
      this.valueChange.emit([...this.value(), id]);
    }
  }

  protected remove(id: string): void {
    this.valueChange.emit(this.value().filter((v) => v !== id));
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PersonOption, TrainingPeople, filterPeople } from './people';

let nextId = 0;

/**
 * Pick several members of the organisation: a search box, "Velg alle viste" and
 * a scrollable list of tick boxes. `selected` is two-way (`[(selected)]`).
 */
@Component({
  selector: 'app-training-people-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1.5 flex min-h-6 items-center text-ui font-semibold text-fg-muted">
        {{ legend() }}
      </legend>
      <label [attr.for]="searchId" class="sr-only">{{
        'training.assign.search' | transloco
      }}</label>
      <input
        [id]="searchId"
        type="search"
        class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
        [placeholder]="'training.assign.search' | transloco"
        [value]="search()"
        (input)="search.set($any($event.target).value)"
      />
      <div class="flex items-center justify-between text-meta text-fg-muted">
        <span>{{ 'training.assign.selected' | transloco: { count: selected().size } }}</span>
        <span class="flex gap-3">
          @if (selected().size) {
            <button
              type="button"
              class="font-semibold text-fg-muted hover:text-fg"
              (click)="clear()"
            >
              {{ 'training.assign.clear' | transloco }}
            </button>
          }
          <button
            type="button"
            class="font-semibold text-accent hover:underline"
            (click)="selectAllVisible()"
          >
            {{ 'training.assign.selectAll' | transloco }}
          </button>
        </span>
      </div>
      <ul
        class="max-h-[300px] overflow-y-auto rounded-tile border border-border"
        data-testid="assign-people"
      >
        @for (person of visiblePeople(); track person.id) {
          <li class="border-b border-border last:border-0">
            <label
              class="flex min-h-10 cursor-pointer items-center gap-2.5 px-3 py-2 text-ui text-fg hover:bg-surface-2"
            >
              <input
                type="checkbox"
                class="h-4 w-4 accent-accent"
                [checked]="selected().has(person.id)"
                (change)="toggle(person.id)"
              />
              {{ person.name }}
            </label>
          </li>
        } @empty {
          <li class="px-3 py-2 text-ui text-fg-muted">
            {{ 'training.assign.noPeople' | transloco }}
          </li>
        }
      </ul>
    </fieldset>
  `,
})
export class PeoplePicker {
  private readonly directory = inject(TrainingPeople);

  readonly legend = input.required<string>();
  readonly selected = model<ReadonlySet<string>>(new Set());

  protected readonly searchId = `cf-training-people-${++nextId}`;
  protected readonly search = signal('');
  protected readonly visiblePeople = computed<PersonOption[]>(() =>
    filterPeople(this.directory.people(), this.search()),
  );

  constructor() {
    this.directory.ensureLoaded();
  }

  protected toggle(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selected.set(next);
  }

  protected selectAllVisible(): void {
    this.selected.set(new Set([...this.selected(), ...this.visiblePeople().map((p) => p.id)]));
  }

  protected clear(): void {
    this.selected.set(new Set());
  }
}

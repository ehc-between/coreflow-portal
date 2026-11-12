import { Injectable, computed, inject } from '@angular/core';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

export interface PersonOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Members and departments of the current org for training pickers (assign,
 * rules, manual records, matrix filter). Reuses the task assignee directory
 * (F2), which lists everyone for `documents:read` holders and only the
 * signed-in user otherwise.
 */
@Injectable({ providedIn: 'root' })
export class TrainingPeople {
  private readonly options = inject(AssigneeOptionsService);

  readonly people = computed<readonly PersonOption[]>(() =>
    this.options.options().users.map((u) => ({ id: u.value.replace(/^user:/, ''), name: u.label })),
  );

  readonly departments = computed<readonly PersonOption[]>(() =>
    this.options
      .options()
      .departments.map((d) => ({ id: d.value.replace(/^department:/, ''), name: d.label })),
  );

  ensureLoaded(): void {
    this.options.ensureLoaded();
  }
}

/** Case-insensitive name filter. */
export function filterPeople(people: readonly PersonOption[], q: string): PersonOption[] {
  const needle = q.trim().toLowerCase();
  return needle ? people.filter((p) => p.name.toLowerCase().includes(needle)) : [...people];
}

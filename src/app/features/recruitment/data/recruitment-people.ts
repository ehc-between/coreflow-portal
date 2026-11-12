import { Injectable, computed, inject } from '@angular/core';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';

export interface PersonOption {
  readonly id: string;
  readonly name: string;
}

function strip(prefix: string, value: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

/**
 * Org members and departments for the recruitment pickers (hiring team, hiring
 * manager, interviewers, department). Reuses the shared task-assignee options
 * (cached per org; falls back to the signed-in user without `documents:read`).
 */
@Injectable({ providedIn: 'root' })
export class RecruitmentPeople {
  private readonly options = inject(AssigneeOptionsService);

  readonly users = computed<readonly PersonOption[]>(() =>
    this.options.options().users.map((u) => ({ id: strip('user:', u.value), name: u.label })),
  );

  readonly departments = computed<readonly PersonOption[]>(() =>
    this.options
      .options()
      .departments.map((d) => ({ id: strip('department:', d.value), name: d.label })),
  );

  ensureLoaded(): void {
    this.options.ensureLoaded();
  }

  departmentName(id: string | null): string | null {
    return id ? (this.departments().find((d) => d.id === id)?.name ?? null) : null;
  }
}

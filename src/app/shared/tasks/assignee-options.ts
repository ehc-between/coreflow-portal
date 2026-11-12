import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { DocumentsApi } from '../../core/documents/documents-api';
import { ROLE_KEYS } from '../../core/org/roles';
import { SelectedOrgService } from '../../core/org/selected-org.service';

export interface AssigneeOption {
  /** Encoded value (`user:<id>`, `role:<key>`, `department:<id>`). */
  readonly value: string;
  /** Display name; for roles, the i18n key of the role name (`labelIsKey`). */
  readonly label: string;
  readonly labelIsKey: boolean;
}

export interface AssigneeOptions {
  readonly users: readonly AssigneeOption[];
  readonly roles: readonly AssigneeOption[];
  readonly departments: readonly AssigneeOption[];
}

/**
 * The people, roles and departments a task can be assigned to in the current org.
 * Users and departments come from the org's access-subjects list (needs
 * `documents:read`); without it the list falls back to the signed-in user, so a
 * member can still assign work to themselves or to a role. Cached per org.
 */
@Injectable({ providedIn: 'root' })
export class AssigneeOptionsService {
  private readonly auth = inject(AuthService);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly subjects = signal<{
    readonly orgId: string;
    readonly users: readonly AssigneeOption[];
    readonly departments: readonly AssigneeOption[];
  } | null>(null);
  private loadingFor: string | null = null;

  private readonly roles: readonly AssigneeOption[] = ROLE_KEYS.map((key) => ({
    value: `role:${key}`,
    label: `roles.${key}.name`,
    labelIsKey: true,
  }));

  /** Options for the current org (loads on first read; reactive). */
  readonly options = computed<AssigneeOptions>(() => {
    const orgId = this.selectedOrg.currentOrgId();
    const me = this.auth.user();
    const loaded = this.subjects();
    const own: AssigneeOption[] = me
      ? [{ value: `user:${me.id}`, label: me.full_name || me.email, labelIsKey: false }]
      : [];
    if (!loaded || loaded.orgId !== orgId) {
      return { users: own, roles: this.roles, departments: [] };
    }
    const users = loaded.users.some((u) => u.value === own[0]?.value)
      ? loaded.users
      : [...own, ...loaded.users];
    return { users, roles: this.roles, departments: loaded.departments };
  });

  /** Fetch users and departments for the current org once (no-op without `documents:read`). */
  ensureLoaded(): void {
    const org = this.selectedOrg.currentOrg();
    if (!org || this.subjects()?.orgId === org.id || this.loadingFor === org.id) {
      return;
    }
    if (!org.permissions.includes('documents:read')) {
      return;
    }
    this.loadingFor = org.id;
    this.documentsApi.listAccessSubjects(org.id).subscribe({
      next: (subjects) => {
        this.loadingFor = null;
        this.subjects.set({
          orgId: org.id,
          users: [...subjects.users]
            .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
            .map((u) => ({ value: `user:${u.id}`, label: u.name || u.email, labelIsKey: false })),
          departments: [...subjects.departments]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((d) => ({ value: `department:${d.id}`, label: d.name, labelIsKey: false })),
        });
      },
      error: () => {
        this.loadingFor = null;
      },
    });
  }
}

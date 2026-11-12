import { Injectable, computed, inject, signal } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { PrivacyApi } from './privacy-api';
import { PrivacyRecord } from './privacy.models';
import { REGISTERS, RegisterKey } from './privacy-registers';

export interface RefOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Look-ups the privacy pages share: records of other registers that a record can
 * reference (ROPA entries, processors), and member / department names (the
 * backend returns ids only). Cached per org; reactive.
 */
@Injectable({ providedIn: 'root' })
export class PrivacyRefsService {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly assignees = inject(AssigneeOptionsService);

  private readonly cache = signal<
    Readonly<Record<string, { readonly orgId: string; readonly items: readonly RefOption[] }>>
  >({});
  private readonly loading = new Set<string>();

  /** Org members as `{id, label}` (falls back to the signed-in user). */
  readonly users = computed<readonly RefOption[]>(() =>
    this.assignees
      .options()
      .users.map((u) => ({ id: u.value.slice('user:'.length), label: u.label })),
  );
  readonly departments = computed<readonly RefOption[]>(() =>
    this.assignees
      .options()
      .departments.map((d) => ({ id: d.value.slice('department:'.length), label: d.label })),
  );

  ensureMembers(): void {
    this.assignees.ensureLoaded();
  }

  userName(id: string | null | undefined): string | null {
    if (!id) {
      return null;
    }
    return this.users().find((u) => u.id === id)?.label ?? null;
  }

  departmentName(id: string | null | undefined): string | null {
    return id ? (this.departments().find((d) => d.id === id)?.label ?? null) : null;
  }

  /** Records of a register for a reference picker (first 200, by code). */
  options(register: RegisterKey): readonly RefOption[] {
    const orgId = this.selectedOrg.currentOrgId();
    const entry = this.cache()[register];
    if (!orgId) {
      return [];
    }
    if (!entry || entry.orgId !== orgId) {
      this.load(orgId, register);
      return [];
    }
    return entry.items;
  }

  label(register: RegisterKey, id: string | null | undefined): string | null {
    return id ? (this.options(register).find((o) => o.id === id)?.label ?? null) : null;
  }

  /** Forget a register's options (after a create or delete there). */
  invalidate(register: RegisterKey): void {
    const next = { ...this.cache() };
    delete next[register];
    this.cache.set(next);
  }

  private load(orgId: string, register: RegisterKey): void {
    const token = `${orgId}:${register}`;
    if (this.loading.has(token)) {
      return;
    }
    this.loading.add(token);
    queueMicrotask(() =>
      this.api
        .list<PrivacyRecord>(orgId, REGISTERS[register], { sort: 'code', limit: 200 })
        .subscribe({
          next: (page) => {
            this.loading.delete(token);
            this.cache.update((c) => ({
              ...c,
              [register]: {
                orgId,
                items: page.items.map((r) => ({ id: r.id, label: `${r.code} · ${r.title}` })),
              },
            }));
          },
          error: () => {
            this.loading.delete(token);
            this.cache.update((c) => ({ ...c, [register]: { orgId, items: [] } }));
          },
        }),
    );
  }
}

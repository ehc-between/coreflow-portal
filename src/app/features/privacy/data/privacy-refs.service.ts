import { Injectable, computed, inject, signal } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { ExternalOption, PrivacyApi } from './privacy-api';
import { PrivacyCountries, PrivacyRecord } from './privacy.models';
import { LinkedEntity, REGISTERS, RegisterKey } from './privacy-registers';

export interface RefOption {
  readonly id: string;
  readonly label: string;
}

interface Cached<T> {
  readonly orgId: string;
  readonly items: readonly T[];
}

const EMPTY_COUNTRIES: PrivacyCountries = { eea: [], adequacy: [], adequacy_partial: [] };

/**
 * Look-ups the privacy pages share: records of other registers that a record can
 * reference (ROPA entries, processors), records of other modules it links to
 * (suppliers, contracts, documents, assets, people), the EEA / adequacy country
 * lists, and member / department names (the backend returns ids only). Cached per
 * org; reactive.
 */
@Injectable({ providedIn: 'root' })
export class PrivacyRefsService {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly assignees = inject(AssigneeOptionsService);

  private readonly cache = signal<Readonly<Record<string, Cached<RefOption>>>>({});
  private readonly external = signal<Readonly<Record<string, Cached<ExternalOption>>>>({});
  private readonly countryLists = signal<{
    readonly orgId: string;
    readonly value: PrivacyCountries;
  } | null>(null);
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

  /**
   * Records of another module for a link picker (first 200; empty without read
   * access to that module).
   */
  entityOptions(entity: LinkedEntity): readonly ExternalOption[] {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return [];
    }
    const entry = this.external()[entity];
    if (!entry || entry.orgId !== orgId) {
      this.loadExternal(orgId, entity);
      return [];
    }
    return entry.items;
  }

  /** A linked record (label + route), or null while unknown or not readable. */
  entityOption(entity: LinkedEntity, id: string | null | undefined): ExternalOption | null {
    return id ? (this.entityOptions(entity).find((o) => o.id === id) ?? null) : null;
  }

  /** Contracts for the agreement pickers (first 200, by code; empty without contracts:read). */
  contracts(): readonly RefOption[] {
    return this.entityOptions('contract');
  }

  contractLabel(id: string | null | undefined): string | null {
    return this.entityOption('contract', id)?.label ?? null;
  }

  /** EEA, adequacy and partial-adequacy codes (`GET /countries`); empty lists until loaded. */
  countries(): PrivacyCountries {
    const orgId = this.selectedOrg.currentOrgId();
    const entry = this.countryLists();
    if (!orgId) {
      return EMPTY_COUNTRIES;
    }
    if (!entry || entry.orgId !== orgId) {
      this.loadCountries(orgId);
      return EMPTY_COUNTRIES;
    }
    return entry.value;
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
    return id ? ((this.options(register).find((o) => o.id === id) ?? null)?.label ?? null) : null;
  }

  /** Forget a register's options (after a create or delete there). */
  invalidate(register: RegisterKey): void {
    const next = { ...this.cache() };
    delete next[register];
    this.cache.set(next);
  }

  private loadExternal(orgId: string, entity: LinkedEntity): void {
    const token = `${orgId}:entity:${entity}`;
    if (this.loading.has(token)) {
      return;
    }
    this.loading.add(token);
    queueMicrotask(() =>
      this.api.entityOptions(orgId, entity).subscribe({
        next: (items) => {
          this.loading.delete(token);
          this.external.update((c) => ({ ...c, [entity]: { orgId, items } }));
        },
        error: () => {
          this.loading.delete(token);
          this.external.update((c) => ({ ...c, [entity]: { orgId, items: [] } }));
        },
      }),
    );
  }

  private loadCountries(orgId: string): void {
    const token = `${orgId}:countries`;
    if (this.loading.has(token)) {
      return;
    }
    this.loading.add(token);
    queueMicrotask(() =>
      this.api.countries(orgId).subscribe({
        next: (value) => {
          this.loading.delete(token);
          this.countryLists.set({ orgId, value });
        },
        error: () => {
          this.loading.delete(token);
          this.countryLists.set({ orgId, value: EMPTY_COUNTRIES });
        },
      }),
    );
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

import { Injectable, computed, inject, signal } from '@angular/core';
import { DeviationType } from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Template } from './inspection.models';
import { InspectionsApi } from './inspections-api';

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

interface OrgScoped<T> {
  readonly orgId: string;
  readonly items: readonly T[];
}

/**
 * Lookup lists the inspection forms share: org members and departments (from the
 * shared assignee options, which need `documents:read` and otherwise fall back to the
 * signed-in user), the active checklist templates (to plan from) and the org's
 * deviation types (only with `deviations:read`). Loaded once per org on demand;
 * reactive.
 */
@Injectable({ providedIn: 'root' })
export class InspectionReferences {
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly api = inject(InspectionsApi);
  private readonly deviationsApi = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly users = computed<NamedRef[]>(() =>
    this.assignees
      .options()
      .users.map((o) => ({ id: o.value.replace(/^user:/, ''), name: o.label })),
  );

  readonly departments = computed<NamedRef[]>(() =>
    this.assignees
      .options()
      .departments.map((o) => ({ id: o.value.replace(/^department:/, ''), name: o.label })),
  );

  private readonly templateState = signal<OrgScoped<Template> | null>(null);
  private readonly typeState = signal<OrgScoped<DeviationType> | null>(null);

  readonly activeTemplates = computed<readonly Template[]>(() => {
    const state = this.templateState();
    return state && state.orgId === this.selectedOrg.currentOrgId() ? state.items : [];
  });

  /** Whether the active templates have loaded for the current org. */
  readonly templatesLoaded = computed(
    () => this.templateState()?.orgId === this.selectedOrg.currentOrgId(),
  );

  readonly deviationTypes = computed<readonly DeviationType[]>(() => {
    const state = this.typeState();
    return state && state.orgId === this.selectedOrg.currentOrgId() ? state.items : [];
  });

  readonly canReadDeviations = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('deviations:read') ?? false,
  );

  private loading = new Set<string>();

  /** Users and departments. */
  ensurePeople(): void {
    this.assignees.ensureLoaded();
  }

  /** Active templates (refetched when `force`, e.g. after publishing one). */
  ensureTemplates(force = false): void {
    const orgId = this.selectedOrg.currentOrgId();
    const key = `t:${orgId}`;
    if (!orgId || this.loading.has(key) || (!force && this.templateState()?.orgId === orgId)) {
      return;
    }
    this.loading.add(key);
    this.api.listTemplates(orgId, { status: ['active'], sort: 'title', limit: 200 }).subscribe({
      next: (page) => {
        this.loading.delete(key);
        this.templateState.set({ orgId, items: page.items });
      },
      error: () => this.loading.delete(key),
    });
  }

  /** Active deviation types (no-op without `deviations:read`). */
  ensureDeviationTypes(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const key = `d:${orgId}`;
    if (
      !orgId ||
      !this.canReadDeviations() ||
      this.loading.has(key) ||
      this.typeState()?.orgId === orgId
    ) {
      return;
    }
    this.loading.add(key);
    this.deviationsApi.listTypes(orgId).subscribe({
      next: (types) => {
        this.loading.delete(key);
        this.typeState.set({ orgId, items: types.filter((t) => t.is_active) });
      },
      error: () => this.loading.delete(key),
    });
  }

  userName(id: string | null | undefined): string | null {
    return id ? (this.users().find((u) => u.id === id)?.name ?? null) : null;
  }

  departmentName(id: string | null | undefined): string | null {
    return id ? (this.departments().find((d) => d.id === id)?.name ?? null) : null;
  }
}

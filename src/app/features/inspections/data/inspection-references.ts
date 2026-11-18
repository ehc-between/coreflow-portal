import { Injectable, computed, inject, signal } from '@angular/core';
import { DeviationType } from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { FrameworkOption, SUPPORTED_FRAMEWORKS, Template } from './inspection.models';
import { InspectionsApi } from './inspections-api';

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

interface OrgScoped<T> {
  readonly orgId: string;
  readonly items: readonly T[];
}

interface Member {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

/**
 * Picker labels for people: the name, or "Name (email)" when two members share a
 * name, and the email alone when the name is missing, so nobody is ambiguous.
 */
export function memberLabels(members: readonly Member[]): NamedRef[] {
  const counts = new Map<string, number>();
  for (const m of members) {
    const key = m.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return members.map((m) => {
    const name = m.name.trim();
    if (!name) {
      return { id: m.id, name: m.email };
    }
    const shared = (counts.get(name.toLowerCase()) ?? 0) > 1;
    return { id: m.id, name: shared && m.email ? `${name} (${m.email})` : name };
  });
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
  private readonly documentsApi = inject(DocumentsApi);
  private readonly standardsApi = inject(StandardsApi);

  private readonly memberState = signal<OrgScoped<Member> | null>(null);

  /** Org members for the people pickers (disambiguated, see `memberLabels`). */
  readonly users = computed<NamedRef[]>(() => {
    const members = this.memberState();
    if (members && members.orgId === this.selectedOrg.currentOrgId()) {
      return memberLabels(members.items);
    }
    return this.assignees
      .options()
      .users.map((o) => ({ id: o.value.replace(/^user:/, ''), name: o.label }));
  });

  readonly departments = computed<NamedRef[]>(() =>
    this.assignees
      .options()
      .departments.map((o) => ({ id: o.value.replace(/^department:/, ''), name: o.label })),
  );

  private readonly templateState = signal<OrgScoped<Template> | null>(null);
  private readonly typeState = signal<OrgScoped<DeviationType> | null>(null);
  private readonly frameworkState = signal<OrgScoped<FrameworkOption> | null>(null);
  private readonly standardKeyState = signal<{
    readonly orgId: string;
    readonly keys: Readonly<Record<string, string>>;
  } | null>(null);

  /**
   * The standards a checklist can cite (ISO 9001, 14001, 45001, 27001) and whether
   * the org has each switched on. Until loaded (or on an older server) all four,
   * marked enabled.
   */
  readonly frameworks = computed<readonly FrameworkOption[]>(() => {
    const state = this.frameworkState();
    return state && state.orgId === this.selectedOrg.currentOrgId()
      ? state.items
      : SUPPORTED_FRAMEWORKS.map((key) => ({ key, enabled: true }));
  });

  /** Framework key -> catalogue standard key (`iso45001` -> `iso45001-2018`), for links. */
  readonly standardKeys = computed<Readonly<Record<string, string>>>(() => {
    const state = this.standardKeyState();
    return state && state.orgId === this.selectedOrg.currentOrgId() ? state.keys : {};
  });

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
    const org = this.selectedOrg.currentOrg();
    const key = `m:${org?.id}`;
    if (
      !org ||
      !org.permissions.includes('documents:read') ||
      this.loading.has(key) ||
      this.memberState()?.orgId === org.id
    ) {
      return;
    }
    this.loading.add(key);
    this.documentsApi.listAccessSubjects(org.id).subscribe({
      next: (subjects) => {
        this.loading.delete(key);
        const items = [...subjects.users]
          .map((u) => ({ id: u.id, name: u.name ?? '', email: u.email ?? '' }))
          .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
        this.memberState.set({ orgId: org.id, items });
      },
      error: () => this.loading.delete(key),
    });
  }

  /** The supported standards and whether each is enabled (`GET /inspections/frameworks`). */
  ensureFrameworks(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const key = `f:${orgId}`;
    if (!orgId || this.loading.has(key) || this.frameworkState()?.orgId === orgId) {
      return;
    }
    this.loading.add(key);
    this.api.frameworks(orgId).subscribe({
      next: (items) => {
        this.loading.delete(key);
        this.frameworkState.set({ orgId, items });
      },
      error: () => this.loading.delete(key),
    });
  }

  /** Catalogue standard keys, so clause chips can open the requirement in Standards. */
  ensureStandardKeys(): void {
    const org = this.selectedOrg.currentOrg();
    const key = `s:${org?.id}`;
    if (
      !org ||
      !org.permissions.includes('standards:read') ||
      this.loading.has(key) ||
      this.standardKeyState()?.orgId === org.id
    ) {
      return;
    }
    this.loading.add(key);
    this.standardsApi.listFrameworks(org.id).subscribe({
      next: (frameworks) => {
        this.loading.delete(key);
        this.standardKeyState.set({
          orgId: org.id,
          keys: Object.fromEntries(frameworks.map((f) => [f.framework, f.standard_key])),
        });
      },
      error: () => this.loading.delete(key),
    });
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

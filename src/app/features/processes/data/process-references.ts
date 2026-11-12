import { Injectable, computed, inject, signal } from '@angular/core';
import { DocumentSummary } from '../../../core/documents/document.models';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { ProcessesApi } from './processes-api';
import { ProcessOut } from './process.models';

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

/**
 * Lookup lists the process forms and the map editor share: org members and
 * departments (from the shared assignee options, which need `documents:read` and
 * otherwise fall back to the signed-in user), the org's processes (parents,
 * sub-processes, interactions) and documents (procedures to link). Loaded once
 * per org on demand; reactive.
 */
@Injectable({ providedIn: 'root' })
export class ProcessReferences {
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly processesApi = inject(ProcessesApi);
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

  private readonly processState = signal<{ orgId: string; items: readonly ProcessOut[] } | null>(
    null,
  );
  private readonly documentState = signal<{
    orgId: string;
    items: readonly DocumentSummary[];
  } | null>(null);

  readonly processes = computed<readonly ProcessOut[]>(() => {
    const state = this.processState();
    return state && state.orgId === this.selectedOrg.currentOrgId() ? state.items : [];
  });

  readonly documents = computed<readonly DocumentSummary[]>(() => {
    const state = this.documentState();
    return state && state.orgId === this.selectedOrg.currentOrgId() ? state.items : [];
  });

  readonly canReadDocuments = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('documents:read') ?? false,
  );

  ensurePeople(): void {
    this.assignees.ensureLoaded();
  }

  /** Loads (or reloads with `force`) the org's processes, by code. */
  ensureProcesses(force = false): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || (!force && this.processState()?.orgId === orgId)) {
      return;
    }
    this.processesApi.list(orgId, { sort: 'code', limit: 200 }).subscribe({
      next: (page) => this.processState.set({ orgId, items: page.items }),
    });
  }

  /** Loads the org's documents once (skipped without `documents:read`). */
  ensureDocuments(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canReadDocuments() || this.documentState()?.orgId === orgId) {
      return;
    }
    this.documentsApi.list(orgId).subscribe({
      next: (items) =>
        this.documentState.set({
          orgId,
          items: [...items].sort((a, b) => (a.doc_code || '').localeCompare(b.doc_code || '')),
        }),
    });
  }
}

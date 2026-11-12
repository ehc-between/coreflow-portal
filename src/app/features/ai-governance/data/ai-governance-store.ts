import { Injectable, computed, inject, signal } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiGovernanceApi } from './ai-governance-api';
import { AiGovernanceCatalog } from './ai-governance.models';
import { AI_GOV_PERMISSIONS } from './ai-governance-display';

/**
 * Shared, signal-based state of the AI governance pages: the caller's module
 * permissions in the current org and the wizard / documentation catalogue
 * (`GET /catalog`, loaded once per org).
 */
@Injectable({ providedIn: 'root' })
export class AiGovernanceStore {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly permissions = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );
  readonly canWrite = computed(() => this.permissions().has(AI_GOV_PERMISSIONS.write));
  readonly canManage = computed(() => this.permissions().has(AI_GOV_PERMISSIONS.manage));
  readonly canApprove = computed(() => this.permissions().has(AI_GOV_PERMISSIONS.approve));
  readonly canReadAudit = computed(() => this.permissions().has('audit:read'));

  private readonly loaded = signal<{
    readonly orgId: string;
    readonly catalog: AiGovernanceCatalog;
  } | null>(null);
  private loadingFor: string | null = null;

  /** The catalogue of the current org (null until loaded; call `ensureCatalog`). */
  readonly catalog = computed<AiGovernanceCatalog | null>(() => {
    const loaded = this.loaded();
    return loaded && loaded.orgId === this.selectedOrg.currentOrgId() ? loaded.catalog : null;
  });

  ensureCatalog(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.loaded()?.orgId === orgId || this.loadingFor === orgId) {
      return;
    }
    this.loadingFor = orgId;
    this.api.catalog(orgId).subscribe({
      next: (catalog) => {
        this.loadingFor = null;
        this.loaded.set({ orgId, catalog });
      },
      error: () => {
        this.loadingFor = null;
      },
    });
  }
}

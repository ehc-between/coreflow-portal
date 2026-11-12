import { Injectable, computed, inject, signal } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FrameworkSummary } from '../../../core/standards/standards.models';
import { StandardsApi } from '../../../core/standards/standards-api';

interface Loaded {
  readonly orgId: string;
  readonly items: readonly FrameworkSummary[];
}

/**
 * The standards enabled for the current org (`GET frameworks`, enabled rows),
 * for the "standard" filter of registers and the audit pack form. Loaded once per
 * org on first use; empty without `standards:read` or when the call fails.
 */
@Injectable({ providedIn: 'root' })
export class StandardOptions {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly loaded = signal<Loaded | null>(null);
  private requested: string | null = null;

  readonly items = computed<readonly FrameworkSummary[]>(() => {
    const orgId = this.selectedOrg.currentOrgId();
    const loaded = this.loaded();
    return loaded && loaded.orgId === orgId ? loaded.items : [];
  });

  readonly ready = computed(() => this.loaded()?.orgId === this.selectedOrg.currentOrgId());

  /** Fetch the list for the current org (once). */
  ensure(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
    if (!orgId || this.requested === orgId) {
      return;
    }
    this.requested = orgId;
    if (!granted.includes('standards:read')) {
      this.loaded.set({ orgId, items: [] });
      return;
    }
    this.api.listFrameworks(orgId).subscribe({
      next: (items) => this.loaded.set({ orgId, items: items.filter((i) => i.enabled) }),
      error: () => this.loaded.set({ orgId, items: [] }),
    });
  }
}

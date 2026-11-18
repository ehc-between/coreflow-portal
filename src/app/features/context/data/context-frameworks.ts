import { Injectable, computed, inject, signal } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { orderFrameworks } from '../context-kinds';

interface Loaded {
  readonly orgId: string;
  readonly adopted: readonly string[];
}

/**
 * The standards the current organisation works with (enabled, or chosen in the
 * organisation profile). The framework pickers and filters list these first and
 * keep the rest behind "Vis alle", so a beginner is not offered eight standards
 * when the organisation follows two. Loaded once per organisation; on failure
 * every standard is simply shown (nothing is adopted).
 */
@Injectable({ providedIn: 'root' })
export class ContextFrameworks {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly state = signal<Loaded | null>(null);
  private loadingFor: string | null = null;

  /** Framework keys the organisation has adopted (empty until known). */
  readonly adopted = computed<readonly string[]>(() => {
    const state = this.state();
    return state && state.orgId === this.selectedOrg.currentOrgId() ? state.adopted : [];
  });

  /** Every framework key, adopted ones first. */
  readonly ordered = computed(() => orderFrameworks(this.adopted()));

  /** Fetch the adopted standards of the current organisation (once). */
  ensureLoaded(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.state()?.orgId === orgId || this.loadingFor === orgId) {
      return;
    }
    this.loadingFor = orgId;
    this.api.listFrameworks(orgId).subscribe({
      next: (list) => {
        this.loadingFor = null;
        const adopted = (Array.isArray(list) ? list : [])
          .filter((f) => f.enabled || f.in_profile)
          .map((f) => f.framework);
        this.state.set({ orgId, adopted });
      },
      error: () => {
        this.loadingFor = null;
        this.state.set({ orgId, adopted: [] });
      },
    });
  }
}

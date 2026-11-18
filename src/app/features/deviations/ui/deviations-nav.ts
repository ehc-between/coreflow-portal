import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { hasAnyPermission } from '../../../core/auth/permission';
import { DeviationIntakeApi } from '../../../core/deviations/intake-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import { deviationsNav } from '../deviation-display';

/**
 * The deviations sub-navigation for the current org, with the number of new
 * received reports on "Mottatte rapporter" (for `deviations:intake` holders).
 * The count is fetched once per org and refreshed by the inbox after triage.
 */
@Injectable({ providedIn: 'root' })
export class DeviationsNavService {
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly intakeApi = inject(DeviationIntakeApi);

  private readonly newReports = signal<number | null>(null);
  private loadedFor: string | null = null;

  readonly canIntake = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'deviations:intake'),
  );

  readonly items = computed<readonly ModuleNavItem[]>(() =>
    deviationsNav({ intake: this.canIntake(), newReports: this.newReports() }),
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (!orgId || !this.canIntake() || this.loadedFor === orgId) {
        return;
      }
      this.loadedFor = orgId;
      this.refresh();
    });
  }

  /** Re-count the new reports (after triage, convert or dismiss). */
  refresh(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canIntake()) {
      this.newReports.set(null);
      return;
    }
    this.intakeApi.listReports(orgId, { status: 'new', limit: 1 }).subscribe({
      next: (page) => this.newReports.set(page.total),
      error: () => this.newReports.set(null),
    });
  }
}

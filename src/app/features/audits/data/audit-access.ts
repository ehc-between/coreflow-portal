import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';

/**
 * The caller's audit permissions in the current org, as signals (zoneless-safe).
 * Keys match the backend's seeded permissions: `audits:read|write|manage|approve`.
 * Buttons for state changes follow each record's `available_actions` from the API;
 * these flags only decide which create / edit entry points are shown.
 */
@Injectable({ providedIn: 'root' })
export class AuditAccess {
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly auth = inject(AuthService);

  readonly orgId = this.selectedOrg.currentOrgId;
  private readonly permissions = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );

  readonly canWrite = computed(() => this.permissions().has('audits:write'));
  readonly canManage = computed(() => this.permissions().has('audits:manage'));
  readonly canApprove = computed(() => this.permissions().has('audits:approve'));
  readonly canReadDeviations = computed(() => this.permissions().has('deviations:read'));
  readonly canReadAudit = computed(() => this.permissions().has('audit:read'));
  readonly userId = computed(() => this.auth.user()?.id ?? null);
}

import { Injectable, computed, inject } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';

/**
 * The caller's M04 permissions in the current org, as signals:
 * `risk:read`, `risk:write` (risks, treatments, opportunities), `risk:manage`
 * (matrices, registers, the SoA, deleting risks) and `risk:accept` (sign-off).
 */
@Injectable({ providedIn: 'root' })
export class RiskPermissions {
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly granted = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );

  readonly orgId = this.selectedOrg.currentOrgId;
  readonly canWrite = computed(() => this.granted().has('risk:write'));
  readonly canManage = computed(() => this.granted().has('risk:manage'));
  readonly canAccept = computed(() => this.granted().has('risk:accept'));
  readonly canReadAudit = computed(() => this.granted().has('audit:read'));
  readonly canWriteTasks = computed(() => this.granted().has('tasks:write'));
}

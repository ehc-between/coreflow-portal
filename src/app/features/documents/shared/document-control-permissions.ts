import { Injectable, computed, inject } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';

/**
 * The caller's document-management permissions in the current org, as signals:
 * `documents:read`, `documents:draft` (author documents, register external ones),
 * `documents:manage` (types, templates, retention rules, the retention report) and
 * `documents:distribute` (distribution / read-and-acknowledge campaigns).
 */
@Injectable({ providedIn: 'root' })
export class DocumentControlPermissions {
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly granted = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );

  readonly orgId = this.selectedOrg.currentOrgId;
  readonly canDraft = computed(() => this.granted().has('documents:draft'));
  readonly canManage = computed(() => this.granted().has('documents:manage'));
  readonly canDistribute = computed(() => this.granted().has('documents:distribute'));
  readonly canReadAudit = computed(() => this.granted().has('audit:read'));
  readonly canReadStandards = computed(() => this.granted().has('standards:read'));
}

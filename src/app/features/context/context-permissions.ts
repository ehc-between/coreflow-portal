import { Signal, computed, inject } from '@angular/core';
import { SelectedOrgService } from '../../core/org/selected-org.service';

export interface ContextPermissions {
  readonly canWrite: Signal<boolean>;
  readonly canApprove: Signal<boolean>;
  readonly canManage: Signal<boolean>;
}

/**
 * The caller's M01 permissions in the current org (reactive). Call in an
 * injection context. Per-record `can_edit` / `can_approve` from the API still
 * decide what a record allows; these gate page-level actions.
 */
export function injectContextPermissions(): ContextPermissions {
  const selectedOrg = inject(SelectedOrgService);
  const granted = computed(() => new Set(selectedOrg.currentOrg()?.permissions ?? []));
  return {
    canWrite: computed(() => granted().has('context:write')),
    canApprove: computed(() => granted().has('context:approve')),
    canManage: computed(() => granted().has('context:manage')),
  };
}

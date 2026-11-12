import { Signal, computed, inject } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';

export interface RecruitmentPerms {
  readonly read: boolean;
  readonly write: boolean;
  readonly manage: boolean;
  readonly approve: boolean;
}

/** The caller's recruitment permissions in the current org (call in an injection context). */
export function injectRecruitmentPerms(): Signal<RecruitmentPerms> {
  const org = inject(SelectedOrgService);
  return computed(() => {
    const granted = org.currentOrg()?.permissions ?? [];
    return {
      read: granted.includes('recruitment:read'),
      write: granted.includes('recruitment:write'),
      manage: granted.includes('recruitment:manage'),
      approve: granted.includes('recruitment:approve'),
    };
  });
}

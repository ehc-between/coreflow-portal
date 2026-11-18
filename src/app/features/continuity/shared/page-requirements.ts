import { DestroyRef, Signal, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';

/**
 * The requirement refs a record confirmedly documents, for the assistant's page
 * context ("the user is looking at a record that documents ISO 27001 · A.5.30").
 * Empty without `standards:read` or while loading. Call in an injection context.
 */
export function confirmedRequirementRefs(
  entityType: string,
  entityId: () => string | null | undefined,
): Signal<readonly string[]> {
  const api = inject(StandardsApi);
  const selectedOrg = inject(SelectedOrgService);
  const refs = signal<readonly string[]>([]);
  let request = new Subscription();
  inject(DestroyRef).onDestroy(() => request.unsubscribe());
  effect(() => {
    const orgId = selectedOrg.currentOrgId();
    const id = entityId();
    const canRead = (selectedOrg.currentOrg()?.permissions ?? []).includes('standards:read');
    untracked(() => {
      request.unsubscribe();
      refs.set([]);
      if (!orgId || !id || !canRead) {
        return;
      }
      request = api.listLinks(orgId, { entity_type: entityType, entity_id: id }).subscribe({
        next: (links) =>
          refs.set(links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref)),
        error: () => refs.set([]),
      });
    });
  });
  return refs.asReadonly();
}

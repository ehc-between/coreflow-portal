import { Signal, computed, effect, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';

/**
 * The confirmed requirement refs of one record (for the assistant's page context:
 * "the user is looking at a record that documents ISO 27001 A.6.1"). Loads once per
 * record id, only with `standards:read`; failures leave the list empty. Call in an
 * injection context.
 */
export function injectConfirmedRefs(
  entityType: string,
  entityId: Signal<string | null | undefined>,
): Signal<readonly string[]> {
  const api = inject(StandardsApi);
  const org = inject(SelectedOrgService);
  const refs = signal<readonly string[]>([]);
  const canRead = computed(() => (org.currentOrg()?.permissions ?? []).includes('standards:read'));
  effect((onCleanup) => {
    const orgId = org.currentOrgId();
    const id = entityId();
    refs.set([]);
    if (!orgId || !id || !canRead()) {
      return;
    }
    const sub = api
      .listLinks(orgId, { entity_type: entityType, entity_id: id })
      .pipe(catchError(() => of([])))
      .subscribe((links) =>
        refs.set([
          ...new Set(links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref)),
        ]),
      );
    onCleanup(() => sub.unsubscribe());
  });
  return refs.asReadonly();
}

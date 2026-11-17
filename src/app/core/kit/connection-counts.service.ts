import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { SelectedOrgService } from '../org/selected-org.service';
import { KitApi } from './kit-api';

/** Largest id batch the counts endpoint accepts. */
export const COUNTS_BATCH = 200;

/**
 * Connection counts for list rows (P4, `GET connections/counts`): how many
 * records and tasks each row is connected to. Batched (≤ 200 ids per call) and
 * cached per org, type and id, so a list asks once per page of rows.
 *
 *   readonly counts = inject(ConnectionCountsService).load('risk', ids);
 *   // in the row: <app-connection-count [count]="counts()[risk.id]" />
 */
@Injectable({ providedIn: 'root' })
export class ConnectionCountsService {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** `<org>:<type>:<id>` → count (null while loading or after a failure). */
  private readonly cache = signal<ReadonlyMap<string, number>>(new Map());
  private readonly pending = new Set<string>();

  /** Counts for `ids` of `entityType`; missing ids are fetched, known ones reused. */
  load(entityType: string, ids: readonly string[]): Signal<Readonly<Record<string, number>>> {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      const prefix = `${orgId}:${entityType}:`;
      const known = this.cache();
      const missing = [...new Set(ids)].filter(
        (id) => !known.has(prefix + id) && !this.pending.has(prefix + id),
      );
      for (let i = 0; i < missing.length; i += COUNTS_BATCH) {
        const batch = missing.slice(i, i + COUNTS_BATCH);
        batch.forEach((id) => this.pending.add(prefix + id));
        this.api
          .connectionCounts(orgId, entityType, batch)
          .pipe(catchError(() => of({ items: {} as Record<string, number> })))
          .subscribe((res) => {
            batch.forEach((id) => this.pending.delete(prefix + id));
            this.cache.update((map) => {
              const next = new Map(map);
              for (const id of batch) {
                next.set(prefix + id, res.items?.[id] ?? 0);
              }
              return next;
            });
          });
      }
    }
    return computed(() => {
      const map = this.cache();
      const out: Record<string, number> = {};
      const org = this.selectedOrg.currentOrgId();
      for (const id of ids) {
        const value = map.get(`${org}:${entityType}:${id}`);
        if (value !== undefined) {
          out[id] = value;
        }
      }
      return out;
    });
  }

  /** Forget cached counts (after links change), for one type or all. */
  invalidate(entityType?: string): void {
    if (!entityType) {
      this.cache.set(new Map());
      return;
    }
    this.cache.update(
      (map) => new Map([...map].filter(([key]) => key.split(':')[1] !== entityType)),
    );
  }
}

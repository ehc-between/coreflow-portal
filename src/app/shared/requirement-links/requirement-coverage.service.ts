import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { RequirementCoverageCounts } from '../../core/standards/standards.models';

/** Ids per `GET requirement-coverage` call (the endpoint's limit). */
export const COVERAGE_BATCH = 200;

const ZERO: RequirementCoverageCounts = { confirmed: 0, suggested: 0 };

function cacheKey(orgId: string, entityType: string, id: string): string {
  return `${orgId}|${entityType}|${id}`;
}

/** Split ids into chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Requirement coverage of list rows ("Dokumenterer 3 krav"): batched and cached.
 *
 * - `load(entityType, ids)` fetches the ids not cached yet, ≤200 per request,
 *   and emits the counts of every requested id.
 * - `counts(entityType, id)` is the signal-friendly read used by
 *   `<app-coverage-chip>`: a miss is queued and every miss of the same tick is
 *   fetched together, so a list of 50 rows makes one request.
 *
 * Nothing is fetched without `standards:read`. Failures leave the ids uncached
 * (chips then render nothing) and never toast.
 */
@Injectable({ providedIn: 'root' })
export class RequirementCoverageService {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly cache = signal<ReadonlyMap<string, RequirementCoverageCounts>>(new Map());
  private readonly queued = new Map<string, Set<string>>();
  private readonly inflight = new Set<string>();
  /** Keys whose fetch failed: not retried by `counts()` (avoids a refetch loop) until invalidated. */
  private readonly failed = new Set<string>();
  private flushScheduled = false;

  readonly canRead = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('standards:read'),
  );

  /** Cached counts of one record, queueing a batched fetch on a miss (null until known). */
  counts(entityType: string, id: string): RequirementCoverageCounts | null {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !id || !this.canRead()) {
      return null;
    }
    const key = cacheKey(orgId, entityType, id);
    const hit = this.cache().get(key);
    if (hit) {
      return hit;
    }
    if (this.failed.has(key) || this.inflight.has(key)) {
      return null;
    }
    this.enqueue(entityType, id);
    return null;
  }

  /** Counts of these records (cached ones are not refetched). */
  load(
    entityType: string,
    ids: readonly string[],
  ): Observable<Readonly<Record<string, RequirementCoverageCounts>>> {
    const orgId = this.selectedOrg.currentOrgId();
    const unique = [...new Set(ids.filter((id) => !!id))];
    if (!orgId || !this.canRead() || unique.length === 0) {
      return of({});
    }
    const missing = unique.filter((id) => {
      const key = cacheKey(orgId, entityType, id);
      return !this.cache().has(key) && !this.inflight.has(key);
    });
    const pick = (): Readonly<Record<string, RequirementCoverageCounts>> => {
      const cache = this.cache();
      const out: Record<string, RequirementCoverageCounts> = {};
      for (const id of unique) {
        const hit = cache.get(cacheKey(orgId, entityType, id));
        if (hit) {
          out[id] = hit;
        }
      }
      return out;
    };
    if (missing.length === 0) {
      return of(pick());
    }
    missing.forEach((id) => this.inflight.add(cacheKey(orgId, entityType, id)));
    return forkJoin(
      chunk(missing, COVERAGE_BATCH).map((ids) =>
        this.api.coverage(orgId, entityType, ids).pipe(
          map((res) => ({ ids, items: res.items })),
          catchError(() => of({ ids, items: null })),
        ),
      ),
    ).pipe(
      map((results) => {
        const next = new Map(this.cache());
        for (const { ids: batch, items } of results) {
          for (const id of batch) {
            const key = cacheKey(orgId, entityType, id);
            this.inflight.delete(key);
            if (items) {
              next.set(key, items[id] ?? ZERO);
              this.failed.delete(key);
            } else {
              this.failed.add(key);
            }
          }
        }
        if (results.some((r) => r.items)) {
          this.cache.set(next);
        }
        return pick();
      }),
    );
  }

  /** Forget cached counts (after linking), for one type or some of its records. */
  invalidate(entityType: string, ids?: readonly string[]): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    const prefix = `${orgId}|${entityType}|`;
    const drop = ids ? new Set(ids.map((id) => prefix + id)) : null;
    for (const key of [...this.failed]) {
      if (drop ? drop.has(key) : key.startsWith(prefix)) {
        this.failed.delete(key);
      }
    }
    const next = new Map<string, RequirementCoverageCounts>();
    for (const [key, value] of this.cache()) {
      const stale = drop ? drop.has(key) : key.startsWith(prefix);
      if (!stale) {
        next.set(key, value);
      }
    }
    this.cache.set(next);
  }

  private enqueue(entityType: string, id: string): void {
    let ids = this.queued.get(entityType);
    if (!ids) {
      ids = new Set();
      this.queued.set(entityType, ids);
    }
    ids.add(id);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      // Collect every chip of the render pass, then fetch once per type.
      queueMicrotask(() => this.flush());
    }
  }

  private flush(): void {
    this.flushScheduled = false;
    const batches = [...this.queued];
    this.queued.clear();
    for (const [entityType, ids] of batches) {
      this.load(entityType, [...ids]).subscribe();
    }
  }
}

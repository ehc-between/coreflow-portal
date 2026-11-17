import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, Provider, computed, inject, signal } from '@angular/core';
import { Observable, Subscription, catchError, map, of, throwError } from 'rxjs';
import {
  ConnectionGroup,
  ConnectionItem,
  ConnectionsResponse,
  LinkSuggestionItem,
  SuggestionDecision,
} from '../../core/kit/connections.models';
import { ConnectionCountsService } from '../../core/kit/connection-counts.service';
import { KitApi } from '../../core/kit/kit-api';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { LinkItem, LinkList } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';

const EMPTY: ConnectionsResponse = {
  counts: { records: 0, requirements: 0, tasks: 0, suggestions: 0 },
  groups: [],
  suggestions: [],
  requirements: { confirmed: 0, suggested: 0 },
};

/**
 * The connections of one record (`GET connections`), shared by everything on its
 * detail page: the aside panel, the Related tab and its count badge load it once
 * and see each other's changes (accept a suggestion in the panel, and the tab
 * updates). `record-detail-layout` provides one per page; a kit component used
 * on its own gets its own (see {@link provideConnectionsStore}).
 *
 * Servers without the P4 endpoint fall back to `GET links` (user links only).
 */
@Injectable()
export class ConnectionsStore {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly listCounts = inject(ConnectionCountsService);

  private readonly key = signal<{ orgId: string; type: string; id: string } | null>(null);
  readonly data = signal<ConnectionsResponse>(EMPTY);
  readonly loading = signal(true);
  readonly errorKey = signal<string | null>(null);
  /** False when the server only knows `GET links` (no structural relations, no suggestions). */
  readonly full = signal(true);
  /** Bumps after every change made through the store (links added, removed, accepted). */
  readonly revision = signal(0);

  readonly groups = computed(() => this.data().groups);
  readonly suggestions = computed(() => this.data().suggestions);
  readonly counts = computed(() => this.data().counts);
  /** Connected records and tasks: the Related tab's count. */
  readonly relatedCount = computed(() => {
    const c = this.data().counts;
    return c.records + c.tasks;
  });

  private sub: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  /** Point the store at a record (reloads when it changes; no-op when unchanged). */
  setRecord(entityType: string, entityId: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const current = this.key();
    if (
      current &&
      current.orgId === orgId &&
      current.type === entityType &&
      current.id === entityId
    ) {
      return;
    }
    this.key.set(orgId ? { orgId, type: entityType, id: entityId } : null);
    this.reload();
  }

  reload(): void {
    this.sub?.unsubscribe();
    const key = this.key();
    this.errorKey.set(null);
    if (!key) {
      this.data.set(EMPTY);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.sub = this.fetch(key.orgId, key.type, key.id).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.data.set(EMPTY);
        this.errorKey.set(kitErrorKey(error));
        this.loading.set(false);
      },
    });
  }

  /** A link was just made elsewhere (picker): refresh to place it in its group. */
  linked(): void {
    this.changed();
    this.reload();
  }

  unlink(linkId: string): Observable<void> {
    const key = this.key();
    if (!key) {
      return of(undefined);
    }
    return this.api.deleteLink(key.orgId, linkId).pipe(
      map(() => {
        this.data.update((d) => removeLink(d, linkId));
        this.changed();
      }),
    );
  }

  accept(suggestion: LinkSuggestionItem): Observable<SuggestionDecision> {
    return this.decide(suggestion, true);
  }

  dismiss(suggestion: LinkSuggestionItem): Observable<SuggestionDecision> {
    return this.decide(suggestion, false);
  }

  /** Links changed: bump the revision and let list counts refetch. */
  private changed(): void {
    this.revision.update((n) => n + 1);
    this.listCounts.invalidate();
  }

  private decide(suggestion: LinkSuggestionItem, accept: boolean): Observable<SuggestionDecision> {
    const key = this.key();
    if (!key) {
      return throwError(() => new Error('no record'));
    }
    const call = accept
      ? this.api.acceptSuggestion(key.orgId, suggestion.id)
      : this.api.dismissSuggestion(key.orgId, suggestion.id);
    return call.pipe(
      map((decision) => {
        this.data.update((d) => ({
          ...d,
          suggestions: d.suggestions.filter((s) => s.id !== suggestion.id),
          counts: { ...d.counts, suggestions: Math.max(0, d.counts.suggestions - 1) },
        }));
        this.changed();
        if (accept) {
          // The accepted link lands in its group with origin and type from the server.
          this.reload();
        }
        return decision;
      }),
    );
  }

  private fetch(orgId: string, type: string, id: string): Observable<ConnectionsResponse> {
    return this.api.connections(orgId, type, id).pipe(
      map((res) => {
        this.full.set(true);
        return normalize(res);
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          // Older server without P4: show the plain links.
          return this.api.links(orgId, type, id).pipe(
            map((list) => {
              this.full.set(false);
              return fromLinks({ items: Array.isArray(list?.items) ? list.items : [] });
            }),
            catchError(() => throwError(() => error)),
          );
        }
        return throwError(() => error);
      }),
    );
  }
}

/**
 * One store per detail page: reuse the page's (the layout's) when there is one,
 * else create a store for this component.
 */
export function provideConnectionsStore(): Provider {
  return {
    provide: ConnectionsStore,
    useFactory: () =>
      inject(ConnectionsStore, { optional: true, skipSelf: true }) ?? new ConnectionsStore(),
  };
}

/** Tolerate partial bodies (older servers, stubs): every field the UI reads is present. */
export function normalize(
  res: Partial<ConnectionsResponse> | null | undefined,
): ConnectionsResponse {
  const groups = Array.isArray(res?.groups) ? res.groups : [];
  return {
    counts: { ...EMPTY.counts, ...(res?.counts ?? {}) },
    groups: groups.map((g) => ({ ...g, items: Array.isArray(g.items) ? g.items : [] })),
    suggestions: Array.isArray(res?.suggestions) ? res.suggestions : [],
    requirements: { ...EMPTY.requirements, ...(res?.requirements ?? {}) },
  };
}

/** Plain links (`GET links`) in the connections shape, one group per record type. */
export function fromLinks(list: LinkList): ConnectionsResponse {
  const groups = new Map<string, ConnectionItem[]>();
  const meta = new Map<string, LinkItem>();
  for (const link of list.items) {
    const type = link.other.entity_type;
    const items = groups.get(type) ?? [];
    items.push({
      link_id: link.id,
      origin: link.origin ?? 'user',
      link_type: link.link_type,
      direction: link.direction,
      flow_key: link.flow_key ?? null,
      created_at: link.created_at,
      other: link.other,
    });
    groups.set(type, items);
    meta.set(type, link);
  }
  const out: ConnectionGroup[] = [...groups.entries()].map(([type, items]) => ({
    module: meta.get(type)?.other.module ?? '',
    entity_type: type,
    label_key: meta.get(type)?.other.label_key ?? null,
    kind: type === 'task' ? 'task' : 'record',
    count: items.length,
    items,
  }));
  const tasks = out.filter((g) => g.kind === 'task').reduce((n, g) => n + g.count, 0);
  return {
    ...EMPTY,
    groups: [...out.filter((g) => g.kind === 'record'), ...out.filter((g) => g.kind === 'task')],
    counts: { ...EMPTY.counts, records: list.items.length - tasks, tasks },
  };
}

function removeLink(data: ConnectionsResponse, linkId: string): ConnectionsResponse {
  let removedRecords = 0;
  let removedTasks = 0;
  const groups = data.groups
    .map((g) => {
      const items = g.items.filter((i) => i.link_id !== linkId);
      const removed = g.items.length - items.length;
      if (removed > 0) {
        if (g.kind === 'task') {
          removedTasks += removed;
        } else {
          removedRecords += removed;
        }
      }
      return removed > 0 ? { ...g, items, count: Math.max(0, g.count - removed) } : g;
    })
    .filter((g) => g.count > 0);
  return {
    ...data,
    groups,
    counts: {
      ...data.counts,
      records: Math.max(0, data.counts.records - removedRecords),
      tasks: Math.max(0, data.counts.tasks - removedTasks),
    },
  };
}

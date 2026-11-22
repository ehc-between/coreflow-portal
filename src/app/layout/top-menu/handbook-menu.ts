import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';

/** One process box of `GET /orgs/{org}/processes/handbook` (IA v2 §6.4), as far as the menu needs it. */
interface HandbookBox {
  readonly id: string;
  readonly title: string;
}

interface HandbookMap {
  readonly management?: readonly HandbookBox[];
  readonly core?: readonly HandbookBox[];
  readonly support?: readonly HandbookBox[];
}

/** A process row in the Håndbok dropdown. */
export interface HandbookMenuItem {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  /** `nav.areas.handbook.kinds.<kind>`: the grey line ("Kjerneprosess"). */
  readonly hintKey: string;
}

/** Core processes first (in chain order, as the server sends them), then management, then support. */
export function handbookMenuItems(map: HandbookMap | null): HandbookMenuItem[] {
  if (!map) return [];
  const rows = (boxes: readonly HandbookBox[] | undefined, kind: string): HandbookMenuItem[] =>
    (boxes ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      path: `/handbook/${b.id}`,
      hintKey: `nav.areas.handbook.kinds.${kind}`,
    }));
  return [
    ...rows(map.core, 'core'),
    ...rows(map.management, 'management'),
    ...rows(map.support, 'support'),
  ];
}

/**
 * The Håndbok dropdown's process rows (IA v2 §4.2 `dynamicItems: 'processes'`): one per
 * process, read from the Håndbok map endpoint the first time the dropdown opens and
 * cached per org. Any error (older backend, no access) leaves only the static rows.
 */
@Injectable({ providedIn: 'root' })
export class HandbookMenu {
  private readonly api = inject(ApiService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly cache = signal<{ readonly orgId: string; readonly map: HandbookMap } | null>(
    null,
  );
  private loadingOrg: string | null = null;

  readonly items = computed(() => {
    const cached = this.cache();
    return cached && cached.orgId === this.selectedOrg.currentOrgId()
      ? handbookMenuItems(cached.map)
      : [];
  });

  /** Fetch the processes for the selected org unless they are cached or on their way. */
  ensureLoaded(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.cache()?.orgId === orgId || this.loadingOrg === orgId) return;
    this.loadingOrg = orgId;
    this.api.get<HandbookMap>(`v1/orgs/${orgId}/processes/handbook`).subscribe({
      next: (map) => {
        this.loadingOrg = null;
        this.cache.set({ orgId, map });
      },
      error: () => {
        this.loadingOrg = null;
        this.cache.set({ orgId, map: {} });
      },
    });
  }

  /** Forget the cache (after the map changed). */
  invalidate(): void {
    this.cache.set(null);
  }
}

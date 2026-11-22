import { Injectable, computed, inject, signal } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { HandbookApi } from './handbook-api';
import { allBoxes } from './handbook.logic';
import { HandbookMap } from './handbook.models';

type State =
  | { readonly status: 'idle' | 'loading' | 'error'; readonly orgId: string | null }
  | { readonly status: 'ready'; readonly orgId: string; readonly map: HandbookMap };

/**
 * The Håndbok process map of the selected org, loaded once and cached (IA v2 §4.2):
 * the map page, the process pages and the process rows of the menu read it.
 * `invalidate()` after a change (reorder) so the next read reloads.
 */
@Injectable({ providedIn: 'root' })
export class HandbookStore {
  private readonly api = inject(HandbookApi);
  private readonly org = inject(SelectedOrgService);
  private readonly state = signal<State>({ status: 'idle', orgId: null });

  readonly status = computed(() => {
    const s = this.state();
    return s.orgId === this.org.currentOrgId() ? s.status : 'idle';
  });

  readonly map = computed<HandbookMap | null>(() => {
    const s = this.state();
    return s.status === 'ready' && s.orgId === this.org.currentOrgId() ? s.map : null;
  });

  /** One menu row per process: core in chain order, then management, then support. */
  readonly menuItems = computed(() =>
    allBoxes(this.map()).map((b) => ({ id: b.id, title: b.title, path: `/handbook/${b.id}` })),
  );

  /**
   * Load the map for the selected org unless it is loaded or on its way. `force` reloads;
   * a map already shown stays on screen while it refreshes (no skeleton flash).
   */
  load(force = false): void {
    const orgId = this.org.currentOrgId();
    if (!orgId) {
      return;
    }
    const s = this.state();
    if (!force && s.orgId === orgId && (s.status === 'ready' || s.status === 'loading')) {
      return;
    }
    const shown = s.status === 'ready' && s.orgId === orgId ? s.map : null;
    if (!shown) {
      this.state.set({ status: 'loading', orgId });
    }
    this.api.map(orgId).subscribe({
      next: (map) => this.state.set({ status: 'ready', orgId, map }),
      error: () =>
        this.state.set(shown ? { status: 'ready', orgId, map: shown } : { status: 'error', orgId }),
    });
  }

  /** Replace the cached map (after an optimistic reorder). */
  set(map: HandbookMap): void {
    const orgId = this.org.currentOrgId();
    if (orgId) {
      this.state.set({ status: 'ready', orgId, map });
    }
  }

  invalidate(): void {
    this.state.set({ status: 'idle', orgId: null });
  }
}

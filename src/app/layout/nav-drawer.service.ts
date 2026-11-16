import { Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { SelectedOrgService } from '../core/org/selected-org.service';

/**
 * Shell state of the side navigation:
 * - the off-canvas drawer below `lg` (hamburger in the top bar),
 * - hidden items ("Tilpass menyen") and collapsed sections, both remembered per
 *   org in localStorage (`coreflow.nav.hidden.<orgId>`, `coreflow.nav.collapsed.<orgId>`).
 */
@Injectable({ providedIn: 'root' })
export class NavDrawerService {
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly _open = signal(false);
  /** Whether the drawer is open (only meaningful below `lg`). */
  readonly open = this._open.asReadonly();

  private readonly orgKey = computed(() => this.selectedOrg.currentOrgId() ?? 'none');

  private readonly hiddenByOrg = signal<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  private readonly collapsedByOrg = signal<ReadonlyMap<string, ReadonlySet<string>>>(new Map());

  /** Paths the user hid from the menu in the current org. */
  readonly hidden = computed(() => this.read(this.hiddenByOrg, 'hidden'));
  /** Section label keys the user collapsed in the current org. */
  readonly collapsed = computed(() => this.read(this.collapsedByOrg, 'collapsed'));

  show(): void {
    this._open.set(true);
  }

  close(): void {
    this._open.set(false);
  }

  toggle(): void {
    this._open.update((o) => !o);
  }

  toggleHidden(path: string): void {
    this.write(this.hiddenByOrg, 'hidden', path);
  }

  toggleCollapsed(sectionKey: string): void {
    this.write(this.collapsedByOrg, 'collapsed', sectionKey);
  }

  private read(
    store: WritableSignal<ReadonlyMap<string, ReadonlySet<string>>>,
    kind: string,
  ): ReadonlySet<string> {
    const org = this.orgKey();
    const cached = store().get(org);
    if (cached) {
      return cached;
    }
    return loadSet(`coreflow.nav.${kind}.${org}`);
  }

  private write(
    store: WritableSignal<ReadonlyMap<string, ReadonlySet<string>>>,
    kind: string,
    value: string,
  ): void {
    const org = this.orgKey();
    const next = new Set(store().get(org) ?? loadSet(`coreflow.nav.${kind}.${org}`));
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    store.update((map) => new Map(map).set(org, next));
    try {
      globalThis.localStorage?.setItem(`coreflow.nav.${kind}.${org}`, JSON.stringify([...next]));
    } catch {
      // Best effort (private mode).
    }
  }
}

function loadSet(key: string): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

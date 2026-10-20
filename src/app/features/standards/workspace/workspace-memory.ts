import { Injectable } from '@angular/core';

/** What a reader had open in a standard's workspace when they left it. */
export interface WorkspaceSnapshot {
  readonly active: string | null;
  readonly scrollTop: number;
  readonly expandedRefs: ReadonlySet<string>;
  readonly renderedUnits: ReadonlySet<string>;
  readonly openGuidance: ReadonlySet<string>;
  readonly openLicensed: ReadonlySet<string>;
  readonly tocUserExpanded: ReadonlySet<string>;
  readonly gapsOnly: boolean;
  readonly keepRefs: ReadonlySet<string>;
}

/**
 * In-memory (per tab, per session) workspace state keyed by org + standard, so
 * following an evidence link and pressing Back returns the reader to the same
 * expanded requirement and scroll position. Nothing is persisted.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceMemory {
  private readonly snapshots = new Map<string, WorkspaceSnapshot>();

  save(orgId: string, key: string, snapshot: WorkspaceSnapshot): void {
    this.snapshots.set(`${orgId}:${key}`, snapshot);
  }

  get(orgId: string, key: string): WorkspaceSnapshot | null {
    return this.snapshots.get(`${orgId}:${key}`) ?? null;
  }
}

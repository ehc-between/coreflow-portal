import { Injectable, computed, inject, signal } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { PeopleApi } from './people-api';
import { Competence, Position } from './people.models';

export interface LookupOption {
  readonly id: string;
  readonly label: string;
}

interface Cache<T> {
  readonly orgId: string;
  readonly items: readonly T[];
}

/**
 * Option lists the people pages share (cached per org, reactive): positions and
 * competences of the register, plus the org's users and departments from the
 * platform assignee options. `invalidate()` after creating or deleting one.
 */
@Injectable({ providedIn: 'root' })
export class PeopleLookups {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly assignees = inject(AssigneeOptionsService);

  private readonly positionCache = signal<Cache<Position> | null>(null);
  private readonly competenceCache = signal<Cache<Competence> | null>(null);
  private loading = new Set<string>();

  readonly positions = computed<readonly Position[]>(() => {
    const cache = this.positionCache();
    return cache && cache.orgId === this.selectedOrg.currentOrgId() ? cache.items : [];
  });

  readonly competences = computed<readonly Competence[]>(() => {
    const cache = this.competenceCache();
    return cache && cache.orgId === this.selectedOrg.currentOrgId() ? cache.items : [];
  });

  readonly users = computed<readonly LookupOption[]>(() =>
    this.assignees.options().users.map((o) => ({ id: o.value.slice(5), label: o.label })),
  );

  readonly departments = computed<readonly LookupOption[]>(() =>
    this.assignees.options().departments.map((o) => ({ id: o.value.slice(11), label: o.label })),
  );

  /** Load positions, competences, users and departments once for the current org. */
  ensureLoaded(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.assignees.ensureLoaded();
    if (!orgId) {
      return;
    }
    if (this.positionCache()?.orgId !== orgId && !this.loading.has(`p:${orgId}`)) {
      this.loading.add(`p:${orgId}`);
      this.api.listPositions(orgId, { limit: 500 }).subscribe({
        next: (page) => {
          this.loading.delete(`p:${orgId}`);
          this.positionCache.set({ orgId, items: page.items });
        },
        error: () => this.loading.delete(`p:${orgId}`),
      });
    }
    if (this.competenceCache()?.orgId !== orgId && !this.loading.has(`c:${orgId}`)) {
      this.loading.add(`c:${orgId}`);
      this.api.listCompetences(orgId, { limit: 500 }).subscribe({
        next: (page) => {
          this.loading.delete(`c:${orgId}`);
          this.competenceCache.set({ orgId, items: page.items });
        },
        error: () => this.loading.delete(`c:${orgId}`),
      });
    }
  }

  /** Forget the cached lists (they reload on the next `ensureLoaded`). */
  invalidate(): void {
    this.positionCache.set(null);
    this.competenceCache.set(null);
  }
}

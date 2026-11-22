import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription, catchError, of } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocationsApi } from '../../../core/locations/locations-api';
import { LocationCount } from '../../../core/locations/locations.models';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { HomeApi } from '../../dashboard/data/home-api';
import { NextAction } from '../../dashboard/data/home.models';

export type HubState = 'loading' | 'error' | 'ready';

/** Next actions the hubs read (the API's maximum). */
const ACTION_LIMIT = 20;

/**
 * What every area hub loads (docs/ia-v2.md §6.7, decision D4): the live count of
 * every place of the enabled modules (`GET /locations/counts`) and the caller's next
 * actions (`GET /next-actions`), reloaded when the org or the language changes.
 * Provide it on the page component.
 */
@Injectable()
export class HubLoader {
  private readonly locations = inject(LocationsApi);
  private readonly home = inject(HomeApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly modules = inject(ModuleService);

  readonly state = signal<HubState>('loading');
  readonly counts = signal<readonly LocationCount[]>([]);
  readonly actions = signal<readonly NextAction[]>([]);
  readonly orgId = this.selectedOrg.currentOrgId;
  readonly orgName = computed(() => this.selectedOrg.currentOrg()?.name ?? '');
  private readonly granted = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );

  private subs: Subscription[] = [];

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const lang = this.language.active();
      untracked(() => this.load(orgId, lang));
    });
    inject(DestroyRef).onDestroy(() => this.subs.forEach((s) => s.unsubscribe()));
  }

  /** Whether the user holds `permission` in the selected org. */
  can(permission: string): boolean {
    return this.granted().has(permission);
  }

  /** Whether `module` is on for the selected org. */
  enabled(module: string): boolean {
    return this.modules.isEnabled(module);
  }

  reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.language.active());
  }

  private load(orgId: string | null, lang: string): void {
    this.subs.forEach((s) => s.unsubscribe());
    if (!orgId) {
      this.counts.set([]);
      this.actions.set([]);
      this.state.set('ready');
      return;
    }
    if (!this.counts().length) {
      this.state.set('loading');
    }
    this.subs = [
      this.locations.counts(orgId, lang, ['register', 'page']).subscribe({
        next: (res) => {
          this.counts.set(res.items);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      }),
      // Attention lists are extra: without them the hub still works.
      this.home
        .nextActions(orgId, lang, ACTION_LIMIT)
        .pipe(catchError(() => of({ items: [] as NextAction[] })))
        .subscribe((res) => this.actions.set(res.items ?? [])),
    ];
  }
}

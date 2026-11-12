import { Injectable, Injector, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, tap } from 'rxjs';
import { SelectedOrgService } from '../org/selected-org.service';
import { Terminology, TermOverrides } from './module.models';
import { ModulesApi } from './modules-api';
import { TerminologyStore } from './terminology-transpiler';

/**
 * Loads the selected org's terminology overrides into {@link TerminologyStore}
 * (read by the Transloco transpiler) and re-renders translations when they
 * change. Transloco is resolved lazily: the transpiler is part of Transloco's
 * own construction, so an eager inject here would be circular.
 */
@Injectable({ providedIn: 'root' })
export class TerminologyService {
  private readonly api = inject(ModulesApi);
  private readonly store = inject(TerminologyStore);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly injector = inject(Injector);

  private readonly _termKeys = signal<readonly string[]>(this.store.keys());

  /** The selected org's overrides. */
  readonly overrides = this.store.overrides;
  /** Every term key the org may override (base keys plus module terms). */
  readonly termKeys = this._termKeys.asReadonly();

  private loadedFor: string | null | undefined = undefined;

  /** Start following the selected org (called once at startup). */
  init(): void {
    effect(
      () => {
        const orgId = this.selectedOrg.currentOrgId();
        untracked(() => {
          if (orgId !== this.loadedFor) {
            this.load(orgId);
          }
        });
      },
      { injector: this.injector },
    );
  }

  /** Save the overrides (replacing all of them) and apply them right away. */
  update(orgId: string, terms: TermOverrides): Observable<Terminology> {
    return this.api.updateTerminology(orgId, terms).pipe(tap((result) => this.apply(result)));
  }

  /** Apply a terminology payload (e.g. one fetched by a page). */
  apply(terminology: Terminology): void {
    this.store.set(terminology.terms ?? {}, terminology.term_keys);
    if (terminology.term_keys?.length) {
      this._termKeys.set(terminology.term_keys);
    }
    this.refreshTranslations();
  }

  private load(orgId: string | null): void {
    this.loadedFor = orgId;
    if (!orgId) {
      this.store.set({});
      this.refreshTranslations();
      return;
    }
    this.api.getTerminology(orgId).subscribe({
      next: (terminology) => {
        if (this.selectedOrg.currentOrgId() === orgId) {
          this.apply(terminology);
        }
      },
      // Older backends without terminology: keep the global defaults.
      error: () => {
        if (this.selectedOrg.currentOrgId() === orgId) {
          this.store.set({});
          this.refreshTranslations();
        }
      },
    });
  }

  /** Re-emit the active language so every transloco pipe re-translates. */
  private refreshTranslations(): void {
    const transloco = this.injector.get(TranslocoService);
    transloco.setActiveLang(transloco.getActiveLang());
  }
}

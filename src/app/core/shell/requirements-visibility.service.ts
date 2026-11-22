import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SelectedOrgService } from '../org/selected-org.service';

const KEY = 'coreflow.showReq.';
/** Pages where requirements are the point: always shown, the switch is ignored. */
const EXPERT_PREFIXES = ['/standards', '/settings/modules', '/reports/audit-packs'];

/**
 * "Vis krav" (IA v2 §4.3): requirement chips and panels are hidden by default and
 * shown when the user switches this on. Per user and org, remembered in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class RequirementsVisibilityService {
  private readonly org = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly _on = signal(false);
  private readonly _url = signal(this.router.url);
  /** The switch itself. */
  readonly on = this._on.asReadonly();
  /** On an expert page (standards workspace, SoA, audit packs). */
  readonly expert = computed(() => EXPERT_PREFIXES.some((p) => this._url().startsWith(p)));
  /** What components read: show requirement chips / panels now. */
  readonly show = computed(() => this._on() || this.expert());

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this._url.set(e.urlAfterRedirects));
    // Re-read the remembered value whenever the selected org changes.
    effect(() => {
      const orgId = this.org.currentOrgId();
      untracked(() => this._on.set(this.read(orgId)));
    });
  }

  toggle(): void {
    this.set(!this._on());
  }

  set(on: boolean): void {
    this._on.set(on);
    try {
      localStorage.setItem(KEY + (this.org.currentOrgId() ?? 'none'), on ? '1' : '0');
    } catch {
      /* private mode: in-memory only */
    }
  }

  private read(orgId: string | null): boolean {
    try {
      return localStorage.getItem(KEY + (orgId ?? 'none')) === '1';
    } catch {
      return false;
    }
  }
}

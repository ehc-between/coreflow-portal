import { Injectable, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { GuidanceApi } from './guidance-api';
import { GuidanceLevel, PreferencesDto } from './guidance.models';

export type { GuidanceLevel } from './guidance.models';

const FALLBACK_LEVEL: GuidanceLevel = 'standard';

/**
 * The signed-in user's learning-mode level for the selected org.
 *
 * `level` is the effective level: the personal choice, else the org default, else
 * `'standard'`. It reloads from `GET /me/preferences?org_id=` whenever the user or the
 * selected org changes. `setLevel` saves optimistically and reverts on failure.
 * Guidance components read `level` / `isBeginner` / `isExpert` to adapt.
 */
@Injectable({ providedIn: 'root' })
export class GuidanceService {
  private readonly api = inject(GuidanceApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);

  private readonly _personal = signal<GuidanceLevel | null>(null);
  private readonly _orgDefault = signal<GuidanceLevel>(FALLBACK_LEVEL);
  private readonly _loaded = signal(false);
  private readonly _saving = signal(false);

  /** The user's own choice, or null when following the org default. */
  readonly personalLevel: Signal<GuidanceLevel | null> = this._personal.asReadonly();
  /** The selected org's default level (`'standard'` without an org). */
  readonly orgDefault: Signal<GuidanceLevel> = this._orgDefault.asReadonly();
  /** Effective level: user, else org default, else `'standard'`. */
  readonly level: Signal<GuidanceLevel> = computed(() => this._personal() ?? this._orgDefault());
  readonly isBeginner = computed(() => this.level() === 'beginner');
  readonly isExpert = computed(() => this.level() === 'expert');
  /** True once the preferences for the current user/org have loaded. */
  readonly loaded = this._loaded.asReadonly();
  readonly saving = this._saving.asReadonly();

  private loadSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const signedIn = this.auth.isAuthenticated();
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => (signedIn ? this.load(orgId) : this.reset()));
    });
  }

  /** Re-fetch the preferences (e.g. after an admin changed the org default). */
  reload(): void {
    if (this.auth.isAuthenticated()) {
      this.load(this.selectedOrg.currentOrgId());
    }
  }

  /** Set the personal level; `null` follows the organisation default. */
  setLevel(level: GuidanceLevel | null): void {
    const previous = this._personal();
    if (previous === level || this._saving()) {
      return;
    }
    this._personal.set(level);
    this._saving.set(true);
    this.api.updatePreferences(level, this.selectedOrg.currentOrgId()).subscribe({
      next: (prefs) => {
        this._saving.set(false);
        this.apply(prefs);
        this.toasts.success('guidance.level.saved');
      },
      error: () => {
        this._saving.set(false);
        this._personal.set(previous);
        this.toasts.error('guidance.level.saveFailed');
      },
    });
  }

  private load(orgId: string | null): void {
    this.loadSub?.unsubscribe();
    this.loadSub = this.api.getPreferences(orgId).subscribe({
      next: (prefs) => {
        this.apply(prefs);
        this._loaded.set(true);
      },
      // Guidance is an enhancement: on failure keep the defaults and stay usable.
      error: () => this._loaded.set(true),
    });
  }

  private apply(prefs: PreferencesDto): void {
    this._personal.set(prefs.guidance_level);
    this._orgDefault.set(prefs.org_default);
  }

  private reset(): void {
    this.loadSub?.unsubscribe();
    this.loadSub = null;
    this._personal.set(null);
    this._orgDefault.set(FALLBACK_LEVEL);
    this._loaded.set(false);
  }
}

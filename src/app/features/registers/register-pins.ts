import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { MAX_PINS } from '../../core/shell/shell-preferences.models';
import { ShellPreferencesService } from '../../core/shell/shell-preferences.service';
import { defaultPins } from '../../layout/nav-v2';

/**
 * The hub's view of the user's pins (provided by the hub). There is one pin list:
 * `ShellPreferencesService` stores it on the server (`/me/orgs/{org}/preferences`,
 * keys are route paths), the shell v2 menu shows it under "Festet", and until the
 * user changes it the role defaults of `nav-v2` apply. A pin the hub cannot show (its
 * module was switched off) is dropped the next time the user pins or unpins.
 */
@Injectable()
export class RegisterPinState {
  private readonly prefs = inject(ShellPreferencesService);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Every pin key in force: the user's own, else the role defaults. */
  readonly keys = computed<readonly string[]>(
    () => this.prefs.pins() ?? defaultPins(this.selectedOrg.currentOrg()?.roles ?? []),
  );

  private readonly source = signal<Signal<readonly string[]>>(signal([]));

  /** The pins the hub shows, in pin order (see {@link connect}). */
  readonly shown = computed(() => this.source()());

  readonly full = computed(() => this.shown().length >= MAX_PINS);

  /** Pins can change once the preferences have loaded, and not while a save runs. */
  readonly editable = computed(() => this.prefs.loaded() && !this.prefs.saving());

  readonly max = MAX_PINS;

  /** The hub tells which pins it resolved to rows. */
  connect(shown: Signal<readonly string[]>): void {
    this.source.set(shown);
  }

  isPinned(key: string): boolean {
    return this.shown().includes(key);
  }

  /** Pin or unpin; pinning is ignored when {@link MAX_PINS} are already pinned. */
  toggle(key: string): void {
    if (!this.editable()) {
      return;
    }
    const shown = this.shown();
    if (shown.includes(key)) {
      this.prefs.setPins(shown.filter((k) => k !== key));
    } else if (shown.length < MAX_PINS) {
      this.prefs.setPins([...shown, key]);
    }
  }
}

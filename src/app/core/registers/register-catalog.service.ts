import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { LanguageService } from '../i18n/language.service';
import { LocationsApi } from '../locations/locations-api';
import { LocationLite } from '../locations/locations.models';
import { SelectedOrgService } from '../org/selected-org.service';

/** A register the menu can show as a pin: its link and short name. */
export interface RegisterEntry {
  /** The pin key: the list route without the leading slash (`assets/calibration`). */
  readonly path: string;
  /** "Kalibrering" from "Eiendeler og endringer: kalibrering". */
  readonly title: string;
  readonly module: string;
}

/** The pin key of a list route: `'/assets/calibration'` → `'assets/calibration'`. */
export function pinKeyOf(route: string): string {
  return route.replace(/^\/+/, '');
}

/** Split "Module: thing" into a capitalised title and the module part. */
export function splitLabel(label: string): { title: string; area: string | null } {
  const at = label.indexOf(': ');
  if (at < 0) {
    return { title: label, area: null };
  }
  const rest = label.slice(at + 2).trim();
  return { title: rest.charAt(0).toLocaleUpperCase() + rest.slice(1), area: label.slice(0, at) };
}

interface CatalogState {
  readonly org: string;
  readonly lang: string;
  readonly entries: ReadonlyMap<string, RegisterEntry>;
}

/**
 * The names of the registers of the enabled modules, keyed by pin key (U04).
 *
 * Pins are stored as route paths (`ShellPreferencesService`). The shell v2 menu knows
 * the module registers and the role-default pins by heart (`nav-v2` PIN_TARGETS); any
 * other register a user pins in Registre is named from the locations registry: the
 * hub fills this in from the data it already loaded, and the menu asks for the
 * vocabulary (`GET /locations`, one call per org and language) only when it holds a
 * pin it cannot name. Labels arrive in the request language.
 */
@Injectable({ providedIn: 'root' })
export class RegisterCatalogService {
  private readonly api = inject(LocationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  private readonly state = signal<CatalogState | null>(null);
  private pending: { org: string; lang: string; sub: Subscription } | null = null;

  /** The entries for the current org and language, or null before they are known. */
  readonly entries: Signal<ReadonlyMap<string, RegisterEntry> | null> = computed(() => {
    const state = this.state();
    return state &&
      state.org === this.selectedOrg.currentOrgId() &&
      state.lang === this.language.active()
      ? state.entries
      : null;
  });

  /** Take the names from places already loaded (the hub's counts). */
  remember(org: string, lang: string, places: readonly LocationLite[]): void {
    this.state.set({ org, lang, entries: toEntries(places) });
  }

  /** Load the names for the current org and language unless known or on their way. */
  ensure(): void {
    const org = this.selectedOrg.currentOrgId();
    const lang = this.language.active();
    if (!org || this.entries() || (this.pending?.org === org && this.pending.lang === lang)) {
      return;
    }
    this.pending?.sub.unsubscribe();
    const sub = this.api.vocabulary(org, lang).subscribe({
      next: (places) => {
        this.pending = null;
        this.remember(org, lang, places);
      },
      // The pin simply stays out of the menu; it is still listed in Registre.
      error: () => (this.pending = null),
    });
    // A synchronous answer (tests) has already cleared the slot.
    if (!sub.closed) {
      this.pending = { org, lang, sub };
    }
  }
}

/** One entry per list route; the first place declared wins when two share a route. */
function toEntries(places: readonly LocationLite[]): ReadonlyMap<string, RegisterEntry> {
  const entries = new Map<string, RegisterEntry>();
  for (const place of places) {
    if (!place.module_enabled || place.route.includes('{')) {
      continue;
    }
    const path = pinKeyOf(place.route);
    if (!entries.has(path)) {
      entries.set(path, { path, title: splitLabel(place.label).title, module: place.module });
    }
  }
  return entries;
}

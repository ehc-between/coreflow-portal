import { Injectable, Signal, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

/** localStorage key under which the user's chosen theme is persisted. */
export const THEME_STORAGE_KEY = 'coreflow-theme';

/**
 * Signal-based theme store. Drives dark mode via a `data-theme` attribute on
 * <html> (NOT Tailwind's `.dark` class) so the design-token CSS variables in
 * styles.scss switch wholesale. Initial value is the persisted choice, else the
 * OS preference. The effect mirrors the signal to the DOM and persists it.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(readInitialTheme());

  /** The active theme, reactive to changes from anywhere. */
  readonly theme: Signal<Theme> = this._theme.asReadonly();

  constructor() {
    effect(() => {
      const theme = this._theme();
      document.documentElement.dataset['theme'] = theme;
      try {
        globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Persistence is best-effort (e.g. private mode / storage disabled).
      }
    });
  }

  /** Flip between light and dark. */
  toggle(): void {
    this._theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  /** Set the theme explicitly. */
  set(theme: Theme): void {
    this._theme.set(theme);
  }
}

function readInitialTheme(): Theme {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // Fall through to system preference.
  }
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

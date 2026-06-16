import { Injectable, signal } from '@angular/core';

/**
 * Open/closed view state for the ⌘K command palette. Mirrors {@link AskPanelService}'s
 * visibility surface (no conversation state lives here — the palette is stateless
 * between opens). The top bar (search button and ⌘K) toggle visibility; the palette
 * component reads the signal.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly _open = signal(false);

  /** Whether the command palette is currently shown. */
  readonly open = this._open.asReadonly();

  show(): void {
    this._open.set(true);
  }

  hide(): void {
    this._open.set(false);
  }

  toggle(): void {
    this._open.update((open) => !open);
  }
}

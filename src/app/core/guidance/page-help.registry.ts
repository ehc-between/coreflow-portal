import { Injectable, computed, signal } from '@angular/core';

/** A "Hvorfor dette er viktig" note a page asked for (`<app-why-it-matters>`). */
export interface PageWhyEntry {
  readonly scope: string;
  readonly page: string;
  readonly frameworks: readonly string[] | null;
}

/**
 * Beginner mode v2 (U38): one help entry point per page. The page's `<app-help-strip>`
 * (the "?") registers here; teaching widgets that used to sit on the page
 * (`<app-why-it-matters>`, the task guide) register what they would have shown and
 * render nothing while a help strip is present. The strip's panel then shows them, so
 * the teaching moves behind the "?" without editing every page.
 */
@Injectable({ providedIn: 'root' })
export class PageHelpRegistry {
  private readonly _strips = signal(0);
  private readonly _why = signal<ReadonlyMap<number, PageWhyEntry>>(new Map());
  private nextId = 0;

  /** True while at least one help strip ("?") is on screen. */
  readonly hasStrip = computed(() => this._strips() > 0);

  /** The why-notes of the current page, without duplicates. */
  readonly whyEntries = computed(() => {
    const seen = new Set<string>();
    const out: PageWhyEntry[] = [];
    for (const entry of this._why().values()) {
      const key = `${entry.scope}.${entry.page}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(entry);
      }
    }
    return out;
  });

  /** Register a help strip; call the returned function when it is destroyed. */
  addStrip(): () => void {
    this._strips.update((n) => n + 1);
    let done = false;
    return () => {
      if (!done) {
        done = true;
        this._strips.update((n) => Math.max(0, n - 1));
      }
    };
  }

  /** Register (or replace, with the returned id) a why-note. */
  setWhy(id: number | null, entry: PageWhyEntry): number {
    const key = id ?? ++this.nextId;
    this._why.update((map) => new Map(map).set(key, entry));
    return key;
  }

  removeWhy(id: number | null): void {
    if (id === null) {
      return;
    }
    this._why.update((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }
}

/**
 * The first sentence of a markdown intro, as plain text: what a beginner sees next to
 * the "?" instead of the whole intro. Markdown emphasis and links are unwrapped.
 */
export function firstSentence(markdown: string | null | undefined): string {
  const text = (markdown ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // A sentence ends at . ! or ? followed by a space and an upper-case letter
  // (so "f.eks. noe" and "kap. 4" do not end it), or at the end of the text.
  const match = /^(.+?[.!?])(?=\s+[\p{Lu}«"(])/u.exec(text);
  return match ? match[1] : text;
}

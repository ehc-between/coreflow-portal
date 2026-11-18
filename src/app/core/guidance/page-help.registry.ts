import { Injectable, computed, signal } from '@angular/core';

/** A "Hvorfor dette er viktig" note a page asked for (`<app-why-it-matters>`). */
export interface PageWhyEntry {
  readonly scope: string;
  readonly page: string;
  readonly frameworks: readonly string[] | null;
}

/** Lessons a page offered outside its help strip (e.g. a "Lær mer" card). */
export interface PageLessonEntry {
  readonly scope: string;
  readonly lessons: readonly string[];
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
  private readonly _lessons = signal<ReadonlyMap<number, PageLessonEntry>>(new Map());
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

  /** Extra lessons of the current page as `{ scope, key }`, without duplicates. */
  readonly lessonEntries = computed(() => {
    const seen = new Set<string>();
    const out: { scope: string; key: string }[] = [];
    for (const entry of this._lessons().values()) {
      for (const key of entry.lessons) {
        const id = `${entry.scope}.${key}`;
        if (!seen.has(id)) {
          seen.add(id);
          out.push({ scope: entry.scope, key });
        }
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

  /** Register (or replace, with the returned id) extra lessons a page offers. */
  setLessons(id: number | null, entry: PageLessonEntry): number {
    const key = id ?? ++this.nextId;
    this._lessons.update((map) => new Map(map).set(key, entry));
    return key;
  }

  removeLessons(id: number | null): void {
    if (id === null) {
      return;
    }
    this._lessons.update((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
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

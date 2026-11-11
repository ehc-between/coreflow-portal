import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { LanguageService } from '../i18n/language.service';
import { GlossaryEntry, GuidanceFile, GuidancePage, Lesson, TourStep } from './guidance.models';

/** The shared glossary file (`src/assets/guidance/<lang>/glossary.json`). */
export const GLOSSARY_SCOPE = 'glossary';

type FileState = GuidanceFile | null;

/**
 * Loads learning-mode content from `/assets/guidance/<lang>/<scope>.json`, once per
 * language and scope, and exposes it as signals that follow the active language.
 *
 * The `read*` methods are reactive reads (call them inside `computed()` or a
 * template); the signal-returning methods (`page`, `lesson`, `tour`, `glossaryTerm`)
 * wrap them for callers that want a standalone signal. A missing or broken file
 * resolves to no content, so guidance components simply render nothing.
 */
@Injectable({ providedIn: 'root' })
export class GuidanceContentService {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);

  /** Loaded files keyed by `<lang>/<scope>` (null = failed or missing). */
  private readonly files = signal<ReadonlyMap<string, FileState>>(new Map());
  /** Keys already requested, so a file is fetched at most once per language. */
  private readonly requested = new Set<string>();
  /** `whenLoaded` callers waiting for a file. */
  private readonly waiting = new Map<string, ((file: FileState) => void)[]>();

  /** Reactive read of a whole guidance file for the active language. */
  readFile(scope: string): GuidanceFile | null {
    const key = `${this.language.active()}/${scope}`;
    const state = this.files().get(key);
    if (state === undefined) {
      this.ensure(key);
      return null;
    }
    return state;
  }

  /** Whether the file for the active language has finished loading (success or not). */
  readLoaded(scope: string): boolean {
    return this.files().has(`${this.language.active()}/${scope}`);
  }

  readPage(scope: string, page: string): GuidancePage | null {
    return this.readFile(scope)?.pages?.[page] ?? null;
  }

  readLesson(scope: string, key: string): Lesson | null {
    return this.readFile(scope)?.lessons?.[key] ?? null;
  }

  readTour(scope: string, key: string): readonly TourStep[] {
    return this.readFile(scope)?.tours?.[key] ?? [];
  }

  /** A glossary term: the scope's own glossary first, then the shared glossary. */
  readTerm(key: string, scope?: string | null): GlossaryEntry | null {
    const own = scope ? this.readFile(scope)?.glossary?.[key] : undefined;
    return own ?? this.readFile(GLOSSARY_SCOPE)?.glossary?.[key] ?? null;
  }

  page(scope: string, page: string): Signal<GuidancePage | null> {
    return computed(() => this.readPage(scope, page));
  }

  lesson(scope: string, key: string): Signal<Lesson | null> {
    return computed(() => this.readLesson(scope, key));
  }

  tour(scope: string, key: string): Signal<readonly TourStep[]> {
    return computed(() => this.readTour(scope, key));
  }

  glossaryTerm(key: string, scope?: string | null): Signal<GlossaryEntry | null> {
    return computed(() => this.readTerm(key, scope));
  }

  /** Resolve once the file for the active language is loaded (used by the tour runner). */
  whenLoaded(scope: string): Promise<GuidanceFile | null> {
    const key = `${this.language.active()}/${scope}`;
    const now = this.files().get(key);
    if (now !== undefined) {
      return Promise.resolve(now);
    }
    return new Promise((resolve) => {
      this.waiting.set(key, [...(this.waiting.get(key) ?? []), resolve]);
      if (!this.requested.has(key)) {
        this.requested.add(key);
        this.fetch(key);
      }
    });
  }

  private ensure(key: string): void {
    if (this.requested.has(key)) {
      return;
    }
    // Reads run inside computed()/templates, where signal writes are not allowed:
    // start the request after the current reactive evaluation.
    this.requested.add(key);
    queueMicrotask(() => this.fetch(key));
  }

  private fetch(key: string): void {
    const context = new HttpContext().set(SKIP_ERROR_TOAST, true);
    this.http.get<GuidanceFile>(`/assets/guidance/${key}.json`, { context }).subscribe({
      next: (file) => this.store(key, file ?? null),
      error: () => this.store(key, null),
    });
  }

  private store(key: string, file: FileState): void {
    this.files.update((map) => new Map(map).set(key, file));
    const waiting = this.waiting.get(key) ?? [];
    this.waiting.delete(key);
    waiting.forEach((resolve) => resolve(file));
  }
}

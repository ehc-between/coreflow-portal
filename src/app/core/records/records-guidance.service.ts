import { HttpClient } from '@angular/common/http';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { LanguageService } from '../i18n/language.service';

/** Learning content of one page (platform contracts 9.2). */
export interface GuidancePage {
  readonly intro?: {
    readonly title: string;
    readonly body: string;
    readonly steps?: readonly string[];
  };
  readonly why?: { readonly body: string; readonly clauses?: readonly string[] };
  readonly empty?: { readonly title: string; readonly body: string; readonly cta?: string };
  readonly fields?: Readonly<Record<string, { readonly help: string; readonly example?: string }>>;
}

export interface GuidanceLesson {
  readonly title: string;
  readonly minutes: number;
  readonly sections: readonly { readonly heading: string; readonly body: string }[];
  readonly quiz?: readonly {
    readonly question: string;
    readonly options: readonly string[];
    readonly answer: number;
    readonly explanation?: string;
  }[];
  readonly pass_mark?: number;
}

export interface GuidanceFile {
  readonly pages?: Readonly<Record<string, GuidancePage>>;
  readonly lessons?: Readonly<Record<string, GuidanceLesson>>;
}

/**
 * Loads the record designer's learning content
 * (`/assets/guidance/<lang>/records.json`, the F6 content format) once per
 * language. Interim: once the platform `GuidanceContentService` (F6) is on
 * main, the records pages switch to it and this service goes away. Assets are
 * static files, not API calls, so they are fetched like the translation files.
 */
@Injectable({ providedIn: 'root' })
export class RecordsGuidanceService {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);
  private readonly files = signal<Readonly<Record<string, GuidanceFile>>>({});
  private readonly requested = new Set<string>();

  /** The content for the active language (null until loaded). */
  readonly content: Signal<GuidanceFile | null> = computed(() => {
    const lang = this.language.active();
    this.ensure(lang);
    return this.files()[lang] ?? null;
  });

  page(page: string): Signal<GuidancePage | null> {
    return computed(() => this.content()?.pages?.[page] ?? null);
  }

  lesson(key: string): Signal<GuidanceLesson | null> {
    return computed(() => this.content()?.lessons?.[key] ?? null);
  }

  private ensure(lang: string): void {
    if (this.requested.has(lang)) {
      return;
    }
    this.requested.add(lang);
    // Deferred so a computed never writes a signal while it evaluates.
    queueMicrotask(() =>
      this.http.get<GuidanceFile>(`/assets/guidance/${lang}/records.json`).subscribe({
        next: (file) => this.files.update((all) => ({ ...all, [lang]: file })),
        error: () => this.requested.delete(lang),
      }),
    );
  }
}

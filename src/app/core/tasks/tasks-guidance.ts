import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { LanguageService } from '../i18n/language.service';

/**
 * Learning-mode content of the `tasks` scope, in the platform guidance format
 * (contracts 9.2): `src/assets/guidance/<lang>/tasks.json`.
 *
 * Interim loader until the shared guidance framework (F6) is on main; the
 * integrator then swaps the task guide components for `<app-guide-intro>`,
 * `<app-why-it-matters>`, `<app-field-help>`, `<app-lesson>` and
 * `<app-teaching-empty>` with `scope="tasks"`, which read the same files.
 */

export interface GuidanceIntro {
  readonly title: string;
  readonly body: string;
  readonly steps?: readonly string[];
}

export interface GuidanceWhy {
  readonly body: string;
  readonly clauses: readonly string[];
}

export interface GuidanceEmpty {
  readonly title: string;
  readonly body: string;
  readonly cta?: string;
}

export interface GuidanceField {
  readonly help: string;
  readonly example?: string;
}

export interface GuidancePage {
  readonly intro?: GuidanceIntro;
  readonly why?: GuidanceWhy;
  readonly empty?: GuidanceEmpty;
  readonly fields?: Readonly<Record<string, GuidanceField>>;
}

export interface LessonQuizQuestion {
  readonly question: string;
  readonly options: readonly string[];
  readonly answer: number;
  readonly explanation?: string;
}

export interface Lesson {
  readonly title: string;
  readonly minutes: number;
  readonly sections: readonly { readonly heading: string; readonly body: string }[];
  readonly quiz?: readonly LessonQuizQuestion[];
  readonly pass_mark?: number;
}

export interface TourStep {
  readonly target: string;
  readonly title: string;
  readonly body: string;
}

export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
  readonly clauses?: readonly string[];
}

export interface GuidanceFile {
  readonly pages: Readonly<Record<string, GuidancePage>>;
  readonly lessons?: Readonly<Record<string, Lesson>>;
  readonly tours?: Readonly<Record<string, readonly TourStep[]>>;
  readonly glossary?: Readonly<Record<string, GlossaryEntry>>;
}

const SCOPE = 'tasks';

@Injectable({ providedIn: 'root' })
export class TasksGuidance {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);

  private readonly files = signal<Readonly<Record<string, GuidanceFile>>>({});
  private readonly requested = new Set<string>();

  /** The file for the active language (loaded on first read), or null while loading / on error. */
  readonly file: Signal<GuidanceFile | null> = computed(() => {
    const lang = this.language.active();
    const file = this.files()[lang];
    if (!file) {
      this.load(lang);
    }
    return file ?? null;
  });

  page(page: string): Signal<GuidancePage | null> {
    return computed(() => this.file()?.pages[page] ?? null);
  }

  lesson(key: string): Signal<Lesson | null> {
    return computed(() => this.file()?.lessons?.[key] ?? null);
  }

  tour(key: string): Signal<readonly TourStep[]> {
    return computed(() => this.file()?.tours?.[key] ?? []);
  }

  private load(lang: string): void {
    if (this.requested.has(lang)) {
      return;
    }
    this.requested.add(lang);
    // Deferred: `file` may be read inside a template / computed, where signal writes are not allowed.
    queueMicrotask(() =>
      this.http
        .get<GuidanceFile>(`/assets/guidance/${lang}/${SCOPE}.json`, {
          context: new HttpContext().set(SKIP_ERROR_TOAST, true),
        })
        .subscribe({
          next: (file) => this.files.update((files) => ({ ...files, [lang]: file })),
          // Guidance is optional chrome: a failed load leaves the pages without it.
          error: () => undefined,
        }),
    );
  }
}

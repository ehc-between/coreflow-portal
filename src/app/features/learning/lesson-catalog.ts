import {
  GuidanceFile,
  LearningProgressItem,
  progressLessonKey,
} from '../../core/guidance/guidance.models';

/**
 * Guidance scopes whose lessons the learning centre lists. Module work items add their
 * scope (the portal path, e.g. `risk`) here when they ship lessons; scopes without a
 * guidance file are skipped.
 */
export const LESSON_SCOPES: readonly string[] = ['platform', 'processes'];

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';

export const LESSON_STATUSES: readonly LessonStatus[] = ['not_started', 'in_progress', 'completed'];

export interface CatalogLesson {
  readonly scope: string;
  readonly key: string;
  /** Progress key, `"<scope>.<key>"`. */
  readonly lessonKey: string;
  readonly title: string;
  readonly minutes: number | null;
  readonly hasQuiz: boolean;
  readonly status: LessonStatus;
  readonly progress: LearningProgressItem | null;
}

export function lessonStatus(progress: LearningProgressItem | null | undefined): LessonStatus {
  if (progress?.completed_at) {
    return 'completed';
  }
  if (progress && (progress.seen_at || progress.attempts > 0)) {
    return 'in_progress';
  }
  return 'not_started';
}

/** Flatten the lessons of the loaded guidance files, joined with the user's progress. */
export function buildCatalog(
  files: readonly { readonly scope: string; readonly file: GuidanceFile | null }[],
  progress: ReadonlyMap<string, LearningProgressItem>,
): CatalogLesson[] {
  const lessons: CatalogLesson[] = [];
  for (const { scope, file } of files) {
    for (const [key, lesson] of Object.entries(file?.lessons ?? {})) {
      const lessonKey = progressLessonKey(scope, key);
      const row = progress.get(lessonKey) ?? null;
      lessons.push({
        scope,
        key,
        lessonKey,
        title: lesson.title,
        minutes: lesson.minutes ?? null,
        hasQuiz: (lesson.quiz ?? []).length > 0,
        status: lessonStatus(row),
        progress: row,
      });
    }
  }
  return lessons;
}

/** Case- and accent-insensitive "contains" match. */
export function matchesQuery(text: string, query: string): boolean {
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const q = fold(query.trim());
  return !q || fold(text).includes(q);
}

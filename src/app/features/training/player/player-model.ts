import { Lesson } from '../../../core/guidance/guidance.models';
import { AttemptIn, PlayerItem, PlayerLesson } from '../data/training.models';

/** Answers per lesson id: the chosen option index per quiz question (null = unanswered). */
export type Answers = Readonly<Record<string, readonly (number | null)[]>>;

/**
 * The F6 `Lesson` the shared player shows for a course lesson. The quiz is left
 * out: course quizzes are answered once in the final assessment and scored on
 * the server, so the learner is not asked the same questions twice.
 */
export function readingLesson(lesson: PlayerLesson): Lesson {
  const sections = lesson.sections.length ? lesson.sections : [{ heading: lesson.title, body: '' }];
  return {
    title: lesson.title,
    minutes: lesson.minutes ?? undefined,
    sections,
    quiz: [],
    pass_mark: lesson.pass_mark,
  };
}

/** Empty answer sheets for every lesson with a quiz. */
export function emptyAnswers(items: readonly PlayerItem[]): Answers {
  const answers: Record<string, (number | null)[]> = {};
  for (const item of items) {
    if (item.lesson.quiz.length) {
      answers[item.id] = item.lesson.quiz.map(() => null);
    }
  }
  return answers;
}

export function setAnswer(
  answers: Answers,
  lessonId: string,
  question: number,
  option: number,
): Answers {
  const current = answers[lessonId] ?? [];
  return {
    ...answers,
    [lessonId]: current.map((a, i) => (i === question ? option : a)),
  };
}

export function questionCount(items: readonly PlayerItem[]): number {
  return items.reduce((sum, item) => sum + item.lesson.quiz.length, 0);
}

export function allAnswered(items: readonly PlayerItem[], answers: Answers): boolean {
  return items.every((item) =>
    item.lesson.quiz.every((_, i) => (answers[item.id]?.[i] ?? null) !== null),
  );
}

/** The attempt body sent to `POST /courses/{id}/attempts`. */
export function attemptBody(
  answers: Answers,
  opts: {
    readonly acknowledged: boolean;
    readonly rating: number | null;
    readonly comment: string;
  },
): AttemptIn {
  return {
    answers,
    acknowledged: opts.acknowledged,
    feedback_rating: opts.rating,
    feedback_comment: opts.comment.trim() || null,
  };
}

/** Lesson completion state for the outline (from F6 learning progress). */
export function lessonState(item: PlayerItem): 'done' | 'seen' | 'new' {
  if (item.progress?.completed_at || item.progress?.quiz_passed) {
    return 'done';
  }
  return item.progress?.seen_at ? 'seen' : 'new';
}

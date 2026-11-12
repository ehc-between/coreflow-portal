import {
  COURSE_CATEGORIES,
  CourseCategory,
  CourseCreate,
  CourseDetail,
  CourseKind,
  CourseSource,
  CourseUpdate,
  GeneratedCourse,
  LessonIn,
  QuizQuestionDto,
} from './training.models';

/*
 * The course builder's editable model (plain mutable objects bound with ngModel)
 * and the pure conversions to and from the API shapes. Kept free of Angular so
 * the rules are unit-tested directly.
 */

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;

export interface QuestionForm {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface LessonForm {
  /** Local identity for `@for` tracking. */
  readonly key: string;
  /** Server id of an existing lesson (kept on save). */
  id: string | null;
  title: string;
  body: string;
  videoUrl: string;
  documentId: string;
  minutes: number | null;
  quiz: QuestionForm[];
}

export interface CourseForm {
  title: string;
  description: string;
  category: CourseCategory;
  kind: CourseKind;
  ownerUserId: string;
  /** Pass mark as a percentage (0-100). */
  passMarkPct: number;
  validityMonths: number | null;
  estimatedMinutes: number | null;
  documentId: string;
  source: CourseSource;
  lessons: LessonForm[];
}

let nextKey = 0;
const newKey = () => `lesson-${++nextKey}`;

export function emptyQuestion(): QuestionForm {
  return { question: '', options: ['', ''], answer: 0, explanation: '' };
}

export function emptyLesson(): LessonForm {
  return {
    key: newKey(),
    id: null,
    title: '',
    body: '',
    videoUrl: '',
    documentId: '',
    minutes: null,
    quiz: [],
  };
}

export function emptyCourseForm(): CourseForm {
  return {
    title: '',
    description: '',
    category: 'general',
    kind: 'course',
    ownerUserId: '',
    passMarkPct: 80,
    validityMonths: null,
    estimatedMinutes: null,
    documentId: '',
    source: 'manual',
    lessons: [emptyLesson()],
  };
}

function questionForm(q: QuizQuestionDto): QuestionForm {
  return {
    question: q.question,
    options: [...q.options],
    answer: q.answer,
    explanation: q.explanation ?? '',
  };
}

export function courseFormFrom(course: CourseDetail): CourseForm {
  return {
    title: course.title,
    description: course.description ?? '',
    category: course.category,
    kind: course.kind,
    ownerUserId: course.owner?.id ?? '',
    passMarkPct: Math.round(course.pass_mark * 100),
    validityMonths: course.validity_months,
    estimatedMinutes: course.estimated_minutes,
    documentId: course.document_id ?? '',
    source: course.source,
    lessons: [...course.lessons]
      .sort((a, b) => a.position - b.position)
      .map((lesson) => ({
        key: newKey(),
        id: lesson.id,
        title: lesson.title,
        body: lesson.body,
        videoUrl: lesson.video_url ?? '',
        documentId: lesson.document_id ?? '',
        minutes: lesson.minutes,
        quiz: lesson.quiz.map(questionForm),
      })),
  };
}

const blankToNull = (value: string): string | null => (value.trim() ? value.trim() : null);
const numberOrNull = (value: number | null | undefined): number | null =>
  value === null || value === undefined || Number.isNaN(Number(value)) || `${value}` === ''
    ? null
    : Number(value);

export function lessonsPayload(form: CourseForm): LessonIn[] {
  return form.lessons.map((lesson) => ({
    ...(lesson.id ? { id: lesson.id } : {}),
    title: lesson.title.trim(),
    body: lesson.body,
    video_url: blankToNull(lesson.videoUrl),
    document_id: blankToNull(lesson.documentId),
    minutes: numberOrNull(lesson.minutes),
    quiz: lesson.quiz.map((q) => ({
      question: q.question.trim(),
      options: q.options.map((o) => o.trim()),
      answer: q.answer,
      explanation: blankToNull(q.explanation),
    })),
  }));
}

function fieldsPayload(form: CourseForm) {
  return {
    title: form.title.trim(),
    description: blankToNull(form.description),
    category: form.category,
    kind: form.kind,
    owner_user_id: blankToNull(form.ownerUserId),
    pass_mark: Math.min(100, Math.max(0, Number(form.passMarkPct) || 0)) / 100,
    validity_months: numberOrNull(form.validityMonths),
    estimated_minutes: numberOrNull(form.estimatedMinutes),
    document_id: blankToNull(form.documentId),
  };
}

export function createPayload(form: CourseForm): CourseCreate {
  return { ...fieldsPayload(form), source: form.source, lessons: lessonsPayload(form) };
}

export function updatePayload(form: CourseForm, changeReason: string): CourseUpdate {
  return { ...fieldsPayload(form), change_reason: blankToNull(changeReason) };
}

/** Problems that block saving, as i18n keys (scope `training`) with params. */
export interface FormIssue {
  readonly key: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export function validateCourseForm(form: CourseForm): FormIssue[] {
  const issues: FormIssue[] = [];
  if (!form.title.trim()) {
    issues.push({ key: 'training.form.issues.title' });
  }
  if (form.kind === 'read_and_understood' && !form.documentId) {
    issues.push({ key: 'training.form.issues.document' });
  }
  const pass = Number(form.passMarkPct);
  if (!Number.isFinite(pass) || pass < 0 || pass > 100) {
    issues.push({ key: 'training.form.issues.passMark' });
  }
  const validity = numberOrNull(form.validityMonths);
  if (validity !== null && (validity < 1 || validity > 120)) {
    issues.push({ key: 'training.form.issues.validity' });
  }
  form.lessons.forEach((lesson, i) => {
    const n = i + 1;
    if (!lesson.title.trim()) {
      issues.push({ key: 'training.form.issues.lessonTitle', params: { n } });
    }
    const url = lesson.videoUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      issues.push({ key: 'training.form.issues.videoUrl', params: { n } });
    }
    lesson.quiz.forEach((q, qi) => {
      const params = { n, q: qi + 1 };
      if (!q.question.trim()) {
        issues.push({ key: 'training.form.issues.question', params });
      }
      if (q.options.length < MIN_OPTIONS || q.options.some((o) => !o.trim())) {
        issues.push({ key: 'training.form.issues.options', params });
      }
      if (q.answer < 0 || q.answer >= q.options.length) {
        issues.push({ key: 'training.form.issues.answer', params });
      }
    });
  });
  return issues;
}

/** Move an item within a list (returns a new array; out-of-range moves are no-ops). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Remove option `index` from a question, keeping the correct answer pointing at the same option. */
export function removeOption(question: QuestionForm, index: number): void {
  if (question.options.length <= MIN_OPTIONS) {
    return;
  }
  question.options.splice(index, 1);
  if (question.answer === index) {
    question.answer = 0;
  } else if (question.answer > index) {
    question.answer -= 1;
  }
}

/** Fill the form from an AI-generated course draft (marks the source as `ai`). */
export function applyGeneratedCourse(form: CourseForm, draft: GeneratedCourse): void {
  form.title = draft.title || form.title;
  form.description = draft.description || form.description;
  if ((COURSE_CATEGORIES as readonly string[]).includes(draft.category)) {
    form.category = draft.category as CourseCategory;
  }
  form.estimatedMinutes = draft.estimated_minutes ?? form.estimatedMinutes;
  form.source = 'ai';
  form.lessons = draft.lessons.map((lesson) => ({
    ...emptyLesson(),
    title: lesson.title,
    body: lesson.body,
    minutes: lesson.minutes ?? null,
    quiz: (lesson.quiz ?? []).map(questionForm),
  }));
}

/** Append AI-generated questions to a lesson. */
export function appendQuiz(lesson: LessonForm, quiz: readonly QuizQuestionDto[]): void {
  lesson.quiz = [...lesson.quiz, ...quiz.map(questionForm)];
}

/** Is `value` a generated course draft (shape check on the assist result)? */
export function isGeneratedCourse(value: unknown): value is GeneratedCourse {
  const v = value as GeneratedCourse | null;
  return !!v && typeof v.title === 'string' && Array.isArray(v.lessons);
}

export function isGeneratedQuiz(value: unknown): value is { quiz: QuizQuestionDto[] } {
  const v = value as { quiz?: unknown } | null;
  return !!v && Array.isArray(v.quiz);
}

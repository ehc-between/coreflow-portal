import {
  AnswerValue,
  Question,
  QuestionIn,
  QuestionType,
  Survey,
  SurveyCreate,
  SurveyUpdate,
} from './feedback.models';

export const MAX_QUESTIONS = 50;
export const MAX_OPTIONS = 20;
export const MIN_OPTIONS = 2;
export const DEFAULT_SCALE = 5;
export const MAX_TEXT_ANSWER = 5000;
export const CHOICE_TYPES: readonly QuestionType[] = ['single_choice', 'multi_choice'];

export const isChoice = (type: QuestionType) => CHOICE_TYPES.includes(type);

/** A question being edited. `key` is a stable client id for `@for` tracking. */
export interface QuestionDraft {
  readonly key: string;
  readonly id: string | null;
  readonly type: QuestionType;
  readonly label: string;
  readonly help: string;
  readonly required: boolean;
  readonly options: readonly string[];
  readonly scale: number;
}

export interface SurveyFormValue {
  readonly title: string;
  readonly description: string;
  readonly anonymous: boolean;
  readonly thank_you_message: string;
  readonly opens_on: string;
  readonly closes_on: string;
  /** '' or '0'..'100'. */
  readonly low_score_threshold: string;
  readonly owner_user_id: string;
  readonly questions: readonly QuestionDraft[];
}

let nextKey = 0;
const newKey = () => `qd-${++nextKey}`;

export function emptyQuestion(type: QuestionType = 'rating'): QuestionDraft {
  return {
    key: newKey(),
    id: null,
    type,
    label: '',
    help: '',
    required: false,
    options: isChoice(type) ? ['', ''] : [],
    scale: DEFAULT_SCALE,
  };
}

export function draftFromQuestion(q: Question): QuestionDraft {
  return {
    key: newKey(),
    id: q.id,
    type: q.type,
    label: q.label,
    help: q.help ?? '',
    required: !!q.required,
    options: [...(q.options ?? [])],
    scale: q.scale ?? DEFAULT_SCALE,
  };
}

/** Change a question's type, keeping what still applies. */
export function withType(q: QuestionDraft, type: QuestionType): QuestionDraft {
  const options = isChoice(type) ? (q.options.length >= MIN_OPTIONS ? q.options : ['', '']) : [];
  return { ...q, type, options };
}

/** A starter survey: overall satisfaction, recommendation and a comment. */
export function starterQuestions(labels: {
  readonly rating: string;
  readonly nps: string;
  readonly text: string;
}): QuestionDraft[] {
  return [
    { ...emptyQuestion('rating'), label: labels.rating, required: true },
    { ...emptyQuestion('nps'), label: labels.nps },
    { ...emptyQuestion('text'), label: labels.text },
  ];
}

export function emptySurveyForm(): SurveyFormValue {
  return {
    title: '',
    description: '',
    anonymous: true,
    thank_you_message: '',
    opens_on: '',
    closes_on: '',
    low_score_threshold: '',
    owner_user_id: '',
    questions: [],
  };
}

export function formFromSurvey(s: Survey): SurveyFormValue {
  return {
    title: s.title,
    description: s.description ?? '',
    anonymous: s.anonymous,
    thank_you_message: s.thank_you_message ?? '',
    opens_on: s.opens_on ?? '',
    closes_on: s.closes_on ?? '',
    low_score_threshold: s.low_score_threshold === null ? '' : String(s.low_score_threshold),
    owner_user_id: s.owner?.id ?? '',
    questions: s.questions.map(draftFromQuestion),
  };
}

export interface QuestionProblem {
  /** 1-based position. */
  readonly position: number;
  /** i18n key (scope `feedback`). */
  readonly key: string;
}

/** Problems with the question list, mirroring the server's `invalid_questions` rules. */
export function validateQuestions(questions: readonly QuestionDraft[]): QuestionProblem[] {
  const problems: QuestionProblem[] = [];
  if (questions.length > MAX_QUESTIONS) {
    problems.push({ position: 0, key: 'feedback.surveyForm.errors.tooManyQuestions' });
  }
  questions.forEach((q, i) => {
    const position = i + 1;
    if (!q.label.trim()) {
      problems.push({ position, key: 'feedback.surveyForm.errors.labelRequired' });
    }
    if (isChoice(q.type)) {
      const distinct = new Set(q.options.map((o) => o.trim()).filter(Boolean));
      if (distinct.size < MIN_OPTIONS || distinct.size > MAX_OPTIONS) {
        problems.push({ position, key: 'feedback.surveyForm.errors.options' });
      }
    }
    if (q.type === 'rating' && (q.scale < 3 || q.scale > 10)) {
      problems.push({ position, key: 'feedback.surveyForm.errors.scale' });
    }
  });
  return problems;
}

/** Field -> i18n error key for the survey's own fields. */
export function validateSurveyForm(v: SurveyFormValue): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) {
    errors['title'] = 'feedback.surveyForm.errors.titleRequired';
  }
  if (v.opens_on && v.closes_on && v.closes_on < v.opens_on) {
    errors['closes_on'] = 'feedback.surveyForm.errors.closesBeforeOpens';
  }
  if (v.low_score_threshold !== '') {
    const n = Number(v.low_score_threshold);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      errors['low_score_threshold'] = 'feedback.surveyForm.errors.threshold';
    }
  }
  return errors;
}

export function toQuestionIn(q: QuestionDraft): QuestionIn {
  const options = isChoice(q.type)
    ? [...new Set(q.options.map((o) => o.trim()).filter(Boolean))]
    : [];
  return {
    ...(q.id ? { id: q.id } : {}),
    type: q.type,
    label: q.label.trim(),
    help: q.help.trim() || null,
    required: q.required,
    options,
    scale: q.type === 'rating' ? q.scale : null,
  };
}

const text = (value: string): string | null => value.trim() || null;

export function toSurveyCreate(v: SurveyFormValue, includeQuestions = true): SurveyCreate {
  return {
    title: v.title.trim(),
    description: text(v.description),
    anonymous: v.anonymous,
    thank_you_message: text(v.thank_you_message),
    opens_on: v.opens_on || null,
    closes_on: v.closes_on || null,
    low_score_threshold: v.low_score_threshold === '' ? null : Number(v.low_score_threshold),
    owner_user_id: v.owner_user_id || null,
    ...(includeQuestions ? { questions: v.questions.map(toQuestionIn) } : {}),
  };
}

/** Only the changed fields; questions are left out when they are locked. */
export function toSurveyUpdate(
  original: SurveyFormValue,
  next: SurveyFormValue,
  changeReason: string,
  questionsLocked: boolean,
): SurveyUpdate {
  const a = toSurveyCreate(original, !questionsLocked);
  const b = toSurveyCreate(next, !questionsLocked);
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(b) as (keyof SurveyCreate)[]) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      body[key] = b[key];
    }
  }
  if (body['owner_user_id'] === null) {
    delete body['owner_user_id'];
  }
  if (changeReason.trim()) {
    body['change_reason'] = changeReason.trim();
  }
  return body as SurveyUpdate;
}

// --- answering (public page and preview) ---------------------------------------------

export type AnswerMap = Readonly<Record<string, AnswerValue | null>>;

/** Whether an answer counts as given. */
export function isAnswered(value: AnswerValue | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

/** Ids of required questions without an answer. */
export function missingRequired(questions: readonly Question[], answers: AnswerMap): string[] {
  return questions.filter((q) => q.required && !isAnswered(answers[q.id])).map((q) => q.id);
}

/** The answers to send: unanswered questions dropped, text trimmed and capped. */
export function cleanAnswers(
  questions: readonly Question[],
  answers: AnswerMap,
): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const q of questions) {
    const value = answers[q.id];
    if (!isAnswered(value)) {
      continue;
    }
    out[q.id] =
      typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_ANSWER) : (value as AnswerValue);
  }
  return out;
}

/** The scale values of a rating (1..scale) or NPS (0..10) question. */
export function scaleValues(q: Pick<Question, 'type' | 'scale'>): number[] {
  if (q.type === 'nps') {
    return Array.from({ length: 11 }, (_, i) => i);
  }
  const scale = q.scale ?? DEFAULT_SCALE;
  return Array.from({ length: scale }, (_, i) => i + 1);
}

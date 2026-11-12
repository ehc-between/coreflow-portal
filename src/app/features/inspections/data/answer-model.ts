import {
  AnswerInput,
  AnswerValue,
  InspectionResponse,
  NA_TYPES,
  QUESTION_TYPES,
  Question,
  QuestionInput,
  QuestionType,
  SEVERITIES,
  Severity,
  Signature,
} from './inspection.models';

/**
 * Pure checklist logic shared by the template builder and the inspection runner.
 * Scoring mirrors coreflow-core `app/modules/inspections/questions.py` so the runner
 * can show live pass/fail feedback; the server's numbers stay authoritative once saved.
 */

/** The runner's local, editable state of one answer. */
export interface AnswerDraft {
  readonly value: AnswerValue;
  readonly is_na: boolean;
  readonly note: string;
  readonly attachment_ids: readonly string[];
}

export const EMPTY_DRAFT: AnswerDraft = { value: null, is_na: false, note: '', attachment_ids: [] };

export interface Evaluation {
  readonly answered: boolean;
  readonly failed: boolean;
  readonly earned: number | null;
  readonly possible: number | null;
}

export function draftFromResponse(response: InspectionResponse | undefined): AnswerDraft {
  if (!response) {
    return EMPTY_DRAFT;
  }
  return {
    value: response.value ?? null,
    is_na: response.is_na,
    note: response.note ?? '',
    attachment_ids: response.attachment_ids ?? [],
  };
}

export function canBeNa(question: Question): boolean {
  return question.allow_na && NA_TYPES.includes(question.type);
}

/** Whether a draft value is a usable answer for the question (null = unanswered). */
export function cleanValue(question: Question, value: AnswerValue): AnswerValue {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  switch (question.type) {
    case 'yes_no':
      return value === 'yes' || value === 'no' ? value : null;
    case 'score': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isInteger(n) && n >= question.scale_min && n <= question.scale_max ? n : null;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'text':
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    case 'signature': {
      const sig = value as Signature;
      return typeof sig === 'object' && sig?.name?.trim()
        ? { name: sig.name.trim(), ...(sig.image ? { image: sig.image } : {}) }
        : null;
    }
    default:
      return null;
  }
}

/** Answered / failed / score contribution of a draft (mirrors the server's `evaluate`). */
export function evaluate(question: Question, draft: AnswerDraft): Evaluation {
  const weight = question.weight ?? 1;
  if (draft.is_na && canBeNa(question)) {
    return { answered: true, failed: false, earned: null, possible: null };
  }
  if (question.type === 'photo') {
    return {
      answered: draft.attachment_ids.length > 0,
      failed: false,
      earned: null,
      possible: null,
    };
  }
  const value = cleanValue(question, draft.value);
  if (value === null) {
    return { answered: false, failed: false, earned: null, possible: null };
  }
  if (question.type === 'yes_no') {
    const failed = value === (question.fail_answer ?? 'no');
    return { answered: true, failed, earned: failed ? 0 : weight, possible: weight };
  }
  if (question.type === 'score') {
    const n = value as number;
    const failed = question.pass_score !== null && n < question.pass_score;
    const span = question.scale_max - question.scale_min;
    const earned = span > 0 ? ((n - question.scale_min) / span) * weight : 0;
    return { answered: true, failed, earned, possible: weight };
  }
  if (question.type === 'number') {
    const n = value as number;
    if (question.min === null && question.max === null) {
      return { answered: true, failed: false, earned: null, possible: null };
    }
    const failed =
      (question.min !== null && n < question.min) || (question.max !== null && n > question.max);
    return { answered: true, failed, earned: failed ? 0 : weight, possible: weight };
  }
  return { answered: true, failed: false, earned: null, possible: null };
}

export interface Progress {
  readonly total: number;
  readonly answered: number;
  readonly required: number;
  readonly requiredAnswered: number;
  readonly missingRequired: readonly string[];
  readonly failed: number;
  /** 0-100, or null when nothing scored was answered. */
  readonly scorePct: number | null;
}

export function progressOf(
  questions: readonly Question[],
  drafts: Readonly<Record<string, AnswerDraft>>,
): Progress {
  let answered = 0;
  let required = 0;
  let requiredAnswered = 0;
  let failed = 0;
  let earned = 0;
  let possible = 0;
  const missing: string[] = [];
  for (const q of questions) {
    const e = evaluate(q, drafts[q.id] ?? EMPTY_DRAFT);
    if (e.answered) {
      answered++;
    }
    if (q.required) {
      required++;
      if (e.answered) {
        requiredAnswered++;
      } else {
        missing.push(q.id);
      }
    }
    if (e.failed) {
      failed++;
    }
    if (e.possible !== null) {
      possible += e.possible;
      earned += e.earned ?? 0;
    }
  }
  return {
    total: questions.length,
    answered,
    required,
    requiredAnswered,
    missingRequired: missing,
    failed,
    scorePct: possible > 0 ? Math.round((1000 * earned) / possible) / 10 : null,
  };
}

/** `passed` | `failed` as the server would decide (pass mark, else any failed answer). */
export function predictedResult(
  scorePct: number | null,
  threshold: number | null,
  failed: number,
): 'passed' | 'failed' {
  if (threshold !== null && scorePct !== null) {
    return scorePct >= threshold ? 'passed' : 'failed';
  }
  return failed > 0 ? 'failed' : 'passed';
}

/** The `PUT /responses` item for a draft (`clear` when nothing is left). */
export function toAnswerInput(question: Question, draft: AnswerDraft): AnswerInput {
  const note = draft.note.trim() || null;
  if (draft.is_na && canBeNa(question)) {
    return { question_id: question.id, is_na: true, value: null, note };
  }
  if (question.type === 'photo') {
    if (draft.attachment_ids.length === 0 && !note) {
      return { question_id: question.id, clear: true };
    }
    return { question_id: question.id, attachment_ids: draft.attachment_ids, note };
  }
  const value = cleanValue(question, draft.value);
  if (value === null && !note) {
    return { question_id: question.id, clear: true };
  }
  return { question_id: question.id, value, is_na: false, note };
}

export interface Section<T> {
  /** Section title, or null for questions without one. */
  readonly title: string | null;
  readonly items: readonly T[];
}

/** Consecutive questions with the same section form one group (order preserved). */
export function groupBySection<T extends { readonly section: string | null }>(
  items: readonly T[],
): readonly Section<T>[] {
  const groups: { title: string | null; items: T[] }[] = [];
  for (const item of items) {
    const title = item.section?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.title === title) {
      last.items.push(item);
    } else {
      groups.push({ title, items: [item] });
    }
  }
  return groups;
}

// --- builder -----------------------------------------------------------------------

/** A builder row: a question plus a stable local key for `@for` tracking. */
export interface EditableQuestion extends Question {
  readonly key: string;
}

let keySeq = 0;
export function nextKey(): string {
  keySeq += 1;
  return `k${keySeq}`;
}

export function newQuestion(
  type: QuestionType = 'yes_no',
  section: string | null = null,
): Question {
  return {
    id: '',
    section,
    text: '',
    help: null,
    type,
    required: true,
    weight: 1,
    allow_na: NA_TYPES.includes(type),
    fail_answer: 'no',
    scale_min: 0,
    scale_max: 5,
    pass_score: null,
    min: null,
    max: null,
    unit: null,
    finding_on_fail: true,
    finding_severity: 'medium',
    clause_refs: [],
  };
}

function num(value: unknown, fallback: number | null): number | null {
  const n = typeof value === 'number' ? value : value === '' || value == null ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Fill defaults into a partial question (from the AI, the library or a stored template). */
export function normaliseQuestion(raw: Partial<Question>): Question {
  const type = (QUESTION_TYPES as readonly string[]).includes(raw.type ?? '')
    ? (raw.type as QuestionType)
    : 'yes_no';
  const base = newQuestion(type, raw.section ?? null);
  const severity = (SEVERITIES as readonly string[]).includes(raw.finding_severity ?? '')
    ? (raw.finding_severity as Severity)
    : base.finding_severity;
  return {
    ...base,
    id: typeof raw.id === 'string' ? raw.id : '',
    text: (raw.text ?? '').toString(),
    help: raw.help ?? null,
    required: raw.required ?? base.required,
    weight: num(raw.weight, 1) ?? 1,
    allow_na: raw.allow_na ?? base.allow_na,
    fail_answer: raw.fail_answer === 'yes' ? 'yes' : 'no',
    scale_min: num(raw.scale_min, 0) ?? 0,
    scale_max: num(raw.scale_max, 5) ?? 5,
    pass_score: num(raw.pass_score, null),
    min: num(raw.min, null),
    max: num(raw.max, null),
    unit: raw.unit ?? null,
    finding_on_fail: raw.finding_on_fail ?? true,
    finding_severity: severity,
    clause_refs: Array.isArray(raw.clause_refs) ? raw.clause_refs.filter((r) => !!r) : [],
  };
}

export function toEditable(questions: readonly Partial<Question>[]): EditableQuestion[] {
  return questions.map((q) => ({ ...normaliseQuestion(q), key: nextKey() }));
}

/** The request shape of a builder row: no local key, no blank id, type-specific fields only. */
export function toQuestionInput(q: Question | EditableQuestion): QuestionInput {
  const scored = q.type === 'yes_no' || q.type === 'score' || q.type === 'number';
  const out: QuestionInput = {
    ...(q.id ? { id: q.id } : {}),
    section: q.section?.trim() || null,
    text: q.text.trim(),
    help: q.help?.trim() || null,
    type: q.type,
    required: q.required,
    weight: q.weight,
    allow_na: NA_TYPES.includes(q.type) ? q.allow_na : false,
    fail_answer: q.fail_answer,
    scale_min: q.scale_min,
    scale_max: q.scale_max,
    pass_score: q.type === 'score' ? q.pass_score : null,
    min: q.type === 'number' ? q.min : null,
    max: q.type === 'number' ? q.max : null,
    unit: q.type === 'number' ? q.unit?.trim() || null : null,
    finding_on_fail: scored ? q.finding_on_fail : false,
    finding_severity: q.finding_severity,
    clause_refs: q.clause_refs,
  };
  return out;
}

/** Client-side problems of a question (i18n key suffixes under `inspections.builder.problems`). */
export function questionProblems(q: Question): readonly string[] {
  const problems: string[] = [];
  if (!q.text.trim()) {
    problems.push('textRequired');
  } else if (q.text.length > 500) {
    problems.push('textTooLong');
  }
  if (q.weight < 0 || q.weight > 100) {
    problems.push('weight');
  }
  if (q.type === 'score') {
    if (q.scale_max <= q.scale_min) {
      problems.push('scale');
    } else if (
      q.pass_score !== null &&
      (q.pass_score < q.scale_min || q.pass_score > q.scale_max)
    ) {
      problems.push('passScore');
    }
  }
  if (q.type === 'number' && q.min !== null && q.max !== null && q.max < q.min) {
    problems.push('range');
  }
  if (q.id && !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(q.id)) {
    problems.push('id');
  }
  return problems;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Template questions (in order) the score is computed from. */
export function maxScore(questions: readonly Question[]): number {
  return questions
    .filter(
      (q) =>
        q.type === 'yes_no' ||
        q.type === 'score' ||
        (q.type === 'number' && (q.min !== null || q.max !== null)),
    )
    .reduce((sum, q) => sum + q.weight, 0);
}

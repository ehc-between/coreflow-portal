import {
  CreateRootCauseRequest,
  FISHBONE_CATEGORIES,
  FishboneCategory,
  FiveWhysStep,
  RootCauseAnalysis,
  RootCauseAnalysisMethod,
  SuggestedRootCause,
  UpdateRootCauseRequest,
} from '../../../core/deviations/deviation.models';

/** The backend's limit on 5 Whys steps. */
export const MAX_WHYS = 10;
/** Steps a new 5 Whys worksheet starts with. */
export const DEFAULT_WHYS = 5;

/** An editable worksheet: fishbone causes are edited one per line. */
export interface WorksheetForm {
  readonly method: RootCauseAnalysisMethod;
  readonly problem: string;
  readonly whys: readonly FiveWhysStep[];
  readonly categories: Readonly<Record<FishboneCategory, string>>;
  readonly conclusion: string;
  /** Copy the conclusion into the deviation's root cause on save (new worksheets). */
  readonly apply: boolean;
}

function emptyCategories(): Record<FishboneCategory, string> {
  return Object.fromEntries(FISHBONE_CATEGORIES.map((c) => [c, ''])) as Record<
    FishboneCategory,
    string
  >;
}

/** A fresh worksheet; 5 Whys starts with `DEFAULT_WHYS` steps asking `whyPrompt`. */
export function emptyWorksheet(
  method: RootCauseAnalysisMethod,
  whyPrompt: string,
  problem = '',
): WorksheetForm {
  return {
    method,
    problem,
    whys:
      method === 'five_whys'
        ? Array.from({ length: DEFAULT_WHYS }, () => ({ question: whyPrompt, answer: '' }))
        : [],
    categories: emptyCategories(),
    conclusion: '',
    apply: false,
  };
}

function categoriesToText(
  categories: Readonly<Record<string, readonly string[]>> | null | undefined,
): Record<FishboneCategory, string> {
  const out = emptyCategories();
  for (const category of FISHBONE_CATEGORIES) {
    const causes = categories?.[category];
    if (Array.isArray(causes)) {
      out[category] = causes.join('\n');
    }
  }
  return out;
}

/** The editable form of a saved worksheet. */
export function worksheetFromAnalysis(analysis: RootCauseAnalysis): WorksheetForm {
  const method = (['five_whys', 'fishbone', 'other'] as const).includes(
    analysis.method as RootCauseAnalysisMethod,
  )
    ? (analysis.method as RootCauseAnalysisMethod)
    : 'other';
  return {
    method,
    problem: analysis.problem ?? '',
    whys: analysis.whys.map((w) => ({ question: w.question ?? '', answer: w.answer ?? '' })),
    categories: categoriesToText(analysis.categories),
    conclusion: analysis.conclusion ?? '',
    apply: false,
  };
}

/**
 * A worksheet pre-filled from the AI suggestion, for a person to review and
 * save. A suggestion with causes but no whys becomes a fishbone.
 */
export function worksheetFromSuggestion(suggestion: SuggestedRootCause): WorksheetForm {
  const whys = (suggestion.whys ?? [])
    .filter((w) => (w.question ?? '').trim() || (w.answer ?? '').trim())
    .slice(0, MAX_WHYS)
    .map((w) => ({ question: w.question ?? '', answer: w.answer ?? '' }));
  const categories = categoriesToText(suggestion.categories);
  const hasCauses = Object.values(categories).some((text) => text.trim());
  return {
    method: whys.length || !hasCauses ? 'five_whys' : 'fishbone',
    problem: suggestion.problem ?? '',
    whys,
    categories,
    conclusion: suggestion.conclusion ?? '',
    apply: false,
  };
}

/** One cause per non-empty line, trimmed. */
export function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !!line);
}

function categoriesPayload(
  form: WorksheetForm,
): Partial<Record<FishboneCategory, readonly string[]>> {
  const out: Partial<Record<FishboneCategory, readonly string[]>> = {};
  for (const category of FISHBONE_CATEGORIES) {
    const causes = linesOf(form.categories[category] ?? '');
    if (causes.length) {
      out[category] = causes;
    }
  }
  return out;
}

function whysPayload(form: WorksheetForm): FiveWhysStep[] {
  return form.whys
    .map((w) => ({ question: w.question.trim(), answer: w.answer.trim() }))
    .filter((w) => w.question || w.answer)
    .map((w) => ({ question: w.question || '?', answer: w.answer }))
    .slice(0, MAX_WHYS);
}

/** The create body; only the parts that belong to the method are sent. */
export function createRequest(form: WorksheetForm): CreateRootCauseRequest {
  return {
    method: form.method,
    problem: form.problem.trim() || null,
    whys: form.method === 'five_whys' ? whysPayload(form) : [],
    categories: form.method === 'fishbone' ? categoriesPayload(form) : {},
    conclusion: form.conclusion.trim() || null,
    apply: form.apply && !!form.conclusion.trim(),
  };
}

/** The update body (the method of a saved worksheet does not change). */
export function updateRequest(form: WorksheetForm): UpdateRootCauseRequest {
  return {
    problem: form.problem.trim() || null,
    whys: form.method === 'five_whys' ? whysPayload(form) : [],
    categories: form.method === 'fishbone' ? categoriesPayload(form) : {},
    conclusion: form.conclusion.trim() || null,
  };
}

/** The deepest answered why: usually the root cause, offered as the conclusion. */
export function lastAnswer(form: WorksheetForm): string {
  for (let i = form.whys.length - 1; i >= 0; i--) {
    const answer = form.whys[i].answer.trim();
    if (answer) {
      return answer;
    }
  }
  return '';
}

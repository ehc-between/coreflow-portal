import { PageContext } from '../../core/ai/page-context';

/**
 * "Forslag" chips (P2): questions that fit the page the user is on. Each entry is
 * an `ask` scope key whose text is both the chip label and the question sent, so
 * what the user clicks is exactly what is asked.
 */
export type SuggestionSet =
  | 'general'
  | 'dashboard'
  | 'myWork'
  | 'requirement'
  | 'standard'
  | 'record'
  | 'form'
  | 'list'
  | 'settings';

const SETS: Readonly<Record<SuggestionSet, readonly string[]>> = {
  general: ['whatNow', 'coverage', 'overdue', 'howFind'],
  dashboard: ['whatNow', 'coverage', 'overdue', 'gaps'],
  myWork: ['myToday', 'myOverdue', 'myPrioritise'],
  requirement: ['reqMissing', 'reqEvidence', 'reqHowTo', 'reqExplain'],
  standard: ['stdStatus', 'stdGaps', 'stdFirst', 'stdExplain'],
  record: ['recSummary', 'recRequirements', 'recConnections', 'recNext'],
  form: ['formHelp', 'formRequirements', 'formExample'],
  list: ['listOpen', 'listOverdue', 'listCounts', 'listHowTo'],
  settings: ['setModules', 'setInvite', 'setLearn'],
};

/** Which set fits the page context (null: no page is attached). */
export function suggestionSet(ctx: PageContext | null): SuggestionSet {
  if (!ctx) {
    return 'general';
  }
  if (ctx.entityType === 'standard_requirement') {
    return 'requirement';
  }
  if (ctx.entityType === 'standard' || ctx.standardKey || ctx.module === 'standards') {
    return 'standard';
  }
  switch (ctx.view) {
    case 'dashboard':
      return 'dashboard';
    case 'settings':
      return 'settings';
    case 'detail':
      return ctx.entityType || ctx.entityId ? 'record' : 'list';
    case 'new':
    case 'edit':
      return 'form';
    case 'list':
    case 'board':
    case 'calendar':
      return ctx.module === 'tasks' || !ctx.module ? 'myWork' : 'list';
    default:
      return ctx.module ? 'list' : 'general';
  }
}

/** The `ask` scope keys of the suggestions for a page context. */
export function suggestionKeys(ctx: PageContext | null): readonly string[] {
  return SETS[suggestionSet(ctx)].map((key) => `ask.suggest.${key}`);
}

/** Every suggestion key (the i18n spec checks they all exist). */
export const ALL_SUGGESTION_KEYS: readonly string[] = [...new Set(Object.values(SETS).flat())].map(
  (key) => `ask.suggest.${key}`,
);

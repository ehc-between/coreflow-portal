import {
  ADDRESSED_STATUSES,
  DraftAnalysisResult,
  LEVELS,
  Level,
  PARTY_CATEGORIES,
  PARTY_TYPES,
  PartyCategory,
  PartyType,
  SuggestPartiesResult,
  SuggestedParty,
} from '../data/context.models';
import { categoriesFor } from '../context-kinds';
import { ContextDraft, localItemId } from './context-draft';

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Merge a drafted SWOT / PESTLE into the form: suggested factors are appended
 * (unknown categories and duplicates dropped), the summary is filled only when
 * empty. Nothing is saved until the user saves the form.
 */
export function applyAnalysisDraft(draft: ContextDraft, result: unknown): ContextDraft {
  const data = (result ?? {}) as DraftAnalysisResult;
  const allowed = new Set(categoriesFor(draft.method));
  const seen = new Set(draft.items.map((i) => `${i.category}|${i.text.trim().toLowerCase()}`));
  const added = (Array.isArray(data.items) ? data.items : [])
    .filter((item) => item && allowed.has(item.category) && typeof item.text === 'string')
    .filter((item) => {
      const key = `${item.category}|${item.text.trim().toLowerCase()}`;
      if (!item.text.trim() || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((item) => ({
      id: localItemId(),
      category: item.category,
      text: item.text.trim(),
      impact: oneOf<Level>(LEVELS, item.impact, 'medium'),
    }));
  const summary =
    !draft.summary.trim() && typeof data.summary === 'string' ? data.summary.trim() : draft.summary;
  return { ...draft, summary, items: [...draft.items, ...added] };
}

/** The valid suggestions of a "suggest interested parties" result. */
export function suggestedParties(result: unknown): SuggestedParty[] {
  const parties = (result as SuggestPartiesResult | null)?.parties;
  return Array.isArray(parties)
    ? parties.filter((p) => p && typeof p.name === 'string' && p.name.trim()).slice(0, 20)
    : [];
}

/** Fill the party form from one suggestion (keeps what the user typed elsewhere). */
export function applySuggestedParty(draft: ContextDraft, party: SuggestedParty): ContextDraft {
  return {
    ...draft,
    title: party.name.trim(),
    category: oneOf<PartyCategory>(PARTY_CATEGORIES, party.category, draft.category),
    party_type: oneOf<PartyType>(PARTY_TYPES, party.party_type, draft.party_type),
    needs: party.needs?.trim() || draft.needs,
    expectations: party.expectations?.trim() || draft.expectations,
    influence: oneOf<Level>(LEVELS, party.influence, draft.influence),
    interest: oneOf<Level>(LEVELS, party.interest, draft.interest),
    addressed_status: oneOf(ADDRESSED_STATUSES, draft.addressed_status, 'not_addressed'),
  };
}

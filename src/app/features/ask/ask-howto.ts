/**
 * "How do I…" entries for the command palette (P2). Each mirrors a how-to topic the
 * assistant answers with steps and a link to the page (`help_howto` in core,
 * `app/ai/howto/*.json`). The palette matches the typed words against the title,
 * question and keywords in the active language (`ask.howto.<key>.*`), and choosing
 * an entry asks the assistant the question.
 */
export interface HowtoEntry {
  readonly key: string;
  /** Owning module (its nav icon and name tag the row); null = platform-wide. */
  readonly module: string | null;
}

export const HOWTO_ENTRIES: readonly HowtoEntry[] = [
  { key: 'registerDeviation', module: 'deviations' },
  { key: 'registerBreach', module: 'deviations' },
  { key: 'handleDeviation', module: 'deviations' },
  { key: 'createDocument', module: 'documents' },
  { key: 'approveDocument', module: 'documents' },
  { key: 'readAcknowledge', module: 'documents' },
  { key: 'linkRequirement', module: 'standards' },
  { key: 'startStandard', module: 'standards' },
  { key: 'whatNext', module: 'standards' },
  { key: 'confirmSuggestions', module: 'standards' },
  { key: 'notApplicable', module: 'standards' },
  { key: 'createTask', module: 'tasks' },
  { key: 'inviteUser', module: null },
  { key: 'enableModule', module: null },
  { key: 'findRecord', module: null },
  { key: 'prepareAudit', module: null },
  { key: 'learn', module: null },
];

/** Words that carry no meaning for matching ("how do I …", "hvordan …"). */
const STOP_WORDS = new Set([
  'how',
  'do',
  'does',
  'i',
  'we',
  'can',
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'my',
  'our',
  'what',
  'where',
  'is',
  'hvordan',
  'gjør',
  'jeg',
  'vi',
  'kan',
  'en',
  'et',
  'ei',
  'å',
  'til',
  'av',
  'i',
  'på',
  'min',
  'mitt',
  'vår',
  'våre',
  'hva',
  'hvor',
  'er',
  'man',
]);

/** Lower-case words (letters and digits, Norwegian letters kept). */
export function words(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The meaningful words of a query (stop words removed). */
export function queryTerms(query: string): string[] {
  return words(query).filter((word) => !STOP_WORDS.has(word));
}

/** Whether a "how to" intent is visible in the query ("hvordan", "how"). */
export function isHowtoQuestion(query: string): boolean {
  const all = words(query);
  return all.includes('hvordan') || all.includes('how');
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return i;
}

/**
 * How well a typed term matches a word, 0..1 (0 = no match). A term may be the
 * start of the word ("avv" → "avvik") or another form of it: Norwegian and
 * English inflections share a long stem ("godkjenner" ~ "godkjenne",
 * "leverandører" ~ "leverandør", "approve" ~ "approved").
 */
export function termMatch(term: string, word: string): number {
  if (word.startsWith(term)) {
    return term.length / word.length;
  }
  const shared = commonPrefix(term, word);
  const shorter = Math.min(term.length, word.length);
  if (shared >= 4 && shared >= shorter - 3) {
    return shared / Math.max(term.length, word.length);
  }
  return 0;
}

/**
 * Score an entry's text against the query terms: every term must match a word of
 * the entry ({@link termMatch}); the score favours more and closer matches.
 * 0 means no match.
 */
export function howtoScore(terms: readonly string[], text: string): number {
  if (!terms.length) {
    return 0;
  }
  const vocabulary = words(text);
  let score = 0;
  for (const term of terms) {
    if (term.length < 2) {
      continue;
    }
    const best = Math.max(0, ...vocabulary.map((word) => termMatch(term, word)));
    if (!best) {
      return 0;
    }
    score += best + 1;
  }
  return score;
}

/**
 * The how-to entries matching `query`, best first (at most `limit`). A query of
 * only "how to" words lists the first entries, so typing "hvordan" already helps.
 */
export function matchHowtos(
  query: string,
  textOf: (entry: HowtoEntry) => string,
  limit = 4,
): HowtoEntry[] {
  const terms = queryTerms(query).filter((term) => term.length >= 2);
  if (!terms.length) {
    return isHowtoQuestion(query) ? HOWTO_ENTRIES.slice(0, limit) : [];
  }
  return HOWTO_ENTRIES.map((entry) => ({ entry, score: howtoScore(terms, textOf(entry)) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => hit.entry);
}

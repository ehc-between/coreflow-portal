import type { GlossaryEntry } from './guidance.models';

/**
 * Glossary terms in guidance text (simplify U39, "plain words first").
 *
 * Intros mark every jargon word as a term token: `[[key|shown text]]`, `[[key]]` (shows the
 * glossary's own term) or `[[key|shown text|plain words]]` (overrides the glossary's beginner
 * form where the sentence needs another inflection). `<app-guidance-text>` renders each token
 * as an `<app-term>` (hover/focus shows the definition).
 *
 * In beginner mode the first use of a term in a text also shows its plain form. Where the
 * plain words can stand in for the term (at a sentence start, or after a preposition or a
 * conjunction) they come first: "over [[risk-appetite|risikoappetitten]]" →
 * "over grensen for hva dere godtar (risikoappetitten)". After an article, a determiner, an
 * adjective or a verb the formal word keeps its place and the plain words follow in
 * brackets, so the sentence stays grammatical: "et [[audit-programme|revisjonsprogram]]" →
 * "et revisjonsprogram (planen for årets kontroller)". Inside a compound ("IKT-tjenester")
 * the term is not expanded.
 *
 * The jargon guard (`jargon-guard.spec.ts`) fails when an intro uses a listed term or an
 * abbreviation outside a token.
 */

/** Plain text (inline markdown) between terms. */
export interface TextSegment {
  readonly kind: 'text';
  readonly text: string;
}

/** A glossary term token. */
export interface TermSegment {
  readonly kind: 'term';
  readonly key: string;
  /** The word as written in the sentence; empty for `[[key]]`. */
  readonly shown: string;
  /** Beginner words for this use, overriding the glossary's (`[[key|shown|plain]]`). */
  readonly plain: string;
  /** The token was wrapped in `**…**`. */
  readonly strong: boolean;
}

export type GuidanceSegment = TextSegment | TermSegment;

/**
 * `[[key|text|=]]`: never add the plain form to this use (a term used as a modifier, as in
 * "the asset inventory"); the next use is explained instead.
 */
export const NO_PLAIN = '=';

/** `**[[key|text|plain]]**`, `[[key|text]]` or `[[key]]`. Keys are glossary keys (`a-z0-9-`). */
const TOKEN = /(\*\*)?\[\[([a-z0-9-]+)(?:\|([^\]|]+))?(?:\|([^\]|]+))?\]\](\*\*)?/g;

/**
 * Words after which the plain form can replace the term (prepositions and conjunctions,
 * nb and en). After any other word the formal term stays first.
 */
const PLAIN_FIRST_AFTER: ReadonlySet<string> = new Set([
  // nb
  'av',
  'bak',
  'eller',
  'etter',
  'for',
  'fra',
  'gjennom',
  'hos',
  'i',
  'med',
  'mellom',
  'mot',
  'og',
  'om',
  'over',
  'per',
  'på',
  'rundt',
  'til',
  'under',
  'uten',
  'ved',
  // en
  'about',
  'after',
  'and',
  'between',
  'by',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'through',
  'to',
  'with',
  'without',
]);

/** Split guidance text into text and term segments. */
export function parseTermTokens(text: string | null | undefined): GuidanceSegment[] {
  const source = text ?? '';
  const out: GuidanceSegment[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    const [whole, open, key, shown, plain, close] = match;
    const start = match.index ?? 0;
    const strong = !!open && !!close;
    // A lone "**" before or after the token belongs to the surrounding text.
    const lead = open && !strong ? open : '';
    const tail = close && !strong ? close : '';
    out.push({ kind: 'text', text: source.slice(last, start) + lead });
    out.push({
      kind: 'term',
      key,
      shown: (shown ?? '').trim(),
      plain: (plain ?? '').trim(),
      strong,
    });
    last = start + whole.length;
    if (tail) {
      out.push({ kind: 'text', text: tail });
    }
  }
  out.push({ kind: 'text', text: source.slice(last) });
  return mergeText(out);
}

/** The text with every token replaced by its shown word (for plain-text uses). */
export function stripTermTokens(text: string | null | undefined): string {
  return parseTermTokens(text)
    .map((seg) =>
      seg.kind === 'text'
        ? seg.text
        : seg.strong
          ? `**${seg.shown || seg.key}**`
          : seg.shown || seg.key,
    )
    .join('');
}

/** Glossary keys used in a text, in order of first use. */
export function termKeys(text: string | null | undefined): string[] {
  const keys: string[] = [];
  for (const seg of parseTermTokens(text)) {
    if (seg.kind === 'term' && !keys.includes(seg.key)) {
      keys.push(seg.key);
    }
  }
  return keys;
}

/** How one term segment reads on screen. */
export interface TermDisplay {
  readonly key: string;
  readonly text: string;
  readonly strong: boolean;
}

/**
 * The display text of each segment. `beginner` adds the plain form to the first use of each
 * key (not in `seen`); later uses, and other levels, show the word as written.
 */
export function displaySegments(
  segments: readonly GuidanceSegment[],
  beginner: boolean,
  lookup: (key: string) => GlossaryEntry | null,
  seen: ReadonlySet<string> = new Set(),
): (TextSegment | TermDisplay)[] {
  const used = new Set(seen);
  return segments.map((seg, i) => {
    if (seg.kind === 'text') {
      return seg;
    }
    const entry = lookup(seg.key);
    const shown = seg.shown || entry?.term || seg.key;
    const plain = seg.plain || entry?.beginner?.trim() || '';
    const plainOf = (text: string) => ({ key: seg.key, text, strong: seg.strong });
    if (!beginner || used.has(seg.key) || !plain || plain === NO_PLAIN || sameWords(plain, shown)) {
      return plainOf(shown);
    }
    const before = segments[i - 1];
    const after = segments[i + 1];
    const textBefore = before?.kind === 'text' ? before.text : '';
    const textAfter = after?.kind === 'text' ? after.text : '';
    const sentenceStart = i === 0 || isSentenceEnd(textBefore);
    if (!expandable(shown, textBefore, textAfter, sentenceStart)) {
      return plainOf(shown);
    }
    used.add(seg.key);
    const afterColon = /:[*_\s]*$/u.test(textBefore);
    const previousWord = /([\p{L}]+)[*_\s]*$/u.exec(textBefore)?.[1]?.toLocaleLowerCase() ?? '';
    if (sentenceStart || afterColon || PLAIN_FIRST_AFTER.has(previousWord)) {
      const lead = sentenceStart ? capitalise(plain) : plain;
      return plainOf(`${lead} (${formalPart(shown, sentenceStart)})`);
    }
    return plainOf(appositive(shown, plain));
  });
}

/** One run of a paragraph as rendered: inline-markdown text or a term, bold or not. */
export interface GuidanceRun {
  /** Glossary key for a term; null for text. */
  readonly key: string | null;
  readonly text: string;
  readonly strong: boolean;
}

/**
 * Resolve bold that spans terms (`**mindre [[nonconformity|avvik]]**`): every `**` left in
 * the text runs toggles bold, so each run is either wholly bold or not.
 */
export function boldRuns(parts: readonly (TextSegment | TermDisplay)[]): GuidanceRun[] {
  const runs: GuidanceRun[] = [];
  let bold = false;
  for (const part of parts) {
    if ('kind' in part) {
      part.text.split('**').forEach((piece, i) => {
        if (i > 0) {
          bold = !bold;
        }
        if (piece) {
          runs.push({ key: null, text: piece, strong: bold });
        }
      });
    } else {
      runs.push({ key: part.key, text: part.text, strong: part.strong || bold });
    }
  }
  return runs;
}

/**
 * Whether a term use may get its plain form. Not inside a compound ("IKT-tjenester",
 * "KI-policy"), not for an abbreviation already spelled out ("arbeidsmiljøutvalget (AMU)"),
 * and not for a capitalised name mid-sentence (a module or a button: "i Eiendeler").
 * The next use of the term is explained instead.
 */
function expandable(shown: string, before: string, after: string, sentenceStart: boolean): boolean {
  if (/[-‑]$/u.test(before) || /^[-‑](?:\p{L}|\s)/u.test(after)) {
    return false;
  }
  if (/\($/u.test(before) && /^\)/u.test(after)) {
    return false;
  }
  return sentenceStart || !/^\p{Lu}\p{Ll}/u.test(shown);
}

/** Whether a text run ends a sentence (or is empty), so what follows starts one. */
function isSentenceEnd(text: string): boolean {
  const trimmed = text.replace(/[*_\s]+$/u, '');
  return trimmed === '' || /[.!?]$/u.test(trimmed);
}

/** "Restrisiko" at a sentence start → "restrisiko" (acronyms keep their case). "A (B)" → "A, B". */
function formalPart(shown: string, sentenceStart: boolean): string {
  let text = shown.replace(/\s*\(([^)]+)\)\s*$/u, ', $1');
  if (sentenceStart && /^\p{Lu}\p{Ll}/u.test(text)) {
    text = text.charAt(0).toLowerCase() + text.slice(1);
  }
  return text;
}

/** "revisjonsprogram" → "revisjonsprogram (planen …)"; "konsekvensanalyse (BIA)" → "… (BIA: …)". */
function appositive(shown: string, plain: string): string {
  const bracket = /^(.*?)\s*\(([^)]+)\)\s*$/u.exec(shown);
  return bracket ? `${bracket[1]} (${bracket[2]}: ${plain})` : `${shown} (${plain})`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sameWords(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function mergeText(segments: GuidanceSegment[]): GuidanceSegment[] {
  const out: GuidanceSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (seg.kind === 'text' && prev?.kind === 'text') {
      out[out.length - 1] = { kind: 'text', text: prev.text + seg.text };
    } else if (seg.kind === 'term' || seg.text) {
      out.push(seg);
    }
  }
  return out;
}

/** An `@query` being typed: where the `@` is and what follows it. */
export interface ActiveMention {
  readonly start: number;
  readonly query: string;
}

/** Longest name fragment the mention menu keeps matching (names may contain spaces). */
const MAX_QUERY = 40;

/**
 * The `@mention` being typed at `caret`, if any: an `@` at the start of the
 * text or after whitespace, followed by at most a short name fragment that has
 * no line break. `"Hi @ad|"` -> `{ start: 3, query: 'ad' }`.
 */
export function activeMention(text: string, caret: number): ActiveMention | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) {
    return null;
  }
  if (at > 0 && !/\s/.test(before.charAt(at - 1))) {
    return null;
  }
  const query = before.slice(at + 1);
  if (query.length > MAX_QUERY || /[\n\r]/.test(query) || /\s{2,}/.test(query)) {
    return null;
  }
  return { start: at, query };
}

/** Replace the active `@query` with `@Name ` and return the new text and caret. */
export function insertMention(
  text: string,
  mention: ActiveMention,
  caret: number,
  name: string,
): { readonly text: string; readonly caret: number } {
  const inserted = `@${name} `;
  const next = text.slice(0, mention.start) + inserted + text.slice(caret);
  return { text: next, caret: mention.start + inserted.length };
}

/** Case-insensitive name / email match for the mention menu, best matches first. */
export function filterCandidates<T extends { readonly name: string; readonly email?: string }>(
  candidates: readonly T[],
  query: string,
  limit = 8,
): T[] {
  const q = query.trim().toLowerCase();
  const scored: { item: T; score: number }[] = [];
  for (const item of candidates) {
    const name = item.name.toLowerCase();
    const email = (item.email ?? '').toLowerCase();
    let score = -1;
    if (!q || name.startsWith(q)) {
      score = 0;
    } else if (name.split(/\s+/).some((part) => part.startsWith(q))) {
      score = 1;
    } else if (name.includes(q) || email.startsWith(q)) {
      score = 2;
    }
    if (score >= 0) {
      scored.push({ item, score });
    }
  }
  return scored
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((s) => s.item);
}

/** The chosen people whose `@Name` is still in the body (deleted mentions drop out). */
export function mentionsInBody<T extends { readonly id: string; readonly name: string }>(
  body: string,
  chosen: readonly T[],
): T[] {
  const seen = new Set<string>();
  return chosen.filter((person) => {
    if (seen.has(person.id) || !body.includes(`@${person.name}`)) {
      return false;
    }
    seen.add(person.id);
    return true;
  });
}

/** A run of comment text, flagged when it is an `@Name` of a mentioned person. */
export interface BodySegment {
  readonly text: string;
  readonly mention: boolean;
}

/** Split a comment body so `@Name` of each mentioned person can be highlighted. */
export function bodySegments(body: string, names: readonly string[]): BodySegment[] {
  const tokens = [...new Set(names.filter((n) => n.trim()).map((n) => `@${n}`))].sort(
    (a, b) => b.length - a.length,
  );
  if (tokens.length === 0) {
    return [{ text: body, mention: false }];
  }
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g');
  return body
    .split(pattern)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, mention: tokens.includes(part) }));
}

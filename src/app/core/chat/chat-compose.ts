import { EntityLinkRef } from './chat.models';

/**
 * Composer ↔ stored body. The textarea shows readable text (`@Kari Nordmann`);
 * chosen mentions and record links are kept beside it and turned into the
 * platform tokens of docs/chat-design.md §1.4 on send:
 *
 *   `@Kari Nordmann` → `[@Kari Nordmann](cf:user/<id>)`
 *   `@HMS`           → `[@HMS](cf:team/<id>)`
 *   record chips     → `[](cf:record/<type>/<id>)` (a final paragraph of cards)
 */

export interface ChosenMention {
  readonly type: 'user' | 'team';
  readonly id: string;
  readonly name: string;
}

export interface ComposerDraft {
  readonly text: string;
  readonly mentions: readonly ChosenMention[];
  readonly records: readonly EntityLinkRef[];
}

const UUID = '[0-9a-fA-F-]{8,36}';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Label characters the server strips from mention labels. */
function cleanLabel(name: string): string {
  return name.replace(/[[\]]/g, '').trim();
}

/** Build the body to send from the composer state. */
export function encodeBody(draft: ComposerDraft): string {
  let text = draft.text;
  const mentions = [...draft.mentions]
    .filter((m, i, all) => all.findIndex((o) => o.id === m.id) === i)
    .sort((a, b) => b.name.length - a.name.length);
  if (mentions.length) {
    // One pass over the text so a replaced token is never matched again.
    const byName = new Map(mentions.map((m) => [`@${m.name}`, m]));
    const pattern = new RegExp(
      `(\`[^\`]*\`)|(${mentions.map((m) => escapeRegExp(`@${m.name}`)).join('|')})(?![\\p{L}\\p{N}_])`,
      'gu',
    );
    text = text.replace(pattern, (whole, code: string | undefined, name: string | undefined) => {
      if (code || !name) {
        return whole;
      }
      const mention = byName.get(name);
      if (!mention) {
        return whole;
      }
      const label = cleanLabel(mention.name);
      return `[@${label}](cf:${mention.type}/${mention.id})`;
    });
  }
  const refs = uniqueRefs(draft.records);
  if (refs.length) {
    const cards = refs.map((r) => `[](cf:record/${r.entity_type}/${r.entity_id})`).join(' ');
    text = text.trim() ? `${text.trimEnd()}\n\n${cards}` : cards;
  }
  return text.trim();
}

/** Split a stored body back into composer state (for editing). */
export function decodeBody(body: string): ComposerDraft {
  const mentions: ChosenMention[] = [];
  const records: EntityLinkRef[] = [];
  let text = body.replace(
    new RegExp(`\\[@?([^\\]]*)\\]\\(cf:(user|team)/(${UUID})\\)`, 'g'),
    (_whole, label: string, type: 'user' | 'team', id: string) => {
      if (!mentions.some((m) => m.id === id)) {
        mentions.push({ type, id, name: label });
      }
      return `@${label}`;
    },
  );
  text = text.replace(
    new RegExp(`\\[[^\\]]*\\]\\(cf:record/([a-z][a-z0-9_]{0,31})/(${UUID})\\)`, 'g'),
    (_whole, type: string, id: string) => {
      records.push({ entity_type: type, entity_id: id });
      return '';
    },
  );
  text = text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, mentions, records: uniqueRefs(records) };
}

export function uniqueRefs(refs: readonly EntityLinkRef[]): EntityLinkRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.entity_type}:${r.entity_id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** A `#tag` being typed at `caret`, if any. */
export function activeTag(
  text: string,
  caret: number,
): { readonly start: number; readonly query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|[^\p{L}\p{N}_#/])#([\p{L}\p{N}_-]{0,48})$/u.exec(before);
  if (!match) {
    return null;
  }
  return { start: before.length - match[2].length - 1, query: match[2] };
}

/** Replace the active `#query` with `#tag `. */
export function insertTag(
  text: string,
  start: number,
  caret: number,
  tag: string,
): { readonly text: string; readonly caret: number } {
  const inserted = `#${tag} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(caret),
    caret: start + inserted.length,
  };
}

/**
 * Wrap the selection in a markdown marker (`**`, `*`, `` ` ``) or, with
 * nothing selected, insert the pair and put the caret between.
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  marker: string,
): { readonly text: string; readonly start: number; readonly end: number } {
  const selected = text.slice(start, end);
  const next = text.slice(0, start) + marker + selected + marker + text.slice(end);
  return { text: next, start: start + marker.length, end: end + marker.length };
}

/** Prefix every selected line (or the caret's line) with `prefix` (`- `, `> `). */
export function prefixLines(
  text: string,
  start: number,
  end: number,
  prefix: string,
): { readonly text: string; readonly start: number; readonly end: number } {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const block = text.slice(lineStart, end);
  const prefixed = block
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
  const next = text.slice(0, lineStart) + prefixed + text.slice(end);
  const added = prefixed.length - block.length;
  return { text: next, start: start + prefix.length, end: end + added };
}

/** Insert `[label](url)` at the selection (the selection becomes the label). */
export function insertLink(
  text: string,
  start: number,
  end: number,
  url: string,
): { readonly text: string; readonly start: number; readonly end: number } {
  const label = text.slice(start, end) || url;
  const inserted = `[${label}](${url})`;
  const next = text.slice(0, start) + inserted + text.slice(end);
  return { text: next, start: start + inserted.length, end: start + inserted.length };
}

/** UUID v4 for `client_id` (idempotent sends). */
export function newClientId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

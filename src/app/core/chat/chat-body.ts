import { Token, Tokens, marked } from 'marked';
import { EntityLinkRef } from './chat.models';

/**
 * Chat message bodies → a small, safe token tree (docs/chat-design.md §1.4,
 * §4.6). The portal never binds message text as HTML: the `message-body`
 * component renders this tree with Angular bindings only. Anything outside
 * the allowed subset (headings, images, tables, raw HTML) becomes plain text.
 */

export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'strong' | 'em' | 'del'; readonly children: readonly Inline[] }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'br' }
  | { readonly kind: 'link'; readonly href: string; readonly children: readonly Inline[] }
  | { readonly kind: 'user' | 'team'; readonly id: string; readonly label: string }
  | { readonly kind: 'record'; readonly ref: EntityLinkRef };

export type Block =
  | { readonly kind: 'paragraph'; readonly inline: readonly Inline[] }
  | { readonly kind: 'records'; readonly refs: readonly EntityLinkRef[] }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'quote'; readonly blocks: readonly Block[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly start: number;
      readonly items: readonly (readonly Block[])[];
    };

/** `#tag` (Unicode letters/digits, `_` and `-`; ≤ 48 chars), not inside a word or path. */
export const TAG_PATTERN = /(?<![\p{L}\p{N}_#/])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,47})/gu;

const UUID = '[0-9a-fA-F-]{8,36}';
const USER_HREF = new RegExp(`^cf:user/(${UUID})$`);
const TEAM_HREF = new RegExp(`^cf:team/(${UUID})$`);
const RECORD_HREF = new RegExp(`^cf:record/([a-z][a-z0-9_]{0,31})/(${UUID})$`);
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

/** Lists nest at most this deep; deeper lists render as plain paragraphs. */
const MAX_LIST_DEPTH = 2;

/** Parse a stored body into the safe tree. Never throws. */
export function parseBody(body: string): Block[] {
  if (!body.trim()) {
    return [];
  }
  let tokens: Token[];
  try {
    tokens = marked.lexer(body, { gfm: true, breaks: true });
  } catch {
    return [{ kind: 'paragraph', inline: textWithTags(body) }];
  }
  return blocks(tokens, 0);
}

function blocks(tokens: readonly Token[], listDepth: number): Block[] {
  const out: Block[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
      case 'hr':
      case 'def':
        if (token.type === 'hr') {
          out.push(plain(token.raw));
        }
        break;
      case 'paragraph':
      case 'text': {
        const children = (token as Tokens.Paragraph | Tokens.Text).tokens;
        const inline = children ? inlines(children, false) : textWithTags(token.raw);
        out.push(...splitRecordBlocks(inline));
        break;
      }
      case 'code':
        out.push({ kind: 'code', text: (token as Tokens.Code).text });
        break;
      case 'blockquote':
        out.push({ kind: 'quote', blocks: blocks((token as Tokens.Blockquote).tokens, listDepth) });
        break;
      case 'list': {
        const list = token as Tokens.List;
        if (listDepth >= MAX_LIST_DEPTH) {
          out.push(plain(list.raw));
          break;
        }
        out.push({
          kind: 'list',
          ordered: list.ordered,
          start: typeof list.start === 'number' ? list.start : 1,
          items: list.items.map((item) => blocks(item.tokens, listDepth + 1)),
        });
        break;
      }
      default:
        // heading, table, html, anything newer: show the source text as is.
        out.push(plain(token.raw));
    }
  }
  return out;
}

function plain(raw: string): Block {
  return { kind: 'paragraph', inline: textWithTags(raw.replace(/\n+$/, '')) };
}

/**
 * A paragraph made only of record links (and whitespace) renders as record
 * cards; record links inside running text stay inline chips.
 */
function splitRecordBlocks(inline: Inline[]): Block[] {
  const meaningful = inline.filter(
    (n) => !(n.kind === 'text' && !n.text.trim()) && n.kind !== 'br',
  );
  if (meaningful.length > 0 && meaningful.every((n) => n.kind === 'record')) {
    return [{ kind: 'records', refs: meaningful.map((n) => (n as { ref: EntityLinkRef }).ref) }];
  }
  return inline.length ? [{ kind: 'paragraph', inline }] : [];
}

function inlines(tokens: readonly Token[], inLink: boolean): Inline[] {
  const out: Inline[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
      case 'escape': {
        const text = token as Tokens.Text;
        if (text.tokens?.length) {
          out.push(...inlines(text.tokens, inLink));
        } else {
          out.push(
            ...(inLink ? [{ kind: 'text' as const, text: text.text }] : textWithTags(text.text)),
          );
        }
        break;
      }
      case 'strong':
      case 'em':
      case 'del':
        out.push({
          kind: token.type,
          children: inlines((token as Tokens.Strong).tokens, inLink),
        });
        break;
      case 'codespan':
        out.push({ kind: 'code', text: (token as Tokens.Codespan).text });
        break;
      case 'br':
        out.push({ kind: 'br' });
        break;
      case 'link':
        out.push(...link(token as Tokens.Link, inLink));
        break;
      default:
        // image, inline html, anything unknown: literal source text.
        out.push({ kind: 'text', text: token.raw });
    }
  }
  return merge(out);
}

function link(token: Tokens.Link, inLink: boolean): Inline[] {
  const href = (token.href ?? '').trim();
  const label = token.text ?? '';
  let match = USER_HREF.exec(href);
  if (match) {
    return [{ kind: 'user', id: match[1], label: stripAt(label) }];
  }
  match = TEAM_HREF.exec(href);
  if (match) {
    return [{ kind: 'team', id: match[1], label: stripAt(label) }];
  }
  match = RECORD_HREF.exec(href);
  if (match) {
    return [{ kind: 'record', ref: { entity_type: match[1], entity_id: match[2] } }];
  }
  const children = inlines(token.tokens ?? [], true);
  if (!inLink && SAFE_HREF.test(href)) {
    return [
      { kind: 'link', href, children: children.length ? children : [{ kind: 'text', text: href }] },
    ];
  }
  // Any other scheme (javascript:, data:, cf:unknown…) is shown as its text only.
  return children.length ? children : [{ kind: 'text', text: label || href }];
}

function stripAt(label: string): string {
  return label.replace(/^@/, '');
}

/** Split plain text into text and `#tag` nodes. */
export function textWithTags(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      out.push({ kind: 'text', text: text.slice(last, index) });
    }
    out.push({ kind: 'tag', tag: match[1].normalize('NFC').toLowerCase() });
    last = index + match[0].length;
  }
  if (last < text.length) {
    out.push({ kind: 'text', text: text.slice(last) });
  }
  return out;
}

/** Join adjacent text nodes (marked splits text around escapes). */
function merge(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (node.kind === 'text' && prev?.kind === 'text') {
      out[out.length - 1] = { kind: 'text', text: prev.text + node.text };
    } else {
      out.push(node);
    }
  }
  return out;
}

/** Record refs in a body (order kept, duplicates dropped): for preview prefetching. */
export function recordRefs(body: string): EntityLinkRef[] {
  const seen = new Set<string>();
  const refs: EntityLinkRef[] = [];
  const pattern = new RegExp(`\\[[^\\]]*\\]\\(cf:record/([a-z][a-z0-9_]{0,31})/(${UUID})\\)`, 'g');
  for (const match of body.matchAll(pattern)) {
    const key = `${match[1]}:${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ entity_type: match[1], entity_id: match[2] });
    }
  }
  return refs;
}

/** Plain text of a body for edit pre-fill: tokens become `@Name`, record links stay out. */
export function bodyToPlain(body: string): string {
  return body
    .replace(new RegExp(`\\[@?([^\\]]*)\\]\\(cf:(?:user|team)/${UUID}\\)`, 'g'), '@$1')
    .replace(new RegExp(`\\[[^\\]]*\\]\\(cf:record/[a-z0-9_]+/${UUID}\\)`, 'g'), '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

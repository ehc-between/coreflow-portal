import { decodeBody } from './chat-compose';
import { ChatMessage, ConversationCore, ConversationSummary, Message } from './chat.models';

/** Pure helpers shared by the chat store and components. */

/** Backend timestamps are naive UTC: read one without an offset as UTC. */
export function parseTs(iso: string | null | undefined): number {
  if (!iso) {
    return 0;
  }
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const time = Date.parse(withZone);
  return Number.isNaN(time) ? 0 : time;
}

/** Plain one-line snippet of a body (tokens → names, markdown punctuation dropped). */
export function snippetOf(body: string, max = 140): string {
  const text = decodeBody(body)
    .text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Newest activity first; conversations without messages by creation time. */
export function compareConversations(a: ConversationSummary, b: ConversationSummary): number {
  const ta = parseTs(a.last_message_at ?? a.created_at);
  const tb = parseTs(b.last_message_at ?? b.created_at);
  return tb - ta || a.id.localeCompare(b.id);
}

/** Members of a conversation other than `meId` (from the preview). */
export function otherMembers(conversation: ConversationCore, meId: string | null) {
  return conversation.member_preview.filter((u) => u.id !== meId);
}

/**
 * Literal display name, or null when the caller must use a translated
 * fallback (unnamed record discussion, empty group): `dm` → the other
 * person, `group` → its name or the member names, `channel` → its name.
 */
export function conversationName(
  conversation: ConversationCore,
  meId: string | null,
): string | null {
  if (conversation.kind === 'dm') {
    return otherMembers(conversation, meId)[0]?.name ?? null;
  }
  if (conversation.name?.trim()) {
    return conversation.name.trim();
  }
  if (conversation.kind === 'group' && !conversation.subject) {
    const names = otherMembers(conversation, meId).map((u) => u.name);
    return names.length ? names.join(', ') : null;
  }
  return null;
}

/** Badge text: `99+` beyond 99, empty for 0. */
export function badgeText(count: number): string {
  if (count <= 0) {
    return '';
  }
  return count > 99 ? '99+' : String(count);
}

/** Local calendar day key `YYYY-MM-DD` of a timestamp. */
export function dayKey(iso: string): string {
  const d = new Date(parseTs(iso));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Day separator: `today`, `yesterday`, or a formatted date ("tirsdag 17. november"). */
export function dayLabel(
  iso: string,
  locale: string,
  now: Date = new Date(),
): { readonly kind: 'today' | 'yesterday' | 'date'; readonly text: string } {
  const date = new Date(parseTs(iso));
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) {
    return { kind: 'today', text: '' };
  }
  if (days === 1) {
    return { kind: 'yesterday', text: '' };
  }
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }
  return { kind: 'date', text: new Intl.DateTimeFormat(locale, options).format(date) };
}

/** `HH:mm` in the locale. */
export function timeLabel(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(parseTs(iso)),
  );
}

/** Full date and time for tooltips. */
export function dateTimeLabel(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(parseTs(iso)),
  );
}

/** One row of the rendered message list. */
export type ListRow =
  | { readonly kind: 'day'; readonly key: string; readonly iso: string }
  | { readonly kind: 'unread'; readonly key: string }
  | {
      readonly kind: 'message';
      readonly key: string;
      readonly message: ChatMessage;
      /** First of a run from one sender within 5 minutes (shows name + avatar). */
      readonly head: boolean;
    };

const GROUP_WINDOW_MS = 5 * 60_000;

/**
 * Rows for a message list: day separators, the "new messages" divider before
 * the first unread message from someone else, and sender grouping.
 */
export function buildRows(
  messages: readonly ChatMessage[],
  readMarker: number | null,
  meId: string | null,
): ListRow[] {
  const rows: ListRow[] = [];
  let lastDay = '';
  let prev: ChatMessage | null = null;
  let unreadPlaced = false;
  for (const message of messages) {
    const day = dayKey(message.created_at);
    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `day-${day}`, iso: message.created_at });
      lastDay = day;
      prev = null;
    }
    if (
      !unreadPlaced &&
      readMarker !== null &&
      !message.localState &&
      message.seq > readMarker &&
      message.sender?.id !== meId &&
      message.kind === 'user'
    ) {
      rows.push({ kind: 'unread', key: 'unread' });
      unreadPlaced = true;
      prev = null;
    }
    const head =
      !prev ||
      prev.kind !== 'user' ||
      message.kind !== 'user' ||
      prev.sender?.id !== message.sender?.id ||
      !!prev.deleted_at ||
      parseTs(message.created_at) - parseTs(prev.created_at) > GROUP_WINDOW_MS;
    rows.push({ kind: 'message', key: message.client_id ?? message.id, message, head });
    prev = message;
  }
  return rows;
}

/** Insert or replace `incoming` (by id, else client id) keeping seq order. */
export function upsertMessage(list: readonly ChatMessage[], incoming: Message): ChatMessage[] {
  const index = list.findIndex(
    (m) => m.id === incoming.id || (!!incoming.client_id && m.client_id === incoming.client_id),
  );
  if (index >= 0) {
    const existing = list[index];
    if (!existing.localState && existing.change_seq > incoming.change_seq) {
      return [...list];
    }
    const next = [...list];
    next[index] = incoming;
    return sortBySeq(next);
  }
  return sortBySeq([...list, incoming]);
}

/** Server messages by seq; local pending/failed ones last in send order. */
export function sortBySeq(list: ChatMessage[]): ChatMessage[] {
  return list.sort((a, b) => {
    const la = a.localState ? 1 : 0;
    const lb = b.localState ? 1 : 0;
    if (la !== lb) {
      return la - lb;
    }
    if (la) {
      return parseTs(a.created_at) - parseTs(b.created_at);
    }
    return a.seq - b.seq;
  });
}

/** Human file size (`81 kB`, `1,2 MB`) in the locale. */
export function fileSize(bytes: number, locale: string): string {
  const units = ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** Curated emoji set (D-16): no emoji library dependency. */
export const EMOJI_SET: readonly string[] = [
  '👍',
  '👎',
  '❤️',
  '😀',
  '😂',
  '😊',
  '😍',
  '🤔',
  '😮',
  '😢',
  '😡',
  '🙏',
  '👏',
  '🙌',
  '💪',
  '👀',
  '🎉',
  '🔥',
  '✅',
  '❌',
  '⚠️',
  '❓',
  '❗',
  '💡',
  '📌',
  '📎',
  '📄',
  '📅',
  '⏰',
  '🚀',
  '⭐',
  '💯',
  '👋',
  '🤝',
  '👌',
  '✌️',
  '🤞',
  '☕',
  '🍰',
  '🌞',
  '😅',
  '😇',
  '🙂',
  '😉',
  '😎',
  '🥳',
  '😴',
  '🤯',
  '😬',
  '🙈',
  '💬',
  '📣',
  '🔒',
  '🛠️',
  '🦺',
  '♻️',
  '📈',
  '📉',
  '🧯',
  '🩹',
];

/** Quick reactions shown first in the reaction menu. */
export const QUICK_REACTIONS: readonly string[] = ['👍', '❤️', '😂', '🎉', '👀', '✅'];

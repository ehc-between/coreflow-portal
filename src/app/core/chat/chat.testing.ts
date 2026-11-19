import { Observable, of, throwError } from 'rxjs';
import {
  ChangesResponse,
  ConversationSummary,
  CreateConversationRequest,
  DirectoryEntry,
  EntityLinkRef,
  ItemsResponse,
  LinkPreview,
  MemberEntry,
  Message,
  MessagePage,
  MessagePageQuery,
  SendMessageRequest,
  SendMessageResponse,
  ChatTag,
  ThreadPage,
} from './chat.models';

/**
 * Test-only fixtures and an in-memory `ChatApi` stand-in, so specs (and UI
 * work before the backend exists) never hit the network.
 *
 *   providers: [{ provide: ChatApi, useValue: new FakeChatApi() }]
 */

export const ME = { id: '00000000-0000-4000-8000-000000000001', name: 'Meg Selv' };
export const KARI = { id: '00000000-0000-4000-8000-000000000002', name: 'Kari Nordmann' };
export const OLA = { id: '00000000-0000-4000-8000-000000000003', name: 'Ola Hansen' };

let counter = 0;
const ts = (minute: number) => new Date(Date.UTC(2026, 10, 19, 9, minute)).toISOString();

export function fakeConversation(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  counter++;
  return {
    id: `c0000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    kind: 'group',
    visibility: 'private',
    name: null,
    topic: null,
    department_id: null,
    subject: null,
    member_count: 2,
    member_preview: [ME, KARI],
    dm_user_ids: null,
    created_at: ts(0),
    archived_at: null,
    last_seq: 0,
    last_message_at: null,
    last_message: null,
    me: { role: 'member', notify_level: 'all', last_read_seq: 0 },
    unread_count: 0,
    mention_count: 0,
    can_post: true,
    can_manage: false,
    ...overrides,
  };
}

export function fakeMessage(overrides: Partial<Message> = {}): Message {
  counter++;
  const seq = overrides.seq ?? counter;
  return {
    id: `m0000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    conversation_id: 'conv',
    seq,
    change_seq: seq,
    parent_id: null,
    client_id: null,
    kind: 'user',
    system: null,
    sender: KARI,
    body: 'Hei',
    mentions: [],
    tags: [],
    entity_links: [],
    attachments: [],
    reactions: [],
    reply_count: 0,
    last_reply_at: null,
    reply_user_ids: [],
    created_at: ts(seq % 60),
    edited_at: null,
    deleted_at: null,
    deleted_reason: null,
    ...overrides,
  };
}

/** In-memory ChatApi. Seed `conversations` / `messagesById`; inspect `calls`. */
export class FakeChatApi {
  conversations: ConversationSummary[] = [];
  messagesById = new Map<string, Message[]>();
  previews: LinkPreview[] = [];
  directoryEntries: DirectoryEntry[] = [];
  tagList: ChatTag[] = [];
  changesResponses: ChangesResponse[] = [];
  failSend = false;
  readonly calls: { method: string; args: unknown[] }[] = [];

  private log(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  callsOf(method: string) {
    return this.calls.filter((c) => c.method === method);
  }

  listConversations(orgId: string): Observable<ItemsResponse<ConversationSummary>> {
    this.log('listConversations', orgId);
    return of({ items: this.conversations });
  }

  browse(orgId: string, q = ''): Observable<ItemsResponse<ConversationSummary>> {
    this.log('browse', orgId, q);
    return of({ items: [] });
  }

  getConversation(orgId: string, id: string): Observable<ConversationSummary> {
    this.log('getConversation', orgId, id);
    const c = this.conversations.find((x) => x.id === id);
    return c ? of(c) : throwError(() => new Error('404'));
  }

  createConversation(
    orgId: string,
    body: CreateConversationRequest,
  ): Observable<ConversationSummary> {
    this.log('createConversation', orgId, body);
    const c = fakeConversation({ kind: body.kind });
    this.conversations.push(c);
    return of(c);
  }

  messages(orgId: string, id: string, query: MessagePageQuery = {}): Observable<MessagePage> {
    this.log('messages', orgId, id, query);
    return of({
      items: this.messagesById.get(id) ?? [],
      has_more_before: false,
      has_more_after: false,
    });
  }

  thread(orgId: string, id: string, rootId: string): Observable<ThreadPage> {
    this.log('thread', orgId, id, rootId);
    const root =
      (this.messagesById.get(id) ?? []).find((m) => m.id === rootId) ?? fakeMessage({ id: rootId });
    return of({ root, items: [], has_more: false, following: true });
  }

  markThreadRead(...args: unknown[]): Observable<void> {
    this.log('markThreadRead', ...args);
    return of(undefined);
  }

  changes(orgId: string, id: string, sinceSeq: number): Observable<ChangesResponse> {
    this.log('changes', orgId, id, sinceSeq);
    const next = this.changesResponses.shift();
    const conversation = this.conversations.find((c) => c.id === id) ?? fakeConversation({ id });
    return of(
      next ?? {
        items: [],
        conversation,
        last_seq: conversation.last_seq,
        has_more: false,
        reset: false,
      },
    );
  }

  send(orgId: string, id: string, body: SendMessageRequest): Observable<SendMessageResponse> {
    this.log('send', orgId, id, body);
    if (this.failSend) {
      return throwError(() => new Error('send failed'));
    }
    const message = fakeMessage({
      conversation_id: id,
      client_id: body.client_id,
      body: body.body,
      parent_id: body.parent_id,
      sender: ME,
    });
    return of({ message, warnings: [] });
  }

  edit(
    orgId: string,
    id: string,
    messageId: string,
    body: string,
  ): Observable<SendMessageResponse> {
    this.log('edit', orgId, id, messageId, body);
    return of({
      message: fakeMessage({
        id: messageId,
        conversation_id: id,
        body,
        edited_at: ts(30),
        sender: ME,
      }),
      warnings: [],
    });
  }

  deleteMessage(...args: unknown[]): Observable<void> {
    this.log('deleteMessage', ...args);
    return of(undefined);
  }

  react(...args: unknown[]): Observable<void> {
    this.log('react', ...args);
    return of(undefined);
  }

  markRead(orgId: string, id: string, seq: number): Observable<{ last_read_seq: number }> {
    this.log('markRead', orgId, id, seq);
    return of({ last_read_seq: seq });
  }

  members(orgId: string, id: string): Observable<ItemsResponse<MemberEntry>> {
    this.log('members', orgId, id);
    return of({ items: [] });
  }

  linkPreviews(
    orgId: string,
    refs: readonly EntityLinkRef[],
  ): Observable<ItemsResponse<LinkPreview>> {
    this.log('linkPreviews', orgId, refs);
    return of({
      items: this.previews.filter((p) => refs.some((r) => r.entity_id === p.entity_id)),
    });
  }

  directory(orgId: string, q: string): Observable<ItemsResponse<DirectoryEntry>> {
    this.log('directory', orgId, q);
    const query = q.toLowerCase();
    return of({ items: this.directoryEntries.filter((e) => e.name.toLowerCase().includes(query)) });
  }

  tags(orgId: string, q: string): Observable<ItemsResponse<ChatTag>> {
    this.log('tags', orgId, q);
    return of({ items: this.tagList.filter((t) => t.name.startsWith(q.toLowerCase())) });
  }

  recordConversations(
    orgId: string,
    ref: EntityLinkRef,
  ): Observable<ItemsResponse<ConversationSummary>> {
    this.log('recordConversations', orgId, ref);
    return of({
      items: this.conversations.filter((c) => c.subject?.entity_id === ref.entity_id),
    });
  }

  setNotifyLevel(orgId: string, id: string): Observable<ConversationSummary> {
    this.log('setNotifyLevel', orgId, id);
    return of(this.conversations.find((c) => c.id === id) ?? fakeConversation({ id }));
  }
}

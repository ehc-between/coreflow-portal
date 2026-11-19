import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  AdminConversation,
  ChangesResponse,
  ChatSearchQuery,
  ChatSearchResponse,
  ChatSettings,
  ChatTag,
  ConversationCore,
  ConversationSummary,
  CreateConversationRequest,
  DirectoryEntry,
  EntityLinkRef,
  ErasureResult,
  ItemsResponse,
  LinkPreview,
  MemberEntry,
  MemberRole,
  MessageLocator,
  MessagePage,
  MessagePageQuery,
  NotifyLevel,
  ReactionUsers,
  SendMessageRequest,
  SendMessageResponse,
  ThreadPage,
  UpdateConversationRequest,
} from './chat.models';

/** Errors of in-place calls are shown where they happen (composer, dialogs). */
const QUIET = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/**
 * REST client for the chat module (docs/chat-design.md §2). Every call is
 * org-scoped; all mutations go over REST (the socket only pushes, D-12).
 */
@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${encodeURIComponent(orgId)}/chat`;
  }

  private conv(orgId: string, id: string): string {
    return `${this.base(orgId)}/conversations/${encodeURIComponent(id)}`;
  }

  // --- conversations (§2.2) ---

  listConversations(
    orgId: string,
    includeArchived = false,
  ): Observable<ItemsResponse<ConversationSummary>> {
    return this.api.get(`${this.base(orgId)}/conversations`, {
      ...QUIET,
      params: { include_archived: includeArchived },
    });
  }

  browse(orgId: string, q = ''): Observable<ItemsResponse<ConversationSummary>> {
    return this.api.get(`${this.base(orgId)}/conversations/browse`, {
      ...QUIET,
      params: { q: q.trim().slice(0, 80) || undefined },
    });
  }

  createConversation(
    orgId: string,
    body: CreateConversationRequest,
  ): Observable<ConversationSummary> {
    return this.api.post(`${this.base(orgId)}/conversations`, body, QUIET);
  }

  getConversation(orgId: string, id: string): Observable<ConversationSummary> {
    return this.api.get(this.conv(orgId, id), QUIET);
  }

  updateConversation(
    orgId: string,
    id: string,
    body: UpdateConversationRequest,
  ): Observable<ConversationSummary> {
    return this.api.patch(this.conv(orgId, id), body, QUIET);
  }

  archive(orgId: string, id: string, archived: boolean): Observable<ConversationSummary> {
    return this.api.post(
      `${this.conv(orgId, id)}/${archived ? 'archive' : 'unarchive'}`,
      {},
      QUIET,
    );
  }

  join(orgId: string, id: string): Observable<ConversationSummary> {
    return this.api.post(`${this.conv(orgId, id)}/join`, {}, QUIET);
  }

  leave(orgId: string, id: string): Observable<void> {
    return this.api.post(`${this.conv(orgId, id)}/leave`, {}, QUIET);
  }

  setNotifyLevel(orgId: string, id: string, level: NotifyLevel): Observable<ConversationSummary> {
    return this.api.put(`${this.conv(orgId, id)}/me`, { notify_level: level }, QUIET);
  }

  markRead(orgId: string, id: string, seq: number): Observable<{ last_read_seq: number }> {
    return this.api.post(`${this.conv(orgId, id)}/read`, { seq }, QUIET);
  }

  // --- members (§2.3) ---

  members(orgId: string, id: string): Observable<ItemsResponse<MemberEntry>> {
    return this.api.get(`${this.conv(orgId, id)}/members`, QUIET);
  }

  addMembers(
    orgId: string,
    id: string,
    userIds: readonly string[],
    role: MemberRole = 'member',
  ): Observable<ConversationSummary> {
    return this.api.post(`${this.conv(orgId, id)}/members`, { user_ids: userIds, role }, QUIET);
  }

  setMemberRole(orgId: string, id: string, userId: string, role: MemberRole): Observable<void> {
    return this.api.patch(
      `${this.conv(orgId, id)}/members/${encodeURIComponent(userId)}`,
      { role },
      QUIET,
    );
  }

  removeMember(orgId: string, id: string, userId: string): Observable<void> {
    return this.api.delete(`${this.conv(orgId, id)}/members/${encodeURIComponent(userId)}`, QUIET);
  }

  // --- messages, threads, reactions (§2.4) ---

  messages(orgId: string, id: string, query: MessagePageQuery = {}): Observable<MessagePage> {
    return this.api.get(`${this.conv(orgId, id)}/messages`, {
      ...QUIET,
      params: { ...query },
    });
  }

  thread(orgId: string, id: string, rootId: string, afterSeq?: number): Observable<ThreadPage> {
    return this.api.get(`${this.conv(orgId, id)}/messages/${encodeURIComponent(rootId)}/thread`, {
      ...QUIET,
      params: { after_seq: afterSeq, limit: 50 },
    });
  }

  markThreadRead(orgId: string, id: string, rootId: string, seq: number): Observable<void> {
    return this.api.post(
      `${this.conv(orgId, id)}/messages/${encodeURIComponent(rootId)}/thread/read`,
      { seq },
      QUIET,
    );
  }

  followThread(orgId: string, id: string, rootId: string, follow: boolean): Observable<void> {
    const path = `${this.conv(orgId, id)}/messages/${encodeURIComponent(rootId)}/thread/follow`;
    return follow ? this.api.put(path, {}, QUIET) : this.api.delete(path, QUIET);
  }

  changes(orgId: string, id: string, sinceSeq: number, limit = 200): Observable<ChangesResponse> {
    return this.api.get(`${this.conv(orgId, id)}/changes`, {
      ...QUIET,
      params: { since_seq: sinceSeq, limit },
    });
  }

  send(orgId: string, id: string, body: SendMessageRequest): Observable<SendMessageResponse> {
    return this.api.post(`${this.conv(orgId, id)}/messages`, body, QUIET);
  }

  edit(
    orgId: string,
    id: string,
    messageId: string,
    body: string,
  ): Observable<SendMessageResponse> {
    return this.api.patch(
      `${this.conv(orgId, id)}/messages/${encodeURIComponent(messageId)}`,
      { body },
      QUIET,
    );
  }

  deleteMessage(orgId: string, id: string, messageId: string): Observable<void> {
    return this.api.delete(
      `${this.conv(orgId, id)}/messages/${encodeURIComponent(messageId)}`,
      QUIET,
    );
  }

  react(
    orgId: string,
    id: string,
    messageId: string,
    emoji: string,
    on: boolean,
  ): Observable<void> {
    const path = `${this.conv(orgId, id)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`;
    return on ? this.api.put(path, {}, QUIET) : this.api.delete(path, QUIET);
  }

  reactions(
    orgId: string,
    id: string,
    messageId: string,
  ): Observable<ItemsResponse<ReactionUsers>> {
    return this.api.get(
      `${this.conv(orgId, id)}/messages/${encodeURIComponent(messageId)}/reactions`,
      QUIET,
    );
  }

  locate(orgId: string, messageId: string): Observable<MessageLocator> {
    return this.api.get(`${this.base(orgId)}/messages/${encodeURIComponent(messageId)}`, QUIET);
  }

  // --- search, tags, directory (§2.5) ---

  search(orgId: string, query: ChatSearchQuery): Observable<ChatSearchResponse> {
    return this.api.get(`${this.base(orgId)}/search`, {
      ...QUIET,
      params: { ...query, q: query.q?.trim().slice(0, 200) || undefined },
    });
  }

  tags(orgId: string, q: string, limit = 8): Observable<ItemsResponse<ChatTag>> {
    return this.api.get(`${this.base(orgId)}/tags`, { ...QUIET, params: { q, limit } });
  }

  directory(orgId: string, q: string, limit = 8): Observable<ItemsResponse<DirectoryEntry>> {
    return this.api.get(`${this.base(orgId)}/directory`, { ...QUIET, params: { q, limit } });
  }

  // --- record discussions and previews (§2.6, §2.9) ---

  recordConversations(
    orgId: string,
    ref: EntityLinkRef,
  ): Observable<ItemsResponse<ConversationSummary>> {
    return this.api.get(`${this.base(orgId)}/record-conversations`, {
      ...QUIET,
      params: { entity_type: ref.entity_type, entity_id: ref.entity_id },
    });
  }

  linkPreviews(
    orgId: string,
    refs: readonly EntityLinkRef[],
  ): Observable<ItemsResponse<LinkPreview>> {
    return this.api.post(`${this.base(orgId)}/link-previews`, { refs }, QUIET);
  }

  // --- admin (§2.8) ---

  adminConversations(
    orgId: string,
    query: { kind?: string; q?: string; include_archived?: boolean } = {},
  ): Observable<ItemsResponse<AdminConversation>> {
    return this.api.get(`${this.base(orgId)}/admin/conversations`, { ...QUIET, params: query });
  }

  setLegalHold(orgId: string, id: string, legalHold: boolean): Observable<ConversationCore> {
    return this.api.put(
      `${this.base(orgId)}/admin/conversations/${encodeURIComponent(id)}/legal-hold`,
      { legal_hold: legalHold },
      QUIET,
    );
  }

  settings(orgId: string): Observable<ChatSettings> {
    return this.api.get(`${this.base(orgId)}/admin/settings`, QUIET);
  }

  updateSettings(orgId: string, retentionDays: number | null): Observable<ChatSettings> {
    return this.api.put(
      `${this.base(orgId)}/admin/settings`,
      { retention_days: retentionDays },
      QUIET,
    );
  }

  exportUser(orgId: string, userId: string): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/admin/users/${encodeURIComponent(userId)}/export`);
  }

  eraseUser(orgId: string, userId: string): Observable<ErasureResult> {
    return this.api.post(
      `${this.base(orgId)}/admin/users/${encodeURIComponent(userId)}/erase`,
      { confirm: true },
      QUIET,
    );
  }

  exportOrg(orgId: string, after: string, before: string): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/admin/export`, { params: { after, before } });
  }

  exportMine(orgId: string): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/me/export`);
  }
}

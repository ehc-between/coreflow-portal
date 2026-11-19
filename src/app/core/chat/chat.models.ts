/**
 * Chat DTOs, mirroring coreflow-core `app/modules/chat/schemas.py`
 * (docs/chat-design.md §2.1). All REST endpoints live under
 * `v1/orgs/{org_id}/chat`.
 */

export type ConversationKind = 'dm' | 'group' | 'channel';
export type ConversationVisibility = 'private' | 'public';
export type MemberRole = 'owner' | 'admin' | 'member';
export type NotifyLevel = 'all' | 'mentions' | 'none';
export type ChatAttachmentStatus = 'pending' | 'scanning' | 'available' | 'quarantined' | 'deleted';
export type DeletedReason = 'author' | 'moderator' | 'admin' | 'erasure' | 'retention';

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

export interface AttachmentRef {
  readonly id: string;
  readonly filename: string;
  readonly content_type: string;
  readonly size_bytes: number;
  readonly status: ChatAttachmentStatus;
  readonly is_image: boolean;
}

export interface ReactionSummary {
  readonly emoji: string;
  readonly count: number;
  readonly user_ids: readonly string[];
}

export interface EntityLinkRef {
  readonly entity_type: string;
  readonly entity_id: string;
}

export type SystemEvent =
  | 'member_added'
  | 'member_removed'
  | 'renamed'
  | 'archived'
  | 'unarchived'
  | 'created';

export interface SystemInfo {
  readonly event: SystemEvent;
  readonly params: {
    readonly actor?: UserRef | null;
    readonly users?: readonly UserRef[];
    readonly name?: string | null;
  };
}

/** One message — identical for every viewer (safe to broadcast). */
export interface Message {
  readonly id: string;
  readonly conversation_id: string;
  readonly seq: number;
  readonly change_seq: number;
  readonly parent_id: string | null;
  readonly client_id: string | null;
  readonly kind: 'user' | 'system';
  readonly system: SystemInfo | null;
  readonly sender: UserRef | null;
  readonly body: string;
  readonly mentions: readonly { readonly type: 'user' | 'team'; readonly id: string }[];
  readonly tags: readonly string[];
  readonly entity_links: readonly EntityLinkRef[];
  readonly attachments: readonly AttachmentRef[];
  readonly reactions: readonly ReactionSummary[];
  readonly reply_count: number;
  readonly last_reply_at: string | null;
  readonly reply_user_ids: readonly string[];
  readonly created_at: string;
  readonly edited_at: string | null;
  readonly deleted_at: string | null;
  readonly deleted_reason: DeletedReason | null;
}

/** A message as the portal holds it: the server shape plus local send state. */
export interface ChatMessage extends Message {
  /** `pending` while an optimistic send is in flight, `failed` when it errored. */
  readonly localState?: 'pending' | 'failed';
  /** Local object URLs for image previews of an optimistic message. */
  readonly localPreviews?: readonly string[];
}

/** Conversation fields identical for every viewer. */
export interface ConversationCore {
  readonly id: string;
  readonly kind: ConversationKind;
  readonly visibility: ConversationVisibility;
  readonly name: string | null;
  readonly topic: string | null;
  readonly department_id: string | null;
  readonly subject: EntityLinkRef | null;
  readonly member_count: number;
  readonly member_preview: readonly UserRef[];
  readonly dm_user_ids: readonly string[] | null;
  readonly created_at: string;
  readonly archived_at: string | null;
  readonly last_seq: number;
  readonly last_message_at: string | null;
}

export interface LastMessage {
  readonly id: string;
  readonly sender: UserRef | null;
  readonly snippet: string;
  readonly created_at: string;
  readonly deleted: boolean;
  readonly has_attachments: boolean;
}

export interface MyMembership {
  readonly role: MemberRole;
  readonly notify_level: NotifyLevel;
  readonly last_read_seq: number;
}

/** ConversationCore + viewer fields. */
export interface ConversationSummary extends ConversationCore {
  readonly last_message: LastMessage | null;
  /** null: a public channel the viewer has not joined. */
  readonly me: MyMembership | null;
  readonly unread_count: number;
  readonly mention_count: number;
  readonly can_post: boolean;
  readonly can_manage: boolean;
}

export interface ItemsResponse<T> {
  readonly items: readonly T[];
}

export type CreateConversationRequest =
  | { readonly kind: 'dm'; readonly user_ids: readonly string[] }
  | {
      readonly kind: 'group';
      readonly user_ids: readonly string[];
      readonly name: string | null;
      readonly subject: EntityLinkRef | null;
    }
  | {
      readonly kind: 'channel';
      readonly name: string;
      readonly topic: string | null;
      readonly visibility: ConversationVisibility;
      readonly user_ids: readonly string[];
      readonly subject: EntityLinkRef | null;
    };

export interface UpdateConversationRequest {
  readonly name?: string;
  readonly topic?: string | null;
  readonly visibility?: ConversationVisibility;
}

export interface MemberEntry {
  readonly user: UserRef;
  readonly role: MemberRole;
  readonly joined_at: string;
  readonly department_ids: readonly string[];
}

export interface MessagePage {
  readonly items: readonly Message[];
  readonly has_more_before: boolean;
  readonly has_more_after: boolean;
}

export interface MessagePageQuery {
  readonly before_seq?: number;
  readonly after_seq?: number;
  readonly around_seq?: number;
  readonly limit?: number;
}

export interface ThreadPage {
  readonly root: Message;
  readonly items: readonly Message[];
  readonly has_more: boolean;
  readonly following: boolean;
}

export interface ChangesResponse {
  readonly items: readonly Message[];
  readonly conversation: ConversationSummary;
  readonly last_seq: number;
  readonly has_more: boolean;
  readonly reset: boolean;
}

export interface SendMessageRequest {
  readonly client_id: string;
  readonly body: string;
  readonly parent_id: string | null;
  readonly attachment_ids: readonly string[];
}

export interface MessageWarning {
  readonly code: 'mention_not_member' | (string & {});
  readonly user_id?: string;
}

export interface SendMessageResponse {
  readonly message: Message;
  readonly warnings: readonly MessageWarning[];
}

export interface ReactionUsers {
  readonly emoji: string;
  readonly users: readonly UserRef[];
}

export interface MessageLocator {
  readonly conversation_id: string;
  readonly seq: number;
  readonly parent_id: string | null;
}

export type SearchHas = 'file' | 'image' | 'link';

export interface ChatSearchQuery {
  readonly q?: string;
  readonly tag?: string;
  readonly conversation_id?: string;
  readonly from_user_id?: string;
  readonly has?: SearchHas;
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ChatSearchHit {
  readonly message: Message;
  readonly conversation: ConversationCore;
  /** Plain text with `<mark>…</mark>` as the only markup (never bound as HTML). */
  readonly snippet: string;
}

export interface ChatSearchResponse {
  readonly items: readonly ChatSearchHit[];
  readonly next_cursor: string | null;
}

export interface ChatTag {
  readonly name: string;
  readonly display: string;
  readonly use_count: number;
}

export interface DirectoryEntry {
  readonly type: 'user' | 'team';
  readonly id: string;
  readonly name: string;
  /** Email for people, member count for teams. */
  readonly detail: string;
}

/** `POST link-previews` item: permission-aware, resolved for the viewer. */
export interface LinkPreview {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly visible: boolean;
  readonly title?: string;
  readonly code?: string | null;
  readonly status?: string | null;
  readonly url?: string | null;
  readonly module?: string | null;
  readonly label_key?: string | null;
}

export interface AdminConversation extends ConversationCore {
  readonly message_count: number;
  readonly legal_hold: boolean;
}

export interface ChatSettings {
  readonly retention_days: number | null;
  readonly updated_at: string | null;
  readonly updated_by: UserRef | null;
}

export interface ErasureResult {
  readonly messages_erased: number;
  readonly reactions_removed: number;
  readonly memberships_removed: number;
}

/** Limits from docs/chat-design.md §7. */
export const CHAT_LIMITS = {
  body: 8000,
  attachments: 10,
  links: 10,
  mentions: 50,
  groupMembers: 50,
  channelName: 80,
  topic: 250,
  reactions: 20,
  pageSize: 50,
  domWindow: 300,
  unreadCap: 99,
} as const;

/** Entity type the attachment service files chat uploads under (§2.7). */
export const CHAT_ATTACHMENT_ENTITY = 'chat_conversation';

# Chat: design and contracts (C-series)

Status: **binding contract** for the chat build. Three engineers work against it in
parallel: **RT** (realtime gateway, backend), **DOM** (chat domain + REST + integrations,
backend) and **UI** (portal). Where this document and a habit of the codebase disagree,
this document wins for chat; where this document is silent, the repo's CLAUDE.md wins.
Decisions taken without the product owner are marked **[D-n]** and collected in §8.

Product request (product owner): "a full chat option in the platform between employees and
teams with tags and so on; it has to be good with web sockets; be able to send images,
documents, linking to pages in the platform, reactions, comments as well as creating group
chats".

Contents

1. Data model
2. REST API
3. Realtime (WebSocket gateway)
4. Portal
5. Integrations (notifications, search, assistant, GDPR, audit, retention)
6. Work split and file ownership
7. Limits, error codes and test rules
8. Decisions log

Glossary used below: **conversation** = any chat room (kind `dm`, `group`, `channel`);
**team** = a department (`departments` table); **seq** = per-conversation change
counter; **record** = any registered entity type (risk, deviation, …).

---

## 1. Data model

Module key `chat` (package `app/modules/chat`). Migration file
`alembic/versions/cf200_chat.py`, `revision = "cf200_chat"`, `down_revision` = the current
alembic head **at build time** (inspect it yourself; today it is `cf185_u14_notice_docs`,
the orchestrator re-chains on merge). Every table has `org_id uuid NOT NULL REFERENCES
organizations(id) ON DELETE CASCADE`. Timestamps are naive UTC (`timestamp without time
zone`), like the rest of core. All ids are uuid4 unless stated.

### 1.1 Conversation kinds

| kind      | members           | name                  | visibility            | who creates                    |
| --------- | ----------------- | --------------------- | --------------------- | ------------------------------ |
| `dm`      | exactly 2         | none (other person)   | private               | any `chat:use` member          |
| `group`   | 2–50              | optional              | private               | any `chat:use` member          |
| `channel` | unlimited         | required, unique/org  | `public` or `private` | any `chat:use` member; system for department channels |

- **Department channels** [D-1]: one `channel` per department, `visibility=private`,
  `department_id` set, name synced from the department name, members = the department's
  members (synced, see §5.6). Members cannot leave a department channel (they can set
  `notify_level=none`); the department lead is a channel `admin`.
- **Record discussions** [D-2]: a `group` (or `channel`) with `subject_type`/`subject_id`
  set. Every member must be able to read the subject record (checked on create and on
  member add: 422 `member_no_record_access`). The subject's title is never stored: it is
  resolved per viewer (§2.9).
- **Public channels** are readable (messages, members, attachments) by every org member
  with `chat:use` even before joining; posting requires membership (join is one click).
  Private conversations are visible only to members. `chat:admin` sees the **metadata**
  of every conversation (name, kind, members, counts) but never message content in the
  UI; content leaves only through the audited export (§5.4) [D-3].
- No end-to-end encryption (org must be able to export and erase). Data at rest is
  protected like every other table.

### 1.2 Tables

```
chat_conversation
  id uuid PK, org_id
  kind            varchar(8)   'dm' | 'group' | 'channel'
  visibility      varchar(8)   'private' | 'public'          (dm/group: always 'private')
  name            varchar(80)  NULL                          (required for channel)
  topic           varchar(250) NULL
  department_id   uuid NULL FK departments(id) ON DELETE SET NULL
  subject_type    varchar(32) NULL, subject_id uuid NULL     (record discussion)
  dm_key          varchar(80) NULL                           ("<smaller uuid>:<larger uuid>")
  created_by      uuid NULL FK users(id) ON DELETE SET NULL
  created_at, updated_at
  archived_at     NULL, archived_by uuid NULL FK users SET NULL
  last_seq        bigint NOT NULL DEFAULT 0                  (change counter, §1.3)
  last_message_at timestamp NULL                             (top-level, non-deleted)
  legal_hold      boolean NOT NULL DEFAULT false             (retention skips it)
  INDEX ix_chat_conv_org_kind_last (org_id, kind, last_message_at DESC)
  UNIQUE uq_chat_conv_dm (org_id, dm_key) WHERE dm_key IS NOT NULL
  UNIQUE uq_chat_conv_department (org_id, department_id) WHERE department_id IS NOT NULL
  UNIQUE uq_chat_conv_channel_name (org_id, lower(name)) WHERE kind='channel' AND archived_at IS NULL
  INDEX ix_chat_conv_subject (org_id, subject_type, subject_id) WHERE subject_id IS NOT NULL

chat_member
  conversation_id uuid FK chat_conversation ON DELETE CASCADE
  user_id         uuid FK users ON DELETE CASCADE
  PK (conversation_id, user_id); org_id
  role            varchar(8)  'owner' | 'admin' | 'member'
  notify_level    varchar(8)  'all' | 'mentions' | 'none'   (default: dm/group 'all', channel 'mentions')
  last_read_seq   bigint NOT NULL DEFAULT 0
  last_read_at    timestamp NULL
  joined_at, added_by uuid NULL FK users SET NULL
  INDEX ix_chat_member_user (org_id, user_id)

chat_message
  id uuid PK, org_id
  conversation_id uuid FK chat_conversation ON DELETE CASCADE
  seq             bigint NOT NULL       (assigned at creation, never changes)
  change_seq      bigint NOT NULL       (= conversation.last_seq after the latest change)
  parent_id       uuid NULL FK chat_message(id) ON DELETE CASCADE   (thread root; never nested)
  sender_id       uuid NULL FK users ON DELETE SET NULL             (NULL: system / erased)
  client_id       uuid NULL                                         (idempotency key)
  kind            varchar(8) 'user' | 'system'
  system_event    varchar(32) NULL, system_params jsonb NULL        (i18n system lines)
  body            text NOT NULL DEFAULT ''   (normalised markdown subset, §1.4; ≤ 8000 chars)
  body_text       text NOT NULL DEFAULT ''   (plain projection: search, snippets, assistant)
  search_vector   tsvector GENERATED ALWAYS AS (to_tsvector('simple', body_text)) STORED
  entity_links    jsonb NOT NULL DEFAULT '[]'   ([{entity_type, entity_id}], ≤ 10)
  mention_team_ids jsonb NOT NULL DEFAULT '[]'  (department ids mentioned)
  reply_count     integer NOT NULL DEFAULT 0, last_reply_at timestamp NULL (roots only)
  created_at, edited_at NULL
  deleted_at NULL, deleted_by uuid NULL FK users SET NULL
  deleted_reason  varchar(12) NULL  'author' | 'moderator' | 'admin' | 'erasure' | 'retention'
  UNIQUE uq_chat_msg_seq (conversation_id, seq)
  INDEX ix_chat_msg_change (conversation_id, change_seq)
  INDEX ix_chat_msg_parent (parent_id, seq) WHERE parent_id IS NOT NULL
  INDEX ix_chat_msg_sender (org_id, sender_id)
  INDEX ix_chat_msg_org_created (org_id, created_at)            (retention)
  UNIQUE uq_chat_msg_client (conversation_id, sender_id, client_id) WHERE client_id IS NOT NULL
  GIN ix_chat_msg_search (search_vector)

chat_message_attachment
  message_id uuid FK chat_message ON DELETE CASCADE
  attachment_id uuid FK attachment(id) ON DELETE CASCADE UNIQUE
  PK (message_id, attachment_id); org_id; position smallint

chat_reaction
  message_id uuid FK chat_message ON DELETE CASCADE, user_id uuid FK users ON DELETE CASCADE
  emoji varchar(32); PK (message_id, user_id, emoji); org_id; created_at

chat_mention                                   (expanded at send/edit time, users only)
  message_id uuid FK chat_message ON DELETE CASCADE, user_id uuid FK users ON DELETE CASCADE
  PK (message_id, user_id); org_id; conversation_id; seq bigint; via_team_id uuid NULL
  INDEX ix_chat_mention_user (user_id, conversation_id, seq)

chat_tag
  id uuid PK, org_id, name varchar(48) (lower-case NFC), display varchar(48),
  use_count integer DEFAULT 0, last_used_at timestamp
  UNIQUE (org_id, name)

chat_message_tag
  message_id uuid FK chat_message ON DELETE CASCADE, tag_id uuid FK chat_tag ON DELETE CASCADE
  PK (message_id, tag_id); org_id; INDEX (tag_id)

chat_thread_follow                              (who follows a thread, their read cursor)
  root_id uuid FK chat_message ON DELETE CASCADE, user_id uuid FK users ON DELETE CASCADE
  PK (root_id, user_id); org_id; last_read_seq bigint DEFAULT 0

chat_org_settings
  org_id uuid PK FK organizations ON DELETE CASCADE
  retention_days integer NULL       (NULL = keep; else 30..3650)
  updated_at, updated_by uuid NULL FK users SET NULL
```

The migration also seeds permissions `chat:use` and `chat:admin` and links them like
`cf52_customer_feedback._seed_permissions` does: `chat:use` → every role (`admin`,
`quality_manager`, `auditor`, `dpo`, `ciso`, `member`, `hse_manager`, `hr_manager`,
`ai_officer`); `chat:admin` → `admin`. `downgrade()` drops the chat tables and the two
permissions (guarded: refuse if `chat_message` has rows).

### 1.3 Sequence numbers (seq) — the catch-up backbone

- `chat_conversation.last_seq` is incremented by **every durable change** in the
  conversation: message created / edited / deleted, reaction added / removed, conversation
  updated / archived / unarchived, member added / removed / role changed. One statement
  in the mutating transaction: `UPDATE chat_conversation SET last_seq = last_seq + 1 …
  RETURNING last_seq` (row lock = per-conversation serialisation, cheap at chat volume).
- A new message gets `seq = change_seq = <returned value>`. Any later change to the
  message (edit, delete, reaction, new thread reply on a root) sets its `change_seq` to
  the new value. A reply also bumps its root's `change_seq` (reply_count changed).
- Every realtime event about a conversation carries that `seq` (§3.4). Read cursors and
  unread counts use the message `seq`.
- Unread for a member = top-level (`parent_id IS NULL`), non-deleted messages with `seq >
  last_read_seq` and `sender_id IS DISTINCT FROM me`. Counted per conversation, capped at
  100 (UI shows "99+").

### 1.4 Message body: markdown subset and tokens

Stored as normalised markdown text. The server **never renders HTML**; the portal renders
from a token tree without `innerHTML` (§4.6).

Allowed formatting: paragraphs and line breaks, `**bold**`, `*italic*`, `~~strike~~`,
`` `code` ``, fenced code blocks, `> quote`, bullet and numbered lists (2 levels),
`[text](https://…)`, bare `https://…` autolinks, `mailto:`. Everything else (headings,
images, tables, raw HTML) is kept as literal text and shown as plain text.

Platform tokens (markdown-link syntax with the `cf:` scheme):

| token          | syntax                                     | meaning                                   |
| -------------- | ------------------------------------------ | ----------------------------------------- |
| user mention   | `[@Kari Nordmann](cf:user/<user uuid>)`    | mention a person                          |
| team mention   | `[@HMS](cf:team/<department uuid>)`        | mention every member of a department      |
| record link    | `[](cf:record/<entity_type>/<entity uuid>)`| link to a record, rendered as a live card |
| tag            | `#hms-runde`                               | topic tag                                 |

Server normalisation on send and edit (DOM, `app/modules/chat/body.py`), in order:

1. NFC; CRLF → LF; drop control chars except `\n` and `\t`; trim; at most 2 consecutive
   blank lines. Longer than 8000 chars → 422 `body_too_long`. Empty body without
   attachments → 422 `empty_message`.
2. Ignore code spans and fenced code blocks for steps 3–5 (tokens inside code are text).
3. **Record links: the label is always rewritten to empty** (`[](cf:record/…)`), so a
   record title typed or pasted by the sender never reaches a viewer who cannot read the
   record, nor `body_text`, search, notifications or exports [D-4]. ≤ 10 distinct links
   (422 `too_many_links`). The **sender** must be able to read each linked record
   (`registry.resolve_entity`, read): else 422 `{"code": "entity_link_no_access",
   "entity_type", "entity_id"}`. Unknown entity type → 422 `unsupported_entity_type`.
   Stored in `entity_links`.
4. Mentions: user ids must be active members of the org (else 422 `invalid_mentions`);
   team ids must be departments of the org. The label is rewritten to `@<current name>`
   with `[`, `]` removed. ≤ 50 mentions. Expanded into `chat_mention` rows: mentioned
   users + members of mentioned teams, **limited to users who can read the conversation**
   (members; for public channels: any active member with `chat:use`), minus the sender.
   Mentioned users who cannot read it are returned in the response as
   `warnings: [{"code": "mention_not_member", "user_id"}]` (the UI offers "Legg til i
   samtalen") [D-5].
5. Tags: regex `(?<![\w#/])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,47})` (use the `regex` package
   semantics or an equivalent explicit Unicode class; `re` with `\w` is acceptable),
   lower-cased, NFC, ≤ 10 per message. Upsert into `chat_tag` (`use_count += 1`,
   `last_used_at`), link through `chat_message_tag`. Edits re-link (use counts are not
   decremented — they are a popularity hint, not a truth).
6. `body_text` = body with user/team tokens → `@Name`, record tokens → empty, markdown
   punctuation stripped (`*`, `_`, `~`, backticks, leading `>`), link targets dropped
   (keep the text).

Edits re-run all steps; only **newly** added mentions notify.

### 1.5 Soft delete, edit, tombstones

- Edit: author only, body only, any time while the conversation is not archived;
  `edited_at` set, shown as "(redigert)". No edit history is kept [D-6].
- Delete: sets `deleted_at`, `deleted_by`, `deleted_reason` and **scrubs content in the
  same transaction**: `body = ''`, `body_text = ''`, `entity_links = []`,
  `mention_team_ids = []`, deletes its `chat_mention`, `chat_message_tag`, `chat_reaction`
  rows, and schedules every linked attachment for purge
  (`attachment_safety.schedule_purge(att, reason="erasure", at=now)`, status `deleted`).
  The row stays as a tombstone ("Meldingen er slettet") so threads and seq stay intact.
- Who may delete: the author; a conversation `owner`/`admin` in `group`/`channel`
  (`deleted_reason='moderator'`); a `chat:admin` anywhere (`'admin'`). DMs: author or
  `chat:admin` only.

### 1.6 Retention

`chat_org_settings.retention_days` (NULL = keep forever). The daily job (§5.6) **hard
deletes** messages with `created_at < now - retention_days` in conversations without
`legal_hold`, in batches of 1000; a root whose replies are younger is scrubbed to a
tombstone (`deleted_reason='retention'`) instead and hard-deleted when its last reply
goes. Linked attachments are scheduled for purge (`reason="retention"`). Reactions,
mentions, tag links cascade. Conversations themselves are not deleted by retention.

---

## 2. REST API

Prefix `/api/v1/orgs/{org_id}/chat`. Router-level dependencies on every chat route:
`require_module("chat")` (module spec `default_enabled=True`) and
`require_permission("chat:use", "org_id")`. Admin routes add `chat:admin`. Controller →
service → DTO; services take `(session, org_id, caller: registry.Caller, …)`. Every query
filters on `org_id`; an id from another org is **404**, never 403 (no existence leak).
Conversations the caller cannot read are 404. Errors use `{"detail": {"code": …}}`.

All mutations: `audit.record(...)` in-transaction as listed in §5.5, then realtime
publish **after commit** (§3.6).

### 2.1 DTOs (`app/modules/chat/schemas.py`; portal mirrors them in `core/chat/chat.models.ts`)

```jsonc
// UserRef
{ "id": "uuid", "name": "Kari Nordmann" }            // name = full_name or email local part

// AttachmentRef
{ "id": "uuid", "filename": "bilde.jpg", "content_type": "image/jpeg",
  "size_bytes": 81234, "status": "scanning|available|quarantined|deleted",
  "is_image": true }   // is_image: content_type in image/png|jpeg|gif|webp

// ReactionSummary
{ "emoji": "👍", "count": 3, "user_ids": ["uuid", …] }   // user_ids capped at 50

// Message  — identical for every viewer (no viewer-specific fields; safe to broadcast)
{
  "id": "uuid", "conversation_id": "uuid",
  "seq": 120, "change_seq": 131,
  "parent_id": null,                      // thread root id for replies
  "client_id": "uuid|null",
  "kind": "user|system",
  "system": null | { "event": "member_added|member_removed|renamed|archived|unarchived|created",
                     "params": { "actor": UserRef, "users": [UserRef], "name": "…" } },
  "sender": UserRef | null,               // null: system or erased author
  "body": "markdown subset",              // "" when deleted
  "mentions": [{ "type": "user|team", "id": "uuid" }],
  "tags": ["hms-runde"],
  "entity_links": [{ "entity_type": "risk", "entity_id": "uuid" }],
  "attachments": [AttachmentRef],
  "reactions": [ReactionSummary],
  "reply_count": 0, "last_reply_at": null, "reply_user_ids": [],   // ≤ 3 latest repliers
  "created_at": "…", "edited_at": null,
  "deleted_at": null, "deleted_reason": null
}

// ConversationCore — identical for every viewer (broadcast in conversation.* events)
{
  "id": "uuid", "kind": "dm|group|channel", "visibility": "private|public",
  "name": "string|null", "topic": "string|null",
  "department_id": "uuid|null",
  "subject": null | { "entity_type": "risk", "entity_id": "uuid" },
  "member_count": 5, "member_preview": [UserRef],        // ≤ 4, for avatars and group names
  "dm_user_ids": ["uuid","uuid"] | null,                 // dm only
  "created_at": "…", "archived_at": null,
  "last_seq": 131, "last_message_at": "…|null"
}

// ConversationSummary = ConversationCore + viewer fields
{ …ConversationCore,
  "last_message": null | { "id", "sender": UserRef|null, "snippet": "≤140 chars of body_text",
                           "created_at", "deleted": false, "has_attachments": false },
  "me": null | { "role": "owner|admin|member", "notify_level": "all|mentions|none",
                 "last_read_seq": 120 },               // null: public channel, not a member
  "unread_count": 3, "mention_count": 1,
  "can_post": true, "can_manage": false }              // can_manage: owner/admin or chat:admin
```

`snippet` is cut from `body_text` (so record titles never appear in it).

### 2.2 Conversations

| Method & path | Body / query | Result | Rules |
| --- | --- | --- | --- |
| `GET /conversations` | `?include_archived=false` | `{ "items": ConversationSummary[] }` | caller's memberships, newest activity first, cap 500. **Lazily ensures department channels** (§5.6). |
| `GET /conversations/browse` | `?q=` (≤ 80) | `{ "items": ConversationSummary[] }` | public channels the caller is not in |
| `POST /conversations` | see below | `201 ConversationSummary` (dm get-or-create: `200` when it exists) | |
| `GET /conversations/{id}` | | `ConversationSummary` | readable only |
| `PATCH /conversations/{id}` | `{ "name"?, "topic"?, "visibility"? }` | `ConversationSummary` | `can_manage`; not dm; department channel name not editable (409 `department_channel`) |
| `POST /conversations/{id}/archive` · `/unarchive` | | `ConversationSummary` | `can_manage`; not dm; archived = read-only (posting → 409 `conversation_archived`) |
| `POST /conversations/{id}/join` | | `ConversationSummary` | public channel only |
| `POST /conversations/{id}/leave` | | `204` | not dm, not department channel (409 `department_channel`); last owner leaving promotes the oldest admin, else the oldest member |
| `PUT /conversations/{id}/me` | `{ "notify_level" }` | `ConversationSummary` | member |
| `POST /conversations/{id}/read` | `{ "seq": 131 }` | `{ "last_read_seq": 131 }` | moves forward only (`max`), clamps to `last_seq`; thread cursors are separate (§2.4) |

Create body (discriminated on `kind`):

```jsonc
{ "kind": "dm", "user_ids": ["<other uuid>"] }
{ "kind": "group", "user_ids": ["uuid", …],            // 1..49 others; creator is owner
  "name": "string|null", "subject": { "entity_type", "entity_id" } | null }
{ "kind": "channel", "name": "hms-runder", "topic": null,
  "visibility": "public|private", "user_ids": [] ,
  "subject": null }
```

- Every user id must be an active org member who holds `chat:use` (422
  `invalid_members`). DM with yourself → 422 `invalid_members`.
- `subject`: caller must read the record (`resolve_entity`) → else 404 for a record the
  caller cannot see; each member must read it too → 422 `{"code":
  "member_no_record_access", "user_ids": […]}`.
- Channel names: 1–80 chars, trimmed; duplicate live name → 409 `name_taken`.
- A system message (`kind=system`, `system.event=created`) is written as the first
  message of groups and channels.

### 2.3 Members

| Method & path | Body | Result | Rules |
| --- | --- | --- | --- |
| `GET /conversations/{id}/members` | | `{ "items": [{ "user": UserRef, "role", "joined_at", "department_ids": [] }] }` | readable |
| `POST /conversations/{id}/members` | `{ "user_ids": [], "role": "member" }` | `ConversationSummary` | `can_manage` (any member may add to a `group`); not dm; group ≤ 50; record discussion: each must read the subject; writes system message `member_added` |
| `PATCH /conversations/{id}/members/{user_id}` | `{ "role": "owner|admin|member" }` | `204` | `can_manage`; there is always ≥ 1 owner (409 `last_owner`) |
| `DELETE /conversations/{id}/members/{user_id}` | | `204` | `can_manage` (or self = leave); not dm; department channel members only via the department (409 `department_channel`); writes system message `member_removed` |

### 2.4 Messages, threads, reactions

| Method & path | Body / query | Result |
| --- | --- | --- |
| `GET /conversations/{id}/messages` | `?before_seq=&after_seq=&around_seq=&limit=50` (max 100; at most one cursor) | `{ "items": Message[] (ascending seq, top-level only), "has_more_before", "has_more_after" }` |
| `GET /conversations/{id}/messages/{mid}/thread` | `?after_seq=&limit=50` | `{ "root": Message, "items": Message[] (replies ascending), "has_more": bool, "following": bool }` |
| `POST /conversations/{id}/messages/{mid}/thread/read` | `{ "seq" }` | `204` (thread cursor in `chat_thread_follow`) |
| `PUT /conversations/{id}/messages/{mid}/thread/follow` · `DELETE` | | `204` |
| `GET /conversations/{id}/changes` | `?since_seq=N&limit=200` | `{ "items": Message[] (any message incl. replies and tombstones with change_seq > N, ascending change_seq), "conversation": ConversationSummary, "last_seq", "has_more", "reset": bool }` — `reset=true` when > 1000 changes are pending: the client drops its cache and reloads the latest page |
| `POST /conversations/{id}/messages` | `{ "client_id": "uuid", "body": "…", "parent_id": "uuid|null", "attachment_ids": [] }` | `201 { "message": Message, "warnings": [] }`; idempotent retry with the same `client_id` → `200` with the stored message |
| `PATCH /conversations/{id}/messages/{mid}` | `{ "body" }` | `{ "message": Message, "warnings": [] }` |
| `DELETE /conversations/{id}/messages/{mid}` | | `204` |
| `PUT /conversations/{id}/messages/{mid}/reactions/{emoji}` · `DELETE` | emoji URL-encoded | `204` (idempotent) |
| `GET /conversations/{id}/messages/{mid}/reactions` | | `{ "items": [{ "emoji", "users": [UserRef] }] }` |
| `GET /messages/{mid}` | | `{ "conversation_id", "seq", "parent_id" }` — deep-link locator, readable only |

Send rules: member, not archived, DM partner still active (else 409
`conversation_read_only`). `parent_id` must be a top-level, non-deleted message of the
same conversation (a reply to a reply attaches to its root). Replies: root `reply_count`,
`last_reply_at` updated; sender, root author and mentioned users get a
`chat_thread_follow` row. Top-level sends set `last_message_at`. Sending moves the
sender's own read cursor to the new seq.

Attachments at send: each id must be an `attachment` row of this org with `entity_type
="chat_conversation"`, `entity_id = <conversation id>`, `uploaded_by = sender`, status
`scanning` or `available`, not linked to another message (422 `invalid_attachments`);
≤ 10 per message.

Reactions: `emoji` 1–32 chars, must contain at least one Unicode emoji code point
(`\p{Extended_Pictographic}` or a regional-indicator pair) and no ASCII letters/digits
(422 `invalid_emoji`); ≤ 20 distinct emoji per message (422 `too_many_reactions`).
Not on deleted messages.

### 2.5 Search, tags, directory

| Method & path | Query | Result |
| --- | --- | --- |
| `GET /search` | `q` (≤ 200), `tag`, `conversation_id`, `from_user_id`, `has` (`file|image|link`), `after`, `before` (dates), `limit` (≤ 50, default 20), `cursor` | `{ "items": [{ "message": Message, "conversation": ConversationCore, "snippet": "…<mark>…</mark>…" }], "next_cursor": "opaque|null" }` |
| `GET /tags` | `q` (prefix), `limit` (≤ 20) | `{ "items": [{ "name", "display", "use_count" }] }` ordered by use_count, last_used |
| `GET /directory` | `q` (≥ 1 char), `limit` (≤ 20) | `{ "items": [{ "type": "user|team", "id", "name", "detail": "email or member count" }] }` — active members holding `chat:use` + departments |

Search covers only conversations the caller is a member of **plus public channels**;
deleted messages never match; `snippet` built from `body_text` with `ts_headline`
(`<mark>` is the only markup; the portal escapes everything else). Rate-limit bucket
`search` applies automatically (last path segment `search`).

### 2.6 Record discussions

`GET /record-conversations?entity_type=&entity_id=` → `{ "items": ConversationSummary[] }`:
404 unless the caller can read the record; returns conversations with that subject the
caller is a member of, plus public channels with that subject. Creation goes through
`POST /conversations` with `subject`.

### 2.7 Uploads (existing attachment service, no new upload code)

Entity type **`chat_conversation`** is registered as `attachable=True` (§5.1). The portal
uses the existing three-step flow unchanged:

1. `POST /api/v1/orgs/{org}/attachments` `{ entity_type: "chat_conversation", entity_id:
   <conversation id>, filename, content_type, size_bytes, sha256 }` → presigned PUT;
2. `PUT` bytes to storage; 3. `POST …/attachments/{id}/complete` (content sniffing +
   malware scan, status `scanning` → `available` | `quarantined`);
4. send the message with `attachment_ids`.

Read reach (download) = can read the conversation; edit reach (upload, complete) = member
who can post. Downloads use the existing `GET …/attachments/{id}/download` (presigned GET,
short-lived). Quarantined / deleted files are never served. A file still `scanning` is
shown as "Sjekkes …"; the message DTO reports the status at read time [D-7].

### 2.8 Admin (`chat:admin`)

| Method & path | Body / query | Result | Audit |
| --- | --- | --- | --- |
| `GET /admin/conversations` | `?kind=&q=&include_archived=` | `{ "items": (ConversationCore + { "message_count", "legal_hold" })[] }` metadata only | — |
| `PUT /admin/conversations/{id}/legal-hold` | `{ "legal_hold": bool }` | `ConversationCore` | `chat_conversation.legal_hold_set` |
| `GET /admin/settings` · `PUT` | `{ "retention_days": int|null }` (30..3650) | `{ "retention_days", "updated_at", "updated_by": UserRef|null }` | `chat_settings.updated` |
| `GET /admin/users/{user_id}/export` | | NDJSON stream (§5.4) | `chat.user_exported` |
| `POST /admin/users/{user_id}/erase` | `{ "confirm": true }` | `{ "messages_erased", "reactions_removed", "memberships_removed" }` | `chat.user_erased` |
| `GET /admin/export` | `?after=&before=` (dates, required, ≤ 366 days) | NDJSON stream | `chat.org_exported` |

`chat:admin` also passes `can_manage` on every non-dm conversation (archive, members,
moderation delete) through the normal endpoints, without being able to read private
content in the UI.

`GET /me/export` (`chat:use`) streams the caller's own messages (GDPR Art. 15/20),
audited `chat.user_exported` with `self: true`.

### 2.9 Link previews (permission-aware)

`POST /link-previews` `{ "refs": [{ "entity_type", "entity_id" }] }` (≤ 50) →

```jsonc
{ "items": [
  { "entity_type": "risk", "entity_id": "uuid", "visible": true,
    "title": "Brann i lager", "code": "RISK-12", "status": "open", "url": "/risk/risks/…",
    "module": "risk", "label_key": "modules.entities.risk" },
  { "entity_type": "deviation", "entity_id": "uuid", "visible": false }
] }
```

Resolved with `registry.resolve_entities(session, org_id, keys, caller)` — **the
viewer's** permissions, module gate and record-level visibility; anything missing,
deleted, in a disabled module or not readable is `visible: false` with no other field.
Previews are never cached server-side and never included in broadcast payloads; the
portal caches them per org for 60 s.

---

## 3. Realtime (WebSocket gateway)

Owner RT. Package `app/platform/realtime` (generic: chat is its first user; nothing in it
imports `app.modules.chat`).

### 3.1 Endpoint and handshake

- URL: `{apiBaseUrl}/v1/realtime/ws` → backend path **`/api/v1/realtime/ws`**. Portal
  builds it with `new URL(apiBaseUrl + '/v1/realtime/ws', location.href)` and swaps
  `http`→`ws`, `https`→`wss` (dev: `ws://localhost:8000/api/v1/realtime/ws`; prod:
  same-origin `wss://<host>/api/v1/realtime/ws`).
- **Mounted on the app, not on `api_router`** [D-8]: `app.add_api_websocket_route(
  f"{settings.api_v1_prefix}/realtime/ws", gateway.websocket_endpoint)` in
  `app/main.py`. Reason: `api_router` carries the router-level `enforce_api_rate_limit`
  dependency, which takes a `Request` and is not meant for WebSocket scopes; the gateway
  applies its own limits (§3.7). RT verifies `RequestContextMiddleware` passes `websocket`
  scopes through.
- **Origin check** before `accept()`: if an `Origin` header is present it must be in
  `settings.cors_origins` or equal the origin of `settings.app_base_url`; else close
  `4403`. CORS does not apply to WebSockets, so this is the CSWSH guard.
- **First-message auth with the in-memory access token** [D-9]. After `accept()` the
  client must send, within `realtime_auth_timeout_seconds` (5):

  ```json
  { "type": "auth", "token": "<access token>" }
  ```

  The server validates exactly like `get_current_user` (signature, `exp`, `type=access`,
  then ONE PK lookup of `users.is_active` + `token_version` on a short-lived session that
  is closed immediately — never hold a DB session for the life of a socket). Orgs whose
  claim has `mfa_required` are dropped. On success:

  ```json
  { "v": 1, "type": "auth.ok", "payload": { "user_id": "uuid", "connection_id": "uuid",
    "orgs": ["org uuid", …], "expires_at": "…", "server_time": "…",
    "ping_interval": 25 } }
  ```

  `orgs` = every org in the token (minus `mfa_required` ones); the socket is subscribed to
  all of them (generic gateway). Feature permissions are checked by the publisher
  (explicit recipients) and by handlers (`ctx.org_permissions`).
  Failure → `{ "type": "error", "payload": { "code": "auth_failed" } }` then close `4401`.
  No token in the URL (it would land in proxy logs); the refresh cookie is never used
  (path `/api/v1/auth` would not even be sent).
- **Re-auth**: the client sends another `auth` frame whenever `AuthService` gets a new
  access token (signal effect). The server swaps the principal (user id must match, else
  `4401`). At `exp - 60 s` the server sends `{ "type": "auth.expiring" }`; at `exp + 30 s`
  without re-auth it closes `4401`. Additionally the server re-checks `is_active` +
  `token_version` every `realtime_revalidate_seconds` (300) and closes `4401` on mismatch.
  Changed org access (role change or removal bump `tv`) therefore reaches the socket at
  the next re-auth or revalidation; recipients of chat events are computed from the
  database anyway (§3.6), so a removed member stops receiving chat content immediately.

### 3.2 Envelope

Server → client:

```jsonc
{
  "v": 1,
  "type": "chat.message.created",     // namespace "<feature>." for feature events
  "id": "uuid",                        // event id (dedupe across reconnects)
  "ts": "2026-11-19T10:00:00.000Z",
  "org_id": "uuid|null",               // null for connection-level frames
  "conversation_id": "uuid|null",      // chat convenience; generic "topic" not needed yet
  "seq": 131,                          // durable chat events only; null for ephemeral
  "payload": { … }
}
```

Client → server:

```jsonc
{ "type": "chat.typing", "id": "c-17" /* optional correlation */, "payload": { … } }
```

Replies to a command with an `id`: `{ "type": "ack", "payload": { "id": "c-17" } }` or
`{ "type": "error", "payload": { "id": "c-17", "code": "…" } }`. Max inbound frame
16 KiB (bigger → close `4400`). Text frames, JSON only.

### 3.3 Gateway frames (generic)

| direction | type | payload |
| --- | --- | --- |
| C→S | `auth` | `{ token }` |
| C→S | `ping` | `{}` — every 25 s; the server answers `pong` |
| S→C | `pong` | `{ "server_time" }` |
| S→C | `hello` | `{ "server_time", "instance": "worker id" }` — sent right after `accept()` |
| S→C | `auth.ok` / `auth.expiring` | see 3.1 |
| C→S | `presence.set` | `{ "status": "online|away" }` (away: tab hidden or idle 5 min) |
| C→S | `presence.query` | `{ "org_id", "user_ids": [] }` (≤ 200) |
| S→C | `presence.state` | `{ "org_id", "users": { "<uuid>": "online|away|offline" } }` |
| S→C | `presence.changed` | `{ "org_id", "user_id", "status" }` — to every connection of that org |
| S→C | `resync` | `{ "scope": "all" }` — the client must reload state (after Redis gap, deploy) |
| S→C | `error` | `{ "code", "id"? , "retry_after"? }` |

Server idle rule: no inbound frame for 60 s → close `4408`. Client rule: no `pong` within
10 s of a `ping` → treat the socket as dead and reconnect.

Close codes: `1000` normal · `1001` going away (deploy/shutdown; reconnect at once) ·
`1012` service restart · `1013` slow consumer (reconnect + catch-up) · `4400` bad frame ·
`4401` auth failed/expired (refresh token, then reconnect) · `4403` origin or no org
access · `4408` auth/idle timeout · `4409` too many connections (≤ 10 per user, the
oldest is closed) · `4429` rate limited (reconnect after `retry_after`).

Presence [D-10]: ephemeral, in Redis only, never in Postgres, **no "last seen"** history
(employee-monitoring sensitivity). Key per org+user: a ZSET of connection ids scored by
expiry (heartbeat refreshes, TTL 75 s). `online` if any live connection is online, `away`
if all are away, else `offline`; going offline is debounced 15 s (tab reloads do not
flap). Transitions publish `presence.changed` to the org.

### 3.4 Chat events (server → client)

All carry `org_id`, `conversation_id`, and `seq` (= conversation `last_seq` after the
change) unless marked ephemeral. Recipients are computed by DOM (§3.6).

| type | payload | recipients |
| --- | --- | --- |
| `chat.message.created` | `{ "message": Message, "root": Message|null }` (`root` = updated root for a reply) | members (non-member readers of a public channel get no push; they fetch on open) |
| `chat.message.updated` | `{ "message": Message }` (edit, attachment status change) | members |
| `chat.message.deleted` | `{ "message": Message }` (tombstone) | members |
| `chat.reaction.changed` | `{ "message_id", "parent_id", "reactions": [ReactionSummary] }` | members |
| `chat.conversation.created` | `{ "conversation": ConversationCore }` | members |
| `chat.conversation.updated` | `{ "conversation": ConversationCore }` (rename, topic, archive, member count) | members |
| `chat.conversation.member_added` | `{ "conversation": ConversationCore, "user_ids": [] }` | members incl. new ones |
| `chat.conversation.removed` | `{ "conversation_id" }` (you were removed / left) | the removed user only |
| `chat.read` | `{ "last_read_seq" }` — no seq (personal) | the reader's own connections only (multi-tab sync); **no read receipts to others** [D-11] |
| `chat.thread.read` | `{ "root_id", "last_read_seq" }` | own connections |
| `chat.typing` (ephemeral) | `{ "user": UserRef, "parent_id": "uuid|null" }` | members except the typist |
| `chat.resync` | `{ "conversation_id": "uuid|null" }` (bulk erasure / retention) | members / whole org |

Client ordering rule (per conversation, `known = last applied seq`): `seq <= known` →
ignore (duplicate); `seq == known + 1` → apply; `seq > known + 1` → apply and schedule a
debounced (300 ms) `GET …/changes?since_seq=known` to fill the gap. Events can arrive out
of order across workers; seq makes that harmless.

### 3.5 Client commands for chat (C → S)

| type | payload | server behaviour |
| --- | --- | --- |
| `chat.typing` | `{ "org_id", "conversation_id", "parent_id": null }` | member check (per-connection cache, 30 s), then ephemeral `chat.typing` fan-out; ≤ 1 per 3 s per conversation per connection, extra frames dropped silently. Clients show a typist for 6 s after the last frame. |
| `chat.focus` | `{ "org_id", "conversation_id": "uuid|null" }` | remembers which conversation is visible on this connection (Redis, TTL 75 s) — used to suppress notifications (§5.2) |

**All mutations go over REST, never over the socket** [D-12]: one code path for auth,
validation, audit, idempotency and rate limits; the socket is push + ephemeral signals.

### 3.6 Publishing API (RT provides, DOM calls)

`app/platform/realtime/publish.py`:

```python
@dataclass(frozen=True)
class RealtimeEvent:
    type: str                      # "chat.message.created"
    org_id: uuid.UUID
    payload: Mapping[str, Any]     # JSON-able (use audit.jsonable / pydantic model_dump(mode="json"))
    conversation_id: uuid.UUID | None = None
    seq: int | None = None

def publish_after_commit(session: AsyncSession, event: RealtimeEvent,
                         user_ids: Iterable[uuid.UUID]) -> None:
    """Stage; delivered only if the session's transaction commits (session.info list +
    one `after_commit` listener, like events.service's pending emails; rollback drops)."""

async def publish(event: RealtimeEvent, user_ids: Iterable[uuid.UUID]) -> None:
    """Immediate (ephemeral events, e.g. typing). Never raises: errors are logged."""

def publish_sync(event: RealtimeEvent, user_ids: Iterable[uuid.UUID]) -> None:
    """Celery / sync path (retention, erasure): Redis PUBLISH with a sync client."""

async def is_viewing(org_id: uuid.UUID, user_id: uuid.UUID,
                     conversation_id: uuid.UUID) -> bool:
    """True if a live, non-away connection of the user has this conversation focused.
    False when unknown or Redis is down."""
```

Recipients are **explicit user ids** computed by DOM in the same transaction: conversation
members joined with `memberships` (org) and `users.is_active = true` — so removed or
deactivated users never receive content. The gateway delivers an event only to sockets
of those users that are subscribed to `event.org_id`.

Command handlers (generic hook, no kernel edit) [D-13]: the gateway reads
`registry.hook("realtime_handlers")` (a plain string hook name; manifests stay
import-light). Each value is any object with:

```python
prefix: str                                       # "chat."
async def handle(ctx: ConnectionContext, frame: dict[str, Any]) -> None

class ConnectionContext(Protocol):                # provided by RT in app/platform/realtime/protocol.py
    connection_id: uuid.UUID
    user_id: uuid.UUID
    def org_permissions(self, org_id: uuid.UUID) -> frozenset[str] | None   # None: not a member
    async def send(self, type: str, payload: Mapping[str, Any], *,
                   org_id: uuid.UUID | None = None, conversation_id: uuid.UUID | None = None) -> None
    async def set_focus(self, org_id: uuid.UUID, conversation_id: uuid.UUID | None) -> None
    def allow(self, key: str, *, per_seconds: float) -> bool   # local token bucket helper
```

Handlers open their own short DB session (`app.core.database` session factory, the
canonical one) per command and close it at once; they raise nothing (errors are sent as
`error` frames by the gateway).

### 3.7 Fan-out, scale, backpressure, limits

- **Broker**: `LocalBroker` (in-process) + `RedisBroker` (`settings.redis_url`,
  `redis.asyncio`, lazily created). Publishing delivers locally first and publishes to
  Redis channel **`cf:rt:org:<org_id>`** with `{ "origin": <worker id>, "user_ids": [...],
  "event": {...envelope} }`; subscribers ignore their own `origin`. Each worker holds ONE
  pub/sub connection and SUBSCRIBEs to an org channel when its first local socket for that
  org authenticates, UNSUBSCRIBEs when the last one leaves (ref-counted).
- **Redis down**: local delivery still works (single worker = full function); cross-worker
  delivery degrades; the subscriber reconnects with backoff and, after a gap, sends
  `resync {scope: "all"}` to its local sockets. Errors log at most once a minute, like
  the rate limiter. Clients also poll `GET /conversations` every 60 s while the socket is
  not `open` (§4.1).
- **Backpressure**: one bounded outbound `asyncio.Queue` (256) per connection and one
  writer task. When full, ephemeral frames (`chat.typing`, `presence.*`) are dropped; a
  durable frame that does not fit closes the socket with `1013` (the client reconnects and
  catches up through seq).
- **Inbound limits**: ≤ 30 frames per 10 s per connection (token bucket); exceeded →
  `error {code: "rate_limited"}`, a third time within a minute → close `4429`. ≤ 10
  sockets per user (oldest closed `4409`).
- **Dev (`uvicorn --reload`, one process)**: works without Redis (LocalBroker). A reload
  kills sockets (`1012`/abnormal); the client reconnects with backoff and catches up.
  The portal on :4200 connects straight to :8000 (Origin `http://localhost:4200` is in
  `cors_origins`).
- **Production (several workers behind a load balancer)**: `uvicorn --workers N` (or
  gunicorn + uvicorn workers) — no sticky sessions needed; Redis pub/sub joins the
  workers. The LB / reverse proxy must pass `Upgrade`/`Connection` headers for
  `/api/v1/realtime/ws` and have an idle timeout ≥ 75 s (we ping every 25 s). On shutdown
  (lifespan) the gateway closes sockets with `1001` and the client reconnects at once
  (jitter 0–2 s) to another worker.
- **Settings** (RT adds to `app/core/config.py` + `.env.example`):
  `realtime_enabled: bool = True`, `realtime_auth_timeout_seconds = 5`,
  `realtime_ping_interval_seconds = 25`, `realtime_idle_timeout_seconds = 60`,
  `realtime_revalidate_seconds = 300`, `realtime_max_connections_per_user = 10`,
  `realtime_queue_size = 256`, `realtime_max_frame_bytes = 16384`. With
  `realtime_enabled=false` the endpoint closes `1013` at once and the portal stays on
  polling.

### 3.8 REST for realtime (RT, `app/platform/realtime/routes.py` via its manifest)

`GET /api/v1/orgs/{org_id}/realtime/presence?user_ids=a,b` (≤ 200, org member) →
`{ "users": { "<uuid>": "online|away|offline" } }` — fallback for the portal when the
socket is down; never errors when Redis is down (everyone `offline`).

---

## 4. Portal

Owner UI. Angular 22 standalone, zoneless, signals, OnPush, Tailwind v4, Transloco.
Follow `docs/ux-guide.md` (§1 principles, §2 anatomy, §6 writing, §9 mobile/a11y).

### 4.1 Realtime client — `src/app/core/realtime/`

`RealtimeService` (`providedIn: 'root'`), **one shared socket** for the whole app:

- `state: Signal<'idle'|'connecting'|'authenticating'|'open'|'reconnecting'|'offline'>`,
  `isOpen = computed(…)`, `events(type | prefix): Observable<RealtimeEnvelope>`,
  `send(type, payload): void` (queued while not open; ephemeral frames are dropped
  instead of queued), `reconnected: Observable<void>` (emits after every `auth.ok` that
  follows a previous connection — the catch-up trigger).
- Starts when `AuthService.isAuthenticated()` becomes true; stops (close `1000`) on
  logout. Sends `auth` with `AuthService.accessToken()` as the first frame; an `effect`
  re-sends `auth` whenever the token signal changes; on `auth.expiring` calls
  `AuthService.refresh()` (single-flight) and then re-auths; on close `4401` refreshes
  first, and on refresh failure stops (the auth interceptor owns the logout).
- **Backoff**: full jitter, `min(30 s, 1 s × 2^attempt) × random()`, reset after a socket
  stayed open 30 s; close `1001`/`1012` → retry after 0–2 s; `4429` → `retry_after`.
- `online`/`offline` window events: offline → state `offline`, no retries; online →
  connect at once. `visibilitychange`: keep the socket, send `presence.set away/online`.
- Heartbeat: `ping` every 25 s; no `pong` in 10 s → close and reconnect.
- Polling fallback while not `open` for > 10 s: the chat store polls
  `GET /conversations` every 60 s and the open conversation's `changes` every 15 s.
- URL from `APP_CONFIG.apiBaseUrl` (§3.1). Never logs tokens; Sentry gets close codes only.
- Tests: `realtime.testing.ts` with a `FakeWebSocket` (inject a `WEB_SOCKET_FACTORY`
  token so specs never open a network socket).

### 4.2 Chat state — `src/app/core/chat/`

- `chat-api.ts` (`ApiService`, endpoints of §2), `chat.models.ts` (DTOs of §2.1),
  `chat-body.ts` (token tree parser, §4.6), `chat-scope.ts`
  (`export const provideChatScope = () => provideSharedScope('chat')`),
  `chat.testing.ts` (`FakeChatApi` + fixtures for specs and for UI work before the
  backend exists).
- `ChatStore` (`providedIn: 'root'`), signals only:
  - `conversations: Signal<ConversationSummary[]>` (sorted), `byId`, `current`,
    `unreadBadge = computed(Σ unread of dm+group with notify_level ≠ none + Σ mention_count of channels)` [D-14],
    `messages(convId)` page state `{ items, hasMoreBefore, hasMoreAfter, knownSeq, loading }`,
    `thread(rootId)`, `typing(convId)`, `linkPreview(ref)` (batched + 60 s cache),
    `presence(userId)`.
  - Loads `GET /conversations` once per org after login when the `chat` module is enabled
    and the user has `chat:use`; reloads on org switch and on `RealtimeService.reconnected`
    (then `changes?since_seq` for every conversation with a loaded page whose `knownSeq <
    last_seq`, `reset` → reload the latest page).
  - Applies §3.4 events with the seq rule; ignores events of other orgs.
  - **Optimistic send**: insert a pending message with a `client_id` (uuid v4), replace it
    with the server echo (REST response or `chat.message.created`, matched by
    `client_id`); on failure mark `failed` with "Prøv igjen" (retry reuses the
    `client_id`, so no duplicates).
  - Marks read (`POST …/read` with the newest visible seq) when the conversation is
    visible and the window focused, debounced 1 s; updates unread locally at once.
  - Sends `chat.focus` on open/close of a conversation and on window blur/focus.

### 4.3 Routes

```
/chat                              list + empty pane "Velg en samtale"
/chat/:conversationId              conversation (?m=<messageId> jumps to it, ?thread=<rootId> opens the thread)
/chat/browse                       public channels to join
/settings/chat                     admin: retention, legal hold, export/erase (chat:admin)
```

`app.routes.ts`: `{ path: 'chat', title: 'modules.names.chat', canActivate:
[moduleGuard('chat'), permissionGuard('chat:use')], loadChildren: () =>
import('./features/chat/chat.routes') }`; the admin page under the settings area with
`permissionGuard('chat:admin')`. Deep links from notifications and search use
`/chat/<conversation id>?m=<message id>`.

### 4.4 Components — `src/app/features/chat/`

| component | notes |
| --- | --- |
| `chat-page` (shell) | desktop ≥ lg: three panes — list 320 px · messages · thread 380 px (when open). md: list + messages, thread as `app-slide-over`. < md: one pane at a time (list → conversation with back button → thread full-screen). No horizontal scroll at 375 px. |
| `conversation-list` | sections Direktemeldinger · Grupper · Kanaler (Team-kanaler first, then others); filter field; bold + count for unread, `@` badge for mentions; presence dot on DMs; "Ny samtale" primary button; "Finn kanaler" link. |
| `message-list` | **windowed list** [D-15]: pages of 50 loaded by `IntersectionObserver` sentinels at both ends, at most 300 messages in the DOM (the far end is trimmed), rows use `content-visibility: auto`; day separators ("I dag", "I går", "tirsdag 17. november"); consecutive messages from one sender within 5 min are grouped; "Nye meldinger" divider at the first unread; "Hopp til nyeste" pill when scrolled up and new messages arrive; jump-to (`?m=`) loads `around_seq` and highlights. |
| `message-item` | sender, time (`app-relative-time`), body (§4.6), attachments (images inline max-h 240 px with click-to-open, other files as file chips with size; "Sjekkes …" / "Blokkert" states), record cards, reactions bar, "N svar · siste for 5 min siden" thread link, "(redigert)", tombstone "Meldingen er slettet"; hover/focus actions: reager, svar i tråd, kopier lenke, rediger, slett (in an `app-overflow-menu`, delete asks with `app-confirm-dialog`). |
| `composer` | `<textarea>` with label, auto-grow (max 8 lines), Enter sends, Shift+Enter newline, ↑ in an empty composer edits the last own message, Escape cancels edit; `@` autocomplete (people + teams via `GET /directory`, reuse `shared/kit/mentions.ts` helpers) and `#` autocomplete (`GET /tags`) as an ARIA combobox (listbox, `aria-activedescendant`); format toolbar (bold, italic, code, list, link) that inserts markdown; attach button + paste/drag-drop of files (existing `core/attachments` upload flow, image thumbnails via object URLs before sending, per-file progress, remove); "Koble til post" opens the record picker; typing frames throttled to 1 per 3 s; pasted portal URLs of records (`internalLink` + `EntityTypesService`) are turned into record tokens. |
| `record-link-picker` | search records through the existing global search API (`core/search/search-api.ts`, only readable records come back), inserts `[](cf:record/<type>/<id>)`. |
| `record-card` | renders a link preview (§2.9): type icon, code, title, status badge (`app-status-badge`), opens the record; `visible:false` → muted "Ingen tilgang til denne posten". Reuse `app-entity-chip` styling. |
| `reaction-bar` + `emoji-picker` | curated set of ~60 common emoji + "nylig brukt" (localStorage per user), no new dependency [D-16]; reaction buttons are toggle buttons (`aria-pressed`, `aria-label` "Reager med 👍, 3 personer"); tooltip lists names (lazy `GET …/reactions`). |
| `thread-panel` | root message, replies (same `message-item`), its own composer; "Følg tråden"/"Slutt å følge". |
| `new-conversation-dialog` | tabs Direktemelding · Gruppe · Kanal; people picker (directory), name, visibility for channels, optional record subject (prefilled by Diskuter). |
| `conversation-header` + `member-panel` | name / topic / subject card, member count, presence; members list with roles, add/remove/role (when `can_manage`), notify level (Alle meldinger · Bare omtaler · Ingen varsler), leave, archive (overflow). |
| `typing-indicator` | "Kari skriver …", "Kari og Ola skriver …", "Flere skriver …". |
| `chat-search` | search field in the list pane: free text, `#tag` chip filter, from-person, "har fil/bilde/lenke"; results open with `?m=`. |
| `chat-admin-page` | retention (Behold meldinger i: Alltid · 30/90/180/365 dager · egendefinert), conversations table with legal hold switch, per-person "Eksporter meldinger" / "Slett meldinger" (confirm dialog typing the person's name). |

Every chat component uses `viewProviders: [provideChatScope()]` (Transloco scopes only
through `provideSharedScope()`), keys `chat.*` in `src/assets/i18n/chat/en.json` and
`nb.json` with **full parity**, natural Bokmål. Global files get only:
`modules.names.chat` ("Meldinger" / "Messages") [D-17],
`modules.descriptions.chat`, `modules.entities.chat_conversation` ("Samtale"),
`modules.entities.chat_message` ("Melding"), and the shell nav label in the `shell`
scope (`shell.nav.chat`). No vendor or model names anywhere.

### 4.5 Navigation, badge, notifications

- Old menu (`layout/nav.ts`): item "Meldinger" in the Hjem section after Mitt arbeid,
  icon `chat`, unread badge. Shell v2 (`layout/nav-v2.ts`): item after Mitt arbeid for
  every workspace (employees too). Top bar: a chat icon button with the badge next to the
  bell (`aria-label` "Meldinger, 3 uleste").
- Badge = `ChatStore.unreadBadge` ("99+" cap). Hidden when the module is off or the user
  lacks `chat:use`.
- Notification bell: chat notifications use scoped title keys `chat:notifications.*`;
  `notificationLink` must route kind `chat_message.*` / `chat_conversation.added` to
  `params.url` (`/chat/<id>?m=<mid>`); the bell must load the `chat` scope for them.
  When a chat notification arrives for the conversation that is open and focused, the
  store marks it read (`POST /me/notifications/{id}/read`).

### 4.6 Rendering the body (no innerHTML)

`chat-body.ts` uses `marked.lexer(body, { gfm: true, breaks: true })` (already a
dependency) and the `message-body` component renders the token tree with `@switch` and
Angular bindings only. Allowed nodes: paragraph, text, br, strong, em, del, codespan,
code (pre), blockquote, list/list_item (2 levels), link. Links: `http:`/`https:`/
`mailto:` open with `target="_blank" rel="noopener noreferrer"`; `cf:user/<id>` → mention
pill (current name from the directory cache, `@ukjent` if gone); `cf:team/<id>` → team
pill; `cf:record/<type>/<id>` → `record-card` (block) or inline chip in running text; any
other scheme → plain text. Headings, images, tables, html tokens → their raw text. `#tag`
in text nodes → a tag chip that opens the chat search filtered on the tag. Nothing is
ever bound with `[innerHTML]`; search snippets render `<mark>` by splitting the string,
not by HTML binding.

### 4.7 "Diskuter" on record pages

- `src/app/shared/chat/discuss-button.ts` (`app-discuss-button`, inputs `entityType`,
  `entityId`, `title`) is added by `app-record-detail-layout` in **anatomy mode** to the
  header, left of "Spør KI": a quiet button with a speech-bubble icon, label "Diskuter"
  (icon-only with `aria-label` below `sm`), with a count when the user already takes part
  in discussions of the record. It is not a primary action and does not count against
  the "≤ 2 secondary" rule [D-18]. Shown only when the chat module is on and the user
  has `chat:use`.
- Click → `app-slide-over` "Diskusjoner om <title>": `GET /record-conversations`; none →
  the new-discussion form (people picker; the record owner is preselected if they can
  read it, the server re-checks access; name optional); one or more → list, opening one
  shows the compact conversation (message list + composer, same components) inside the
  slide-over with "Åpne i Meldinger →".
- Conversations with a subject show the record card in their header; the conversation
  name falls back to the record card when no name is set.

### 4.8 Accessibility

- One visually hidden `aria-live="polite"` region per chat page announces new messages
  from others in the open conversation, throttled: at most one announcement per 3 s,
  coalesced ("3 nye meldinger i #hms") [D-19]. The message list itself is
  `role="feed"` with `aria-busy` while loading; each message an `<article>` labelled by
  sender + time. Typing indicators are not announced.
- Keyboard: Tab order list → header → messages → composer; in the list ↑/↓ moves,
  Enter opens; Escape closes the thread panel / dialogs and returns focus; message actions
  reachable by focus (not hover-only); every icon button has an `aria-label`; tap
  targets ≥ 36 px on phones.
- Colours from tokens only; presence is never conveyed by colour alone (text in tooltip
  and `aria-label`).

---

## 5. Integrations

### 5.1 Manifest (`app/modules/chat/manifest.py`, DOM)

```python
MODULES = [ModuleSpec(
    key="chat", name_key="modules.names.chat", description_key="modules.descriptions.chat",
    portal_path="chat", default_enabled=True,
    permissions={"chat:use": "Use chat: direct messages, groups and channels",
                 "chat:admin": "Administer chat: retention, legal hold, export and erasure"},
    role_grants={r: ("chat:use",) for r in ("quality_manager", "auditor", "dpo", "ciso",
                 "member", "hse_manager", "hr_manager", "ai_officer")},
)]
ENTITY_TYPES = [
  EntityTypeSpec(entity_type="chat_conversation", module="chat",
      read_permission="chat:use", write_permission="chat:use",
      resolve="app.modules.chat.resolve:resolve_conversation",
      label_key="modules.entities.chat_conversation",
      searchable=False, attachable=True, commentable=False, linkable=False,
      redacted_fields=("name", "topic")),
  EntityTypeSpec(entity_type="chat_message", module="chat",
      read_permission="chat:use", write_permission="chat:use",
      resolve="app.modules.chat.resolve:resolve_message",
      label_key="modules.entities.chat_message",
      searchable=True, attachable=False, commentable=False, linkable=False,
      redacted_fields=("body", "body_text")),
]
HOOKS = {
  HOOK_MODELS: ["app.modules.chat.models"],
  HOOK_ROUTERS: ["app.modules.chat.routes:router", "app.modules.chat.admin_routes:router"],
  HOOK_EVENT_KINDS: ["app.modules.chat.events:EVENT_KINDS"],
  HOOK_SEARCH_PROVIDERS: ["app.modules.chat.search:PROVIDERS"],
  HOOK_AI_TOOLS: ["app.modules.chat.ai_tools:TOOLS"],
  HOOK_CELERY_TASKS: ["app.modules.chat.tasks"],
  HOOK_BEAT_SCHEDULE: ["app.modules.chat.beat:BEAT_SCHEDULE"],
  "realtime_handlers": ["app.modules.chat.realtime_handlers:HANDLERS"],
}
```

Resolvers: `resolve_conversation` → readable conversation (member, or public channel) else
404; `edit=True` additionally requires membership, not archived. `EntityRef.title` =
display name for the caller (channel `#name`, group name or member names, DM other
person's name), `url="/chat/<id>"`. `resolve_message` → readable conversation + not
deleted; `title` = conversation display name, `url="/chat/<conv>?m=<id>"`. Both get a
`resolve_many`.

### 5.2 Notifications (F3, no spam)

`app/modules/chat/events.py` `EVENT_KINDS` (all `notify=True`, `timeline_key=""`,
`default_recipients=()`, `default_channels=("in_app",)`):

| kind | category | title_key | when |
| --- | --- | --- | --- |
| `chat_message.mentioned` | `mentions` | `chat:notifications.mentioned` | a user is mentioned (directly or through a team), any conversation kind, unless `notify_level='none'` |
| `chat_message.direct` | `chat` | `chat:notifications.direct` | new top-level message or reply in a `dm`/`group` where the recipient's `notify_level='all'` |
| `chat_conversation.added` | `chat` | `chat:notifications.added` | someone else added you to a group or channel (not department sync) |

Channel chatter never notifies (default `notify_level='mentions'` for channels; a user
may opt a channel into `all`, which then behaves like `chat_message.direct`). Thread
replies notify only through mentions or dm/group `all`.

Emitted with `registry.emit(session, org_id=…, kind=…, entity_type="chat_conversation",
entity_id=<conversation id>, actor_user_id=<sender>, payload=params,
recipients=Recipients(user_ids=…, include_watchers=False))`. Before emitting DOM drops
recipients who (a) are the sender, (b) `realtime.is_viewing(org, user, conversation)`,
or (c) for `chat_message.direct`: already have an **unread** notification of that kind
for the same conversation (coalescing: one bell entry per conversation until read).
F3 then applies category preferences and quiet hours.
`params`: `{ "conversation_id", "message_id", "sender_name", "conversation_name": str|null,
"kind": "dm|group|channel", "url": "/chat/<conv>?m=<mid>" }` — **no message text** in
notifications (a deleted message would live on in the bell, and digests leave the
platform by email) [D-20].

### 5.3 Global search and the assistant

- `HOOK_SEARCH_PROVIDERS`: `SearchProviderSpec(entity_type="chat_message", module="chat",
  read_permission="chat:use", search=search_messages)` — same visibility as §2.5
  (member conversations + public channels, not deleted), `title` = conversation display
  name, `snippet` from `body_text`, `url="/chat/<conv>?m=<id>"`, rank by `ts_rank`
  then recency, using `app/services/fts.py` helpers (config `simple`).
- `HOOK_AI_TOOLS` (`app/modules/chat/ai_tools.py`, read-only, `required_permission=
  "chat:use"`, `module="chat"`):
  - `chat_find_messages` `{ q?, tag?, conversation_id?, from_user?, after?, before?,
    limit ≤ 25 }` → messages (id, conversation name, sender name, created_at,
    body_text ≤ 500 chars, url) — same visibility as §2.5.
  - `chat_summarise` `{ conversation_id, root_message_id?, since? }` → the last ≤ 300
    messages / 60 000 chars of `body_text` (thread when `root_message_id`) with sender
    names and times, for the assistant to summarise. Only conversations the caller can
    read. Message text is passed as **quoted data** in the tool result
    (`{"messages": [...]}`), never concatenated into instructions; the tool description
    says so (prompt-injection hygiene).
  - Tool results cite each message as a source with its chat URL.
  - Tests use the existing fake model client — never the network.

### 5.4 GDPR export and erasure

- **Export** (`app/modules/chat/gdpr.py`): NDJSON (`application/x-ndjson`), streamed in
  batches of 500 with a server-side cursor on its own session. Lines:
  `{"type":"meta", org_id, user_id|null, generated_at, range}`, then
  `{"type":"conversation", id, kind, name, created_at}` (once per conversation touched),
  `{"type":"message", id, conversation_id, parent_id, sender_id, sender_name, created_at,
  edited_at, deleted_at, body, tags, entity_links, attachments:[{id, filename,
  content_type, size_bytes, sha256}]}`, `{"type":"reaction", message_id, emoji,
  created_at}` (user exports: the user's own reactions). Attachments are listed, not
  inlined (they are downloadable through the attachment API). Filename
  `chat-export-<org>-<user|org>-<date>.ndjson`. User export = messages the user authored
  + their reactions; org export = everything in the date range.
- **Erasure** `erase_user_messages(session, org_id, user_id, actor) -> ErasureResult`:
  every message authored by the user in the org is scrubbed as in §1.5 with
  `deleted_reason='erasure'` **and `sender_id = NULL`**; their reactions, mentions,
  thread follows and memberships in the org are deleted (DMs become read-only); attached
  files are purged now (`schedule_purge(reason="erasure", at=now)`, then
  `attachment_safety.enqueue_purge(org_id)` after commit). Set-based UPDATE/DELETE
  statements (no per-row Python loop). Afterwards `publish_after_commit(chat.resync)` to
  members of affected conversations. Audited `chat.user_erased` with counts only.
- Both functions are public, so a future platform-wide data-subject request (no such
  hook exists today) can call them.

### 5.5 Audit (`audit.record` in the same transaction)

`entity_type` / `action`:

- `chat_conversation`: `chat_conversation.created`, `.updated` (changed markers for
  name/topic/visibility), `.archived`, `.unarchived`, `.member_added`,
  `.member_removed` (`after: {"user_id", "by_admin": bool}`), `.member_role_changed`,
  `.legal_hold_set`.
- `chat_message`: `chat_message.deleted` (author), `chat_message.deleted_by_moderator`,
  `chat_message.deleted_by_admin` — never the body.
- `chat_settings`: `chat_settings.updated` (`before/after: {"retention_days"}`).
- `chat`: `chat.user_exported`, `chat.org_exported`, `chat.user_erased`,
  `chat.retention_applied` (system actor, counts only).

**Documented exception** [D-21]: sending, editing and reacting are not audited one by
one — the chat tables are their own history (`created_at`, `edited_at`, `sender_id`),
and copying every message into the append-only audit log would duplicate personal data
there where erasure cannot reach it. Name/topic/body keys are listed in
`redacted_fields` so `record()` masks them anyway.

### 5.6 Jobs and department sync

- Beat (`app/modules/chat/beat.py`): `chat.apply_retention` daily 02:30 UTC;
  `chat.sync_department_channels` daily 03:00 UTC (reconcile safety net).
- Tasks (`app/modules/chat/tasks.py`, sync session `get_sync_session()`):
  `chat.apply_retention` (§1.6; one `chat.retention_applied` audit per org with
  deletions; then `publish_sync(chat.resync)` per affected org),
  `chat.sync_department_channels`.
- Department channels: `ensure_department_channels(session, org_id)` creates missing
  channels and reconciles members (add department members holding `chat:use`; remove
  users no longer in the department; lead → `admin`); renaming the department renames the
  channel; deleting a department archives its channel. Called (a) from `GET
  /conversations` when the org has departments without a channel (cheap existence
  query), (b) by DOM's small edit in `app/services/department_service.py` after each
  department create/rename/delete and member add/remove (lazy import inside the function,
  same transaction), (c) by the nightly reconcile.

### 5.7 Rate limits

- REST send/edit (`POST`/`PATCH` messages): chat rule `chat_send` = 20 per 10 s per
  user (fail open), built with `rate_limit.Rule` and `RateLimiterDep` inside the chat
  module → 429 `{"code": "rate_limited", "retry_after"}`. Reactions: `chat_react` 60 per
  60 s. Conversation creation: `chat_create` 20 per hour. The general 600/min bucket
  applies on top; `/search` and `export` routes get the existing buckets automatically.
- Socket limits: §3.7.

---

## 6. Work split and file ownership

Three engineers in parallel worktrees, then one integration step. **Nobody edits a file
another stream owns.** Shared contracts are this document; each stream stubs the others.

### 6.1 RT — realtime gateway (coreflow-core)

Owns:
- `app/platform/realtime/__init__.py`, `manifest.py` (HOOK_ROUTERS for §3.8 only),
  `protocol.py` (envelope models, close codes, `ConnectionContext`), `auth.py`
  (first-message auth, revalidation), `gateway.py` (endpoint, connection loop, writer,
  heartbeat, limits, Origin check), `broker.py` (Local + Redis), `presence.py`,
  `publish.py` (§3.6 API, exactly these signatures), `handlers.py` (dispatch from
  `registry.hook("realtime_handlers")`), `routes.py`.
- `app/main.py`: mount the websocket route; lifespan shutdown closes sockets (`1001`) and
  the broker.
- `app/core/config.py` + `.env.example`: the `realtime_*` settings.
- `tests/platform/realtime/` (Starlette `TestClient.websocket_connect`; LocalBroker; a
  fake Redis pub/sub object for broker tests — **no real Redis, no network**).

Delivers: auth/re-auth/expiry, ping/pong, presence, typing passthrough via a test
handler, after-commit publishing (rollback drops), per-org subscription ref-counting,
backpressure behaviour, Origin check, close codes. Must not import `app.modules.chat`.

### 6.2 DOM — chat domain, REST, integrations (coreflow-core)

Owns:
- `app/modules/chat/**`: `manifest.py`, `models.py`, `schemas.py`, `body.py` (§1.4),
  `service.py` / `conversations.py` / `messages.py` (split as it likes), `resolve.py`,
  `routes.py`, `admin_routes.py`, `search.py`, `ai_tools.py`, `events.py`,
  `gdpr.py`, `retention.py`, `departments.py`, `beat.py`, `tasks.py`,
  `realtime_bridge.py`, `realtime_handlers.py`.
- `alembic/versions/cf200_chat.py`.
- `app/services/department_service.py` (only the calls of §5.6 b).
- `tests/modules/chat/**`.

Stubbing RT: all realtime calls go through `app/modules/chat/realtime_bridge.py`, which
imports `app.platform.realtime.publish` **lazily inside each function** and becomes a
no-op (`is_viewing → False`) on `ImportError`. Tests monkeypatch the bridge to capture
published events and assert type, payload, seq and recipients. `realtime_handlers.py`
implements `chat.typing` / `chat.focus` against the `ConnectionContext` protocol of §3.6
duck-typed (no import of RT code at module level); its tests use a fake context.

### 6.3 UI — portal (coreflow-portal)

Owns:
- `src/app/core/realtime/**`, `src/app/core/chat/**`, `src/app/features/chat/**`,
  `src/app/shared/chat/**` (discuss button + slide-over).
- `src/assets/i18n/chat/en.json`, `nb.json`; the global/`shell` keys listed in §4.4
  (en + nb).
- Edits: `src/app/app.routes.ts` (chat route), settings routes (admin page),
  `src/app/layout/nav.ts`, `nav-v2.ts`, top bar (chat button + badge),
  `src/app/shared/kit/record-detail-layout.ts` (discuss button in anatomy header),
  `src/app/core/notifications/notification-text.ts` (link + scope for chat kinds).
- Specs next to each piece; `chat.testing.ts` + `realtime.testing.ts` fakes let the UI be
  built and tested with no backend. Screenshots nb at 1440 px and 390 px of: list +
  conversation, thread open, composer autocomplete, Diskuter slide-over.

### 6.4 Integration step (after the three merge)

1. Re-chain `cf200_chat` onto the head; run the full core gate.
2. Remove nothing from the bridge (the fallback stays harmless) but add one integration
   test that the real `publish_after_commit` is called with the documented recipients.
3. End-to-end smoke in the cf-test Docker harness: Postgres + Redis + **two** uvicorn
   workers behind one port (or two ports): user A on worker 1 sends, user B on worker 2
   receives `chat.message.created` with the right seq; kill worker 2 → B reconnects to
   worker 1 and catches up through `changes`; typing and presence cross workers.
4. Portal against the real API (dev): DM, group, channel, department channel, mention →
   bell, image + PDF upload (scan states), record link visible vs `visible:false` for a
   user without access, reactions, thread, edit/delete, unread badge, Diskuter on a risk
   page, offline/online toggle, 375 px layout.
5. Update `CLAUDE.md` of both repos with a short "Chat / realtime" paragraph (endpoint,
   auth, publish API, deploy notes for the LB) — owned by the integrator.

---

## 7. Limits, error codes and test rules

| Limit | Value |
| --- | --- |
| body | 8000 chars after normalisation |
| attachments / message | 10 (size/type limits of the attachment service apply) |
| record links / message | 10 |
| mentions / message | 50 |
| tags / message | 10, each 1–48 chars |
| group members | 50 (incl. creator) |
| channel name / topic | 80 / 250 |
| distinct reactions / message | 20 |
| page size | messages 50 (max 100), changes 200, search 20 (max 50) |
| conversations list | 500 |
| sockets per user | 10 |

Error codes (422 unless noted): `body_too_long`, `empty_message`, `too_many_links`,
`entity_link_no_access`, `unsupported_entity_type`, `invalid_mentions`,
`invalid_members`, `member_no_record_access`, `invalid_attachments`, `invalid_emoji`,
`too_many_reactions`, `invalid_cursor`; 409 `name_taken`, `conversation_archived`,
`conversation_read_only`, `department_channel`, `last_owner`; 429 `rate_limited`;
404 for anything not readable (incl. other orgs).

Tests (lean): backend `cf-test.ps1 -Quick -Tests tests/modules/chat` (DOM) and
`tests/platform/realtime` (RT) during development, full gate once before reporting.
Must-have backend cases: org isolation (every endpoint, 404 across orgs), private
conversation invisible to non-members, public channel readable before join, link preview
`visible:false` for a record the viewer cannot read (and no title in body/body_text/
snippet/notification/export), mention expansion limited to readers, idempotent send,
seq monotonic + `changes` catch-up incl. tombstones, delete scrubs content and schedules
attachment purge, erasure, retention with legal hold, notification coalescing and
"channel chatter does not notify", rate limit 429, audit rows for admin actions, socket
auth failure/expiry/re-auth, rollback publishes nothing. Portal: `npm run lint`,
`npm test` (specs for realtime backoff/heartbeat/re-auth with the fake socket, store seq
rule and optimistic send, body renderer token tree incl. hostile input, composer
autocomplete), `npm run build`; `npx prettier --write` on changed files only. Tests never
hit the network or a model.

---

## 8. Decisions log

- **D-1** Teams = departments; one private channel per department, members synced, lead
  is channel admin; no automatic org-wide "everyone" channel (admins can create a public
  channel instead) — avoids a 500-member channel nobody asked for.
- **D-2** "Diskuter" creates a normal group/channel with a record subject; every member
  must be able to read the record; the record title is never stored on the conversation.
- **D-3** `chat:admin` manages metadata and moderation but cannot read private content in
  the UI; content leaves only through the audited export.
- **D-4** Record-link labels are rewritten to empty on save, so titles never leak to
  readers without access (previews are resolved per viewer).
- **D-5** Mentioning someone who cannot read the conversation does not notify them; the
  sender gets a warning and an "add to conversation" offer.
- **D-6** No edit history (privacy, simplicity); "(redigert)" marker only.
- **D-7** No server thumbnails; images display from the presigned original; scan status is
  read at fetch time (no push on scan completion in v1).
- **D-8** The WebSocket route is mounted directly on the app (not `api_router`) so the
  REST rate-limit dependency does not run on WS scopes; the gateway has its own limits.
- **D-9** First-frame auth with the in-memory access token (no ticket service, no token
  in URLs, no reliance on the refresh cookie); re-auth on every token refresh; periodic
  revalidation of `is_active` + `token_version`.
- **D-10** Presence is ephemeral (Redis, TTL), no last-seen history.
- **D-11** No read receipts to other users in v1 (privacy); read state syncs only across
  the reader's own tabs.
- **D-12** All mutations over REST; the socket carries push and ephemeral signals only.
- **D-13** Command handlers register through the free-form hook name
  `"realtime_handlers"`; the kernel registry file is not edited.
- **D-14** Nav badge = unread in DMs and groups + mentions in channels; channel chatter
  only makes the channel bold.
- **D-15** Windowed list with IntersectionObserver + `content-visibility` instead of CDK
  virtual scroll (variable-height, bottom-anchored chat rows are a poor fit for the CDK
  fixed-size strategy).
- **D-16** Curated emoji set, no emoji library dependency.
- **D-17** Nav label "Meldinger" (nb) / "Messages" (en): plainer for beginners than
  "Chat".
- **D-18** "Diskuter" is a quiet header button in the anatomy header, outside the
  primary/secondary count, because it is platform-wide and not a record lifecycle action.
- **D-19** One throttled polite live region instead of a live message list (a busy
  channel would otherwise flood screen readers).
- **D-20** Notifications carry no message text.
- **D-21** Individual messages, edits and reactions are not copied into the audit log;
  admin and lifecycle actions are.
- **D-22** Thread replies never nest; a reply to a reply attaches to the root.
- **D-23** Retention hard-deletes (tombstone only while younger replies exist); deletes by
  users are soft with immediate content scrubbing.

### 8.1 Deviations from this design in the shipped code (logged 2026-11-23)

The chat shipped as designed except for these two points, found and decided during the
integration step (core `ed4a7f2`, portal `96499ff4`). The code is the reference; the
sections above are left as written so the original intent stays readable.

- **D-24 Typing guard: server 1 s, client 3 s** (changes §3.5 and §4.4 composer). §3.5 says
  the server drops more than one `chat.typing` per 3 s per conversation per connection.
  Shipped: the server guard is a 1 s flood guard (`TYPING_INTERVAL = 1.0` in
  `app/modules/chat/realtime_handlers.py`); the 3 s throttle lives in the client
  (`ChatStore.notifyTyping`), and the client restarts its throttle after each sent message.
  Why: with a 3 s server guard, the first "typing" frame of the next message (sent right
  after a send) was silently swallowed, so the others did not see "Kari skriver …" for
  follow-up messages. The client throttle keeps the normal rate at one frame per 3 s; the
  server guard only stops floods.
- **D-25 "Diskuter" on every record detail page, not only anatomy mode** (changes §4.7 and
  D-18). §4.7 adds `app-discuss-button` to the header in anatomy mode only. Shipped:
  `app-record-detail-layout` renders it in the `[secondary]` slot for every record page
  (anatomy and classic layouts), left of "Spør KI"; it still hides itself without the chat
  module or `chat:use`, and it still does not count against the "≤ 2 secondary" rule.
  Why: most record pages were not yet on the anatomy layout, so a discussion could only be
  started from a minority of records; one consistent place on every record page is easier
  to learn.

Related, not a deviation of the chat itself: with IA v2 (`docs/ia-v2.md` W9/W10) the chat
is reached from the top-bar **inbox** (tab "Meldinger", unread count in the inbox badge);
the separate chat button of §4.5 is retired. The badge rule of D-14 is unchanged.

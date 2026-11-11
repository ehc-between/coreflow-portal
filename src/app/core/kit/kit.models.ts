/**
 * Record-kit DTOs: entity links, comments, revisions (coreflow-core
 * `app/platform/kit/schemas.py`, platform contracts 11.3), the activity
 * timeline (F3, contracts 6.6) and global search hits (F5, contracts 8.1).
 * All endpoints live under `v1/orgs/{org_id}`.
 */
import { EntityRefDto, UserRef } from '../entities/entity.models';

/** The typed relationships between two records. */
export const LINK_TYPES = [
  'relates_to',
  'caused_by',
  'mitigates',
  'evidence_for',
  'supersedes',
  'implements',
  'derived_from',
] as const;

export type LinkType = (typeof LINK_TYPES)[number];

/** Whether the viewed record is the link's source (`outgoing`) or its target. */
export type LinkDirection = 'outgoing' | 'incoming';

/** One link as seen from the record it is listed for. */
export interface LinkItem {
  readonly id: string;
  readonly link_type: string;
  readonly direction: LinkDirection;
  readonly other: EntityRefDto;
  readonly created_at: string;
  readonly created_by: UserRef | null;
}

export interface LinkList {
  readonly items: readonly LinkItem[];
}

/** Body of `POST links` (edit access on the source, read access on the target). */
export interface CreateLinkRequest {
  readonly source_type: string;
  readonly source_id: string;
  readonly target_type: string;
  readonly target_id: string;
  readonly link_type: string;
}

/** Maximum comment length accepted by the backend. */
export const COMMENT_MAX_LENGTH = 10_000;
/** Maximum number of users one comment may mention. */
export const COMMENT_MAX_MENTIONS = 50;

export interface CommentItem {
  readonly id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  /** The comment this one replies to; null for a thread start (or an orphaned reply). */
  readonly parent_id: string | null;
  readonly author: UserRef | null;
  readonly body: string;
  readonly mentions: readonly UserRef[];
  readonly created_at: string;
  readonly edited_at: string | null;
  readonly can_edit: boolean;
  readonly can_delete: boolean;
}

export interface CommentList {
  readonly items: readonly CommentItem[];
}

/** Body of `POST comments` (read access on the record is enough). */
export interface CreateCommentRequest {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly body: string;
  readonly parent_id?: string | null;
  readonly mentions?: readonly string[];
}

/** Body of `PATCH comments/{id}` (author only). `mentions`, when given, replaces the list. */
export interface UpdateCommentRequest {
  readonly body: string;
  readonly mentions?: readonly string[];
}

export type ActorKind = 'user' | 'ai' | 'system';

export interface RevisionActor {
  readonly user_id: string | null;
  readonly name: string | null;
  readonly kind: ActorKind | string;
}

export interface RevisionSummary {
  readonly id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly revision_no: number;
  readonly changed_fields: readonly string[];
  readonly change_reason: string | null;
  readonly actor: RevisionActor;
  readonly created_at: string;
}

export interface RevisionDetail extends RevisionSummary {
  readonly snapshot: Readonly<Record<string, unknown>>;
}

export interface RevisionList {
  readonly items: readonly RevisionSummary[];
}

export interface FieldChange {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

/** `GET revisions/compare?from_id&to_id`. */
export interface RevisionCompare {
  readonly from: RevisionSummary;
  readonly to: RevisionSummary;
  readonly changes: readonly FieldChange[];
}

/** One activity entry: a domain event or (with `include_audit`) an audit row. */
export interface TimelineItem {
  readonly id: string;
  readonly source: 'event' | 'audit';
  /** Event kind (`comment.created`) or audit action (`deviation.updated`). */
  readonly kind: string;
  /** `"<scope>:<key>"` for events whose kind declares a timeline text, else null. */
  readonly label_key: string | null;
  readonly created_at: string;
  readonly actor: RevisionActor | null;
  /** Event payload plus `actor_name`. */
  readonly params: Readonly<Record<string, unknown>>;
  /** Audit summary (audit items only). */
  readonly summary: string | null;
  readonly changes: readonly FieldChange[] | null;
}

/** `GET timeline?entity_type&entity_id&limit&before&include_audit`. */
export interface TimelinePage {
  readonly items: readonly TimelineItem[];
  /** Cursor for the next (older) page, or null at the end. */
  readonly next_before: string | null;
}

/** One global search hit (F5). */
export interface SearchHit {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code?: string | null;
  readonly snippet?: string | null;
  readonly url?: string | null;
  readonly module?: string | null;
  readonly label_key?: string | null;
}

/** `GET search?q&types&limit`. */
export interface SearchResponse {
  readonly items: readonly SearchHit[];
  readonly counts?: Readonly<Record<string, number>>;
}

/** A user who can be @mentioned in a comment. */
export interface MentionCandidate {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
}

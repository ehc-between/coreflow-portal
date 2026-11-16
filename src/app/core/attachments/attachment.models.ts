/**
 * Attachment / evidence DTOs, mirroring coreflow-core's `app/schemas/attachment.py`.
 * All endpoints live under `v1/orgs/{org_id}/attachments`.
 */

/**
 * Parent record kind an attachment hangs off: the built-in `document`,
 * `deviation`, `deviation_action` and `standard`, or any registered entity type
 * marked attachable (max 32 chars; the backend answers 422 for others).
 */
export type AttachmentEntityType = string;

/**
 * Lifecycle: `pending` (registered, bytes not confirmed) → `scanning` (malware
 * scan running in the worker) → `available` (clean, downloadable) or
 * `quarantined` (malware found, never downloadable). `deleted` is a soft delete;
 * the stored bytes are purged after the retention grace period unless on legal
 * hold.
 */
export type AttachmentStatus = 'pending' | 'scanning' | 'available' | 'quarantined' | 'deleted';

export interface Attachment {
  readonly id: string;
  readonly org_id: string;
  readonly entity_type: AttachmentEntityType;
  readonly entity_id: string;
  readonly filename: string;
  readonly content_type: string;
  readonly size_bytes: number;
  /** Hex SHA-256 of the file bytes. */
  readonly sha256: string;
  readonly status: AttachmentStatus;
  readonly uploaded_by: string | null;
  readonly uploaded_by_name: string | null;
  readonly created_at: string;
  readonly completed_at: string | null;
  /** When the malware scan finished (null while pending / scanning). */
  readonly scanned_at?: string | null;
  /** Scanner verdict detail: `builtin`, `clamd` or, when quarantined, the signature name. */
  readonly scan_result?: string | null;
  /** A held file is never purged (litigation / investigation). */
  readonly legal_hold?: boolean;
  /** When the stored bytes become due for permanent deletion (soft-deleted files). */
  readonly purge_after?: string | null;
  /** When the stored bytes were permanently deleted. */
  readonly purged_at?: string | null;
}

/** Body of `PUT attachments/{id}/legal-hold` (`org:manage`). */
export interface LegalHoldRequest {
  readonly legal_hold: boolean;
}

/** Why an attachment's stored bytes were permanently deleted. */
export type AttachmentDeletionReason = 'erasure' | 'retention' | 'quarantine' | 'rejected';

/**
 * One row of the attachment deletion log (`GET attachment-deletions`,
 * `audit:read`). Deliberately carries no filename or storage key, only a hash
 * of the key.
 */
export interface AttachmentDeletion {
  readonly id: string;
  readonly attachment_id: string | null;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly object_key_sha256: string;
  readonly versions_deleted: number;
  readonly reason: AttachmentDeletionReason;
  readonly actor_user_id: string | null;
  readonly deleted_at: string;
}

/** `GET attachment-deletions?limit&offset`, newest first. */
export interface AttachmentDeletionList {
  readonly items: readonly AttachmentDeletion[];
  readonly total: number;
}

/** Body of `POST attachments`. */
export interface CreateAttachmentRequest {
  readonly entity_type: AttachmentEntityType;
  readonly entity_id: string;
  readonly filename: string;
  readonly content_type: string;
  readonly size_bytes: number;
  /** 64 hex chars. */
  readonly sha256: string;
}

/** A presigned direct-to-storage request. EVERY header must be sent verbatim. */
export interface PresignedUpload {
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: Readonly<Record<string, string>>;
  readonly expires_at: string;
}

export interface CreateAttachmentResponse {
  readonly attachment: Attachment;
  readonly upload: PresignedUpload;
}

/** `GET attachments/{id}/download` — a short-lived (60 s) presigned GET URL. */
export interface AttachmentDownload {
  readonly url: string;
  readonly filename: string;
  readonly expires_at: string;
}

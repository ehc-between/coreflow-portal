/**
 * Attachment / evidence DTOs, mirroring coreflow-core's `app/schemas/attachment.py`.
 * All endpoints live under `v1/orgs/{org_id}/attachments`.
 */

/** Parent record kinds an attachment can hang off. */
export type AttachmentEntityType = 'document' | 'deviation' | 'deviation_action' | 'standard';

export type AttachmentStatus = 'pending' | 'available' | 'deleted';

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

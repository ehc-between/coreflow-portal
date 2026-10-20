import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concat, defer, from, map, of, switchMap, throwError } from 'rxjs';
import { errorCodeOf } from '../documents/document-errors';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { ApiService } from '../http/api.service';
import {
  Attachment,
  AttachmentDownload,
  AttachmentEntityType,
  CreateAttachmentRequest,
  CreateAttachmentResponse,
} from './attachment.models';
import { UploadPhase, contentTypeFor, sha256Hex } from './attachment-utils';
import { StorageUploadClient, StorageUploadError } from './storage-upload';

/**
 * Attachment failures are shown in place by the attachments UI (per file, with
 * retry), so the generic error toast is suppressed. 5xx/network failures are
 * still reported to monitoring by the error interceptor.
 */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** Progress events emitted by {@link AttachmentsApi.upload}. */
export type UploadEvent =
  | { readonly kind: 'hashed'; readonly sha256: string }
  | { readonly kind: 'created'; readonly created: CreateAttachmentResponse }
  | { readonly kind: 'progress'; readonly loaded: number; readonly total: number }
  | { readonly kind: 'completing' }
  | { readonly kind: 'done'; readonly attachment: Attachment };

/** Where an upload failed, with enough state to resume it. */
export class AttachmentUploadError extends Error {
  constructor(
    readonly phase: UploadPhase,
    readonly status: number,
    /** The pending attachment + upload URL, once created — lets a retry skip create. */
    readonly created: CreateAttachmentResponse | null = null,
    /** The backend's machine-readable error code (e.g. `deviation_closed`), if any. */
    readonly code: string | null = null,
  ) {
    super(`Attachment upload failed at ${phase} (${status})`);
    this.name = 'AttachmentUploadError';
  }
}

/** What a resumed upload can skip: an already computed hash and/or created row. */
export interface UploadResume {
  readonly sha256?: string;
  readonly created?: CreateAttachmentResponse | null;
}

function statusOf(error: unknown): number {
  if (error instanceof HttpErrorResponse || error instanceof StorageUploadError) {
    return error.status;
  }
  return 0;
}

/**
 * Org-scoped attachments / evidence API (coreflow-core#6). Metadata calls go
 * through ApiService (bearer + base URL); the file bytes go straight to object
 * storage via {@link StorageUploadClient}, never through our interceptors.
 * Permission is enforced server-side against the PARENT record (documents:* /
 * deviations:* plus per-record reach).
 */
@Injectable({ providedIn: 'root' })
export class AttachmentsApi {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageUploadClient);

  /** Available attachments on a record, oldest first. */
  list(
    orgId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Observable<Attachment[]> {
    return this.api.get<Attachment[]>(`v1/orgs/${orgId}/attachments`, {
      ...IN_PLACE,
      params: { entity_type: entityType, entity_id: entityId },
    });
  }

  /** Register a pending attachment and get a presigned upload request. */
  create(orgId: string, body: CreateAttachmentRequest): Observable<CreateAttachmentResponse> {
    return this.api.post<CreateAttachmentResponse>(`v1/orgs/${orgId}/attachments`, body, IN_PLACE);
  }

  /** Verify the uploaded object and mark the attachment available. */
  complete(orgId: string, attachmentId: string): Observable<Attachment> {
    return this.api.post<Attachment>(
      `v1/orgs/${orgId}/attachments/${attachmentId}/complete`,
      {},
      IN_PLACE,
    );
  }

  /** A short-lived (60 s) download URL — request on click, use immediately. */
  download(orgId: string, attachmentId: string): Observable<AttachmentDownload> {
    return this.api.get<AttachmentDownload>(
      `v1/orgs/${orgId}/attachments/${attachmentId}/download`,
      IN_PLACE,
    );
  }

  /** Soft-delete an attachment (204). */
  delete(orgId: string, attachmentId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/attachments/${attachmentId}`, IN_PLACE);
  }

  /**
   * The full upload handshake for one file: SHA-256 in the browser → create →
   * PUT to storage (with progress) → complete. Unsubscribing cancels (aborts the
   * PUT). Fails with {@link AttachmentUploadError}; pass its `created` (and the
   * hash) back via `resume` to retry without re-registering the file.
   */
  upload(
    orgId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    file: File,
    resume: UploadResume = {},
  ): Observable<UploadEvent> {
    const hash$: Observable<string> = resume.sha256
      ? of(resume.sha256)
      : defer(() => from(sha256Hex(file))).pipe(
          catchError(() => throwError(() => new AttachmentUploadError('hash', 0))),
        );

    return hash$.pipe(
      switchMap((sha256) => {
        const created$: Observable<CreateAttachmentResponse> = resume.created
          ? of(resume.created)
          : this.create(orgId, {
              entity_type: entityType,
              entity_id: entityId,
              filename: file.name,
              content_type: contentTypeFor(file),
              size_bytes: file.size,
              sha256,
            }).pipe(
              catchError((e: unknown) =>
                throwError(
                  () => new AttachmentUploadError('create', statusOf(e), null, errorCodeOf(e)),
                ),
              ),
            );

        return concat(
          of<UploadEvent>({ kind: 'hashed', sha256 }),
          created$.pipe(switchMap((created) => this.transfer(orgId, file, created))),
        );
      }),
    );
  }

  /** PUT the bytes, then complete — both failures carry `created` for resume. */
  private transfer(
    orgId: string,
    file: File,
    created: CreateAttachmentResponse,
  ): Observable<UploadEvent> {
    const put$ = this.storage.put(created.upload, file).pipe(
      map((p): UploadEvent => ({ kind: 'progress', loaded: p.loaded, total: p.total })),
      catchError((e: unknown) =>
        throwError(() => new AttachmentUploadError('upload', statusOf(e), created)),
      ),
    );
    const complete$ = this.complete(orgId, created.attachment.id).pipe(
      map((attachment): UploadEvent => ({ kind: 'done', attachment })),
      catchError((e: unknown) =>
        throwError(
          () => new AttachmentUploadError('complete', statusOf(e), created, errorCodeOf(e)),
        ),
      ),
    );
    return concat(
      of<UploadEvent>({ kind: 'created', created }),
      put$,
      of<UploadEvent>({ kind: 'completing' }),
      complete$,
    );
  }
}

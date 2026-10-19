import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PresignedUpload } from './attachment.models';

/** Builds the XMLHttpRequest used for direct-to-storage uploads (overridable in tests). */
export const STORAGE_XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>('STORAGE_XHR_FACTORY', {
  providedIn: 'root',
  factory: () => () => new XMLHttpRequest(),
});

export interface StorageUploadProgress {
  readonly loaded: number;
  readonly total: number;
}

/** A failed direct-to-storage PUT. `status` is 0 for network/CORS failures. */
export class StorageUploadError extends Error {
  constructor(readonly status: number) {
    super(`Storage upload failed (${status})`);
    this.name = 'StorageUploadError';
  }
}

/**
 * Sends file bytes straight to object storage using a presigned URL.
 *
 * This deliberately does NOT go through ApiService / HttpClient:
 *  - the presigned URL is a third-party (S3) origin, so the auth interceptor must
 *    never attach our bearer token to it, and no cookies may be sent
 *    (`withCredentials = false`);
 *  - the signature covers the exact header set, so nothing may be added or
 *    rewritten — only `upload.headers` are sent, verbatim;
 *  - storage errors are handled in place by the attachments UI, not by the
 *    global error interceptor's toasts/Sentry reports for our own API.
 * A raw XMLHttpRequest is used (rather than fetch) because it reports upload
 * progress; unsubscribing aborts the request (cancel).
 */
@Injectable({ providedIn: 'root' })
export class StorageUploadClient {
  private readonly createXhr = inject(STORAGE_XHR_FACTORY);

  /** PUT `body` to `upload.url`; emits progress, completes on a 2xx response. */
  put(upload: PresignedUpload, body: Blob): Observable<StorageUploadProgress> {
    return new Observable<StorageUploadProgress>((subscriber) => {
      const xhr = this.createXhr();
      let finished = false;
      xhr.open(upload.method, upload.url);
      xhr.withCredentials = false;
      for (const [name, value] of Object.entries(upload.headers)) {
        xhr.setRequestHeader(name, value);
      }
      xhr.upload.onprogress = (event: ProgressEvent) => {
        subscriber.next({
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : body.size,
        });
      };
      xhr.onload = () => {
        finished = true;
        if (xhr.status >= 200 && xhr.status < 300) {
          subscriber.next({ loaded: body.size, total: body.size });
          subscriber.complete();
        } else {
          subscriber.error(new StorageUploadError(xhr.status));
        }
      };
      xhr.onerror = () => {
        finished = true;
        subscriber.error(new StorageUploadError(0));
      };
      xhr.send(body);
      return () => {
        if (!finished) {
          xhr.abort();
        }
      };
    });
  }
}

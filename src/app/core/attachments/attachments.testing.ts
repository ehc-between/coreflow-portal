import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { HttpRequest } from '@angular/common/http';
import { Attachment } from './attachment.models';

/** Test-only helpers shared by the attachments specs (not used by app code). */

/** Minimal XMLHttpRequest stand-in recording what the storage client sends. */
export class FakeXhr {
  static instances: FakeXhr[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  withCredentials = true;
  aborted = false;
  upload: { onprogress: ((e: Partial<ProgressEvent>) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly readyState = 1;

  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(body: unknown): void {
    this.body = body;
  }
  abort(): void {
    this.aborted = true;
  }
  /** Simulate progress then a response with the given status. */
  respond(status: number, total = 3): void {
    this.upload.onprogress?.({ loaded: 1, total, lengthComputable: true });
    this.status = status;
    this.onload?.();
  }
}

export function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    org_id: 'org-1',
    entity_type: 'deviation',
    entity_id: 'dev-1',
    filename: 'evidence.pdf',
    content_type: 'application/pdf',
    size_bytes: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    status: 'available',
    uploaded_by: 'u-1',
    uploaded_by_name: 'Ada',
    created_at: '2026-10-01T10:00:00Z',
    completed_at: '2026-10-01T10:00:05Z',
    ...overrides,
  };
}

/**
 * Waits for a request that is issued asynchronously (e.g. after the browser
 * finishes hashing the file with Web Crypto), then returns it.
 */
export async function nextRequest(
  http: HttpTestingController,
  match: string | ((req: HttpRequest<unknown>) => boolean),
  timeoutMs = 2000,
): Promise<TestRequest> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [req] = http.match(match);
    if (req) {
      return req;
    }
    if (Date.now() > deadline) {
      throw new Error(`No request matched ${typeof match === 'string' ? match : 'predicate'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

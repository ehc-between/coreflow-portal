/**
 * Pure helpers for the attachment upload flow: hashing, client-side pre-checks,
 * content-type fallback, size formatting and HTTP-status → i18n-key mapping.
 */

/**
 * Upper bound mirrored from the backend default (`ATTACHMENTS_MAX_SIZE_BYTES`,
 * 25 MiB). Used only as a fast pre-check so users don't hash/upload a file the
 * server will refuse anyway; the server remains the authority (413).
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Extensions the backend refuses regardless of MIME type (executables, scripts
 * and browser-active formats). Mirrors `BLOCKED_EXTENSIONS` in coreflow-core.
 */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  'app',
  'bat',
  'cmd',
  'com',
  'cpl',
  'dll',
  'exe',
  'hta',
  'htm',
  'html',
  'jar',
  'js',
  'jse',
  'mjs',
  'msi',
  'msp',
  'ps1',
  'psm1',
  'scr',
  'sh',
  'svg',
  'svgz',
  'vb',
  'vbe',
  'vbs',
  'wsf',
  'xht',
  'xhtml',
  'xml',
]);

/**
 * Fallback MIME types by extension, for files the browser reports with an empty
 * `type` (common for .heic, .eml, .odt and Office files on some platforms).
 */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
  eml: 'message/rfc822',
};

/**
 * Non-standard ZIP MIME types some browsers/platforms report (e.g. Windows
 * reports `application/x-zip-compressed`), normalised to the canonical type the
 * backend allow-list expects.
 */
const MIME_ALIASES: Readonly<Record<string, string>> = {
  'application/x-zip-compressed': 'application/zip',
  'application/x-zip': 'application/zip',
};

/**
 * Lower-cased extension without the dot ('' when none). Trailing dots and spaces
 * are stripped first, as the backend does (Windows ignores them, so `evil.exe. `
 * is still an `.exe`).
 */
export function fileExtension(filename: string): string {
  const name = filename.replace(/[. ]+$/, '');
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The browser-reported MIME type (aliases normalised), else a guess from the extension. */
export function contentTypeFor(file: { readonly name: string; readonly type: string }): string {
  const reported = file.type.toLowerCase();
  if (reported) {
    return MIME_ALIASES[reported] ?? file.type;
  }
  return MIME_BY_EXTENSION[fileExtension(file.name)] || 'application/octet-stream';
}

/** Lower-case hex encoding of raw bytes. */
export function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hex SHA-256 of a Blob/File, computed in the browser via Web Crypto. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return bytesToHex(digest);
}

/**
 * Client-side pre-check for what's knowable before contacting the server.
 * Returns an i18n key for the problem, or null when the file looks acceptable.
 */
export function preCheckFile(file: {
  readonly name: string;
  readonly size: number;
}): string | null {
  if (file.size <= 0) {
    return 'attachments.errors.empty';
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return 'attachments.errors.tooLarge';
  }
  if (BLOCKED_EXTENSIONS.has(fileExtension(file.name))) {
    return 'attachments.errors.typeNotAllowed';
  }
  return null;
}

/** Which step of the upload handshake failed. */
export type UploadPhase = 'hash' | 'create' | 'upload' | 'complete';

/**
 * Maps a failed step + HTTP status to a neutral, translated message key.
 * 503 is not mapped here — callers treat it as "not set up on this server".
 */
export function uploadErrorKey(phase: UploadPhase, status: number): string {
  if (phase === 'hash') {
    return 'attachments.errors.readFailed';
  }
  if (phase === 'upload') {
    // Direct-to-storage failures (network, expired URL, checksum rejected).
    return 'attachments.errors.uploadFailed';
  }
  switch (status) {
    case 413:
      return 'attachments.errors.tooLarge';
    case 415:
      return 'attachments.errors.typeNotAllowed';
    case 409:
      return 'attachments.errors.notUploaded';
    case 422:
      return phase === 'complete'
        ? 'attachments.errors.verifyFailed'
        : 'attachments.errors.invalid';
    case 403:
      return 'attachments.errors.forbidden';
    case 404:
      return 'attachments.errors.notFound';
    case 0:
      return 'errors.network';
    default:
      return 'attachments.errors.generic';
  }
}

/** Human-readable byte size (B / KB / MB / GB, one decimal above KB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

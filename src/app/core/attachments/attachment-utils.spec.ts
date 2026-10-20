import {
  MAX_ATTACHMENT_BYTES,
  bytesToHex,
  contentTypeFor,
  formatBytes,
  preCheckFile,
  sha256Hex,
  uploadErrorKey,
} from './attachment-utils';

describe('attachment utils', () => {
  describe('sha256Hex', () => {
    it('hashes "abc" to the known SHA-256 hex digest', async () => {
      const hex = await sha256Hex(new Blob(['abc']));
      expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('hashes an empty blob', async () => {
      expect(await sha256Hex(new Blob([]))).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    it('returns 64 lower-case hex chars', async () => {
      expect(await sha256Hex(new Blob(['CoreFlow evidence']))).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it('bytesToHex zero-pads each byte', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]).buffer)).toBe('00010f10ff');
  });

  it('contentTypeFor prefers the browser type, then the extension, then octet-stream', () => {
    expect(contentTypeFor({ name: 'a.pdf', type: 'application/pdf' })).toBe('application/pdf');
    expect(contentTypeFor({ name: 'photo.HEIC', type: '' })).toBe('image/heic');
    expect(contentTypeFor({ name: 'mail.eml', type: '' })).toBe('message/rfc822');
    expect(contentTypeFor({ name: 'blob', type: '' })).toBe('application/octet-stream');
  });

  it('contentTypeFor normalises non-standard ZIP types to application/zip', () => {
    expect(contentTypeFor({ name: 'a.zip', type: 'application/x-zip-compressed' })).toBe(
      'application/zip',
    );
    expect(contentTypeFor({ name: 'a.zip', type: 'application/x-zip' })).toBe('application/zip');
  });

  it('preCheckFile rejects empty, oversized and blocked files', () => {
    expect(preCheckFile({ name: 'a.pdf', size: 0 })).toBe('attachments.errors.empty');
    expect(preCheckFile({ name: 'a.pdf', size: MAX_ATTACHMENT_BYTES + 1 })).toBe(
      'attachments.errors.tooLarge',
    );
    expect(preCheckFile({ name: 'setup.EXE', size: 10 })).toBe('attachments.errors.typeNotAllowed');
    expect(preCheckFile({ name: 'diagram.svg', size: 10 })).toBe(
      'attachments.errors.typeNotAllowed',
    );
    expect(preCheckFile({ name: 'report.pdf', size: 10 })).toBeNull();
  });

  it('preCheckFile strips trailing dots and spaces before the extension check', () => {
    expect(preCheckFile({ name: 'setup.exe.', size: 10 })).toBe(
      'attachments.errors.typeNotAllowed',
    );
    expect(preCheckFile({ name: 'setup.exe . ', size: 10 })).toBe(
      'attachments.errors.typeNotAllowed',
    );
    expect(preCheckFile({ name: 'report.pdf.', size: 10 })).toBeNull();
  });

  it('uploadErrorKey maps statuses to neutral keys per phase', () => {
    expect(uploadErrorKey('create', 413)).toBe('attachments.errors.tooLarge');
    expect(uploadErrorKey('create', 415)).toBe('attachments.errors.typeNotAllowed');
    expect(uploadErrorKey('create', 422)).toBe('attachments.errors.invalid');
    expect(uploadErrorKey('complete', 422)).toBe('attachments.errors.verifyFailed');
    expect(uploadErrorKey('complete', 409)).toBe('attachments.errors.notUploaded');
    expect(uploadErrorKey('create', 403)).toBe('attachments.errors.forbidden');
    expect(uploadErrorKey('create', 0)).toBe('errors.network');
    expect(uploadErrorKey('create', 500)).toBe('attachments.errors.generic');
    expect(uploadErrorKey('upload', 403)).toBe('attachments.errors.uploadFailed');
    expect(uploadErrorKey('hash', 0)).toBe('attachments.errors.readFailed');
  });

  it('uploadErrorKey prefers a known backend code over the status', () => {
    expect(uploadErrorKey('create', 409, 'deviation_closed')).toBe(
      'attachments.errors.deviationClosed',
    );
    expect(uploadErrorKey('complete', 409, 'deviation_closed')).toBe(
      'attachments.errors.deviationClosed',
    );
    expect(uploadErrorKey('create', 409, 'something_else')).toBe('attachments.errors.notUploaded');
  });

  it('formatBytes renders human-readable sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });
});

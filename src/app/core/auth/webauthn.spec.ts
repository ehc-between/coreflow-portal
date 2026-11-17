import {
  base64UrlToBytes,
  bytesToBase64Url,
  credentialToJson,
  isPasskeyCancelled,
  toCreationOptions,
  toRequestOptions,
} from './webauthn';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('webauthn helpers', () => {
  it('round-trips base64url without padding, including the url-safe characters', () => {
    const raw = bytes(0xfb, 0xff, 0xbf, 0x00, 0x01);
    const encoded = bytesToBase64Url(raw);
    expect(encoded).toBe('-_-_AAE');
    expect(encoded).not.toContain('=');
    expect([...base64UrlToBytes(encoded)]).toEqual([...raw]);
  });

  it('decodes the binary fields of request options and keeps the rest', () => {
    const options = toRequestOptions({
      challenge: bytesToBase64Url(bytes(1, 2, 3)),
      rpId: 'coreflow.example',
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: [
        { type: 'public-key', id: bytesToBase64Url(bytes(9)), transports: ['usb'] },
      ],
    });
    expect([...new Uint8Array(options.challenge as ArrayBuffer)]).toEqual([1, 2, 3]);
    expect(options.rpId).toBe('coreflow.example');
    expect(options.allowCredentials?.[0].transports).toEqual(['usb']);
    expect([...new Uint8Array(options.allowCredentials![0].id as ArrayBuffer)]).toEqual([9]);
  });

  it('decodes the user id, challenge and excluded credentials of creation options', () => {
    const options = toCreationOptions({
      rp: { id: 'coreflow.example', name: 'CoreFlow' },
      user: { id: bytesToBase64Url(bytes(7, 7)), name: 'ada@example.com', displayName: 'Ada' },
      challenge: bytesToBase64Url(bytes(4, 5)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      attestation: 'none',
      excludeCredentials: [{ type: 'public-key', id: bytesToBase64Url(bytes(8)) }],
    });
    expect([...new Uint8Array(options.user.id as ArrayBuffer)]).toEqual([7, 7]);
    expect([...new Uint8Array(options.challenge as ArrayBuffer)]).toEqual([4, 5]);
    expect(options.excludeCredentials).toHaveLength(1);
    expect(options.attestation).toBe('none');
  });

  it('serialises an assertion in the standard JSON shape', () => {
    const credential = {
      id: 'cred',
      rawId: bytes(1).buffer,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: bytes(2).buffer,
        authenticatorData: bytes(3).buffer,
        signature: bytes(4).buffer,
        userHandle: null,
      },
    } as unknown as PublicKeyCredential;
    expect(credentialToJson(credential)).toEqual({
      id: 'cred',
      rawId: 'AQ',
      type: 'public-key',
      response: {
        clientDataJSON: 'Ag',
        authenticatorData: 'Aw',
        signature: 'BA',
        userHandle: null,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    });
  });

  it('serialises a registration with its attestation and transports', () => {
    const credential = {
      id: 'cred',
      rawId: bytes(1).buffer,
      type: 'public-key',
      response: {
        clientDataJSON: bytes(2).buffer,
        attestationObject: bytes(5).buffer,
        getTransports: () => ['internal'],
      },
    } as unknown as PublicKeyCredential;
    const json = credentialToJson(credential);
    expect(json['response']).toEqual({
      clientDataJSON: 'Ag',
      attestationObject: 'BQ',
      transports: ['internal'],
    });
  });

  it('treats a dismissed browser prompt as a cancellation', () => {
    expect(isPasskeyCancelled(new DOMException('x', 'NotAllowedError'))).toBe(true);
    expect(isPasskeyCancelled(new DOMException('x', 'InvalidStateError'))).toBe(false);
    expect(isPasskeyCancelled(new Error('x'))).toBe(false);
  });
});

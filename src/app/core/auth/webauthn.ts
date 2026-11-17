import {
  CredentialDescriptorJson,
  PublicKeyCreationOptionsJson,
  PublicKeyRequestOptionsJson,
} from './mfa.models';

/**
 * Browser-side WebAuthn (passkey) helpers: convert the server's JSON options
 * (base64url strings) into the binary form `navigator.credentials` expects,
 * and serialise the resulting credential back to the standard JSON shape
 * (`PublicKeyCredential.toJSON()`), which is what coreflow-core verifies.
 * Done by hand rather than via `parse*OptionsFromJSON` / `toJSON`, which not
 * every supported browser ships yet.
 */

/** Whether this browser can create / use passkeys at all. */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials &&
    typeof navigator.credentials.create === 'function'
  );
}

/** base64url (no padding) → bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** bytes → base64url (no padding). */
export function bytesToBase64Url(value: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toDescriptor(descriptor: CredentialDescriptorJson): PublicKeyCredentialDescriptor {
  return {
    type: descriptor.type,
    id: base64UrlToBytes(descriptor.id),
    ...(descriptor.transports
      ? { transports: [...descriptor.transports] as AuthenticatorTransport[] }
      : {}),
  };
}

/** Server creation options JSON → `navigator.credentials.create({ publicKey })` input. */
export function toCreationOptions(
  json: PublicKeyCreationOptionsJson,
): PublicKeyCredentialCreationOptions {
  return {
    rp: { ...json.rp },
    user: {
      id: base64UrlToBytes(json.user.id),
      name: json.user.name,
      displayName: json.user.displayName,
    },
    challenge: base64UrlToBytes(json.challenge),
    pubKeyCredParams: json.pubKeyCredParams.map((param) => ({ ...param })),
    ...(json.timeout !== undefined ? { timeout: json.timeout } : {}),
    ...(json.attestation
      ? { attestation: json.attestation as AttestationConveyancePreference }
      : {}),
    ...(json.authenticatorSelection
      ? { authenticatorSelection: { ...json.authenticatorSelection } }
      : {}),
    excludeCredentials: (json.excludeCredentials ?? []).map(toDescriptor),
  };
}

/** Server request options JSON → `navigator.credentials.get({ publicKey })` input. */
export function toRequestOptions(
  json: PublicKeyRequestOptionsJson,
): PublicKeyCredentialRequestOptions {
  return {
    challenge: base64UrlToBytes(json.challenge),
    ...(json.rpId ? { rpId: json.rpId } : {}),
    ...(json.timeout !== undefined ? { timeout: json.timeout } : {}),
    ...(json.userVerification
      ? { userVerification: json.userVerification as UserVerificationRequirement }
      : {}),
    allowCredentials: (json.allowCredentials ?? []).map(toDescriptor),
  };
}

/** JSON form of a credential, as sent to the server. */
export type CredentialJson = Readonly<Record<string, unknown>>;

/** Serialise a newly created (registration) or asserted (sign-in) credential. */
export function credentialToJson(credential: PublicKeyCredential): CredentialJson {
  const response = credential.response;
  const json: Record<string, unknown> = {
    clientDataJSON: bytesToBase64Url(response.clientDataJSON),
  };
  if ('attestationObject' in response) {
    const attestation = response as AuthenticatorAttestationResponse;
    json['attestationObject'] = bytesToBase64Url(attestation.attestationObject);
    if (typeof attestation.getTransports === 'function') {
      json['transports'] = attestation.getTransports();
    }
  } else {
    const assertion = response as AuthenticatorAssertionResponse;
    json['authenticatorData'] = bytesToBase64Url(assertion.authenticatorData);
    json['signature'] = bytesToBase64Url(assertion.signature);
    json['userHandle'] = assertion.userHandle ? bytesToBase64Url(assertion.userHandle) : null;
  }
  return {
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    type: credential.type,
    response: json,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    authenticatorAttachment: credential.authenticatorAttachment ?? null,
  };
}

/** Run the browser passkey creation ceremony; resolves to the credential JSON. */
export async function createPasskey(
  options: PublicKeyCreationOptionsJson,
): Promise<CredentialJson> {
  const credential = await navigator.credentials.create({ publicKey: toCreationOptions(options) });
  if (!credential) {
    throw new DOMException('No credential created', 'NotAllowedError');
  }
  return credentialToJson(credential as PublicKeyCredential);
}

/** Run the browser passkey sign-in ceremony; resolves to the assertion JSON. */
export async function getPasskeyAssertion(
  options: PublicKeyRequestOptionsJson,
): Promise<CredentialJson> {
  const credential = await navigator.credentials.get({ publicKey: toRequestOptions(options) });
  if (!credential) {
    throw new DOMException('No credential returned', 'NotAllowedError');
  }
  return credentialToJson(credential as PublicKeyCredential);
}

/**
 * Whether a ceremony error means the user cancelled / timed out (show a calm
 * "cancelled" message) rather than something being wrong.
 */
export function isPasskeyCancelled(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}

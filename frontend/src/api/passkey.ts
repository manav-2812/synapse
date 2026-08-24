/**
 * Native Browser WebAuthn / Passkey API helpers.
 * Fully self-contained with zero external runtime dependencies.
 */
import { request, setTokens } from "./client";

export interface PasskeyItem {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

interface PasskeyOptionsPayload {
  challenge_id: string;
  options: any;
}

// ==================== Base64URL Helpers ====================

function bufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64URLToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ==================== Public Methods ====================

/**
 * Check if the current browser environment supports Passkeys / WebAuthn.
 */
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

/**
 * Trigger native browser registration ceremony (Windows Hello, Touch ID, Security Key)
 * and persist the passkey for the current logged-in user.
 */
export async function registerPasskey(name: string = "Device Passkey"): Promise<PasskeyItem> {
  if (!isPasskeySupported()) {
    throw new Error("WebAuthn / Passkeys are not supported on this browser or platform.");
  }

  // 1. Fetch challenge & options from backend
  const optData = await request<PasskeyOptionsPayload>("/auth/passkey/register/options", {
    method: "POST",
  });

  const opts = optData.options;

  // 2. Decode base64url strings into ArrayBuffers for navigator.credentials.create
  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    ...opts,
    challenge: base64URLToBuffer(opts.challenge),
    user: {
      ...opts.user,
      id: typeof opts.user.id === "string" ? new TextEncoder().encode(opts.user.id) : opts.user.id,
    },
    excludeCredentials: (opts.excludeCredentials || []).map((c: any) => ({
      ...c,
      id: base64URLToBuffer(c.id),
    })),
  };

  // 3. Prompt Windows Hello / Touch ID / Security Key
  const credential = (await navigator.credentials.create({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey creation was not completed.");
  }

  const response = credential.response as AuthenticatorAttestationResponse;

  // 4. Serialize credential for backend verification
  const credentialPayload = {
    id: credential.id,
    rawId: bufferToBase64URL(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64URL(response.clientDataJSON),
      attestationObject: bufferToBase64URL(response.attestationObject),
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    },
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
  };

  // 5. Send verified attestation to backend
  const passkey = await request<PasskeyItem>("/auth/passkey/register/verify", {
    method: "POST",
    body: {
      challenge_id: optData.challenge_id,
      credential: credentialPayload,
      name,
    },
  });

  return passkey;
}

/**
 * Trigger native browser authentication ceremony (Windows Hello, Touch ID)
 * and log into Synapse without typing email or password.
 */
export async function authenticateWithPasskey(): Promise<{ access_token: string; refresh_token: string }> {
  if (!isPasskeySupported()) {
    throw new Error("WebAuthn / Passkeys are not supported on this browser or platform.");
  }

  // 1. Fetch assertion challenge options
  const optData = await request<PasskeyOptionsPayload>("/auth/passkey/login/options", {
    method: "POST",
  });

  const opts = optData.options;

  // 2. Decode challenge into ArrayBuffer for navigator.credentials.get
  const publicKeyRequest: PublicKeyCredentialRequestOptions = {
    ...opts,
    challenge: base64URLToBuffer(opts.challenge),
    allowCredentials: (opts.allowCredentials || []).map((c: any) => ({
      ...c,
      id: base64URLToBuffer(c.id),
    })),
  };

  // 3. Prompt Windows Hello / Touch ID
  const credential = (await navigator.credentials.get({
    publicKey: publicKeyRequest,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey authentication was not completed.");
  }

  const response = credential.response as AuthenticatorAssertionResponse;

  // 4. Serialize assertion response
  const credentialPayload = {
    id: credential.id,
    rawId: bufferToBase64URL(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64URL(response.clientDataJSON),
      authenticatorData: bufferToBase64URL(response.authenticatorData),
      signature: bufferToBase64URL(response.signature),
      userHandle: response.userHandle ? bufferToBase64URL(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
  };

  // 5. Verify assertion with backend and receive tokens
  const tokens = await request<{ access_token: string; refresh_token: string }>(
    "/auth/passkey/login/verify",
    {
      method: "POST",
      body: {
        challenge_id: optData.challenge_id,
        credential: credentialPayload,
      },
    }
  );

  // Store tokens in local/session storage
  setTokens(tokens.access_token, tokens.refresh_token);

  return tokens;
}

/**
 * List all passkeys registered for the current user.
 */
export async function listUserPasskeys(): Promise<PasskeyItem[]> {
  return request<PasskeyItem[]>("/auth/passkey/list");
}

/**
 * Delete a passkey by ID.
 */
export async function deleteUserPasskey(passkeyId: string): Promise<void> {
  await request(`/auth/passkey/${passkeyId}`, {
    method: "DELETE",
  });
}

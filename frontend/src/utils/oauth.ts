/**
 * OAuth initiation helpers for Google and Microsoft Sign-In.
 *
 * Security notes:
 *  - Both flows generate a cryptographic `state` parameter to prevent CSRF
 *    login attacks.  The state is stored in sessionStorage and verified in the
 *    callback page before the authorization code is exchanged.
 *  - Client IDs MUST be provided via environment variables.  There are no
 *    hardcoded fallback values -- a missing variable throws at call-time so
 *    misconfiguration is caught immediately rather than silently using a stale ID.
 */

// ==================== PKCE Helper ====================

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  const verifier = Array.from(array, (dec) => ("0" + dec.toString(16)).slice(-2)).join("");

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);

  const bytes = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const challenge = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return { verifier, challenge };
}

// ==================== CSRF State Helper ====================

/**
 * Generate a cryptographically random state token, store it in sessionStorage,
 * and return it.  The callback page must call verifyOAuthState() before using
 * the authorization code.
 */
function generateAndStoreOAuthState(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  const state = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem("oauth_state", state);
  return state;
}

/**
 * Verify that the `state` value returned by the OAuth provider matches the one
 * we stored before the redirect.  Throws if there is a mismatch (CSRF attempt).
 *
 * Call this at the top of every OAuth callback handler.
 */
export function verifyOAuthState(returnedState: string | null): void {
  const stored = sessionStorage.getItem("oauth_state");
  sessionStorage.removeItem("oauth_state");
  if (!stored || !returnedState || stored !== returnedState) {
    throw new Error(
      "Security check failed: OAuth state mismatch. This may indicate a CSRF attempt. Please try signing in again."
    );
  }
}

// ==================== Google OAuth ====================

function getGoogleClientId(): string {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!id) {
    throw new Error(
      "VITE_GOOGLE_CLIENT_ID is not set. Add it to your .env file before using Google sign-in."
    );
  }
  return id;
}

export function getGoogleRedirectUri(): string {
  return (
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ||
    `${window.location.origin}/auth/callback/google`
  );
}

/**
 * Redirects user to Google OAuth 2.0 account selection and consent screen.
 * Includes a CSRF state parameter.
 */
export function startGoogleOAuth(): void {
  const state = generateAndStoreOAuthState();
  const redirectUri = getGoogleRedirectUri();
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ==================== Microsoft OAuth ====================

function getMicrosoftClientId(): string {
  const id = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;
  if (!id) {
    throw new Error(
      "VITE_MICROSOFT_CLIENT_ID is not set. Add it to your .env file before using Microsoft sign-in."
    );
  }
  return id;
}

export function getMicrosoftRedirectUri(): string {
  return (
    import.meta.env.VITE_MICROSOFT_REDIRECT_URI ||
    `${window.location.origin}/auth/callback/microsoft`
  );
}

/**
 * Redirects user to Microsoft Entra ID / Microsoft Account login and consent
 * screen with PKCE and CSRF state.
 */
export async function startMicrosoftOAuth(): Promise<void> {
  const state = generateAndStoreOAuthState();
  const redirectUri = getMicrosoftRedirectUri();
  const { verifier, challenge } = await generatePKCE();
  sessionStorage.setItem("ms_code_verifier", verifier);

  const params = new URLSearchParams({
    client_id: getMicrosoftClientId(),
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email User.Read",
    prompt: "select_account",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

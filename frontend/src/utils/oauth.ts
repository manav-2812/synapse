/**
 * OAuth initiation helpers for Google and Microsoft Sign-In.
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

// ==================== Google OAuth ====================

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "308575147270-89ghup1gmsl3l79ps7gme821ck5r3k6v.apps.googleusercontent.com";

export function getGoogleRedirectUri(): string {
  return (
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ||
    `${window.location.origin}/auth/callback/google`
  );
}

/**
 * Redirects user to Google OAuth 2.0 account selection and consent screen.
 */
export function startGoogleOAuth(): void {
  const redirectUri = getGoogleRedirectUri();
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ==================== Microsoft OAuth ====================

const MICROSOFT_CLIENT_ID =
  import.meta.env.VITE_MICROSOFT_CLIENT_ID ||
  "c21cefcf-ac5e-48ff-b7b3-a355d2cf2be7";

export function getMicrosoftRedirectUri(): string {
  return (
    import.meta.env.VITE_MICROSOFT_REDIRECT_URI ||
    `${window.location.origin}/auth/callback/microsoft`
  );
}

/**
 * Redirects user to Microsoft Entra ID / Microsoft Account login and consent screen with PKCE.
 */
export async function startMicrosoftOAuth(): Promise<void> {
  const redirectUri = getMicrosoftRedirectUri();
  const { verifier, challenge } = await generatePKCE();
  sessionStorage.setItem("ms_code_verifier", verifier);

  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email User.Read",
    prompt: "select_account",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

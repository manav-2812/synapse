import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { authApi } from "../../api/auth";
import { setPersistence, getToken } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { getMicrosoftRedirectUri, startMicrosoftOAuth, verifyOAuthState } from "../../utils/oauth";
import { Icon } from "../../components/ui/Icon";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { Button } from "../../components/ui/Button";

export default function MicrosoftCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const executedRef = useRef(false);

  useEffect(() => {
    // Prevent double execution in React StrictMode / re-renders
    if (executedRef.current) return;
    executedRef.current = true;

    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    if (errorParam) {
      setError(
        errorDesc || `Microsoft sign-in was cancelled or denied (${errorParam}).`
      );
      return;
    }

    if (!code) {
      if (getToken()) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setError("No authorization code received from Microsoft.");
      return;
    }

    // Verify CSRF state before exchanging authorization code
    const returnedState = searchParams.get("state");
    try {
      verifyOAuthState(returnedState);
    } catch (err: any) {
      setError(err?.message || "Security check failed. Please try signing in again.");
      return;
    }

    async function handleExchange() {
      try {
        setPersistence(true);
        const redirectUri = getMicrosoftRedirectUri();
        const codeVerifier = sessionStorage.getItem("ms_code_verifier") || undefined;
        await authApi.loginWithMicrosoft({
          code: code!,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        });

        sessionStorage.removeItem("ms_code_verifier");
        await refreshUser();
        navigate("/dashboard", { replace: true });
      } catch (err: any) {
        setError(
          err?.message || "Microsoft authentication failed. Please try again."
        );
      }
    }

    void handleExchange();
  }, [searchParams, navigate, refreshUser]);

  return (
    <div className="notion-page">
      <div className="notion-content-wrap" style={{ textAlign: "center" }}>
        <div className="notion-brand-header" style={{ justifyContent: "center" }}>
          <div className="notion-brand-icon">
            <BrandLogo size={26} />
          </div>
          <span className="notion-brand-name">SYNAPSE</span>
        </div>

        {error ? (
          <div style={{ marginTop: 20 }}>
            <div
              className="notion-error-banner"
              style={{ justifyContent: "center", marginBottom: 20 }}
            >
              <Icon name="close" size={14} />
              <span>{error}</span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Button onClick={() => startMicrosoftOAuth()}>
                <span>Sign in with Microsoft</span>
              </Button>
              <Link
                to="/login"
                className="notion-link-bold"
                style={{ fontSize: 13 }}
              >
                ← Return to login
              </Link>
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 32,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: "3px solid var(--surface-3)",
                borderTopColor: "#00a4ef",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p
              style={{
                fontSize: 15,
                color: "var(--text-faint)",
                margin: 0,
              }}
            >
              Authenticating with Microsoft...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

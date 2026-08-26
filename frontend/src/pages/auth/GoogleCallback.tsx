import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { authApi } from "../../api/auth";
import { setPersistence, getToken } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { getGoogleRedirectUri, startGoogleOAuth } from "../../utils/oauth";
import { Icon } from "../../components/ui/Icon";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { Button } from "../../components/ui/Button";

export default function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const executedRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(`Google sign-in was cancelled or denied (${errorParam}).`);
      return;
    }

    if (!code) {
      if (getToken()) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setError("No authorization code received from Google.");
      return;
    }

    // Prevent double execution in React StrictMode
    if (executedRef.current) return;
    executedRef.current = true;

    async function handleExchange() {
      try {
        setPersistence(true);
        const redirectUri = getGoogleRedirectUri();
        await authApi.loginWithGoogle({
          code: code!,
          redirect_uri: redirectUri,
        });

        await refreshUser();
        navigate("/dashboard", { replace: true });
      } catch (err: any) {
        setError(err?.message || "Google authentication failed. Please try again.");
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
            <div className="notion-error-banner" style={{ justifyContent: "center", marginBottom: 20 }}>
              <Icon name="close" size={14} />
              <span>{error}</span>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
              <Button onClick={() => startGoogleOAuth()}>
                <span>Sign in with Google</span>
              </Button>
              <Link to="/login" className="notion-link-bold" style={{ fontSize: 13 }}>
                ← Return to login
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: "3px solid var(--surface-3)",
                borderTopColor: "#2383e2",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p style={{ fontSize: 15, color: "var(--text-faint)", margin: 0 }}>
              Authenticating with Google...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
